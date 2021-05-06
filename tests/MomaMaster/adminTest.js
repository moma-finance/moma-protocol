const {address} = require('../Utils/Ethereum');
const {makeMomaPool} = require('../Utils/Moma');

describe('admin / _setPendingAdmin / _acceptAdmin', () => {
  let root, accounts;
  let momaPool;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    momaPool = await makeMomaPool();
  });

  describe('admin()', () => {
    it('should return correct admin', async () => {
      expect(await call(momaPool, 'admin')).toEqual(root);
    });
  });

  describe('pendingAdmin()', () => {
    it('should return correct pending admin', async () => {
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero()
    });
  });

  describe('_setPendingAdmin()', () => {
    it('should only be callable by admin', async () => {
      expect(
        await send(momaPool, '_setPendingAdmin', [accounts[0]], {from: accounts[0]})
      ).toHaveTrollFailure('UNAUTHORIZED', 'SET_PENDING_ADMIN_OWNER_CHECK');

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
    });

    it('should properly set pending admin', async () => {
      expect(await send(momaPool, '_setPendingAdmin', [accounts[0]])).toSucceed();

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should properly set pending admin twice', async () => {
      expect(await send(momaPool, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(momaPool, '_setPendingAdmin', [accounts[1]])).toSucceed();

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(accounts[1]);
    });

    it('should emit event', async () => {
      const result = await send(momaPool, '_setPendingAdmin', [accounts[0]]);
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: address(0),
        newPendingAdmin: accounts[0],
      });
    });
  });

  describe('_acceptAdmin()', () => {
    it('should fail when pending admin is zero', async () => {
      expect(await send(momaPool, '_acceptAdmin')).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_ADMIN_PENDING_ADMIN_CHECK');

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
    });

    it('should fail when called by another account (e.g. root)', async () => {
      expect(await send(momaPool, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(momaPool, '_acceptAdmin')).toHaveTrollFailure('UNAUTHORIZED', 'ACCEPT_ADMIN_PENDING_ADMIN_CHECK');

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(root);
      expect(await call(momaPool, 'pendingAdmin')).toEqual(accounts[0]);
    });

    it('should succeed and set admin and clear pending admin', async () => {
      expect(await send(momaPool, '_setPendingAdmin', [accounts[0]])).toSucceed();
      expect(await send(momaPool, '_acceptAdmin', [], {from: accounts[0]})).toSucceed();

      // Check admin stays the same
      expect(await call(momaPool, 'admin')).toEqual(accounts[0]);
      expect(await call(momaPool, 'pendingAdmin')).toBeAddressZero();
    });

    it('should emit log on success', async () => {
      expect(await send(momaPool, '_setPendingAdmin', [accounts[0]])).toSucceed();
      const result = await send(momaPool, '_acceptAdmin', [], {from: accounts[0]});
      expect(result).toHaveLog('NewAdmin', {
        oldAdmin: root,
        newAdmin: accounts[0],
      });
      expect(result).toHaveLog('NewPendingAdmin', {
        oldPendingAdmin: accounts[0],
        newPendingAdmin: address(0),
      });
    });
  });
});
