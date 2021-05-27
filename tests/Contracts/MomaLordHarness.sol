pragma solidity 0.5.17;

import "../../contracts/MomaLord.sol";


contract MomaLordHarness is MomaLord {
    
    // uint public constant TOTAL_SEED      =  4250000e18;  // without first release
    // uint public constant TOTAL_PRIVATE   =  8000000e18;  // without first release
    // uint public constant TOTAL_STRATEGY  =  3000000e18;  // without first release
    uint public constant TOTAL_SEED      =  5000000e18;  // with first release
    uint public constant TOTAL_PRIVATE   = 10000000e18;  // with first release
    uint public constant TOTAL_STRATEGY  =  4000000e18;  // with first release
    uint public constant TOTAL_COMMUNITY = 50000000e18;
    uint public constant TOTAL_TEAM      = 10000000e18;
    uint public constant TOTAL_ADVISOR   =  3000000e18;
    uint public constant TOTAL_ECO_DEV   =  8000000e18;
    uint public constant TOTAL_DAO       =  9000000e18;
    uint public constant TOTAL = TOTAL_SEED + TOTAL_PRIVATE + TOTAL_STRATEGY + TOTAL_COMMUNITY + TOTAL_TEAM + TOTAL_ADVISOR + TOTAL_ECO_DEV + TOTAL_DAO;

    constructor (Moma _moma, uint _tge) MomaLord(_moma, _tge) public  {}


    /**
     * @notice Set the claimable MOMA for all accounts
     * @dev Note: be careful gas spending
     * @param allAccounts All accounts to set
     * @param types AccountType of each account
     * @param totals Total MOMA claimable of each account
     */
    function _setAccounts(address[] calldata allAccounts, AccountType[] calldata types, uint[] calldata totals) external {
        require(msg.sender == admin, 'MomaLord: admin check');
        require(allAccounts.length == types.length, "MomaLord: allAccounts and types param length dismatch");
        require(allAccounts.length == totals.length, "MomaLord: allAccounts and totals param length dismatch");

        uint allMoma;
        uint allSeed;
        uint allPrivate;
        uint allStrategy;

        // update accountType and total of each account
        for (uint i = 0; i < allAccounts.length; i++) {
            ClaimState storage state = accounts[allAccounts[i]][uint(types[i])];
            require(state.total == 0, 'MomaLord: repeat account');
            for (uint j = 0; j < accountTypes[allAccounts[i]].length; j++) {
                require(accountTypes[allAccounts[i]][j] != types[i], 'MomaLord: repeat account type');
            }

            state.total = totals[i];
            accountTypes[allAccounts[i]].push(types[i]);

            allMoma = allMoma.add(totals[i]);
            if (types[i] == AccountType.Seed) {
                allSeed = allSeed + totals[i];
            } else if (types[i] == AccountType.Private) {
                allPrivate = allPrivate + totals[i];
            } else if (types[i] == AccountType.Strategy) {
                allStrategy = allStrategy + totals[i];
            }
        }

        require(allMoma == TOTAL, 'MomaLord: totals sum not equal to TOTAL');
        require(allSeed == TOTAL_SEED, 'MomaLord: allSeed sum not equal to TOTAL_SEED');
        require(allPrivate == TOTAL_PRIVATE, 'MomaLord: allPrivate sum not equal to TOTAL_PRIVATE');
        require(allStrategy == TOTAL_STRATEGY, 'MomaLord: allStrategy sum not equal to TOTAL_STRATEGY');
    }
}
