"use strict";

const { dfn } = require('./JS');
const {
  encodeParameters,
  etherBalance,
  etherMantissa,
  etherUnsigned,
  mergeInterface,
  address
} = require('./Ethereum');
const BigNumber = require('bignumber.js');

async function makeFarmingDelegate(opts = {}) {
  const {
    kind = 'delegate'
  } = opts || {};

  if (kind == 'delegate') {
    return await deploy('FarmingDelegate');
  }
}

async function makeMomaFarming(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harness'
  } = opts || {};

  const moma = opts.moma || await deploy('Moma', [opts.momaOwner || root]);
  const proxy = opts.proxy || await makeFactory(opts.factoryOpts);

  if (kind == 'prod') {
    const momaFarming = await deploy('MomaFarming', [moma._address, proxy._address]);
    return Object.assign(momaFarming, { moma, proxy });
  }

  if (kind == 'harness') {
    const MomaFarmingHarness = await deploy('MomaFarmingHarness', [moma._address, proxy._address]);
    return Object.assign(MomaFarmingHarness, { moma, proxy });
  }
}

async function makeFactory(opts = {}) {
  const {
    addMomaMaster = true,
    kind = 'proxy'
  } = opts || {};

  let momaMaster, priceOracle, farmingDelegate, momaFarming;

  if (kind == 'proxy') {
    const proxy = opts.proxy || await deploy('MomaFactoryProxy');
    const factory = opts.factory || await deploy('MomaFactory');

    await send(proxy, '_setPendingImplementation', [factory._address]);
    await send(factory, '_become', [proxy._address]);
    mergeInterface(proxy, factory);

    if (addMomaMaster) {
      momaMaster = opts.momaMaster || await deploy('MomaMaster');
      await send(proxy, '_setMomaMaster', [momaMaster._address]);
    }

    if (opts.addPriceOracle) {
      priceOracle = opts.priceOracle || await makePriceOracle(opts.priceOracleOpts);
      await send(proxy, '_setOracle', [priceOracle._address]);
    }

    if (opts.addMErc20) {
      const mErc20 = opts.mErc20 || await makeMToken(opts.mErc20Opts);
      await send(proxy, '_setMErc20', [mErc20._address]);
    }

    if (opts.addMErc20Implementation) {
      const mErc20Implementation = opts.mErc20Implementation || await deploy('MErc20Delegate');
      await send(proxy, '_setMErc20Implementation', [mErc20Implementation._address]);
    }

    if (opts.addFarmingDelegate) {
      farmingDelegate = opts.farmingDelegate || await makeFarmingDelegate();
      await send(proxy, '_setFarmingDelegate', [farmingDelegate._address]);
    }

    if (opts.addMomaFarming) {
      momaFarming = opts.momaFarming || await makeMomaFarming({proxy});
      await send(proxy, '_setMomaFarming', [momaFarming._address]);
    }

    return Object.assign(proxy, { momaMaster, priceOracle, farmingDelegate, momaFarming });
  }
}

const contractNameMapping = {
  'normal': 'MomaMaster',
  'harness': 'MomaMasterHarness',
  'bool': 'BoolMomaMaster',
  'false-marker': 'FalseMarkerMethodMomaMaster'
}

async function makeMomaPool(opts = {}) {
  const {
    root = saddle.account,
    kind = 'normal'
  } = opts || {};

  let momaMaster, priceOracle;

  if (kind == 'bool') {
    return await deploy('BoolMomaMaster', [opts.factory || root]);
  }

  if (kind == 'false-marker') {
    return await deploy('FalseMarkerMethodMomaMaster');
  }

  if (opts.addFarmingDelegate) {
    opts.factoryOpts = opts.factoryOpts || {};
    Object.assign(opts.factoryOpts, { addFarmingDelegate: true});
  }

  if (opts.addMomaFarming) {
    opts.factoryOpts = opts.factoryOpts || {};
    Object.assign(opts.factoryOpts, { addMomaFarming: true});
  }

  if (opts.addPriceOracle) {
    opts.factoryOpts = opts.factoryOpts || {};
    Object.assign(opts.factoryOpts, { addPriceOracle: true});
  }

  if (!opts.factory) {
    momaMaster = opts.momaMaster || await deploy(contractNameMapping[kind]);
    opts.factoryOpts = opts.factoryOpts || {};
    Object.assign(opts.factoryOpts, { momaMaster});
  }

  const factory = opts.factory || await makeFactory(opts.factoryOpts);
  const momaPoolNum = +await call(factory, "allPoolsLength");
  await send(factory, 'createPool', {from: opts.from || root});
  const momaPoolAddress = await call(factory, "allPools", [momaPoolNum]);
  const momaPool = await saddle.getContractAt("MomaPoolHarness", momaPoolAddress);
  momaMaster = factory.momaMaster;
  mergeInterface(momaPool, momaMaster);

  if (opts.addPriceOracle) {
    priceOracle = factory.priceOracle || await setPriceOracle(factory);
    await send(momaPool, '_updatePriceOracle');
  }

  // const closeFactor = etherMantissa(dfn(opts.closeFactor, .051));
  // const liquidationIncentive = etherMantissa(1);
  // await send(momaPool, '_setLiquidationIncentive', [liquidationIncentive], {from: opts.from || root});
  // await send(momaPool, '_setCloseFactor', [closeFactor], {from: opts.from || root});

  return Object.assign(momaPool, { priceOracle, factory, momaMaster });
}

async function makeMToken(opts = {}) {
  const {
    root = saddle.account,
    addFarmingDelegate = true,
    addMomaFarming = true,
    kind = 'merc20'
  } = opts || {};
  
  if (opts.addPriceOracle) {
    opts.momaPoolOpts = opts.momaPoolOpts || {};
    Object.assign(opts.momaPoolOpts, { addPriceOracle: true});
  }

  if (addFarmingDelegate) {
    opts.momaPoolOpts = opts.momaPoolOpts || {};
    opts.momaPoolOpts.factoryOpts = opts.momaPoolOpts.factoryOpts || {};
    Object.assign(opts.momaPoolOpts.factoryOpts, { addFarmingDelegate: true});
  }

  if (addMomaFarming) {
    opts.momaPoolOpts = opts.momaPoolOpts || {};
    opts.momaPoolOpts.factoryOpts = opts.momaPoolOpts.factoryOpts || {};
    Object.assign(opts.momaPoolOpts.factoryOpts, { addMomaFarming: true});
  }

  let momaPool = opts.momaPool || await makeMomaPool(opts.momaPoolOpts);
  const exchangeRate = etherMantissa(dfn(opts.exchangeRate, 1));
  const decimals = etherUnsigned(dfn(opts.decimals, 8));
  const symbol = opts.symbol || (kind === 'mether' ? 'mETH' : 'mOMG');
  const name = opts.name || `MToken ${symbol}`;
  const feeReceiver = opts.feeReceiver || root;

  let mToken, underlying, cDelegator, interestRateModel;

  switch (kind) {
    case 'mether':
      let param = [
        momaPool._address,
        // interestRateModel._address,
        exchangeRate,
        name,
        symbol,
        decimals,
        feeReceiver
      ]
      if (opts.contract && opts.contract == 'MEtherDelegator') {
        param.splice(-1, 0, "0x0");
        let mEtherImplementationAdd = await call(momaPool.factory, 'mEtherImplementation');
        let mEtherImplementation;
        if (mEtherImplementationAdd == address(0)) {
          mEtherImplementation = await deploy(opts.implementation || 'MEtherDelegate');
          await send(momaPool.factory, '_setMEtherImplementation', [mEtherImplementation._address]);
        } else {
          mEtherImplementation = await saddle.getContractAt(opts.implementation || 'MEtherDelegate', mEtherImplementationAdd);
        }
        mToken = await deploy('MEtherDelegator', param, {from: opts.from || root});
        mergeInterface(mToken, mEtherImplementation);
      } else {
        mToken = await deploy('MEtherHarness', param, {from: opts.from || root});
      }
      break;

    case 'merc20':
    default:
      underlying = opts.underlying || await makeToken(opts.underlyingOpts);
      let mErc20ImplementationAdd = await call(momaPool.factory, 'mErc20Implementation');
      let mErc20Implementation;
      if (mErc20ImplementationAdd == address(0)) {
        mErc20Implementation = await deploy(opts.implementation || 'MErc20DelegateHarness');
        await send(momaPool.factory, '_setMErc20Implementation', [mErc20Implementation._address]);
      } else {
        mErc20Implementation = await saddle.getContractAt(opts.implementation || 'MErc20DelegateHarness', mErc20Implementation);
      }
      mToken = await deploy(opts.contract || 'MErc20Delegator',
        [
          underlying._address,
          momaPool._address,
          // interestRateModel._address,
          exchangeRate,
          name,
          symbol,
          decimals,
          // cDelegatee._address,
          "0x0",
          feeReceiver
        ], {from: opts.from || root}
      );
      mergeInterface(mToken, mErc20Implementation);
      break;
  }

  if (opts.setInterestRateModel) {
    interestRateModel = await setInterestRateModel(mToken, opts.interestRateModelOpts, opts.interestRateModel);
  }

  if (opts.supportMarket) {
    await send(momaPool.factory, '_setMErc20', [mToken._address]);
    await send(momaPool, '_supportMarket', [mToken._address]);
  }

  if (opts.underlyingPrice) {
    const price = etherMantissa(opts.underlyingPrice);
    await send(momaPool.priceOracle, 'setUnderlyingPrice', [mToken._address, price]);
  }

  if (opts.collateralFactor) {
    const factor = etherMantissa(opts.collateralFactor);
    expect(await send(momaPool, '_setCollateralFactor', [mToken._address, factor])).toSucceed();
  }

  if (opts.boolMomaMaster) {
    let boolMomaMaster = await deploy('BoolMomaMaster', [momaPool.factory._address]);
    await send(momaPool.factory, '_setMomaMaster', [boolMomaMaster._address]);
    await send(mToken, 'harnessSetMomaMaster', [boolMomaMaster._address]);
    Object.assign(boolMomaMaster, { priceOracle: momaPool.priceOracle, factory: momaPool.factory, momaMaster: momaPool.momaMaster });
    momaPool = boolMomaMaster;
  }

  return Object.assign(mToken, { name, symbol, underlying, momaPool, interestRateModel });
}

async function makeInterestRateModel(opts = {}) {
  const {
    root = saddle.account,
    kind = 'harnessed'
  } = opts || {};

  if (kind == 'harnessed') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('InterestRateModelHarness', [borrowRate]);
  }

  if (kind == 'false-marker') {
    const borrowRate = etherMantissa(dfn(opts.borrowRate, 0));
    return await deploy('FalseMarkerMethodInterestRateModel', [borrowRate]);
  }

  if (kind == 'white-paper') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 1e-18));
    return await deploy('WhitePaperInterestRateModel', [baseRate, multiplier]);
  }

  if (kind == 'jump-rate') {
    const baseRate = etherMantissa(dfn(opts.baseRate, 0));
    const multiplier = etherMantissa(dfn(opts.multiplier, 1e-18));
    const jump = etherMantissa(dfn(opts.jump, 0));
    const kink = etherMantissa(dfn(opts.kink, 0));
    return await deploy('JumpRateModel', [baseRate, multiplier, jump, kink]);
  }
}

async function setInterestRateModel(mToken, opts = {}, model = null) {
    const interestRateModel = model || await makeInterestRateModel(opts);
    await send(mToken, '_setInterestRateModel', [interestRateModel._address]);
    return interestRateModel;
}

async function upgradeLendingPool(momaPool, mTokens = null) {
  await setPriceOracle(momaPool.factory);
  
  mTokens = mTokens || await Promise.all((await call(momaPool, 'getAllMarkets')).map(async (c) => await saddle.getContractAt('MErc20DelegateHarness', c)));
  let interestRateModel;
  for (let mToken of mTokens) {
    if (await call(mToken, 'interestRateModel') == address(0)) {
      interestRateModel = interestRateModel || await makeInterestRateModel();
      await send(mToken, '_setInterestRateModel', [interestRateModel._address]);
    }
  }

  if (await call(momaPool.factory, 'momaFarming') == address(0)) {
    const momaFarming = await makeMomaFarming({proxy: momaPool.factory});
    await send(momaPool.factory, '_setMomaFarming', [momaFarming._address]);
  }

  await send(momaPool.factory, `_setAllowUpgrade`, [true]);
  await send(momaPool, `_upgradeLendingPool`);
}

async function makePriceOracle(opts = {}) {
  const {
    root = saddle.account,
    kind = 'simple'
  } = opts || {};

  if (kind == 'simple') {
    return await deploy('SimplePriceOracle');
  }

  if (kind == 'false') {
    return await deploy('FalsePriceOracle');
  }
}

async function setPriceOracle(factory) {
  if (await call(factory, 'oracle') == address(0)) {
    const oracle = await makePriceOracle();
    await send(factory, '_setOracle', [oracle._address]);
    return oracle;
  }
}

async function makeToken(opts = {}) {
  const {
    root = saddle.account,
    kind = 'erc20'
  } = opts || {};

  if (kind == 'erc20') {
    const quantity = etherUnsigned(dfn(opts.quantity, 1e25));
    const decimals = etherUnsigned(dfn(opts.decimals, 18));
    const symbol = opts.symbol || 'OMG';
    const name = opts.name || `Erc20 ${symbol}`;
    return await deploy('ERC20Harness', [quantity, name, decimals, symbol]);
  }
}

async function balanceOf(token, account) {
  return etherUnsigned(await call(token, 'balanceOf', [account]));
}

async function totalSupply(token) {
  return etherUnsigned(await call(token, 'totalSupply'));
}

async function borrowSnapshot(mToken, account) {
  const { principal, interestIndex } = await call(mToken, 'harnessAccountBorrows', [account]);
  return { principal: etherUnsigned(principal), interestIndex: etherUnsigned(interestIndex) };
}

async function totalBorrows(mToken) {
  return etherUnsigned(await call(mToken, 'totalBorrows'));
}

async function totalReserves(mToken) {
  return etherUnsigned(await call(mToken, 'totalReserves'));
}

async function enterMarkets(mTokens, from) {
  return await send(mTokens[0].momaPool, 'enterMarkets', [mTokens.map(c => c._address)], { from });
}

async function fastForward(mToken, blocks = 5) {
  return await send(mToken, 'harnessFastForward', [blocks]);
}

async function setBalance(mToken, account, balance) {
  return await send(mToken, 'harnessSetBalance', [account, balance]);
}

async function setEtherBalance(mEther, balance) {
  const current = await etherBalance(mEther._address);
  const root = saddle.account;
  expect(await send(mEther, 'harnessDoTransferOut', [root, current])).toSucceed();
  expect(await send(mEther, 'harnessDoTransferIn', [root, balance], { value: balance })).toSucceed();
}

async function getBalances(mTokens, accounts) {
  const balances = {};
  for (let mToken of mTokens) {
    const mBalances = balances[mToken._address] = {};
    for (let account of accounts) {
      mBalances[account] = {
        eth: await etherBalance(account),
        cash: mToken.underlying && await balanceOf(mToken.underlying, account),
        tokens: await balanceOf(mToken, account),
        borrows: (await borrowSnapshot(mToken, account)).principal
      };
    }
    mBalances[mToken._address] = {
      eth: await etherBalance(mToken._address),
      cash: mToken.underlying && await balanceOf(mToken.underlying, mToken._address),
      tokens: await totalSupply(mToken),
      borrows: await totalBorrows(mToken),
      reserves: await totalReserves(mToken)
    };
  }
  return balances;
}

async function adjustBalances(balances, deltas) {
  for (let delta of deltas) {
    let mToken, account, key, diff;
    if (delta.length == 4) {
      ([mToken, account, key, diff] = delta);
    } else {
      ([mToken, key, diff] = delta);
      account = mToken._address;
    }

    balances[mToken._address][account][key] = new BigNumber(balances[mToken._address][account][key]).plus(diff);
  }
  return balances;
}


async function preApprove(mToken, from, amount, opts = {}) {
  if (dfn(opts.faucet, true)) {
    expect(await send(mToken.underlying, 'harnessSetBalance', [from, amount], { from })).toSucceed();
  }

  return send(mToken.underlying, 'approve', [mToken._address, amount], { from });
}

async function quickMint(mToken, minter, mintAmount, opts = {}) {
  // make sure to accrue interest
  await fastForward(mToken, 1);

  if (dfn(opts.approve, true)) {
    expect(await preApprove(mToken, minter, mintAmount, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(mToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(mToken, 'mint', [mintAmount], { from: minter });
}


async function preSupply(mToken, account, tokens, opts = {}) {
  if (dfn(opts.total, true)) {
    expect(await send(mToken, 'harnessSetTotalSupply', [tokens])).toSucceed();
  }
  return send(mToken, 'harnessSetBalance', [account, tokens]);
}

async function quickRedeem(mToken, redeemer, redeemTokens, opts = {}) {
  await fastForward(mToken, 1);

  if (dfn(opts.supply, true)) {
    expect(await preSupply(mToken, redeemer, redeemTokens, opts)).toSucceed();
  }
  if (dfn(opts.exchangeRate)) {
    expect(await send(mToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(mToken, 'redeem', [redeemTokens], { from: redeemer });
}

async function quickRedeemUnderlying(mToken, redeemer, redeemAmount, opts = {}) {
  await fastForward(mToken, 1);

  if (dfn(opts.exchangeRate)) {
    expect(await send(mToken, 'harnessSetExchangeRate', [etherMantissa(opts.exchangeRate)])).toSucceed();
  }
  return send(mToken, 'redeemUnderlying', [redeemAmount], { from: redeemer });
}

async function setOraclePrice(mToken, price) {
  return send(mToken.momaPool.priceOracle, 'setUnderlyingPrice', [mToken._address, etherMantissa(price)]);
}

async function setBorrowRate(mToken, rate) {
  return send(mToken.interestRateModel, 'setBorrowRate', [etherMantissa(rate)]);
}

async function getBorrowRate(interestRateModel, cash, borrows, reserves, fees, momaFees) {
  return call(interestRateModel, 'getBorrowRate', [cash, borrows, reserves, fees, momaFees].map(etherUnsigned));
}

async function getSupplyRate(interestRateModel, cash, borrows, reserves, reserveFactor, fees, feeFactor, momaFees, momaFeeFactor) {
  return call(interestRateModel, 'getSupplyRate', [cash, borrows, reserves, reserveFactor, fees, feeFactor, momaFees, momaFeeFactor].map(etherUnsigned));
}

async function pretendBorrow(mToken, borrower, accountIndex, marketIndex, principalRaw, blockNumber = 2e7) {
  await send(mToken, 'harnessSetTotalBorrows', [etherUnsigned(principalRaw)]);
  await send(mToken, 'harnessSetAccountBorrows', [borrower, etherUnsigned(principalRaw), etherMantissa(accountIndex)]);
  await send(mToken, 'harnessSetBorrowIndex', [etherMantissa(marketIndex)]);
  await send(mToken, 'harnessSetAccrualBlockNumber', [etherUnsigned(blockNumber)]);
  await send(mToken, 'harnessSetBlockNumber', [etherUnsigned(blockNumber)]);
}

module.exports = {
  makeMomaFarming,
  makeMomaPool,
  makeMToken,
  makeInterestRateModel,
  makePriceOracle,
  makeToken,

  balanceOf,
  totalSupply,
  borrowSnapshot,
  totalBorrows,
  totalReserves,
  enterMarkets,
  fastForward,
  setBalance,
  setEtherBalance,
  getBalances,
  adjustBalances,

  preApprove,
  quickMint,

  preSupply,
  quickRedeem,
  quickRedeemUnderlying,

  upgradeLendingPool,
  setInterestRateModel,
  setOraclePrice,
  setBorrowRate,
  getBorrowRate,
  getSupplyRate,
  pretendBorrow
};
