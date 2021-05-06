pragma solidity ^0.5.16;

import "../../contracts/InterestRateModel.sol";

/**
  * @title An Interest Rate Model for tests that can be instructed to return a failure instead of doing a calculation
  * @author Compound
  */
contract InterestRateModelHarness is InterestRateModel {
    uint public constant opaqueBorrowFailureCode = 20;
    bool public failBorrowRate;
    uint public borrowRate;

    constructor(uint borrowRate_) public {
        borrowRate = borrowRate_;
    }

    function setFailBorrowRate(bool failBorrowRate_) public {
        failBorrowRate = failBorrowRate_;
    }

    function setBorrowRate(uint borrowRate_) public {
        borrowRate = borrowRate_;
    }

    function getBorrowRate(uint _cash, uint _borrows, uint _reserves, uint _fees, uint _momaFees) public view returns (uint) {
        _cash;     // unused
        _borrows;  // unused
        _reserves; // unused
        _fees; // unused
        _momaFees; // unused
        require(!failBorrowRate, "INTEREST_RATE_MODEL_ERROR");
        return borrowRate;
    }

    function getSupplyRate(uint _cash, uint _borrows, uint _reserves, uint _reserveFactor, uint _fees, uint _feesFactor, uint _momaFees, uint _momaFeesFactor) external view returns (uint) {
        _cash;     // unused
        _borrows;  // unused
        _reserves; // unused
        _fees; // unused
        _momaFees; // unused
        return borrowRate * (1 - _reserveFactor - _feesFactor - _momaFeesFactor);
    }
}