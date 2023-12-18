# swaps
Creating swaps on Tally's Create Proposal

## API

### `cow` package

The `cow` package is designed to interact with the CoW API. It is particularly focused on quoting, pricing, and order management using abstractions from withtally/tally packages.

**Key Features:**

Quote: Gets quote for a swap, including details like sell and buy tokens, amounts, and fees.

NativePrice: Gets the native price for a token.

Orders: Gets orders for an order contract.

### `graph` package

The graph package is used to provide GraphQL resolvers for querying the Tally API.

**Key Features:**

AvailableSwaps: Retrieves available swap assets based on a given governor ID.

QuoteSwap: Provides swap quotes for a given set of tokens and amounts.
