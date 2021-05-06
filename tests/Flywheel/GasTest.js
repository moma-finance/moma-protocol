const {
  makeMomaPool,
  makeMToken
} = require('../Utils/Moma');
const {
  etherExp,
  etherDouble,
  etherUnsigned
} = require('../Utils/Ethereum');


// NB: coverage doesn't like this
describe.skip('Flywheel trace ops', () => {
  let root, a1, a2, a3, accounts;
  let momaPool, market;
  beforeEach(async () => {
    let interestRateModelOpts = {borrowRate: 0.000001};
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    momaPool = await makeMomaPool();
    market = await makeMToken({momaPool, supportMarket: true, addPriceOracle: true, underlyingPrice: 3, 
      setInterestRateModel: true, interestRateModelOpts});
    await send(momaPool, '_addCompMarkets', [[market].map(c => c._address)]);
  });

  it('update supply index SSTOREs', async () => {
    await send(momaPool, 'setBlockNumber', [100]);
    await send(market, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
    await send(momaPool, 'setCompSpeed', [market._address, etherExp(0.5)]);

    const tx = await send(momaPool, 'harnessUpdateCompSupplyIndex', [market._address]);

    const ops = {};
    await saddle.trace(tx, {
      execLog: log => {
        if (log.lastLog != undefined) {
          ops[log.op] = (ops[log.op] || []).concat(log);
        }
      }
    });
    expect(ops.SSTORE.length).toEqual(1);
  });

  it('update borrow index SSTOREs', async () => {
    await send(momaPool, 'setBlockNumber', [100]);
    await send(market, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
    await send(momaPool, 'setCompSpeed', [market._address, etherExp(0.5)]);

    const tx = await send(momaPool, 'harnessUpdateCompBorrowIndex', [market._address, etherExp(1.1)]);

    const ops = {};
    await saddle.trace(tx, {
      execLog: log => {
        if (log.lastLog != undefined) {
          ops[log.op] = (ops[log.op] || []).concat(log);
        }
      }
    });
    expect(ops.SSTORE.length).toEqual(1);
  });
});