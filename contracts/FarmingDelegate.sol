pragma solidity ^0.5.16;

import "./CToken.sol";
import "./ComptrollerStorage.sol";
import "./MomaFactoryInterface.sol";

/**
 * @title Moma's Token Farming Contract
 * @author moma
 */
 
contract FarmingDelegate is ComptrollerV5Storage, ComptrollerErrorReporter, ExponentialNoError {

    /// @notice Emitted when a new token speed is updated for a market
    event TokenSpeedUpdated(address indexed token, CToken indexed cToken, uint newSpeed);

    /// @notice Emitted when a new MOMA speed is updated for a market
    event MomaSpeedUpdated(CToken indexed cToken, uint newSpeed);

    /// @notice Emitted when token is distributed to a supplier
    event DistributedSupplierToken(address indexed token, CToken indexed cToken, address indexed supplier, uint compDelta, uint compSupplyIndex);

    /// @notice Emitted when MOMA is distributed to a supplier
    event DistributedSupplierMoma(CToken indexed cToken, address indexed supplier, uint compDelta, uint compSupplyIndex);

    /// @notice Emitted when token is distributed to a borrower
    event DistributedBorrowerToken(address indexed token, CToken indexed cToken, address indexed borrower, uint compDelta, uint compBorrowIndex);

    /// @notice Emitted when MOMA is distributed to a borrower
    event DistributedBorrowerMoma(CToken indexed cToken, address indexed borrower, uint compDelta, uint compBorrowIndex);

    /// @notice Emitted when farm token is updated by admin
    event FarmTokenUpdated(EIP20Interface token, uint oldStart, uint oldEnd, uint newStart, uint newEnd);

    /// @notice Emitted when farm MOMA is updated by factory
    event FarmMomaUpdated(uint oldStart, uint oldEnd, uint newStart, uint newEnd, bool reset);

    /// @notice Emitted when token is granted by admin
    event TokenGranted(address token, address recipient, uint amount);

    /// @notice The initial COMP index for a market
    uint224 public constant compInitialIndex = 1e36;


    /*** Tokens Farming Internal Functions ***/

    /**
     * @notice Accrue token to the market by updating the supply index
     * @param token The token whose supply index to update
     * @param cToken The market whose supply index to update
     */
    function updateTokenSupplyIndexInternal(address token, address cToken) internal {
        uint blockNumber = getBlockNumber();
        CompMarketState storage supplyState = farmStates[token].supplyState[cToken];
        uint32 endBlock = farmStates[token].endBlock;
        if (blockNumber > uint(supplyState.block) && blockNumber > uint(farmStates[token].startBlock) && supplyState.block < endBlock) {
            uint supplySpeed = farmStates[token].speeds[cToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(endBlock)) endNumber = uint(endBlock);
            uint deltaBlocks = sub_(endNumber, uint(supplyState.block)); // deltaBlocks will always > 0
            if (supplySpeed > 0) {
                uint supplyTokens = CToken(cToken).totalSupply();
                uint tokenAccrued = mul_(deltaBlocks, supplySpeed);
                Double memory ratio = supplyTokens > 0 ? fraction(tokenAccrued, supplyTokens) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
                farmStates[token].supplyState[cToken] = CompMarketState({
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
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateTokenBorrowIndexInternal(address token, address cToken, uint marketBorrowIndex) internal {
        uint blockNumber = getBlockNumber();
        CompMarketState storage borrowState = farmStates[token].borrowState[cToken];
        uint32 endBlock = farmStates[token].endBlock;
        if (blockNumber > uint(borrowState.block) && blockNumber > uint(farmStates[token].startBlock) && borrowState.block < endBlock) {
            uint borrowSpeed = farmStates[token].speeds[cToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(endBlock)) endNumber = uint(endBlock);
            uint deltaBlocks = sub_(endNumber, uint(borrowState.block)); // deltaBlocks will always > 0
            if (borrowSpeed > 0) {
                uint borrowAmount = div_(CToken(cToken).totalBorrows(), Exp({mantissa: marketBorrowIndex}));
                uint tokenAccrued = mul_(deltaBlocks, borrowSpeed);
                Double memory ratio = borrowAmount > 0 ? fraction(tokenAccrued, borrowAmount) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
                farmStates[token].borrowState[cToken] = CompMarketState({
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
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     */
    function distributeSupplierTokenInternal(address token, address cToken, address supplier) internal {
        TokenFarmState storage state = farmStates[token];
        Double memory supplyIndex = Double({mantissa: state.supplyState[cToken].index});
        Double memory supplierIndex = Double({mantissa: state.supplierIndex[cToken][supplier]});
        state.supplierIndex[cToken][supplier] = supplyIndex.mantissa;

        if (supplyIndex.mantissa > 0) {
            if (supplierIndex.mantissa == 0 || supplierIndex.mantissa > supplyIndex.mantissa) {
                supplierIndex.mantissa = compInitialIndex;
            }
        }

        if (supplyIndex.mantissa > supplierIndex.mantissa) {
            Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
            uint supplierTokens = CToken(cToken).balanceOf(supplier);
            uint supplierDelta = mul_(supplierTokens, deltaIndex);
            uint supplierAccrued = add_(state.accrued[supplier], supplierDelta);
            state.accrued[supplier] = supplierAccrued;
            emit DistributedSupplierToken(token, CToken(cToken), supplier, supplierDelta, supplyIndex.mantissa);
        }
    }

    /**
     * @notice Calculate token accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute COMP to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerTokenInternal(address token, address cToken, address borrower, uint marketBorrowIndex) internal {
        TokenFarmState storage state = farmStates[token];
        Double memory borrowIndex = Double({mantissa: state.borrowState[cToken].index});
        Double memory borrowerIndex = Double({mantissa: state.borrowerIndex[cToken][borrower]});
        state.borrowerIndex[cToken][borrower] = borrowIndex.mantissa;

        // when updated farm token, borrowerIndex should be set to initial
        if (borrowerIndex.mantissa > borrowIndex.mantissa) {
            borrowerIndex.mantissa = compInitialIndex;
        }

        if (borrowerIndex.mantissa > 0 && borrowIndex.mantissa > borrowerIndex.mantissa) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(CToken(cToken).borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(state.accrued[borrower], borrowerDelta);
            state.accrued[borrower] = borrowerAccrued;
            emit DistributedBorrowerToken(token, CToken(cToken), borrower, borrowerDelta, borrowIndex.mantissa);
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
                state.supplyState[market] = CompMarketState({
                    index: compInitialIndex,
                    block: state.startBlock
                });

                state.borrowState[market] = CompMarketState({
                    index: compInitialIndex,
                    block: state.startBlock
                });
            }
        }
    }


    /*** Tokens Farming Called Functions ***/

    /**
     * @notice Accrue token to the market by updating the supply index
     * @param token The token whose supply index to update
     * @param cToken The market whose supply index to update
     */
    function updateTokenSupplyIndex(address token, address cToken) external {
        updateTokenSupplyIndexInternal(token, cToken);
    }

    /**
     * @notice Accrue token to the market by updating the borrow index
     * @param token The token whose borrow index to update
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateTokenBorrowIndex(address token, address cToken, uint marketBorrowIndex) external {
        updateTokenBorrowIndexInternal(token, cToken, marketBorrowIndex);
    }

    /**
     * @notice Calculate token accrued by a supplier
     * @param token The token in which the supplier is interacting
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute token to
     */
    function distributeSupplierToken(address token, address cToken, address supplier) external {
        distributeSupplierTokenInternal(token, cToken, supplier);
    }

    /**
     * @notice Calculate token accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute COMP to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerToken(address token, address cToken, address borrower, uint marketBorrowIndex) external {
        distributeBorrowerTokenInternal(token, cToken, borrower, marketBorrowIndex);
    }

    /**
     * @notice Claim all the tokens accrued by the holders
     * @param holders The addresses to claim tokens for
     * @param cTokens The list of markets to claim tokens in
     * @param tokens The list of tokens to claim
     * @param borrowers Whether or not to claim tokens earned by borrowing
     * @param suppliers Whether or not to claim tokens earned by supplying
     */
    function claimToken(address[] memory holders, CToken[] memory cTokens, address[] memory tokens, bool borrowers, bool suppliers) public {
        for (uint t = 0; t < tokens.length; t++) {
            address token = tokens[t];
            for (uint i = 0; i < cTokens.length; i++) {
                CToken cToken = cTokens[i];
                require(markets[address(cToken)].isListed, "market must be listed");
                if (borrowers == true) {
                    uint borrowIndex = cToken.borrowIndex();
                    updateTokenBorrowIndexInternal(token, address(cToken), borrowIndex);
                    for (uint j = 0; j < holders.length; j++) {
                        distributeBorrowerTokenInternal(token, address(cToken), holders[j], borrowIndex);
                        farmStates[token].accrued[holders[j]] = grantTokenInternal(token, holders[j], farmStates[token].accrued[holders[j]]);
                    }
                }
                if (suppliers == true) {
                    updateTokenSupplyIndexInternal(token, address(cToken));
                    for (uint j = 0; j < holders.length; j++) {
                        distributeSupplierTokenInternal(token, address(cToken), holders[j]);
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
     * @param cToken The market whose token speed to update
     * @param newSpeed New token speed for market
     */
    function _setTokenSpeed(address token, CToken cToken, uint newSpeed) public {
        TokenFarmState storage state = farmStates[token];
        // require(isFarming(token), "token is not farming");
        uint currentTokenSpeed = state.speeds[address(cToken)];
        if (currentTokenSpeed != 0) {
            // note that token speed could be set to 0 to halt liquidity rewards for a market
            uint borrowIndex = cToken.borrowIndex();
            updateTokenSupplyIndexInternal(token, address(cToken));
            updateTokenBorrowIndexInternal(token, address(cToken), borrowIndex);
        } else if (newSpeed != 0) {
            // Add the token farming market
            Market storage market = markets[address(cToken)];
            require(market.isListed == true, "market is not listed");

            if (state.supplyState[address(cToken)].index == 0 && state.supplyState[address(cToken)].block == 0) {
                state.supplyState[address(cToken)] = CompMarketState({
                    index: compInitialIndex,
                    block: state.startBlock
                });
            }

            if (state.borrowState[address(cToken)].index == 0 && state.borrowState[address(cToken)].block == 0) {
                state.borrowState[address(cToken)] = CompMarketState({
                    index: compInitialIndex,
                    block: state.startBlock
                });
            }
        }

        if (currentTokenSpeed != newSpeed) {
            state.speeds[address(cToken)] = newSpeed;
            emit TokenSpeedUpdated(token, cToken, newSpeed);
        }
    }



    /*** MOMA Farming Internal Functions ***/

    /**
     * @notice Accrue MOMA to the market by updating the supply index
     * @param cToken The market whose supply index to update
     */
    function updateMomaSupplyIndexInternal(address cToken) internal {
        uint blockNumber = getBlockNumber();
        CompMarketState storage supplyState = momaSupplyState[cToken];
        if (blockNumber > uint(supplyState.block) && blockNumber > uint(momaStartBlock) && supplyState.block < momaEndBlock) {
            uint supplySpeed = momaSpeeds[cToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(momaEndBlock)) endNumber = uint(momaEndBlock);
            uint deltaBlocks = sub_(endNumber, uint(supplyState.block)); // deltaBlocks will always > 0
            if (supplySpeed > 0) {
                uint supplyTokens = CToken(cToken).totalSupply();
                uint momaAccrued = mul_(deltaBlocks, supplySpeed);
                Double memory ratio = supplyTokens > 0 ? fraction(momaAccrued, supplyTokens) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: supplyState.index}), ratio);
                momaSupplyState[cToken] = CompMarketState({
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
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMomaBorrowIndexInternal(address cToken, uint marketBorrowIndex) internal {
        uint blockNumber = getBlockNumber();
        CompMarketState storage borrowState = momaBorrowState[cToken];
        if (blockNumber > uint(borrowState.block) && blockNumber > uint(momaStartBlock) && borrowState.block < momaEndBlock) {
            uint borrowSpeed = momaSpeeds[cToken];
            uint endNumber = blockNumber;
            if (blockNumber > uint(momaEndBlock)) endNumber = uint(momaEndBlock);
            uint deltaBlocks = sub_(endNumber, uint(borrowState.block)); // deltaBlocks will always > 0
            if (borrowSpeed > 0) {
                uint borrowAmount = div_(CToken(cToken).totalBorrows(), Exp({mantissa: marketBorrowIndex}));
                uint momaAccrued = mul_(deltaBlocks, borrowSpeed);
                Double memory ratio = borrowAmount > 0 ? fraction(momaAccrued, borrowAmount) : Double({mantissa: 0});
                Double memory index = add_(Double({mantissa: borrowState.index}), ratio);
                momaBorrowState[cToken] = CompMarketState({
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
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMomaInternal(address cToken, address supplier) internal {
        CompMarketState storage supplyState = momaSupplyState[cToken];
        Double memory supplyIndex = Double({mantissa: supplyState.index});
        Double memory supplierIndex = Double({mantissa: momaSupplierIndex[cToken][supplier]});
        momaSupplierIndex[cToken][supplier] = supplyIndex.mantissa;

        if (supplyIndex.mantissa > 0) {
            if (supplierIndex.mantissa == 0 || supplierIndex.mantissa > supplyIndex.mantissa) {
                supplierIndex.mantissa = compInitialIndex;
            }
        }

        if (supplyIndex.mantissa > supplierIndex.mantissa) {
            Double memory deltaIndex = sub_(supplyIndex, supplierIndex);
            uint supplierTokens = CToken(cToken).balanceOf(supplier);
            uint supplierDelta = mul_(supplierTokens, deltaIndex);
            uint supplierAccrued = add_(momaAccrued[supplier], supplierDelta);
            momaAccrued[supplier] = supplierAccrued;
            emit DistributedSupplierMoma(CToken(cToken), supplier, supplierDelta, supplyIndex.mantissa);
        }
    }

    /**
     * @notice Calculate MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMomaInternal(address cToken, address borrower, uint marketBorrowIndex) internal {
        CompMarketState storage borrowState = momaBorrowState[cToken];
        Double memory borrowIndex = Double({mantissa: borrowState.index});
        Double memory borrowerIndex = Double({mantissa: momaBorrowerIndex[cToken][borrower]});
        momaBorrowerIndex[cToken][borrower] = borrowIndex.mantissa;

        // when updated farm token, borrowerIndex should be set to initial
        if (borrowerIndex.mantissa > borrowIndex.mantissa) {
            borrowerIndex.mantissa = compInitialIndex;
        }

        if (borrowerIndex.mantissa > 0 && borrowIndex.mantissa > borrowerIndex.mantissa) {
            Double memory deltaIndex = sub_(borrowIndex, borrowerIndex);
            uint borrowerAmount = div_(CToken(cToken).borrowBalanceStored(borrower), Exp({mantissa: marketBorrowIndex}));
            uint borrowerDelta = mul_(borrowerAmount, deltaIndex);
            uint borrowerAccrued = add_(momaAccrued[borrower], borrowerDelta);
            momaAccrued[borrower] = borrowerAccrued;
            emit DistributedBorrowerMoma(CToken(cToken), borrower, borrowerDelta, borrowIndex.mantissa);
        }
    }

    /**
     * @notice Ask factory to transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, factory do not perform the transfer all.
     * @param cToken The market to claim MOMA in
     * @param user The address of the user to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     * @return The amount of MOMA which was NOT transferred to the user
     */
    function grantMomaInternal(CToken cToken, address user, uint amount) internal returns (uint) {
        return MomaFactoryInterface(factory).claim(address(cToken), user, amount);
    }

    /**
      * @notice Reset all moma market state
      */
    function _resetMomaState() internal {
        for (uint i = 0; i < allMarkets.length; i++) {
            address market = address(allMarkets[i]);
            if (momaSpeeds[market] != 0) {
                momaSupplyState[market] = CompMarketState({
                    index: compInitialIndex,
                    block: momaStartBlock
                });
                momaBorrowState[market] = CompMarketState({
                    index: compInitialIndex,
                    block: momaStartBlock
                });
            }
        }
    }


    /*** MOMA Farming Called Functions ***/

    /**
     * @notice Accrue MOMA to the market by updating the supply index
     * @param cToken The market whose supply index to update
     */
    function updateMomaSupplyIndex(address cToken) external {
        updateMomaSupplyIndexInternal(cToken);
    }

    /**
     * @notice Accrue MOMA to the market by updating the borrow index
     * @param cToken The market whose borrow index to update
     * @param marketBorrowIndex The market borrow index
     */
    function updateMomaBorrowIndex(address cToken, uint marketBorrowIndex) external {
        updateMomaBorrowIndexInternal(cToken, marketBorrowIndex);
    }

    /**
     * @notice Calculate MOMA accrued by a supplier
     * @param cToken The market in which the supplier is interacting
     * @param supplier The address of the supplier to distribute MOMA to
     */
    function distributeSupplierMoma(address cToken, address supplier) external {
        distributeSupplierMomaInternal(cToken, supplier);
    }

    /**
     * @notice Calculate MOMA accrued by a borrower
     * @dev Borrowers will not begin to accrue until after the first interaction with the protocol.
     * @param cToken The market in which the borrower is interacting
     * @param borrower The address of the borrower to distribute MOMA to
     * @param marketBorrowIndex The market borrow index
     */
    function distributeBorrowerMoma(address cToken, address borrower, uint marketBorrowIndex) external {
        distributeBorrowerMomaInternal(cToken, borrower, marketBorrowIndex);
    }

    /**
     * @notice Claim all MOMA accrued by the holders
     * @param holders The addresses to claim MOMA for
     * @param cTokens The list of markets to claim MOMA in
     * @param borrowers Whether or not to claim MOMA earned by borrowing
     * @param suppliers Whether or not to claim MOMA earned by supplying
     */
    function claimMoma(address[] memory holders, CToken[] memory cTokens, bool borrowers, bool suppliers) public {
        for (uint i = 0; i < cTokens.length; i++) {
            CToken cToken = cTokens[i];
            require(markets[address(cToken)].isListed, "market must be listed");
            if (borrowers == true) {
                uint borrowIndex = cToken.borrowIndex();
                updateMomaBorrowIndexInternal(address(cToken), borrowIndex);
                for (uint j = 0; j < holders.length; j++) {
                    distributeBorrowerMomaInternal(address(cToken), holders[j], borrowIndex);
                    momaAccrued[holders[j]] = grantMomaInternal(cToken, holders[j], momaAccrued[holders[j]]);
                }
            }
            if (suppliers == true) {
                updateMomaSupplyIndexInternal(address(cToken));
                for (uint j = 0; j < holders.length; j++) {
                    distributeSupplierMomaInternal(address(cToken), holders[j]);
                    momaAccrued[holders[j]] = grantMomaInternal(cToken, holders[j], momaAccrued[holders[j]]);
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
     * @param cToken The market whose MOMA speed to update
     * @param momaSpeed New MOMA speed for market
     * @return uint 0=success, otherwise a failure
     */
    function _setMomaSpeed(CToken cToken, uint momaSpeed) external returns (uint) {
        // require(address(momaToken) != address(0), "moma token not added");
        uint currentMomaSpeed = momaSpeeds[address(cToken)];
        if (currentMomaSpeed != 0) {
            // note that MOMA speed could be set to 0 to halt liquidity rewards for a market
            uint borrowIndex = cToken.borrowIndex();
            updateMomaSupplyIndexInternal(address(cToken));
            updateMomaBorrowIndexInternal(address(cToken), borrowIndex);
        } else if (momaSpeed != 0) {
            // Add the MOMA market
            Market storage market = markets[address(cToken)];
            require(market.isListed == true, "moma market is not listed");

            if (momaSupplyState[address(cToken)].index == 0 && momaSupplyState[address(cToken)].block == 0) {
                momaSupplyState[address(cToken)] = CompMarketState({
                    index: compInitialIndex,
                    block: momaStartBlock
                });
            }

            if (momaBorrowState[address(cToken)].index == 0 && momaBorrowState[address(cToken)].block == 0) {
                momaBorrowState[address(cToken)] = CompMarketState({
                    index: compInitialIndex,
                    block: momaStartBlock
                });
            }
        }

        if (currentMomaSpeed != momaSpeed) {
            momaSpeeds[address(cToken)] = momaSpeed;
            emit MomaSpeedUpdated(cToken, momaSpeed);
        }

        return uint(Error.NO_ERROR);
    }

    function getBlockNumber() public view returns (uint) {
        return block.number;
    }
}
