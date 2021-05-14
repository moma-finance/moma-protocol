pragma solidity 0.5.17;

import "../../contracts/MomaFarming.sol";


contract MomaFarmingHarness is MomaFarming {
    // uint public blockNumber;

    constructor(Moma _moma, MomaFactoryInterface _factory) MomaFarming(_moma, _factory) public {}

    function getMarketSupplyState(address pool, address mToken) public view returns (uint, uint) {
        MarketState memory state = marketStates[pool][mToken];
        return (state.supplyIndex, state.supplyBlock);
    }

    function getMarketBorrowState(address pool, address mToken) public view returns (uint, uint) {
        MarketState memory state = marketStates[pool][mToken];
        return (state.borrowIndex, state.borrowBlock);
    }

    function getMarketSupplierIndex(address pool, address mToken, address supplier) public view returns (uint) {
        return marketStates[pool][mToken].supplierIndex[supplier];
    }

    function getMarketBorrowerIndex(address pool, address mToken, address borrower) public view returns (uint) {
        return marketStates[pool][mToken].borrowerIndex[borrower];
    }

    function setMarketSupplyState(address pool, address mToken, uint index, uint blockNumber_) public {
        marketStates[pool][mToken].supplyIndex = index;
        marketStates[pool][mToken].supplyBlock = blockNumber_;
    }

    function setMarketBorrowState(address pool, address mToken, uint index, uint blockNumber_) public {
        marketStates[pool][mToken].borrowIndex = index;
        marketStates[pool][mToken].borrowBlock = blockNumber_;
    }

    function setMarketSupplierIndex(address pool, address mToken, address supplier, uint index) public {
        marketStates[pool][mToken].supplierIndex[supplier] = index;
    }

    function setMarketBorrowerIndex(address pool, address mToken, address borrower, uint index) public {
        marketStates[pool][mToken].borrowerIndex[borrower] = index;
    }

    function setMomaAccrued(address user, uint userAccrued) public {
        momaAccrued[user] = userAccrued;
    }

    function setMomaSpeed(uint newMomaSpeed) public {
        momaSpeed = newMomaSpeed;
    }

    function setFactory(MomaFactoryInterface newFactory) public {
        factory = newFactory;
    }

    function setMarketsWeight(address payable pool, MToken[] memory mTokens, uint[] memory newWeights) public {
        uint oldWeightTotal;
        uint newWeightTotal;
        // uint blockNumber = getBlockNumber();

        for (uint i = 0; i < mTokens.length; i++) {
            MToken mToken = mTokens[i];
            MarketState storage state = marketStates[pool][address(mToken)];

            if (!state.isMomaMarket) {
                state.isMomaMarket = true;
                momaMarkets[pool].push(mToken);

                state.supplyIndex = momaInitialIndex;
                state.borrowIndex = momaInitialIndex;
            }

            uint oldWeight = state.weight;
            oldWeightTotal = add_(oldWeightTotal, oldWeight);
            newWeightTotal = add_(newWeightTotal, newWeights[i]);

            state.weight = newWeights[i];
            // state.supplyBlock = blockNumber;
            // state.borrowBlock = blockNumber;
        }

        momaTotalWeight = add_(sub_(momaTotalWeight, oldWeightTotal), newWeightTotal);

        if (!isMomaPool[pool]) {
            isMomaPool[pool] = true;
            momaPools.push(MomaPool(pool));
            // if (isLendingPool(pool)) isMomaLendingPool[pool] = true;
        }
    }

    // function harnessFastForward(uint blocks) public returns (uint) {
    //     blockNumber += blocks;
    //     return blockNumber;
    // }

    // function setBlockNumber(uint number) public {
    //     blockNumber = number;
    // }

    // function getBlockNumber() public view returns (uint) {
    //     return blockNumber;
    // }
}


contract FalseMomaFarming {
    bool public constant isMomaFarming = false;
}
