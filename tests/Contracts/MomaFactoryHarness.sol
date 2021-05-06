pragma solidity ^0.5.16;

import "./MomaPoolHarness.sol";
import "../../contracts/MomaFactory.sol";


contract MomaFactoryHarness is MomaFactory {

    function createPool() external returns (address pool) {
        bytes memory bytecode = type(MomaPoolHarness).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(msg.sender));
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        IMomaPool(pool).initialize(msg.sender, momaMaster);
        PoolInfo storage info = pools[pool];
        info.creator = msg.sender;
        info.poolFeeAdmin = feeAdmin;
        info.poolFeeReceiver = defualtFeeReceiver;
        info.feeFactor = defualtFeeFactorMantissa;
        allPools.push(pool);
        emit PoolCreated(pool, msg.sender, allPools.length);
    }

    function harnessSetMErc20(address mErc20_) public {
        mErc20 = mErc20_;
    }

    function harnessSetTokenFeeFactor(address token, uint _newFeeFactor) external {
        tokenFeeFactors[token] = _newFeeFactor;
    }
}

contract FalseMomaFactory is MomaFactory {
    bool public constant isMomaFactory = false;
}

contract FalseFarmingDelegate {
    bool public constant isFarmingDelegate = false;
}

contract FalseMToken {
    bool public constant isMToken = false;
}

contract FalsePriceOracle {
    bool public constant isPriceOracle = false;
}


contract EchoTypesMomaFactory is MomaFactoryProxyStorage {

    bool public constant isMomaFactory = true;

    function _become(MomaFactoryProxy proxy) public {
        require(proxy._acceptImplementation() == 0, "change not authorized");
    }

    function stringy(string memory s) public pure returns(string memory) {
        return s;
    }

    function addresses(address a) public pure returns(address) {
        return a;
    }

    function booly(bool b) public pure returns(bool) {
        return b;
    }

    function listOInts(uint[] memory u) public pure returns(uint[] memory) {
        return u;
    }

    function reverty() public pure {
        require(false, "gotcha sucka");
    }
}
