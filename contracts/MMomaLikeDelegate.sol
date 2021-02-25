pragma solidity ^0.5.16;

import "./MErc20Delegate.sol";

interface CompLike {
  function delegate(address delegatee) external;
}

/**
 * @title Moma's MMomaLikeDelegate Contract
 * @notice MTokens which can 'delegate votes' of their underlying ERC-20
 * @author Moma
 */
contract MMomaLikeDelegate is MErc20Delegate {
  /**
   * @notice Construct an empty delegate
   */
  constructor() public MErc20Delegate() {}

  /**
   * @notice Admin call to delegate the votes of the COMP-like underlying
   * @param compLikeDelegatee The address to delegate votes to
   */
  function _delegateCompLikeTo(address compLikeDelegatee) external {
    require(msg.sender == admin, "only the admin may set the comp-like delegate");
    CompLike(underlying).delegate(compLikeDelegatee);
  }
}
