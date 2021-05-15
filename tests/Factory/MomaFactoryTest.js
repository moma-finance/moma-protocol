const {
  makeMomaPool,
  makeMomaFarming,
  makeMToken,
  makeToken
} = require('../Utils/Moma');
const {
  address,
  etherExp,
  mergeInterface
} = require('../Utils/Ethereum');


describe('MomaFactory', () => {
  let root, a1, accounts;
  let proxy, factory, momaPool;
  beforeEach(async () => {
    [root, a1, ...accounts] = saddle.accounts;
    proxy = await deploy('MomaFactoryProxy');
    factory = await deploy('MomaFactory');
    await send(proxy, '_setPendingImplementation', [factory._address]);
    await send(factory, '_become', [proxy._address]);
    mergeInterface(proxy, factory);
  });

  describe('createPool', () => {
    it('should create pool correctly', async () => {
      const momaMaster = await deploy('MomaMaster');
      await send(proxy, '_setMomaMaster', [momaMaster._address]);
      const tx = await send(proxy, 'createPool', {from: a1});
      const momaPoolAddress = await call(proxy, "allPools", [0]);
      const momaPool = await saddle.getContractAt("MomaMaster", momaPoolAddress);

      expect(await call(momaPool, 'admin')).toEqual(a1);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
      const poolInfo = await call(proxy, 'pools', [momaPoolAddress]);
      expect(poolInfo.creator).toEqual(a1);
      expect(poolInfo.poolFeeAdmin).toEqual(root);
      expect(poolInfo.poolFeeReceiver).toEqual(root);
      expect(poolInfo.feeFactor).toEqualNumber(0);
      expect(await call(proxy, 'getAllPools')).toEqual([momaPoolAddress]);
      expect(tx).toHaveLog('PoolCreated', {
        pool: momaPoolAddress,
        creator: a1,
        poolLength: 1
      });
    });

    it('should revert if create again by same user', async () => {
      const momaMaster = await deploy('MomaMaster');
      await send(proxy, '_setMomaMaster', [momaMaster._address]);
      await send(proxy, 'createPool', {from: a1});
      await expect(
        send(proxy, 'createPool', {from: a1})
      ).rejects.toRevert('revert');
    });

    it('should revert if not set momaMaster', async () => {
      await expect(
        send(proxy, 'createPool', {from: a1})
      ).rejects.toRevert('revert MomaPool: ZERO FORBIDDEN');
    });
  });

  describe('admin Functions', () => {
    describe('_become', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(factory, '_become', [proxy._address], {from: a1})
        ).rejects.toRevert('revert only momaFactory admin can change brains');
      });

      it('should revert if not set pending Implementation', async () => {
        await expect(
          send(factory, '_become', [proxy._address])
        ).rejects.toRevert('revert MomaFactory: pendingImplementation check');
      });
    });

    describe('_setMomaFarming', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMomaFarming', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMomaFarming have no isMomaFarming', async () => {
        await expect(
          send(proxy, '_setMomaFarming', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMomaFarming isMomaFarming return false', async () => {
        const newMomaFarming = await deploy('FalseMomaFarming');
        await expect(
          send(proxy, '_setMomaFarming', [newMomaFarming._address])
        ).rejects.toRevert('revert MomaFactory: newMomaFarming check');
      });

      it('should set newMomaFarming correctly', async () => {
        const newMomaFarming = await makeMomaFarming();
        expect(await call(proxy, 'momaFarming')).toBeAddressZero();
        const tx = await send(proxy, '_setMomaFarming', [newMomaFarming._address]);
        expect(await call(proxy, 'momaFarming')).toEqual(newMomaFarming._address);
        expect(tx).toHaveLog('NewMomaFarming', {
          oldMomaFarming: address(0),
          newMomaFarming: newMomaFarming._address
        });
      });
    });

    describe('_setFarmingDelegate', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setFarmingDelegate', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newDelegate have no isFarmingDelegate', async () => {
        await expect(
          send(proxy, '_setFarmingDelegate', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newDelegate isFarmingDelegate return false', async () => {
        const newDelegate = await deploy('FalseFarmingDelegate');
        await expect(
          send(proxy, '_setFarmingDelegate', [newDelegate._address])
        ).rejects.toRevert('revert MomaFactory: newDelegate check');
      });

      it('should set newDelegate correctly', async () => {
        const newDelegate = await deploy('FarmingDelegate');
        expect(await call(proxy, 'farmingDelegate')).toBeAddressZero();
        const tx = await send(proxy, '_setFarmingDelegate', [newDelegate._address]);
        expect(await call(proxy, 'farmingDelegate')).toEqual(newDelegate._address);
        expect(tx).toHaveLog('NewFarmingDelegate', {
          oldDelegate: address(0),
          newDelegate: newDelegate._address
        });
      });
    });

    describe('_setOracle', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setOracle', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newOracle have no isPriceOracle', async () => {
        await expect(
          send(proxy, '_setOracle', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newOracle isPriceOracle return false', async () => {
        const newOracle = await deploy('FalsePriceOracle');
        await expect(
          send(proxy, '_setOracle', [newOracle._address])
        ).rejects.toRevert('revert MomaFactory: newOracle check');
      });

      it('should set newOracle correctly', async () => {
        const newOracle = await deploy('SimplePriceOracle');
        expect(await call(proxy, 'oracle')).toBeAddressZero();
        const tx = await send(proxy, '_setOracle', [newOracle._address]);
        expect(await call(proxy, 'oracle')).toEqual(newOracle._address);
        expect(tx).toHaveLog('NewOracle', {
          oldOracle: address(0),
          newOracle: newOracle._address
        });
      });
    });

    describe('_setTimelock()', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setTimelock', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should set timelock correctly', async () => {
        expect(await call(proxy, 'timelock')).toEqualNumber(0);
        const tx = await send(proxy, '_setTimelock', [a1]);
        expect(await call(proxy, 'timelock')).toEqual(a1);
        expect(tx).toHaveLog('NewTimelock', {
          oldTimelock: address(0),
          newTimelock: a1
        });
      });
    });

    describe('_setMomaMaster', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMomaMaster', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMomaMaster have no isMomaMaster', async () => {
        await expect(
          send(proxy, '_setMomaMaster', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMomaMaster isMomaMaster return false', async () => {
        const newMomaMaster = await deploy('FalseMomaMaster');
        await expect(
          send(proxy, '_setMomaMaster', [newMomaMaster._address])
        ).rejects.toRevert('revert MomaFactory: newMomaMaster check');
      });

      it('should set newMomaMaster correctly', async () => {
        const newMomaMaster = await deploy('MomaMaster');
        expect(await call(proxy, 'momaMaster')).toBeAddressZero();
        const tx = await send(proxy, '_setMomaMaster', [newMomaMaster._address]);
        expect(await call(proxy, 'momaMaster')).toEqual(newMomaMaster._address);
        expect(tx).toHaveLog('NewMomaMaster', {
          oldMomaMaster: address(0),
          newMomaMaster: newMomaMaster._address
        });
      });
    });

    describe('_setMEther', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMEther', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMEther have no isMToken', async () => {
        await expect(
          send(proxy, '_setMEther', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMEther isMToken return false', async () => {
        const newMEther = await deploy('FalseMToken');
        await expect(
          send(proxy, '_setMEther', [newMEther._address])
        ).rejects.toRevert('revert MomaFactory: newMEther check');
      });

      it('should set newMEther correctly', async () => {
        const newMEther = await makeMToken();
        expect(await call(proxy, 'mEther')).toBeAddressZero();
        const tx = await send(proxy, '_setMEther', [newMEther._address]);
        expect(await call(proxy, 'mEther')).toEqual(newMEther._address);
        expect(tx).toHaveLog('NewMEther', {
          oldMEther: address(0),
          newMEther: newMEther._address
        });
      });
    });

    describe('_setMErc20', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMErc20', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMErc20 have no isMToken', async () => {
        await expect(
          send(proxy, '_setMErc20', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMErc20 isMToken return false', async () => {
        const newMErc20 = await deploy('FalseMToken');
        await expect(
          send(proxy, '_setMErc20', [newMErc20._address])
        ).rejects.toRevert('revert MomaFactory: newMErc20 check');
      });

      it('should set newMErc20 correctly', async () => {
        const newMErc20 = await makeMToken();
        expect(await call(proxy, 'mErc20')).toBeAddressZero();
        const tx = await send(proxy, '_setMErc20', [newMErc20._address]);
        expect(await call(proxy, 'mErc20')).toEqual(newMErc20._address);
        expect(tx).toHaveLog('NewMErc20', {
          oldMErc20: address(0),
          newMErc20: newMErc20._address
        });
      });
    });

    describe('_setMEtherImplementation', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMEtherImplementation', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMEtherImplementation have no isMToken', async () => {
        await expect(
          send(proxy, '_setMEtherImplementation', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMEtherImplementation isMToken return false', async () => {
        const newMEtherImplementation = await deploy('FalseMToken');
        await expect(
          send(proxy, '_setMEtherImplementation', [newMEtherImplementation._address])
        ).rejects.toRevert('revert MomaFactory: newMEtherImplementation check');
      });

      it('should set newMEtherImplementation correctly', async () => {
        const newMEtherImplementation = await makeMToken();
        expect(await call(proxy, 'mEtherImplementation')).toBeAddressZero();
        const tx = await send(proxy, '_setMEtherImplementation', [newMEtherImplementation._address]);
        expect(await call(proxy, 'mEtherImplementation')).toEqual(newMEtherImplementation._address);
        expect(tx).toHaveLog('NewMEtherImplementation', {
          oldMEtherImplementation: address(0),
          newMEtherImplementation: newMEtherImplementation._address
        });
      });
    });

    describe('_setMErc20Implementation', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setMErc20Implementation', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if newMErc20Implementation have no isMToken', async () => {
        await expect(
          send(proxy, '_setMErc20Implementation', [a1])
        ).rejects.toRevert('revert');
      });

      it('should revert if newMErc20Implementation isMToken return false', async () => {
        const newMErc20Implementation = await deploy('FalseMToken');
        await expect(
          send(proxy, '_setMErc20Implementation', [newMErc20Implementation._address])
        ).rejects.toRevert('revert MomaFactory: newMErc20Implementation check');
      });

      it('should set newMErc20Implementation correctly', async () => {
        const newMErc20Implementation = await makeMToken();
        expect(await call(proxy, 'mErc20Implementation')).toBeAddressZero();
        const tx = await send(proxy, '_setMErc20Implementation', [newMErc20Implementation._address]);
        expect(await call(proxy, 'mErc20Implementation')).toEqual(newMErc20Implementation._address);
        expect(tx).toHaveLog('NewMErc20Implementation', {
          oldMErc20Implementation: address(0),
          newMErc20Implementation: newMErc20Implementation._address
        });
      });
    });

    describe('_setAllowUpgrade', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_setAllowUpgrade', [true], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should set allowUpgrade correctly', async () => {
        expect(await call(proxy, 'allowUpgrade')).toEqual(false);
        await send(proxy, '_setAllowUpgrade', [true]);
        expect(await call(proxy, 'allowUpgrade')).toEqual(true);
      });
    });

    describe('_allowUpgradePool', () => {
      it('should revert if not called by admin', async () => {
        await expect(
          send(proxy, '_allowUpgradePool', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: admin check');
      });

      it('should revert if pool not created', async () => {
        await expect(
          send(proxy, '_allowUpgradePool', [a1])
        ).rejects.toRevert('revert MomaFactory: pool not created');
      });

      it('should set allowUpgrade correctly', async () => {
        const momaMaster = await deploy('MomaMaster');
        await send(proxy, '_setMomaMaster', [momaMaster._address]);
        await send(proxy, 'createPool', {from: a1});
        const momaPoolAddress = await call(proxy, "allPools", [0]);
        var {allowUpgrade} = await call(proxy, 'pools', [momaPoolAddress])
        expect(allowUpgrade).toEqual(false);
        await send(proxy, '_allowUpgradePool', [momaPoolAddress]);
        var {allowUpgrade} = await call(proxy, 'pools', [momaPoolAddress])
        expect(allowUpgrade).toEqual(true);
      });
    });
  });

  describe('feeAdmin Functions', () => {
    describe('setFeeAdmin', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setFeeAdmin', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: feeAdmin check');
      });

      it('should revert if newFeeAdmin is 0', async () => {
        await expect(
          send(proxy, 'setFeeAdmin', [address(0)])
        ).rejects.toRevert('revert MomaFactory: newFeeAdmin check');
      });

      it('should set newFeeAdmin correctly', async () => {
        expect(await call(proxy, 'feeAdmin')).toEqual(root);
        const tx = await send(proxy, 'setFeeAdmin', [a1]);
        expect(await call(proxy, 'feeAdmin')).toEqual(a1);
        expect(tx).toHaveLog('NewFeeAdmin', {
          oldFeeAdmin: root,
          newFeeAdmin: a1
        });
      });
    });

    describe('setDefualtFeeReceiver', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setDefualtFeeReceiver', [a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: feeAdmin check');
      });

      it('should revert if newFeeReceiver is 0', async () => {
        await expect(
          send(proxy, 'setDefualtFeeReceiver', [address(0)])
        ).rejects.toRevert('revert MomaFactory: newFeeReceiver check');
      });

      it('should set newDefualtFeeReceiver correctly', async () => {
        expect(await call(proxy, 'defualtFeeReceiver')).toEqual(root);
        const tx = await send(proxy, 'setDefualtFeeReceiver', [a1]);
        expect(await call(proxy, 'defualtFeeReceiver')).toEqual(a1);
        expect(tx).toHaveLog('NewDefualtFeeReceiver', {
          oldFeeReceiver: root,
          newFeeReceiver: a1
        });
      });
    });

    describe('setDefualtFeeFactor', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setDefualtFeeFactor', [etherExp(0.1)], {from: a1})
        ).rejects.toRevert('revert MomaFactory: feeAdmin check');
      });

      it('should revert if newFeeFactor > feeFactorMaxMantissa', async () => {
        await expect(
          send(proxy, 'setDefualtFeeFactor', [etherExp(1.1)])
        ).rejects.toRevert('revert MomaFactory: newFeeFactor bound check');
      });

      it('should set newFeeFactor correctly', async () => {
        expect(await call(proxy, 'defualtFeeFactorMantissa')).toEqualNumber(0);
        const tx = await send(proxy, 'setDefualtFeeFactor', [etherExp(0.1)]);
        expect(await call(proxy, 'defualtFeeFactorMantissa')).toEqualNumber(etherExp(0.1));
        expect(tx).toHaveLog('NewDefualtFeeFactor', {
          oldFeeFactor: 0,
          newFeeFactor: etherExp(0.1)
        });
      });
    });

    describe('setNoFeeTokenStatus', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setNoFeeTokenStatus', [a1, true], {from: a1})
        ).rejects.toRevert('revert MomaFactory: feeAdmin check');
      });

      it('should set newNoFeeTokenStatus correctly', async () => {
        expect(await call(proxy, 'noFeeTokens', [a1])).toEqual(false);
        const tx = await send(proxy, 'setNoFeeTokenStatus', [a1, true]);
        expect(await call(proxy, 'noFeeTokens', [a1])).toEqual(true);
        expect(tx).toHaveLog('NewNoFeeTokenStatus', {
          token: a1,
          oldNoFeeTokenStatus: false,
          newNoFeeTokenStatus: true
        });
      });
    });

    describe('setTokenFeeFactor', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setTokenFeeFactor', [a1, etherExp(0.1)], {from: a1})
        ).rejects.toRevert('revert MomaFactory: feeAdmin check');
      });

      it('should revert if newFeeFactor > feeFactorMaxMantissa', async () => {
        await expect(
          send(proxy, 'setTokenFeeFactor', [a1, etherExp(1.1)])
        ).rejects.toRevert('revert MomaFactory: newFeeFactor bound check');
      });

      it('should set newFeeFactor correctly', async () => {
        expect(await call(proxy, 'tokenFeeFactors', [a1])).toEqualNumber(0);
        const tx = await send(proxy, 'setTokenFeeFactor', [a1, etherExp(0.1)]);
        expect(await call(proxy, 'tokenFeeFactors', [a1])).toEqualNumber(etherExp(0.1));
        expect(tx).toHaveLog('NewTokenFeeFactor', {
          token: a1,
          oldFeeFactor: 0,
          newFeeFactor: etherExp(0.1)
        });
      });
    });
  });

  describe('poolFeeAdmin Functions', () => {
    beforeEach(async () => {
      const momaMaster = await deploy('MomaMaster');
      Object.assign(proxy, { momaMaster });
      await send(proxy, '_setMomaMaster', [momaMaster._address]);
      momaPool = await makeMomaPool({factory: proxy});
    });

    describe('setPoolFeeAdmin', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setPoolFeeAdmin', [momaPool._address, a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: poolFeeAdmin check');
      });

      it('should revert if newPoolFeeAdmin is 0', async () => {
        await expect(
          send(proxy, 'setPoolFeeAdmin', [momaPool._address, address(0)])
        ).rejects.toRevert('revert MomaFactory: newPoolFeeAdmin check');
      });

      it('should set newPoolFeeAdmin correctly', async () => {
        let poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.poolFeeAdmin).toEqual(root);
        const tx = await send(proxy, 'setPoolFeeAdmin', [momaPool._address, a1]);
        poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.poolFeeAdmin).toEqual(a1);
        expect(tx).toHaveLog('NewPoolFeeAdmin', {
          pool: momaPool._address,
          oldPoolFeeAdmin: root,
          newPoolFeeAdmin: a1
        });
      });
    });

    describe('setPoolFeeReceiver', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setPoolFeeReceiver', [momaPool._address, a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: poolFeeAdmin check');
      });

      it('should revert if newPoolFeeReceiver is 0', async () => {
        await expect(
          send(proxy, 'setPoolFeeReceiver', [momaPool._address, address(0)])
        ).rejects.toRevert('revert MomaFactory: newPoolFeeReceiver check');
      });

      it('should set newPoolFeeReceiver correctly', async () => {
        let poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.poolFeeReceiver).toEqual(root);
        const tx = await send(proxy, 'setPoolFeeReceiver', [momaPool._address, a1]);
        poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.poolFeeReceiver).toEqual(a1);
        expect(tx).toHaveLog('NewPoolFeeReceiver', {
          pool: momaPool._address,
          oldPoolFeeReceiver: root,
          newPoolFeeReceiver: a1
        });
      });
    });

    describe('setPoolFeeFactor', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setPoolFeeFactor', [momaPool._address, a1], {from: a1})
        ).rejects.toRevert('revert MomaFactory: poolFeeAdmin check');
      });

      it('should revert if newFeeFactor > feeFactorMaxMantissa', async () => {
        await expect(
          send(proxy, 'setPoolFeeFactor', [momaPool._address, etherExp(1.1)])
        ).rejects.toRevert('revert MomaFactory: newFeeFactor bound check');
      });

      it('should set newFeeFactor correctly', async () => {
        let poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.feeFactor).toEqualNumber(0);
        const tx = await send(proxy, 'setPoolFeeFactor', [momaPool._address, etherExp(0.1)]);
        poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.feeFactor).toEqualNumber(etherExp(0.1));
        expect(tx).toHaveLog('NewPoolFeeFactor', {
          pool: momaPool._address,
          oldPoolFeeFactor: 0,
          newPoolFeeFactor: etherExp(0.1)
        });
      });
    });

    describe('setPoolFeeStatus', () => {
      it('should revert if not called by feeAdmin', async () => {
        await expect(
          send(proxy, 'setPoolFeeStatus', [momaPool._address, true], {from: a1})
        ).rejects.toRevert('revert MomaFactory: poolFeeAdmin check');
      });

      it('should set poolFeeStatus correctly', async () => {
        let poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.noFee).toEqual(false);
        const tx = await send(proxy, 'setPoolFeeStatus', [momaPool._address, true]);
        poolInfo = await call(proxy, 'pools', [momaPool._address]);
        expect(poolInfo.noFee).toEqual(true);
        expect(tx).toHaveLog('NewPoolFeeStatus', {
          pool: momaPool._address,
          oldPoolFeeStatus: false,
          newPoolFeeStatus: true
        });
      });
    });
  });

  describe('pool Functions', () => {
    beforeEach(async () => {
      const momaMaster = await deploy('MomaMaster');
      Object.assign(proxy, { momaMaster });
      await send(proxy, '_setMomaMaster', [momaMaster._address]);
      momaPool = await makeMomaPool({factory: proxy, addPriceOracle: true});
    });

    describe('upgradeLendingPool', () => {
      it('should revert if pool not created', async () => {
        await expect(
          send(proxy, 'upgradeLendingPool')
        ).rejects.toRevert('revert MomaFactory: pool not created');
      });

      it('should revert if not allowed upgrade', async () => {
        var {allowUpgrade} = await call(proxy, 'pools', [momaPool._address])
        expect(allowUpgrade).toEqual(false);
        expect(await call(proxy, 'allowUpgrade')).toEqual(false);
        await expect(
          send(momaPool, '_upgradeLendingPool')
        ).rejects.toRevert('revert MomaFactory: upgrade not allowed');
      });

      it('should allow upgrade if set allowUpgrade', async () => {
        const momaFarming = await makeMomaFarming({proxy});
        await send(proxy, '_setMomaFarming', [momaFarming._address]);
        await send(proxy, '_setAllowUpgrade', [true]);

        expect(await call(proxy, 'allowUpgrade')).toEqual(true);
        expect(await call(proxy, 'lendingPoolNum')).toEqualNumber(0);
        var {isLending} = await call(proxy, 'pools', [momaPool._address])
        expect(isLending).toEqual(false);

        mergeInterface(momaPool, proxy);
        const tx = await send(momaPool, '_upgradeLendingPool');
        var {isLending} = await call(proxy, 'pools', [momaPool._address])
        expect(isLending).toEqual(true);
        expect(await call(proxy, 'lendingPoolNum')).toEqualNumber(1);
        expect(tx).toHaveLog('NewLendingPool', {
          pool: momaPool._address,
        });
      });

      it('should revert if upgrade again', async () => {
        const momaFarming = await makeMomaFarming({proxy});
        await send(proxy, '_setMomaFarming', [momaFarming._address]);
        await send(proxy, '_allowUpgradePool', [momaPool._address]);
        await send(momaPool, '_upgradeLendingPool');
        await expect(
          send(momaPool, '_upgradeLendingPool')
        ).rejects.toRevert('revert MomaFactory: can only upgrade once');
      });
    });
  });

  describe('view Functions', () => {
    describe('getMomaFeeFactorMantissa', () => {
      let pool, underlying;
      beforeEach(async () => {
        const momaMaster = await deploy('MomaMaster');
        Object.assign(proxy, { momaMaster });
        await send(proxy, '_setMomaMaster', [momaMaster._address]);
        momaPool = await makeMomaPool({factory: proxy});
        pool = momaPool._address, underlying = a1;
      });

      it('should return pool fee factor by default', async () => {
        expect(await call(proxy, 'tokenFeeFactors', [underlying])).toEqualNumber(0);
        expect(await call(proxy, 'noFeeTokens', [underlying])).toEqual(false);
        var {noFee, feeFactor} = await call(proxy, 'pools', [pool]);
        expect(noFee).toEqual(false);
        expect(feeFactor).toEqualNumber(0);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setPoolFeeFactor', [pool, etherExp(0.1)]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.1));

        await send(proxy, 'setPoolFeeFactor', [pool, 0]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);
      });

      it('should return token fee factor even if set pool fee factor', async () => {
        expect(await call(proxy, 'tokenFeeFactors', [underlying])).toEqualNumber(0);
        expect(await call(proxy, 'noFeeTokens', [underlying])).toEqual(false);
        var {noFee, feeFactor} = await call(proxy, 'pools', [pool]);
        expect(noFee).toEqual(false);
        expect(feeFactor).toEqualNumber(0);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setPoolFeeFactor', [pool, etherExp(0.1)]);
        await send(proxy, 'setTokenFeeFactor', [underlying, etherExp(0.2)]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.2));

        await send(proxy, 'setTokenFeeFactor', [underlying, 0]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.1));

        await send(proxy, 'setTokenFeeFactor', [underlying, etherExp(0.5)]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.5));
      });

      it('should return 0 if set no fee pool', async () => {
        expect(await call(proxy, 'tokenFeeFactors', [underlying])).toEqualNumber(0);
        expect(await call(proxy, 'noFeeTokens', [underlying])).toEqual(false);
        var {noFee, feeFactor} = await call(proxy, 'pools', [pool]);
        expect(noFee).toEqual(false);
        expect(feeFactor).toEqualNumber(0);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setPoolFeeFactor', [pool, etherExp(0.1)]);
        await send(proxy, 'setTokenFeeFactor', [underlying, etherExp(0.2)]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.2));

        await send(proxy, 'setPoolFeeStatus', [pool, true]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setPoolFeeStatus', [pool, false]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.2));
      });

      it('should return 0 if set no fee token', async () => {
        expect(await call(proxy, 'tokenFeeFactors', [underlying])).toEqualNumber(0);
        expect(await call(proxy, 'noFeeTokens', [underlying])).toEqual(false);
        var {noFee, feeFactor} = await call(proxy, 'pools', [pool]);
        expect(noFee).toEqual(false);
        expect(feeFactor).toEqualNumber(0);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setPoolFeeFactor', [pool, etherExp(0.1)]);
        await send(proxy, 'setTokenFeeFactor', [underlying, etherExp(0.2)]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.2));

        await send(proxy, 'setNoFeeTokenStatus', [underlying, true]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(0);

        await send(proxy, 'setNoFeeTokenStatus', [underlying, false]);
        expect(await call(proxy, 'getMomaFeeFactorMantissa', [pool, underlying])).toEqualNumber(etherExp(0.2));
      });
    });

    describe('isCodeSame', () => {
      it('should return true for two different user', async () => {
        expect(root).not.toEqual(a1);
        expect(await call(proxy, 'isCodeSame', [root, a1])).toEqual(true);
      });

      it('should return false for user and contract', async () => {
        const c1 = await deploy('MErc20');
        const c2 = await deploy('Moma', [root]);
        expect(c1._address).not.toEqual(a1);
        expect(await call(proxy, 'isCodeSame', [c1._address, a1])).toEqual(false);
        expect(c2._address).not.toEqual(a1);
        expect(await call(proxy, 'isCodeSame', [c2._address, a1])).toEqual(false);
      });

      it('should return false for two different non-constructor contract', async () => {
        const c1 = await deploy('MErc20');
        const c2 = await deploy('MEther');
        expect(c1._address).not.toEqual(c2._address);
        expect(await call(proxy, 'isCodeSame', [c1._address, c2._address])).toEqual(false);
      });

      it('should return false for two different constructor contract', async () => {
        const c1 = await deploy('WhitePaperInterestRateModel', [1, 1]);
        const c2 = await deploy('Moma', [root]);
        expect(c1._address).not.toEqual(c2._address);
        expect(await call(proxy, 'isCodeSame', [c1._address, c2._address])).toEqual(false);
      });

      it('should return true for two same non-constructor contract', async () => {
        const c1 = await deploy('MErc20');
        const c2 = await deploy('MErc20');
        expect(c1._address).not.toEqual(c2._address);
        expect(await call(proxy, 'isCodeSame', [c1._address, c2._address])).toEqual(true);
      });

      it('should return true for two same constructor contract with different param', async () => {
        const c1 = await deploy('WhitePaperInterestRateModel', [1, 1]);
        const c2 = await deploy('WhitePaperInterestRateModel', [100, 201]);
        expect(c1._address).not.toEqual(c2._address);
        expect(await call(proxy, 'isCodeSame', [c1._address, c2._address])).toEqual(true);
      });
    });

    describe('isTimelock', () => {
      let timelock, delay;
      beforeEach(async () => {
        delay = 2 * 24 * 3600;
        timelock = await deploy('Timelock', [a1, delay]);
      });

      it('should return true for user when not set timelock contract', async () => {
        expect(await call(proxy, 'timelock')).toBeAddressZero();
        expect(await call(proxy, 'isTimelock', [a1])).toEqual(true);
      });

      it('should return true for user when set user', async () => {
        await send(proxy, '_setTimelock', [root]);
        expect(await call(proxy, 'timelock')).toEqual(root);
        expect(root).not.toEqual(a1);
        expect(await call(proxy, 'isTimelock', [a1])).toEqual(true);
      });

      it('should return false for contract when set user', async () => {
        await send(proxy, '_setTimelock', [root]);
        expect(await call(proxy, 'timelock')).toEqual(root);
        expect(root).not.toEqual(timelock._address);
        expect(await call(proxy, 'isTimelock', [timelock._address])).toEqual(false);
      });

      it('should return false for user when set timelock contract', async () => {
        await send(proxy, '_setTimelock', [timelock._address]);
        expect(timelock._address).not.toEqual(a1);
        expect(await call(proxy, 'isTimelock', [a1])).toEqual(false);
      });

      it('should return false for different contract when set timelock contract', async () => {
        await send(proxy, '_setTimelock', [timelock._address]);
        const contract = await deploy('MErc20');
        expect(timelock._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isTimelock', [contract._address])).toEqual(false);
      });

      it('should return true for timelock when set timelock contract', async () => {
        await send(proxy, '_setTimelock', [timelock._address]);
        const same = await deploy('Timelock', [a1, delay]);
        const diff = await deploy('Timelock', [root, 2 * delay]);
        expect(timelock._address).not.toEqual(same._address);
        expect(await call(proxy, 'isTimelock', [same._address])).toEqual(true);
        expect(timelock._address).not.toEqual(diff._address);
        expect(await call(proxy, 'isTimelock', [diff._address])).toEqual(true);
      });
    });

    describe('isMomaMaster', () => {
      let momaMaster;
      beforeEach(async () => {
        momaMaster = await deploy('MomaMaster', {from: root});
      });

      it('should return true for user when not set momaMaster contract', async () => {
        expect(await call(proxy, 'momaMaster')).toBeAddressZero();
        expect(await call(proxy, 'isMomaMaster', [a1])).toEqual(true);
      });

      it('should return false for user when set momaMaster contract', async () => {
        await send(proxy, '_setMomaMaster', [momaMaster._address]);
        expect(momaMaster._address).not.toEqual(a1);
        expect(await call(proxy, 'isMomaMaster', [a1])).toEqual(false);
      });

      it('should return false for different contract when set momaMaster contract', async () => {
        await send(proxy, '_setMomaMaster', [momaMaster._address]);
        const contract = await deploy('MErc20');
        expect(momaMaster._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMomaMaster', [contract._address])).toEqual(false);
      });

      it('should return true for momaMaster when set momaMaster contract', async () => {
        await send(proxy, '_setMomaMaster', [momaMaster._address]);
        const same = await deploy('MomaMaster', {from: root});
        expect(momaMaster._address).not.toEqual(same._address);
        expect(await call(proxy, 'isMomaMaster', [same._address])).toEqual(true);
        const diff = await deploy('MomaMaster', {from: a1});
        expect(momaMaster._address).not.toEqual(diff._address);
        expect(await call(proxy, 'isMomaMaster', [diff._address])).toEqual(true);
      });
    });

    describe('isMEtherImplementation', () => {
      let mEtherImplementation;
      beforeEach(async () => {
        mEtherImplementation = await deploy('MEtherDelegate', {from: root});
      });

      it('should return true for user when not set mEtherImplementation contract', async () => {
        expect(await call(proxy, 'mEtherImplementation')).toBeAddressZero();
        expect(await call(proxy, 'isMEtherImplementation', [a1])).toEqual(true);
      });

      it('should return false for user when set mEtherImplementation contract', async () => {
        await send(proxy, '_setMEtherImplementation', [mEtherImplementation._address]);
        expect(mEtherImplementation._address).not.toEqual(a1);
        expect(await call(proxy, 'isMEtherImplementation', [a1])).toEqual(false);
      });

      it('should return false for different contract when set mEtherImplementation contract', async () => {
        await send(proxy, '_setMEtherImplementation', [mEtherImplementation._address]);
        const contract = await deploy('MErc20');
        expect(mEtherImplementation._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMEtherImplementation', [contract._address])).toEqual(false);
      });

      it('should return true for mEtherImplementation when set mEtherImplementation contract', async () => {
        await send(proxy, '_setMEtherImplementation', [mEtherImplementation._address]);
        const same = await deploy('MEtherDelegate', {from: root});
        expect(mEtherImplementation._address).not.toEqual(same._address);
        expect(await call(proxy, 'isMEtherImplementation', [same._address])).toEqual(true);
        const diff = await deploy('MEtherDelegate', {from: a1});
        expect(mEtherImplementation._address).not.toEqual(diff._address);
        expect(await call(proxy, 'isMEtherImplementation', [diff._address])).toEqual(true);
      });
    });

    describe('isMErc20Implementation', () => {
      let mErc20Implementation;
      beforeEach(async () => {
        mErc20Implementation = await deploy('MErc20Delegate', {from: root});
      });

      it('should return true for user when not set mErc20Implementation contract', async () => {
        expect(await call(proxy, 'mErc20Implementation')).toBeAddressZero();
        expect(await call(proxy, 'isMErc20Implementation', [a1])).toEqual(true);
      });

      it('should return false for user when set mErc20Implementation contract', async () => {
        await send(proxy, '_setMErc20Implementation', [mErc20Implementation._address]);
        expect(mErc20Implementation._address).not.toEqual(a1);
        expect(await call(proxy, 'isMErc20Implementation', [a1])).toEqual(false);
      });

      it('should return false for different contract when set mErc20Implementation contract', async () => {
        await send(proxy, '_setMErc20Implementation', [mErc20Implementation._address]);
        const contract = await deploy('MErc20');
        expect(mErc20Implementation._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMErc20Implementation', [contract._address])).toEqual(false);
      });

      it('should return true for mErc20Implementation when set mErc20Implementation contract', async () => {
        await send(proxy, '_setMErc20Implementation', [mErc20Implementation._address]);
        const same = await deploy('MErc20Delegate', {from: root});
        expect(mErc20Implementation._address).not.toEqual(same._address);
        expect(await call(proxy, 'isMErc20Implementation', [same._address])).toEqual(true);
        const diff = await deploy('MErc20Delegate', {from: a1});
        expect(mErc20Implementation._address).not.toEqual(diff._address);
        expect(await call(proxy, 'isMErc20Implementation', [diff._address])).toEqual(true);
      });
    });

    describe('isMToken', () => {
      let mErc20, mEther, momaPool;
      beforeEach(async () => {
        mErc20 = await makeMToken({contract: 'MErc20Delegator'});
        momaPool = mErc20.momaPool;
        mEther = await makeMToken({momaPool, kind:'mether', contract: 'MEtherDelegator'});
        proxy = mErc20.momaPool.factory;
      });

      it('should return true for user when not set mErc20 and mEther contract', async () => {
        expect(await call(proxy, 'mErc20')).toBeAddressZero();
        expect(await call(proxy, 'mEther')).toBeAddressZero();
        expect(await call(proxy, 'isMToken', [a1])).toEqual(true);
      });

      it('should return true for user when set mErc20 contract but not set mEther', async () => {
        await send(proxy, '_setMErc20', [mErc20._address]);
        expect(mErc20._address).not.toEqual(a1);
        expect(await call(proxy, 'isMToken', [a1])).toEqual(true);
      });

      it('should return true for user when set mEther contract but not set mErc20', async () => {
        await send(proxy, '_setMEther', [mEther._address]);
        expect(mEther._address).not.toEqual(a1);
        expect(await call(proxy, 'isMToken', [a1])).toEqual(true);
      });

      it('should return false for user when set mEther and mErc20 contract', async () => {
        await send(proxy, '_setMEther', [mEther._address]);
        await send(proxy, '_setMErc20', [mErc20._address]);
        expect(mEther._address).not.toEqual(a1);
        expect(mErc20._address).not.toEqual(a1);
        expect(await call(proxy, 'isMToken', [a1])).toEqual(false);
      });

      it('should return false for different contract when only set mErc20 contract', async () => {
        await send(proxy, '_setMErc20', [mErc20._address]);
        const contract = await deploy('Moma', [root]);
        expect(mErc20._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMToken', [contract._address])).toEqual(false);
      });

      it('should return false for different contract when only set mEther contract', async () => {
        await send(proxy, '_setMEther', [mEther._address]);
        const contract = await deploy('Moma', [root]);
        expect(mEther._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMToken', [contract._address])).toEqual(false);
      });

      it('should return false for different contract when set mErc20 and mEther contract', async () => {
        await send(proxy, '_setMEther', [mEther._address]);
        await send(proxy, '_setMErc20', [mErc20._address]);
        const contract = await deploy('Moma', [root]);
        expect(mEther._address).not.toEqual(contract._address);
        expect(mErc20._address).not.toEqual(contract._address);
        expect(await call(proxy, 'isMToken', [contract._address])).toEqual(false);
      });

      it('should return true for mErc20 when only set mErc20 contract', async () => {
        await send(proxy, '_setMErc20', [mErc20._address]);
        const underlying = await makeToken();
        const same = await deploy('MErc20Delegator', [underlying._address, momaPool._address, 1, 'name', 'SYM', 8, '0x', a1]);
        expect(mErc20._address).not.toEqual(same._address);
        expect(await call(proxy, 'isMToken', [same._address])).toEqual(true);
      });

      it('should return true for mEther when only set mEther contract', async () => {
        await send(proxy, '_setMEther', [mEther._address]);
        const same = await deploy('MEtherDelegator', [momaPool._address, 1, 'name', 'SYM', 8, '0x', a1]);
        expect(mEther._address).not.toEqual(same._address);
        expect(await call(proxy, 'isMToken', [same._address])).toEqual(true);
      });

      it('should return true for mErc20 or mEther when set mErc20 annd mEther contract', async () => {
        await send(proxy, '_setMErc20', [mErc20._address]);
        await send(proxy, '_setMEther', [mEther._address]);
        const underlying = await makeToken();
        const c1 = await deploy('MErc20Delegator', [underlying._address, momaPool._address, 222, 'names', 'SYMB', 8, '0x', root]);
        const c2 = await deploy('MEtherDelegator', [momaPool._address, 111, 'name', 'SYM', 8, '0x', root]);

        expect(mErc20._address).not.toEqual(c1._address);
        expect(mErc20._address).not.toEqual(c2._address);
        expect(mEther._address).not.toEqual(c1._address);
        expect(mEther._address).not.toEqual(c2._address);
        expect(await call(proxy, 'isMToken', [c1._address])).toEqual(true);
        expect(await call(proxy, 'isMToken', [c2._address])).toEqual(true);
      });
    });
  });
});
