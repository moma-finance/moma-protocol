# Moma Protocol

A Proprietary Solution to Meet the Growing Demands for Liquidity, Scalability and Speculation in DeFi Lending Markets.The Moma Protocol uses a proprietary smart contract factory to produce, manage, accelerate and aggregate the lending markets, creating an ecosystem that can expand infinitely on lending liquidity and market diversity.Four key components: Factory, Launch Pool, Lending Pool and Aggregator.

Before getting started with this repo please read:
- [Official Website](https://moma.finance/)
- The [Moma Whitepaper](https://docsend.com/view/dzyu756wkd2n4izq), describing how Moma works

For questions about interacting with Moma, please visit [our Discord server](https://discord.com/invite/VrrTqAm27j).

## Contracts
We detail a few of the core contracts in the Moma protocol.

### MToken, MErc20 and MEther
The Moma mTokens, which are self-contained borrowing and lending contracts. MToken contains the core logic and MErc20 and MEther add public interfaces for Erc20 tokens and ether, respectively. Each MToken is assigned an interest rate and risk model (see InterestRateModel and MomaMaster sections), and allows accounts to *mint* (supply capital), *redeem* (withdraw capital), *borrow* and *repay a borrow*. Each MToken is an ERC-20 compliant token where balances represent ownership of the market.

### MomaMaster
The risk model contract, which validates permissible user actions and disallows actions if they do not fit certain risk parameters. For instance, the MomaMaster enforces that each borrowing user must maintain a sufficient collateral balance across all mTokens.

### Moma
The Moma Governance Token (MOMA). Holders of this token have the ability to govern the protocol via the governor contract.

### Governor Alpha
The administrator of the Moma timelock contract. Holders of Moma token may create and vote on proposals which will be queued into the Moma timelock and then have effects on Moma mToken and MomaMaster contracts. This contract may be replaced in the future with a beta version.

### InterestRateModel
Contracts which define interest rate models. These models algorithmically determine interest rates based on the current utilization of a given market (that is, how much of the supplied assets are liquid versus borrowed).

### WhitePaperInterestRateModel
Initial interest rate model, as defined in the Whitepaper. This contract accepts a base rate and slope parameter in its constructor.
