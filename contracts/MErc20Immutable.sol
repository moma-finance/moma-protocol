pragma solidity ^0.5.16;

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
     * @param interestRateModel_ The address of the interest rate model
     * @param initialExchangeRateMantissa_ The initial exchange rate, scaled by 1e18
     * @param name_ ERC-20 name of this token
     * @param symbol_ ERC-20 symbol of this token
     * @param decimals_ ERC-20 decimal precision of this token
     * @param admin_ Address of the administrator of this token
     * @param feeAdmin_ Address of the fee administrator of this token
     * @param feeReceiver_ Address of the free receiver of this token
     */
    constructor(address underlying_,
                MomaMasterInterface momaMaster_,
                InterestRateModel interestRateModel_,
                uint initialExchangeRateMantissa_,
                string memory name_,
                string memory symbol_,
                uint8 decimals_,
                address payable admin_,
                address payable feeAdmin_,
                address payable feeReceiver_) public {
        // Creator of the contract is admin during initialization
        admin = msg.sender;

        // Initialize the market
        initialize(underlying_, momaMaster_, interestRateModel_, initialExchangeRateMantissa_, name_, symbol_, decimals_, feeAdmin_, feeReceiver_);

        // Set the proper admin now that initialization is done
        admin = admin_;
    }
}
