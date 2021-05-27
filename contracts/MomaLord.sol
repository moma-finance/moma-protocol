pragma solidity 0.5.17;

import "./SafeMath.sol";
import "./Governance/Moma.sol";


contract MomaLord {
    using SafeMath for uint;

    enum AccountType {
        Seed,        // 0
        Private,     // 1
        Strategy,    // 2
        Community,   // 3
        Team,        // 4
        Advisor,     // 5
        Ecology,     // 6
        Dao          // 7
    }

    struct ClaimState {
        /// @notice Total MOMA can claim
        uint total;

        /// @notice MOMA claimed
        uint claimed;
    }

    Moma public moma;
    address public admin;
    address public guardian;
    bool public paused;

    // UTC+8: 2021-06-01 20:00:00 = 1622548800
    uint public tge;

    // uint public constant TOTAL_SEED      =  4250000e18;  // without first release
    // uint public constant TOTAL_PRIVATE   =  8000000e18;  // without first release
    // uint public constant TOTAL_STRATEGY  =  3000000e18;  // without first release
    // uint public constant TOTAL_SEED      =  5000000e18;  // with first release
    // uint public constant TOTAL_PRIVATE   = 10000000e18;  // with first release
    // uint public constant TOTAL_STRATEGY  =  4000000e18;  // with first release
    // uint public constant TOTAL_COMMUNITY = 50000000e18;
    // uint public constant TOTAL_TEAM      = 10000000e18;
    // uint public constant TOTAL_ADVISOR   =  3000000e18;
    // uint public constant TOTAL_ECO_DEV   =  8000000e18;
    // uint public constant TOTAL_DAO       =  9000000e18;
    // uint public constant TOTAL = TOTAL_SEED + TOTAL_PRIVATE + TOTAL_STRATEGY + TOTAL_COMMUNITY + TOTAL_TEAM + TOTAL_ADVISOR + TOTAL_ECO_DEV + TOTAL_DAO;

    uint public constant TOTAL_LOCK_SECONDS_SEED      = 30 days * 12;  // 12 months
    uint public constant TOTAL_LOCK_SECONDS_PRIVATE   = 30 days * 9;
    uint public constant TOTAL_LOCK_SECONDS_STRATEGY  = 30 days * 9;
    uint public constant TOTAL_LOCK_SECONDS_TEAM      = 30 days * 36;
    uint public constant TOTAL_LOCK_SECONDS_ADVISOR   = 30 days * 36;
    uint public constant TOTAL_LOCK_SECONDS_ECO_DEV   = 30 days * 48;

    uint public constant FIRST_LOCK_SECONDS_TEAM      = 30 days * 6;
    uint public constant FIRST_LOCK_SECONDS_ADVISOR   = 30 days * 6;

    uint public constant FIRST_RELEASE_PERCENT_SEED      = 0.15e18;  // with first release
    uint public constant FIRST_RELEASE_PERCENT_PRIVATE   = 0.2e18;   // with first release
    uint public constant FIRST_RELEASE_PERCENT_STRATEGY  = 0.25e18;  // with first release
    uint public constant FIRST_RELEASE_PERCENT_TEAM      = 0.1e18;
    uint public constant FIRST_RELEASE_PERCENT_ADVISOR   = 0.1e18;
    uint public constant FIRST_RELEASE_PERCENT_ECO_DEV   = 0.05e18;


    /// @notice Each account's each type's ClaimState
    mapping(address => mapping(uint => ClaimState)) public accounts;

    /// @notice Each account's types
    mapping(address => AccountType[]) public accountTypes;


    /// @notice Emitted when admin is changed by admin
    event NewAdmin(address oldAdmin, address newAdmin);

    /// @notice Emitted when guardian is changed by guardian
    event NewGuardian(address oldGuardian, address newGuardian);

    /// @notice Emitted when MOMA is claimed by user
    event MomaClaimed(address claimer, address recipient, AccountType accountType, uint claimed, uint left);

    /// @notice Emitted when MOMA is granted by admin
    event MomaGranted(address recipient, uint amount);


    constructor (Moma _moma, uint _tge) public {
        admin = msg.sender;
        guardian = msg.sender;
        moma = _moma;
        tge = _tge;
    }


    /*** Internal Functions ***/

    /**
     * @notice Transfer MOMA to the user
     * @dev Note: If there is not enough MOMA, will do not perform the transfer
     * @param user The address of the user to transfer MOMA to
     * @param amount The amount of token to (possibly) transfer
     * @return The amount of token which was NOT transferred to the user
     */
    function grantMomaInternal(address user, uint amount) internal returns (uint) {
        uint remaining = moma.balanceOf(address(this));
        if (amount > 0 && amount <= remaining) {
            moma.transfer(user, amount);
            return 0;
        }
        return amount;
    }

    /**
     * @notice Calculate current vesting amount
     * @param total The total amount MOMA to release
     * @param percent The release percentage of total amount at start
     * @param totalSeconds Total seconds to release all lock MOMA
     * @param lockSeconds Lockup seconds from tge to start vesting
     * @return Current total vested amount
     */
    function vestingAmount(uint total, uint percent, uint totalSeconds, uint lockSeconds) internal view returns (uint) {
        uint startTime = tge.add(lockSeconds);
        if (timestamp() <= startTime) return 0;
        uint secondsPassed = timestamp().sub(startTime);
        if (secondsPassed >= totalSeconds) return total;
        uint first = total.mul(percent).div(1e18);
        uint vesting = (total.sub(first)).mul(secondsPassed).div(totalSeconds);
        return first.add(vesting);
    }



    /*** View Functions ***/

    /**
     * @notice Calculate the MOMA claimable of the account
     * @param account The user to ask for
     * @param accountType The claim accountType of the user to ask for
     * @return The MOMA can claim
     */
    function claimable(address account, AccountType accountType) public view returns (uint) {
        ClaimState storage state = accounts[account][uint(accountType)];
        uint amount;
        if (accountType == AccountType.Seed) {
            // amount = vestingAmount(state.total, 0, TOTAL_LOCK_SECONDS_SEED, 0);      // without first release
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_SEED, TOTAL_LOCK_SECONDS_SEED, 0);          // with first release
        } else if (accountType == AccountType.Private) {
            // amount = vestingAmount(state.total, 0, TOTAL_LOCK_SECONDS_PRIVATE, 0);   // without first release
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_PRIVATE, TOTAL_LOCK_SECONDS_PRIVATE, 0);    // with first release
        } else if (accountType == AccountType.Strategy) {
            // amount = vestingAmount(state.total, 0, TOTAL_LOCK_SECONDS_STRATEGY, 0);  // without first release
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_STRATEGY, TOTAL_LOCK_SECONDS_STRATEGY, 0);  // with first release
        } else if (accountType == AccountType.Team) {
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_TEAM, TOTAL_LOCK_SECONDS_TEAM, FIRST_LOCK_SECONDS_TEAM);
        } else if (accountType == AccountType.Advisor) {
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_ADVISOR, TOTAL_LOCK_SECONDS_ADVISOR, FIRST_LOCK_SECONDS_ADVISOR);
        } else if (accountType == AccountType.Ecology) {
            amount = vestingAmount(state.total, FIRST_RELEASE_PERCENT_ECO_DEV, TOTAL_LOCK_SECONDS_ECO_DEV, 0);
        } else {
            amount = vestingAmount(state.total, 0, 0, 0);
        }
        return amount.sub(state.claimed);
    }


    /*** Called Functions ***/

    /**
     * @notice Return all of the types of the specified address
     * @dev The automatic getter may be used to access an individual type
     * @param account The address to get all tyeps
     * @return The list of types index
     */
    function getAccountTypes(address account) external view returns (AccountType[] memory) {
        return accountTypes[account];
    }

    /**
     * @notice Claim specified amount of MOMA to specified account of specified accountType
     * @param recipient The address of the recipient to transfer MOMA to
     * @param amount The amount of MOMA want to (possibly) claim
     * @param accountType The claim accountType of the user to ask for
     */
    function claim(address recipient, uint amount, AccountType accountType) public {
        require(!paused, 'claim paused');
        uint accrued = claimable(msg.sender, accountType);
        if (amount == uint(-1)) amount = accrued;
        require(amount <= accrued, 'claim amount exceed claimable');
        uint notClaimed = grantMomaInternal(recipient, amount);
        uint claimed = amount.sub(notClaimed);
        if (claimed > 0) {
            ClaimState storage state = accounts[msg.sender][uint(accountType)];
            uint oldClaimed = state.claimed;
            state.claimed = oldClaimed.add(claimed);
            require(state.claimed > oldClaimed && state.claimed <= state.total, 'claimed amount unexpect error');
            emit MomaClaimed(msg.sender, recipient, accountType, claimed, state.total.sub(state.claimed));
        }
    }

    /**
     * @notice Claim all MOMA of all accountType
     */
    function claim() external {
        for (uint i = 0; i < accountTypes[msg.sender].length; i++) {
            claim(msg.sender, uint(-1), accountTypes[msg.sender][i]);
        }
    }


    /*** Guardian Functions ***/

    /**
     * @notice Set the new guardian address
     * @param newGuardian The new guardian address
     */
    function _setGuardian(address newGuardian) external {
        require(msg.sender == guardian && newGuardian != address(0), 'MomaLord: guardian check');

        address oldGuardian = guardian;
        guardian = newGuardian;
        emit NewGuardian(oldGuardian, newGuardian);
    }

    /**
     * @notice Whether pause the claim function
     * @param paused_ Pause or not
     */
    function _setPaused(bool paused_) external {
        require(msg.sender == guardian, 'MomaLord: guardian check');
        paused = paused_;
    }


    /*** Admin Functions ***/

    /**
     * @notice Set the new admin address
     * @param newAdmin The new admin address
     */
    function _setAdmin(address newAdmin) external {
        require(msg.sender == admin && newAdmin != address(0), 'MomaLord: admin check');

        address oldAdmin = admin;
        admin = newAdmin;
        emit NewAdmin(oldAdmin, newAdmin);
    }

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

        // uint allMoma;
        // uint allSeed;
        // uint allPrivate;
        // uint allStrategy;

        // update accountType and total of each account
        for (uint i = 0; i < allAccounts.length; i++) {
            ClaimState storage state = accounts[allAccounts[i]][uint(types[i])];
            require(state.total == 0, 'MomaLord: repeat account');
            for (uint j = 0; j < accountTypes[allAccounts[i]].length; j++) {
                require(accountTypes[allAccounts[i]][j] != types[i], 'MomaLord: repeat account type');
            }

            state.total = totals[i];
            accountTypes[allAccounts[i]].push(types[i]);

            // allMoma = allMoma.add(totals[i]);
            // if (types[i] == AccountType.Seed) {
            //     allSeed = allSeed + totals[i];
            // } else if (types[i] == AccountType.Private) {
            //     allPrivate = allPrivate + totals[i];
            // } else if (types[i] == AccountType.Strategy) {
            //     allStrategy = allStrategy + totals[i];
            // }
        }

        // require(allMoma == TOTAL, 'MomaLord: totals sum not equal to TOTAL');
        // require(allSeed == TOTAL_SEED, 'MomaLord: allSeed sum not equal to TOTAL_SEED');
        // require(allPrivate == TOTAL_PRIVATE, 'MomaLord: allPrivate sum not equal to TOTAL_PRIVATE');
        // require(allStrategy == TOTAL_STRATEGY, 'MomaLord: allStrategy sum not equal to TOTAL_STRATEGY');
    }

    /**
     * @notice Transfer MOMA to the recipient
     * @dev Note: If there is not enough MOMA, we do not perform the transfer
     * @param recipient The address of the recipient to transfer MOMA to
     * @param amount The amount of MOMA to (possibly) transfer
     */
    function _grantMoma(address recipient, uint amount) external {
        require(msg.sender == admin, 'MomaLord: only admin can grant token');
        uint notTransfered = grantMomaInternal(recipient, amount);
        require(notTransfered == 0, 'MomaLord: insufficient MOMA for grant');
        emit MomaGranted(recipient, amount);
    }


    function timestamp() public view returns (uint) {
        return block.timestamp;
    }
}
