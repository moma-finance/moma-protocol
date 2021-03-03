pragma solidity ^0.5.16;

import "./MToken.sol";
import "./FarmingDelegate.sol";
import "./Governance/Moma.sol";
import "./SafeMath.sol";


contract MomaFactoryProxyStorage {

    address public admin;
    address public pendingAdmin;
    address public momaFactoryImplementation;
    address public pendingMomaFactoryImplementation;

    address public feeAdmin;
    address payable public defualtFeeReceiver;
}


contract MomaFactoryStorage is MomaFactoryProxyStorage {
    using SafeMath for uint;

    Moma public moma;
    FarmingDelegate public farmingDelegate;

    uint public defualtFeeFactorMantissa;
    uint public constant feeFactorMaxMantissa = 1e18;
    uint public lendingPoolNum;
    bool public allowUpgrade = true;

    struct PoolInfo {
        address creator;
        address poolFeeAdmin;
        address payable poolFeeReceiver;
        uint feeFactor;
        bool noFee;
        bool isLending;
        bool allowUpgrade;

        // MOMA farming
        /// @notice The block number start to farm MOMA, used for rewards calculation
        uint startBlock;

        /// @notice The block number to stop farming, used for rewards calculation
        uint endBlock;

        /// @notice The portion of MOMA speed that each market currently receives
        mapping(address => uint) momaSpeeds;

        /// @notice The last MOMA claimable calculation block of each moma market of this pool
        mapping(address => uint) lastBlocks;

        /// @notice The MOMA claimable of each moma market of this pool
        mapping(address => uint) momaClaimable;

        /// @notice The MOMA claimed of each moma market of this pool
        mapping(address => uint) momaClaimed;

        /// @notice The MOMA support market of this pool
        mapping(address => bool) isMomaMarket;

        /// @notice A list of all markets
        MToken[] allMarkets;
    }

    mapping(address => uint) public tokenFeeFactors;
    mapping(address => PoolInfo) public pools;
    address[] public allPools;

}
