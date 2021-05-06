const {
  etherMantissa,
  etherUnsigned,
  UInt256Max,
  address,
  mergeInterface
} = require('../Utils/Ethereum');
const {
  makeMToken,
  setBorrowRate
} = require('../Utils/Moma');

const blockNumber = 2e7;
const borrowIndex = 1e18;
const borrowRate = .000001;

async function pretendBlock(mToken, accrualBlock = blockNumber, deltaBlocks = 1) {
  await send(mToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
  await send(mToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber + deltaBlocks)]);
  await send(mToken, 'harnessSetBorrowIndex', [etherUnsigned(borrowIndex)]);
}

async function preAccrue(mToken) {
  await setBorrowRate(mToken, borrowRate);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 0, 0]);
}

describe('#MToken/accureInterest', () => {
  let root, accounts;
  let mToken, underlying;
  
  ['merc20', 'mether'].forEach(async (type) => {
    describe(type, () => {
      beforeEach(async () => {
        [root, ...accounts] = saddle.accounts;
        if (type == 'merc20') {
          mToken = await makeMToken({kind: 'merc20', contract: 'MErc20Delegator', implementation: 'MErc20DelegateHarness', 
                                      setInterestRateModel: true, boolMomaMaster: true});
          underlying = mToken.underlying._address;
        } else {
          mToken = await makeMToken({kind: 'mether', contract: 'MEtherDelegator', implementation: 'MEtherDelegateHarness', 
                                      setInterestRateModel: true, boolMomaMaster: true});
          underlying = address(1);
        }
        await preAccrue(mToken);
      });

      it('reverts if the moma fee factor is absurdly high', async () => {
        await pretendBlock(mToken, blockNumber, 1);
        const fct = await deploy('MomaFactoryHarness');
        await send(mToken.momaPool.factory, '_setPendingImplementation', [fct._address]);
        await send(fct, '_become', [mToken.momaPool.factory._address]);
        mergeInterface(mToken.momaPool.factory, fct);
        await send(mToken.momaPool.factory, 'harnessSetTokenFeeFactor', [underlying, etherMantissa(1.1)]);
        expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(etherMantissa(1.1));
        await expect(send(mToken, 'accrueInterest')).rejects.toRevert("revert moma fee factor is absurdly high");
      });

      it('fails if new borrow rate calculation fails', async () => {
        await pretendBlock(mToken, blockNumber, 1);
        await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(send(mToken, 'accrueInterest')).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it('reverts if the interest rate is absurdly high', async () => {
        await pretendBlock(mToken, blockNumber, 1);
        expect(await call(mToken, 'getBorrowRateMaxMantissa')).toEqualNumber(etherMantissa(0.000005)); // 0.0005% per block
        await setBorrowRate(mToken, 0.001e-2); // 0.0010% per block
        await expect(send(mToken, 'accrueInterest')).rejects.toRevert("revert borrow rate is absurdly high");
      });

      it('reverts if could not calculate block delta', async () => {
        await pretendBlock(mToken, blockNumber, -1);
        await expect(send(mToken, 'accrueInterest')).rejects.toRevert("revert could not calculate block delta");
      });

      it('fails if simple interest factor calculation fails', async () => {
        await pretendBlock(mToken, blockNumber, 5e70);
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_SIMPLE_INTEREST_FACTOR_CALCULATION_FAILED');
      });

      it('fails if interest accumulated calculation fails', async () => {
        await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
        await pretendBlock(mToken)
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_ACCUMULATED_INTEREST_CALCULATION_FAILED');
      });

      it('fails if new total borrows calculation fails', async () => {
        await setBorrowRate(mToken, 1e-18);
        await pretendBlock(mToken)
        await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_BORROWS_CALCULATION_FAILED');
      });

      it('fails if interest accumulated for reserves calculation fails', async () => {
        await setBorrowRate(mToken, .000001);
        await send(mToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e30), UInt256Max(), 0, 0]);
        await send(mToken, 'harnessSetReserveFactorFresh', [etherUnsigned(1e10)]);
        await pretendBlock(mToken, blockNumber, 5e20)
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
      });

      it('fails if new total reserves calculation fails', async () => {
        await setBorrowRate(mToken, 1e-18);
        await send(mToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e56), UInt256Max(), 0, 0]);
        await send(mToken, 'harnessSetReserveFactorFresh', [etherUnsigned(1e17)]);
        await pretendBlock(mToken)
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_RESERVES_CALCULATION_FAILED');
      });

      it('fails if new total fees calculation fails', async () => {
        await setBorrowRate(mToken, 1e-18);
        await send(mToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e56), 0, UInt256Max(), 0]);
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.1));
        await pretendBlock(mToken)
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_FEES_CALCULATION_FAILED');
      });

      it('fails if new total moma fees calculation fails', async () => {
        await setBorrowRate(mToken, 1e-18);
        await send(mToken, 'harnessExchangeRateDetails', [0, etherUnsigned(1e56), 0, 0, UInt256Max()]);
        await send(mToken.momaPool.factory, 'setTokenFeeFactor', [underlying, etherMantissa(0.1)]);
        expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(etherMantissa(0.1));
        await pretendBlock(mToken)
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_TOTAL_MOMA_FEES_CALCULATION_FAILED');
      });

      it('fails if new borrow index calculation fails', async () => {
        await pretendBlock(mToken, blockNumber, 5e60);
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
      });

      it('fails if new borrow interest index calculation fails', async () => {
        await pretendBlock(mToken)
        await send(mToken, 'harnessSetBorrowIndex', [UInt256Max()]);
        expect(await send(mToken, 'accrueInterest')).toHaveTokenFailure('MATH_ERROR', 'ACCRUE_INTEREST_NEW_BORROW_INDEX_CALCULATION_FAILED');
      });

      it('succeeds and saves updated values in storage on success', async () => {
        const startingTotalBorrows = 1e22;
        const startingTotalReserves = 1e20;
        const startingTotalFees = 1e20;
        const startingTotalMomaFees = 1e20;
        const reserveFactor = 1e17;
        const feeFactor = 1e17;
        const momaFeeFactor = 2e17;

        await send(mToken, 'harnessExchangeRateDetails', [0, startingTotalBorrows, startingTotalReserves, startingTotalFees, startingTotalMomaFees].map(etherUnsigned));
        await send(mToken, 'harnessSetReserveFactorFresh', [etherUnsigned(reserveFactor)]);
        await send(mToken.momaPool.factory, 'setTokenFeeFactor', [underlying, etherUnsigned(momaFeeFactor)]);
        expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(momaFeeFactor);
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(feeFactor);
        await pretendBlock(mToken)

        const expectedAccrualBlockNumber = blockNumber + 1;
        const expectedBorrowIndex = borrowIndex + borrowIndex * borrowRate;
        const expectedTotalBorrows = startingTotalBorrows + startingTotalBorrows * borrowRate;
        const expectedTotalReserves = startingTotalReserves + startingTotalBorrows *  borrowRate * reserveFactor / 1e18;
        const expectedTotalFees = startingTotalFees + startingTotalBorrows *  borrowRate * feeFactor / 1e18;
        const expectedTotalMomaFees = startingTotalMomaFees + startingTotalBorrows *  borrowRate * momaFeeFactor / 1e18;

        const receipt = await send(mToken, 'accrueInterest')
        expect(receipt).toSucceed();
        expect(receipt).toHaveLog('AccrueInterest', {
          cashPrior: 0,
          interestAccumulated: etherUnsigned(expectedTotalBorrows).minus(etherUnsigned(startingTotalBorrows)).toFixed(),
          borrowIndex: etherUnsigned(expectedBorrowIndex).toFixed(),
          totalBorrows: etherUnsigned(expectedTotalBorrows).toFixed()
        })
        expect(await call(mToken, 'accrualBlockNumber')).toEqualNumber(expectedAccrualBlockNumber);
        expect(await call(mToken, 'borrowIndex')).toEqualNumber(expectedBorrowIndex);
        expect(await call(mToken, 'totalBorrows')).toEqualNumber(expectedTotalBorrows);
        expect(await call(mToken, 'totalReserves')).toEqualNumber(expectedTotalReserves);
        expect(await call(mToken, 'totalFees')).toEqualNumber(expectedTotalFees);
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(expectedTotalMomaFees);
      });
    });
  });
});
