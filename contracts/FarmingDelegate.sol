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
     * @notice Accrue token to the market by updating the supply index
     * @param token The token whose supply index to update
     * @param mToken The market whose supply index to update
     */
    function updateTokenSupplyIndexInternal(address token, address mToken) internal {
        uint blockNumber = getBlockNumber();
        MomaMarketState storage supplyState = farmStates[token].supplyState[mToken];
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
                farmStates[token].supplyState[mToken] = MomaMarketState({
                    index: safe224(index.mantissa, "new index exceeds 224 bits"),
                    block: safe32(endNumber, "block number exceeds 32 bits")
                });
            } else {
                supplyState.block = safe32(endNumber, "block number exceeds 32 bits");
            }
        }
    }

    /**
     * @notice Accrue token to the market by updating the borrow index
     * @param token The token whose borrow index to update
     * @param mToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateTokenBorrowIndexInternal(address token, address mToken, uint marketBorrowIndex) internal {
        uint blockNumber = getBlockNumber();
        MomaMarketState storage borrowState = farmStates[token].borrowState[mToken];
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
                farmStates[token].borrowState[mToken] = MomaMarketState({
                    index: safe224(index.mantissa, "new index exceeds 224 bits"),
                    block: safe32(endNumber, "block number exceeds 32 bits")
                });
            } else {
                borrowState.block = safe32(endNumber, "block number exceeds 32 bits");
            }
        }
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
        Double memory supplierIndex = Double({mantissa: state.supplierIndex[mToken][supplier]});
        state.supplierIndex[mToken][supplier] = supplyIndex.mantissa;

        if (supplyIndex.mantissa > 0) {
            if (supplierIndex.mantissa == 0 || supplierIndex.mantissa > supplyIndex.mantissa) {
                supplierIndex.mantissa = momaInitialIndex;
            }
        }

        if (supplyIndex.mantissa > supplierIndex.mantissa) {
            Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
            uint supplierTokens = MToken(mToken).balanceOf(supplier);
            uint supplierDelta = mul_(supplierTokens, deltaIndex);
            uint supplierAccrued = add_(state.accrued[supplier], supplierDelta);
            state.accrued[supplier] = supplierAccrued;
            emit DistributedSupplierToken(token, MToken(mToken), supplier, supplierDelta, supplyIndex.mantissa);
        }
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
        Double memory borrowerIndex = Double({mantissa: state.borrowerIndex[mToken][borrower]});
        state.borrowerIndex[mToken][borrower] = borrowIndex.mantissa;

        // when updated farm token, borrowerIndex should be set to initial
        if (borrowerIndex.mantissa > borrowIndex.mantissa) {
            borrowerIndex.mantissa = momaInitialIndex;
        }

        if (borrowerIndex.mantissa > 0 && borrowIndex.mantissa > borrowerIndex.mantissa) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(MToken(mToken).borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(state.accrued[borrower], borrowerDelta);
            state.accrued[borrower] = borrowerAccrued;
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
                state.supplyState[market] = MomaMarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });

                state.borrowState[market] = MomaMarketState({
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

            if (state.supplyState[address(mToken)].index == 0 && state.supplyState[address(mToken)].block == 0) {
                state.supplyState[address(mToken)] = MomaMarketState({
                    index: momaInitialIndex,
                    block: state.startBlock
                });
            }

            if (state.borrowState[address(mToken)].index == 0 && state.borrowState[address(mToken)].block == 0) {
                state.borrowState[address(mToken)] = MomaMarketState({
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



    /*** MOMA Farming Internal Functions ***/

    /**
     * @notice Accrue MOMA to the market by updating the supply index
     * @param mToken The market whose supply index to update
     */
    function updateMomaSupplyIndexInternal(address mToken) internal {
        uint blockNumber = getBlockNumber();
        MomaMarketState storage supplyState = momaSupplyState[mToken];
        if (blockNumber > uint(supplyState.block) && blockNumber > uint(momaStartBlock) && supplyState.block < momaEndBlock) {
            uint supplySpeed = momaSpeeds[mToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(momaEndBlock)) endNumber = uint(momaEndBlock);
            uint deltaBlocks = sub_(endNumber, uint(supplyState.block)); // deltaBlocks will always > 0
            if (supplySpeed > 0) {
                uint supplyTokens = MToken(mToken).totalSupply();
                uint momaAccrued = mul_(deltaBlocks, supplySpeed);
                Double memory ratio = supplyTokens > 0 ? fraction(momaAccrued, supplyTokens) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
                momaSupplyState[mToken] = MomaMarketState({
                    index: safe224(index.mantissa, "new index exceeds 224 bits"),
                    block: safe32(endNumber, "block number exceeds 32 bits")
                });
            } else {
                supplyState.block = safe32(endNumber, "block number exceeds 32 bits");
            }
        }
    }

    /**
     * @notice Accrue MOMA to the market by updating the borrow index
     * @param mToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMomaBorrowIndexInternal(address mToken, uint marketBorrowIndex) internal {
        uint blockNumber = getBlockNumber();
        MomaMarketState storage borrowState = momaBorrowState[mToken];
        if (blockNumber > uint(borrowState.block) && blockNumber > uint(momaStartBlock) && borrowState.block < momaEndBlock) {
            uint borrowSpeed = momaSpeeds[mToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(momaEndBlock)) endNumber = uint(momaEndBlock);
            uint deltaBlocks = sub_(endNumber, uint(borrowState.block)); // deltaBlocks will always > 0
            if (borrowSpeed > 0) {
                uint borrowAmount = div_(MToken(mToken).totalBorrows(), Exp({mantissa: marketBorrowIndex}));
                uint momaAccrued = mul_(deltaBlocks, borrowSpeed);
                Double memory ratio = borrowAmount > 0 ? fraction(momaAccrued, borrowAmount) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
                momaBorrowState[mToken] = MomaMarketState({
                    index: safe224(index.mantissa, "new index exceeds 224 bits"),
                    block: safe32(endNumber, "block number exceeds 32 bits")
                });
            } else {
                borrowState.block = safe32(endNumber, "block number exceeds 32 bits");
            }
        }
    }

    /**
     * @notice Calculate MOMA accrued by a supplier
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMomaInternal(address mToken, address supplier) internal {
        MomaMarketState storage supplyState = momaSupplyState[mToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: momaSupplierIndex[mToken][supplier]});
        momaSupplierIndex[mToken][supplier] = supplyIndex.mantissa;

        if (supplyIndex.mantissa > 0) {
            if (supplierIndex.mantissa == 0 || supplierIndex.mantissa > supplyIndex.mantissa) {
                supplierIndex.mantissa = momaInitialIndex;
            }
        }

        if (supplyIndex.mantissa > supplierIndex.mantissa) {
            Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
            uint supplierTokens = MToken(mToken).balanceOf(supplier);
            uint supplierDelta = mul_(supplierTokens, deltaIndex);
            uint supplierAccrued = add_(momaAccrued[supplier], supplierDelta);
            momaAccrued[supplier] = supplierAccrued;
            emit DistributedSupplierMoma(MToken(mToken), supplier, supplierDelta, supplyIndex.mantissa);
        }
    }

    /**
     * @notice Calculate MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMomaInternal(address mToken, address borrower, uint marketBorrowIndex) internal {
        MomaMarketState storage borrowState = momaBorrowState[mToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: momaBorrowerIndex[mToken][borrower]});
        momaBorrowerIndex[mToken][borrower] = borrowIndex.mantissa;

        // when updated farm token, borrowerIndex should be set to initial
        if (borrowerIndex.mantissa > borrowIndex.mantissa) {
            borrowerIndex.mantissa = momaInitialIndex;
        }

        if (borrowerIndex.mantissa > 0 && borrowIndex.mantissa > borrowerIndex.mantissa) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(MToken(mToken).borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(momaAccrued[borrower], borrowerDelta);
            momaAccrued[borrower] = borrowerAccrued;
            emit DistributedBorrowerMoma(MToken(mToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Ask factory to transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, factory do not perform the transfer all.
     * @param mToken The market to claim MOMA in
     * @param user The address of the user to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     * @return The amount of MOMA which was NOT transferred to the user
     */
    function grantMomaInternal(MToken mToken, address user, uint amount) internal returns (uint) {
        return MomaFactoryInterface(factory).claim(address(mToken), user, amount);
    }

    /**
      * @notice Reset all moma market state
      */
    function _resetMomaState() internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = address(allMarkets[i]);
            if (momaSpeeds[market] != 0) {
                momaSupplyState[market] = MomaMarketState({
                    index: momaInitialIndex,
                    block: momaStartBlock
                });
                momaBorrowState[market] = MomaMarketState({
                    index: momaInitialIndex,
                    block: momaStartBlock
                });
            }
        }
    }


    /*** MOMA Farming Called Functions ***/

    /**
     * @notice Accrue MOMA to the market by updating the supply index
     * @param mToken The market whose supply index to update
     */
    function updateMomaSupplyIndex(address mToken) external {
        updateMomaSupplyIndexInternal(mToken);
    }

    /**
     * @notice Accrue MOMA to the market by updating the borrow index
     * @param mToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMomaBorrowIndex(address mToken, uint marketBorrowIndex) external {
        updateMomaBorrowIndexInternal(mToken, marketBorrowIndex);
    }

    /**
     * @notice Calculate MOMA accrued by a supplier
     * @param mToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMoma(address mToken, address supplier) external {
        distributeSupplierMomaInternal(mToken, supplier);
    }

    /**
     * @notice Calculate MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param mToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMoma(address mToken, address borrower, uint marketBorrowIndex) external {
        distributeBorrowerMomaInternal(mToken, borrower, marketBorrowIndex);
    }

    /**
     * @notice Claim all MOMA accrued by the holders
     * @param holders The addresses to claim MOMA for
     * @param mTokens The list of markets to claim MOMA in
     * @param borrowers Whether or not to claim MOMA earned by borrowing
     * @param suppliers Whether or not to claim MOMA earned by supplying
     */
    function claimMoma(address[] memory holders, MToken[] memory mTokens, bool borrowers, bool suppliers) public {
        for (uint i = 0; i < mTokens.length; i++) {
            MToken mToken = mTokens[i];
            require(markets[address(mToken)].isListed, "market must be listed");
            if (borrowers == true) {
                uint borrowIndex = mToken.borrowIndex();
                updateMomaBorrowIndexInternal(address(mToken), borrowIndex);
                for (uint j = 0; j < holders.length; j++) {
                    distributeBorrowerMomaInternal(address(mToken), holders[j], borrowIndex);
                    momaAccrued[holders[j]] = grantMomaInternal(mToken, holders[j], momaAccrued[holders[j]]);
                }
            }
            if (suppliers == true) {
                updateMomaSupplyIndexInternal(address(mToken));
                for (uint j = 0; j < holders.length; j++) {
                    distributeSupplierMomaInternal(address(mToken), holders[j]);
                    momaAccrued[holders[j]] = grantMomaInternal(mToken, holders[j], momaAccrued[holders[j]]);
                }
            }
        }
    }

    /*** MOMA Distribution Admin ***/

    /**
      * @notice Support MOMA farm
      * @dev Factory function to update MOMA farm
      * @param start Block heiht to start to farm MOMA
      * @param end Block heiht to stop farming
      * @param reset Weather reset MOMA farm state, afther reset user will lose undistributed MOMA, should after last endBlock
      * @return uint 0=success, otherwise a failure
      */
    function _setMomaFarming(uint start, uint end, bool reset) external returns (uint) {
        require(start > getBlockNumber() || start == momaStartBlock, "startBlock check");
        require(end > start, "endBlock less than startBlock");

        uint oldStartBlock = uint(momaStartBlock);
        uint oldEndBlock = uint(momaEndBlock);
        momaStartBlock = safe32(start, "start block number exceeds 32 bits");
        momaEndBlock = safe32(end, "end block number exceeds 32 bits");

        if (reset == true) _resetMomaState();

        emit FarmMomaUpdated(oldStartBlock, oldEndBlock, start, end, reset);

        return uint(Error.NO_ERROR);
    }

    /**
     * @notice Set MOMA speed for a single market
     * @dev Factory function to set MOMA farm speed
     * @param mToken The market whose MOMA speed to update
     * @param momaSpeed New MOMA speed for market
     * @return uint 0=success, otherwise a failure
     */
    function _setMomaSpeed(MToken mToken, uint momaSpeed) external returns (uint) {
        // require(address(momaToken) != address(0), "moma token not added");
        uint currentMomaSpeed = momaSpeeds[address(mToken)];
        if (currentMomaSpeed != 0) {
            // note that MOMA speed could be set to 0 to halt liquidity rewards for a market
            uint borrowIndex = mToken.borrowIndex();
            updateMomaSupplyIndexInternal(address(mToken));
            updateMomaBorrowIndexInternal(address(mToken), borrowIndex);
        } else if (momaSpeed != 0) {
            // Add the MOMA market
            Market storage market = markets[address(mToken)];
            require(market.isListed == true, "moma market is not listed");

            if (momaSupplyState[address(mToken)].index == 0 && momaSupplyState[address(mToken)].block == 0) {
                momaSupplyState[address(mToken)] = MomaMarketState({
                    index: momaInitialIndex,
                    block: momaStartBlock
                });
            }

            if (momaBorrowState[address(mToken)].index == 0 && momaBorrowState[address(mToken)].block == 0) {
                momaBorrowState[address(mToken)] = MomaMarketState({
                    index: momaInitialIndex,
                    block: momaStartBlock
                });
            }
        }

        if (currentMomaSpeed != momaSpeed) {
            momaSpeeds[address(mToken)] = momaSpeed;
            emit MomaSpeedUpdated(mToken, momaSpeed);
        }

        return uint(Error.NO_ERROR);
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}
