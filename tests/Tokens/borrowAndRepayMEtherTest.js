const {
  etherGasCost,
  etherUnsigned,
  etherMantissa,
  UInt256Max
} = require('../Utils/Ethereum');

const {
  makeMToken,
  borrowSnapshot,
  totalBorrows,
  fastForward,
  pretendBorrow,
  setEtherBalance,
  getBalances,
  adjustBalances
} = require('../Utils/Moma');

const BigNumber = require('bignumber.js');

const borrowAmount = etherUnsigned(10e3);
const repayAmount = etherUnsigned(10e2);

async function preBorrow(mToken, borrower, borrowAmount) {
  await send(mToken.momaPool, 'setBorrowAllowed', [true]);
  await send(mToken.momaPool, 'setBorrowVerify', [true]);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mToken, 'harnessSetFailTransferToAddress', [borrower, false]);
  await send(mToken, 'harnessSetAccountBorrows', [borrower, 0, 0]);
  await send(mToken, 'harnessSetTotalBorrows', [0]);
  await setEtherBalance(mToken, borrowAmount);
}

async function borrowFresh(mToken, borrower, borrowAmount) {
  return send(mToken, 'harnessBorrowFresh', [borrower, borrowAmount], {from: borrower});
}

async function borrow(mToken, borrower, borrowAmount, opts = {}) {
  await send(mToken, 'harnessFastForward', [1]);
  return send(mToken, 'borrow', [borrowAmount], {from: borrower});
}

async function preRepay(mToken, benefactor, borrower, repayAmount) {
  // setup either benefactor OR borrower for success in repaying
  await send(mToken.momaPool, 'setRepayBorrowAllowed', [true]);
  await send(mToken.momaPool, 'setRepayBorrowVerify', [true]);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await pretendBorrow(mToken, borrower, 1, 1, repayAmount);
}

async function repayBorrowFresh(mToken, payer, borrower, repayAmount) {
  return send(mToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer, value: repayAmount});
}

async function repayBorrow(mToken, borrower, repayAmount) {
  await send(mToken, 'harnessFastForward', [1]);
  return send(mToken, 'repayBorrow', [], {from: borrower, value: repayAmount});
}

async function repayBorrowBehalf(mToken, payer, borrower, repayAmount) {
  await send(mToken, 'harnessFastForward', [1]);
  return send(mToken, 'repayBorrowBehalf', [borrower], {from: payer, value: repayAmount});
}

describe('#MEther/borrowAndRepay', function () {
  let mToken, root, borrower, benefactor, accounts;
  beforeEach(async () => {
    [root, borrower, benefactor, ...accounts] = saddle.accounts;
    // mToken = await makeMToken({kind: 'mether', setInterestRateModel: true, boolMomaMaster: true});
    mToken = await makeMToken({kind: 'mether', contract: 'MEtherDelegator', implementation: 'MEtherDelegateHarness', 
                               setInterestRateModel: true, boolMomaMaster: true});
  });

  describe('borrowFresh', () => {
    beforeEach(async () => await preBorrow(mToken, borrower, borrowAmount));

    it("fails if momaPool tells it to", async () => {
      await send(mToken.momaPool, 'setBorrowAllowed', [false]);
      expect(await borrowFresh(mToken, borrower, borrowAmount)).toHaveTrollReject('BORROW_MOMAMASTER_REJECTION');
    });

    it("proceeds if momaPool tells it to", async () => {
      await expect(await borrowFresh(mToken, borrower, borrowAmount)).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(mToken);
      expect(await borrowFresh(mToken, borrower, borrowAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'BORROW_FRESHNESS_CHECK');
    });

    it("continues if fresh", async () => {
      await expect(await send(mToken, 'accrueInterest')).toSucceed();
      await expect(await borrowFresh(mToken, borrower, borrowAmount)).toSucceed();
    });

    it("fails if protocol has less than borrowAmount of underlying", async () => {
      expect(await borrowFresh(mToken, borrower, borrowAmount.plus(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
    });

    it("fails if borrowBalanceStored fails (due to non-zero stored principal with zero account index)", async () => {
      await pretendBorrow(mToken, borrower, 0, 3e18, 5e18);
      expect(await borrowFresh(mToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_ACCUMULATED_BALANCE_CALCULATION_FAILED');
    });

    it("fails if calculating account new total borrow balance overflows", async () => {
      await pretendBorrow(mToken, borrower, 1e-18, 1e-18, UInt256Max());
      expect(await borrowFresh(mToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
    });

    it("fails if calculation of new total borrow balance overflows", async () => {
      await send(mToken, 'harnessSetTotalBorrows', [UInt256Max()]);
      expect(await borrowFresh(mToken, borrower, borrowAmount)).toHaveTokenFailure('MATH_ERROR', 'BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED');
    });

    it("reverts if transfer out fails", async () => {
      await send(mToken, 'harnessSetFailTransferToAddress', [borrower, true]);
      await expect(borrowFresh(mToken, borrower, borrowAmount)).rejects.toRevert("revert TOKEN_TRANSFER_OUT_FAILED");
    });

    it("reverts if borrowVerify fails", async() => {
      await send(mToken.momaPool, 'setBorrowVerify', [false]);
      await expect(borrowFresh(mToken, borrower, borrowAmount)).rejects.toRevert("revert borrowVerify rejected borrow");
    });

    it("transfers the underlying cash, tokens, and emits Borrow event", async () => {
      const beforeBalances = await getBalances([mToken], [borrower]);
      const beforeProtocolBorrows = await totalBorrows(mToken);
      const result = await borrowFresh(mToken, borrower, borrowAmount);
      const afterBalances = await getBalances([mToken], [borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, 'eth', -borrowAmount],
        [mToken, 'borrows', borrowAmount],
        [mToken, borrower, 'eth', borrowAmount.minus(await etherGasCost(result))],
        [mToken, borrower, 'borrows', borrowAmount]
      ]));
      expect(result).toHaveLog('Borrow', {
        borrower: borrower,
        borrowAmount: borrowAmount.toString(),
        accountBorrows: borrowAmount.toString(),
        totalBorrows: beforeProtocolBorrows.plus(borrowAmount).toString()
      });
    });

    it("stores new borrow principal and interest index", async () => {
      const beforeProtocolBorrows = await totalBorrows(mToken);
      await pretendBorrow(mToken, borrower, 0, 3, 0);
      await borrowFresh(mToken, borrower, borrowAmount);
      const borrowSnap = await borrowSnapshot(mToken, borrower);
      expect(borrowSnap.principal).toEqualNumber(borrowAmount);
      expect(borrowSnap.interestIndex).toEqualNumber(etherMantissa(3));
      expect(await totalBorrows(mToken)).toEqualNumber(beforeProtocolBorrows.plus(borrowAmount));
    });
  });

  describe('borrow', () => {
    beforeEach(async () => await preBorrow(mToken, borrower, borrowAmount));

    it("emits a borrow failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await send(mToken, 'harnessFastForward', [1]);
      await expect(borrow(mToken, borrower, borrowAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from borrowFresh without emitting any extra logs", async () => {
      expect(await borrow(mToken, borrower, borrowAmount.plus(1))).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'BORROW_CASH_NOT_AVAILABLE');
    });

    it("returns success from borrowFresh and transfers the correct amount", async () => {
      const beforeBalances = await getBalances([mToken], [borrower]);
      await fastForward(mToken);
      const result = await borrow(mToken, borrower, borrowAmount);
      const afterBalances = await getBalances([mToken], [borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, 'eth', -borrowAmount],
        [mToken, 'borrows', borrowAmount],
        [mToken, borrower, 'eth', borrowAmount.minus(await etherGasCost(result))],
        [mToken, borrower, 'borrows', borrowAmount]
      ]));
    });
  });

  describe('repayBorrowFresh', () => {
    [true, false].forEach(async (benefactorPaying) => {
      let payer;
      const label = benefactorPaying ? "benefactor paying" : "borrower paying";
      describe(label, () => {
        beforeEach(async () => {
          payer = benefactorPaying ? benefactor : borrower;

          await preRepay(mToken, payer, borrower, repayAmount);
        });

        it("fails if repay is not allowed", async () => {
          await send(mToken.momaPool, 'setRepayBorrowAllowed', [false]);
          expect(await repayBorrowFresh(mToken, payer, borrower, repayAmount)).toHaveTrollReject('REPAY_BORROW_MOMAMASTER_REJECTION', 'MATH_ERROR');
        });

        it("fails if block number ≠ current block number", async () => {
          await fastForward(mToken);
          expect(await repayBorrowFresh(mToken, payer, borrower, repayAmount)).toHaveTokenFailure('MARKET_NOT_FRESH', 'REPAY_BORROW_FRESHNESS_CHECK');
        });

        it("returns an error if calculating account new account borrow balance fails", async () => {
          await pretendBorrow(mToken, borrower, 1, 1, 1);
          await expect(repayBorrowFresh(mToken, payer, borrower, repayAmount)).rejects.toRevert('revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED');
        });

        it("returns an error if calculation of new total borrow balance fails", async () => {
          await send(mToken, 'harnessSetTotalBorrows', [1]);
          await expect(repayBorrowFresh(mToken, payer, borrower, repayAmount)).rejects.toRevert('revert REPAY_BORROW_NEW_TOTAL_BALANCE_CALCULATION_FAILED');
        });

        it("reverts if checkTransferIn fails", async () => {
          await expect(
            send(mToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: root, value: repayAmount})
          ).rejects.toRevert("revert sender mismatch");
          await expect(
            send(mToken, 'harnessRepayBorrowFresh', [payer, borrower, repayAmount], {from: payer, value: 1})
          ).rejects.toRevert("revert value mismatch");
        });

        it("reverts if repayBorrowVerify fails", async() => {
          await send(mToken.momaPool, 'setRepayBorrowVerify', [false]);
          await expect(repayBorrowFresh(mToken, payer, borrower, repayAmount)).rejects.toRevert("revert repayBorrowVerify rejected repayBorrow");
        });

        it("transfers the underlying cash, and emits RepayBorrow event", async () => {
          const beforeBalances = await getBalances([mToken], [borrower]);
          const result = await repayBorrowFresh(mToken, payer, borrower, repayAmount);
          const afterBalances = await getBalances([mToken], [borrower]);
          expect(result).toSucceed();
          if (borrower == payer) {
            expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
              [mToken, 'eth', repayAmount],
              [mToken, 'borrows', -repayAmount],
              [mToken, borrower, 'borrows', -repayAmount],
              [mToken, borrower, 'eth', -repayAmount.plus(await etherGasCost(result))]
            ]));
          } else {
            expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
              [mToken, 'eth', repayAmount],
              [mToken, 'borrows', -repayAmount],
              [mToken, borrower, 'borrows', -repayAmount],
            ]));
          }
          expect(result).toHaveLog('RepayBorrow', {
            payer: payer,
            borrower: borrower,
            repayAmount: repayAmount.toString(),
            accountBorrows: "0",
            totalBorrows: "0"
          });
        });

        it("stores new borrow principal and interest index", async () => {
          const beforeProtocolBorrows = await totalBorrows(mToken);
          const beforeAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
          expect(await repayBorrowFresh(mToken, payer, borrower, repayAmount)).toSucceed();
          const afterAccountBorrows = await borrowSnapshot(mToken, borrower);
          expect(afterAccountBorrows.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
          expect(afterAccountBorrows.interestIndex).toEqualNumber(etherMantissa(1));
          expect(await totalBorrows(mToken)).toEqualNumber(beforeProtocolBorrows.minus(repayAmount));
        });
      });
    });
  });

  describe('repayBorrow', () => {
    beforeEach(async () => {
      await preRepay(mToken, borrower, borrower, repayAmount);
    });

    it("reverts if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(repayBorrow(mToken, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("reverts when repay borrow fresh fails", async () => {
      await send(mToken.momaPool, 'setRepayBorrowAllowed', [false]);
      await expect(repayBorrow(mToken, borrower, repayAmount)).rejects.toRevertWithError('MOMAMASTER_REJECTION', "revert repayBorrow failed");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(mToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
      expect(await repayBorrow(mToken, borrower, repayAmount)).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
    });

    it("reverts if overpaying", async () => {
      const beforeAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
      let tooMuch = new BigNumber(beforeAccountBorrowSnap.principal).plus(1);
      await expect(repayBorrow(mToken, borrower, tooMuch)).rejects.toRevert("revert REPAY_BORROW_NEW_ACCOUNT_BORROW_BALANCE_CALCULATION_FAILED");
      // await assert.toRevertWithError(repayBorrow(mToken, borrower, tooMuch), 'MATH_ERROR', "revert repayBorrow failed");
    });
  });

  describe('repayBorrowBehalf', () => {
    let payer;

    beforeEach(async () => {
      payer = benefactor;
      await preRepay(mToken, payer, borrower, repayAmount);
    });

    it("reverts if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(repayBorrowBehalf(mToken, payer, borrower, repayAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("reverts from within repay borrow fresh", async () => {
      await send(mToken.momaPool, 'setRepayBorrowAllowed', [false]);
      await expect(repayBorrowBehalf(mToken, payer, borrower, repayAmount)).rejects.toRevertWithError('MOMAMASTER_REJECTION', "revert repayBorrowBehalf failed");
    });

    it("returns success from repayBorrowFresh and repays the right amount", async () => {
      await fastForward(mToken);
      const beforeAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
      expect(await repayBorrowBehalf(mToken, payer, borrower, repayAmount)).toSucceed();
      const afterAccountBorrowSnap = await borrowSnapshot(mToken, borrower);
      expect(afterAccountBorrowSnap.principal).toEqualNumber(beforeAccountBorrowSnap.principal.minus(repayAmount));
    });
  });
});
