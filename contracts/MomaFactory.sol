pragma solidity ^0.5.16;

import "./MomaMaster.sol";
import "./MomaPool.sol";
import "./MomaFactoryInterface.sol";
import "./MomaFactoryProxy.sol";


contract MomaFactory is MomaFactoryInterface, MomaFactoryStorage {

    function createPool() external returns (address pool) {
        bytes memory bytecode = type(MomaPool).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IMomaPool(pool).initialize(msg.sender);
        PoolInfo storage info = pools[pool];
        info.creator = msg.sender;
        info.poolFeeAdmin = feeAdmin;
        info.poolFeeReceiver = defualtFeeReceiver;
        info.feeFactor = defualtFeeFactorMantissa;
        allPools.push(pool);
        emit PoolCreated(pool, msg.sender, allPools.length);
    }

    /*** view Functions ***/
    function allPoolsLength() external view returns (uint) {
        return allPools.length;
    }

    function getMomaFeeAdmin(address pool) external view returns (address) {
        return pools[pool].poolFeeAdmin;
    }

    function getMomaFeeReceiver(address pool) external view returns (address payable) {
        return pools[pool].poolFeeReceiver;
    }

    function getMomaFeeFactorMantissa(address pool, address underlying) external view returns (uint) {
        if (pools[pool].noFee) {
            return 0;
        } else if (tokenFeeFactors[underlying] != 0) {
            return tokenFeeFactors[underlying];
        } else {
            return pools[pool].feeFactor;
        }
    }

    function getMomaMarketSpeed(address pool, address market) external view returns (uint) {
        return pools[pool].momaSpeeds[market];
    }

    function getMomaMarketLastBlocks(address pool, address market) external view returns (uint) {
        return pools[pool].lastBlocks[market];
    }

    function getMomaMarketClaimable(address pool, address market) external view returns (uint) {
        return pools[pool].momaClaimable[market];
    }

    function getMomaMarketClaimed(address pool, address market) external view returns (uint) {
        return pools[pool].momaClaimed[market];
    }

    function getIsMomaMarket(address pool, address market) external view returns (bool) {
        return pools[pool].isMomaMarket[market];
    }

    /*** admin Functions ***/
    function _become(MomaFactoryProxy proxy) public {
        require(msg.sender == proxy.admin(), "only momaFactory admin can change brains");
        require(proxy._acceptImplementation() == 0, "change not authorized");
    }

    function _setFarmingDelegate(FarmingDelegate _delegate) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        address oldDelegate = address(farmingDelegate);
        farmingDelegate = _delegate;
        emit NewFarmingDelegate(oldDelegate, address(_delegate));
    }

    /*** feeAdmin Functions ***/
    function setFeeAdmin(address _newFeeAdmin) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        address oldFeeAdmin = feeAdmin;
        feeAdmin = _newFeeAdmin;
        emit NewFeeAdmin(oldFeeAdmin, _newFeeAdmin);
    }

    function setDefualtFeeReceiver(address payable _newFeeReceiver) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        address oldFeeReceiver = defualtFeeReceiver;
        defualtFeeReceiver = _newFeeReceiver;
        emit NewDefualtFeeReceiver(oldFeeReceiver, _newFeeReceiver);
    }

    function setDefualtFeeFactor(uint _newFeeFactor) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldFeeFactor = defualtFeeFactorMantissa;
        defualtFeeFactorMantissa = _newFeeFactor;
        emit NewDefualtFeeFactor(oldFeeFactor, _newFeeFactor);
    }

    function setTokenFeeFactor(address token, uint _newFeeFactor) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldFeeFactor = tokenFeeFactors[token];
        tokenFeeFactors[token] = _newFeeFactor;
        emit NewTokenFeeFactor(token, oldFeeFactor, _newFeeFactor);
    }

    /*** poolFeeAdmin Functions ***/
    function setPoolFeeAdmin(address pool, address _newPoolFeeAdmin) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        address oldPoolFeeAdmin = info.poolFeeAdmin;
        info.poolFeeAdmin = _newPoolFeeAdmin;
        emit NewPoolFeeAdmin(pool, oldPoolFeeAdmin, _newPoolFeeAdmin);
    }

    function setPoolFeeReceiver(address pool, address payable _newPoolFeeReceiver) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        address oldPoolFeeReceiver = info.poolFeeReceiver;
        info.poolFeeReceiver = _newPoolFeeReceiver;
        emit NewPoolFeeReceiver(pool, oldPoolFeeReceiver, _newPoolFeeReceiver);
    }

    function setPoolFeeFactor(address pool, uint _newFeeFactor) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldPoolFeeFactor = info.feeFactor;
        info.feeFactor = _newFeeFactor;
        emit NewPoolFeeFactor(pool, oldPoolFeeFactor, _newFeeFactor);
    }

    function setPoolFeeStatus(address pool, bool _noFee) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        bool oldPoolFeeStatus = info.noFee;
        info.noFee = _noFee;
        emit NewPoolFeeStatus(pool, oldPoolFeeStatus, _noFee);
    }


    /*** MOMA farming ***/

    /**
     * @notice Accrue MOMA to the market by updating the momaClaimable
     * @dev Note: lastBlocks should less than endBlock
     * @param pool The moma pool to update
     * @param mToken The moma market to update
     */
    function updateMomaMarketStatus(address pool, MToken mToken) internal {
        uint blockNumber = getBlockNumber();
        PoolInfo storage info = pools[pool];
        if (info.startBlock > 0) {
            uint lastBlock = info.lastBlocks[address(mToken)];
            if (lastBlock < info.startBlock) lastBlock = info.startBlock;
            if (blockNumber > lastBlock && lastBlock < info.endBlock) {
                uint nextBlock = blockNumber;
                if (nextBlock > info.endBlock) nextBlock = info.endBlock;
                uint speed = info.momaSpeeds[address(mToken)];
                if (speed > 0) { // lastBlock < nextBlock <= endBlock
                    uint deltaBlocks = nextBlock.sub(lastBlock);
                    uint momaAccrued = deltaBlocks.mul(speed);
                    uint lastMomaClaimable = info.momaClaimable[address(mToken)];
                    uint newMomaClaimable = lastMomaClaimable.add(momaAccrued);

                    info.momaClaimable[address(mToken)] = newMomaClaimable;
                    emit DistributedMarketMoma(pool, address(mToken), newMomaClaimable, momaAccrued, nextBlock);
                }
                info.lastBlocks[address(mToken)] = nextBlock;
            }
        }
    }

    /**
     * @notice Transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, factory do not perform the transfer
     * @param user The address of the user to transfer MOMA to
     * @param amount The amount of token to (possibly) transfer
     * @return The amount of token which was NOT transferred to the user
     */
    function grantMomaInternal(address user, uint amount) internal returns (uint) {
        uint remaining = moma.balanceOf(address(this));
        if (amount > 0 && amount <= remaining) {
            moma.transfer(user, amount);
            return 0;
        }
        return amount;
    }

    /**
     * @notice Pool called to transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, factory do not perform the transfer
     * @param mToken The market to claim MOMA in
     * @param user The address of the user to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     * @return The amount of MOMA which was NOT transferred to the user
     */
    function claim(address mToken, address user, uint amount) external returns (uint) {
        // pool must be msg.sender
        PoolInfo storage info = pools[msg.sender];
        // only pool can claim for user
        require(info.creator != address(0), 'MomaFactory: can only claim through pool');
        require(info.isMomaMarket[mToken], "MomaFactory: not MOMA market"); // maybe unnecessary

        updateMomaMarketStatus(msg.sender, MToken(mToken));

        uint claimable = info.momaClaimable[mToken];
        uint claimed = info.momaClaimed[mToken];
        uint newClaimed = claimed.add(amount);
        if (newClaimed > claimable) return amount;

        uint notTransfered = grantMomaInternal(user, amount);
        info.momaClaimed[mToken] = newClaimed.sub(notTransfered);
        return notTransfered;
    }

    /*** MOMA Distribution Admin ***/

    /**
     * @notice Transfer MOMA to the recipient
     * @dev Note: If there is not enough MOMA, we do not perform the transfer
     * @param recipient The address of the recipient to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     */
    function _grantToken(address recipient, uint amount) public {
        require(msg.sender == admin, 'MomaFactory: only admin can grant token');
        uint notTransfered = grantMomaInternal(recipient, amount);
        require(notTransfered == 0, 'MomaFactory: insufficient MOMA for grant');
        emit MomaGranted(recipient, amount);
    }

    /**
     * @notice Set the MOMA token, can only call once
     * @param _moma The MOMA token address
     */
    function setMomaToken(Moma _moma) external {
        require(msg.sender == admin && address(moma) == address(0), 'MomaFactory: admin check');
        moma = _moma;
    }

    /**
     * @notice Set a MOMA pool, will call pool to set farm block
     * @dev Note: can call multi-times: first set, short endBlock and start next farm
     * @param pool The address of the pool, must be created first
     * @param _startBlock The start block number of MOMA farming, should > 0
     * @param _endBlock The end block number of MOMA farming, should > _startBlock
     * @param reset Weather reset MOMA farm state, afther reset user will lose undistributed MOMA, should after last endBlock
     */
    function setMomaPool(address pool, uint _startBlock, uint _endBlock, bool reset) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        require(_endBlock > _startBlock, 'MomaFactory: endBlock less than startBlock');
        // require(address(moma) != address(0), 'MomaFactory: MOMA token not setted');
        PoolInfo storage info = pools[pool];
        require(info.creator != address(0), 'MomaFactory: pool not created');
        // must be lending pool?

        uint err = MomaMaster(pool)._setMomaFarming(_startBlock, _endBlock, reset);
        require(err == 0, 'MomaFactory: setMomaPool failed');

        uint oldStartBlock = info.startBlock;
        uint oldEndBlock = info.endBlock;
        info.startBlock = _startBlock;
        info.endBlock = _endBlock;
        emit MomaPoolUpdated(pool, oldStartBlock, oldEndBlock, _startBlock, _endBlock, reset);
    }

    /**
     * @notice Set a MOMA market's speed, will also call pool to set farm speed
     * @dev Note: can call at any time, this will also update moma market status
     * @param pool The address of the pool, must be created first
     * @param mToken The pool market to set speed
     * @param momaSpeed The new speed, 0 means no new MOMA farm
     */
    function setMomaSpeed(address pool, MToken mToken, uint momaSpeed) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        require(address(moma) != address(0), 'MomaFactory: MOMA token not setted');
        PoolInfo storage info = pools[pool];
        require(info.creator != address(0), 'MomaFactory: pool not created');
        require(info.startBlock > 0, 'MomaFactory: not moma pool');
        // must be lending pool?

        uint err = MomaMaster(pool)._setMomaSpeed(mToken, momaSpeed);
        require(err == 0, 'MomaFactory: setMomaSpeed failed');
        
        updateMomaMarketStatus(pool, mToken);
        info.momaSpeeds[address(mToken)] = momaSpeed;
        emit MomaMarketSpeedUpdated(pool, address(mToken), momaSpeed);

        if (info.isMomaMarket[address(mToken)] == false) {
            info.allMarkets.push(mToken);
            info.isMomaMarket[address(mToken)] == true;
        }
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}


interface IMomaPool {
    function initialize(address admin_) external;
}
