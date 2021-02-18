pragma solidity ^0.5.16;

import "./Unitroller.sol";
import "./MomaFactoryInterface.sol";


contract MomaFactory is MomaFactoryInterface {

    address public admin;
    address public feeAdmin;
    address payable public defualtFeeReceiver;
    uint public defualtFeeFactorMantissa = 0.01e18;
    uint public constant feeFactorMaxMantissa = 0.1e18;

    struct PoolInfo {
        address creator;
        address poolFeeAdmin;
        address payable poolFeeReceiver;
        uint feeFactor;
        bool noFee;
        bool isLending;
    }

    mapping(address => uint) public tokenFeeFactors;
    mapping(address => PoolInfo) public pools;
    address[] public allPools;

    constructor(address payable _feeReceiver) public {
        // Set admin to caller
        admin = msg.sender;
        feeAdmin = msg.sender;
        defualtFeeReceiver = _feeReceiver;
    }

    function createPool() external returns (address pool) {
        bytes memory bytecode = type(Unitroller).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IUnitroller(pool).initialize(msg.sender);
        PoolInfo storage info = pools[pool];
        info.creator = msg.sender;
        info.poolFeeAdmin = feeAdmin;
        info.poolFeeReceiver = defualtFeeReceiver;
        info.feeFactor = defualtFeeFactorMantissa;
        allPools.push(pool);
        emit PoolCreated(pool, msg.sender, allPools.length);
    }

    function allPoolsLength() external view returns (uint) {
        return allPools.length;
    }

    function getMomaFeeReceiver(address pool) external view returns (address payable) {
        return pools[pool].poolFeeReceiver;
    }

    function getMomaFeeFactorMantissa(address pool, address underlying) external view returns (uint) {
        if (pools[pool].noFee) {
            return 0;
        } else if (tokenFeeFactors[underlying] != 0) {
            return tokenFeeFactors[underlying];
        } else {
            return pools[pool].feeFactor;
        }
    }

    /*** admin Functions ***/
    function setAdmin(address _newAdmin) external {
        require(msg.sender == admin && _newAdmin != address(0), 'MomaFactory: admin check');
        address oldAdmin = admin;
        admin = _newAdmin;
        emit NewAdmin(oldAdmin, _newAdmin);
    }

    /*** feeAdmin Functions ***/
    function setFeeAdmin(address _newFeeAdmin) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        address oldFeeAdmin = feeAdmin;
        feeAdmin = _newFeeAdmin;
        emit NewFeeAdmin(oldFeeAdmin, _newFeeAdmin);
    }

    function setDefualtFeeReceiver(address payable _newFeeReceiver) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        address oldFeeReceiver = defualtFeeReceiver;
        defualtFeeReceiver = _newFeeReceiver;
        emit NewDefualtFeeReceiver(oldFeeReceiver, _newFeeReceiver);
    }

    function setDefualtFeeFactor(uint _newFeeFactor) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldFeeFactor = defualtFeeFactorMantissa;
        defualtFeeFactorMantissa = _newFeeFactor;
        emit NewDefualtFeeFactor(oldFeeFactor, _newFeeFactor);
    }

    function setTokenFeeFactor(address token, uint _newFeeFactor) external {
        require(msg.sender == feeAdmin, 'MomaFactory: feeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldFeeFactor = tokenFeeFactors[token];
        tokenFeeFactors[token] = _newFeeFactor;
        emit NewTokenFeeFactor(token, oldFeeFactor, _newFeeFactor);
    }

    /*** poolFeeAdmin Functions ***/
    function setPoolFeeAdmin(address pool, address _newPoolFeeAdmin) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        address oldPoolFeeAdmin = info.poolFeeAdmin;
        info.poolFeeAdmin = _newPoolFeeAdmin;
        emit NewPoolFeeAdmin(pool, oldPoolFeeAdmin, _newPoolFeeAdmin);
    }

    function setPoolFeeReceiver(address pool, address payable _newPoolFeeReceiver) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        address oldPoolFeeReceiver = info.poolFeeReceiver;
        info.poolFeeReceiver = _newPoolFeeReceiver;
        emit NewPoolFeeReceiver(pool, oldPoolFeeReceiver, _newPoolFeeReceiver);
    }

    function setPoolFeeFactor(address pool, uint _newFeeFactor) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        require(_newFeeFactor <= feeFactorMaxMantissa, 'MomaFactory: newFeeFactor bound check');
        uint oldPoolFeeFactor = info.feeFactor;
        info.feeFactor = _newFeeFactor;
        emit NewPoolFeeFactor(pool, oldPoolFeeFactor, _newFeeFactor);
    }

    function setPoolFeeStatus(address pool, bool _noFee) external {
        PoolInfo storage info = pools[pool];
        require(msg.sender == info.poolFeeAdmin, 'MomaFactory: poolFeeAdmin check');
        bool oldPoolFeeStatus = info.noFee;
        info.noFee = _noFee;
        emit NewPoolFeeStatus(pool, oldPoolFeeStatus, _noFee);
    }

}


interface IUnitroller {
    function initialize(address admin_) external;
}
