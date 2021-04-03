pragma solidity ^0.5.16;

import "./MEther.sol";

/**
 * @title Moma's MEtherImmutable Contract
 * @notice MEther MToken which are immutable
 * @author Moma
 */
contract MEtherImmutable is MEther {
    /**
     * @notice Construct a new MEther money market
     * @param momaMaster_ The address of the momaMaster
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     * @param feeReceiver_ Address of the free receiver of this token
     */
    constructor(MomaMasterInterface momaMaster_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_) public {

        initialize(momaMaster_, initialExchangeRateMantissa_, name_, symbol_, decimals_, feeReceiver_);

    }
}
