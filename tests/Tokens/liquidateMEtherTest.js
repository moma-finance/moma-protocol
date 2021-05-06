const {
  etherGasCost,
  etherUnsigned,
  UInt256Max,
  getBlock,
  blockNumber
} = require('../Utils/Ethereum');

const {
  makeMToken,
  fastForward,
  setBalance,
  getBalances,
  adjustBalances,
  pretendBorrow
} = require('../Utils/Moma');

const repayAmount = etherUnsigned(10e2);
const seizeAmount = repayAmount;
const seizeTokens = seizeAmount.multipliedBy(4); // forced

async function preLiquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral) {
  // setup for success in liquidating
  await send(mToken.momaPool, 'setLiquidateBorrowAllowed', [true]);
  await send(mToken.momaPool, 'setLiquidateBorrowVerify', [true]);
  await send(mToken.momaPool, 'setRepayBorrowAllowed', [true]);
  await send(mToken.momaPool, 'setRepayBorrowVerify', [true]);
  await send(mToken.momaPool, 'setSeizeAllowed', [true]);
  await send(mToken.momaPool, 'setSeizeVerify', [true]);
  await send(mToken.momaPool, 'setFailCalculateSeizeTokens', [false]);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mTokenCollateral.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mTokenCollateral.momaPool, 'setCalculatedSeizeTokens', [seizeTokens]);
  const tx = await send(mTokenCollateral, 'harnessSetBalance', [liquidator, 0]);
  await setBalance(mTokenCollateral, liquidator, 0);
  await setBalance(mTokenCollateral, borrower, seizeTokens);
  await pretendBorrow(mTokenCollateral, borrower, 0, 1, 0);
  await pretendBorrow(mToken, borrower, 1, 1, repayAmount);
}

async function liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral) {
  return send(mToken, 'harnessLiquidateBorrowFresh', [liquidator, borrower, repayAmount, mTokenCollateral._address], 
              {from: liquidator, value: repayAmount});
}

async function liquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral) {
  // make sure to have a block delta so we accrue interest
  await fastForward(mToken, 1);
  await fastForward(mTokenCollateral, 1);
  return send(mToken, 'liquidateBorrow', [borrower, mTokenCollateral._address], {value: repayAmount, from: liquidator});
}

async function seize(mToken, liquidator, borrower, seizeAmount) {
  return send(mToken, 'seize', [liquidator, borrower, seizeAmount]);
}

describe('#MEther/liquidate', function () {
  let root, liquidator, borrower, accounts;
  let mToken, mTokenCollateral;

  beforeEach(async () => {
    [root, liquidator, borrower, ...accounts] = saddle.accounts;
    mToken = await makeMToken({kind: 'mether', contract: 'MEtherDelegator', implementation: 'MEtherDelegateHarness', 
                               setInterestRateModel: true, boolMomaMaster: true});
    mTokenCollateral = await makeMToken({momaPool: mToken.momaPool, implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
  });

  beforeEach(async () => {
    await preLiquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral);
  });

  describe('liquidateBorrowFresh', () => {
    it("fails if momaPool tells it to", async () => {
      await send(mToken.momaPool, 'setLiquidateBorrowAllowed', [false]);
      expect(
        await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).toHaveTrollReject('LIQUIDATE_MOMAMASTER_REJECTION', 'MATH_ERROR');
    });

    it("proceeds if momaPool tells it to", async () => {
      expect(
        await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).toSucceed();
    });

    it("fails if market not fresh", async () => {
      await fastForward(mToken);
      expect(
        await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_FRESHNESS_CHECK');
    });

    it("fails if collateral market not fresh", async () => {
      await fastForward(mToken);
      await fastForward(mTokenCollateral);
      await send(mToken, 'accrueInterest');
      expect(
        await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).toHaveTokenFailure('MARKET_NOT_FRESH', 'LIQUIDATE_COLLATERAL_FRESHNESS_CHECK');
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(
        await liquidateFresh(mToken, borrower, borrower, repayAmount, mTokenCollateral)
      ).toHaveTokenFailure('INVALID_ACCOUNT_PAIR', 'LIQUIDATE_LIQUIDATOR_IS_BORROWER');
    });

    it("fails if repayAmount = 0", async () => {
      expect(await liquidateFresh(mToken, liquidator, borrower, 0, mTokenCollateral)
      ).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_ZERO');
    });

    it("fails if repayAmount = uint(-1)", async () => {
      expect(await send(mToken, 'harnessLiquidateBorrowFresh', [liquidator, borrower, UInt256Max(), mTokenCollateral._address])
      ).toHaveTokenFailure('INVALID_CLOSE_AMOUNT_REQUESTED', 'LIQUIDATE_CLOSE_AMOUNT_IS_UINT_MAX');
    });

    it("fails if calculating seize tokens fails and does not adjust balances", async () => {
      const beforeBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      await send(mToken.momaPool, 'setFailCalculateSeizeTokens', [true]);
      await expect(
        send(mToken, 'harnessLiquidateBorrowFresh', [liquidator, borrower, repayAmount, mTokenCollateral._address], 
        {from: liquidator, value: repayAmount, gasPrice: 1})
      ).rejects.toRevert('revert LIQUIDATE_MOMAMASTER_CALCULATE_AMOUNT_SEIZE_FAILED');
      const afterBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      const blk = await getBlock(await blockNumber());
      const tx = await web3.eth.getTransactionReceipt(blk.transactions[0].hash);
      const gasCost = +tx.gasUsed;
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, liquidator, 'eth', -gasCost],
        [mTokenCollateral, liquidator, 'eth', -gasCost],
      ]));
    });

    it("fails if borrower collateral token balance < seizeTokens", async () => {
      await setBalance(mTokenCollateral, borrower, seizeTokens.minus(1));
      await expect(
        liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).rejects.toRevert('revert LIQUIDATE_SEIZE_TOO_MUCH');
    });

    it("fails if repay fails", async () => {
      await send(mToken.momaPool, 'setRepayBorrowAllowed', [false]);
      expect(
        await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).toHaveTrollReject('LIQUIDATE_REPAY_BORROW_FRESH_FAILED');
    });

    it("reverts if seize fails", async () => {
      await send(mToken.momaPool, 'setSeizeAllowed', [false]);
      await expect(
        liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).rejects.toRevert("revert token seizure failed");
    });

    it("reverts if liquidateBorrowVerify fails", async() => {
      await send(mToken.momaPool, 'setLiquidateBorrowVerify', [false]);
      await expect(
        liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
      ).rejects.toRevert("revert liquidateBorrowVerify rejected liquidateBorrow");
    });

    it("transfers the cash, borrows, tokens, and emits Transfer, LiquidateBorrow events", async () => {
      const beforeBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      const result = await liquidateFresh(mToken, liquidator, borrower, repayAmount, mTokenCollateral);
      const gasCost = await etherGasCost(result);
      const afterBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog('LiquidateBorrow', {
        liquidator: liquidator,
        borrower: borrower,
        repayAmount: repayAmount.toString(),
        mTokenCollateral: mTokenCollateral._address,
        seizeTokens: seizeTokens.toString()
      });
      expect(result).toHaveLog(['Transfer', 0], {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, 'eth', repayAmount],
        [mToken, 'borrows', -repayAmount],
        [mToken, liquidator, 'eth', -repayAmount-gasCost],
        [mTokenCollateral, liquidator, 'tokens', seizeTokens],
        [mToken, borrower, 'borrows', -repayAmount],
        [mTokenCollateral, borrower, 'tokens', -seizeTokens],
        [mTokenCollateral, liquidator, 'eth', -repayAmount-gasCost],
      ]));
    });
  });

  describe('liquidateBorrow', () => {
    it("emits a liquidation failure if borrowed asset interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
        ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("emits a liquidation failure if collateral asset interest accrual fails", async () => {
      await send(mTokenCollateral.interestRateModel, 'setFailBorrowRate', [true]);
      await expect(liquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral)
        ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("reverts error from liquidateBorrowFresh without emitting any extra logs", async () => {
      await expect(
        liquidate(mToken, liquidator, borrower, 0, mTokenCollateral)
      ).rejects.toRevert("revert liquidateBorrow failed (07)");
    });

    it("returns success from liquidateBorrowFresh and transfers the correct amounts", async () => {
      const beforeBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      const result = await liquidate(mToken, liquidator, borrower, repayAmount, mTokenCollateral);
      const gasCost = await etherGasCost(result);
      const afterBalances = await getBalances([mToken, mTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, 'eth', repayAmount],
        [mToken, 'borrows', -repayAmount],
        [mToken, liquidator, 'eth', -gasCost-repayAmount],
        [mTokenCollateral, liquidator, 'eth', -gasCost-repayAmount],
        [mTokenCollateral, liquidator, 'tokens', seizeTokens],
        [mToken, borrower, 'borrows', -repayAmount],
        [mTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });

  describe('seize', () => {
    // XXX verify callers are properly checked

    it("fails if seize is not allowed", async () => {
      await send(mToken.momaPool, 'setSeizeAllowed', [false]);
      expect(await seize(mTokenCollateral, liquidator, borrower, seizeTokens)
        ).toHaveTrollReject('LIQUIDATE_SEIZE_MOMAMASTER_REJECTION', 'MATH_ERROR');
    });

    it("fails if borrower is equal to liquidator", async () => {
      expect(await seize(mTokenCollateral, borrower, borrower, seizeTokens)
        ).toHaveTokenFailure('INVALID_ACCOUNT_PAIR', 'LIQUIDATE_SEIZE_LIQUIDATOR_IS_BORROWER');
    });

    it("fails if mTokenBalances[borrower] < amount", async () => {
      await setBalance(mTokenCollateral, borrower, 1);
      expect(await seize(mTokenCollateral, liquidator, borrower, seizeTokens)
        ).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_DECREMENT_FAILED', 'INTEGER_UNDERFLOW');
    });

    it("fails if mTokenBalances[liquidator] overflows", async () => {
      await setBalance(mTokenCollateral, liquidator, UInt256Max());
      expect(await seize(mTokenCollateral, liquidator, borrower, seizeTokens)
        ).toHaveTokenMathFailure('LIQUIDATE_SEIZE_BALANCE_INCREMENT_FAILED', 'INTEGER_OVERFLOW');
    });

    it("succeeds, updates balances, and emits Transfer event", async () => {
      const beforeBalances = await getBalances([mTokenCollateral], [liquidator, borrower]);
      const result = await seize(mTokenCollateral, liquidator, borrower, seizeTokens);
      const afterBalances = await getBalances([mTokenCollateral], [liquidator, borrower]);
      expect(result).toSucceed();
      expect(result).toHaveLog('Transfer', {
        from: borrower,
        to: liquidator,
        amount: seizeTokens.toString()
      });
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mTokenCollateral, liquidator, 'tokens', seizeTokens],
        [mTokenCollateral, borrower, 'tokens', -seizeTokens]
      ]));
    });
  });
});
