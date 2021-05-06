const {
  makeMToken,
  getBalances,
  adjustBalances
} = require('../Utils/Moma');

const exchangeRate = 5;

describe('MEther', function () {
  let root, nonRoot, accounts;
  let mToken;
  beforeEach(async () => {
    [root, nonRoot, ...accounts] = saddle.accounts;
    mToken = await makeMToken({kind: 'mether', momaPoolOpts: {kind: 'bool'}});
  });

  describe("getCashPrior", () => {
    it("returns the amount of ether held by the mEther contract before the current message", async () => {
      expect(await call(mToken, 'harnessGetCashPrior', [], {value: 100})).toEqualNumber(0);
    });
  });

  describe("doTransferIn", () => {
    it("succeeds if from is msg.nonRoot and amount is msg.value", async () => {
      expect(await call(mToken, 'harnessDoTransferIn', [root, 100], {value: 100})).toEqualNumber(100);
    });

    it("reverts if from != msg.sender", async () => {
      await expect(call(mToken, 'harnessDoTransferIn', [nonRoot, 100], {value: 100})).rejects.toRevert("revert sender mismatch");
    });

    it("reverts if amount != msg.value", async () => {
      await expect(call(mToken, 'harnessDoTransferIn', [root, 77], {value: 100})).rejects.toRevert("revert value mismatch");
    });
  });

  describe("doTransferOut", () => {
    it("transfers ether out", async () => {
      const beforeBalances = await getBalances([mToken], [nonRoot]);
      const receipt = await send(mToken, 'harnessDoTransferOut', [nonRoot, 77], {value: 77});
      const afterBalances = await getBalances([mToken], [nonRoot]);
      expect(receipt).toSucceed();
      expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
        [mToken, nonRoot, 'eth', 77]
      ]));
    });

    it("reverts if it fails", async () => {
      await expect(call(mToken, 'harnessDoTransferOut', [root, 77], {value: 0})).rejects.toRevert();
    });
  });
});
