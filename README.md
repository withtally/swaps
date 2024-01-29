# swaps

This repository contains a reference implementation for adding CoW Swaps to an application. 

Tally uses this code used to create [CoW swap](https://cow.fi/) proposals on [Tally](https://tally.xyz/). Tally's no-code flow Create Proposal Tool that allows DAO members to create, propose, and place CoW's "Milkman" orders directly from DAO treasuries.

For more info, refer to [Swaps](https://docs.tally.xyz/knowledge-base/proposals/creating-proposals/swaps) in Tally docs.

## Diagram

![Swaps on Tally](https://github.com/withtally/swaps/blob/ba3404b870affc7c5e21c3f9348a2825f4324c9c/swaps-on-tally.png)

## API

### `cow` package

The `cow` package is designed to interact with the CoW API. It is particularly focused on quoting, pricing, and order management using abstractions from Tally packages.

**Key Features:**

`Quote`: Gets quote for a swap, including details like sell and buy tokens, amounts, and fees.

`NativePrice`: Gets the native price for a token.

`Orders`: Gets orders for an order contract.

### `graph` package

The `graph` package is used to provide GraphQL resolvers for querying the Tally API.

**Key Features:**

`AvailableSwaps`: Retrieves available swap assets based on a given governor ID.

`QuoteSwap`: Provides swap quotes for a given set of tokens and amounts.


## Web

The TypeScript files define components and logic for the creation and execution of swap proposalson Tally.

`TallyAction`:
Constructs and encodes blockchain transactions, including target addresses, values, and calldata.
Provides methods to encode data for the Tally API and for blockchain execution.

`SwapAction` (extends `TallyAction`):
Specializes in swap-related actions, including encoding and preparing data for swap transactions.
Manages swap-specific data such as contract addresses, token information, price checkers, and slippage rates.

`SwapRecipe` Component:
React functional component for displaying and managing swap actions within the Tally create proposal interface.


## Testing

A test harness with simulate catches some errors swaps. In addition, Tally suggests testing end-to-end in prod. The best way to test multi-agent systems, like CoW, is with real money. A live system is meaningfully different from a simulated one.

Here is the methodology used when testing swaps on Tally:
1. Deployed Governor contract for testing, use [the Gov Deployer script](https://github.com/withtally/gov_deployer?tab=readme-ov-file#deployments)
2. [Add the DAO to Tally](https://docs.tally.xyz/knowledge-base/managing-a-dao)
3. Add an asset like ETH or USDC to the DAO’s treasury
4. [Create a swap proposal](https://docs.tally.xyz/knowledge-base/proposals/creating-proposals/swaps#swap-proposal-in-5-steps)


