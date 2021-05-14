pragma solidity 0.5.17;

import "../../contracts/MomaMaster.sol";

contract MomaMasterScenario is MomaMaster {
    uint public blockNumber;
    address public compAddress;

    constructor() MomaMaster() public {}

    function fastForward(uint blocks) public returns (uint) {
        blockNumber += blocks;
        return blockNumber;
    }

    function setCompAddress(address compAddress_) public {
        compAddress = compAddress_;
    }

    function getCompAddress() public view returns (address) {
        return compAddress;
    }

    function setBlockNumber(uint number) public {
        blockNumber = number;
    }

    function getBlockNumber() public view returns (uint) {
        return blockNumber;
    }

    function membershipLength(MToken cToken) public view returns (uint) {
        return accountAssets[address(cToken)].length;
    }

    function unlist(MToken cToken) public {
        markets[address(cToken)].isListed = false;
    }

    // /**
    //  * @notice Recalculate and update COMP speeds for all COMP markets
    //  */
    // function refreshCompSpeeds() public {
    //     MToken[] memory allMarkets_ = allMarkets;

    //     for (uint i = 0; i < allMarkets_.length; i++) {
    //         MToken cToken = allMarkets_[i];
    //         Exp memory borrowIndex = Exp({mantissa: cToken.borrowIndex()});
    //         updateCompSupplyIndex(address(cToken));
    //         updateCompBorrowIndex(address(cToken), borrowIndex);
    //     }

    //     Exp memory totalUtility = Exp({mantissa: 0});
    //     Exp[] memory utilities = new Exp[](allMarkets_.length);
    //     for (uint i = 0; i < allMarkets_.length; i++) {
    //         MToken cToken = allMarkets_[i];
    //         if (compSpeeds[address(cToken)] > 0) {
    //             Exp memory assetPrice = Exp({mantissa: oracle.getUnderlyingPrice(cToken)});
    //             Exp memory utility = mul_(assetPrice, cToken.totalBorrows());
    //             utilities[i] = utility;
    //             totalUtility = add_(totalUtility, utility);
    //         }
    //     }

    //     for (uint i = 0; i < allMarkets_.length; i++) {
    //         MToken cToken = allMarkets[i];
    //         uint newSpeed = totalUtility.mantissa > 0 ? mul_(compRate, div_(utilities[i], totalUtility)) : 0;
    //         setCompSpeedInternal(cToken, newSpeed);
    //     }
    // }
}
