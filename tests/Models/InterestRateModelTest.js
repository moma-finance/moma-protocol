const {
  makeInterestRateModel,
  getBorrowRate,
  getSupplyRate
} = require('../Utils/Moma');
const { UInt256Max } = require('../Utils/Ethereum');

function utilizationRate(cash, borrows, reserves, fees, momaFees) {
  return borrows ? borrows / (cash + borrows - reserves - fees - momaFees) : 0;
}

function whitePaperRateFn(base, slope, kink = 0.9, jump = 5) {
  return (cash, borrows, reserves, fees, momaFees) => {
    const ur = utilizationRate(cash, borrows, reserves, fees, momaFees);

    if (ur <= kink) {
      return (ur * slope + base) / blocksPerYear;
    } else {
      const excessUtil = ur - kink;
      const jumpMultiplier = jump * slope;
      return ((excessUtil * jump) + (kink * slope) + base) / blocksPerYear;
    }
  }
}

function supplyRateFn(base, slope, jump, kink, cash, borrows, reserves, fees, momaFees, 
                      reserveFactor = 0.1, feeFactor = 0.1, momaFeeFactor = 0) {
  const ur = utilizationRate(cash, borrows, reserves, fees, momaFees);
  const borrowRate = whitePaperRateFn(base, slope, jump, kink)(cash, borrows, reserves, fees, momaFees);

  return borrowRate * (1 - reserveFactor - feeFactor - momaFeeFactor) * ur;
}

function makeUtilization(util) {
  if (util == 0e18) {
    return {
      borrows: 0,
      reserves: 0,
      cash: 0,
      fees: 0,
      momaFees: 0
    };
  } else {
    // borrows / (cash + borrows - reserves - fees - momaFees) = util
    // let borrows = 3
    // let reserves = 1
    // let fees = 1
    // let momaFees = 1
    // 3 / ( cash + 3 - 1 - 1 - 1) = util
    // util = 3 / cash
    // cash = 3 / util
    borrows = 3e18;
    reserves = 1e18;
    fees = 1e18;
    momaFees = 1e18;
    cash = 3e36 / util;

    return {
      borrows,
      cash,
      reserves,
      fees,
      momaFees
    };
  }
}

const blocksPerYear = 2102400;

describe('InterestRateModel', () => {
  let root, accounts;
  beforeEach(async() => {
    [root, ...accounts] = saddle.accounts;
  });

  const expectedRates = {
    'baseP025-slopeP20': { base: 0.025, slope: 0.20, model: 'white-paper' },
    'baseP05-slopeP45': { base: 0.05, slope: 0.45, model: 'white-paper' },
    'white-paper': { base: 0.1, slope: 0.45, model: 'white-paper' },
    'jump-rate': { base: 0.1, slope: 0.45, model: 'jump-rate' }
  };

  Object.entries(expectedRates).forEach(async ([kind, info]) => {
    let model;
    beforeAll(async () => {
      model = await makeInterestRateModel({ kind: info.model, baseRate: info.base, multiplier: info.slope });
    });

    describe(kind, () => {

      it('isInterestRateModel', async () => {
        expect(await call(model, 'isInterestRateModel')).toEqual(true);
      });

      it(`calculates correct borrow value`, async () => {
        const rateInputs = [
          [500, 100],
          [3e18, 5e18],
          [5e18, 3e18],
          [500, 3e18],
          [0, 500],
          [500, 0],
          [0, 0],
          [3e18, 500],
          ["1000.00000000e18", "310.00000000e18"],
          ["690.00000000e18", "310.00000000e18"]
        ].map(vs => vs.map(Number));

        // XXS Add back for ${cash}, ${borrows}, ${reserves}
        await Promise.all(rateInputs.map(async ([cash, borrows, reserves = 0, fees = 0, momaFees = 0]) => {
          const rateFn = whitePaperRateFn(info.base, info.slope);
          const expected = rateFn(cash, borrows, reserves, fees, momaFees);
          expect(await getBorrowRate(model, cash, borrows, reserves, fees, momaFees) / 1e18).toBeWithinDelta(expected, 1e7);
        }));
      });

      if (kind == 'jump-rate') {
        // Only need to do these for the WhitePaper

        it('handles overflowed cash + borrows', async () => {
          await expect(getBorrowRate(model, UInt256Max(), UInt256Max(), 0, 0, 0)).rejects.toRevert("revert SafeMath: addition overflow");
        });

        it('handles failing to get exp of borrows / cash + borrows', async () => {
          await expect(getBorrowRate(model, 0, UInt256Max(), 0, 0, 0)).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it('handles overflow utilization rate times slope', async () => {
          const badModel = await makeInterestRateModel({ kind, baseRate: 0, multiplier: 0, jump: -1 });
          await expect(getBorrowRate(badModel, 1, 1, 0, 0, 0)).rejects.toRevert("revert SafeMath: multiplication overflow");
        });

        it('handles overflow utilization rate times slope + base', async () => {
          const badModel = await makeInterestRateModel({ kind, baseRate: 0, multiplier: 0, jump: 1e48 });
          await expect(getBorrowRate(badModel, 0, 1, 0, 0, 0)).rejects.toRevert("revert SafeMath: multiplication overflow");
        });
      }
    });
  });

  describe('jump rate tests', () => {
    describe('chosen points', () => {
      const tests = [
        {
          jump: 100,
          kink: 90,
          base: 10,
          slope: 20,
          points: [
            [0, 10],
            [10, 12],
            [89, 27.8],
            [90, 28],
            [91, 29],
            [100, 38]
          ]
        },
        {
          jump: 20,
          kink: 90,
          base: 10,
          slope: 20,
          points: [
            [0, 10],
            [10, 12],
            [100, 30]
          ]
        },
        {
          jump: 0,
          kink: 90,
          base: 10,
          slope: 20,
          points: [
            [0, 10],
            [10, 12],
            [100, 28]
          ]
        },
        {
          jump: 0,
          kink: 110,
          base: 10,
          slope: 20,
          points: [
            [0, 10],
            [10, 12],
            [100, 30]
          ]
        },
        {
          jump: 2000,
          kink: 0,
          base: 10,
          slope: 20,
          points: [
            [0, 10],
            [10, 210],
            [100, 2010]
          ]
        }
      ].forEach(({jump, kink, base, slope, points}) => {
        describe(`for jump=${jump}, kink=${kink}, base=${base}, slope=${slope}`, () => {
          let jumpModel;

          beforeAll(async () => {
            jumpModel = await makeInterestRateModel({
              kind: 'jump-rate',
              baseRate: base / 100,
              multiplier: slope / 100,
              jump: jump / 100,
              kink: kink / 100,
            });
          });

          points.forEach(([util, expected]) => {
            it(`and util=${util}%`, async () => {
              const {borrows, cash, reserves, fees, momaFees} = makeUtilization(util * 1e16);
              const borrowRateResult = await getBorrowRate(jumpModel, cash, borrows, reserves, fees, momaFees);
              const actual = Number(borrowRateResult) / 1e16 * blocksPerYear;

              expect(actual).toBeWithinDelta(expected, 1e-2);
            });
          });
        });
      });
    });
  });
});
