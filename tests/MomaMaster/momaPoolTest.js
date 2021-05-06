const {
  address,
  etherUnsigned,
  encodeParameters,
  freezeTime,
  keccak256,
  mergeInterface
} = require('../Utils/Ethereum');

const {
  makeMomaPool,
} = require('../Utils/Moma');

describe('MomaPool', () => {
  let root, accounts;
  let momaPool;
  let momaMaster;
  let factory;

  beforeEach(async () => {
    [root, guy, ...accounts] = saddle.accounts;
    momaPool = await makeMomaPool();
    factory = momaPool.factory;
    momaMaster = factory.momaMaster;
  });

  describe("constructor", () => {
    it("sets factory to caller and initialize correct", async () => {
      expect(await call(momaPool, 'factory')).toEqual(factory._address);
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
    });
  });

  describe("initialize", () => {
    let rootMomaPool;

    beforeEach(async () => {
      rootMomaPool = await deploy('MomaPool');
    });

    it("reverts if try to initialize by non-admin", async () => {
      await expect(send(rootMomaPool, 'initialize', [root, root], { from: guy })).rejects.toRevert('revert MomaPool: FORBIDDEN');
      expect(await call(rootMomaPool, 'admin')).toBeAddressZero();
      expect(await call(rootMomaPool, 'momaMasterImplementation')).toBeAddressZero();
    });

    it("reverts if try to initialize with zero implementation_", async () => {
      await expect(send(rootMomaPool, 'initialize', [root, address(0)])).rejects.toRevert('revert MomaPool: ZERO FORBIDDEN');
      expect(await call(rootMomaPool, 'admin')).toBeAddressZero();
      expect(await call(rootMomaPool, 'momaMasterImplementation')).toBeAddressZero();
    });

    it("reverts if try to initialize again", async () => {
      await expect(send(momaPool, 'initialize', [root, root])).rejects.toRevert('revert MomaPool: FORBIDDEN');
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);

      expect(await call(rootMomaPool, 'admin')).toBeAddressZero();
      expect(await call(rootMomaPool, 'momaMasterImplementation')).toBeAddressZero();
      await send(rootMomaPool, 'initialize', [root, root]);
      expect(await call(rootMomaPool, 'admin')).toEqual(root);
      expect(await call(rootMomaPool, 'momaMasterImplementation')).toEqual(root);
      await expect(send(rootMomaPool, 'initialize', [root, root])).rejects.toRevert('revert MomaPool: FORBIDDEN');
      expect(await call(rootMomaPool, 'admin')).toEqual(root);
      expect(await call(rootMomaPool, 'momaMasterImplementation')).toEqual(root);
    });
  });

  let setPending = (implementation, from) => {
    return send(momaPool, '_setPendingImplementation', [implementation._address], {from});
  };

  describe("_setPendingImplementation", () => {
    it("emits a failure log when called by non-admin", async () => {
      let result = await setPending(momaMaster, guy);
      expect(result).toHaveTrollFailure('UNAUTHORIZED', 'SET_PENDING_IMPLEMENTATION_OWNER_CHECK');
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
    });

    it("reverts if not momaMaster", async () => {
      const momaMasterHarness = await deploy('MomaMasterHarness');
      await expect(setPending(momaMasterHarness, root)).rejects.toRevert('revert MomaPool: NOT MOMAMASTER');
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
    });

    it("stores pendingMomaMasterImplementation with value newPendingImplementation and emits NewPendingImplementation event", async () => {
      const momaMaster_ = await deploy('MomaMaster');
      let result = await setPending(momaMaster_, root);
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toEqual(momaMaster_._address);
      
      expect(result).toHaveLog('NewPendingImplementation', {
          oldPendingImplementation: address(0),
          newPendingImplementation: momaMaster_._address
      });
    });
  });

  describe("_acceptImplementation", () => {
    describe("Check caller is pendingMomaMasterImplementation and pendingMomaMasterImplementation ≠ address(0) ", () => {
      let result;

      it("emits a failure log when pendingMomaMasterImplementation = address(0)", async () => {
        expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
        expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
        result = await send(momaPool, '_acceptImplementation');
        expect(result).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK');
        expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
        expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
      });

      it("emits a failure log when caller is not pendingMomaMasterImplementation", async () => {
        const momaMaster_ = await deploy('MomaMaster');
        await setPending(momaMaster_, root);
        expect(await call(momaPool, 'pendingMomaMasterImplementation')).toEqual(momaMaster_._address);
        expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
        result = await send(momaPool, '_acceptImplementation');
        expect(result).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_PENDING_IMPLEMENTATION_ADDRESS_CHECK');
        expect(await call(momaPool, 'pendingMomaMasterImplementation')).toEqual(momaMaster_._address);
        expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
      });
    });

    it("reverts if not momaMaster", async () => {
      const momaFactoryHarness = await deploy('MomaFactoryHarness');
      const momaPoolHarness = await makeMomaPool({factoryOpts: {factory: momaFactoryHarness}});
      await send(momaPoolHarness, 'harnessSetPendingImplementation', [root]);
      expect(await call(momaPoolHarness, 'pendingMomaMasterImplementation')).toEqual(root);

      await expect(send(momaPoolHarness, '_acceptImplementation')).rejects.toRevert('revert MomaPool: NOT MOMAMASTER');
      expect(await call(momaPoolHarness, 'pendingMomaMasterImplementation')).toEqual(root);
      expect(await call(momaPoolHarness, 'momaMasterImplementation')).toEqual(momaPoolHarness.factory.momaMaster._address);
    });

    it("stores new momaMasterImplementation and unset pendingMomaMasterImplementation", async () => {
      const momaMaster_ = await deploy('MomaMaster');
      await setPending(momaMaster_, root);
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toEqual(momaMaster_._address);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster._address);
      expect(momaMaster._address).not.toEqual(momaMaster_._address);

      mergeInterface(momaMaster_, momaPool);
      result = await send(momaMaster_, '_become', [momaPool._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewImplementation', {
        oldImplementation: momaMaster._address,
        newImplementation: momaMaster_._address
      });
      expect(result).toHaveLog('NewPendingImplementation', {
        oldPendingImplementation: momaMaster_._address,
        newPendingImplementation: address(0)
      });

      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster_._address);
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();

      const momaMaster__ = await deploy('MomaMaster');
      await setPending(momaMaster__, root);
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toEqual(momaMaster__._address);
      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster_._address);
      expect(momaMaster_._address).not.toEqual(momaMaster__._address);

      mergeInterface(momaMaster__, momaPool);
      result = await send(momaMaster__, '_become', [momaPool._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewImplementation', {
        oldImplementation: momaMaster_._address,
        newImplementation: momaMaster__._address
      });
      expect(result).toHaveLog('NewPendingImplementation', {
        oldPendingImplementation: momaMaster__._address,
        newPendingImplementation: address(0)
      });

      expect(await call(momaPool, 'momaMasterImplementation')).toEqual(momaMaster__._address);
      expect(await call(momaPool, 'pendingMomaMasterImplementation')).toBeAddressZero();
    });
  });

  let setPendingAdmin = (admin, from) => {
    return send(momaPool, '_setPendingAdmin', [admin], {from});
  };

  describe("_setPendingAdmin", () => {
    let timelock;
    let delay = 2 * 24 * 60 * 60;

    beforeEach(async () => {
      timelock = await deploy('Timelock', [root, delay]);
      await send(factory, '_setTimelock', [timelock._address]);
    });

    it("emits a failure log when called by non-admin", async () => {
      let result = await setPendingAdmin(guy, guy);
      expect(result).toHaveTrollFailure('UNAUTHORIZED', 'SET_PENDING_ADMIN_OWNER_CHECK');
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
    });

    it("reverts if not timelock", async () => {
      await expect(setPendingAdmin(guy, root)).rejects.toRevert('revert MomaPool: NOT TIMELOCK');
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
    });

    it("stores pendingAdmin with value newPendingAdmin and emits NewPendingAdmin event", async () => {
      const timelock_ = await deploy('Timelock', [guy, delay * 2]);
      expect(timelock._address).not.toEqual(timelock_._address);
      let result = await setPendingAdmin(timelock_._address, root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(timelock_._address);

      expect(result).toHaveLog('NewPendingAdmin', {
          oldPendingAdmin: address(0),
          newPendingAdmin: timelock_._address
      });
    });
  });

  describe("_acceptAdmin", () => {
    let timelock;
    let delay = 2 * 24 * 60 * 60;

    beforeEach(async () => {
      timelock = await deploy('Timelock', [root, delay]);
      await send(factory, '_setTimelock', [timelock._address]);
    });
    
    describe("Check caller is pendingAdmin and pendingAdmin ≠ address(0) ", () => {
      let result;

      it("emits a failure log when pendingAdmin = address(0)", async () => {
        expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
        expect(await call(momaPool, 'admin')).toEqual(root);
        result = await send(momaPool, '_acceptAdmin');
        expect(result).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_ADMIN_PENDING_ADMIN_CHECK');
        expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
        expect(await call(momaPool, 'admin')).toEqual(root);
      });

      it("emits a failure log when caller is not pendingAdmin", async () => {
        const timelock_ = await deploy('Timelock', [guy, delay * 2]);
        await setPendingAdmin(timelock_._address, root);
        expect(await call(momaPool, 'pendingAdmin')).toEqual(timelock_._address);
        expect(await call(momaPool, 'admin')).toEqual(root);
        result = await send(momaPool, '_acceptAdmin');
        expect(result).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_ADMIN_PENDING_ADMIN_CHECK');
        expect(await call(momaPool, 'pendingAdmin')).toEqual(timelock_._address);
        expect(await call(momaPool, 'admin')).toEqual(root);
      });
    });

    it("reverts if not timelock", async () => {
      await send(factory, '_setTimelock', [accounts[2]]);
      await setPendingAdmin(guy, root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(guy);
      expect(await call(momaPool, 'admin')).toEqual(root);
      await send(factory, '_setTimelock', [timelock._address]);
      await expect(send(momaPool, '_acceptAdmin', {from: guy})).rejects.toRevert('revert MomaPool: NOT TIMELOCK');
      expect(await call(momaPool, 'pendingAdmin')).toEqual(guy);
      expect(await call(momaPool, 'admin')).toEqual(root);
    });

    it("stores new admin and unset pendingAdmin", async () => {
      const timelock_ = await deploy('Timelock', [guy, delay * 2]);
      await setPendingAdmin(timelock_._address, root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(timelock_._address);
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(root).not.toEqual(timelock_._address);

      let target = momaPool._address;
      let value = 0;
      let signature = '_acceptAdmin()';
      let data = encodeParameters([], []);
      blockTimestamp = etherUnsigned(100);
      await freezeTime(blockTimestamp.toNumber())
      let eta = blockTimestamp.plus(delay * 2);
      queuedTxHash = keccak256(
        encodeParameters(
          ['address', 'uint256', 'string', 'bytes', 'uint256'],
          [target, value.toString(), signature, data, eta.toString()]
        )
      );
      await send(timelock_, 'queueTransaction', [target, value, signature, data, eta], {from: guy});
      const newBlockTimestamp = eta.plus(1);
      await freezeTime(newBlockTimestamp.toNumber());
      mergeInterface(timelock_, momaPool);
      const result = await send(timelock_, 'executeTransaction', [target, value, signature, data, eta], {from: guy});

      expect(await call(momaPool, 'admin')).toEqual(timelock_._address);
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
      expect(result).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: timelock_._address
      });
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: timelock_._address,
        newPendingAdmin: address(0)
      });
    });
  });

  describe("fallback delegates to momaMaster", () => {
    let troll;
    beforeAll(async () => {
      troll = await deploy('EchoTypesMomaMaster');
      await send(factory, '_setMomaMaster', [troll._address]);
      const allPoolsLength = await call(factory, "allPoolsLength");
      await send(factory, 'createPool', {from: guy});
      const momaPoolAddress = await call(factory, "allPools", [+allPoolsLength]);
      troll.options.address = momaPoolAddress;
    });

    it("forwards reverts", async () => {
      await expect(call(troll, 'reverty')).rejects.toRevert("revert gotcha sucka");
    });

    it("gets addresses", async () => {
      expect(await call(troll, 'addresses', [troll._address])).toEqual(troll._address);
    });

    it("gets strings", async () => {
      expect(await call(troll, 'stringy', ["yeet"])).toEqual("yeet");
    });

    it("gets bools", async () => {
      expect(await call(troll, 'booly', [true])).toEqual(true);
    });

    it("gets list of ints", async () => {
      expect(await call(troll, 'listOInts', [[1,2,3]])).toEqual(["1", "2", "3"]);
    });
  });
});
