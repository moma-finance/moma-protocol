const { 
  address,
  etherMantissa,
  etherBalance,
  etherGasCost,
  UInt256Max,
  both
 } = require('../Utils/Ethereum');

const {
  makeMToken,
  fastForward,
  setBorrowRate,
  setEtherBalance
} = require('../Utils/Moma');


describe('#MEther/feeAndMomaFee', function () {
  let root, a1, mToken, a1Ether;
  let fee = etherMantissa(1), momaFee = etherMantissa(0.5);

  beforeEach(async () => {
    [root, a1, ...accounts] = saddle.accounts;
    expect(root).not.toEqual(a1);
    mToken = await makeMToken({kind: 'mether', contract: 'MEtherDelegator', implementation: 'MEtherDelegateHarness', 
                               setInterestRateModel: true});
    expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.1));
  });

  describe('_setFeeReceiver', function () {
    it("should fail if called by non-admin", async () => {
      expect(
        await send(mToken, '_setFeeReceiver', [a1], { from: a1 })
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_FEE_RECEIVER_OWNER_CHECK');
      expect(await call(mToken, 'feeReceiver')).toEqual(root);
    });

    it("should fail if passed address(0)", async () => {
      expect(
        await send(mToken, '_setFeeReceiver', [address(0)])
      ).toHaveTokenFailure('BAD_INPUT', 'SET_FEE_RECEIVER_ADDRESS_VALIDATION');
      expect(await call(mToken, 'feeReceiver')).toEqual(root);
    });

    it("updates feeReceiver and emits log on success", async () => {
      const result = await send(mToken, '_setFeeReceiver', [a1]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewFeeReceiver', {
        oldFeeReceiver: root,
        newFeeReceiver: a1
      });
      expect(await call(mToken, 'feeReceiver')).toEqual(a1);
    });
  });


  describe('_setFeeFactor', function () {
    it("emits a set market interest rate model failure if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(
        send(mToken, '_setFeeFactor', [etherMantissa(0.2)])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 0]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_setFeeFactor', [etherMantissa(0.2)]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'SET_FEE_FACTOR_ACCRUE_INTEREST_FAILED');
    });

    it("returns error from _setFeeFactorFresh without emitting any extra logs", async () => {
      const {reply, receipt} = await both(mToken, '_setFeeFactor', [etherMantissa(0.2)], {from: a1});
      expect(reply).toHaveTokenError('UNAUTHORIZED');
      expect(receipt).toHaveTokenFailure('UNAUTHORIZED', 'SET_FEE_FACTOR_ADMIN_CHECK');
    });

    it("reports success when _setFeeFactorFresh succeeds", async () => {
      const {reply, receipt} = await both(mToken, '_setFeeFactor', [etherMantissa(0.2)]);
      expect(reply).toEqualNumber(0);
      expect(receipt).toSucceed();
      expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.2));
    });

    describe("_setFeeFactorFresh", () => {
      beforeEach(async () => {
        await send(mToken, 'harnessSetInterestRateModel', [address(0)]);
      });

      it("fails if called by non-admin", async () => {
        expect(
          await send(mToken, '_setFeeFactor', [etherMantissa(0.2)], {from: a1})
        ).toHaveTokenFailure('UNAUTHORIZED', 'SET_FEE_FACTOR_ADMIN_CHECK');
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.1));
      });

      it("fails if market not fresh", async () => {
        expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
        expect(
          await send(mToken, '_setFeeFactor', [etherMantissa(0.2)])
        ).toHaveTokenFailure('MARKET_NOT_FRESH', 'SET_FEE_FACTOR_FRESH_CHECK');
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.1));
      });

      it("fails if newFeeFactorMantissa > feeFactorMaxMantissa", async () => {
        expect(
          await send(mToken, '_setFeeFactor', [etherMantissa(2)])
        ).toHaveTokenFailure('BAD_INPUT', 'SET_FEE_FACTOR_BOUNDS_CHECK');
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.1));
      });

      it("accepts new valid newFeeFactorMantissa and emits expected log", async () => {
        const result = await send(mToken, '_setFeeFactor', [etherMantissa(0.2)]);
        expect(await call(mToken, 'feeFactorMantissa')).toEqualNumber(etherMantissa(0.2));
        expect(result).toSucceed();
        expect(result).toHaveLog('NewFeeFactor', {
          oldFeeFactorMantissa: etherMantissa(0.1),
          newFeeFactorMantissa: etherMantissa(0.2),
        });
      });
    });
  });


  describe('_collectFees', function () {
    it("returns no error if totalFees is 0 and collectAmount is -1", async () => {
      expect(await call(mToken, 'totalFees')).toEqualNumber(0);
      const {reply, receipt} = await both(mToken, '_collectFees', [UInt256Max()]);
      expect(reply).toEqualNumber(0);
      expect(receipt).toSucceed();
      expect(await call(mToken, 'totalFees')).toEqualNumber(0);
    });

    it("returns error if totalFees is 0 and collectAmount is not -1", async () => {
      expect(await call(mToken, 'totalFees')).toEqualNumber(0);
      const {reply, receipt} = await both(mToken, '_collectFees', [1]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'COLLECT_FEES_VALIDATION');
    });

    it("emits a set market interest rate model failure if interest accrual fails", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 1, 0]);
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(
        send(mToken, '_collectFees', [etherMantissa(0.2)])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 1, 0]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_collectFees', [etherMantissa(0.2)]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'COLLECT_FEES_ACCRUE_INTEREST_FAILED');
    });

    it("returns error from _collectFeesFresh without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 1, 0]);
      const {reply, receipt} = await both(mToken, '_collectFees', [etherMantissa(0.2)], {from: a1});
      expect(reply).toHaveTokenError('UNAUTHORIZED');
      expect(receipt).toHaveTokenFailure('UNAUTHORIZED', 'COLLECT_FEES_ADMIN_CHECK');
    });

    describe("_collectFeesFresh", () => {
      beforeEach(async () => {
        await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, fee, 0]);
        await send(mToken, 'harnessSetInterestRateModel', [address(0)]);
      });

      it("returns no error if totalFees is not 0 and collectAmount is 0", async () => {
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
        const {reply, receipt} = await both(mToken, '_collectFees', [0]);
        expect(reply).toEqualNumber(0);
        expect(receipt).toSucceed();
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
      });

      it("fails if called by non-admin and non-feeReceiver", async () => {
        expect(
          await send(mToken, '_collectFees', [1], {from: a1})
        ).toHaveTokenFailure('UNAUTHORIZED', 'COLLECT_FEES_ADMIN_CHECK');
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
      });

      it("fails if market not fresh", async () => {
        expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
        expect(
          await send(mToken, '_collectFees', [1])
        ).toHaveTokenFailure('MARKET_NOT_FRESH', 'COLLECT_FEES_FRESH_CHECK');
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
      });

      it("fails if protocol has insufficient underlying cash", async () => {
        expect(
          await send(mToken, '_collectFees', [fee.plus(1)])
        ).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'COLLECT_FEES_CASH_NOT_AVAILABLE');
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
      });

      it("fails if collectAmount > totalFees", async () => {
        await setEtherBalance(mToken, fee.plus(1));
        expect(
          await send(mToken, '_collectFees', [fee.plus(1)])
        ).toHaveTokenFailure('BAD_INPUT', 'COLLECT_FEES_VALIDATION');
        expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
      });

      describe("accepts new valid collectAmount and emits expected log", () => {
        beforeEach(async () => {
          await setEtherBalance(mToken, fee);
          await send(mToken, '_setFeeReceiver', [a1]);
          expect(await call(mToken, 'totalFees')).toEqualNumber(fee);
          a1Ether = await etherBalance(a1);
        });

        it("should work for -1 collectAmount and admin", async () => {
          const result = await send(mToken, '_collectFees', [UInt256Max()], {from: root});
          expect(await call(mToken, 'totalFees')).toEqualNumber(0);
          expect(await etherBalance(a1)).toEqualNumber(a1Ether.plus(fee));
          expect(result).toSucceed();
          expect(result).toHaveLog('FeesCollected', {
            feeReceiver: a1,
            collectAmount: fee,
            newTotalFees: 0
          });
        });

        it("should work for collectAmount and _setFeeReceiver", async () => {
          const result = await send(mToken, '_collectFees', [fee], {from: a1});
          expect(await call(mToken, 'totalFees')).toEqualNumber(0);
          expect(await etherBalance(a1)).toEqualNumber(a1Ether.plus(fee).minus(await etherGasCost(result)));
          expect(result).toSucceed();
          expect(result).toHaveLog('FeesCollected', {
            feeReceiver: a1,
            collectAmount: fee,
            newTotalFees: 0
          });
        });
      });
    });
  });


  describe('_collectMomaFees', function () {
    it("returns no error if totalMomaFees is 0 and collectAmount is -1", async () => {
      expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
      const {reply, receipt} = await both(mToken, '_collectMomaFees', [UInt256Max()]);
      expect(reply).toEqualNumber(0);
      expect(receipt).toSucceed();
      expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
    });

    it("returns error if totalMomaFees is 0 and collectAmount is not -1", async () => {
      expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
      const {reply, receipt} = await both(mToken, '_collectMomaFees', [1]);
      expect(reply).toHaveTokenError('BAD_INPUT');
      expect(receipt).toHaveTokenFailure('BAD_INPUT', 'COLLECT_MOMA_FEES_VALIDATION');
    });

    it("emits a set market interest rate model failure if interest accrual fails", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 0, 1]);
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      await fastForward(mToken, 1);
      await expect(
        send(mToken, '_collectMomaFees', [etherMantissa(0.2)])
      ).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns error from accrueInterest without emitting any extra logs", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, UInt256Max(), 0, 0, 1]);
      await setBorrowRate(mToken, .000001);
      await fastForward(mToken, 1);
      const {reply, receipt} = await both(mToken, '_collectMomaFees', [etherMantissa(0.2)]);
      expect(reply).toHaveTokenError('MATH_ERROR');
      expect(receipt).toHaveTokenFailure('MATH_ERROR', 'COLLECT_MOMA_FEES_ACCRUE_INTEREST_FAILED');
    });

    it("returns error if not moma fee admin", async () => {
      await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 0, 1]);
      const {reply, receipt} = await both(mToken, '_collectMomaFees', [etherMantissa(0.2)], {from: a1});
      expect(reply).toHaveTokenError('UNAUTHORIZED');
      expect(receipt).toHaveTokenFailure('UNAUTHORIZED', 'COLLECT_MOMA_FEES_ADMIN_CHECK');
    });

    describe("_collectMomaFeesFresh", () => {
      beforeEach(async () => {
        await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, 0, momaFee]);
        await send(mToken, 'harnessSetInterestRateModel', [address(0)]);
      });

      it("returns no error if totalMomaFees is not 0 and collectAmount is 0", async () => {
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
        const {reply, receipt} = await both(mToken, '_collectMomaFees', [0]);
        expect(reply).toEqualNumber(0);
        expect(receipt).toSucceed();
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
      });

      it("fails if called by non moma fee admin feeReceiver", async () => {
        await send(mToken, '_setFeeReceiver', [a1]);
        expect(
          await send(mToken, '_collectMomaFees', [1], {from: a1})
        ).toHaveTokenFailure('UNAUTHORIZED', 'COLLECT_MOMA_FEES_ADMIN_CHECK');
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
      });

      it("fails if market not fresh", async () => {
        expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
        expect(
          await send(mToken, '_collectMomaFees', [1])
        ).toHaveTokenFailure('MARKET_NOT_FRESH', 'COLLECT_MOMA_FEES_FRESH_CHECK');
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
      });

      it("fails if protocol has insufficient underlying cash", async () => {
        expect(
          await send(mToken, '_collectMomaFees', [2])
        ).toHaveTokenFailure('TOKEN_INSUFFICIENT_CASH', 'COLLECT_MOMA_FEES_CASH_NOT_AVAILABLE');
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
      });

      it("fails if collectAmount > totalMomaFees", async () => {
        await setEtherBalance(mToken, momaFee.plus(1));
        expect(
          await send(mToken, '_collectMomaFees', [momaFee.plus(1)])
        ).toHaveTokenFailure('BAD_INPUT', 'COLLECT_MOMA_FEES_VALIDATION');
        expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
      });

      describe("accepts new valid collectAmount and emits expected log", () => {
        beforeEach(async () => {
          await setEtherBalance(mToken, momaFee);
          await send(mToken.momaPool.factory, 'setPoolFeeReceiver', [mToken.momaPool._address, a1]);
          expect(await call(mToken, 'totalMomaFees')).toEqualNumber(momaFee);
          a1Ether = await etherBalance(a1);
        });

        it("should work for -1 collectAmount", async () => {
          const result = await send(mToken, '_collectMomaFees', [UInt256Max()], {from: root});
          expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
          expect(await etherBalance(a1)).toEqualNumber(a1Ether.plus(momaFee));
          expect(result).toSucceed();
          expect(result).toHaveLog('MomaFeesCollected', {
            momaFeeReceiver: a1,
            collectAmount: momaFee,
            newTotalMomaFees: 0
          });
        });

        it("should work for collectAmount", async () => {
          const result = await send(mToken, '_collectMomaFees', [momaFee], {from: root});
          expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
          expect(await etherBalance(a1)).toEqualNumber(a1Ether.plus(momaFee));
          expect(result).toSucceed();
          expect(result).toHaveLog('MomaFeesCollected', {
            momaFeeReceiver: a1,
            collectAmount: momaFee,
            newTotalMomaFees: 0
          });
        });

        it("should work for _collectFees", async () => {
          await setEtherBalance(mToken, fee.plus(momaFee));
          await send(mToken, 'harnessExchangeRateDetails', [0, 0, 0, fee, momaFee]);
          const result = await send(mToken, '_collectFees', [fee], {from: root});
          expect(await call(mToken, 'totalMomaFees')).toEqualNumber(0);
          expect(await etherBalance(a1)).toEqualNumber(a1Ether.plus(momaFee));
          expect(result).toSucceed();
          expect(result).toHaveLog('MomaFeesCollected', {
            momaFeeReceiver: a1,
            collectAmount: momaFee,
            newTotalMomaFees: 0
          });
          expect(result).toHaveLog('FeesCollected', {
            feeReceiver: root,
            collectAmount: fee,
            newTotalFees: 0
          });
        });
      });
    });
  });
});
