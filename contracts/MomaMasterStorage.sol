pragma solidity ^0.5.16;

import "./MToken.sol";
import "./PriceOracle.sol";

contract MomaPoolAdminStorage {
    /**
    * @notice Factory of this contract
    */
    address public factory;

    /**
    * @notice Administrator for this contract
    */
    address public admin;

    /**
    * @notice Pending administrator for this contract
    */
    address public pendingAdmin;

    /**
    * @notice Active brains of MomaPool
    */
    address public momaMasterImplementation;

    /**
    * @notice Pending brains of MomaPool
    */
    address public pendingMomaMasterImplementation;
}


contract MomaMasterV1Storage is MomaPoolAdminStorage {

    /**
     * @notice Oracle which gives the price of any given asset
     */
    PriceOracle public oracle;

    /**
     * @notice Multiplier used to calculate the maximum repayAmount when liquidating a borrow
     */
    uint public closeFactorMantissa;

    /**
     * @notice Multiplier representing the discount on collateral that a liquidator receives
     */
    uint public liquidationIncentiveMantissa;

    /**
     * @notice Max number of assets a single account can participate in (borrow or use as collateral)
     */
    uint public maxAssets;

    /**
     * @notice Per-account mapping of "assets you are in", capped by maxAssets
     */
    mapping(address => MToken[]) public accountAssets;


    struct Market {
        /// @notice Whether or not this market is listed
        bool isListed;

        /**
         * @notice Multiplier representing the most one can borrow against their collateral in this market.
         *  For instance, 0.9 to allow borrowing 90% of collateral value.
         *  Must be between 0 and 1, and stored as a mantissa.
         */
        uint collateralFactorMantissa;

        /// @notice Per-market mapping of "accounts in this asset"
        mapping(address => bool) accountMembership;

        /// @notice Whether or not this market receives MOMA
        // bool isMomaed;
    }

    /**
     * @notice Official mapping of mTokens -> Market metadata
     * @dev Used e.g. to determine if a market is supported
     */
    mapping(address => Market) public markets;


    /**
     * @notice The Pause Guardian can pause certain actions as a safety mechanism.
     *  Actions which allow users to remove their own assets cannot be paused.
     *  Liquidation / seizing / transfer can only be paused globally, not by market.
     */
    address public pauseGuardian;
    bool public _mintGuardianPaused;
    bool public _borrowGuardianPaused;
    bool public transferGuardianPaused;
    bool public seizeGuardianPaused;
    mapping(address => bool) public mintGuardianPaused;
    mapping(address => bool) public borrowGuardianPaused;


    struct MomaMarketState {
        /// @notice The market's last updated BorrowIndex or SupplyIndex
        uint224 index;

        /// @notice The block number the index was last updated at
        uint32 block;
    }

    /// @notice A list of all markets
    MToken[] public allMarkets;

    /// @notice The portion of momaRate that each market currently receives
    mapping(address => uint) public momaSpeeds;

    /// @notice The MOMA market supply state for each market
    mapping(address => MomaMarketState) public momaSupplyState;

    /// @notice The MOMA market borrow state for each market
    mapping(address => MomaMarketState) public momaBorrowState;

    /// @notice The MOMA borrow index for each market for each supplier as of the last time they accrued MOMA
    mapping(address => mapping(address => uint)) public momaSupplierIndex;

    /// @notice The MOMA borrow index for each market for each borrower as of the last time they accrued MOMA
    mapping(address => mapping(address => uint)) public momaBorrowerIndex;

    /// @notice The MOMA accrued but not yet transferred to each user
    mapping(address => uint) public momaAccrued;



    // @notice The borrowCapGuardian can set borrowCaps to any number for any market. Lowering the borrow cap could disable borrowing on the given market.
    address public borrowCapGuardian;

    // @notice Borrow caps enforced by borrowAllowed for each mToken address. Defaults to zero which corresponds to unlimited borrowing.
    mapping(address => uint) public borrowCaps;



    struct TokenFarmState {
        /// @notice The block number to start to farm this token
        uint32 startBlock;

        /// @notice The block number to stop farming
        uint32 endBlock;

        /// @notice The portion of tokenRate that each market currently receives
        mapping(address => uint) speeds;

        /// @notice The token market supply state for each market
        mapping(address => MomaMarketState) supplyState;

        /// @notice The token market borrow state for each market
        mapping(address => MomaMarketState) borrowState;

        /// @notice The token borrow index for each market for each supplier as of the last time they accrued token
        mapping(address => mapping(address => uint)) supplierIndex;

        /// @notice The token borrow index for each market for each borrower as of the last time they accrued token
        mapping(address => mapping(address => uint)) borrowerIndex;

        /// @notice The token accrued but not yet transferred to each user
        mapping(address => uint) accrued;
    }

    /// @notice The token farm states
    mapping(address => TokenFarmState) public farmStates;

    /// @notice A list of all tokens
    address[] public allTokens;

    uint32 public momaStartBlock;
    uint32 public momaEndBlock;
    
}
