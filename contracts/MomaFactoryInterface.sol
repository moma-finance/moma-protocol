pragma solidity ^0.5.16;

interface MomaFactoryInterface {

    event PoolCreated(address pool, address creator, uint poolLength);
    event NewAdmin(address oldAdmin, address newAdmin);
    event NewFeeAdmin(address oldFeeAdmin, address newFeeAdmin);
    event NewDefualtFeeReceiver(address oldFeeReceiver, address newFeeReceiver);
    event NewDefualtFeeFactor(uint oldFeeFactor, uint newFeeFactor);
    event NewTokenFeeFactor(address token, uint oldFeeFactor, uint newFeeFactor);
    event NewPoolFeeAdmin(address pool, address oldPoolFeeAdmin, address newPoolFeeAdmin);
    event NewPoolFeeReceiver(address pool, address oldPoolFeeAdmin, address newPoolFeeAdmin);
    event NewPoolFeeFactor(address pool, uint oldPoolFeeFactor, uint newPoolFeeFactor);
    event NewPoolFeeStatus(address pool, bool oldPoolFeeStatus, bool newPoolFeeStatus);

    function admin() external view returns (address);
    function feeAdmin() external view returns (address);
    function defualtFeeReceiver() external view returns (address);
    function defualtFeeFactorMantissa() external view returns (uint);
    function feeFactorMaxMantissa() external view returns (uint);

    function tokenFeeFactors(address token) external view returns (uint);
    // function pools(address pool) external view returns (PoolInfo memory);
    function allPools(uint) external view returns (address);

    function createPool() external returns (address);
    function allPoolsLength() external view returns (uint);
    function getMomaFeeReceiver(address pool) external view returns (address payable);
    function getMomaFeeFactorMantissa(address pool, address underlying) external view returns (uint);

    function setAdmin(address _newAdmin) external;
    
    function setFeeAdmin(address _newFeeAdmin) external;
    function setDefualtFeeReceiver(address payable _newFeeReceiver) external;
    function setDefualtFeeFactor(uint _newFeeFactor) external;
    function setTokenFeeFactor(address token, uint _newFeeFactor) external;

    function setPoolFeeAdmin(address pool, address _newPoolFeeAdmin) external;
    function setPoolFeeReceiver(address pool, address payable _newPoolFeeReceiver) external;
    function setPoolFeeFactor(address pool, uint _newFeeFactor) external;
    function setPoolFeeStatus(address pool, bool _noFee) external;
}
