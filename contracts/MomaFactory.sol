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

    function isMomaPool(address pool) external view returns (bool) {
        return pools[pool].creator != address(0);
    }

    function isLendingPool(address pool) external view returns (bool) {
        return pools[pool].isLending;
    }


    /*** pool Functions ***/
    function upgradeLendingPool() external returns (bool) {
        // pool must be msg.sender, only pool can call this function
        PoolInfo storage info = pools[msg.sender];
        require(info.creator != address(0), 'MomaFactory: pool not created');
        require(info.isLending == false, 'MomaFactory: can only upgrade once');
        require(info.allowUpgrade == true || allowUpgrade == true, 'MomaFactory: upgrade not allowed');

        IMomaFarming(momaFarming).upgradeLendingPool(msg.sender);
        info.isLending = true;
        lendingPoolNum += 1;
        emit NewLendingPool(msg.sender);

        return true;
    }

    /*** admin Functions ***/
    function _become(MomaFactoryProxy proxy) public {
        require(msg.sender == proxy.admin(), "only momaFactory admin can change brains");
        require(proxy._acceptImplementation() == 0, "change not authorized");
    }

    function _setMomaFarming(address newMomaFarming) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        address oldMomaFarming = momaFarming;
        momaFarming = newMomaFarming;
        emit NewMomaFarming(oldMomaFarming, newMomaFarming);
    }

    function _setFarmingDelegate(address newDelegate) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        address oldDelegate = farmingDelegate;
        farmingDelegate = newDelegate;
        emit NewFarmingDelegate(oldDelegate, newDelegate);
    }

    function _setAllowUpgrade(bool allow) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        allowUpgrade = allow;
    }

    function _allowUpgradePool(address pool) external {
        require(msg.sender == admin, 'MomaFactory: admin check');
        PoolInfo storage info = pools[pool];
        require(info.creator != address(0), 'MomaFactory: pool not created');
        info.allowUpgrade = true;
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


    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}


interface IMomaPool {
    function initialize(address admin_) external;
}
