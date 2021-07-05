const { balanceOf } = require('./Utils/Moma');
const {
  address,
  etherExp,
  etherUnsigned,
  freezeTime,
  UInt256Max,
} = require('./Utils/Ethereum');


async function checkClaimState(momaLord, users, types, expectedTotoals, expectedClaimeds) {
  let n = 0;
  for (let user of users) {
    const {total, claimed} = await call(momaLord, 'accounts', [user, types[n]]);
    expect(total).toEqualNumber(expectedTotoals[n]);
    expect(claimed).toEqualNumber(expectedClaimeds[n]);
    n++;
  }
}

async function checkAccountTypes(momaLord, users, expectedTypes) {
  let n = 0;
  for (let user of users) {
    expect(await call(momaLord, 'getAccountTypes', [user])).toEqual(expectedTypes[n]);
    n++;
  }
}

async function checkClaimable(momaLord, users, accountTypes, expectedAmounts) {
  let n = 0;
  for (let user of users) {
    expect(await call(momaLord, 'claimable', [user, accountTypes[n]])).toEqualNumber(expectedAmounts[n].toFixed(0, 1));
    n++;
  }
}

async function checkBalances(token, users, expectedAmounts) {
  let n = 0;
  for (let user of users) {
    expect(await balanceOf(token, user)).toEqualNumber(expectedAmounts[n].toFixed(0, 1));
    n++;
  }
}

const SEED_PRAVITE_STRATEGY_FIRST = true;
const TGE             =  100;
const TOTAL_SEED      =  SEED_PRAVITE_STRATEGY_FIRST ? etherExp(5000000)  : etherExp(4250000);
const TOTAL_PRIVATE   =  SEED_PRAVITE_STRATEGY_FIRST ? etherExp(10000000) : etherExp(8000000);
const TOTAL_STRATEGY  =  SEED_PRAVITE_STRATEGY_FIRST ? etherExp(4000000)  : etherExp(3000000);
const TOTAL_COMMUNITY =  etherExp(50000000);
const TOTAL_TEAM      =  etherExp(10000000);
const TOTAL_ADVISOR   =  etherExp(3000000);
const TOTAL_ECO_DEV   =  etherExp(8000000);
const TOTAL_DAO       =  etherExp(9000000);
const TOTAL = TOTAL_SEED.plus(TOTAL_PRIVATE).plus(TOTAL_STRATEGY).plus(TOTAL_COMMUNITY)
              .plus(TOTAL_TEAM).plus(TOTAL_ADVISOR).plus(TOTAL_ECO_DEV).plus(TOTAL_DAO);

const ONE_MONTH                    = 30 * 24 * 3600;
const TOTAL_LOCK_SECONDS_SEED      = ONE_MONTH * 12;  // 12 months
const TOTAL_LOCK_SECONDS_PRIVATE   = ONE_MONTH * 9;
const TOTAL_LOCK_SECONDS_STRATEGY  = ONE_MONTH * 9;
const TOTAL_LOCK_SECONDS_TEAM      = ONE_MONTH * 36;
const TOTAL_LOCK_SECONDS_ADVISOR   = ONE_MONTH * 36;
const TOTAL_LOCK_SECONDS_ECO_DEV   = ONE_MONTH * 48;

const FIRST_LOCK_SECONDS_FUND      = ONE_MONTH;
const FIRST_LOCK_SECONDS_TEAM      = ONE_MONTH * 6;
const FIRST_LOCK_SECONDS_ADVISOR   = ONE_MONTH * 6;

const FIRST_RELEASE_TEAM     = TOTAL_TEAM.multipliedBy(0.1);
const FIRST_RELEASE_ADVISOR  = TOTAL_ADVISOR.multipliedBy(0.1);
const FIRST_RELEASE_ECO_DEV  = TOTAL_ECO_DEV.multipliedBy(0.05);
const LEFT_RELEASE_TEAM      = TOTAL_TEAM.minus(FIRST_RELEASE_TEAM);
const LEFT_RELEASE_ADVISOR   = TOTAL_ADVISOR.minus(FIRST_RELEASE_ADVISOR);
const LEFT_RELEASE_ECO_DEV   = TOTAL_ECO_DEV.minus(FIRST_RELEASE_ECO_DEV);

const SEED1_TOTAL = etherExp(2000000);
const SEED2_TOTAL = TOTAL_SEED.minus(SEED1_TOTAL);
const PRIVATE1_TOTAL = etherExp(3000000);
const PRIVATE2_TOTAL = TOTAL_PRIVATE.minus(PRIVATE1_TOTAL);
const STRATEGY1_TOTAL = etherExp(1000000);
const STRATEGY2_TOTAL = TOTAL_STRATEGY.minus(STRATEGY1_TOTAL);

const FIRST_RELEASE_PERCENT_SEED      = SEED_PRAVITE_STRATEGY_FIRST ? 0.15 : 0;
const FIRST_RELEASE_PERCENT_PRIVATE   = SEED_PRAVITE_STRATEGY_FIRST ? 0.2  : 0;
const FIRST_RELEASE_PERCENT_STRATEGY  = SEED_PRAVITE_STRATEGY_FIRST ? 0.25 : 0;

const FIRST_RELEASE_SEED1     = SEED1_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_SEED);
const FIRST_RELEASE_SEED2     = SEED2_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_SEED);
const FIRST_RELEASE_PRIVATE1  = PRIVATE1_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_PRIVATE);
const FIRST_RELEASE_PRIVATE2  = PRIVATE2_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_PRIVATE);
const FIRST_RELEASE_STRATEGY1 = STRATEGY1_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_STRATEGY);
const FIRST_RELEASE_STRATEGY2 = STRATEGY2_TOTAL.multipliedBy(FIRST_RELEASE_PERCENT_STRATEGY);

const LEFT_RELEASE_SEED1     = SEED1_TOTAL.minus(FIRST_RELEASE_SEED1);
const LEFT_RELEASE_SEED2     = SEED2_TOTAL.minus(FIRST_RELEASE_SEED2);
const LEFT_RELEASE_PRIVATE1  = PRIVATE1_TOTAL.minus(FIRST_RELEASE_PRIVATE1);
const LEFT_RELEASE_PRIVATE2  = PRIVATE2_TOTAL.minus(FIRST_RELEASE_PRIVATE2);
const LEFT_RELEASE_STRATEGY1 = STRATEGY1_TOTAL.minus(FIRST_RELEASE_STRATEGY1);
const LEFT_RELEASE_STRATEGY2 = STRATEGY2_TOTAL.minus(FIRST_RELEASE_STRATEGY2);


const CLAIMABLE_TESTS = [
  {
    description: 'tge - 10 seconds',
    time: TGE - 10,
    expectedAmounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((c) => etherExp(c))
  },
  {
    description: 'tge',
    time: TGE,
    expectedAmounts: [
      FIRST_RELEASE_SEED1,
      FIRST_RELEASE_SEED2,
      FIRST_RELEASE_PRIVATE1,
      FIRST_RELEASE_PRIVATE2,
      FIRST_RELEASE_STRATEGY1,
      FIRST_RELEASE_STRATEGY2,
      0, 0, 0, 0, 0].map((c) => etherUnsigned(c))
  },
  {
    description: 'tge + 1 second',
    time: TGE + 1,
    expectedAmounts: [
      FIRST_RELEASE_SEED1,
      FIRST_RELEASE_SEED2,
      FIRST_RELEASE_PRIVATE1,
      FIRST_RELEASE_PRIVATE2,
      FIRST_RELEASE_STRATEGY1,
      FIRST_RELEASE_STRATEGY2,
      TOTAL_COMMUNITY,
      etherExp(0),
      etherExp(0),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 1 month',
    time: TGE + ONE_MONTH,
    expectedAmounts: [
      FIRST_RELEASE_SEED1,
      FIRST_RELEASE_SEED2,
      FIRST_RELEASE_PRIVATE1,
      FIRST_RELEASE_PRIVATE2,
      FIRST_RELEASE_STRATEGY1,
      FIRST_RELEASE_STRATEGY2,
      TOTAL_COMMUNITY,
      etherExp(0),
      etherExp(0),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 1 monthes + 1 second',
    time: TGE + ONE_MONTH + 1,
    expectedAmounts: [
      FIRST_RELEASE_SEED1.plus(LEFT_RELEASE_SEED1.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_SEED2.plus(LEFT_RELEASE_SEED2.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_PRIVATE1.plus(LEFT_RELEASE_PRIVATE1.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_PRIVATE2.plus(LEFT_RELEASE_PRIVATE2.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_STRATEGY1.plus(LEFT_RELEASE_STRATEGY1.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      FIRST_RELEASE_STRATEGY2.plus(LEFT_RELEASE_STRATEGY2.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      TOTAL_COMMUNITY,
      etherExp(0),
      etherExp(0),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH + 1).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 6 monthes',
    time: TGE + ONE_MONTH * 6,
    expectedAmounts: [
      FIRST_RELEASE_SEED1.plus(LEFT_RELEASE_SEED1.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_SEED2.plus(LEFT_RELEASE_SEED2.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_PRIVATE1.plus(LEFT_RELEASE_PRIVATE1.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_PRIVATE2.plus(LEFT_RELEASE_PRIVATE2.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_STRATEGY1.plus(LEFT_RELEASE_STRATEGY1.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      FIRST_RELEASE_STRATEGY2.plus(LEFT_RELEASE_STRATEGY2.multipliedBy(ONE_MONTH * 5).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      TOTAL_COMMUNITY,
      etherExp(0),
      etherExp(0),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH * 6).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 6 monthes + 1 second',
    time: TGE + ONE_MONTH * 6 + 1,
    expectedAmounts: [
      FIRST_RELEASE_SEED1.plus(LEFT_RELEASE_SEED1.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_SEED2.plus(LEFT_RELEASE_SEED2.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_PRIVATE1.plus(LEFT_RELEASE_PRIVATE1.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_PRIVATE2.plus(LEFT_RELEASE_PRIVATE2.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_PRIVATE)),
      FIRST_RELEASE_STRATEGY1.plus(LEFT_RELEASE_STRATEGY1.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      FIRST_RELEASE_STRATEGY2.plus(LEFT_RELEASE_STRATEGY2.multipliedBy(ONE_MONTH * 5 + 1).dividedBy(TOTAL_LOCK_SECONDS_STRATEGY)),
      TOTAL_COMMUNITY,
      FIRST_RELEASE_TEAM.plus(LEFT_RELEASE_TEAM.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_TEAM)),
      FIRST_RELEASE_ADVISOR.plus(LEFT_RELEASE_ADVISOR.multipliedBy(1).dividedBy(TOTAL_LOCK_SECONDS_ADVISOR)),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH * 6 + 1).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 10 monthes',
    time: TGE + ONE_MONTH * 10,
    expectedAmounts: [
      FIRST_RELEASE_SEED1.plus(LEFT_RELEASE_SEED1.multipliedBy(ONE_MONTH * 9).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      FIRST_RELEASE_SEED2.plus(LEFT_RELEASE_SEED2.multipliedBy(ONE_MONTH * 9).dividedBy(TOTAL_LOCK_SECONDS_SEED)),
      PRIVATE1_TOTAL,
      PRIVATE2_TOTAL,
      STRATEGY1_TOTAL,
      STRATEGY2_TOTAL,
      TOTAL_COMMUNITY,
      FIRST_RELEASE_TEAM.plus(LEFT_RELEASE_TEAM.multipliedBy(ONE_MONTH * 4).dividedBy(TOTAL_LOCK_SECONDS_TEAM)),
      FIRST_RELEASE_ADVISOR.plus(LEFT_RELEASE_ADVISOR.multipliedBy(ONE_MONTH * 4).dividedBy(TOTAL_LOCK_SECONDS_ADVISOR)),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH * 10).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 13 monthes',
    time: TGE + ONE_MONTH * 13,
    expectedAmounts: [
      SEED1_TOTAL,
      SEED2_TOTAL,
      PRIVATE1_TOTAL,
      PRIVATE2_TOTAL,
      STRATEGY1_TOTAL,
      STRATEGY2_TOTAL,
      TOTAL_COMMUNITY,
      FIRST_RELEASE_TEAM.plus(LEFT_RELEASE_TEAM.multipliedBy(ONE_MONTH * 7).dividedBy(TOTAL_LOCK_SECONDS_TEAM)),
      FIRST_RELEASE_ADVISOR.plus(LEFT_RELEASE_ADVISOR.multipliedBy(ONE_MONTH * 7).dividedBy(TOTAL_LOCK_SECONDS_ADVISOR)),
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH * 13).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 42 monthes',
    time: TGE + ONE_MONTH * 42,
    expectedAmounts: [
      SEED1_TOTAL,
      SEED2_TOTAL,
      PRIVATE1_TOTAL,
      PRIVATE2_TOTAL,
      STRATEGY1_TOTAL,
      STRATEGY2_TOTAL,
      TOTAL_COMMUNITY,
      TOTAL_TEAM,
      TOTAL_ADVISOR,
      FIRST_RELEASE_ECO_DEV.plus(LEFT_RELEASE_ECO_DEV.multipliedBy(ONE_MONTH * 42).dividedBy(TOTAL_LOCK_SECONDS_ECO_DEV)),
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 48 monthes',
    time: TGE + ONE_MONTH * 48,
    expectedAmounts: [
      SEED1_TOTAL,
      SEED2_TOTAL,
      PRIVATE1_TOTAL,
      PRIVATE2_TOTAL,
      STRATEGY1_TOTAL,
      STRATEGY2_TOTAL,
      TOTAL_COMMUNITY,
      TOTAL_TEAM,
      TOTAL_ADVISOR,
      TOTAL_ECO_DEV,
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  },
  {
    description: 'tge + 100 monthes',
    time: TGE + ONE_MONTH * 100,
    expectedAmounts: [
      SEED1_TOTAL,
      SEED2_TOTAL,
      PRIVATE1_TOTAL,
      PRIVATE2_TOTAL,
      STRATEGY1_TOTAL,
      STRATEGY2_TOTAL,
      TOTAL_COMMUNITY,
      TOTAL_TEAM,
      TOTAL_ADVISOR,
      TOTAL_ECO_DEV,
      TOTAL_DAO
    ].map((c) => etherUnsigned(c.toFixed(0, 1)))
  }
];



describe('MomaLord', () => {
  let admin, guardian, seed1, seed2, private1, private2, strategy1, strategy2, others, accounts;
  let allAccounts, types, totals;
  let momaLord, moma;
  beforeEach(async () => {
    [admin, guardian, seed1, seed2, private1, private2, strategy1, strategy2, others, ...accounts] = saddle.accounts;
    allAccounts = [seed1, seed2, private1, private2, strategy1, strategy2, others, others, others, others, others];
    types = ['0', '0', '1', '1', '2', '2', '3', '4', '5', '6', '7'];
    totals = [SEED1_TOTAL, SEED2_TOTAL, PRIVATE1_TOTAL, PRIVATE2_TOTAL, STRATEGY1_TOTAL, STRATEGY2_TOTAL,
        TOTAL_COMMUNITY, TOTAL_TEAM, TOTAL_ADVISOR, TOTAL_ECO_DEV, TOTAL_DAO];
    moma = await deploy('Moma', [admin]);
    momaLord = await deploy('MomaLordHarness', [moma._address, TGE]);
  });

  describe('constructor', () => {
    it('should set admin correctly', async () => {
      expect(await call(momaLord, 'admin')).toEqual(admin);
    });

    it('should set guardian correctly', async () => {
      expect(await call(momaLord, 'guardian')).toEqual(admin);
    });

    it('should set moma correctly', async () => {
      expect(await call(momaLord, 'moma')).toEqual(moma._address);
    });

    it('should set tge correctly', async () => {
      expect(await call(momaLord, 'tge')).toEqualNumber(TGE);
    });
  });

  describe('_setGuardian()', () => {
    it('should revert if not called by guardian', async () => {
      await expect(
        send(momaLord, '_setGuardian', [admin], {from: guardian})
      ).rejects.toRevert('revert MomaLord: guardian check');
    });

    it('should revert if newGuardian is address(0)', async () => {
      await expect(
        send(momaLord, '_setGuardian', [address(0)])
      ).rejects.toRevert('revert MomaLord: guardian check');
    });

    it('should set new admin correctly', async () => {
      expect(await call(momaLord, 'guardian')).toEqual(admin);
      const tx = await send(momaLord, '_setGuardian', [guardian]);
      expect(await call(momaLord, 'guardian')).toEqual(guardian);
      expect(tx).toHaveLog('NewGuardian', {
        oldGuardian: admin,
        newGuardian: guardian
      });
    });
  });

  describe('_setPaused()', () => {
    it('should revert if not called by guardian', async () => {
      await send(momaLord, '_setGuardian', [guardian]);
      await expect(
        send(momaLord, '_setPaused', [true], {from: admin})
      ).rejects.toRevert('revert MomaLord: guardian check');
    });

    it('should set paused correctly', async () => {
      await send(momaLord, '_setGuardian', [guardian]);
      expect(await call(momaLord, 'paused')).toEqual(false);
      await send(momaLord, '_setPaused', [true], {from: guardian});
      expect(await call(momaLord, 'paused')).toEqual(true);
      await expect(
        send(momaLord, 'claim', [others, 1, 0], {from: others})
      ).rejects.toRevert('revert claim paused');

      await send(momaLord, '_setPaused', [false], {from: guardian});
      expect(await call(momaLord, 'paused')).toEqual(false);
      expect(await send(momaLord, 'claim', [others, 0, 0], {from: others})).toSucceed();
    });
  });

  describe('_setAdmin()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaLord, '_setAdmin', [guardian], {from: guardian})
      ).rejects.toRevert('revert MomaLord: admin check');
    });

    it('should revert if newAdmin is address(0)', async () => {
      await expect(
        send(momaLord, '_setAdmin', [address(0)])
      ).rejects.toRevert('revert MomaLord: admin check');
    });

    it('should set new admin correctly', async () => {
      expect(await call(momaLord, 'admin')).toEqual(admin);
      const tx = await send(momaLord, '_setAdmin', [guardian]);
      expect(await call(momaLord, 'admin')).toEqual(guardian);
      expect(tx).toHaveLog('NewAdmin', {
        oldAdmin: admin,
        newAdmin: guardian
      });
    });
  });

  describe('_setAccounts()', () => {
    it('should revert if not called by admin', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[], [], []], {from: guardian})
      ).rejects.toRevert('revert MomaLord: admin check');
    });

    it('should revert if types param length dismatch', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[], [0], []])
      ).rejects.toRevert('revert MomaLord: allAccounts and types param length dismatch');
    });

    it('should revert if totals param length dismatch', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[], [], [1]])
      ).rejects.toRevert('revert MomaLord: allAccounts and totals param length dismatch');
    });

    it('should revert if set repeat account', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[seed1, seed1], [0, 0], [1, 2]])
      ).rejects.toRevert('revert MomaLord: repeat account');
    });

    it('should revert if set repeat account type', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[seed1, seed1], [0, 0], [0, 2]])
      ).rejects.toRevert('revert MomaLord: repeat account type');
    });

    it('should revert if totals sum not equal to TOTAL', async () => {
      await expect(
        send(momaLord, '_setAccounts', [[seed1, seed2], [0, 0], [1, 2]])
      ).rejects.toRevert('revert MomaLord: totals sum not equal to TOTAL');
    });

    it('should revert if allSeed sum not equal to TOTAL_SEED', async () => {
      totals = [SEED1_TOTAL, SEED2_TOTAL.minus(1), PRIVATE1_TOTAL.plus(1), PRIVATE2_TOTAL, STRATEGY1_TOTAL, STRATEGY2_TOTAL,
        TOTAL_COMMUNITY, TOTAL_TEAM, TOTAL_ADVISOR, TOTAL_ECO_DEV, TOTAL_DAO];
      await expect(
        send(momaLord, '_setAccounts', [allAccounts, types, totals])
      ).rejects.toRevert('revert MomaLord: allSeed sum not equal to TOTAL_SEED');
    });

    it('should revert if allPrivate sum not equal to TOTAL_PRIVATE', async () => {
      totals = [SEED1_TOTAL, SEED2_TOTAL, PRIVATE1_TOTAL.plus(1), PRIVATE2_TOTAL, STRATEGY1_TOTAL.minus(1), STRATEGY2_TOTAL,
        TOTAL_COMMUNITY, TOTAL_TEAM, TOTAL_ADVISOR, TOTAL_ECO_DEV, TOTAL_DAO];
      await expect(
        send(momaLord, '_setAccounts', [allAccounts, types, totals])
      ).rejects.toRevert('revert MomaLord: allPrivate sum not equal to TOTAL_PRIVATE');
    });

    it('should revert if allStrategy sum not equal to TOTAL_STRATEGY', async () => {
      totals = [SEED1_TOTAL, SEED2_TOTAL, PRIVATE1_TOTAL, PRIVATE2_TOTAL, STRATEGY1_TOTAL.minus(1), STRATEGY2_TOTAL,
        TOTAL_COMMUNITY, TOTAL_TEAM, TOTAL_ADVISOR.plus(1), TOTAL_ECO_DEV, TOTAL_DAO];
      await expect(
        send(momaLord, '_setAccounts', [allAccounts, types, totals])
      ).rejects.toRevert('revert MomaLord: allStrategy sum not equal to TOTAL_STRATEGY');
    });

    it('should set accounts correctly', async () => {
      await send(momaLord, '_setAccounts', [allAccounts, types, totals]);
      await checkClaimState(momaLord, allAccounts, types, totals, allAccounts.map((_) => 0));
      await checkAccountTypes(momaLord, allAccounts.slice(0, 6), types.slice(0, 6).map((c) => [c]));
      await checkAccountTypes(momaLord, [others], [types.slice(6)]);
    });
  });

  describe('_grantMoma()', () => {
    beforeEach(async () => {
      await send(moma, 'transfer', [momaLord._address, etherUnsigned(50e18)]);
    });

    it('should revert if not called by admin', async () => {
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
      await expect(
        send(momaLord, '_grantMoma', [guardian, 100], {from: guardian})
      ).rejects.toRevert('revert MomaLord: only admin can grant token');
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
    });

    it('should transfer MOMA if called by admin', async () => {
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
      const tx = await send(momaLord, '_grantMoma', [guardian, 100]);
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(etherUnsigned(50e18).minus(100));
      expect(await balanceOf(moma, guardian)).toEqualNumber(100);
      expect(tx).toHaveLog('MomaGranted', {
        recipient: guardian,
        amount: 100
      });
    });

    it('should transfer 0 MOMA if called by admin', async () => {
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
      const tx = await send(momaLord, '_grantMoma', [guardian, 0]);
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(etherUnsigned(50e18));
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
      expect(tx).toHaveLog('MomaGranted', {
        recipient: guardian,
        amount: 0
      });
    });

    it('should revert if insufficient MOMA', async () => {
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
      await expect(
        send(momaLord, '_grantMoma', [guardian, etherUnsigned(1e20)])
      ).rejects.toRevert('revert MomaLord: insufficient MOMA for grant');
      expect(await balanceOf(moma, momaLord._address)).toEqualNumber(50e18);
      expect(await balanceOf(moma, guardian)).toEqualNumber(0);
    });
  });

  describe('claimable()', () => {
    CLAIMABLE_TESTS.forEach(({description, time, expectedAmounts}) => {
      it(`should calculate correctly at ${description}`, async () => {
        await send(momaLord, '_setAccounts', [allAccounts, types, totals]);
        await freezeTime(time);
        await checkClaimable(momaLord, allAccounts, types, expectedAmounts);
      });
    });
  });

  describe('claim()', () => {
    beforeEach(async () => {
      await send(momaLord, '_setAccounts', [allAccounts, types, totals]);
      await send(moma, 'transfer', [momaLord._address, TOTAL]);
    });

    it('should revert if paused', async () => {
      await send(momaLord, '_setPaused', [true]);
      expect(await call(momaLord, 'paused')).toEqual(true);
      await expect(
        send(momaLord, 'claim', [others, 1, 0], {from: others})
      ).rejects.toRevert('revert claim paused');
    });

    it('should revert if claim amount exceed claimable', async () => {
      await expect(
        send(momaLord, 'claim', [others, 1, 0], {from: others})
      ).rejects.toRevert('revert claim amount exceed claimable');
    });

    it('should claim 0 at tge', async () => {
      await freezeTime(TGE);
      await checkBalances(moma, [momaLord._address, others], [TOTAL, 0])
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [0]);
      await checkClaimable(momaLord, [others], ['6'], [0]);
      const tx = await send(momaLord, 'claim', [others, 0, '6'], {from: others});

      await checkBalances(moma, [momaLord._address, others], [TOTAL, 0]);
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [0]);
      await checkClaimable(momaLord, [others], ['6'], [0]);
      expect(tx.events).toEqual({});
    });

    it('should claim correctly at tge + 1 seconds for eco dev', async () => {
      await freezeTime(TGE + 1);
      await checkBalances(moma, [momaLord._address, others, seed1], [TOTAL, 0, 0]);
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [0]);
      await checkClaimable(momaLord, [others], ['6'], [CLAIMABLE_TESTS[2].expectedAmounts[9]]);
      const tx = await send(momaLord, 'claim', [seed1, 100, '6'], {from: others});

      await checkBalances(moma, [momaLord._address, others, seed1], [TOTAL.minus(100), 0, 100])
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [100]);
      await checkClaimable(momaLord, [others], ['6'], [CLAIMABLE_TESTS[2].expectedAmounts[9].minus(100)]);
      expect(tx).toHaveLog('MomaClaimed', {
        claimer: others,
        recipient: seed1,
        accountType: '6',
        claimed: 100,
        left: TOTAL_ECO_DEV.minus(100).toFixed()
      });
    });

    it('should not change anything if MOMA not enough at tge + 1 seconds for eco dev', async () => {
      await freezeTime(TGE + 1);
      await send(momaLord, '_grantMoma', [guardian, TOTAL]);
      await checkBalances(moma, [momaLord._address, others, seed1], [0, 0, 0]);
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [0]);
      await checkClaimable(momaLord, [others], ['6'], [CLAIMABLE_TESTS[2].expectedAmounts[9]]);
      const tx = await send(momaLord, 'claim', [seed1, 100, '6'], {from: others});

      await checkBalances(moma, [momaLord._address, others, seed1], [0, 0, 0]);
      await checkClaimState(momaLord, [others], ['6'], [TOTAL_ECO_DEV], [0]);
      await checkClaimable(momaLord, [others], ['6'], [CLAIMABLE_TESTS[2].expectedAmounts[9]]);
      expect(tx.events).toEqual({});
    });

    it('should claim -1 correctly at tge + 12 monthes for private1', async () => {
      await freezeTime(TGE + ONE_MONTH * 12);
      await checkBalances(moma, [momaLord._address, private1, seed1], [TOTAL, 0, 0]);
      await checkClaimState(momaLord, [private1], ['1'], [PRIVATE1_TOTAL], [0]);
      await checkClaimable(momaLord, [private1], ['1'], [PRIVATE1_TOTAL]);
      const tx = await send(momaLord, 'claim', [seed1, UInt256Max(), '1'], {from: private1});

      await checkBalances(moma, [momaLord._address, private1, seed1], [TOTAL.minus(PRIVATE1_TOTAL), 0, PRIVATE1_TOTAL])
      await checkClaimState(momaLord, [private1], ['1'], [PRIVATE1_TOTAL], [PRIVATE1_TOTAL]);
      await checkClaimable(momaLord, [private1], ['1'], [0]);
      expect(tx).toHaveLog('MomaClaimed', {
        claimer: private1,
        recipient: seed1,
        accountType: '1',
        claimed: PRIVATE1_TOTAL.toFixed(),
        left: 0
      });
    });

    it('should calculate correctly when claim at tge + 1 seconds, + 6 monthes, + 12 monthes, + 24 monthes for seed1', async () => {
      await freezeTime(TGE + 1);
      await checkBalances(moma, [momaLord._address, seed1], [TOTAL, 0]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [0]);
      const claimable1 = CLAIMABLE_TESTS[2].expectedAmounts[0];
      await checkClaimable(momaLord, [seed1], ['0'], [claimable1]);
      let tx = await send(momaLord, 'claim', {from: seed1});

      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(claimable1), claimable1]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [claimable1]);
      await checkClaimable(momaLord, [seed1], ['0'], [0]);
      expect(tx).toHaveLog('MomaClaimed', {
        claimer: seed1,
        recipient: seed1,
        accountType: '0',
        claimed: claimable1.toFixed(),
        left: SEED1_TOTAL.minus(claimable1).toFixed()
      });

      await freezeTime(TGE + ONE_MONTH * 6);
      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(claimable1), claimable1]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [claimable1]);
      const claimable2 = CLAIMABLE_TESTS[5].expectedAmounts[0].minus(claimable1);
      await checkClaimable(momaLord, [seed1], ['0'], [claimable2]);
      tx = await send(momaLord, 'claim', {from: seed1});

      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(claimable1).minus(claimable2), claimable1.plus(claimable2)]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [claimable1.plus(claimable2)]);
      await checkClaimable(momaLord, [seed1], ['0'], [0]);
      expect(tx).toHaveLog('MomaClaimed', {
        claimer: seed1,
        recipient: seed1,
        accountType: '0',
        claimed: claimable2.toFixed(),
        left: SEED1_TOTAL.minus(claimable1).minus(claimable2).toFixed()
      });

      await freezeTime(TGE + ONE_MONTH * 13);
      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(claimable1).minus(claimable2), claimable1.plus(claimable2)]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [claimable1.plus(claimable2)]);
      const claimable3 = SEED1_TOTAL.minus(claimable1).minus(claimable2);
      await checkClaimable(momaLord, [seed1], ['0'], [claimable3]);
      tx = await send(momaLord, 'claim', {from: seed1});

      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(SEED1_TOTAL), SEED1_TOTAL]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [SEED1_TOTAL]);
      await checkClaimable(momaLord, [seed1], ['0'], [0]);
      expect(tx).toHaveLog('MomaClaimed', {
        claimer: seed1,
        recipient: seed1,
        accountType: '0',
        claimed: claimable3.toFixed(),
        left: 0
      });

      await freezeTime(TGE + ONE_MONTH * 24);
      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(SEED1_TOTAL), SEED1_TOTAL]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [SEED1_TOTAL]);
      await checkClaimable(momaLord, [seed1], ['0'], [0]);
      tx = await send(momaLord, 'claim', {from: seed1});

      await checkBalances(moma, [momaLord._address, seed1], [TOTAL.minus(SEED1_TOTAL), SEED1_TOTAL]);
      await checkClaimState(momaLord, [seed1], ['0'], [SEED1_TOTAL], [SEED1_TOTAL]);
      await checkClaimable(momaLord, [seed1], ['0'], [0]);
      expect(tx.events).toEqual({});
    });

    CLAIMABLE_TESTS.map(({description, time, expectedAmounts}, i) => {
      if (i+1 < CLAIMABLE_TESTS.length) {
        const description1 = CLAIMABLE_TESTS[i+1].description;
        it(`should calculate correctly when claim at ${description} and check at ${description1}`, async () => {
          await freezeTime(time);
          await checkBalances(moma, [momaLord._address], [TOTAL]);
          await checkBalances(moma, allAccounts, allAccounts.map((_) => 0));
          await checkClaimState(momaLord, allAccounts, types, totals, allAccounts.map((_) => 0));
          await checkClaimable(momaLord, allAccounts, types, expectedAmounts);

          let allClaimed = etherUnsigned(0), othersAllClaimed = etherUnsigned(0);
          let n = 0;
          let claimable, claimed, accountBalance;
          for (let account of allAccounts) {
            let tx = await send(momaLord, 'claim', [account, UInt256Max(), types[n]], {from: account});
            claimable = expectedAmounts[n];
            claimed = expectedAmounts[n];
            allClaimed = allClaimed.plus(claimable);
            if (account == others) {
              othersAllClaimed = othersAllClaimed.plus(claimable);
              accountBalance = othersAllClaimed;
            } else {
              accountBalance = claimable;
            }
            await checkBalances(moma, [momaLord._address, account], [TOTAL.minus(allClaimed), accountBalance]);
            await checkClaimState(momaLord, [account], [types[n]], [totals[n]], [claimed]);
            await checkClaimable(momaLord, [account], [types[n]], [0]);
            if (claimable != 0) {
              expect(tx).toHaveLog('MomaClaimed', {
                claimer: account,
                recipient: account,
                accountType: types[n],
                claimed: claimable.toFixed(),
                left: totals[n].minus(claimed).toFixed()
              });
            } else expect(tx.events).toEqual({});
            n++;
          }

          await freezeTime(CLAIMABLE_TESTS[i+1].time);
          const claimables = CLAIMABLE_TESTS[i+1].expectedAmounts.map((c, j) => c.minus(expectedAmounts[j]))
          await checkBalances(moma, [momaLord._address, others], [TOTAL.minus(allClaimed), othersAllClaimed]);
          await checkBalances(moma, allAccounts.slice(0, 6), expectedAmounts.slice(0, 6));
          await checkClaimState(momaLord, allAccounts, types, totals, expectedAmounts);
          await checkClaimable(momaLord, allAccounts, types, claimables);

          n = 0;
          for (let account of allAccounts) {
            let tx = await send(momaLord, 'claim', [account, UInt256Max(), types[n]], {from: account});
            claimable = claimables[n];
            claimed = CLAIMABLE_TESTS[i+1].expectedAmounts[n];
            allClaimed = allClaimed.plus(claimable);
            if (account == others) {
              othersAllClaimed = othersAllClaimed.plus(claimable);
              accountBalance = othersAllClaimed;
            } else {
              accountBalance = claimed;
            }
            await checkBalances(moma, [momaLord._address, account], [TOTAL.minus(allClaimed), accountBalance]);
            await checkClaimState(momaLord, [account], [types[n]], [totals[n]], [claimed]);
            await checkClaimable(momaLord, [account], [types[n]], [0]);
            if (claimable != 0) {
              expect(tx).toHaveLog('MomaClaimed', {
                claimer: account,
                recipient: account,
                accountType: types[n],
                claimed: claimable.toFixed(),
                left: totals[n].minus(claimed).toFixed()
              });
            } else expect(tx.events).toEqual({});
            n++;
          }
        });
      }
    });

    it(`should calculate correctly for all the time of all accounts`, async () => {
      let allClaimed = etherUnsigned(0), othersAllClaimed = etherUnsigned(0), i = 0;
      let lastExpectedAmounts = CLAIMABLE_TESTS[0].expectedAmounts;
      let claimables = CLAIMABLE_TESTS[0].expectedAmounts;

      for (let {time, expectedAmounts} of CLAIMABLE_TESTS) {
        if (i > 0) {
          lastExpectedAmounts = CLAIMABLE_TESTS[i - 1].expectedAmounts;
          claimables = expectedAmounts.map((c, j) => c.minus(lastExpectedAmounts[j]));
        }
        await freezeTime(time);
        await checkBalances(moma, [momaLord._address, others], [TOTAL.minus(allClaimed), othersAllClaimed]);
        await checkBalances(moma, allAccounts.slice(0, 6), lastExpectedAmounts.slice(0, 6));
        await checkClaimState(momaLord, allAccounts, types, totals, lastExpectedAmounts);
        await checkClaimable(momaLord, allAccounts, types, claimables);

        n = 0;
        for (let account of allAccounts) {
          let tx = await send(momaLord, 'claim', [account, UInt256Max(), types[n]], {from: account});
          let claimable = claimables[n];
          let claimed = expectedAmounts[n];
          allClaimed = allClaimed.plus(claimable);
          let accountBalance;
          if (account == others) {
            othersAllClaimed = othersAllClaimed.plus(claimable);
            accountBalance = othersAllClaimed;
          } else {
            accountBalance = claimed;
          }
          await checkBalances(moma, [momaLord._address, account], [TOTAL.minus(allClaimed), accountBalance]);
          await checkClaimState(momaLord, [account], [types[n]], [totals[n]], [claimed]);
          await checkClaimable(momaLord, [account], [types[n]], [0]);
          if (claimable != 0) {
            expect(tx).toHaveLog('MomaClaimed', {
              claimer: account,
              recipient: account,
              accountType: types[n],
              claimed: claimable.toFixed(),
              left: totals[n].minus(claimed).toFixed()
            });
          } else expect(tx.events).toEqual({});
          n++;
        }
        i++;
      }
    });
  });
});
