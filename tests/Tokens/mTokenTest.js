const {
  etherUnsigned,
  etherMantissa,
  UInt256Max,
  address
} = require('../Utils/Ethereum');

const {
  makeMToken,
  setBorrowRate,
  pretendBorrow
} = require('../Utils/Moma');

describe('MToken', function () {
  let root, feeReceiver, accounts;
  beforeEach(async () => {
    [root, feeReceiver, ...accounts] = saddle.accounts;
  });

  describe('constructor', () => {
    it("fails when non erc-20 underlying", async () => {
      await expect(makeMToken({ underlying: { _address: root } })).rejects.toRevert("revert");
    });

    it("fails when 0 feeReceiver", async () => {
      await expect(makeMToken({ feeReceiver: address(0) })).rejects.toRevert("revert feeReceiver is zero address");
    });

    it("fails when 0 initial exchange rate", async () => {
      await expect(makeMToken({ exchangeRate: 0 })).rejects.toRevert("revert initial exchange rate must be greater than zero.");
    });

    it("succeeds with erc-20 underlying and non-zero exchange rate", async () => {
      const mToken = await makeMToken();
      expect(await call(mToken, 'underlying')).toEqual(mToken.underlying._address);
      expect(await call(mToken.momaPool, 'admin')).toEqual(root);
    });

    it("succeeds when setting momaMaster to contructor argument", async () => {
      const mToken = await makeMToken();
      expect(await call(mToken, 'momaMaster')).toEqual(mToken.momaPool._address);
    });

    it("succeeds when setting feeReceiver to contructor argument", async () => {
      const mToken = await makeMToken({ feeReceiver });
      expect(await call(mToken, 'feeReceiver')).toEqual(feeReceiver);
    });
  });

  describe('name, symbol, decimals', () => {
    let mToken;

    beforeEach(async () => {
      mToken = await makeMToken({ name: "MToken Foo", symbol: "cFOO", decimals: 10 });
    });

    it('should return correct name', async () => {
      expect(await call(mToken, 'name')).toEqual("MToken Foo");
    });

    it('should return correct symbol', async () => {
      expect(await call(mToken, 'symbol')).toEqual("cFOO");
    });

    it('should return correct decimals', async () => {
      expect(await call(mToken, 'decimals')).toEqualNumber(10);
    });
  });

  describe('factory', () => {
    it("succeeds to set factory after initialize", async () => {
      const mToken = await makeMToken();
      expect(await call(mToken, 'factory')).toEqual(mToken.momaPool.factory._address);
    });
  });

  describe('balanceOfUnderlying', () => {
    it("has an underlying balance", async () => {
      const mToken = await makeMToken({ implementation: 'MErc20DelegateHarness', supportMarket: true, exchangeRate: 2 });
      await send(mToken, 'harnessSetBalance', [root, 100]);
      expect(await call(mToken, 'balanceOfUnderlying', [root])).toEqualNumber(200);
    });
  });

  describe('borrowRatePerBlock', () => {
    it("has a borrow rate", async () => {
      const mToken = await makeMToken({ supportMarket: true, setInterestRateModel: true, 
        interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
      const perBlock = await call(mToken, 'borrowRatePerBlock');
      expect(Math.abs(perBlock * 2102400 - 5e16)).toBeLessThanOrEqual(1e8);
    });
  });

  describe('supplyRatePerBlock', () => {
    it("returns 0 if there's no supply", async () => {
      const mToken = await makeMToken({ supportMarket: true, setInterestRateModel: true, 
        interestRateModelOpts: { kind: 'jump-rate', baseRate: .05, multiplier: 0.45, kink: 0.95, jump: 5 } });
      const perBlock = await call(mToken, 'supplyRatePerBlock');
      await expect(perBlock).toEqualNumber(0);
    });

    it("has a supply rate", async () => {
      const baseRate = 0.05;
      const multiplier = 0.45;
      const kink = 0.95;
      const jump = 5 * multiplier;
      const mToken = await makeMToken({ implementation: 'MErc20DelegateHarness', supportMarket: true, setInterestRateModel: true, 
        interestRateModelOpts: { kind: 'jump-rate', baseRate, multiplier, kink, jump } });
      await send(mToken, 'harnessSetReserveFactorFresh', [etherMantissa(.01)]);
      await send(mToken, 'harnessExchangeRateDetails', [1, 1, 0, 0, 0]);
      await send(mToken, 'harnessSetExchangeRate', [etherMantissa(1)]);
      // Full utilization (Over the kink so jump is included), 1% reserves
      const borrowRate = baseRate + multiplier * kink + jump * .05;
      const reserveFactor = await call(mToken, 'reserveFactorMantissa') / 1e18;
      const feeFactor = await call(mToken, 'feeFactorMantissa') / 1e18;
      const momaFeeFactor = await call(mToken, 'getMomaFeeFactor') / 1e18;
      const expectedSuplyRate = borrowRate * (1 - reserveFactor - feeFactor - momaFeeFactor);

      const perBlock = await call(mToken, 'supplyRatePerBlock');
      expect(Math.abs(perBlock * 2102400 - expectedSuplyRate * 1e18)).toBeLessThanOrEqual(1e8);
    });
  });

  describe("borrowBalanceCurrent", () => {
    let borrower;
    let mToken;

    beforeEach(async () => {
      borrower = accounts[0];
      mToken = await makeMToken({implementation: 'MErc20DelegateHarness', setInterestRateModel: true});
    });

    beforeEach(async () => {
      await setBorrowRate(mToken, .001)
      await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
    });

    it("reverts if interest accrual fails", async () => {
      await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
      // make sure we accrue interest
      await send(mToken, 'harnessFastForward', [1]);
      await expect(send(mToken, 'borrowBalanceCurrent', [borrower])).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
    });

    it("returns successful result from borrowBalanceStored with no interest", async () => {
      await setBorrowRate(mToken, 0);
      await pretendBorrow(mToken, borrower, 1, 1, 5e18);
      expect(await call(mToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18)
    });

    it("returns successful result from borrowBalanceCurrent with no interest", async () => {
      await setBorrowRate(mToken, 0);
      await pretendBorrow(mToken, borrower, 1, 3, 5e18);
      expect(await send(mToken, 'harnessFastForward', [5])).toSucceed();
      expect(await call(mToken, 'borrowBalanceCurrent', [borrower])).toEqualNumber(5e18 * 3)
    });
  });

  describe("borrowBalanceStored", () => {
    let borrower;
    let mToken;

    beforeEach(async () => {
      borrower = accounts[0];
      mToken = await makeMToken({ implementation: 'MErc20DelegateHarness', setInterestRateModel: true });
    });

    it("returns 0 for account with no borrows", async () => {
      expect(await call(mToken, 'borrowBalanceStored', [borrower])).toEqualNumber(0)
    });

    it("returns stored principal when account and market indexes are the same", async () => {
      await pretendBorrow(mToken, borrower, 1, 1, 5e18);
      expect(await call(mToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18);
    });

    it("returns calculated balance when market index is higher than account index", async () => {
      await pretendBorrow(mToken, borrower, 1, 3, 5e18);
      expect(await call(mToken, 'borrowBalanceStored', [borrower])).toEqualNumber(5e18 * 3);
    });

    it("has undefined behavior when market index is lower than account index", async () => {
      // The market index < account index should NEVER happen, so we don't test this case
    });

    it("reverts on overflow of principal", async () => {
      await pretendBorrow(mToken, borrower, 1, 3, UInt256Max());
      await expect(call(mToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
    });

    it("reverts on non-zero stored principal with zero account index", async () => {
      await pretendBorrow(mToken, borrower, 0, 3, 5);
      await expect(call(mToken, 'borrowBalanceStored', [borrower])).rejects.toRevert("revert borrowBalanceStored: borrowBalanceStoredInternal failed");
    });
  });

  describe('exchangeRateStored', () => {
    let mToken, exchangeRate = 2;

    beforeEach(async () => {
      mToken = await makeMToken({ implementation: 'MErc20DelegateHarness', exchangeRate });
    });

    it("returns initial exchange rate with zero mTokenSupply", async () => {
      const result = await call(mToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(exchangeRate));
    });

    it("calculates with single mTokenSupply and single total borrow", async () => {
      const mTokenSupply = 1, totalBorrows = 1, totalReserves = 0, totalFees = 0, totalMomaFees = 0;
      await send(mToken, 'harnessExchangeRateDetails', [mTokenSupply, totalBorrows, totalReserves, totalFees, totalMomaFees]);
      const result = await call(mToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(1));
    });

    it("calculates with mTokenSupply and total borrows", async () => {
      const mTokenSupply = 100e18, totalBorrows = 10e18, totalReserves = 0, totalFees = 0, totalMomaFees = 0;
      await send(mToken, 'harnessExchangeRateDetails', [mTokenSupply, totalBorrows, totalReserves, totalFees, totalMomaFees].map(etherUnsigned));
      const result = await call(mToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(.1));
    });

    it("calculates with cash and mTokenSupply", async () => {
      const mTokenSupply = 5e18, totalBorrows = 0, totalReserves = 0, totalFees = 0, totalMomaFees = 0;
      expect(
        await send(mToken.underlying, 'transfer', [mToken._address, etherMantissa(500)])
      ).toSucceed();
      await send(mToken, 'harnessExchangeRateDetails', [mTokenSupply, totalBorrows, totalReserves, totalFees, totalMomaFees].map(etherUnsigned));
      const result = await call(mToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(100));
    });

    it("calculates with cash, borrows, reserves and mTokenSupply", async () => {
      const mTokenSupply = 500e18, totalBorrows = 500e18, totalReserves = 5e18, totalFees = 3e18, totalMomaFees = 2e18;
      expect(
        await send(mToken.underlying, 'transfer', [mToken._address, etherMantissa(500)])
      ).toSucceed();
      await send(mToken, 'harnessExchangeRateDetails', [mTokenSupply, totalBorrows, totalReserves, totalFees, totalMomaFees].map(etherUnsigned));
      const result = await call(mToken, 'exchangeRateStored');
      expect(result).toEqualNumber(etherMantissa(1.98));
    });
  });

  describe('getCash', () => {
    it("should return 0 in start", async () => {
      const mToken = await makeMToken();
      expect(await call(mToken, 'getCash')).toEqualNumber(0);
    });

    it("should return correctly quantity", async () => {
      const mToken = await makeMToken();
      await send(mToken.underlying, 'transfer', [mToken._address, etherMantissa(500)]);
      expect(await call(mToken, 'getCash')).toEqualNumber(etherMantissa(500));
    });

    it("should return correctly quantity", async () => {
      const mToken = await makeMToken({ kind: 'mether', supportMarket: true });
      await send(mToken, 'mint', {value: 11});
      expect(await call(mToken, 'getCash')).toEqualNumber(11);
    });
  });

  describe('getMomaFeeFactor', () => {
    it('should return 0 in start', async () => {
      const mToken = await makeMToken();
      expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(0);
    });

    it('should return correct after set for erc20', async () => {
      const mToken = await makeMToken();
      await send(mToken.momaPool.factory, 'setPoolFeeFactor', [mToken.momaPool._address, 11]);
      expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(11);
    });

    it('should return correct after set for mether', async () => {
      const mToken = await makeMToken({ kind: 'mether' });
      await send(mToken.momaPool.factory, 'setTokenFeeFactor', [address(1), 111]);
      expect(await call(mToken, 'getMomaFeeFactor')).toEqualNumber(111);
    });
  });
});
