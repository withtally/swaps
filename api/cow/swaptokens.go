package cow

import (
	"github.com/withtally/tally/base/types"
	"github.com/withtally/tally/etl/proto"
)

type SwapToken struct {
	Address  string
	ID       *proto.AccountID
	Symbol   string
	Name     string
	Decimals int64
	Logo     string
}

// SwapTokens is a list of tokens that can be swapped on Tally with CoW
var SwapTokens = []SwapToken{
	{
		Symbol:   "USDC",
		Name:     "USD Coin",
		Address:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		Decimals: 6,
		Logo:     "https://tokens.1inch.io/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png",
	},
	{
		Symbol:   "WETH",
		Name:     "Wrapped Ether",
		Address:  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
		Decimals: 18,
		Logo:     "https://tokens.1inch.io/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png",
	},
	{
		Symbol:   "USDT",
		Name:     "Tether USD",
		Address:  "0xdAC17F958D2ee523a2206206994597C13D831ec7",
		Decimals: 6,
		Logo:     "https://tokens.1inch.io/0xdac17f958d2ee523a2206206994597c13d831ec7.png",
	},
	{
		Symbol:   "DAI",
		Name:     "Dai Stablecoin",
		Address:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
		Decimals: 18,
		Logo:     "https://tokens.1inch.io/0x6b175474e89094c44da98b954eedeac495271d0f.png",
	},
}

var SwapTokensMap = map[string]SwapToken{}

func init() {
	c, err := types.NewChainID("eip155", "1")
	if err != nil {
		fmt.Errorf("creating mainnet chain id %s", err)
		return
	}

	for _, t := range SwapTokens {
		id, err := types.NewAccountID(c, t.Address)
		if err != nil {
			fmt.Errorf("creating asset id %s", err)
			return
		}

		tid := proto.AccountIDToProto(id)

		t.ID = tid

		SwapTokensMap[tid.String()] = t
	}
}
