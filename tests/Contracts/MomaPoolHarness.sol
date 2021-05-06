pragma solidity ^0.5.16;

import "../../contracts/MomaPool.sol";

contract MomaPoolHarness is MomaPool {

    constructor() MomaPool() public {}

    function harnessSetPendingImplementation(address pendingImplementation_) public {
        pendingMomaMasterImplementation = pendingImplementation_;
    }

    function harnessSetPendingAdmin(address pendingAdmin_) public {
        pendingAdmin = pendingAdmin_;
    }
}
