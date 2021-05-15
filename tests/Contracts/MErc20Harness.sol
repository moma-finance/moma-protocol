pragma solidity 0.5.17;

import "../../contracts/MErc20Immutable.sol";
import "../../contracts/MErc20Delegator.sol";
import "../../contracts/MErc20Delegate.sol";
import "./MomaMasterScenario.sol";

contract MErc20Harness is MErc20Immutable {
    uint blockNumber = 100000;
    uint harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping (address => bool) public failTransferToAddresses;

    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                // InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_)
    MErc20Immutable(
    underlying_,
    momaMaster_,
    // interestRateModel_,
    initialExchangeRateMantissa_,
    name_,
    symbol_,
    decimals_,
    feeReceiver_) public {}

    function doTransferOut(address payable to, uint amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function exchangeRateStoredInternal() internal view returns (MathError, uint) {
        if (harnessExchangeRateStored) {
            return (MathError.NO_ERROR, harnessExchangeRate);
        }
        return super.exchangeRateStoredInternal();
    }

    function getBlockNumber() internal view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(uint totalSupply_, uint totalBorrows_, uint totalReserves_, uint totalFees_, uint totalMomaFees_) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
        totalFees = totalFees_;
        totalMomaFees = totalMomaFees_;
    }

    function harnessSetExchangeRate(uint exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint mintAmount) public returns (uint) {
        (uint err,) = super.mintFresh(account, mintAmount);
        return err;
    }

    function harnessRedeemFresh(address payable account, uint cTokenAmount, uint underlyingAmount) public returns (uint) {
        return super.redeemFresh(account, cTokenAmount, underlyingAmount);
    }

    function harnessAccountBorrows(address account) public view returns (uint principal, uint interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        return borrowFresh(account, borrowAmount);
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err,) = repayBorrowFresh(payer, account, repayAmount);
        return err;
    }

    function harnessLiquidateBorrowFresh(address liquidator, address borrower, uint repayAmount, MToken mTokenCollateral) public returns (uint) {
        (uint err,) = liquidateBorrowFresh(liquidator, borrower, repayAmount, mTokenCollateral);
        return err;
    }

    function harnessReduceReservesFresh(uint amount) public returns (uint) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint newReserveFactorMantissa) public returns (uint) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint amount) public returns (uint) {
        return momaMaster.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract MErc20Scenario is MErc20Immutable {
    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                // InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_)
    MErc20Immutable(
    underlying_,
    momaMaster_,
    // interestRateModel_,
    initialExchangeRateMantissa_,
    name_,
    symbol_,
    decimals_,
    feeReceiver_) public {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockNumber() internal view returns (uint) {
        MomaMasterScenario momaMasterScenario = MomaMasterScenario(address(momaMaster));
        return momaMasterScenario.blockNumber();
    }
}

contract MEvil is MErc20Scenario {
    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                // InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_)
    MErc20Scenario(
    underlying_,
    momaMaster_,
    // interestRateModel_,
    initialExchangeRateMantissa_,
    name_,
    symbol_,
    decimals_,
    feeReceiver_) public {}

    function evilSeize(MToken treasure, address liquidator, address borrower, uint seizeTokens) public returns (uint) {
        return treasure.seize(liquidator, borrower, seizeTokens);
    }
}

contract MErc20DelegatorScenario is MErc20Delegator {
    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                // InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_,
                // address implementation_,
                bytes memory becomeImplementationData)
    MErc20Delegator(
    underlying_,
    momaMaster_,
    // interestRateModel_,
    initialExchangeRateMantissa_,
    name_,
    symbol_,
    decimals_,
    // implementation_,
    becomeImplementationData,
    feeReceiver_) public {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }
}

contract MErc20DelegateHarness is MErc20Delegate {
    event Log(string x, address y);
    event Log(string x, uint y);

    uint blockNumber = 100000;
    uint harnessExchangeRate;
    bool harnessExchangeRateStored;

    mapping (address => bool) public failTransferToAddresses;

    function exchangeRateStoredInternal() internal view returns (MathError, uint) {
        if (harnessExchangeRateStored) {
            return (MathError.NO_ERROR, harnessExchangeRate);
        }
        return super.exchangeRateStoredInternal();
    }

    function doTransferOut(address payable to, uint amount) internal {
        require(failTransferToAddresses[to] == false, "TOKEN_TRANSFER_OUT_FAILED");
        return super.doTransferOut(to, amount);
    }

    function getBlockNumber() internal view returns (uint) {
        return blockNumber;
    }

    function getBorrowRateMaxMantissa() public pure returns (uint) {
        return borrowRateMaxMantissa;
    }

    function harnessSetMomaMaster(MomaMasterInterface newMomaMaster) public {
        momaMaster = newMomaMaster;
    }

    function harnessSetBlockNumber(uint newBlockNumber) public {
        blockNumber = newBlockNumber;
    }

    function harnessFastForward(uint blocks) public {
        blockNumber += blocks;
    }

    function harnessSetBalance(address account, uint amount) external {
        accountTokens[account] = amount;
    }

    function harnessSetAccrualBlockNumber(uint _accrualblockNumber) public {
        accrualBlockNumber = _accrualblockNumber;
    }

    function harnessSetTotalSupply(uint totalSupply_) public {
        totalSupply = totalSupply_;
    }

    function harnessSetTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function harnessIncrementTotalBorrows(uint addtlBorrow_) public {
        totalBorrows = totalBorrows + addtlBorrow_;
    }

    function harnessSetTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function harnessExchangeRateDetails(uint totalSupply_, uint totalBorrows_, uint totalReserves_, uint totalFees_, uint totalMomaFees_) public {
        totalSupply = totalSupply_;
        totalBorrows = totalBorrows_;
        totalReserves = totalReserves_;
        totalFees = totalFees_;
        totalMomaFees = totalMomaFees_;
    }

    function harnessSetExchangeRate(uint exchangeRate) public {
        harnessExchangeRate = exchangeRate;
        harnessExchangeRateStored = true;
    }

    function harnessSetFailTransferToAddress(address _to, bool _fail) public {
        failTransferToAddresses[_to] = _fail;
    }

    function harnessMintFresh(address account, uint mintAmount) public returns (uint) {
        (uint err,) = super.mintFresh(account, mintAmount);
        return err;
    }

    function harnessRedeemFresh(address payable account, uint cTokenAmount, uint underlyingAmount) public returns (uint) {
        return super.redeemFresh(account, cTokenAmount, underlyingAmount);
    }

    function harnessAccountBorrows(address account) public view returns (uint principal, uint interestIndex) {
        BorrowSnapshot memory snapshot = accountBorrows[account];
        return (snapshot.principal, snapshot.interestIndex);
    }

    function harnessSetAccountBorrows(address account, uint principal, uint interestIndex) public {
        accountBorrows[account] = BorrowSnapshot({principal: principal, interestIndex: interestIndex});
    }

    function harnessSetBorrowIndex(uint borrowIndex_) public {
        borrowIndex = borrowIndex_;
    }

    function harnessBorrowFresh(address payable account, uint borrowAmount) public returns (uint) {
        return borrowFresh(account, borrowAmount);
    }

    function harnessRepayBorrowFresh(address payer, address account, uint repayAmount) public returns (uint) {
        (uint err,) = repayBorrowFresh(payer, account, repayAmount);
        return err;
    }

    function harnessLiquidateBorrowFresh(address liquidator, address borrower, uint repayAmount, MToken mTokenCollateral) public returns (uint) {
        (uint err,) = liquidateBorrowFresh(liquidator, borrower, repayAmount, mTokenCollateral);
        return err;
    }

    function harnessReduceReservesFresh(uint amount) public returns (uint) {
        return _reduceReservesFresh(amount);
    }

    function harnessSetReserveFactorFresh(uint newReserveFactorMantissa) public returns (uint) {
        return _setReserveFactorFresh(newReserveFactorMantissa);
    }

    function harnessSetInterestRateModelFresh(InterestRateModel newInterestRateModel) public returns (uint) {
        return _setInterestRateModelFresh(newInterestRateModel);
    }

    function harnessSetInterestRateModel(address newInterestRateModelAddress) public {
        interestRateModel = InterestRateModel(newInterestRateModelAddress);
    }

    function harnessCallBorrowAllowed(uint amount) public returns (uint) {
        return momaMaster.borrowAllowed(address(this), msg.sender, amount);
    }
}

contract MErc20DelegateScenario is MErc20Delegate {
    constructor() public {}

    function setTotalBorrows(uint totalBorrows_) public {
        totalBorrows = totalBorrows_;
    }

    function setTotalReserves(uint totalReserves_) public {
        totalReserves = totalReserves_;
    }

    function getBlockNumber() internal view returns (uint) {
        MomaMasterScenario momaMasterScenario = MomaMasterScenario(address(momaMaster));
        return momaMasterScenario.blockNumber();
    }
}

contract MErc20DelegateScenarioExtra is MErc20DelegateScenario {
    function iHaveSpoken() public pure returns (string memory) {
      return "i have spoken";
    }

    function itIsTheWay() public {
      feeReceiver = address(1); // make a change to test effect
    }

    function babyYoda() public pure {
      revert("protect the baby");
    }
}
