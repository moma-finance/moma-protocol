const {both, UInt256Max, address} = require('../Utils/Ethereum');
const {
  fastForward,
  makeMToken,
  makeInterestRateModel,
  setBorrowRate
} = require('../Utils/Moma');

describe('#MToken/setInterestRateModel', function () {
  let root, accounts;
  let newModel;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    newModel = await makeInterestRateModel();
  });

  describe("_setInterestRateModelFresh", () => {
    let mToken, oldModel;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
      oldModel = mToken.interestRateModel;
      expect(oldModel._address).not.toEqual(newModel._address);
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(mToken, 'harnessSetInterestRateModelFresh', [newModel._address], {from: accounts[0]})
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_INTEREST_RATE_MODEL_OWNER_CHECK');
      expect(await call(mToken, 'interestRateModel')).toEqual(oldModel._address);
    });

    it("fails if market not fresh", async () => {
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(
        await send(mToken, 'harnessSetInterestRateModelFresh', [newModel._address])
      ).toHaveTokenFailure('MARKET_NOT_FRESH', 'SET_INTEREST_RATE_MODEL_FRESH_CHECK');
      expect(await call(mToken, 'interestRateModel')).toEqual(oldModel._address);
    });

    it("reverts if passed a contract that doesn't implement isInterestRateModel", async () => {
      await expect(
        send(mToken, 'harnessSetInterestRateModelFresh', [mToken.underlying._address])
      ).rejects.toRevert();
      expect(await call(mToken, 'interestRateModel')).toEqual(oldModel._address);
    });

    it("reverts if passed a contract that implements isInterestRateModel as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badModel = await makeInterestRateModel({kind: 'false-marker'});
      await expect(send(mToken, 'harnessSetInterestRateModelFresh', [badModel._address])).rejects.toRevert("revert marker method returned false");
      expect(await call(mToken, 'interestRateModel')).toEqual(oldModel._address);
    });

    it("accepts new valid interest rate model", async () => {
      expect(
        await send(mToken, 'harnessSetInterestRateModelFresh', [newModel._address])
      ).toSucceed();
      expect(await call(mToken, 'interestRateModel')).toEqual(newModel._address);
      expect(await call(mToken, 'accrualBlockNumber')).toEqualNumber(0);
      expect(await call(mToken, 'borrowIndex')).toEqualNumber(1e18);
    });

    it("emits expected log when accepting a new valid interest rate model", async () => {
      const result = await send(mToken, 'harnessSetInterestRateModelFresh', [newModel._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewMarketInterestRateModel', {
        oldInterestRateModel: oldModel._address,
        newInterestRateModel: newModel._address,
      });
      expect(await call(mToken, 'interestRateModel')).toEqual(newModel._address);
    });

    it("accepts new valid interest rate model at the first time", async () => {
      const mkt = await makeMToken({implementation: 'MErc20DelegateHarness'});
      expect(await call(mkt, 'interestRateModel')).toBeAddressZero();
      expect(await call(mkt, 'accrualBlockNumber')).toEqualNumber(0);
      expect(await call(mkt, 'borrowIndex')).toEqualNumber(0);
      await send(mkt, 'harnessSetBlockNumber', [100]);

      const result = await send(mkt, '_setInterestRateModel', [newModel._address]);
      expect(result).toSucceed();
      expect(await call(mkt, 'interestRateModel')).toEqual(newModel._address);
      expect(await call(mkt, 'accrualBlockNumber')).toEqualNumber(100);
      expect(await call(mkt, 'borrowIndex')).toEqualNumber(1e18);
      expect(result).toHaveLog('NewMarketInterestRateModel', {
        oldInterestRateModel: address(0),
        newInterestRateModel: newModel._address,
      });
    });
  });

  describe("_setInterestRateModel", () => {
    let mToken;
    beforeEach(async () => {
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
      await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
    });

    it("should start with address(0)", async () => {
      const m = await makeMToken({implementation: 'MErc20Delegate'});
      expect(await call(m, 'interestRateModel')).toBeAddressZero();
      expect(await call(m, 'accrualBlockNumber')).toEqualNumber(0);
      expect(await call(m, 'borrowIndex')).toEqualNumber(0);
    });

    it("should init correctly", async () => {
      expect(await call(mToken, 'interestRateModel')).toEqual(mToken.interestRateModel._address);
      expect(await call(mToken, 'accrualBlockNumber')).toEqualNumber(0);
      expect(await call(mToken, 'borrowIndex')).toEqualNumber(1e18);
    });

    it("emits a set market interest rate model failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(send(mToken, '_setInterestRateModel', [newModel._address])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 1]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_setInterestRateModel', [root]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'SET_INTEREST_RATE_MODEL_ACCRUE_INTEREST_FAILED');
    });

    it("returns error from _setInterestRateModelFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(mToken, '_setInterestRateModel', [newModel._address], {from: accounts[0]});
      expect(reply).toHaveTokenError('UNAUTHORIZED');
      expect(receipt).toHaveTokenFailure('UNAUTHORIZED', 'SET_INTEREST_RATE_MODEL_OWNER_CHECK');
    });

    it("reports success when _setInterestRateModelFresh succeeds", async () => {
      const {reply, receipt} = await both(mToken, '_setInterestRateModel', [newModel._address]);
      expect(reply).toEqualNumber(0);
      expect(receipt).toSucceed();
      expect(await call(mToken, 'interestRateModel')).toEqual(newModel._address);
      expect(await call(mToken, 'accrualBlockNumber')).toEqualNumber(0);
      expect(await call(mToken, 'borrowIndex')).toEqualNumber(1e18);
    });
  });
});
