const {
  makeMomaPool,
  makeMToken,
  balanceOf,
  quickMint,
  upgradeLendingPool
} = require('../Utils/Moma');
const {
  address,
  etherExp,
  etherDouble,
  etherUnsigned,
  mineBlockNumber,
  minerStop,
  minerStart,
  mergeInterface
} = require('../Utils/Ethereum');

const momaInitialIndex = etherUnsigned(1e36);

async function momaAccrued(momaFarming, user) {
  return etherUnsigned(await call(momaFarming, 'momaAccrued', [user]));
}

async function supplierIndex(momaPool, market, user) {
  return await call(momaPool.factory.momaFarming, "getMarketSupplierIndex", [momaPool._address, market._address, user]);
}

async function borrowerIndex(momaPool, market, user) {
  return await call(momaPool.factory.momaFarming, "getMarketBorrowerIndex", [momaPool._address, market._address, user]);
}

async function checkMarketWeight(momaPool, market, expectedWeight) {
  const {weight} = await call(momaPool.factory.momaFarming, 'marketStates', [momaPool._address, market._address]);
  expect(weight).toEqualNumber(expectedWeight);
}

async function checkTotalWeight(momaPool, expectedTotoalWeight) {
  expect(await call(momaPool.factory.momaFarming, 'momaTotalWeight')).toEqualNumber(expectedTotoalWeight);
}

async function checkMarketsSpeed(momaPool, markets, expectedSpeeds) {
  let n = 0;
  for (let market of markets) {
    expect(await call(momaPool.factory.momaFarming, 'getMarketSpeed', [momaPool._address, market._address])).toEqualNumber(expectedSpeeds[n]);
    n++;
  }
}

async function checkMarketSupplyState(momaPool, market, expectedIndex, expectedBlock) {
  const {supplyBlock, supplyIndex} = await call(momaPool.factory.momaFarming, 'marketStates', [momaPool._address, market._address]);
  expect(supplyIndex).toEqualNumber(expectedIndex);
  expect(supplyBlock).toEqualNumber(expectedBlock);
}

async function checkMarketBorrowState(momaPool, market, expectedIndex, expectedBlock) {
  const {borrowBlock, borrowIndex} = await call(momaPool.factory.momaFarming, 'marketStates', [momaPool._address, market._address]);
  expect(borrowIndex).toEqualNumber(expectedIndex);
  expect(borrowBlock).toEqualNumber(expectedBlock);
}

async function checkMarketAndPool(momaPool, expectedPoolNum, expectedMarketNum, expectedMarkets, expectedMomaPools){
  expect(await call(momaPool.factory.momaFarming, 'getMomaPoolNum')).toEqualNumber(expectedPoolNum);
  expect(await call(momaPool.factory.momaFarming, 'getMomaMarketNum')).toEqualNumber(expectedMarketNum);
  expect(await call(momaPool.factory.momaFarming, 'getMomaMarkets', [momaPool._address])).toEqual(expectedMarkets);
  expect(await call(momaPool.factory.momaFarming, 'getAllMomaPools')).toEqual(expectedMomaPools);
}

async function checkSetMarketsWeightState(momaPool, expectedIsMomaLendingPool, expectedIsMomaPool, markets, expectedIsMomaMarkets,
    expectedWeights, expectedTotoalWeight, expectedIndex, expectedBlock, supply=true, borrow=true) {
  let n = 0;
  for (let market of markets) {
    expect(await call(momaPool.factory.momaFarming, 'isMomaMarket', [momaPool._address, market._address])).toEqual(expectedIsMomaMarkets[n]);
    await checkMarketWeight(momaPool, market, expectedWeights[n]);
    if (supply) await checkMarketSupplyState(momaPool, market, expectedIndex, expectedBlock);
    if (borrow) await checkMarketBorrowState(momaPool, market, expectedIndex, expectedBlock);
    n++;
  }
  await checkTotalWeight(momaPool, expectedTotoalWeight);
  expect(await call(momaPool.factory.momaFarming, 'isMomaPool', [momaPool._address])).toEqual(expectedIsMomaPool);
  expect(await call(momaPool.factory.momaFarming, 'isMomaLendingPool', [momaPool._address])).toEqual(expectedIsMomaLendingPool);
}

async function setBlockNumber(momaPool, market, number, type='supply') {
  let blockNumber;
  const state = await call(momaPool.factory.momaFarming, 'marketStates', [momaPool._address, market._address]);
  if (type == 'supply') { blockNumber = +state.supplyBlock } else blockNumber = +state.borrowBlock;
  await mineBlockNumber(blockNumber + number - 2);
  expect(await call(momaPool.factory.momaFarming, 'getBlockNumber')).toEqualNumber(blockNumber + number - 1);
  return blockNumber + number;
}

describe('Moma Farming Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let momaPool, moma, momaFarming;
  let blockNumber, mLOW, mREP, mZRX;
  beforeEach(async () => {
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    momaPool = await makeMomaPool({ kind: 'harness', addPriceOracle: true, addFarmingDelegate: true, addMomaFarming: true });
    momaFarming = momaPool.factory.momaFarming;
    moma = momaFarming.moma;
    blockNumber = +(await call(momaFarming, 'getBlockNumber'));
  });

  describe('constructor', () => {
    let mf;
    beforeEach(async () => {
      mf = await deploy('MomaFarming', [moma._address, momaPool.factory._address]);
    });
    
    it('should set admin correctly', async () => {
      expect(await call(mf, 'admin')).toEqual(root);
      expect(await call(momaFarming, 'admin')).toEqual(root);
    });

    it('should set moma correctly', async () => {
      expect(await call(mf, 'moma')).toEqual(moma._address);
      expect(await call(momaFarming, 'moma')).toEqual(moma._address);
    });

    it('should set factory correctly', async () => {
      expect(await call(mf, 'factory')).toEqual(momaPool.factory._address);
      expect(await call(momaFarming, 'factory')).toEqual(momaPool.factory._address);
    });
  });

  describe('_setAdmin()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaFarming, '_setAdmin', [a1], {from: a1})
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should revert if newAdmin is address(0)', async () => {
      await expect(
        send(momaFarming, '_setAdmin', [address(0)])
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should set new admin correctly', async () => {
      expect(await call(momaFarming, 'admin')).toEqual(root);
      const tx = await send(momaFarming, '_setAdmin', [a1]);
      expect(await call(momaFarming, 'admin')).toEqual(a1);
      expect(tx).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: a1
      });
    });
  });

  describe('_setFactory()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaFarming, '_setFactory', [a1], {from: a1})
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should revert if newFactory is address(0)', async () => {
      await expect(
        send(momaFarming, '_setFactory', [address(0)])
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should revert if newFactory have no isMomaFactory', async () => {
      await expect(
        send(momaFarming, '_setFactory', [a1])
      ).rejects.toRevert('revert');
    });

    it('should revert if newFactory isMomaFactory return false', async () => {
      const newFactory = await deploy('FalseMomaFactory');
      await expect(
        send(momaFarming, '_setFactory', [newFactory._address])
      ).rejects.toRevert('revert MomaFarming: not moma factory');
    });

    it('should set new factory correctly', async () => {
      const newFactory = await deploy('MomaFactory');
      expect(await call(momaFarming, 'factory')).toEqual(momaPool.factory._address);
      expect(newFactory._address).not.toEqual(momaPool.factory._address);
      const tx = await send(momaFarming, '_setFactory', [newFactory._address]);
      expect(await call(momaFarming, 'factory')).toEqual(newFactory._address);
      expect(tx).toHaveLog('NewFactory', {
        oldFactory: momaPool.factory._address,
        newFactory: newFactory._address
      });
    });
  });

  describe('_setMomaSpeed()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaFarming, '_setMomaSpeed', [etherUnsigned(1e18)], {from: a1})
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should set moma speed correctly', async () => {
      expect(await call(momaFarming, 'momaSpeed')).toEqualNumber(0);
      const tx = await send(momaFarming, '_setMomaSpeed', [etherUnsigned(1e18)]);
      expect(await call(momaFarming, 'momaSpeed')).toEqualNumber(etherUnsigned(1e18));
      expect(tx).toHaveLog('NewMomaSpeed', {
        oldMomaSpeed: 0,
        newMomaSpeed: etherUnsigned(1e18)
      });
    });
  });

  describe('_grantMoma()', () => {
    beforeEach(async () => {
      await send(moma, 'transfer', [momaFarming._address, etherUnsigned(50e18)]);
    });

    it('should revert if not called by admin', async () => {
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      await expect(
        send(momaFarming, '_grantMoma', [a1, 100], {from: a1})
      ).rejects.toRevert('revert MomaFarming: only admin can grant token');
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
    });

    it('should transfer MOMA if called by admin', async () => {
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      const tx = await send(momaFarming, '_grantMoma', [a1, 100]);
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(etherUnsigned(50e18).minus(100));
      expect(await balanceOf(moma, a1)).toEqualNumber(100);
      expect(tx).toHaveLog('MomaGranted', {
        recipient: a1,
        amount: 100
      });
    });

    it('should transfer 0 MOMA if called by admin', async () => {
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      const tx = await send(momaFarming, '_grantMoma', [a1, 0]);
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(etherUnsigned(50e18));
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('MomaGranted', {
        recipient: a1,
        amount: 0
      });
    });

    it('should revert if insufficient MOMA', async () => {
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      await expect(
        send(momaFarming, '_grantMoma', [a1, etherUnsigned(1e20)])
      ).rejects.toRevert('revert MomaFarming: insufficient MOMA for grant');
      expect(await balanceOf(moma, momaFarming._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
    });
  });

  describe('getMomaMarkets()', () => {
    it('should return the correct MOMA markets', async () => {
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2});
      mZRX = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 3});
      const markets = [mLOW._address, mREP._address, mZRX._address]
      await send(momaFarming, '_setMarketsWeight', [momaPool._address, markets, markets.map((c) => 1)]);
      await checkMarketAndPool(momaPool, 1, 3, markets, [momaPool._address]);

      await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mREP._address, mZRX._address], [0, 0]]);
      await checkMarketAndPool(momaPool, 1, 3, markets, [momaPool._address]);
    });
  });

  describe('_setMarketsWeight()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaFarming, '_setMarketsWeight', [momaPool._address, [a1], [1]], {from: a1})
      ).rejects.toRevert('revert MomaFarming: admin check');
    });

    it('should revert if not moma pool', async () => {
      await expect(
        send(momaFarming, '_setMarketsWeight', [a1, [a1], [1]])
      ).rejects.toRevert('revert MomaFarming: not moma pool');
    });

    it('should revert if param length dismatch', async () => {
      await expect(
        send(momaFarming, '_setMarketsWeight', [momaPool._address, [a1], [1, 2]])
      ).rejects.toRevert('revert MomaFarming: param length dismatch');
      await expect(
        send(momaFarming, '_setMarketsWeight', [momaPool._address, [a1, a2], [1]])
      ).rejects.toRevert('revert MomaFarming: param length dismatch');
    });

    it('should revert if add non-listed markets', async () => {
      const cBAT = await makeMToken({ momaPool, supportMarket: false });
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      await expect(
        send(momaFarming, '_setMarketsWeight', [momaPool._address, [cBAT._address], [1]])
      ).rejects.toRevert('revert market is not listed');
      await checkMarketAndPool(momaPool, 0, 0, [], []);
    });

    it('should set markets weight correctly at the first time', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2});
      const markets = [mLOW, mREP];
      const marketsAdd = [mLOW._address, mREP._address];
      const weights = [1, 2];
      await checkSetMarketsWeightState(momaPool, false, false, markets, [false, false], [0, 0], 0, 0, 0);
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      const tx = await send(momaFarming, '_setMarketsWeight', [momaPool._address, marketsAdd, weights]);

      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkSetMarketsWeightState(momaPool, false, true, markets, [true, true], weights, 3, momaInitialIndex, blockNumber);
      await checkMarketAndPool(momaPool, 1, 2, marketsAdd, [momaPool._address]);
      expect(tx.gasUsed).toBeLessThan(460000);
      expect(tx).toHaveLog(['NewMomaMarket', 0], {pool: momaPool._address, mToken: mLOW._address});
      expect(tx).toHaveLog(['NewMomaMarket', 1], {pool: momaPool._address, mToken: mREP._address});
      expect(tx).toHaveLog(['NewMarketWeight', 0], {pool: momaPool._address, mToken: mLOW._address, oldWeight: 0, newWeight: 1});
      expect(tx).toHaveLog(['NewMarketWeight', 1], {pool: momaPool._address, mToken: mREP._address, oldWeight: 0, newWeight: 2});
      expect(tx).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 0, newTotalWeight: 3});
      expect(tx).toHaveLog(['NewMomaPool', 0], {pool: momaPool._address});
    });

    it('should update market index when calling set markets weight again', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
      expect(await call(momaFarming, 'momaSpeed')).toEqualNumber(etherUnsigned(0.5e18));

      await checkSetMarketsWeightState(momaPool, false, false, [mkt], [false], [0], 0, 0, 0);
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      const tx = await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mkt._address], [1]]);
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkSetMarketsWeightState(momaPool, false, true, [mkt], [true], [1], 1, momaInitialIndex, blockNumber);
      await checkMarketAndPool(momaPool, 1, 1, [mkt._address], [momaPool._address]);
      expect(tx).toHaveLog(['NewMomaMarket', 0], {pool: momaPool._address, mToken: mkt._address});
      expect(tx).toHaveLog(['NewMarketWeight', 0], {pool: momaPool._address, mToken: mkt._address, oldWeight: 0, newWeight: 1});
      expect(tx).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 0, newTotalWeight: 1});
      expect(tx).toHaveLog(['NewMomaPool', 0], {pool: momaPool._address});
      expect(tx.gasUsed).toBeLessThan(300000);

      const nextBlock = await setBlockNumber(momaPool, mkt, 20, 'supply');
      expect(nextBlock).not.toEqualNumber(blockNumber);
      const tx2 = await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mkt._address], [2]]);
      expect(tx2.gasUsed).toBeLessThan(90000);
      await checkSetMarketsWeightState(momaPool, false, true, [mkt], [true], [2], 2, 2e36, nextBlock, true, false);
      await checkMarketAndPool(momaPool, 1, 1, [mkt._address], [momaPool._address]);
      expect(tx2).toHaveLog(['NewMarketWeight', 0], {pool: momaPool._address, mToken: mkt._address, oldWeight: 1, newWeight: 2});
      expect(tx2).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 1, newTotalWeight: 2});
    });

    it('should set lending pool markets weight correctly', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1});
      await checkSetMarketsWeightState(momaPool, false, false, [mLOW], [false], [0], 0, 0, 0);
      await upgradeLendingPool(momaPool);
      await checkSetMarketsWeightState(momaPool, true, false, [mLOW], [false], [0], 0, 0, 0);
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      const tx = await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);

      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkSetMarketsWeightState(momaPool, true, true, [mLOW], [true], [1], 1, momaInitialIndex, blockNumber);
      await checkMarketAndPool(momaPool, 1, 1, [mLOW._address], [momaPool._address]);
      expect(tx.gasUsed).toBeLessThan(310000);
      expect(tx).toHaveLog(['NewMomaMarket', 0], {pool: momaPool._address, mToken: mLOW._address});
      expect(tx).toHaveLog(['NewMarketWeight', 0], {pool: momaPool._address, mToken: mLOW._address, oldWeight: 0, newWeight: 1});
      expect(tx).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 0, newTotalWeight: 1});
      expect(tx).toHaveLog(['NewMomaPool', 0], {pool: momaPool._address});
    });

    it('should set no market weight correctly', async () => {
      await checkSetMarketsWeightState(momaPool, false, false, [], [], [], 0);
      await checkMarketAndPool(momaPool, 0, 0, [], []);
      await upgradeLendingPool(momaPool);
      const tx = await send(momaFarming, '_setMarketsWeight', [momaPool._address, [], []]);

      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkSetMarketsWeightState(momaPool, true, true, [], [], [], 0);
      await checkMarketAndPool(momaPool, 1, 0, [], [momaPool._address]);
      expect(tx.gasUsed).toBeLessThan(110000);
      expect(tx).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 0, newTotalWeight: 0});
      expect(tx).toHaveLog(['NewMomaPool', 0], {pool: momaPool._address});
    });

    it('should calculate momaTotalWeight correctly', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2});
      await upgradeLendingPool(momaPool);
      const markets = [mLOW, mREP];
      const marketsAdd = [mLOW._address, mREP._address];
      const tx1 = await send(momaFarming, '_setMarketsWeight', [momaPool._address, marketsAdd, [1, 2]]);
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkSetMarketsWeightState(momaPool, true, true, markets, [true, true], [1, 2], 3, momaInitialIndex, blockNumber);
      expect(tx1).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 0, newTotalWeight: 3});

      const tx2 = await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [0]]);
      await checkSetMarketsWeightState(momaPool, true, true, markets, [true, true], [0, 2], 2, momaInitialIndex, blockNumber + 1);
      expect(tx2).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 3, newTotalWeight: 2});

      const tx3 = await send(momaFarming, '_setMarketsWeight', [momaPool._address, marketsAdd, [11, 22]]);
      await checkSetMarketsWeightState(momaPool, true, true, markets, [true, true], [11, 22], 33, momaInitialIndex, blockNumber + 2);
      expect(tx3).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 2, newTotalWeight: 33});

      const tx4 = await send(momaFarming, '_setMarketsWeight', [momaPool._address, marketsAdd, [0, 0]]);
      await checkSetMarketsWeightState(momaPool, true, true, markets, [true, true], [0, 0], 0, momaInitialIndex, blockNumber + 3);
      expect(tx4).toHaveLog(['NewTotalWeight', 0], {oldTotalWeight: 33, newTotalWeight: 0});
    });
  });

  describe('upgradeLendingPool()', () => {
    it('should revert if not called by factory', async () => {
      await expect(
        send(momaFarming, 'upgradeLendingPool', [momaPool._address])
      ).rejects.toRevert('revert MomaFarming: not factory');
    });

    it('should upgrade correctly', async () => {
      await send(momaFarming, 'setFactory', [root]);
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkMarketBorrowState(momaPool, mLOW, 1e36, 0);
      await send(momaFarming, 'upgradeLendingPool', [momaPool._address]);
      const blockNumber2 = +(await call(momaFarming, 'getBlockNumber'));
      expect(blockNumber2).not.toEqualNumber(blockNumber);
      expect(await call(momaFarming, 'isMomaLendingPool', [momaPool._address])).toEqual(true);
      await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber2);
    });

    it('should revert if call again', async () => {
      await send(momaFarming, 'setFactory', [root]);
      await send(momaFarming, 'upgradeLendingPool', [momaPool._address]);
      await expect(
        send(momaFarming, 'upgradeLendingPool', [momaPool._address])
      ).rejects.toRevert('revert MomaFarming: can only upgrade once');
    });

  });

  describe('updateMomaBorrowIndex()', () => {
    beforeEach(async () => {
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
      await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
      await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
    });

    it('should revert if not called by moma pool', async () => {
      await expect(
        send(momaFarming, 'updateMarketBorrowState', [mLOW._address, etherExp(1.1)])
      ).rejects.toRevert('revert MomaFarming: not moma pool');
    });

    it('should calculate moma borrower index correctly', async () => {
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        momaAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + momaAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
    });

    it('should not revert or update borrowState index if not lending pool', async () => {
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(false);
      await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
    });

    it('should not revert or update borrowState index if mToken not moma market', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await upgradeLendingPool(momaPool);
      await send(mkt, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await setBlockNumber(momaPool, mkt, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mkt._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      await checkMarketsSpeed(momaPool, [mkt], [0]);
      await checkMarketWeight(momaPool, mkt, 0);
      await checkMarketBorrowState(momaPool, mkt, 0, 0);
    });

    it('should not revert or update borrowState index if weight is 0', async () => {
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await minerStop();
      send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [0]]);
      await minerStart();
      await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);

      await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      await checkMarketsSpeed(momaPool, [mLOW], [0]);
      await checkMarketWeight(momaPool, mLOW, 0);
      await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
    });

    it('should not revert or update borrowState index if marketBorrowIndex is 0', async () => {
      await upgradeLendingPool(momaPool);
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, 0]);
      await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
    });

    it('should not revert or update borrowState index if no blocks passed since last accrual', async () => {
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await minerStop();
      const tx1 = send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      const tx2 = send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await minerStart();
      await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
      await tx1.then(v=>{expect(v.gasUsed).toBeGreaterThan(59000)});
      await tx2.then(v=>{expect(v.gasUsed).toBeLessThan(44000)});
    });

    it('should not revert or update borrowState index if totalBorrows is 0', async () => {
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
      await send(mLOW, 'harnessSetTotalBorrows', [0]);
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      expect(blockNumber).not.toEqualNumber(nextBlock);
      await checkMarketBorrowState(momaPool, mLOW, 1e36, nextBlock);
    });
  });

  describe('updateMomaSupplyIndex()', () => {
    beforeEach(async () => {
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
      await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
      await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
    });

    it('should revert if not called by moma pool', async () => {
      await expect(
        send(momaFarming, 'updateMarketSupplyState', [mLOW._address])
      ).rejects.toRevert('revert MomaFarming: not moma pool');
    });

    it('should calculate moma supplier index correctly', async () => {
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      /*
        supplyTokens = 10e18
        tokenAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += tokenAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
    });

    it('should not revert or update supplyState index if mToken not moma market', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await setBlockNumber(momaPool, mkt, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mkt._address]);

      await checkMarketsSpeed(momaPool, [mkt], [0]);
      await checkMarketWeight(momaPool, mkt, 0);
      await checkMarketSupplyState(momaPool, mkt, 0, 0);
    });

    it('should not revert or update supplyState index if weight is 0', async () => {
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
      await minerStop();
      send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [0]]);
      await minerStart();
      await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);

      await setBlockNumber(momaPool, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);

      await checkMarketsSpeed(momaPool, [mLOW], [0]);
      await checkMarketWeight(momaPool, mLOW, 0);
      await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
    });

    it('should not revert or update supplyState index if no blocks passed since last accrual', async () => {
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
      await minerStop();
      const tx1 = send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      const tx2 = send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await minerStart();
      await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
      await tx1.then(v=>{expect(v.gasUsed).toBeGreaterThan(57000)});
      await tx2.then(v=>{expect(v.gasUsed).toBeLessThan(43000)});
    });

    it('should not revert or update supplyState index if totalSupply is 0', async () => {
      blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      await send(mLOW, 'harnessSetTotalSupply', [0]);
      await checkMarketSupplyState(momaPool, mLOW, 1e36, blockNumber);
      await checkMarketWeight(momaPool, mLOW, 1);
      const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      expect(blockNumber).not.toEqualNumber(nextBlock);
      await checkMarketSupplyState(momaPool, mLOW, 1e36, nextBlock);
    });

    it('should not matter if the index is updated multiple times', async () => {
      await send(mLOW, 'harnessSetTotalSupply', [0]);
      await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [0]]);
      await checkMarketsSpeed(momaPool, [mLOW], [0]);

      await quickMint(mLOW, a2, etherUnsigned(1e18));
      await quickMint(mLOW, a3, etherUnsigned(3e18));

      expect(await momaAccrued(momaFarming, a2)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a3)).toEqualNumber(0);

      await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
      await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
      await setBlockNumber(momaPool, mLOW, 20, 'supply');
      const txT1 = await send(mLOW, 'transfer', [a2, 0], {from: a3});
      /*
        supplyTokens     = 1e18 + 3e18 = 4e18
        tokenAccrued     = deltaBlocks * supplySpeed
                         = 20 * 0.5e18 = 10e18
        newIndex        += tokenAccrued * 1e36 / supplyTokens
                         = 1e36 + 10e18 * 1e36 / 4e18 = 3.5e36
        supplierAccrued += supplierTokens * deltaIndex
                         = 1e18 * (3.5e36 - 1e36) / 1e36 = 2.5e18
      */
      expect(await momaAccrued(momaFarming, a2)).toEqualNumber(2.5e18);
      expect(await momaAccrued(momaFarming, a3)).toEqualNumber(7.5e18);

      await setBlockNumber(momaPool, mLOW, 10, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await setBlockNumber(momaPool, mLOW, 10, 'supply');

      const txT2 = await send(mLOW, 'transfer', [a3, 0], {from: a2});

      expect(await momaAccrued(momaFarming, a2)).toEqualNumber(5e18);
      expect(await momaAccrued(momaFarming, a3)).toEqualNumber(15e18);

      expect(txT1.gasUsed).toBeLessThan(200000);
      expect(txT1.gasUsed).toBeGreaterThan(190000);
      expect(txT2.gasUsed).toBeLessThan(170000);
      expect(txT2.gasUsed).toBeGreaterThan(160000);
    });
  });

  describe('distributeBorrowerMoma()', () => {
    beforeEach(async () => {
      mergeInterface(momaPool, momaFarming);
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
      await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, etherDouble(6), 10]);
      await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mLOW._address, a1, etherDouble(1)]);
    });

    it('should revert if not called by moma pool', async () => {
      await expect(
        send(momaFarming, 'distributeBorrowerMoma', [mLOW._address, a1, etherExp(1.1)])
      ).rejects.toRevert('revert MomaFarming: not moma pool');
    });

    it('should distribute moma and update borrow index checkpoint correctly for repeat time user', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);
      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 momaBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 27.5e18 token
        borrowerAmount = borrowBalanceStored * 1e18 / borrow idx
                       = (5.5e18 * 1.1e18 / 1e18) * 1e18 / 1.1e18 = 5.5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5.5e18 * 5e36 / 1e36 = 27.5e18
      */
      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(27.5e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrower', {
        pool: momaPool._address,
        mToken: mkt._address,
        borrower: a1,
        momaDelta: etherUnsigned(27.5e18).toFixed(),
        marketBorrowIndex: etherDouble(6).toFixed()
      });
    });

    it('should not revert or distribute if not lending pool', async () => {
      const mkt = mLOW;
      expect(await call(momaPool, 'isLendingPool')).toEqual(false);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(1));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should not revert or distribute if mToken not moma market, e.g borrowIndex is 0', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await upgradeLendingPool(momaPool);
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await checkMarketBorrowState(momaPool, mkt, 0, 0);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should not revert or distribute if marketBorrowIndex is 0', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, 0]);

      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(1));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should update borrow index checkpoint but not tokenAccrued for first time user', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mkt._address, a1, etherUnsigned(0)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);
      
      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrower', {
        pool: momaPool._address,
        mToken: mkt._address,
        borrower: a1,
        momaDelta: etherUnsigned(0).toFixed(),
        marketBorrowIndex: etherDouble(6).toFixed()
      });
    });
    
    it('should update borrow index checkpoint but not tokenAccrued if borrowBalanceStored is 0', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      await send(mkt, 'harnessSetBorrowIndex', [0]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(mkt, 'borrowBalanceStored', [a1])).toEqualNumber(0);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrower', {
        pool: momaPool._address,
        mToken: mkt._address,
        borrower: a1,
        momaDelta: etherUnsigned(0).toFixed(),
        marketBorrowIndex: etherDouble(6).toFixed()
      });
    });

    it('should distribute moma and update borrow index checkpoint correctly for two markets', async () => {
      mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
      await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(momaFarming, "setMarketBorrowState", [momaPool._address, mERP._address, etherDouble(10), 100]);
      await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);

      const mkt = mLOW;
      await upgradeLendingPool(momaPool);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(27.5e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrower', {
        pool: momaPool._address,
        mToken: mkt._address,
        borrower: a1,
        momaDelta: etherUnsigned(27.5e18).toFixed(),
        marketBorrowIndex: etherDouble(6).toFixed()
      });

      const tx2 = await send(momaPool, "harnessDistributeBorrowerFarm", [mERP._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, mERP, a1)).toEqualNumber(etherDouble(10));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(27.5e18 + 44e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx2).toHaveLog('DistributedBorrower', {
        pool: momaPool._address,
        mToken: mERP._address,
        borrower: a1,
        momaDelta: etherUnsigned(44e18).toFixed(),
        marketBorrowIndex: etherDouble(10).toFixed()
      });
    });
  });

  describe('distributeSupplierMoma()', () => {
    beforeEach(async () => {
      mergeInterface(momaPool, momaFarming);
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(momaFarming, "setMarketSupplyState", [momaPool._address, mLOW._address, etherDouble(6), 10]);
    });

    it('should revert if not called by moma pool', async () => {
      await expect(
        send(momaFarming, 'distributeSupplierMoma', [mLOW._address, a1])
      ).rejects.toRevert('revert MomaFarming: not moma pool');
    });

    it('should distribute moma and update supply index checkpoint correctly for first time user', async () => {
      const mkt = mLOW;
      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(0);
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 momaSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 token:
        supplierTokens   = 5e18
        deltaIndex       = marketStoredIndex - userStoredIndex
                         = 6e36 - 1e36 = 5e36
        suppliedAccrued += supplierTokens * deltaIndex / 1e36
                         = 5e18 * 5e36 / 1e36 = 25e18
      */
      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(25e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplier', {
        pool: momaPool._address,
        mToken: mkt._address,
        supplier: a1,
        momaDelta: etherUnsigned(25e18).toFixed(),
        marketSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should distribute moma and update supply index checkpoint correctly for repeat time user', async () => {
      const mkt = mLOW;
      await send(momaFarming, "setMarketSupplierIndex", [momaPool._address, mkt._address, a1, etherDouble(2)]);
      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(2));
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */
      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(20e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplier', {
        pool: momaPool._address,
        mToken: mkt._address,
        supplier: a1,
        momaDelta: etherUnsigned(20e18).toFixed(),
        marketSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should not revert or distribute if mToken not moma market, e.g supplyIndex is 0', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await checkMarketSupplyState(momaPool, mkt, 0, 0);

      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);

      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should update supply index checkpoint but not tokenAccrued if supplierTokens is 0', async () => {
      const mkt = mLOW;
      expect(await balanceOf(mkt, a2)).toEqualNumber(0);
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a2]);

      expect(await supplierIndex(momaPool, mkt, a2)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a2)).toEqualNumber(0);
      expect(await balanceOf(moma, a2)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplier', {
        pool: momaPool._address,
        mToken: mkt._address,
        supplier: a2,
        momaDelta: etherUnsigned(0).toFixed(),
        marketSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should distribute moma and update supply index checkpoint correctly for two markets', async () => {
      mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mERP, "harnessSetBalance", [a1, etherUnsigned(10e18)]);
      await send(momaFarming, "setMarketSupplyState", [momaPool._address, mERP._address, etherDouble(8), 100]);

      const mkt = mLOW;
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);

      expect(await supplierIndex(momaPool, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(25e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplier', {
        pool: momaPool._address,
        mToken: mkt._address,
        supplier: a1,
        momaDelta: etherUnsigned(25e18).toFixed(),
        marketSupplyIndex: etherDouble(6).toFixed()
      });

      const tx2 = await send(momaPool, "harnessDistributeSupplierFarm", [mERP._address, a1]);

      expect(await supplierIndex(momaPool, mERP, a1)).toEqualNumber(etherDouble(8));
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(25e18 + 70e18);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(tx2).toHaveLog('DistributedSupplier', {
        pool: momaPool._address,
        mToken: mERP._address,
        supplier: a1,
        momaDelta: etherUnsigned(70e18).toFixed(),
        marketSupplyIndex: etherDouble(8).toFixed()
      });
    });
  });

  describe('claim', () => {
    const accrued = 100;

    beforeEach(async () => {
      await send(moma, 'transfer', [momaFarming._address, accrued]);
      await send(momaFarming, 'setMomaAccrued', [a1, accrued]);
    });

    it('should claim MOMA correctly', async () => {
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(accrued);
      const tx = await send(momaFarming, 'claim', {from: a1});
      expect(await balanceOf(moma, a1)).toEqualNumber(accrued);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('MomaClaimed', {
        user: a1,
        accrued: accrued,
        claimed: accrued,
        notClaimed: 0
      });
    });

    it('should not transfer MOMA and not change accured if accured is 0', async () => {
      await send(momaFarming, 'setMomaAccrued', [a1, 0]);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      const tx = await send(momaFarming, 'claim', {from: a1});
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('MomaClaimed', {
        user: a1,
        accrued: 0,
        claimed: 0,
        notClaimed: 0
      });
    });

    it('should not transfer MOMA and not change accured if not have enough fund', async () => {
      await send(momaFarming, 'setMomaAccrued', [a1, accrued + 1]);
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(accrued + 1);
      const tx = await send(momaFarming, 'claim', {from: a1});
      expect(await balanceOf(moma, a1)).toEqualNumber(0);
      expect(await momaAccrued(momaFarming, a1)).toEqualNumber(accrued + 1);
      expect(tx).toHaveLog('MomaClaimed', {
        user: a1,
        accrued: accrued + 1,
        claimed: 0,
        notClaimed: accrued + 1
      });
    });
  });

  describe('dclaim', () => {
    describe('only borrow', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mLOW._address, a1, etherDouble(1)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
        await send(moma, 'transfer', [momaFarming._address, etherExp(1000)]);
      });

      it('should distribute and claim MOMA correctly for one pool one market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address], false, true], {from: a1});
        /*
          100 blocks, 11e18 origin total borrows, 0.5e18 borrowSpeed

          borrowAmt        = totalBorrows * 1e18 / borrowIdx
                           = 11e18 * 1e18 / 1.1e18 = 10e18
          tokenAccrued     = deltaBlocks * borrowSpeed
                           = 100 * 0.5e18 = 50e18
          newIndex        += 1e36 + tokenAccrued * 1e36 / borrowAmt
                           = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
          borrowerAmount   = borrowBalanceStored * 1e18 / borrow idx
                           = (5.5e18 * 1.1e18 / 1e18) * 1e18 / 1.1e18 = 5.5e18
          deltaIndex       = newIndex - userStoredIndex
                           = 6e36 - 1e36 = 5e36
          borrowerAccrued  = borrowerAmount * deltaIndex / 1e36
                           = 5.5e18 * 5e36 / 1e36 = 27.5e18
        */
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(120000);
        expect(tx).toHaveLog('DistributedBorrower', {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18).toFixed(),
          claimed: etherUnsigned(27.5e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two same market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mLOW._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(130000);
        expect(tx).toHaveLog('DistributedBorrower', {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18).toFixed(),
          claimed: etherUnsigned(27.5e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool, [mERP], [etherUnsigned(1e18)]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mERP._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(170000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for two pools two markets', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool2._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [2]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(1e18)]);
        await upgradeLendingPool(momaPool);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketBorrowState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool2, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(180000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for two pools two markets with same pools', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool2._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [2]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(1e18)]);
        await upgradeLendingPool(momaPool);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketBorrowState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address, momaPool._address, momaPool2._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool2, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(210000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18).toFixed(),
          notClaimed: 0
        });
      });
    });

    describe('only supply', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
        await send(moma, 'transfer', [momaFarming._address, etherExp(1000)]);
      });

      it('should distribute and claim MOMA correctly for one pool one market', async () => {
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address], true, false], {from: a1});
        /*
          supplyTokens      = 10e18
          tokenAccrued      = deltaBlocks * supplySpeed
                            = 100 * 0.5e18 = 50e18
          newIndex         += tokenAccrued * 1e36 / supplyTokens
                            = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
          supplierTokens    = 5e18
          deltaIndex        = newIndex - userInitIndex
                            = 6e36 - 1e36 = 5e36
          suppliedAccrued  += supplierTokens * deltaIndex / 1e36
                            = 5e18 * 5e36 / 1e36 = 25e18
        */
        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(25e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(130000);
        expect(tx).toHaveLog('DistributedSupplier', {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(25e18).toFixed(),
          claimed: etherUnsigned(25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two same market', async () => {
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mLOW._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(25e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(140000);
        expect(tx).toHaveLog('DistributedSupplier', {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(25e18).toFixed(),
          claimed: etherUnsigned(25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool, [mERP], [etherUnsigned(1e18)]);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mERP._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(25e18 + 40e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(190000);
        expect(tx).toHaveLog('DistributedSupplier', {
          pool: momaPool._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(40e18).toFixed(),
          marketSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for two pools two markets', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(2.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [4]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(2e18)]);
        await upgradeLendingPool(momaPool);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketSupplyState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketSupplyState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool2, mERP, 41e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(25e18 + 80e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(200000);
        expect(tx).toHaveLog(['DistributedSupplier', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(80e18).toFixed(),
          marketSupplyIndex: etherDouble(41).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(25e18 + 80e18).toFixed(),
          claimed: etherUnsigned(25e18 + 80e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for two pools two markets and same pools', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(2.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [4]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(2e18)]);
        await upgradeLendingPool(momaPool);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketSupplyState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketSupplyState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'supply');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address, momaPool._address, momaPool2._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool2, mERP, 41e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(25e18 + 80e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(220000);
        expect(tx).toHaveLog(['DistributedSupplier', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(80e18).toFixed(),
          marketSupplyIndex: etherDouble(41).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(25e18 + 80e18).toFixed(),
          claimed: etherUnsigned(25e18 + 80e18).toFixed(),
          notClaimed: 0
        });
      });
    });

    describe('borrow & supply', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mLOW._address, a1, etherDouble(1)]);
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
        await send(moma, 'transfer', [momaFarming._address, etherExp(1000)]);
        await upgradeLendingPool(momaPool);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
      });

      it('should distribute and claim MOMA correctly for one pool one market', async () => {
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 25e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(180000);
        expect(tx).toHaveLog('DistributedBorrower', {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplier', {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 25e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two same market', async () => {
        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mLOW._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 25e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(200000);
        expect(tx).toHaveLog('DistributedBorrower', {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplier', {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 25e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim MOMA correctly for one pool two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool, [mERP], [etherUnsigned(1e18)]);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [momaPool._address, [mLOW._address, mERP._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(290000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 1], {
          pool: momaPool._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(40e18).toFixed(),
          marketSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool2._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [2]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(1e18)]);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketBorrowState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketSupplyState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketSupplyState(momaPool2, mERP, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool2, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool2, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(290000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(40e18).toFixed(),
          marketSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets with same pool', async () => {
        const from = a2;
        const momaPool2 = await makeMomaPool({ factory: momaPool.factory, addPriceOracle: true, from});
        await send(momaPool2, '_setPendingAdmin', [root], {from});
        await send(momaPool2, '_acceptAdmin');
        mERP = await makeMToken({momaPool: momaPool2, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool2._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, 'setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool2._address, [mERP._address], [2]]);
        await checkMarketsSpeed(momaPool, [mLOW], [etherUnsigned(0.5e18)]);
        await checkMarketsSpeed(momaPool2, [mERP], [etherUnsigned(1e18)]);
        await upgradeLendingPool(momaPool2);
        await send(momaFarming, "setMarketBorrowState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool2._address, mERP._address, momaInitialIndex, blockNumber]);
        await checkMarketSupplyState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool, mLOW, 1e36, blockNumber);
        await checkMarketSupplyState(momaPool2, mERP, 1e36, blockNumber);
        await checkMarketBorrowState(momaPool2, mERP, 1e36, blockNumber);

        const nextBlock = await setBlockNumber(momaPool, mLOW, 100, 'borrow');
        expect(await balanceOf(moma, a1)).toEqualNumber(0);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        const tx = await send(momaFarming, 'dclaim', [[momaPool._address, momaPool2._address, momaPool._address, momaPool2._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool2, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool2, mERP, 21e36, nextBlock);
        expect(await balanceOf(moma, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await momaAccrued(momaFarming, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(340000);
        expect(tx).toHaveLog(['DistributedBorrower', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          borrower: a1,
          momaDelta: etherUnsigned(27.5e18).toFixed(),
          marketBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedBorrower', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          borrower: a1,
          momaDelta: etherUnsigned(114e18).toFixed(),
          marketBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 0], {
          pool: momaPool._address,
          mToken: mLOW._address,
          supplier: a1,
          momaDelta: etherUnsigned(25e18).toFixed(),
          marketSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog(['DistributedSupplier', 1], {
          pool: momaPool2._address,
          mToken: mERP._address,
          supplier: a1,
          momaDelta: etherUnsigned(40e18).toFixed(),
          marketSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('MomaClaimed', {
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });
    });
  });

  describe('undistributed', () => {
    describe('only borrow', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mLOW._address, a1, etherDouble(1)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
        await upgradeLendingPool(momaPool);
      });

      it('should return zero for no borrow user', async () => {
        expect(await call(momaFarming, 'undistributed', [a2, momaPool._address, mLOW._address, false, true])).toEqualNumber(0);
      });

      it('should return zero for no moma market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);

        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, false, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, mERP, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, false, true])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, false, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, mLOW, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, false, true])).toEqualNumber(27.5e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);

        await setBlockNumber(momaPool, mLOW, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, false, true])).toEqualNumber(27.5e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, false, true])).toEqualNumber(114e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, false, true])).toEqual([27.5e18.toString(), 114e18.toString()]);

        await setBlockNumber(momaPool, mLOW, 201, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, false, true])).toEqualNumber(55e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, false, true])).toEqualNumber(234e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, false, true])).toEqual([55e18.toString(), 234e18.toString()]);
      });
    });

    describe('only supply', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
      });

      it('should return zero for no supply user', async () => {
        expect(await call(momaFarming, 'undistributed', [a2, momaPool._address, mLOW._address, true, false])).toEqualNumber(0);
      });

      it('should return zero for no moma market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(5e18)]);

        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, false])).toEqualNumber(0);
        await setBlockNumber(momaPool, mERP, 101, 'supply');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, false])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, false])).toEqualNumber(0);
        await setBlockNumber(momaPool, mLOW, 101, 'supply');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, false])).toEqualNumber(25e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);

        await setBlockNumber(momaPool, mLOW, 101, 'supply');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, false])).toEqualNumber(25e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, false])).toEqualNumber(40e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, true, false])).toEqual([25e18.toString(), 40e18.toString()]);

        await setBlockNumber(momaPool, mLOW, 201, 'supply');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, false])).toEqualNumber(50e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, false])).toEqualNumber(80e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, true, false])).toEqual([50e18.toString(), 80e18.toString()]);
      });
    });

    describe('borrow & supply', () => {
      beforeEach(async () => {
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mLOW._address, a1, etherDouble(1)]);
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(0.5e18)]);
        await send(momaFarming, '_setMarketsWeight', [momaPool._address, [mLOW._address], [1]]);
        blockNumber = +(await call(momaFarming, 'getBlockNumber'));
        await send(moma, 'transfer', [momaFarming._address, etherExp(1000)]);
        await upgradeLendingPool(momaPool);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);
      });

      it('should return zero for no borrow & supply user', async () => {
        expect(await call(momaFarming, 'undistributed', [a2, momaPool._address, mLOW._address, true, true])).toEqualNumber(0);
      });

      it('should return zero for no moma market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(5e18)]);

        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, mERP, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, true])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        await setBlockNumber(momaPool, mLOW, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, true])).toEqualNumber(27.5e18 + 25e18);

        await setBlockNumber(momaPool, mLOW, 201, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, true])).toEqualNumber(55e18 + 50e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaFarming, "setMarketBorrowerIndex", [momaPool._address, mERP._address, a1, etherDouble(2)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaFarming, '_setMomaSpeed', [etherUnsigned(1.5e18)]);
        await send(momaFarming, 'setMarketsWeight', [momaPool._address, [mERP._address], [2]]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketSupplyState", [momaPool._address, mERP._address, momaInitialIndex, blockNumber]);
        await send(momaFarming, "setMarketBorrowState", [momaPool._address, mLOW._address, momaInitialIndex, blockNumber]);

        await setBlockNumber(momaPool, mLOW, 101, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, true])).toEqualNumber(27.5e18 + 25e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, true])).toEqualNumber(114e18 + 40e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, true, true])).toEqual([(27.5e18 + 25e18).toString(), (114e18 + 40e18).toString()]);

        await setBlockNumber(momaPool, mLOW, 201, 'borrow');
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mLOW._address, true, true])).toEqualNumber(55e18 + 50e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, mERP._address, true, true])).toEqualNumber(234e18 + 80e18);
        expect(await call(momaFarming, 'undistributed', [a1, momaPool._address, true, true])).toEqual([(55e18 + 50e18).toString(), (234e18 + 80e18).toString()]);
      });
    });
  });
});
