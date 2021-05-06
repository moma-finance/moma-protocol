const {
  makeMomaPool,
  makeMToken
} = require('../Utils/Moma');

describe('#MToken/setMomaMaster', function () {
  let root, accounts;
  let mToken, oldMomaMaster, newMomaMaster;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    mToken = await makeMToken();
    oldMomaMaster = mToken.momaPool;
    newMomaMaster = await makeMomaPool();
    expect(newMomaMaster._address).not.toEqual(oldMomaMaster._address);
  });

  describe('_setMomaMaster', () => {
    it("should fail if called by non-admin", async () => {
      expect(
        await send(mToken, '_setMomaMaster', [newMomaMaster._address], { from: accounts[0] })
      ).toHaveTokenFailure('UNAUTHORIZED', 'SET_MOMAMASTER_OWNER_CHECK');
      expect(await call(mToken, 'momaMaster')).toEqual(oldMomaMaster._address);
    });

    it("reverts if passed a contract that doesn't implement isMomaMaster", async () => {
      await expect(send(mToken, '_setMomaMaster', [mToken.underlying._address])).rejects.toRevert("revert");
      expect(await call(mToken, 'momaMaster')).toEqual(oldMomaMaster._address);
    });

    it("reverts if passed a contract that implements isMomaMaster as false", async () => {
      // extremely unlikely to occur, of course, but let's be exhaustive
      const badMomaMaster = await makeMomaPool({ kind: 'false-marker' });
      await expect(send(mToken, '_setMomaMaster', [badMomaMaster._address])).rejects.toRevert("revert marker method returned false");
      expect(await call(mToken, 'momaMaster')).toEqual(oldMomaMaster._address);
    });

    it("updates momaMaster and emits log on success", async () => {
      const result = await send(mToken, '_setMomaMaster', [newMomaMaster._address]);
      expect(result).toSucceed();
      expect(result).toHaveLog('NewMomaMaster', {
        oldMomaMaster: oldMomaMaster._address,
        newMomaMaster: newMomaMaster._address
      });
      expect(await call(mToken, 'momaMaster')).toEqual(newMomaMaster._address);
    });
  });
});
