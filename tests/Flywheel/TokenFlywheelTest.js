const {
  makeMomaPool,
  makeMToken,
  makeToken,
  balanceOf,
  quickMint,
  upgradeLendingPool
} = require('../Utils/Moma');
const {
  etherExp,
  etherDouble,
  etherUnsigned,
  mineBlockNumber,
  minerStop,
  minerStart
} = require('../Utils/Ethereum');

const momaInitialIndex = etherUnsigned(1e36);

async function tokenAccrued(momaPool, token, user) {
  return etherUnsigned(await call(momaPool, 'getTokenUserAccrued', [token._address, user]));
}

async function supplierIndex(momaPool, token, market, user) {
  return await call(momaPool, "getMarketSupplierIndex", [token._address, market._address, user]);
}

async function borrowerIndex(momaPool, token, market, user) {
  return await call(momaPool, "getMarketBorrowerIndex", [token._address, market._address, user]);
}

async function checkMarketSupplyState(momaPool, token, market, expectedIndex, expectedBlock) {
  const supplyState = await call(momaPool, 'getMarketSupplyState', [token._address, market._address]);
  expect(supplyState['0']).toEqualNumber(expectedIndex);
  expect(supplyState['1']).toEqualNumber(expectedBlock);
}

async function checkMarketBorrowState(momaPool, token, market, expectedIndex, expectedBlock) {
  const borrowState = await call(momaPool, 'getMarketBorrowState', [token._address, market._address]);
  expect(borrowState['0']).toEqualNumber(expectedIndex);
  expect(borrowState['1']).toEqualNumber(expectedBlock);
}

async function checkState(momaPool, tokens, markets, expectedIndex, expectedBlock, supply=true, borrow=true) {
  for (let token of tokens) {
    for (let market of markets) {
      if (supply) await checkMarketSupplyState(momaPool, token, market, expectedIndex, expectedBlock);
      if (borrow) await checkMarketBorrowState(momaPool, token, market, expectedIndex, expectedBlock);
    }
  }
}

async function checkSetTokensSpeedState(momaPool, token, markets, expectedIsTokenMarket, expectedSpeed, expectedTokenMarkets, expectedIndex, expectedBlock, supply=true, borrow=true) {
  let n = 0;
  for (let market of markets) {
    expect(await call(momaPool, 'isTokenMarket', [token._address, market._address])).toEqual(expectedIsTokenMarket[n]);
    expect(await call(momaPool, 'getTokenMarketSpeed', [token._address, market._address])).toEqualNumber(expectedSpeed[n]);
    n++;
  }
  expect(await call(momaPool, 'getTokenMarkets', [token._address])).toEqual(expectedTokenMarkets);
  await checkState(momaPool, [token], markets, expectedIndex, expectedBlock, supply=supply, borrow=borrow);
}

async function setBlockNumber(momaPool, token, mkt, number, type='supply') {
  let func;
  if (type == 'supply') { func = 'getMarketSupplyState' } else func = 'getMarketBorrowState';
  const state = await call(momaPool, func, [token._address, mkt._address]);
  const blockNumber = +state['1'];
  await mineBlockNumber(blockNumber + number - 2);
  expect(await call(momaPool.factory.farmingDelegate, 'getBlockNumber')).toEqualNumber(blockNumber + number - 1);
  return blockNumber + number;
}

describe('Tokens Farming Flywheel', () => {
  let root, a1, a2, a3, accounts;
  let token1, token2;
  let blockNumber, startBlock, endBlock;
  let momaPool, farmingDelegate, mLOW, mREP, mZRX, mEVIL;
  let interestRateModelOpts = {borrowRate: 0.000001};
  beforeEach(async () => {
    [root, a1, a2, a3, ...accounts] = saddle.accounts;
    momaPool = await makeMomaPool({ kind: 'harness', addPriceOracle: true, addFarmingDelegate: true, addMomaFarming: true });
    farmingDelegate = momaPool.factory.farmingDelegate;
    blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
    startBlock = blockNumber + 10;
    endBlock = blockNumber + 1010;
  });

  describe('_setTokenFarm()', () => {
    beforeAll(async () => {
      token1 = await makeToken({symbol: 'TOKEN1'});
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock], {from: a1})
      ).rejects.toRevert('revert only admin can add farm token');
    });

    it('should revert if end less than start', async () => {
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, startBlock, startBlock - 1])
      ).rejects.toRevert('revert end less than start');
    });

    it('should revert if not first set or this round is not end', async () => {
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock])
      ).rejects.toRevert('revert not first set or this round is not end');
    });

    it('should revert if start less than this block number', async () => {
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, blockNumber, endBlock])
      ).rejects.toRevert('revert start must largger than this block number');
    });

    it('should revert if start too large', async () => {
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, 2 ** 32, 2 ** 32 + 1])
      ).rejects.toRevert('revert start block number exceeds 32 bits');
    });

    it('should revert if end too large', async () => {
      await expect(
        send(momaPool, '_setTokenFarm', [token1._address, 2 ** 31, 2 ** 32 + 1])
      ).rejects.toRevert('revert end block number exceeds 32 bits');
    });

    it('should set token farm correctly at the first time', async () => {
      const farmStates = await call(momaPool, 'farmStates', [token1._address]);
      expect(farmStates.startBlock).toEqualNumber(0);
      expect(farmStates.endBlock).toEqualNumber(0);
      expect(await call(momaPool, 'getAllTokens')).toEqual([]);
      expect(await call(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock])).toEqualNumber(0);
      const tx = await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      const farmStates2 = await call(momaPool, 'farmStates', [token1._address]);
      expect(farmStates2.startBlock).toEqualNumber(startBlock);
      expect(farmStates2.endBlock).toEqualNumber(endBlock);
      expect(await call(momaPool, 'getAllTokens')).toEqual([token1._address]);

      expect(tx).toHaveLog('TokenFarmUpdated', {
        token: token1._address,
        oldStart: 0,
        oldEnd: 0,
        newStart: startBlock,
        newEnd: endBlock
      });
    });

    it('should set token farm correctly at the second time with no token markets', async () => {
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      const farmStates = await call(momaPool, 'farmStates', [token1._address]);
      expect(farmStates.startBlock).toEqualNumber(startBlock);
      expect(farmStates.endBlock).toEqualNumber(endBlock);
      expect(await call(momaPool, 'getAllTokens')).toEqual([token1._address]);

      await mineBlockNumber(endBlock);
      const tx = await send(momaPool, '_setTokenFarm', [token1._address, endBlock + 3, endBlock + 200]);
      const farmStates2 = await call(momaPool, 'farmStates', [token1._address]);
      expect(farmStates2.startBlock).toEqualNumber(endBlock + 3);
      expect(farmStates2.endBlock).toEqualNumber(endBlock + 200);
      expect(await call(momaPool, 'getAllTokens')).toEqual([token1._address]);

      expect(tx).toHaveLog('TokenFarmUpdated', {
        token: token1._address,
        oldStart: startBlock,
        oldEnd: endBlock,
        newStart: endBlock + 3,
        newEnd: endBlock + 200
      });
    });
    
    it('should set token farm correctly in the second time with token markets', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock + 100, endBlock]);
      await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address, mREP._address], [1, 1]]);

      await checkState(momaPool, [token1], [mLOW, mREP], momaInitialIndex, startBlock + 100);
      await mineBlockNumber(endBlock);
      const tx = await send(momaPool, '_setTokenFarm', [token1._address, endBlock + 3, endBlock + 200]);
      await checkState(momaPool, [token1], [mLOW, mREP], momaInitialIndex, endBlock + 3);
    });
  });

  describe('_grantToken()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      await send(token1, 'transfer', [momaPool._address, etherUnsigned(50e18)], {from: root});
    });

    it('should revert if not called by admin', async () => {
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(50e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      await expect(
        send(momaPool, '_grantToken', [token1._address, a1, 100], {from: a1})
      ).rejects.toRevert('revert only admin can grant token');
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(50e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
    });

    it('should award token if called by admin', async () => {
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(50e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      const tx = await send(momaPool, '_grantToken', [token1._address, a1, 100]);
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(etherUnsigned(50e18).minus(100));
      expect(await balanceOf(token1, a1)).toEqualNumber(100);

      expect(tx).toHaveLog('TokenGranted', {
        token: token1._address,
        recipient: a1,
        amount: 100
      });
    });

    it('should revert if insufficient token', async () => {
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(50e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      await expect(
        send(momaPool, '_grantToken', [token1._address, a1, etherUnsigned(1e20)])
      ).rejects.toRevert('revert insufficient token for grant');
      expect(await balanceOf(token1, momaPool._address)).toEqualNumber(50e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
    });
  });

  describe('getTokenMarkets()', () => {
    it('should return the token markets', async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      mZRX = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
      const markets = [mLOW._address, mREP._address, mZRX._address]
      await send(momaPool, '_setTokensSpeed', [token1._address, markets, markets.map((c) => 1)]);
      expect(await call(momaPool, 'getTokenMarkets', [token1._address])).toEqual(markets);

      await send(momaPool, '_setTokensSpeed', [token1._address, [mREP._address, mZRX._address], [0, 0]]);
      expect(await call(momaPool, 'getTokenMarkets', [token1._address])).toEqual(markets);
    });
  });

  describe('getAllMarkets()', () => {
    it('should return all the markets', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      mZRX = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 3, interestRateModelOpts});
      expect(await call(momaPool, 'getAllMarkets')).toEqual([mLOW._address, mREP._address, mZRX._address]);
    });
  });

  describe('_setTokensSpeed()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(momaPool, '_setTokensSpeed', [token1._address, [token1._address], [1]], {from: a1})
      ).rejects.toRevert('revert only admin can set tokens speed');
    });

    it('should revert if token not added', async () => {
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      await expect(
        send(momaPool, '_setTokensSpeed', [token2._address, [token1._address], [1]])
      ).rejects.toRevert('revert token not added');
    });

    it('should revert if param length dismatch', async () => {
      await expect(
        send(momaPool, '_setTokensSpeed', [token1._address, [token1._address], [1, 2]])
      ).rejects.toRevert('revert param length dismatch');
      await expect(
        send(momaPool, '_setTokensSpeed', [token1._address, [token1._address, token1._address], [1]])
      ).rejects.toRevert('revert param length dismatch');
    });

    it('should revert if add non-listed markets', async () => {
      const cBAT = await makeMToken({ momaPool, supportMarket: false });
      expect(await call(momaPool, 'getAllMarkets')).toEqual([]);
      await expect(
        send(momaPool, '_setTokensSpeed', [token1._address, [cBAT._address], [1]])
      ).rejects.toRevert('revert market is not listed');

      expect(await call(momaPool, 'getTokenMarkets', [token1._address])).toEqual([]);
    });

    it('should set tokens speed correctly at the first time', async () => {
      mLOW = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 1, interestRateModelOpts});
      mREP = await makeMToken({momaPool, supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      const markets = [mLOW, mREP];
      const marketsAdd = [mLOW._address, mREP._address];
      const speeds = [1, 2];
      await checkSetTokensSpeedState(momaPool, token1, markets, [false, false], [0, 0], [], 0, 0);
      const tx = await send(momaPool, '_setTokensSpeed', [token1._address, marketsAdd, speeds]);

      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      await checkSetTokensSpeedState(momaPool, token1, markets, [true, true], speeds, marketsAdd, momaInitialIndex, blockNumber);

      expect(tx).toHaveLog('NewTokenMarket', {
        token: token1._address,
        mToken: mREP._address
      });
      expect(tx).toHaveLog('TokenSpeedUpdated', {
        token: token1._address,
        mToken: mREP._address,
        oldSpeed: 0,
        newSpeed: 2
      });
    });

    it('should update market index when calling setTokensSpeed again', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, interestRateModelOpts});
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);

      await checkSetTokensSpeedState(momaPool, token1, [mkt], [false], [0], [], 0, 0);
      let tx = await send(momaPool, '_setTokensSpeed', [token1._address, [mkt._address], [etherExp(0.5)]]);
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      await checkSetTokensSpeedState(momaPool, token1, [mkt], [true], [etherExp(0.5)], [mkt._address], momaInitialIndex, blockNumber);
      expect(tx).toHaveLog('NewTokenMarket', {
        token: token1._address,
        mToken: mkt._address
      });
      expect(tx).toHaveLog('TokenSpeedUpdated', {
        token: token1._address,
        mToken: mkt._address,
        oldSpeed: 0,
        newSpeed: etherExp(0.5)
      });
      const nextBlock = await setBlockNumber(momaPool, token1, mkt, 20, 'supply');
      tx = await send(momaPool, '_setTokensSpeed', [token1._address, [mkt._address], [etherExp(1)]]);
      await checkSetTokensSpeedState(momaPool, token1, [mkt], [true], [etherExp(1)], [mkt._address], 2e36, nextBlock, true, false);
      expect(tx).toHaveLog('TokenSpeedUpdated', {
        token: token1._address,
        mToken: mkt._address,
        oldSpeed: etherExp(0.5),
        newSpeed: etherExp(1)
      });
    });
  });

  describe('updateTokenBorrowIndex()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 10;
      endBlock = blockNumber + 1010;
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
      await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
      await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
    });

    it('should calculate token borrower index correctly', async () => {
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      /*
        100 blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed

        borrowAmt   = totalBorrows * 1e18 / borrowIdx
                    = 11e18 * 1e18 / 1.1e18 = 10e18
        tokenAccrued = deltaBlocks * borrowSpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += 1e36 + tokenAccrued * 1e36 / borrowAmt
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);
    });

    it('should not revert or update borrowState index if not lending pool', async () => {
      await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(false);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 1e36, startBlock);
    });

    it('should not revert or update borrowState index if mToken not in token markets', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await upgradeLendingPool(momaPool);
      await send(mkt, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
      await setBlockNumber(momaPool, token1, mkt, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mkt._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mkt._address])).toEqualNumber(0);
      await checkMarketBorrowState(momaPool, token1, mkt, 0, 0);
    });

    it('should not revert or update borrowState index if token speed is 0', async () => {
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await minerStop();
      send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [0]]);
      await minerStart();
      await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);

      const nextBlock2 = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(0);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 21e36, nextBlock2);
    });

    it('should not revert or update borrowState index if marketBorrowIndex is 0', async () => {
      await upgradeLendingPool(momaPool);
      await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, 0]);

      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 1e36, startBlock);
    });

    it('should not revert or update borrowState index if no blocks passed since last accrual', async () => {
      await upgradeLendingPool(momaPool);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      await mineBlockNumber(startBlock - 2);
      expect(await call(farmingDelegate, 'getBlockNumber')).toEqualNumber(startBlock - 1);
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);
    });

    it('should not revert or update borrowState index if blockNumber less than startBlock', async () => {
      await upgradeLendingPool(momaPool);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeLessThan(startBlock - 1);
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);
    });

    it('should calculate token borrower index correctly after endBlock', async () => {
      await upgradeLendingPool(momaPool);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await mineBlockNumber(endBlock + 100);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock);
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await checkMarketBorrowState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 101e36, endBlock);
    });

    it('should not revert or update borrowState index if endBlock less than borrowState.block', async () => {
      await upgradeLendingPool(momaPool);
      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, startBlock);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await mineBlockNumber(endBlock + 100);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock);
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await checkMarketBorrowState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 101e36, endBlock);

      await mineBlockNumber(endBlock + 1000);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock + 100);
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);
      await checkMarketBorrowState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 101e36, endBlock);
    });

    it('should not revert or update borrowState index if totalBorrows is 0', async () => {
      await send(mLOW, 'harnessSetTotalBorrows', [0]);
      await upgradeLendingPool(momaPool);
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
      await send(momaPool, 'harnessUpdateFarmBorrowIndex', [mLOW._address, etherExp(1.1)]);

      await checkMarketBorrowState(momaPool, token1, mLOW, 1e36, nextBlock);
      await checkMarketBorrowState(momaPool, token2, mLOW, 1e36, nextBlock);
    });
  });

  describe('updateTokenSupplyIndex()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 100;
      endBlock = blockNumber + 1100;
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
      await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
      await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
    });

    it('should calculate token supplier index correctly', async () => {
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      /*
        supplyTokens = 10e18
        tokenAccrued = deltaBlocks * supplySpeed
                    = 100 * 0.5e18 = 50e18
        newIndex   += tokenAccrued * 1e36 / supplyTokens
                    = 1e36 + 50e18 * 1e36 / 10e18 = 6e36
      */
      await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);
    });

    it('should not revert or update supplyState index if mToken not in token markets', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await send(mkt, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
      await setBlockNumber(momaPool, token1, mkt, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mkt._address]);

      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mkt._address])).toEqualNumber(0);
      await checkMarketSupplyState(momaPool, token1, mkt, 0, 0);
    });

    it('should not revert or update supplyState index if token speed is 0', async () => {
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
      await minerStop();
      send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [0]]);
      await minerStart();
      await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);

      const nextBlock2 = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);

      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(0);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 21e36, nextBlock2);
    });

    it('should not revert or update supplyState index if no blocks passed since last accrual', async () => {
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      await mineBlockNumber(startBlock - 2);
      expect(await call(farmingDelegate, 'getBlockNumber')).toEqualNumber(startBlock - 1);
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
    });

    it('should not revert or update supplyState index if blockNumber less than startBlock', async () => {
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeLessThan(startBlock - 1);
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
    });

    it('should calculate token supplier index correctly after endBlock', async () => {
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await mineBlockNumber(endBlock + 100);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock);
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 101e36, endBlock);
    });

    it('should not revert or update supplyState index if endBlock less than supplyState.block', async () => {
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      await mineBlockNumber(endBlock + 100);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock);
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 101e36, endBlock);

      await mineBlockNumber(endBlock + 1000);
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeGreaterThan(endBlock + 100);
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 51e36, endBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 101e36, endBlock);
    });

    it('should not revert or update supplyState index if totalSupply is 0', async () => {
      await send(mLOW, 'harnessSetTotalSupply', [0]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, startBlock);
      expect(await call(momaPool, 'getTokenMarketSpeed', [token1._address, mLOW._address])).toEqualNumber(etherExp(0.5));
      expect(await call(momaPool, 'getTokenMarketSpeed', [token2._address, mLOW._address])).toEqualNumber(etherExp(1));
      const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await checkMarketSupplyState(momaPool, token1, mLOW, 1e36, nextBlock);
      await checkMarketSupplyState(momaPool, token2, mLOW, 1e36, nextBlock);
    });

    it('should not matter if the index is updated multiple times', async () => {
      const token = token2;
      await send(mLOW, 'harnessSetTotalSupply', [0]);
      await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [0]]);

      await quickMint(mLOW, a2, etherUnsigned(1e18));
      await quickMint(mLOW, a3, etherUnsigned(3e18));
      expect(+await call(farmingDelegate, 'getBlockNumber')).toBeLessThan(startBlock);

      expect(await tokenAccrued(momaPool, token, a2)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token, a3)).toEqualNumber(0);

      await setBlockNumber(momaPool, token, mLOW, 20, 'supply');
      const txT1 = await send(mLOW, 'transfer', [a2, 0], {from: a3});
      /*
        supplyTokens     = 1e18 + 3e18 = 4e18
        tokenAccrued     = deltaBlocks * supplySpeed
                         = 20 * 1e18 = 20e18
        newIndex        += tokenAccrued * 1e36 / supplyTokens
                         = 1e36 + 20e18 * 1e36 / 4e18 = 6e36
        supplierAccrued += supplierTokens * deltaIndex
                         = 1e18 * (6e36 - 1e36) / 1e36 = 5e18
      */
      expect(await tokenAccrued(momaPool, token, a2)).toEqualNumber(5e18);
      expect(await tokenAccrued(momaPool, token, a3)).toEqualNumber(15e18);

      await setBlockNumber(momaPool, token, mLOW, 10, 'supply');
      await send(momaPool, 'harnessUpdateFarmSupplyIndex', [mLOW._address]);
      await setBlockNumber(momaPool, token, mLOW, 10, 'supply');

      const txT2 = await send(mLOW, 'transfer', [a3, 0], {from: a2});

      expect(await tokenAccrued(momaPool, token, a2)).toEqualNumber(10e18);
      expect(await tokenAccrued(momaPool, token, a3)).toEqualNumber(30e18);

      expect(txT1.gasUsed).toBeLessThan(300000);
      expect(txT1.gasUsed).toBeGreaterThan(250000);
      expect(txT2.gasUsed).toBeLessThan(250000);
      expect(txT2.gasUsed).toBeGreaterThan(200000);
    });
  });

  describe('distributeBorrowerToken()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
      await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(momaPool, "setMarketBorrowState", [token1._address, mLOW._address, etherDouble(6), 10]);
      await send(momaPool, "setMarketBorrowerIndex", [token1._address, mLOW._address, a1, etherDouble(1)]);
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 10;
      endBlock = blockNumber + 1010;
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
    });

    it('should distribute token and update borrow index checkpoint correctly for repeat time user', async () => {
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
      await send(momaPool, "setMarketBorrowState", [token2._address, mLOW._address, etherDouble(10), 100]);
      await send(momaPool, "setMarketBorrowerIndex", [token2._address, mLOW._address, a1, etherDouble(2)]);
      
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);
      /*
      * 100 delta blocks, 10e18 origin total borrows, 0.5e18 borrowSpeed => 6e18 tokenBorrowIndex
      * this tests that an acct with half the total borrows over that time gets 27.5e18 token
        borrowerAmount = borrowBalanceStored * 1e18 / borrow idx
                       = (5.5e18 * 1.1e18 / 1e18) * 1e18 / 1.1e18 = 5.5e18
        deltaIndex     = marketStoredIndex - userStoredIndex
                       = 6e36 - 1e36 = 5e36
        borrowerAccrued= borrowerAmount * deltaIndex / 1e36
                       = 5.5e18 * 5e36 / 1e36 = 27.5e18
      */
      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(27.5e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);

      expect(await borrowerIndex(momaPool, token2, mkt, a1)).toEqualNumber(etherDouble(10));
      expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(44e18);
      expect(await balanceOf(token2, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerToken', {
        token: token2._address,
        mToken: mkt._address,
        borrower: a1,
        tokenDelta: etherUnsigned(44e18).toFixed(),
        tokenBorrowIndex: etherDouble(10).toFixed()
      });
    });

    it('should not revert or distribute if not lending pool', async () => {
      const mkt = mLOW;
      expect(await call(momaPool, 'isLendingPool')).toEqual(false);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(1));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should not revert or distribute if mToken not in token markets, e.g borrowIndex is 0', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await upgradeLendingPool(momaPool);
      await send(mkt, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await checkMarketBorrowState(momaPool, token1, mkt, 0, 0);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should not revert or distribute if marketBorrowIndex is 0', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, 0]);

      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(1));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should update borrow index checkpoint but not tokenAccrued for first time user', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      await send(momaPool, "setMarketBorrowerIndex", [token1._address, mkt._address, a1, etherUnsigned(0)]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);
      
      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerToken', {
        token: token1._address,
        mToken: mkt._address,
        borrower: a1,
        tokenDelta: etherUnsigned(0).toFixed(),
        tokenBorrowIndex: etherDouble(6).toFixed()
      });
    });
    
    it('should update borrow index checkpoint but not tokenAccrued if borrowBalanceStored is 0', async () => {
      const mkt = mLOW;
      await upgradeLendingPool(momaPool);
      await send(mkt, 'harnessSetBorrowIndex', [0]);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerToken', {
        token: token1._address,
        mToken: mkt._address,
        borrower: a1,
        tokenDelta: etherUnsigned(0).toFixed(),
        tokenBorrowIndex: etherDouble(6).toFixed()
      });
    });

    it('should distribute token and update borrow index checkpoint correctly for two markets', async () => {
      mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
      await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
      await send(momaPool, "setMarketBorrowState", [token1._address, mERP._address, etherDouble(10), 100]);
      await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);

      const mkt = mLOW;
      await upgradeLendingPool(momaPool);

      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
      const tx = await send(momaPool, "harnessDistributeBorrowerFarm", [mkt._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(27.5e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedBorrowerToken', {
        token: token1._address,
        mToken: mkt._address,
        borrower: a1,
        tokenDelta: etherUnsigned(27.5e18).toFixed(),
        tokenBorrowIndex: etherDouble(6).toFixed()
      });

      const tx2 = await send(momaPool, "harnessDistributeBorrowerFarm", [mERP._address, a1, etherUnsigned(1.1e18)]);

      expect(await borrowerIndex(momaPool, token1, mERP, a1)).toEqualNumber(etherDouble(10));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(27.5e18 + 44e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx2).toHaveLog('DistributedBorrowerToken', {
        token: token1._address,
        mToken: mERP._address,
        borrower: a1,
        tokenDelta: etherUnsigned(44e18).toFixed(),
        tokenBorrowIndex: etherDouble(10).toFixed()
      });
    });
  });

  describe('distributeSupplierToken()', () => {
    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await send(momaPool, "setMarketSupplyState", [token1._address, mLOW._address, etherDouble(6), 10]);
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 10;
      endBlock = blockNumber + 1010;
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
    });

    it('should distribute token and update supply index checkpoint correctly for first time user', async () => {
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
      await send(momaPool, "setMarketSupplyState", [token2._address, mLOW._address, etherDouble(10), 100]);

      const mkt = mLOW;
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);
      /*
      * 100 delta blocks, 10e18 total supply, 0.5e18 supplySpeed => 6e18 tokenSupplyIndex
      * confirming an acct with half the total supply over that time gets 25e18 token:
        supplierTokens   = 5e18
        deltaIndex       = marketStoredIndex - userStoredIndex
                         = 6e36 - 1e36 = 5e36
        suppliedAccrued += supplierTokens * deltaIndex / 1e36
                         = 5e18 * 5e36 / 1e36 = 25e18
      */
      expect(await supplierIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(25e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);

      expect(await supplierIndex(momaPool, token2, mkt, a1)).toEqualNumber(etherDouble(10));
      expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(45e18);
      expect(await balanceOf(token2, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplierToken', {
        token: token2._address,
        mToken: mkt._address,
        supplier: a1,
        tokenDelta: etherUnsigned(45e18).toFixed(),
        tokenSupplyIndex: etherDouble(10).toFixed()
      });
    });

    it('should distribute token and update supply index checkpoint correctly for repeat time user', async () => {
      const mkt = mLOW;
      await send(momaPool, "setMarketSupplierIndex", [token1._address, mkt._address, a1, etherDouble(2)]);
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);
      /*
        supplierAmount  = 5e18
        deltaIndex      = marketStoredIndex - userStoredIndex
                        = 6e36 - 2e36 = 4e36
        suppliedAccrued+= supplierTokens * deltaIndex / 1e36
                        = 5e18 * 4e36 / 1e36 = 20e18
      */
      expect(await supplierIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(20e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplierToken', {
        token: token1._address,
        mToken: mkt._address,
        supplier: a1,
        tokenDelta: etherUnsigned(20e18).toFixed(),
        tokenSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should not revert or distribute if mToken not in token markets, e.g supplyIndex is 0', async () => {
      const mkt = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 3});
      await send(mkt, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
      await checkMarketSupplyState(momaPool, token1, mkt, 0, 0);

      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);

      expect(await supplierIndex(momaPool, token1, mkt, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx.events).toEqual({});
    });

    it('should update supply index checkpoint but not tokenAccrued if supplierTokens is 0', async () => {
      const mkt = mLOW;
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a2]);

      expect(await supplierIndex(momaPool, token1, mkt, a2)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a2)).toEqualNumber(0);
      expect(await balanceOf(token1, a2)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplierToken', {
        token: token1._address,
        mToken: mkt._address,
        supplier: a2,
        tokenDelta: etherUnsigned(0).toFixed(),
        tokenSupplyIndex: etherDouble(6).toFixed()
      });
    });

    it('should distribute token and update supply index checkpoint correctly for two markets', async () => {
      mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
      await send(mERP, "harnessSetBalance", [a1, etherUnsigned(10e18)]);
      await send(momaPool, "setMarketSupplyState", [token1._address, mERP._address, etherDouble(8), 100]);

      const mkt = mLOW;
      const tx = await send(momaPool, "harnessDistributeSupplierFarm", [mkt._address, a1]);

      expect(await supplierIndex(momaPool, token1, mkt, a1)).toEqualNumber(etherDouble(6));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(25e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('DistributedSupplierToken', {
        token: token1._address,
        mToken: mkt._address,
        supplier: a1,
        tokenDelta: etherUnsigned(25e18).toFixed(),
        tokenSupplyIndex: etherDouble(6).toFixed()
      });

      const tx2 = await send(momaPool, "harnessDistributeSupplierFarm", [mERP._address, a1]);

      expect(await supplierIndex(momaPool, token1, mERP, a1)).toEqualNumber(etherDouble(8));
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(25e18 + 70e18);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(tx2).toHaveLog('DistributedSupplierToken', {
        token: token1._address,
        mToken: mERP._address,
        supplier: a1,
        tokenDelta: etherUnsigned(70e18).toFixed(),
        tokenSupplyIndex: etherDouble(8).toFixed()
      });
    });
  });

  describe('claim', () => {
    const accrued1 = 100, accrued2 = 200;

    beforeEach(async () => {
      token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
      blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 10;
      endBlock = blockNumber + 1010;
      await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
      await send(token1, 'transfer', [momaPool._address, accrued1]);
      await send(momaPool, 'setTokenAccrued', [token1._address, a1, accrued1]);
    });

    it('should claim one token correctly', async () => {
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(accrued1);
      const tx = await send(momaPool, 'claim', [token1._address], {from: a1});
      expect(await balanceOf(token1, a1)).toEqualNumber(accrued1);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('TokenClaimed', {
        token: token1._address,
        user: a1,
        accrued: accrued1,
        claimed: accrued1,
        notClaimed: 0
      });
    });

    it('should not transfer token and not change accured if accured is 0', async () => {
      await send(momaPool, 'setTokenAccrued', [token1._address, a1, 0]);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      const tx = await send(momaPool, 'claim', [token1._address], {from: a1});
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('TokenClaimed', {
        token: token1._address,
        user: a1,
        accrued: 0,
        claimed: 0,
        notClaimed: 0
      });
    });

    it('should not transfer token and not change accured if not have enough fund', async () => {
      await send(momaPool, 'setTokenAccrued', [token1._address, a1, accrued1 + 1]);
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(accrued1 + 1);
      const tx = await send(momaPool, 'claim', [token1._address], {from: a1});
      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(accrued1 + 1);
      expect(tx).toHaveLog('TokenClaimed', {
        token: token1._address,
        user: a1,
        accrued: accrued1 + 1,
        claimed: 0,
        notClaimed: accrued1 + 1
      });
    });

    it('should claim all tokens correctly', async () => {
      token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
      await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
      await send(token2, 'transfer', [momaPool._address, accrued2]);
      await send(momaPool, 'setTokenAccrued', [token2._address, a1, accrued2]);

      expect(await balanceOf(token1, a1)).toEqualNumber(0);
      expect(await balanceOf(token2, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(accrued1);
      expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(accrued2);
      const tx = await send(momaPool, 'claim', {from: a1});
      expect(await balanceOf(token1, a1)).toEqualNumber(accrued1);
      expect(await balanceOf(token2, a1)).toEqualNumber(accrued2);
      expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
      expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
      expect(tx).toHaveLog('TokenClaimed', {
        token: token2._address,
        user: a1,
        accrued: accrued2,
        claimed: accrued2,
        notClaimed: 0
      });
    });
  });

  describe('dclaim', () => {
    describe('only borrow', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mLOW._address, a1, etherDouble(1)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 10;
        endBlock = blockNumber + 1010;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
        await send(token1, 'transfer', [momaPool._address, etherExp(1000)]);
      });

      it('should distribute and claim token correctly for one token one market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address], false, true], {from: a1});
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
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(120000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mLOW._address,
          borrower: a1,
          tokenDelta: etherUnsigned(27.5e18).toFixed(),
          tokenBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18).toFixed(),
          claimed: etherUnsigned(27.5e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two same market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mLOW._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(140000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mLOW._address,
          borrower: a1,
          tokenDelta: etherUnsigned(27.5e18).toFixed(),
          tokenBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18).toFixed(),
          claimed: etherUnsigned(27.5e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mERP._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(170000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mLOW._address, a1, etherDouble(1)]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mERP._address, a1, etherDouble(2)]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(55e18 + 114e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(310000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token2._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: etherUnsigned(55e18 + 114e18).toFixed(),
          claimed: etherUnsigned(55e18 + 114e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets and same tokens', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mLOW._address, a1, etherDouble(1)]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mERP._address, a1, etherDouble(2)]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address, token1._address, token2._address], false, true], {from: a1});

        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(55e18 + 114e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(380000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token2._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: 0,
          claimed: 0,
          notClaimed: 0
        });
      });
    });

    describe('only supply', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 20;
        endBlock = blockNumber + 1020;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
        await send(token1, 'transfer', [momaPool._address, etherExp(1000)]);
      });

      it('should distribute and claim token correctly for one token one market', async () => {
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address], true, false], {from: a1});
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
        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(25e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(130000);
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mLOW._address,
          supplier: a1,
          tokenDelta: etherUnsigned(25e18).toFixed(),
          tokenSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(25e18).toFixed(),
          claimed: etherUnsigned(25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two same market', async () => {
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mLOW._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(25e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(140000);
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mLOW._address,
          supplier: a1,
          tokenDelta: etherUnsigned(25e18).toFixed(),
          tokenSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(25e18).toFixed(),
          claimed: etherUnsigned(25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);

        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mERP._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(25e18 + 40e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(190000);
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(40e18).toFixed(),
          tokenSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(2)]]);

        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mERP, 41e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(25e18 + 40e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(50e18 + 80e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(340000);
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token2._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(80e18).toFixed(),
          tokenSupplyIndex: etherDouble(41).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: etherUnsigned(50e18 + 80e18).toFixed(),
          claimed: etherUnsigned(50e18 + 80e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets and same tokens', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(2)]]);

        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'supply');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address, token1._address, token2._address], true, false], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mERP, 41e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(25e18 + 40e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(50e18 + 80e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(400000);
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token2._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(80e18).toFixed(),
          tokenSupplyIndex: etherDouble(41).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: 0,
          claimed: 0,
          notClaimed: 0
        });
      });
    });

    describe('borrow & supply', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mLOW._address, a1, etherDouble(1)]);
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 40;
        endBlock = blockNumber + 1040;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
        await send(token1, 'transfer', [momaPool._address, etherExp(1000)]);
      });

      it('should distribute and claim token correctly for one token one market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 25e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(180000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mLOW._address,
          borrower: a1,
          tokenDelta: etherUnsigned(27.5e18).toFixed(),
          tokenBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mLOW._address,
          supplier: a1,
          tokenDelta: etherUnsigned(25e18).toFixed(),
          tokenSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18 + 25e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two same market', async () => {
        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mLOW._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 25e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(200000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mLOW._address,
          borrower: a1,
          tokenDelta: etherUnsigned(27.5e18).toFixed(),
          tokenBorrowIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mLOW._address,
          supplier: a1,
          tokenDelta: etherUnsigned(25e18).toFixed(),
          tokenSupplyIndex: etherDouble(6).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18 + 25e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 25e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for one token two markets', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [token1._address, [mLOW._address, mERP._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(280000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token1._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token1._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(40e18).toFixed(),
          tokenSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token1._address,
          user: a1,
          accrued: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          claimed: etherUnsigned(27.5e18 + 114e18 + 25e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mLOW._address, a1, etherDouble(1)]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mERP._address, a1, etherDouble(2)]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(55e18 + 114e18 + 50e18 + 40e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(520000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token2._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token2._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(40e18).toFixed(),
          tokenSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: etherUnsigned(55e18 + 114e18 + 50e18 + 40e18).toFixed(),
          claimed: etherUnsigned(55e18 + 114e18 + 50e18 + 40e18).toFixed(),
          notClaimed: 0
        });
      });

      it('should distribute and claim token correctly for two tokens two markets and same tokens', async () => {
        token2 = await makeToken({symbol: 'TOKEN2', quantity: 1e26});
        await send(momaPool, '_setTokenFarm', [token2._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mLOW._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mLOW._address, a1, etherDouble(1)]);
        await send(token2, 'transfer', [momaPool._address, etherExp(1000)]);
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token2._address, [mERP._address], [etherExp(1)]]);
        await send(momaPool, "setMarketBorrowerIndex", [token2._address, mERP._address, a1, etherDouble(2)]);

        await upgradeLendingPool(momaPool);
        const nextBlock = await setBlockNumber(momaPool, token1, mLOW, 100, 'borrow');
        expect(await balanceOf(token1, a1)).toEqualNumber(0);
        expect(await balanceOf(token2, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        const tx = await send(momaPool, 'dclaim', [[token1._address, token2._address, token1._address, token2._address], true, true], {from: a1});

        await checkMarketSupplyState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketSupplyState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketSupplyState(momaPool, token2, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mLOW, 6e36, nextBlock);
        await checkMarketBorrowState(momaPool, token1, mERP, 21e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mLOW, 11e36, nextBlock);
        await checkMarketBorrowState(momaPool, token2, mERP, 21e36, nextBlock);
        expect(await balanceOf(token1, a1)).toEqualNumber(27.5e18 + 114e18 + 25e18 + 40e18);
        expect(await balanceOf(token2, a1)).toEqualNumber(55e18 + 114e18 + 50e18 + 40e18);
        expect(await tokenAccrued(momaPool, token1, a1)).toEqualNumber(0);
        expect(await tokenAccrued(momaPool, token2, a1)).toEqualNumber(0);
        expect(tx.gasUsed).toBeLessThan(630000);
        expect(tx).toHaveLog('DistributedBorrowerToken', {
          token: token2._address,
          mToken: mERP._address,
          borrower: a1,
          tokenDelta: etherUnsigned(114e18).toFixed(),
          tokenBorrowIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('DistributedSupplierToken', {
          token: token2._address,
          mToken: mERP._address,
          supplier: a1,
          tokenDelta: etherUnsigned(40e18).toFixed(),
          tokenSupplyIndex: etherDouble(21).toFixed()
        });
        expect(tx).toHaveLog('TokenClaimed', {
          token: token2._address,
          user: a1,
          accrued: 0,
          claimed: 0,
          notClaimed: 0
        });
      });
    });
  });

  describe('undistributed', () => {
    describe('only borrow', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mLOW._address, a1, etherDouble(1)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 50;
        endBlock = blockNumber + 1050;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
        await upgradeLendingPool(momaPool);
      });

      it('should return zero for no borrow user', async () => {
        expect(await call(momaPool, 'undistributed', [a2, token1._address, mLOW._address, false, true])).toEqualNumber(0);
      });

      it('should return zero for no token market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, false, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mERP, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, false, true])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, false, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, false, true])).toEqualNumber(27.5e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, false, true])).toEqualNumber(0);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, false, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, false, true])).toEqualNumber(27.5e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, false, true])).toEqualNumber(114e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, false, true])).toEqual([27.5e18.toString(), 114e18.toString()]);
      });
    });

    describe('only supply', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 20;
        endBlock = blockNumber + 1020;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
      });

      it('should return zero for no supply user', async () => {
        expect(await call(momaPool, 'undistributed', [a2, token1._address, mLOW._address, true, false])).toEqualNumber(0);
      });

      it('should return zero for no token market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(5e18)]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, false])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mERP, 101, 'supply');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, false])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, false])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'supply');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, false])).toEqualNumber(25e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, false])).toEqualNumber(0);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, false])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'supply');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, false])).toEqualNumber(25e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, false])).toEqualNumber(40e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, true, false])).toEqual([25e18.toString(), 40e18.toString()]);
      });
    });

    describe('borrow & supply', () => {
      beforeEach(async () => {
        token1 = await makeToken({symbol: 'TOKEN1', quantity: 1e26});
        mLOW = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 1});
        await send(mLOW, 'harnessSetBorrowIndex', [etherUnsigned(1.1e18)]);
        await send(mLOW, 'harnessSetTotalBorrows', [etherUnsigned(11e18)]);
        await send(mLOW, "harnessSetAccountBorrows", [a1, etherUnsigned(5.5e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mLOW._address, a1, etherDouble(1)]);
        await send(mLOW, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mLOW, "harnessSetBalance", [a1, etherUnsigned(5e18)]);
        blockNumber = +(await call(farmingDelegate, 'getBlockNumber'));
        startBlock = blockNumber + 50;
        endBlock = blockNumber + 1050;
        await send(momaPool, '_setTokenFarm', [token1._address, startBlock, endBlock]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mLOW._address], [etherExp(0.5)]]);
        await upgradeLendingPool(momaPool);
      });

      it('should return zero for no borrow & supply user', async () => {
        expect(await call(momaPool, 'undistributed', [a2, token1._address, mLOW._address, true, true])).toEqualNumber(0);
      });

      it('should return zero for no token market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(5e18)]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mERP, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, true])).toEqualNumber(0);
      });

      it('should calculate undistributed correctly for one market', async () => {
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, true])).toEqualNumber(27.5e18 + 25e18);
      });

      it('should calculate undistributed correctly for two market', async () => {
        mERP = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true, underlyingPrice: 2, setInterestRateModel: true});
        await send(mERP, 'harnessSetBorrowIndex', [etherUnsigned(2e18)]);
        await send(mERP, 'harnessSetTotalBorrows', [etherUnsigned(10e18)]);
        await send(mERP, "harnessSetAccountBorrows", [a1, etherUnsigned(6e18), etherExp(1)]);
        await send(momaPool, "setMarketBorrowerIndex", [token1._address, mERP._address, a1, etherDouble(2)]);
        await send(momaPool, '_setTokensSpeed', [token1._address, [mERP._address], [etherExp(1)]]);
        await send(mERP, 'harnessSetTotalSupply', [etherUnsigned(5e18)]);
        await send(mERP, "harnessSetBalance", [a1, etherUnsigned(2e18)]);

        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, true])).toEqualNumber(0);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, true])).toEqualNumber(0);
        await setBlockNumber(momaPool, token1, mLOW, 101, 'borrow');
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mLOW._address, true, true])).toEqualNumber(27.5e18 + 25e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, mERP._address, true, true])).toEqualNumber(114e18 + 40e18);
        expect(await call(momaPool, 'undistributed', [a1, token1._address, true, true])).toEqual([(27.5e18 + 25e18).toString(), (114e18 + 40e18).toString()]);
      });
    });
  });
});
