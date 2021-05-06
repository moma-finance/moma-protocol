const {
  etherGasCost,
  etherMantissa,
  etherUnsigned,
  sendFallback
} = require('../Utils/Ethereum');

const {
  makeMToken,
  fastForward,
  setBalance,
  setEtherBalance,
  getBalances,
  adjustBalances,
} = require('../Utils/Moma');

const exchangeRate = 5;
const mintAmount = etherUnsigned(1e5);
const mintTokens = mintAmount.dividedBy(exchangeRate);
const redeemTokens = etherUnsigned(10e3);
const redeemAmount = redeemTokens.multipliedBy(exchangeRate);

async function preMint(mToken, minter, mintAmount, mintTokens, exchangeRate) {
  await send(mToken.momaPool, 'setMintAllowed', [true]);
  await send(mToken.momaPool, 'setMintVerify', [true]);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
}

async function mintExplicit(mToken, minter, mintAmount) {
  return send(mToken, 'mint', [], {from: minter, value: mintAmount});
}

async function mintFallback(mToken, minter, mintAmount) {
  return sendFallback(mToken, {from: minter, value: mintAmount});
}

async function preRedeem(mToken, redeemer, redeemTokens, redeemAmount, exchangeRate) {
  await send(mToken.momaPool, 'setRedeemAllowed', [true]);
  await send(mToken.momaPool, 'setRedeemVerify', [true]);
  await send(mToken.interestRateModel, 'setFailBorrowRate', [false]);
  await send(mToken, 'harnessSetExchangeRate', [etherMantissa(exchangeRate)]);
  await setEtherBalance(mToken, redeemAmount);
  await send(mToken, 'harnessSetTotalSupply', [redeemTokens]);
  await setBalance(mToken, redeemer, redeemTokens);
}

async function redeemmTokens(mToken, redeemer, redeemTokens, redeemAmount) {
  return send(mToken, 'redeem', [redeemTokens], {from: redeemer});
}

async function redeemUnderlying(mToken, redeemer, redeemTokens, redeemAmount) {
  return send(mToken, 'redeemUnderlying', [redeemAmount], {from: redeemer});
}

describe('#MEther/mintAndRedeem', () => {
  let root, minter, redeemer, accounts;
  let mToken;

  beforeEach(async () => {
    [root, minter, redeemer, ...accounts] = saddle.accounts;
    // mToken = await makeMToken({kind: 'mether', setInterestRateModel: true, boolMomaMaster: true});
    mToken = await makeMToken({kind: 'mether', contract: 'MEtherDelegator', implementation: 'MEtherDelegateHarness', 
                               setInterestRateModel: true, boolMomaMaster: true});
    await fastForward(mToken, 1);
  });

  [mintExplicit, mintFallback].forEach((mint) => {
    describe(mint.name, () => {
      beforeEach(async () => {
        await preMint(mToken, minter, mintAmount, mintTokens, exchangeRate);
      });

      it("reverts if interest accrual fails", async () => {
        await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(mint(mToken, minter, mintAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns success from mintFresh and mints the correct number of tokens", async () => {
        const beforeBalances = await getBalances([mToken], [minter]);
        const receipt = await mint(mToken, minter, mintAmount);
        const afterBalances = await getBalances([mToken], [minter]);
        expect(receipt).toSucceed();
        expect(mintTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [mToken, 'eth', mintAmount],
          [mToken, 'tokens', mintTokens],
          [mToken, minter, 'eth', -mintAmount.plus(await etherGasCost(receipt))],
          [mToken, minter, 'tokens', mintTokens]
        ]));
      });
    });
  });

  [redeemmTokens, redeemUnderlying].forEach((redeem) => {
    describe(redeem.name, () => {
      beforeEach(async () => {
        await preRedeem(mToken, redeemer, redeemTokens, redeemAmount, exchangeRate);
      });

      it("emits a redeem failure if interest accrual fails", async () => {
        await send(mToken.interestRateModel, 'setFailBorrowRate', [true]);
        await expect(redeem(mToken, redeemer, redeemTokens, redeemAmount)).rejects.toRevert("revert INTEREST_RATE_MODEL_ERROR");
      });

      it("returns error from redeemFresh without emitting any extra logs", async () => {
        expect(await redeem(mToken, redeemer, redeemTokens.multipliedBy(5), redeemAmount.multipliedBy(5))).toHaveTokenFailure('MATH_ERROR', 'REDEEM_NEW_TOTAL_SUPPLY_CALCULATION_FAILED');
      });

      it("returns success from redeemFresh and redeems the correct amount", async () => {
        await fastForward(mToken);
        const beforeBalances = await getBalances([mToken], [redeemer]);
        const receipt = await redeem(mToken, redeemer, redeemTokens, redeemAmount);
        expect(receipt).toTokenSucceed();
        const afterBalances = await getBalances([mToken], [redeemer]);
        expect(redeemTokens).not.toEqualNumber(0);
        expect(afterBalances).toEqual(await adjustBalances(beforeBalances, [
          [mToken, 'eth', -redeemAmount],
          [mToken, 'tokens', -redeemTokens],
          [mToken, redeemer, 'eth', redeemAmount.minus(await etherGasCost(receipt))],
          [mToken, redeemer, 'tokens', -redeemTokens]
        ]));
      });
    });
  });
});
