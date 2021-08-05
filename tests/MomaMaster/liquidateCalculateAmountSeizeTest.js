const {etherUnsigned, UInt256Max} = require('../Utils/Ethereum');
const {
  makeMomaPool,
  makeMToken,
  setOraclePrice
} = require('../Utils/Moma');

const borrowedPrice = 2e10;
const collateralPrice = 1e18;
const repayAmount = etherUnsigned(1e18);

async function calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, repayAmount) {
  return call(momaPool, 'liquidateCalculateSeizeTokens', [mTokenBorrowed._address, mTokenCollateral._address, repayAmount]);
}

function rando(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

describe('#MomaMaster/liquidateCalculate', () => {
  let root, accounts;
  let momaPool, mTokenBorrowed, mTokenCollateral;

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    const mErc20Implementation = await deploy('MErc20DelegateHarness');
    momaPool = await makeMomaPool({addPriceOracle: true, factoryOpts: {addMErc20Implementation: true, mErc20Implementation}});
    mTokenBorrowed = await makeMToken({momaPool: momaPool, underlyingPrice: 0});
    mTokenCollateral = await makeMToken({momaPool: momaPool, underlyingPrice: 0});
  });

  beforeEach(async () => {
    await setOraclePrice(mTokenBorrowed, borrowedPrice);
    await setOraclePrice(mTokenCollateral, collateralPrice);
    await send(mTokenCollateral, 'harnessExchangeRateDetails', [8e10, 4e10, 0, 0, 0]);
  });

  describe('liquidateCalculateAmountSeize', () => {
    it("fails if either asset price is 0", async () => {
      await setOraclePrice(mTokenBorrowed, 0);
      expect(
        await calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, repayAmount)
      ).toHaveTrollErrorTuple(['PRICE_ERROR', 0]);

      await setOraclePrice(mTokenCollateral, 0);
      expect(
        await calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, repayAmount)
      ).toHaveTrollErrorTuple(['PRICE_ERROR', 0]);
    });

    it("fails if the repayAmount causes overflow ", async () => {
      await expect(
        calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, UInt256Max())
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("fails if the borrowed asset price causes overflow ", async () => {
      await setOraclePrice(mTokenBorrowed, -1);
      await expect(
        calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, repayAmount)
      ).rejects.toRevert("revert multiplication overflow");
    });

    it("reverts if it fails to calculate the exchange rate", async () => {
      await send(mTokenCollateral, 'harnessExchangeRateDetails', [9, 0, 10, 0, 0]); // (9 - 10) -> underflow
      await expect(
        send(momaPool, 'liquidateCalculateSeizeTokens', [mTokenBorrowed._address, mTokenCollateral._address, repayAmount])
      ).rejects.toRevert("revert exchangeRateStored: exchangeRateStoredInternal failed");
    });

    [
      [1e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 1e18, 1e18, 1e18, 1e18],
      [2e18, 2e18, 1.42e18, 1.3e18, 2.45e18],
      [2.789e18, 5.230480842e18, 771.32e18, 1.3e18, 10002.45e18],
      [ 7.009232529961056e+24,2.5278726317240445e+24,2.6177112093242585e+23,1179713989619784000,7.790468414639561e+24 ],
      [rando(0, 1e25), rando(0, 1e25), rando(1, 1e25), rando(1e18, 1.5e18), rando(0, 1e25)]
    ].forEach((testCase) => {
      it(`returns the correct value for ${testCase}`, async () => {
        const [exchangeRate, borrowedPrice, collateralPrice, liquidationIncentive, repayAmount] = testCase.map(etherUnsigned);

        await setOraclePrice(mTokenCollateral, collateralPrice);
        await setOraclePrice(mTokenBorrowed, borrowedPrice);
        await send(momaPool, '_setLiquidationIncentive', [liquidationIncentive]);
        await send(mTokenCollateral, 'harnessSetExchangeRate', [exchangeRate]);

        const seizeAmount = repayAmount.multipliedBy(liquidationIncentive).multipliedBy(borrowedPrice).dividedBy(collateralPrice);
        const seizeTokens = seizeAmount.dividedBy(exchangeRate);

        expect(
          await calculateSeizeTokens(momaPool, mTokenBorrowed, mTokenCollateral, repayAmount)
        ).toHaveTrollErrorTuple(
          ['NO_ERROR', Number(seizeTokens)],
          (x, y) => Math.abs(x - y) < 1e7
        );
      });
    });
  });
});
