const {makeMToken, makeMomaPool} = require('../Utils/Moma');

describe('#MToken/transfer', function () {
  let root, accounts;
  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
  });

  describe('transfer', () => {
    it("cannot transfer from a zero balance", async () => {
      const mToken = await makeMToken({supportMarket: true});
      expect(await call(mToken, 'balanceOf', [root])).toEqualNumber(0);
      expect(await send(mToken, 'transfer', [accounts[0], 100])).toHaveTokenFailure('MATH_ERROR', 'TRANSFER_NOT_ENOUGH');
    });

    it("transfers 50 tokens", async () => {
      const mToken = await makeMToken({supportMarket: true, implementation: 'MErc20DelegateHarness'});
      await send(mToken, 'harnessSetBalance', [root, 100]);
      expect(await call(mToken, 'balanceOf', [root])).toEqualNumber(100);
      await send(mToken, 'transfer', [accounts[0], 50]);
      expect(await call(mToken, 'balanceOf', [root])).toEqualNumber(50);
      expect(await call(mToken, 'balanceOf', [accounts[0]])).toEqualNumber(50);
    });

    it("doesn't transfer when src == dst", async () => {
      const mToken = await makeMToken({supportMarket: true, implementation: 'MErc20DelegateHarness'});
      await send(mToken, 'harnessSetBalance', [root, 100]);
      expect(await call(mToken, 'balanceOf', [root])).toEqualNumber(100);
      expect(await send(mToken, 'transfer', [root, 50])).toHaveTokenFailure('BAD_INPUT', 'TRANSFER_NOT_ALLOWED');
    });

    it("rejects transfer when not allowed and reverts if not verified", async () => {
      const mToken = await makeMToken({implementation: 'MErc20DelegateHarness', boolMomaMaster: true});
      await send(mToken, 'harnessSetBalance', [root, 100]);
      expect(await call(mToken, 'balanceOf', [root])).toEqualNumber(100);

      await send(mToken.momaPool, 'setTransferAllowed', [false])
      expect(await send(mToken, 'transfer', [root, 50])).toHaveTrollReject('TRANSFER_MOMAMASTER_REJECTION');

      await send(mToken.momaPool, 'setTransferAllowed', [true])
      await send(mToken.momaPool, 'setTransferVerify', [false])
      await expect(send(mToken, 'transfer', [accounts[0], 50])).rejects.toRevert("revert transferVerify rejected transfer");
    });
  });
});