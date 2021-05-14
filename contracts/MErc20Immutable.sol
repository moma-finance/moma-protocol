pragma solidity 0.5.17;

import "./MErc20.sol";

/**
 * @title Moma's MErc20Immutable Contract
 * @notice MTokens which wrap an EIP-20 underlying and are immutable
 * @author Moma
 */
contract MErc20Immutable is MErc20 {
    /**
     * @notice Construct a new money market
     * @param underlying_ The address of the underlying asset
     * @param momaMaster_ The address of the momaMaster
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     * @param feeReceiver_ Address of the free receiver of this token
     */
    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable feeReceiver_) public {

        // Initialize the market
        initialize(underlying_, momaMaster_, initialExchangeRateMantissa_, name_, symbol_, decimals_, feeReceiver_);

    }
}
