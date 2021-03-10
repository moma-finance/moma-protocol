pragma solidity ^0.5.16;

import "./MToken.sol";
import "./MomaPool.sol"; // unused currently
import "./Governance/Moma.sol";
import "./MomaFactoryInterface.sol";


contract MomaFarming is ExponentialNoError {

    address public admin;
    Moma public moma;
    MomaFactoryInterface public factory;

    /// @notice The initial moma index for a market
    uint public constant momaInitialIndex = 1e36;

    uint public momaSpeed;
    uint public momaTotalWeight;


    struct MarketState {
        /// @notice Whether is MOMA market, used to avoid add to momaMarkets again
        bool isMomaMarket;

        /// @notice The market's MOMA weight, times of 1
        uint weight;

        /// @notice The market's block number that the supplyIndex was last updated at
        uint supplyBlock;

        /// @notice The market's block number that the borrowIndex was last updated at
        uint borrowBlock;

        /// @notice The market's last updated supplyIndex
        uint supplyIndex;

        /// @notice The market's last updated borrowIndex
        uint borrowIndex;

        /// @notice The market's MOMA supply index of each supplier as of the last time they accrued MOMA
        mapping(address => uint) supplierIndex;

        /// @notice The market's MOMA borrow index of each borrower as of the last time they accrued MOMA
        mapping(address => uint) borrowerIndex;
    }

    /// @notice Each MOMA pool's each momaMarket's MarketState
    mapping(address => mapping(address => MarketState)) public marketStates;

    /// @notice Each MOMA pool's momaMarkets list
    mapping(address => MToken[]) public momaMarkets;

    /// @notice Whether is MOMA lending pool
    mapping(address => bool) public isMomaLendingPool;

    /// @notice Whether is MOMA pool, used to avoid add to momaPools again
    mapping(address => bool) public isMomaPool;

    /// @notice A list of all MOMA pools
    MomaPool[] public momaPools;

    /// @notice The MOMA accrued but not yet transferred to each user
    mapping(address => uint) public momaAccrued;


    /// @notice Emitted when MOMA is distributed to a supplier
    event DistributedSupplier(address indexed pool, MToken indexed mToken, address indexed supplier, uint momaDelta, uint marketSupplyIndex);

    /// @notice Emitted when MOMA is distributed to a borrower
    event DistributedBorrower(address indexed pool, MToken indexed mToken, address indexed borrower, uint momaDelta, uint marketBorrowIndex);

    /// @notice Emitted when MOMA is claimed by user
    event MomaClaimed(address user, uint accrued, uint claimed, uint notClaimed);

    /// @notice Emitted when admin is changed by admin
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when factory is changed by admin
    event NewFactory(MomaFactoryInterface oldFactory, MomaFactoryInterface newFactory);

    /// @notice Emitted when momaSpeed is changed by admin
    event NewMomaSpeed(uint oldMomaSpeed, uint newMomaSpeed);

    /// @notice Emitted when a new MOMA weight is changed by admin
    event NewMarketWeight(address indexed pool, MToken indexed mToken, uint oldWeight, uint newWeight);

    /// @notice Emitted when a new MOMA total weight is updated
    event NewTotalWeight(uint oldTotalWeight, uint newTotalWeight);

    /// @notice Emitted when a new MOMA market is added to momaMarkets
    event NewMomaMarket(address indexed pool, MToken indexed mToken);

    /// @notice Emitted when a new MOMA pool is added to momaPools
    event NewMomaPool(address indexed pool);

    /// @notice Emitted when MOMA is granted by admin
    event MomaGranted(address recipient, uint amount);


    constructor (Moma _moma, MomaFactoryInterface _factory) public {
        admin = msg.sender;
        moma = _moma;
        factory = _factory;
    }


    /*** Internal Functions ***/

    /**
     * @notice Calculate the new MOMA supply index and block of this market
     * @dev Non-moma market will return (0, blockNumber). To avoid revert: momaTotalWeight > 0
     * @param pool The pool whose supply index to calculate
     * @param mToken The market whose supply index to calculate
     * @return (new index, new block)
     */
    function newMarketSupplyStateInternal(address pool, MToken mToken) internal view returns (uint, uint) {
        MarketState storage state = marketStates[pool][address(mToken)];
        uint _index = state.supplyIndex;
        uint _block = state.supplyBlock;
        uint blockNumber = getBlockNumber();

        // Non-moma market's weight is always 0, will only update block
        if (blockNumber > _block) {
            uint speed = div_(mul_(momaSpeed, state.weight), momaTotalWeight);
            uint deltaBlocks = sub_(blockNumber, _block);
            uint _momaAccrued = mul_(deltaBlocks, speed);
            uint supplyTokens = mToken.totalSupply();
            Double memory ratio = supplyTokens > 0 ? fraction(_momaAccrued, supplyTokens) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: _index}), ratio);
            _index = index.mantissa;
            _block = blockNumber;
        }
        return (_index, _block);
    }

    /**
     * @notice Accrue MOMA to the market by updating the supply state
     * @dev To avoid revert: no over/underflow
     * @param pool The pool whose supply state to update
     * @param mToken The market whose supply state to update
     */
    function updateMarketSupplyStateInternal(address pool, MToken mToken) internal {
        MarketState storage state = marketStates[pool][address(mToken)];
        // Non-moma market's weight will always be 0, 0 weight moma market will also update nothing
        if (state.weight > 0) { // momaTotalWeight > 0
            (uint _index, uint _block) = newMarketSupplyStateInternal(pool, mToken);
            state.supplyIndex = _index;
            state.supplyBlock = _block;
        }
    }

     /**
     * @notice Calculate the new MOMA borrow index and block of this market
     * @dev Non-moma market will return (0, blockNumber). To avoid revert: momaTotalWeight > 0, marketBorrowIndex > 0
     * @param pool The pool whose borrow index to calculate
     * @param mToken The market whose borrow index to calculate
     * @param marketBorrowIndex The market borrow index
     * @return (new index, new block)
     */
    function newMarketBorrowStateInternal(address pool, MToken mToken, uint marketBorrowIndex) internal view returns (uint, uint) {
        MarketState storage state = marketStates[pool][address(mToken)];
        uint _index = state.borrowIndex;
        uint _block = state.borrowBlock;
        uint blockNumber = getBlockNumber();

        // Non-moma market's weight is always 0, will only update block
        if (blockNumber > _block) {
            uint speed = div_(mul_(momaSpeed, state.weight), momaTotalWeight);
            uint deltaBlocks = sub_(blockNumber, _block);
            uint _momaAccrued = mul_(deltaBlocks, speed);
            uint borrowAmount = div_(mToken.totalBorrows(), Exp({mantissa: marketBorrowIndex}));
            Double memory ratio = borrowAmount > 0 ? fraction(_momaAccrued, borrowAmount) : Double({mantissa: 0});
            Double memory index = add_(Double({mantissa: _index}), ratio);
            _index = index.mantissa;
            _block = blockNumber;
        }
        return (_index, _block);
    }

    /**
     * @notice Accrue MOMA to the market by updating the borrow state
     * @dev To avoid revert: no over/underflow
     * @param pool The pool whose borrow state to update
     * @param mToken The market whose borrow state to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMarketBorrowStateInternal(address pool, MToken mToken, uint marketBorrowIndex) internal {
        if (isMomaLendingPool[pool] == true) {
            MarketState storage state = marketStates[pool][address(mToken)];
            // Non-moma market's weight will always be 0, 0 weight moma market will also update nothing
            if (state.weight > 0 && marketBorrowIndex > 0) { // momaTotalWeight > 0
                (uint _index, uint _block) = newMarketBorrowStateInternal(pool, mToken, marketBorrowIndex);
                state.borrowIndex = _index;
                state.borrowBlock = _block;
            }
        }
    }

     /**
     * @notice Calculate MOMA accrued by a supplier
     * @dev To avoid revert: no over/underflow
     * @param pool The pool in which the supplier is interacting
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     * @param supplyIndex The MOMA supply index of this market in Double type
     * @return (new supplierAccrued, new supplierDelta)
     */
    function newSupplierMomaInternal(address pool, MToken mToken, address supplier, Double memory supplyIndex) internal view returns (uint, uint) {
        Double memory supplierIndex = Double({mantissa: marketStates[pool][address(mToken)].supplierIndex[supplier]});
        uint _supplierAccrued = momaAccrued[supplier];
        uint _supplierDelta = 0;

        // supply before set moma market can still get rewards start from set block
        if (supplierIndex.mantissa == 0 && supplyIndex.mantissa > 0) {
            supplierIndex.mantissa = momaInitialIndex;
        }

        Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
        uint supplierTokens = mToken.balanceOf(supplier);
        _supplierDelta = mul_(supplierTokens, deltaIndex);
        _supplierAccrued = add_(_supplierAccrued, _supplierDelta);
        return (_supplierAccrued, _supplierDelta);
    }

    /**
     * @notice Distribute MOMA accrued by a supplier
     * @dev To avoid revert: no over/underflow
     * @param pool The pool in which the supplier is interacting
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMomaInternal(address pool, MToken mToken, address supplier) internal {
        MarketState storage state = marketStates[pool][address(mToken)];
        if (state.supplyIndex > state.supplierIndex[supplier]) {
            Double memory supplyIndex = Double({mantissa: state.supplyIndex});
            (uint _supplierAccrued, uint _supplierDelta) = newSupplierMomaInternal(pool, mToken, supplier, supplyIndex);

            state.supplierIndex[supplier] = supplyIndex.mantissa;
            momaAccrued[supplier] = _supplierAccrued;
            emit DistributedSupplier(pool, mToken, supplier, _supplierDelta, supplyIndex.mantissa);
        }
    }

    /**
     * @notice Calculate MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol
     * @dev To avoid revert: marketBorrowIndex > 0
     * @param pool The pool in which the borrower is interacting
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     * @param borrowIndex The MOMA borrow index of this market in Double type
     * @return (new borrowerAccrued, new borrowerDelta)
     */
    function newBorrowerMomaInternal(address pool, MToken mToken, address borrower, uint marketBorrowIndex, Double memory borrowIndex) internal view returns (uint, uint) {
        Double memory borrowerIndex = Double({mantissa: marketStates[pool][address(mToken)].borrowerIndex[borrower]});
        uint _borrowerAccrued = momaAccrued[borrower];
        uint _borrowerDelta = 0;

        if (borrowerIndex.mantissa > 0) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(mToken.borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            _borrowerDelta = mul_(borrowerAmount, deltaIndex);
            _borrowerAccrued = add_(_borrowerAccrued, _borrowerDelta);
        }
        return (_borrowerAccrued, _borrowerDelta);
    }

    /**
     * @notice Distribute MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol
     * @dev To avoid revert: no over/underflow
     * @param pool The pool in which the borrower is interacting
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMomaInternal(address pool, MToken mToken, address borrower, uint marketBorrowIndex) internal {
        if (isMomaLendingPool[pool] == true) {
            MarketState storage state = marketStates[pool][address(mToken)];
            if (state.borrowIndex > state.borrowerIndex[borrower] && marketBorrowIndex > 0) {
                Double memory borrowIndex = Double({mantissa: state.borrowIndex});
                (uint _borrowerAccrued, uint _borrowerDelta) = newBorrowerMomaInternal(pool, mToken, borrower, marketBorrowIndex, borrowIndex);

                state.borrowerIndex[borrower] = borrowIndex.mantissa;
                momaAccrued[borrower] = _borrowerAccrued;
                emit DistributedBorrower(pool, mToken, borrower, _borrowerDelta, borrowIndex.mantissa);
            }
        }
    }


    /**
     * @notice Transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, will do not perform the transfer
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
     * @notice Claim all the MOMA have been distributed to user
     * @param user The address to claim MOMA for
     */
    function claim(address user) internal {
        uint accrued = momaAccrued[user];
        uint notClaimed = grantMomaInternal(user, accrued);
        momaAccrued[user] = notClaimed;
        uint claimed = sub_(accrued, notClaimed);
        emit MomaClaimed(user, accrued, claimed, notClaimed);
    }

    /**
     * @notice Distribute all the MOMA accrued to user in the specified markets of specified pool
     * @param user The address to distribute MOMA for
     * @param pool The moma pool to distribute MOMA in
     * @param mTokens The list of markets to distribute MOMA in
     * @param suppliers Whether or not to distribute MOMA earned by supplying
     * @param borrowers Whether or not to distribute MOMA earned by borrowing
     */
    function distribute(address user, address pool, MToken[] memory mTokens, bool suppliers, bool borrowers) internal {
        for (uint i = 0; i < mTokens.length; i++) {
            MToken mToken = mTokens[i];
            
            if (suppliers == true) {
                updateMarketSupplyStateInternal(pool, mToken);
                distributeSupplierMomaInternal(pool, mToken, user);
            }

            if (borrowers == true && isMomaLendingPool[pool] == true) {
                uint borrowIndex = mToken.borrowIndex();
                updateMarketBorrowStateInternal(pool, mToken, borrowIndex);
                distributeBorrowerMomaInternal(pool, mToken, user, borrowIndex);
            }
        }
    }

    /**
     * @notice Distribute all the MOMA accrued to user in all markets of specified pools
     * @param user The address to distribute MOMA for
     * @param pools The list of moma pools to distribute MOMA
     * @param suppliers Whether or not to distribute MOMA earned by supplying
     * @param borrowers Whether or not to distribute MOMA earned by borrowing
     */
    function distribute(address user, MomaPool[] memory pools, bool suppliers, bool borrowers) internal {
        for (uint i = 0; i < pools.length; i++) {
            address pool = address(pools[i]);
            distribute(user, pool, momaMarkets[pool], suppliers, borrowers);
        }
    }


    /*** Factory Functions ***/

    /**
     * @notice Update pool market's borrowBlock when it upgrades to lending pool in factory
     * @dev Note: can only call once by factory
     * @param pool The pool to upgrade
     */
    function upgradeLendingPool(address pool) external {
        require(msg.sender == address(factory), 'MomaFarming: not factory');
        require(isMomaLendingPool[pool] == false, 'MomaFarming: can only upgrade once');

        uint blockNumber = getBlockNumber();
        MToken[] memory mTokens = momaMarkets[pool];
        for (uint i = 0; i < mTokens.length; i++) {
            MarketState storage state = marketStates[pool][address(mTokens[i])];
            state.borrowBlock = blockNumber; // if state.weight > 0 ?
        }

        isMomaLendingPool[pool] = true;
    }



    /*** Called Functions ***/

    /**
     * @notice Accrue MOMA to the market by updating the supply state
     * @param mToken The market whose supply state to update
     */
    function updateMarketSupplyState(address mToken) external {
        require(factory.isMomaPool(msg.sender), 'MomaFarming: not moma pool');
        updateMarketSupplyStateInternal(msg.sender, MToken(mToken));
    }

    /**
     * @notice Accrue MOMA to the market by updating the borrow state
     * @param mToken The market whose borrow state to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMarketBorrowState(address mToken, uint marketBorrowIndex) external {
        require(factory.isMomaPool(msg.sender), 'MomaFarming: not moma pool');
        updateMarketBorrowStateInternal(msg.sender, MToken(mToken), marketBorrowIndex);
    }

    /**
     * @notice Distribute MOMA accrued by a supplier
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMoma(address mToken, address supplier) external {
        require(factory.isMomaPool(msg.sender), 'MomaFarming: not moma pool');
        distributeSupplierMomaInternal(msg.sender, MToken(mToken), supplier);
    }

    /**
     * @notice Distribute MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMoma(address mToken, address borrower, uint marketBorrowIndex) external {
        require(factory.isMomaPool(msg.sender), 'MomaFarming: not moma pool');
        distributeBorrowerMomaInternal(msg.sender, MToken(mToken), borrower, marketBorrowIndex);
    }

    /**
     * @notice Distribute all the MOMA accrued to user in specified markets of specified pool and claim
     * @param pool The moma pool to distribute MOMA in
     * @param mTokens The list of markets to distribute MOMA in
     * @param suppliers Whether or not to distribute MOMA earned by supplying
     * @param borrowers Whether or not to distribute MOMA earned by borrowing
     */
    function dclaim(address pool, MToken[] memory mTokens, bool suppliers, bool borrowers) public {
        distribute(msg.sender, pool, mTokens, suppliers, borrowers);
        claim(msg.sender);
    }

    /**
     * @notice Distribute all the MOMA accrued to user in all markets of specified pools and claim
     * @param pools The list of moma pools to distribute and claim MOMA
     * @param suppliers Whether or not to distribute MOMA earned by supplying
     * @param borrowers Whether or not to distribute MOMA earned by borrowing
     */
    function dclaim(MomaPool[] memory pools, bool suppliers, bool borrowers) public {
        distribute(msg.sender, pools, suppliers, borrowers);
        claim(msg.sender);
    }

    /**
     * @notice Distribute all the MOMA accrued to user in all markets of all pools and claim
     * @param suppliers Whether or not to distribute MOMA earned by supplying
     * @param borrowers Whether or not to distribute MOMA earned by borrowing
     */
    function dclaim(bool suppliers, bool borrowers) public {
        distribute(msg.sender, momaPools, suppliers, borrowers);
        claim(msg.sender);
    }

    /**
     * @notice Claim all the MOMA have been distributed to user
     */
    function claim() public {
        claim(msg.sender);
    }


    /*** View Functions ***/

    /**
     * @notice Calculate the speed of a moma market
     * @param pool The moma pool to calculate speed
     * @param mToken The moma market to calculate speed
     * @return The mama market speed
     */
    function getMarketSpeed(address pool, address mToken) public view returns (uint) {
        return div_(mul_(momaSpeed, marketStates[pool][mToken].weight), momaTotalWeight);
    }

    /**
     * @notice Return all of the moma pools
     * @dev The automatic getter may be used to access an individual pool
     * @return The list of pool addresses
     */
    function getAllMomaPools() public view returns (MomaPool[] memory) {
        return momaPools;
    }

    /**
     * @notice Return the total number of moma pools
     * @return The number of mama pools
     */
    function getMomaPoolNum() public view returns (uint) {
        return momaPools.length;
    }

    /**
     * @notice Return all of the moma markets of the specified pool
     * @dev The automatic getter may be used to access an individual market
     * @param pool The moma pool to get moma markets
     * @return The list of market addresses
     */
    function getMomaMarkets(address pool) public view returns (MToken[] memory) {
        return momaMarkets[pool];
    }

    /**
     * @notice Return the total number of moma markets of all pools
     * @return The number of total mama markets
     */
    function getMomaMarketNum() public view returns (uint num) {
        for (uint i = 0; i < momaPools.length; i++) {
            num += momaMarkets[address(momaPools[i])].length;
        }
    }

    /**
     * @notice Weather this is a moma market
     * @param pool The moma pool of this market
     * @param mToken The moma market to ask
     * @return true or false
     */
    function isMomaMarket(address pool, address mToken) public view returns (bool) {
        return marketStates[pool][mToken].isMomaMarket;
    }

    function isLendingPool(address pool) public view returns (bool) {
        return factory.isLendingPool(pool);
    }

    /**
     * @notice Calculate undistributed MOMA accrued by the user in specified market of specified pool
     * @param user The address to calculate MOMA for
     * @param pool The moma pool to calculate MOMA
     * @param mToken The market to calculate MOMA
     * @param suppliers Whether or not to calculate MOMA earned by supplying
     * @param borrowers Whether or not to calculate MOMA earned by borrowing
     * @return The amount of undistributed MOMA of this user
     */
    function undistributed(address user, address pool, MToken mToken, bool suppliers, bool borrowers) public view returns (uint) {
        uint accrued;
        uint _index;
        MarketState storage state = marketStates[pool][address(mToken)];
        if (suppliers == true) {
            if (state.weight > 0) { // momaTotalWeight > 0
                (_index, ) = newMarketSupplyStateInternal(pool, mToken);
            } else {
                _index = state.supplyIndex;
            }
            if (_index > state.supplierIndex[user]) {
                (, accrued) = newSupplierMomaInternal(pool, mToken, user, Double({mantissa: _index}));
            }
        }

        if (borrowers == true && isMomaLendingPool[pool] == true) {
            uint marketBorrowIndex = mToken.borrowIndex();
            if (marketBorrowIndex > 0) {
                if (state.weight > 0) { // momaTotalWeight > 0
                    (_index, ) = newMarketBorrowStateInternal(pool, mToken, marketBorrowIndex);
                } else {
                    _index = state.borrowIndex;
                }
                if (_index > state.borrowerIndex[user]) {
                    (, uint _borrowerDelta) = newBorrowerMomaInternal(pool, mToken, user, marketBorrowIndex, Double({mantissa: _index}));
                    accrued = add_(accrued, _borrowerDelta);
                }
            }
        }
        return accrued;
    }

    /**
     * @notice Calculate undistributed MOMA accrued by the user in all markets of specified pool
     * @param user The address to calculate MOMA for
     * @param pool The moma pool to calculate MOMA
     * @param suppliers Whether or not to calculate MOMA earned by supplying
     * @param borrowers Whether or not to calculate MOMA earned by borrowing
     * @return The amount of undistributed MOMA of this user in each market
     */
    function undistributed(address user, address pool, bool suppliers, bool borrowers) public view returns (uint[] memory) {
        MToken[] memory mTokens = momaMarkets[pool];
        uint[] memory accrued = new uint[](mTokens.length);
        for (uint i = 0; i < mTokens.length; i++) {
            accrued[i] = undistributed(user, pool, mTokens[i], suppliers, borrowers);
        }
        return accrued;
    }



    /*** Admin Functions ***/

    /**
     * @notice Set the new admin address
     * @param newAdmin The new admin address
     */
    function _setAdmin(address newAdmin) external {
        require(msg.sender == admin && newAdmin != address(0), 'MomaFarming: admin check');

        address oldAdmin = admin;
        admin = newAdmin;
        emit NewAdmin(oldAdmin, newAdmin);
    }

    /**
     * @notice Set the new factory contract
     * @param newFactory The new factory contract address
     */
    function _setFactory(MomaFactoryInterface newFactory) external {
        require(msg.sender == admin && address(newFactory) != address(0), 'MomaFarming: admin check');
        require(newFactory.isMomaFactory(), 'MomaFarming: not moma factory');

        MomaFactoryInterface oldFactory = factory;
        factory = newFactory;
        emit NewFactory(oldFactory, newFactory);
    }

    /**
     * @notice Update state for all MOMA markets of all pools
     * @dev Note: Be careful of gas spending!
     */
    function updateAllMomaMarkets() public {        
        for (uint i = 0; i < momaPools.length; i++) {
            address pool = address(momaPools[i]);
            MToken[] memory mTokens = momaMarkets[pool];
            for (uint j = 0; j < mTokens.length; j++) {
                 MToken mToken = mTokens[j];
                updateMarketSupplyStateInternal(pool, mToken);
                
                if (isMomaLendingPool[pool] == true) {
                    uint borrowIndex = mToken.borrowIndex();
                    updateMarketBorrowStateInternal(pool, mToken, borrowIndex);
                }
            }
        }
    }


    /**
     * @notice Set the new momaSpeed for all MOMA markets of all pools
     * @dev Note: can call at any time, but must update state of all moma markets first
     * @param newMomaSpeed The new momaSpeed
     */
    function _setMomaSpeed(uint newMomaSpeed) public {
        require(msg.sender == admin, 'MomaFarming: admin check');

        // Update state for all MOMA markets of all pools
        updateAllMomaMarkets();

        uint oldMomaSpeed = momaSpeed;
        momaSpeed = newMomaSpeed;
        emit NewMomaSpeed(oldMomaSpeed, newMomaSpeed);
    }

    /**
     * @notice Set MOMA markets' weight, will also mark as MOMA market in the first time
     * @dev Note: can call at any time, but must update state of all moma markets first
     * @param pool The address of the pool
     * @param mTokens The markets to set weigh
     * @param newWeights The new weights, 0 means no new MOMA farm
     */
    function _setMarketsWeight(address payable pool, MToken[] memory mTokens, uint[] memory newWeights) public {
        require(msg.sender == admin, 'MomaFarming: admin check');
        require(factory.isMomaPool(pool), 'MomaFarming: not moma pool');
        // param check?

        // Update state for all MOMA markets of all pools
        updateAllMomaMarkets();

        uint oldWeightTotal;
        uint newWeightTotal;
        uint blockNumber = getBlockNumber();

        // Update state for all MOMA markets to be setted
        for (uint i = 0; i < mTokens.length; i++) {
            MToken mToken = mTokens[i];
            MarketState storage state = marketStates[pool][address(mToken)];

            // add this market to momaMarkets if first set
            if (!state.isMomaMarket) {
                state.isMomaMarket = true;
                momaMarkets[pool].push(mToken);
                emit NewMomaMarket(pool, mToken);

                // set initial index of this market
                state.supplyIndex = momaInitialIndex;
                state.borrowIndex = momaInitialIndex;
            }

            uint oldWeight = state.weight;
            oldWeightTotal = add_(oldWeightTotal, oldWeight);
            newWeightTotal = add_(newWeightTotal, newWeights[i]);

            // update weight and block of this market
            state.weight = newWeights[i];
            state.supplyBlock = blockNumber;
            state.borrowBlock = blockNumber;

            emit NewMarketWeight(pool, mToken, oldWeight, newWeights[i]);
        }

        uint oldMomaTotalWeight = momaTotalWeight;
        // update momaTotalWeight
        momaTotalWeight = add_(sub_(momaTotalWeight, oldWeightTotal), newWeightTotal);
        emit NewTotalWeight(oldMomaTotalWeight, momaTotalWeight);
        
        // add this pool to momaPools if first set
        if (!isMomaPool[pool]) {
            isMomaPool[pool] = true;
            momaPools.push(MomaPool(pool));
            emit NewMomaPool(pool);

            // mark to lending pool
            if (isLendingPool(pool)) isMomaLendingPool[pool] = true;
        }
    }

    /**
     * @notice Transfer MOMA to the recipient
     * @dev Note: If there is not enough MOMA, we do not perform the transfer
     * @param recipient The address of the recipient to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     */
    function _grantMoma(address recipient, uint amount) public {
        require(msg.sender == admin, 'MomaFarming: only admin can grant token');
        uint notTransfered = grantMomaInternal(recipient, amount);
        require(notTransfered == 0, 'MomaFarming: insufficient MOMA for grant');
        emit MomaGranted(recipient, amount);
    }


    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}
