pragma solidity ^0.5.16;

import "./MToken.sol";
import "./MomaMasterStorage.sol";
import "./MomaFactoryInterface.sol";

/**
 * @title Moma's Token Farming Contract
 * @author moma
 */
 
contract FarmingDelegate is MomaMasterV1Storage, MomaMasterErrorReporter, ExponentialNoError {

    /// @notice Emitted when a new token speed is updated for a market
    event TokenSpeedUpdated(address indexed token, MToken indexed mToken, uint newSpeed);

    /// @notice Emitted when a new MOMA speed is updated for a market
    event MomaSpeedUpdated(MToken indexed mToken, uint newSpeed);

    /// @notice Emitted when token is distributed to a supplier
    event DistributedSupplierToken(address indexed token, MToken indexed mToken, address indexed supplier, uint tokenDelta, uint tokenSupplyIndex);

    /// @notice Emitted when MOMA is distributed to a supplier
    event DistributedSupplierMoma(MToken indexed mToken, address indexed supplier, uint momaDelta, uint momaSupplyIndex);

    /// @notice Emitted when token is distributed to a borrower
    event DistributedBorrowerToken(address indexed token, MToken indexed mToken, address indexed borrower, uint tokenDelta, uint tokenBorrowIndex);

    /// @notice Emitted when MOMA is distributed to a borrower
    event DistributedBorrowerMoma(MToken indexed mToken, address indexed borrower, uint momaDelta, uint momaBorrowIndex);

    /// @notice Emitted when farm token is updated by admin
    event FarmTokenUpdated(EIP20Interface token, uint oldStart, uint oldEnd, uint newStart, uint newEnd);

    /// @notice Emitted when farm MOMA is updated by factory
    event FarmMomaUpdated(uint oldStart, uint oldEnd, uint newStart, uint newEnd, bool reset);

    /// @notice Emitted when token is granted by admin
    event TokenGranted(address token, address recipient, uint amount);

    /// @notice The initial moma index for a market
    uint224 public constant momaInitialIndex = 1e36;


    /*** Tokens Farming Internal Functions ***/

    /**
     * @notice Calculates the new token supply index and block
     * @param token The token whose supply index to calculate
     * @param mToken The market whose supply index to calculate
     * @return (new index, new block)
     */
    function newTokenSupplyIndexInternal(address token, address mToken) internal view returns (uint224, uint32) {
        uint blockNumber = getBlockNumber();
        MarketState storage supplyState = farmStates[token].supplyState[mToken];
        uint224 _index = supplyState.index;
        uint32 _block = supplyState.block;
        uint32 endBlock = farmStates[token].endBlock;
        if (blockNumber > uint(supplyState.block) && blockNumber > uint(farmStates[token].startBlock) && supplyState.block < endBlock) {
            uint supplySpeed = farmStates[token].speeds[mToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(endBlock)) endNumber = uint(endBlock);
            uint deltaBlocks = sub_(endNumber, uint(supplyState.block)); // deltaBlocks will always > 0
            if (supplySpeed > 0) {
                uint supplyTokens = MToken(mToken).totalSupply();
                uint tokenAccrued = mul_(deltaBlocks, supplySpeed);
                Double memory ratio = supplyTokens > 0 ? fraction(tokenAccrued, supplyTokens) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
                _index = safe224(index.mantissa, "new index exceeds 224 bits");
            }
            _block = safe32(endNumber, "block number exceeds 32 bits");
        }
        return (_index, _block);
    }

    /**
     * @notice Accrue token to the market by updating the supply index
     * @param token The token whose supply index to update
     * @param mToken The market whose supply index to update
     */
    function updateTokenSupplyIndexInternal(address token, address mToken) internal {
        (uint224 _index, uint32 _block) = newTokenSupplyIndexInternal(token, mToken);
        MarketState storage supplyState = farmStates[token].supplyState[mToken];
        
        if (supplyState.index != _index) supplyState.index = _index;
        if (supplyState.block != _block) supplyState.block = _block;
    }

    /**
     * @notice Calculates the new token borrow index and block
     * @param token The token whose borrow index to calculate
     * @param mToken The market whose borrow index to calculate
     * @param marketBorrowIndex The market borrow index
     * @return (new index, new block)
     */
    function newTokenBorrowIndexInternal(address token, address mToken, uint marketBorrowIndex) internal view returns (uint224, uint32) {
        uint blockNumber = getBlockNumber();
        MarketState storage borrowState = farmStates[token].borrowState[mToken];
        uint224 _index = borrowState.index;
        uint32 _block = borrowState.block;
        uint32 endBlock = farmStates[token].endBlock;
        if (blockNumber > uint(borrowState.block) && blockNumber > uint(farmStates[token].startBlock) && borrowState.block < endBlock) {
            uint borrowSpeed = farmStates[token].speeds[mToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(endBlock)) endNumber = uint(endBlock);
            uint deltaBlocks = sub_(endNumber, uint(borrowState.block)); // deltaBlocks will always > 0
            if (borrowSpeed > 0) {
                uint borrowAmount = div_(MToken(mToken).totalBorrows(), Exp({mantissa: marketBorrowIndex}));
                uint tokenAccrued = mul_(deltaBlocks, borrowSpeed);
                Double memory ratio = borrowAmount > 0 ? fraction(tokenAccrued, borrowAmount) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
                _index = safe224(index.mantissa, "new index exceeds 224 bits");
            }
            _block = safe32(endNumber, "block number exceeds 32 bits");
        }
        return (_index, _block);
    }

    /**
     * @notice Accrue token to the market by updating the borrow index
     * @param token The token whose borrow index to update
     * @param mToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateTokenBorrowIndexInternal(address token, address mToken, uint marketBorrowIndex) internal {
        (uint224 _index, uint32 _block) = newTokenBorrowIndexInternal(token, mToken, marketBorrowIndex);
        MarketState storage borrowState = farmStates[token].borrowState[mToken];

        if (borrowState.index != _index) borrowState.index = _index;
        if (borrowState.block != _block) borrowState.block = _block;
    }

    /**
     * @notice Calculates token accrued by a supplier
     * @param token The token in which the supplier is interacting
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     * @param supplyIndex The token supply index of this market in Double type
     * @return (new supplierAccrued, new supplierDelta)
     */
    function newSupplierTokenInternal(address token, address mToken, address supplier, Double memory supplyIndex) internal view returns (uint, uint) {
        TokenFarmState storage state = farmStates[token];
        Double memory supplierIndex = Double({mantissa: state.supplierIndex[mToken][supplier]});
        uint _supplierAccrued = state.accrued[supplier];
        uint supplierDelta = 0;

        if (supplyIndex.mantissa > 0) {
            if (supplierIndex.mantissa == 0 || supplierIndex.mantissa > supplyIndex.mantissa) {
                supplierIndex.mantissa = momaInitialIndex;
            }
        }

        if (supplyIndex.mantissa > supplierIndex.mantissa) {
            Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
            uint supplierTokens = MToken(mToken).balanceOf(supplier);
            supplierDelta = mul_(supplierTokens, deltaIndex);
            _supplierAccrued = add_(state.accrued[supplier], supplierDelta);
        }
        return (_supplierAccrued, supplierDelta);
    }

    /**
     * @notice Calculate token accrued by a supplier
     * @param token The token in which the supplier is interacting
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     */
    function distributeSupplierTokenInternal(address token, address mToken, address supplier) internal {
        TokenFarmState storage state = farmStates[token];
        Double memory supplyIndex = Double({mantissa: state.supplyState[mToken].index});
        (uint _supplierAccrued, uint supplierDelta) = newSupplierTokenInternal(token, mToken, supplier, supplyIndex);

        state.supplierIndex[mToken][supplier] = supplyIndex.mantissa;
        if (_supplierAccrued > state.accrued[supplier]) {
            state.accrued[supplier] = _supplierAccrued;
            emit DistributedSupplierToken(token, MToken(mToken), supplier, supplierDelta, supplyIndex.mantissa);
        }
    }

    /**
     * @notice Calculate token accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute token to
     * @param marketBorrowIndex The market borrow index
     * @param borrowIndex The token borrow index of this market in Double type
     * @return (new borrowerAccrued, new borrowerDelta)
     */
    function newBorrowerTokenInternal(address token, address mToken, address borrower, uint marketBorrowIndex, Double memory borrowIndex) internal view returns (uint, uint) {
        TokenFarmState storage state = farmStates[token];
        Double memory borrowerIndex = Double({mantissa: state.borrowerIndex[mToken][borrower]});
        uint _borrowerAccrued = state.accrued[borrower];
        uint borrowerDelta = 0;

        // when updated farm token, borrowerIndex should be set to initial
        if (borrowerIndex.mantissa > borrowIndex.mantissa) {
            borrowerIndex.mantissa = momaInitialIndex;
        }

        if (borrowerIndex.mantissa > 0 && borrowIndex.mantissa > borrowerIndex.mantissa) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(MToken(mToken).borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            borrowerDelta = mul_(borrowerAmount, deltaIndex);
            _borrowerAccrued = add_(state.accrued[borrower], borrowerDelta);
        }
        return (_borrowerAccrued, borrowerDelta);
    }

    /**
     * @notice Calculate token accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute token to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerTokenInternal(address token, address mToken, address borrower, uint marketBorrowIndex) internal {
        TokenFarmState storage state = farmStates[token];
        Double memory borrowIndex = Double({mantissa: state.borrowState[mToken].index});
        (uint _borrowerAccrued, uint borrowerDelta) = newBorrowerTokenInternal(token, mToken, borrower, marketBorrowIndex, borrowIndex);

        state.borrowerIndex[mToken][borrower] = borrowIndex.mantissa;
        if (_borrowerAccrued > state.accrued[borrower]) {
            state.accrued[borrower] = _borrowerAccrued;
            emit DistributedBorrowerToken(token, MToken(mToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Transfer token to the user
     * @dev Note: If there is not enough token, we do not perform the transfer all.
     * @param token The token to transfer
     * @param user The address of the user to transfer token to
     * @param amount The amount of token to (possibly) transfer
     * @return The amount of token which was NOT transferred to the user
     */
    function grantTokenInternal(address token, address user, uint amount) internal returns (uint) {
        EIP20Interface erc20 = EIP20Interface(token);
        uint tokenRemaining = erc20.balanceOf(address(this));
        if (amount > 0 && amount <= tokenRemaining) {
            erc20.transfer(user, amount);
            return 0;
        }
        return amount;
    }

    /**
      * @notice Reset all markets state for a token
      * @param token The token to reset state
      */
    function _resetTokenState(address token) internal {
        TokenFarmState storage state = farmStates[token];
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = address(allMarkets[i]);
            if (state.speeds[market] > 0) {
                state.supplyState[market] = MarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });

                state.borrowState[market] = MarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });
            }
        }
    }


    /*** Tokens Farming Called Functions ***/

    /**
     * @notice Accrue token to the market by updating the supply index
     * @param token The token whose supply index to update
     * @param mToken The market whose supply index to update
     */
    function updateTokenSupplyIndex(address token, address mToken) external {
        updateTokenSupplyIndexInternal(token, mToken);
    }

    /**
     * @notice Accrue token to the market by updating the borrow index
     * @param token The token whose borrow index to update
     * @param mToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateTokenBorrowIndex(address token, address mToken, uint marketBorrowIndex) external {
        updateTokenBorrowIndexInternal(token, mToken, marketBorrowIndex);
    }

    /**
     * @notice Calculate token accrued by a supplier
     * @param token The token in which the supplier is interacting
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     */
    function distributeSupplierToken(address token, address mToken, address supplier) external {
        distributeSupplierTokenInternal(token, mToken, supplier);
    }

    /**
     * @notice Calculate token accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute token to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerToken(address token, address mToken, address borrower, uint marketBorrowIndex) external {
        distributeBorrowerTokenInternal(token, mToken, borrower, marketBorrowIndex);
    }

    /**
     * @notice Claim all the tokens accrued by the holders
     * @param holders The addresses to claim tokens for
     * @param mTokens The list of markets to claim tokens in
     * @param tokens The list of tokens to claim
     * @param borrowers Whether or not to claim tokens earned by borrowing
     * @param suppliers Whether or not to claim tokens earned by supplying
     */
    function claimToken(address[] memory holders, MToken[] memory mTokens, address[] memory tokens, bool borrowers, bool suppliers) public {
        for (uint t = 0; t < tokens.length; t++) {
            address token = tokens[t];
            for (uint i = 0; i < mTokens.length; i++) {
                MToken mToken = mTokens[i];
                require(markets[address(mToken)].isListed, "market must be listed");
                if (borrowers == true) {
                    uint borrowIndex = mToken.borrowIndex();
                    updateTokenBorrowIndexInternal(token, address(mToken), borrowIndex);
                    for (uint j = 0; j < holders.length; j++) {
                        distributeBorrowerTokenInternal(token, address(mToken), holders[j], borrowIndex);
                        farmStates[token].accrued[holders[j]] = grantTokenInternal(token, holders[j], farmStates[token].accrued[holders[j]]);
                    }
                }
                if (suppliers == true) {
                    updateTokenSupplyIndexInternal(token, address(mToken));
                    for (uint j = 0; j < holders.length; j++) {
                        distributeSupplierTokenInternal(token, address(mToken), holders[j]);
                        farmStates[token].accrued[holders[j]] = grantTokenInternal(token, holders[j], farmStates[token].accrued[holders[j]]);
                    }
                }
            }
        }
    }

    struct TokenClaimableLocalVars {
        uint224 _index;
        uint supplyDelta;
        uint borrowDelta;
        address token;
        uint accrued;
        uint borrowIndex;
    }

    /**
     * @notice Calculate all the tokens accrued by the holder
     * @param holder The address to claim tokens for
     * @param mTokens The list of markets to claim tokens in
     * @param tokens The list of tokens to claim
     * @param borrowers Whether or not to claim tokens earned by borrowing
     * @param suppliers Whether or not to claim tokens earned by supplying
     * @return The list amount of token the user can claim
     */
    function tokenClaimable(address holder, MToken[] memory mTokens, address[] memory tokens, bool borrowers, bool suppliers) public view returns (uint[] memory) {
        uint[] memory results = new uint[](tokens.length);
        TokenClaimableLocalVars memory vars;
        for (uint t = 0; t < tokens.length; t++) {
            vars.token = tokens[t];
            vars.accrued = farmStates[vars.token].accrued[holder];
            for (uint i = 0; i < mTokens.length; i++) {
                MToken mToken = mTokens[i];
                require(markets[address(mToken)].isListed, "market must be listed");
                if (borrowers == true) {
                    vars.borrowIndex = mToken.borrowIndex();
                    (vars._index, ) = newTokenBorrowIndexInternal(vars.token, address(mToken), vars.borrowIndex);
                    (, vars.borrowDelta) = newBorrowerTokenInternal(vars.token, address(mToken), holder, vars.borrowIndex, Double({mantissa: vars._index}));
                    vars.accrued = add_(vars.accrued, vars.borrowDelta);
                }
                if (suppliers == true) {
                    (vars._index, ) = newTokenSupplyIndexInternal(vars.token, address(mToken));
                    (, vars.supplyDelta) = newSupplierTokenInternal(vars.token, address(mToken), holder, Double({mantissa: vars._index}));
                    vars.accrued = add_(vars.accrued, vars.supplyDelta);
                }
            }
            results[t] = vars.accrued;
        }
        return results;
    }


    /*** Token Distribution Admin ***/

    /**
     * @notice Transfer token to the recipient
     * @dev Note: If there is not enough token, we do not perform the transfer all.
     * @param token The token to transfer
     * @param recipient The address of the recipient to transfer token to
     * @param amount The amount of token to (possibly) transfer
     */
    function _grantToken(address token, address recipient, uint amount) public {
        uint amountLeft = grantTokenInternal(token, recipient, amount);
        require(amountLeft == 0, "insufficient token for grant");
        emit TokenGranted(token, recipient, amount);
    }

    /**
      * @notice Add/Update erc20 token to farm
      * @dev Admin function to update token farm
      * @param token Token to update for farming
      * @param start Block heiht to start to farm this token
      * @param end Block heiht to stop farming
      * @param reset Weather reset token state, afther reset user will lose undistributed token, should after endBlock
      * @return uint 0=success, otherwise a failure
      */
    function _setTokenFarming(EIP20Interface token, uint start, uint end, bool reset) external returns (uint) {
        require(end > start, "endBlock less than startBlock");
        token.totalSupply(); //sanity check it

        TokenFarmState storage state = farmStates[address(token)];
        require(start != 0, "startBlock is 0");
        require(start > getBlockNumber() || start == state.startBlock, "startBlock check");
        uint oldStartBlock = uint(state.startBlock);
        uint oldEndBlock = uint(state.endBlock);
        state.startBlock = safe32(start, "start block number exceeds 32 bits");
        state.endBlock = safe32(end, "end block number exceeds 32 bits");

        if (reset == true) _resetTokenState(address(token));
        if (oldStartBlock == 0) allTokens.push(address(token)); // when first set this token

        emit FarmTokenUpdated(token, oldStartBlock, oldEndBlock, start, end);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Set token speed for a single market
     * @param token The token to update speed
     * @param mToken The market whose token speed to update
     * @param newSpeed New token speed for market
     */
    function _setTokenSpeed(address token, MToken mToken, uint newSpeed) public {
        TokenFarmState storage state = farmStates[token];
        // require(isFarming(token), "token is not farming");
        uint currentTokenSpeed = state.speeds[address(mToken)];
        if (currentTokenSpeed != 0) {
            // note that token speed could be set to 0 to halt liquidity rewards for a market
            uint borrowIndex = mToken.borrowIndex();
            updateTokenSupplyIndexInternal(token, address(mToken));
            updateTokenBorrowIndexInternal(token, address(mToken), borrowIndex);
        } else if (newSpeed != 0) {
            // Add the token farming market
            Market storage market = markets[address(mToken)];
            require(market.isListed == true, "market is not listed");
            // !!!to fix: when set speed from 0 to non-zero after set non-zero to 0, should update block to max(blockNumber, startBlock)

            if (state.supplyState[address(mToken)].index == 0 && state.supplyState[address(mToken)].block == 0) {
                state.supplyState[address(mToken)] = MarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });
            }

            if (state.borrowState[address(mToken)].index == 0 && state.borrowState[address(mToken)].block == 0) {
                state.borrowState[address(mToken)] = MarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });
            }
        }

        if (currentTokenSpeed != newSpeed) {
            state.speeds[address(mToken)] = newSpeed;
            emit TokenSpeedUpdated(token, mToken, newSpeed);
        }
    }


    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}
