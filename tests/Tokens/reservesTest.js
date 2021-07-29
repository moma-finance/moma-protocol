const {
  etherUnsigned,
  etherMantissa,
  both,
  UInt256Max
} = require('../Utils/Ethereum');

const {fastForward, makeMToken, setBorrowRate} = require('../Utils/Moma');

const defaultFactor = etherMantissa(.1);
const factor = etherMantissa(.02);

const reserves = etherUnsigned(3e12);
const cash = etherUnsigned(reserves.multipliedBy(2));
const reduction = etherUnsigned(2e12);
const add = etherUnsigned(2e12);

describe('#MToken/reserves', function () {
  let root, a1, accounts;
  beforeEach(async () => {
    [root, a1, ...accounts] = saddle.accounts;
  });

  describe('_setReserveFactorFresh', () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
    });

    it("rejects change by non-admin", async () => {
      expect(
        await send(mToken, 'harnessSetReserveFactorFresh', [factor], {from: accounts[0]})
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_RESERVE_FACTOR_ADMIN_CHECK');
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(defaultFactor);
    });

    it("rejects change if market not fresh", async () => {
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, 'harnessSetReserveFactorFresh', [factor])).toHaveTokenFailure('MARKET_NOT_FRESH', 'SET_RESERVE_FACTOR_FRESH_CHECK');
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(defaultFactor);
    });

    it("rejects newReserveFactor that descales to 1", async () => {
      expect(await send(mToken, 'harnessSetReserveFactorFresh', [etherMantissa(1.01)])).toHaveTokenFailure('BAD_INPUT', 'SET_RESERVE_FACTOR_BOUNDS_CHECK');
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(defaultFactor);
    });

    it("accepts newReserveFactor in valid range and emits log", async () => {
      const result = await send(mToken, 'harnessSetReserveFactorFresh', [factor])
      expect(result).toSucceed();
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(factor);
      expect(result).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: defaultFactor,
        newReserveFactorMantissa: factor.toString(),
      });
    });

    it("accepts a change back to zero", async () => {
      const result1 = await send(mToken, 'harnessSetReserveFactorFresh', [factor]);
      const result2 = await send(mToken, 'harnessSetReserveFactorFresh', [0]);
      expect(result1).toSucceed();
      expect(result2).toSucceed();
      expect(result2).toHaveLog("NewReserveFactor", {
        oldReserveFactorMantissa: factor.toString(),
        newReserveFactorMantissa: '0',
      });
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });
  });

  describe('_setReserveFactor', () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
    });

    beforeEach(async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
      await send(mToken, '_setReserveFactor', [0]);
    });

    it("emits a reserve factor failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(send(mToken, '_setReserveFactor', [factor])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_setReserveFactor', [factor]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'SET_RESERVE_FACTOR_ACCRUE_INTEREST_FAILED');
    });

    it("returns error from setReserveFactorFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(mToken, '_setReserveFactor', [etherMantissa(2)]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'SET_RESERVE_FACTOR_BOUNDS_CHECK');
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(0);
    });

    it("returns success from setReserveFactorFresh", async () => {
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(0);
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, '_setReserveFactor', [factor])).toSucceed();
      expect(await call(mToken, 'reserveFactorMantissa')).toEqualNumber(factor);
    });
  });


  describe("_addReservesFresh", () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness'});
      expect(await send(mToken.underlying, 'approve', [mToken._address, add])).toSucceed();
    });

    it("fails if market not fresh", async () => {
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, '_addReserves', [add])).toHaveTokenFailure('MARKET_NOT_FRESH', 'ADD_RESERVES_FRESH_CHECK');
      expect(await call(mToken, 'totalReserves')).toEqualNumber(0);
    });

    it("increases market balance and adds reserves on success", async () => {
      const balanceRoot = etherUnsigned(await call(mToken.underlying, 'balanceOf', [root]));
      const balanceMarket = etherUnsigned(await call(mToken.underlying, 'balanceOf', [mToken._address]));
      expect(await call(mToken, 'totalReserves')).toEqualNumber(0);
      const result = await send(mToken, '_addReserves', [add], {from: root});
      expect(await call(mToken.underlying, 'balanceOf', [root])).toEqualNumber(balanceRoot.minus(add));
      expect(await call(mToken.underlying, 'balanceOf', [mToken._address])).toEqualNumber(balanceMarket.plus(add));
      expect(await call(mToken, 'totalReserves')).toEqualNumber(add);
      expect(result).toHaveLog('ReservesAdded', {
        benefactor: root,
        addAmount: add.toString(),
        newTotalReserves: add.toString()
      });
    });
  });

  describe("_addReservesInternal", () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
      expect(await send(mToken.underlying, 'approve', [mToken._address, add])).toSucceed();
    });

    it("emits a reserve-add failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(send(mToken, '_addReserves', [add])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_addReserves', [add]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'ADD_RESERVES_ACCRUE_INTEREST_FAILED');
    });

    it("returns success code from _addReservesFresh and added the correct amount", async () => {
      expect(await call(mToken, 'totalReserves')).toEqualNumber(0);
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, '_addReserves', [add])).toSucceed();
      expect(await call(mToken, 'totalReserves')).toEqualNumber(add);
    });
  });


  describe("_reduceReservesFresh", () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness'});
      expect(await send(mToken, 'harnessSetTotalReserves', [reserves])).toSucceed();
      expect(
        await send(mToken.underlying, 'harnessSetBalance', [mToken._address, cash])
      ).toSucceed();
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(mToken, 'harnessReduceReservesFresh', [reduction], {from: accounts[0]})
      ).toHaveTokenFailure('UNAUTHORIZED', 'REDUCE_RESERVES_ADMIN_CHECK');
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if market not fresh", async () => {
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, 'harnessReduceReservesFresh', [reduction])).toHaveTokenFailure('MARKET_NOT_FRESH', 'REDUCE_RESERVES_FRESH_CHECK');
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if amount exceeds reserves", async () => {
      expect(await send(mToken, 'harnessReduceReservesFresh', [reserves.plus(1)])).toHaveTokenFailure('BAD_INPUT', 'REDUCE_RESERVES_VALIDATION');
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("fails if amount exceeds available cash", async () => {
      const cashLessThanReserves = reserves.minus(2);
      await send(mToken.underlying, 'harnessSetBalance', [mToken._address, cashLessThanReserves]);
      expect(await send(mToken, 'harnessReduceReservesFresh', [reserves])).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'REDUCE_RESERVES_CASH_NOT_AVAILABLE');
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves);
    });

    it("increases admin balance and reduces reserves on success", async () => {
      const balance = etherUnsigned(await call(mToken.underlying, 'balanceOf', [root]));
      expect(await send(mToken, 'harnessReduceReservesFresh', [reserves])).toSucceed();
      expect(await call(mToken.underlying, 'balanceOf', [root])).toEqualNumber(balance.plus(reserves));
      expect(await call(mToken, 'totalReserves')).toEqualNumber(0);
    });

    it("emits an event on success", async () => {
      const result = await send(mToken, 'harnessReduceReservesFresh', [reserves]);
      expect(result).toHaveLog('ReservesReduced', {
        admin: root,
        reduceAmount: reserves.toString(),
        newTotalReserves: '0'
      });
    });
  });

  describe("_reduceReserves", () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
      await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
      expect(await send(mToken, 'harnessSetTotalReserves', [reserves])).toSucceed();
      expect(
        await send(mToken.underlying, 'harnessSetBalance', [mToken._address, cash])
      ).toSucceed();
    });

    it("emits a reserve-reduction failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(send(mToken, '_reduceReserves', [reduction])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_reduceReserves', [reduction]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'REDUCE_RESERVES_ACCRUE_INTEREST_FAILED');
    });

    it("returns error from _reduceReservesFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(mToken, 'harnessReduceReservesFresh', [reserves.plus(1)]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'REDUCE_RESERVES_VALIDATION');
    });

    it("returns success code from _reduceReservesFresh and reduces the correct amount", async () => {
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves);
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await send(mToken, '_reduceReserves', [reduction])).toSucceed();
      expect(await call(mToken, 'totalReserves')).toEqualNumber(reserves.minus(reduction));
    });
  });
});
