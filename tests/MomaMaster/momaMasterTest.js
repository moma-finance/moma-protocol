const {
  etherMantissa,
  both,
  mineBlockNumber
} = require('../Utils/Ethereum');

const {
  makeMomaFarming,
  makeMomaPool,
  makePriceOracle,
  makeMToken,
  makeToken,
  upgradeLendingPool,
  setInterestRateModel
} = require('../Utils/Moma');

describe('MomaMaster', () => {
  let root, accounts;

  beforeEach(async () => {
    [root, a1, ...accounts] = saddle.accounts;
  });

  describe('constructor', () => {
    let momaPool;

    it("on success it sets admin to creator and pendingAdmin is unset", async () => {
      momaPool = await makeMomaPool();
      const momaMaster = momaPool.momaMaster;
      expect(await call(momaMaster, 'admin')).toEqual(root);
      expect(await call(momaMaster, 'pendingAdmin')).toEqualNumber(0);
    });

    it("on success it sets closeFactor as specified", async () => {
      expect(await call(momaPool, 'closeFactorMantissa')).toEqualNumber(0.051e18);
    });
  });

  describe('_updatePriceOracle', () => {
    let momaPool, oldOracle, newOracle;
    beforeEach(async () => {
      momaPool = await makeMomaPool({addPriceOracle: true});
      oldOracle = momaPool.priceOracle;
    });

    it("fails if called by non-admin", async () => {
      expect(
        await send(momaPool, '_updatePriceOracle', {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_PRICE_ORACLE_OWNER_CHECK');
      expect(await momaPool.methods.oracle().call()).toEqual(oldOracle._address);
    });

    it("reverts if factory not set oracle", async () => {
      momaPool = await makeMomaPool();
      await expect(send(momaPool, '_updatePriceOracle')).rejects.toRevert("revert factory not set oracle");
      expect(await call(momaPool, 'oracle')).toBeAddressZero();
    });

    it("accepts a valid price oracle and emits a NewPriceOracle event", async () => {
      newOracle = await makePriceOracle();
      await send(momaPool.factory, '_setOracle', [newOracle._address]);
      const result = await send(momaPool, '_updatePriceOracle');
      expect(result).toSucceed();
      expect(result).toHaveLog('NewPriceOracle', {
        oldPriceOracle: oldOracle._address,
        newPriceOracle: newOracle._address
      });
      expect(newOracle._address).not.toEqual(oldOracle._address);
      expect(await call(momaPool, 'oracle')).toEqual(newOracle._address);
    });
  });

  describe('_setCloseFactor', () => {
    it("fails if not called by admin", async () => {
      const mToken = await makeMToken();
      await expect(
        send(mToken.momaPool, '_setCloseFactor', [1], {from: accounts[0]})
      ).rejects.toRevert('revert only admin can set close factor');
    });

    it("succeeds and set close factor", async () => {
      const mToken = await makeMToken();
      const result = await send(mToken.momaPool, '_setCloseFactor', [1]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewCloseFactor', {
        oldCloseFactorMantissa: etherMantissa(0.051),
        newCloseFactorMantissa: 1
      });
      expect(await call(mToken.momaPool, 'closeFactorMantissa')).toEqualNumber(1);
    });
  });

  describe('_setCollateralFactor', () => {
    const half = etherMantissa(0.5);
    const one = etherMantissa(1);

    it("fails if not called by admin", async () => {
      const mToken = await makeMToken();
      expect(
        await send(mToken.momaPool, '_setCollateralFactor', [mToken._address, half], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_COLLATERAL_FACTOR_OWNER_CHECK');
    });

    it("fails if asset is not listed", async () => {
      const mToken = await makeMToken();
      expect(
        await send(mToken.momaPool, '_setCollateralFactor', [mToken._address, half])
      ).toHaveTrollFailure('MARKET_NOT_LISTED', 'SET_COLLATERAL_FACTOR_NO_EXISTS');
    });

    it('fails if factor is too high', async () => {
      const mToken = await makeMToken({ supportMarket: true});
      expect(
        await send(mToken.momaPool, '_setCollateralFactor', [mToken._address, one])
      ).toHaveTrollFailure('INVALID_COLLATERAL_FACTOR', 'SET_COLLATERAL_FACTOR_VALIDATION');
    });

    it("fails if factor is set without an underlying price", async () => {
      const mToken = await makeMToken({supportMarket: true, addPriceOracle: true});
      expect(
        await send(mToken.momaPool, '_setCollateralFactor', [mToken._address, half])
      ).toHaveTrollFailure('PRICE_ERROR', 'SET_COLLATERAL_FACTOR_WITHOUT_PRICE');
    });

    it("succeeds and sets market", async () => {
      const mToken = await makeMToken({supportMarket: true, underlyingPrice: 1, addPriceOracle: true});
      const result = await send(mToken.momaPool, '_setCollateralFactor', [mToken._address, half]);
      expect(result).toHaveLog('NewCollateralFactor', {
        mToken: mToken._address,
        oldCollateralFactorMantissa: '0',
        newCollateralFactorMantissa: half.toString()
      });
    });
  });

  describe('_setLiquidationIncentive', () => {
    const initialIncentive = etherMantissa(1.0);
    const validIncentive = etherMantissa(1.1);
    const tooSmallIncentive = etherMantissa(0.99999);
    const tooLargeIncentive = etherMantissa(1.50000001);

    let momaPool;
    beforeEach(async () => {
      momaPool = await makeMomaPool();
    });

    it("fails if called by non-admin", async () => {
      const {reply, receipt} = await both(momaPool, '_setLiquidationIncentive', [initialIncentive], {from: accounts[0]});
      expect(reply).toHaveTrollError('UNAUTHORIZED');
      expect(receipt).toHaveTrollFailure('UNAUTHORIZED', 'SET_LIQUIDATION_INCENTIVE_OWNER_CHECK');
      expect(await call(momaPool, 'liquidationIncentiveMantissa')).toEqualNumber(initialIncentive);
    });

    it("accepts a valid incentive and emits a NewLiquidationIncentive event", async () => {
      const {reply, receipt} = await both(momaPool, '_setLiquidationIncentive', [validIncentive]);
      expect(reply).toHaveTrollError('NO_ERROR');
      expect(receipt).toHaveLog('NewLiquidationIncentive', {
        oldLiquidationIncentiveMantissa: initialIncentive.toString(),
        newLiquidationIncentiveMantissa: validIncentive.toString()
      });
      expect(await call(momaPool, 'liquidationIncentiveMantissa')).toEqualNumber(validIncentive);
    });
  });

  describe('_supportMarket', () => {
    it("fails if not called by admin", async () => {
      const mToken = await makeMToken();
      expect(
        await send(mToken.momaPool, '_supportMarket', [mToken._address], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SUPPORT_MARKET_OWNER_CHECK');
    });

    it("fails if not set interestRateModel with lending pool", async () => {
      const mToken = await makeMToken();
      await upgradeLendingPool(mToken.momaPool);
      const mkt = await makeMToken({momaPool: mToken.momaPool});
      await expect(send(mToken.momaPool, '_supportMarket', [mkt._address])).rejects.toRevert('revert mToken not set interestRateModel');
    });

    it("fails if asset is not a MToken in factory", async () => {
      const mToken = await makeMToken();
      const asset = await makeToken(root);
      await expect(send(mToken.momaPool, '_supportMarket', [asset._address])).rejects.toRevert('revert not mToken');
    });

    it("fails if asset is not a MToken", async () => {
      const momaFactoryHarness = await deploy('MomaFactoryHarness');
      const momaPool = await makeMomaPool({factoryOpts: {factory: momaFactoryHarness}});
      const asset = await makeToken(root);
      await send(momaPool.factory, 'harnessSetMErc20', [asset._address]);
      await expect(send(momaPool, '_supportMarket', [asset._address])).rejects.toRevert();
    });

    it("succeeds and sets market", async () => {
      const mToken = await makeMToken();
      await send(mToken.momaPool.factory, '_setMErc20', [mToken._address]);
      const result = await send(mToken.momaPool, '_supportMarket', [mToken._address]);
      expect(result).toHaveLog('MarketListed', {mToken: mToken._address});
    });

    it("cannot list a market a second time", async () => {
      const mToken = await makeMToken();
      await send(mToken.momaPool.factory, '_setMErc20', [mToken._address]);
      const result1 = await send(mToken.momaPool, '_supportMarket', [mToken._address]);
      const result2 = await send(mToken.momaPool, '_supportMarket', [mToken._address]);
      expect(result1).toHaveLog('MarketListed', {mToken: mToken._address});
      expect(result2).toHaveTrollFailure('MARKET_ALREADY_LISTED', 'SUPPORT_MARKET_EXISTS');
    });

    it("can list two different markets", async () => {
      const mToken1 = await makeMToken();
      const mToken2 = await makeMToken({momaPool: mToken1.momaPool});
      await send(mToken1.momaPool.factory, '_setMErc20', [mToken1._address]);
      const result1 = await send(mToken1.momaPool, '_supportMarket', [mToken1._address]);
      const result2 = await send(mToken1.momaPool, '_supportMarket', [mToken2._address]);
      expect(result1).toHaveLog('MarketListed', {mToken: mToken1._address});
      expect(result2).toHaveLog('MarketListed', {mToken: mToken2._address});
    });
  });

  describe('_upgradeLendingPool', () => {
    let momaPool, mToken;

    beforeEach(async () => {
      momaPool = await makeMomaPool({kind: 'harness', addFarmingDelegate: true, addMomaFarming: true, addPriceOracle: true});
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(momaPool, '_upgradeLendingPool', {from: a1})
      ).rejects.toRevert('revert only admin can upgrade');
    });

    it('should revert if not set oracle', async () => {
      momaPool = await makeMomaPool({kind: 'harness', addFarmingDelegate: true, addMomaFarming: true});
      await expect(
        send(momaPool, '_upgradeLendingPool')
      ).rejects.toRevert('revert factory not set oracle');
    });

    it('should revert if market not set interestRateModel', async () => {
      mToken = await makeMToken({momaPool, supportMarket: true});
      await send(momaPool.factory, '_setAllowUpgrade', [true]);
      await expect(
        send(momaPool, '_upgradeLendingPool')
      ).rejects.toRevert('revert support market not set interestRateModel');
    });

    it('should upgrade correctly', async () => {
      mToken = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      await send(momaPool.factory, '_setAllowUpgrade', [true]);
      await setInterestRateModel(mToken);
      token = await makeToken({symbol: 'TOKEN'});
      blockNumber = +(await call(momaPool.factory.farmingDelegate, 'getBlockNumber'));
      const startBlock = blockNumber + 2;
      await send(momaPool, '_setTokenFarm', [token._address, startBlock, blockNumber + 1010]);
      await send(momaPool, '_setTokensSpeed', [token._address, [mToken._address], [1]]);
      await send(momaPool, 'setBlockNumber', [startBlock + 100]);

      var state = await call(momaPool, 'getMarketBorrowState', [token._address, mToken._address])
      expect(state['1']).toEqualNumber(startBlock);
      expect(await call(momaPool, 'isLendingPool')).toEqual(false);

      await send(momaPool, '_upgradeLendingPool');
      var state = await call(momaPool, 'getMarketBorrowState', [token._address, mToken._address])
      expect(state['1']).toEqualNumber(startBlock + 100);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
    });

    it('should revert if upgrade again', async () => {
      mToken = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      await send(momaPool.factory, '_setAllowUpgrade', [true]);
      await setInterestRateModel(mToken);

      await send(momaPool, '_upgradeLendingPool');
      await expect(
        send(momaPool, '_upgradeLendingPool')
      ).rejects.toRevert('revert MomaFactory: can only upgrade once');
    });

    it('should upgrade correctly if blockNumber less than startBlock', async () => {
      mToken = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      await send(momaPool.factory, '_setAllowUpgrade', [true]);
      await setInterestRateModel(mToken);
      token = await makeToken({symbol: 'TOKEN'});
      blockNumber = +(await call(momaPool.factory.farmingDelegate, 'getBlockNumber'));
      const startBlock = blockNumber + 100;
      await send(momaPool, '_setTokenFarm', [token._address, startBlock, blockNumber + 1010]);
      await send(momaPool, '_setTokensSpeed', [token._address, [mToken._address], [1]]);
      await send(momaPool, 'setBlockNumber', [startBlock - 10]);

      var state = await call(momaPool, 'getMarketBorrowState', [token._address, mToken._address])
      expect(state['1']).toEqualNumber(startBlock);
      expect(await call(momaPool, 'isLendingPool')).toEqual(false);

      await send(momaPool, '_upgradeLendingPool');
      var state = await call(momaPool, 'getMarketBorrowState', [token._address, mToken._address])
      expect(state['1']).toEqualNumber(startBlock);
      expect(await call(momaPool, 'isLendingPool')).toEqual(true);
    });
  })

  describe('redeemVerify', () => {
    let momaPool, mToken;
    it('should allow you to redeem 0 underlying for 0 tokens', async () => {
      momaPool = await makeMomaPool();
      mToken = await makeMToken({momaPool});
      await call(momaPool, 'redeemVerify', [mToken._address, accounts[0], 0, 0]);
    });

    it('should allow you to redeem 5 underlyig for 5 tokens', async () => {
      await call(momaPool, 'redeemVerify', [mToken._address, accounts[0], 5, 5]);
    });

    it('should not allow you to redeem 5 underlying for 0 tokens', async () => {
      await expect(call(momaPool, 'redeemVerify', [mToken._address, accounts[0], 5, 0])).rejects.toRevert("revert redeemTokens zero");
    });
  })

  describe('_become', () => {
    let momaPool, momaMaster, oldMomaMasterAdd;

    beforeEach(async () => {
      momaPool = await makeMomaPool();
      momaMaster = await deploy('MomaMaster');
      oldMomaMasterAdd = momaPool.momaMaster._address;
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(oldMomaMasterAdd);
    });

    it('should revert if not momaPool', async () => {
      await expect(
        send(momaMaster, '_become', [a1], {from: a1})
      ).rejects.toRevert('revert');
    });

    it('should revert if not called by admin', async () => {
      await expect(
        send(momaMaster, '_become', [momaPool._address], {from: a1})
      ).rejects.toRevert('revert only momaPool admin can change brains');
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(oldMomaMasterAdd);
    });

    it("should fail if not set as pending implementation", async () => {
      await expect(
        send(momaMaster, '_become', [momaPool._address])
      ).rejects.toRevert('revert change not authorized');
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(oldMomaMasterAdd);
    });

    it("should become momaPool implementation", async () => {
      await send(momaPool, '_setPendingImplementation', [momaMaster._address]);
      await send(momaMaster, '_become', [momaPool._address]);
      expect(momaMaster._address).not.toEqual(oldMomaMasterAdd);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
    });
  })

  describe('isFarming', () => {
    let momaPool, market, token;
    let blockNumber, startBlock, endBlock

    beforeEach(async () => {
      momaPool = await makeMomaPool({ kind: 'harness', addFarmingDelegate: true, addMomaFarming: true });
      market = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      token = await makeToken();
      blockNumber = +(await call(momaPool.factory.farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 100;
      endBlock = blockNumber + 1100;
      await send(momaPool, '_setTokenFarm', [token._address, startBlock, endBlock]);
      await send(momaPool, '_setTokensSpeed', [token._address, [market._address], [1]]);
    });

    it('should return false for market if not start', async () => {
      expect(await call(momaPool, 'isFarming', [token._address, market._address])).toEqual(false);
    });

    it('should return true for market if start', async () => {
      await mineBlockNumber(startBlock + 1);
      expect(await call(momaPool, 'isFarming', [token._address, market._address])).toEqual(false);
    });

    it('should return false for market if end', async () => {
      await mineBlockNumber(endBlock + 1);
      expect(await call(momaPool, 'isFarming', [token._address, market._address])).toEqual(false);
    });

    it('should return false for market if start but speed is 0', async () => {
      await send(momaPool, '_setTokensSpeed', [token._address, [market._address], [0]]);
      await mineBlockNumber(startBlock + 1);
      expect(await call(momaPool, 'isFarming', [token._address, market._address])).toEqual(false);
    });

    it('should return false for non market', async () => {
      expect(await call(momaPool, 'isFarming', [token._address, a1])).toEqual(false);
    });
  })

  describe('isTokenMarket', () => {
    let momaPool, market, token;

    beforeEach(async () => {
      momaPool = await makeMomaPool({ kind: 'harness', addFarmingDelegate: true, addMomaFarming: true });
      market = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      token = await makeToken();
      blockNumber = +(await call(momaPool.factory.farmingDelegate, 'getBlockNumber'));
      startBlock = blockNumber + 100;
      endBlock = blockNumber + 1100;
      await send(momaPool, '_setTokenFarm', [token._address, startBlock, endBlock]);
      await send(momaPool, '_setTokensSpeed', [token._address, [market._address], [1]]);
    });

    it('should return true for market', async () => {
      expect(await call(momaPool, 'isTokenMarket', [token._address, market._address])).toEqual(true);
    });

    it('should return false for non market and user', async () => {
      const m2 = await makeMToken({momaPool, implementation: 'MErc20DelegateHarness', supportMarket: true});
      expect(await call(momaPool, 'isTokenMarket', [token._address, a1])).toEqual(false);
      expect(await call(momaPool, 'isTokenMarket', [token._address, m2._address])).toEqual(false);
    });
  })

  describe('currentMomaFarming', () => {
    let momaPool, factory;

    beforeEach(async () => {
      momaPool = await makeMomaPool();
      factory = momaPool.factory;
    });

    it('should return address(0) when not set momaFarming', async () => {
      expect(await call(momaPool, 'currentMomaFarming')).toBeAddressZero();
    });

    it('should return correct address', async () => {
      const momaFarming = await makeMomaFarming({proxy: factory});
      await send(factory, '_setMomaFarming', [momaFarming._address]);
      expect(await call(momaPool, 'currentMomaFarming')).toEqual(momaFarming._address);
    });
  })

  describe('currentFarmingDelegate', () => {
    let momaPool, factory;

    beforeEach(async () => {
      momaPool = await makeMomaPool();
      factory = momaPool.factory;
    });

    it('should return address(0) when not set farmingDelegate', async () => {
      expect(await call(momaPool, 'currentFarmingDelegate')).toBeAddressZero();
    });

    it('should return correct address', async () => {
      const farmingDelegate = await deploy('FarmingDelegate');
      await send(factory, '_setFarmingDelegate', [farmingDelegate._address]);
      expect(await call(momaPool, 'currentFarmingDelegate')).toEqual(farmingDelegate._address);
    });
  })

  describe('delegateToFarmingSelf', () => {
    it('should revert if not self', async () => {
      const momaPool = await makeMomaPool();
      await expect(
        send(momaPool, 'delegateToFarmingSelf', ["0x0"])
      ).rejects.toRevert('revert can only called by self');

      await expect(
        send(momaPool, 'delegateToFarmingSelf', ["0x0"], {from: a1})
      ).rejects.toRevert('revert can only called by self');
    });
  })

  describe('isLendingPool', () => {
    let momaPool;

    beforeEach(async () => {
      momaPool = await makeMomaPool();
    });

    it('should revert if not lending pool when call borrowAllowed', async () => {
      await expect(
        send(momaPool, 'borrowAllowed', [root, a1, 1])
      ).rejects.toRevert('revert this is not lending pool');
    });

    it('should revert if not lending pool when call repayBorrowAllowed', async () => {
      await expect(
        send(momaPool, 'repayBorrowAllowed', [root, a1, a1, 1])
      ).rejects.toRevert('revert this is not lending pool');
    });

    it('should revert if not lending pool when call liquidateBorrowAllowed', async () => {
      await expect(
        send(momaPool, 'liquidateBorrowAllowed', [root, a1, a1, a1, 1])
      ).rejects.toRevert('revert this is not lending pool');
    });

    it('should revert if not lending pool when call seizeAllowed', async () => {
      await expect(
        send(momaPool, 'seizeAllowed', [root, a1, a1, a1, 1])
      ).rejects.toRevert('revert this is not lending pool');
    });
  })
});
