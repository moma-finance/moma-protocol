pragma solidity ^0.5.16;


contract MomaFactoryProxyStorage {

    uint public constant feeFactorMaxMantissa = 1e18;
    bool public constant isMomaFactory = true;
    bool public allowUpgrade;

    address public admin;
    address public pendingAdmin;
    address public momaFactoryImplementation;
    address public pendingMomaFactoryImplementation;

    address public feeAdmin;
    address payable public defualtFeeReceiver;
}


contract MomaFactoryStorage is MomaFactoryProxyStorage {

    address public momaFarming;
    address public farmingDelegate;

    uint public defualtFeeFactorMantissa;
    uint public lendingPoolNum;

    struct PoolInfo {
        address creator;
        address poolFeeAdmin;
        address payable poolFeeReceiver;
        uint feeFactor;
        bool noFee;
        bool isLending;
        bool allowUpgrade;
    }

    mapping(address => uint) public tokenFeeFactors;
    mapping(address => PoolInfo) public pools;
    address[] public allPools;

}
