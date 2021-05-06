const {
  address,
  mergeInterface
} = require('../Utils/Ethereum');


describe('MomaFactoryProxy', () => {
  let root, accounts;
  let proxy;
  let factory;
  let setPending = (implementation, from) => {
    return send(proxy, '_setPendingImplementation', [implementation._address], {from});
  };
  
  beforeEach(async () => {
    [root, guy, ...accounts] = saddle.accounts;
    proxy = await deploy('MomaFactoryProxy');
    factory = await deploy('MomaFactory');
  });

  describe("constructor", () => {
    it("sets admin correct", async () => {
      expect(await call(proxy, 'admin')).toEqual(root);
    });

    it("sets feeAdmin correct", async () => {
      expect(await call(proxy, 'feeAdmin')).toEqual(root);
    });

    it("sets defualtFeeReceiver correct", async () => {
      expect(await call(proxy, 'defualtFeeReceiver')).toEqual(root);
    });
  });

  describe("_setPendingImplementation", () => {
    it("reverts when called by non-admin", async () => {
      await expect(
        send(proxy, '_setPendingImplementation', [factory._address], {from: guy})
      ).rejects.toRevert('revert MomaFactory: admin check');
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toBeAddressZero();
    });

    it("stores pendingMomaFactoryImplementation with value newPendingImplementation and emits NewPendingImplementation event", async () => {
      let result = await setPending(factory, root);
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toEqual(factory._address);
      expect(result).toHaveLog('NewPendingImplementation', {
          oldPendingImplementation: address(0),
          newPendingImplementation: factory._address
      });
    });
  });

  describe('_acceptImplementation()', () => {
    it('should revert if not called by pendingMomaFactoryImplementation', async () => {
      await setPending(factory, root);
      await expect(
        send(proxy, '_acceptImplementation')
      ).rejects.toRevert('revert MomaFactory: pendingImplementation check');
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toEqual(factory._address);
      expect(await call(proxy, 'momaFactoryImplementation')).toBeAddressZero();
    });

    it('should revert if pendingMomaFactoryImplementation is address(0)', async () => {
      await expect(
        send(proxy, '_acceptImplementation')
      ).rejects.toRevert('revert MomaFactory: pendingImplementation check');
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toBeAddressZero();
      expect(await call(proxy, 'momaFactoryImplementation')).toBeAddressZero();
    });

    it('should set new implementation and unset pending implementation correctly', async () => {
      mergeInterface(factory, proxy);
      await setPending(factory, root);
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toEqual(factory._address);
      expect(await call(proxy, 'momaFactoryImplementation')).toBeAddressZero();
      const tx = await send(factory, '_become', [proxy._address]);
      expect(await call(proxy, 'pendingMomaFactoryImplementation')).toBeAddressZero();
      expect(await call(proxy, 'momaFactoryImplementation')).toEqual(factory._address);
      expect(tx).toHaveLog('NewImplementation', {
        oldImplementation: address(0),
        newImplementation: factory._address
      });
      expect(tx).toHaveLog('NewPendingImplementation', {
        oldPendingImplementation: factory._address,
        newPendingImplementation: address(0)
      });
    });
  });

  let setPendingAdmin = (admin, from) => {
    return send(proxy, '_setPendingAdmin', [admin], {from});
  };

  describe("_setPendingAdmin", () => {
    it("reverts when called by non-admin", async () => {
      await expect(
        send(proxy, '_setPendingAdmin', [guy], {from: guy})
      ).rejects.toRevert('revert MomaFactory: admin check');
      expect(await call(proxy, 'pendingAdmin')).toBeAddressZero();
    });

    it("stores pendingAdmin with value newPendingAdmin and emits NewPendingAdmin event", async () => {
      let result = await setPendingAdmin(guy, root);
      expect(await call(proxy, 'pendingAdmin')).toEqual(guy);
      expect(result).toHaveLog('NewPendingAdmin', {
          oldPendingAdmin: address(0),
          newPendingAdmin: guy
      });
    });
  });

  describe("_acceptAdmin", () => {
    it('should revert if not called by pendingAdmin', async () => {
      await setPendingAdmin(guy, root);
      await expect(
        send(proxy, '_acceptAdmin')
      ).rejects.toRevert('revert MomaFactory: pendingAdmin check');
      expect(await call(proxy, 'pendingAdmin')).toEqual(guy);
      expect(await call(proxy, 'admin')).toEqual(root);
    });

    it('should revert if pendingAdmin is address(0)', async () => {
      await expect(
        send(proxy, '_acceptAdmin')
      ).rejects.toRevert('revert MomaFactory: pendingAdmin check');
      expect(await call(proxy, 'pendingAdmin')).toBeAddressZero();
      expect(await call(proxy, 'admin')).toEqual(root);
    });

    it('should set new admin and unset pendingAdmin correctly', async () => {
      await setPendingAdmin(guy, root);
      expect(await call(proxy, 'pendingAdmin')).toEqual(guy);
      expect(await call(proxy, 'admin')).toEqual(root);
      expect(root).not.toEqual(guy);
      const tx = await send(proxy, '_acceptAdmin', {from: guy});
      expect(await call(proxy, 'pendingAdmin')).toBeAddressZero();
      expect(await call(proxy, 'admin')).toEqual(guy);
      expect(tx).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: guy
      });
      expect(tx).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: guy,
        newPendingAdmin: address(0)
    });
    });
  });

  describe("fallback delegates to MomaFactory", () => {
    let troll;
    beforeEach(async () => {
      factory = await deploy('EchoTypesMomaFactory');
      mergeInterface(proxy, factory);
      await setPending(factory, root);
      await send(factory, '_become', [proxy._address]);
      troll = proxy;
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
