const BigNumber = require('bignumber.js');

const {
  address,
  etherMantissa
} = require('./Utils/Ethereum');

const {
  makeMToken,
  makePriceOracle,
} = require('./Utils/Moma');

describe('PriceOracleProxy', () => {
  let root, accounts;
  let oracle, backingOracle, mEth, cUsdc, cSai, cDai, cUsdt, cOther;
  let daiOracleKey = address(2);

  beforeEach(async () => {
    [root, ...accounts] = saddle.accounts;
    mEth = await makeMToken({kind: "mether"});
    cUsdc = await makeMToken({momaPool: mEth.momaPool});
    cSai = await makeMToken({momaPool: mEth.momaPool});
    cDai = await makeMToken({momaPool: mEth.momaPool});
    cUsdt = await makeMToken({momaPool: mEth.momaPool});
    cOther = await makeMToken({momaPool: mEth.momaPool});

    backingOracle = await makePriceOracle();
    oracle = await deploy('PriceOracleProxy',
      [
        root,
        backingOracle._address,
        mEth._address,
        cUsdc._address,
        cSai._address,
        cDai._address,
        cUsdt._address
      ]
     );
  });

  describe("constructor", () => {
    it("sets address of guardian", async () => {
      let configuredGuardian = await call(oracle, "guardian");
      expect(configuredGuardian).toEqual(root);
    });

    it("sets address of v1 oracle", async () => {
      let configuredOracle = await call(oracle, "v1PriceOracle");
      expect(configuredOracle).toEqual(backingOracle._address);
    });

    it("sets address of cEth", async () => {
      let configuredCEther = await call(oracle, "cEthAddress");
      expect(configuredCEther).toEqual(mEth._address);
    });

    it("sets address of cUSDC", async () => {
      let configuredCUSD = await call(oracle, "cUsdcAddress");
      expect(configuredCUSD).toEqual(cUsdc._address);
    });

    it("sets address of cSAI", async () => {
      let configuredCSAI = await call(oracle, "cSaiAddress");
      expect(configuredCSAI).toEqual(cSai._address);
    });

    it("sets address of cDAI", async () => {
      let configuredCDAI = await call(oracle, "cDaiAddress");
      expect(configuredCDAI).toEqual(cDai._address);
    });

    it("sets address of cUSDT", async () => {
      let configuredCUSDT = await call(oracle, "cUsdtAddress");
      expect(configuredCUSDT).toEqual(cUsdt._address);
    });
  });

  describe("getUnderlyingPrice", () => {
    let setAndVerifyBackingPrice = async (cToken, price) => {
      await send(
        backingOracle,
        "setUnderlyingPrice",
        [cToken._address, etherMantissa(price)]);

      let backingOraclePrice = await call(
        backingOracle,
        "assetPrices",
        [cToken.underlying._address]);

      expect(Number(backingOraclePrice)).toEqual(price * 1e18);
    };

    let readAndVerifyProxyPrice = async (token, price) =>{
      let proxyPrice = await call(oracle, "getUnderlyingPrice", [token._address]);
      expect(Number(proxyPrice)).toEqual(price * 1e18);;
    };

    it("always returns 1e18 for cEth", async () => {
      await readAndVerifyProxyPrice(mEth, 1);
    });

    it("uses address(1) for USDC and address(2) for cdai", async () => {
      await send(backingOracle, "setDirectPrice", [address(1), etherMantissa(5e12)]);
      await send(backingOracle, "setDirectPrice", [address(2), etherMantissa(8)]);
      await readAndVerifyProxyPrice(cDai, 8);
      await readAndVerifyProxyPrice(cUsdc, 5e12);
      await readAndVerifyProxyPrice(cUsdt, 5e12);
    });

    it("proxies for whitelisted tokens", async () => {
      await setAndVerifyBackingPrice(cOther, 11);
      await readAndVerifyProxyPrice(cOther, 11);

      await setAndVerifyBackingPrice(cOther, 37);
      await readAndVerifyProxyPrice(cOther, 37);
    });

    it("returns 0 for token without a price", async () => {
      let unlistedToken = await makeMToken({momaPool: mEth.momaPool});

      await readAndVerifyProxyPrice(unlistedToken, 0);
    });

    it("correctly handle setting SAI price", async () => {
      await send(backingOracle, "setDirectPrice", [daiOracleKey, etherMantissa(0.01)]);

      await readAndVerifyProxyPrice(cDai, 0.01);
      await readAndVerifyProxyPrice(cSai, 0.01);

      await send(oracle, "setSaiPrice", [etherMantissa(0.05)]);

      await readAndVerifyProxyPrice(cDai, 0.01);
      await readAndVerifyProxyPrice(cSai, 0.05);

      await expect(send(oracle, "setSaiPrice", [1])).rejects.toRevert("revert SAI price may only be set once");
    });

    it("only guardian may set the sai price", async () => {
      await expect(send(oracle, "setSaiPrice", [1], {from: accounts[0]})).rejects.toRevert("revert only guardian may set the SAI price");
    });

    it("sai price must be bounded", async () => {
      await expect(send(oracle, "setSaiPrice", [etherMantissa(10)])).rejects.toRevert("revert SAI price must be < 0.1 ETH");
    });
});
});
