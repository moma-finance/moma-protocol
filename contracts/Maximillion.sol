pragma solidity ^0.5.16;

import "./MEther.sol";

/**
 * @title Compound's Maximillion Contract
 * @author Compound
 */
contract Maximillion {
    /**
     * @notice The default mEther market to repay in
     */
    MEther public mEther;

    /**
     * @notice Construct a Maximillion to repay max in a MEther market
     */
    constructor(MEther mEther) public {
        mEther = mEther;
    }

    /**
     * @notice msg.sender sends Ether to repay an account's borrow in the mEther market
     * @dev The provided Ether is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     */
    function repayBehalf(address borrower) public payable {
        repayBehalfExplicit(borrower, mEther);
    }

    /**
     * @notice msg.sender sends Ether to repay an account's borrow in a mEther market
     * @dev The provided Ether is applied towards the borrow balance, any excess is refunded
     * @param borrower The address of the borrower account to repay on behalf of
     * @param mEther The address of the mEther contract to repay in
     */
    function repayBehalfExplicit(address borrower, MEther mEther) public payable {
        uint received = msg.value;
        uint borrows = mEther.borrowBalanceCurrent(borrower);
        if (received > borrows) {
            mEther.repayBorrowBehalf.value(borrows)(borrower);
            msg.sender.transfer(received - borrows);
        } else {
            mEther.repayBorrowBehalf.value(received)(borrower);
        }
    }
}
