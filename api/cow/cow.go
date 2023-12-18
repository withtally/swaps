package cow

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/withtally/tally/base"
	"github.com/withtally/tally/base/types"
)

type IClient interface {
	Quote(ctx context.Context, chainID types.ChainID, req *QuoteRequest) (*QuoteResponse, error)
	NativePrice(context.Context, types.EVMAccountID) (*NativePriceResponse, error)
	Orders(context.Context, types.ChainID, common.Address) ([]Order, error)
}

type Client struct{}

var (
	// https://api.cow.fi/mainnet/api/v1/token/:address/native_price
	nativePriceURL = "https://api.cow.fi/%s/api/v1/token/%s/native_price"

	// https://api.cow.fi/mainnet/api/v1/quote
	quoteURL = "https://api.cow.fi/%s/api/v1/quote"

	// https://api.cow.fi/mainnet/api/v1/account/:address/orders
	ordersURL = "https://api.cow.fi/%s/api/v1/account/%s/orders"

	ErrSellAmountDoesNotCoverFee = "SellAmountDoesNotCoverFee"

	MilkmanABI = `[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"orderContract","type":"address"},{"indexed":false,"internalType":"address","name":"orderCreator","type":"address"},{"indexed":false,"internalType":"uint256","name":"amountIn","type":"uint256"},{"indexed":false,"internalType":"address","name":"fromToken","type":"address"},{"indexed":false,"internalType":"address","name":"toToken","type":"address"},{"indexed":false,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"address","name":"priceChecker","type":"address"},{"indexed":false,"internalType":"bytes","name":"priceCheckerData","type":"bytes"}],"name":"SwapRequested","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"contract IERC20","name":"fromToken","type":"address"},{"internalType":"contract IERC20","name":"toToken","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"address","name":"priceChecker","type":"address"},{"internalType":"bytes","name":"priceCheckerData","type":"bytes"}],"name":"cancelSwap","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20","name":"fromToken","type":"address"},{"internalType":"bytes32","name":"_swapHash","type":"bytes32"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"orderDigest","type":"bytes32"},{"internalType":"bytes","name":"encodedOrder","type":"bytes"}],"name":"isValidSignature","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"amountIn","type":"uint256"},{"internalType":"contract IERC20","name":"fromToken","type":"address"},{"internalType":"contract IERC20","name":"toToken","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"address","name":"priceChecker","type":"address"},{"internalType":"bytes","name":"priceCheckerData","type":"bytes"}],"name":"requestSwapExactTokensForTokens","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"swapHash","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"}]`
)

func NewClient() *Client {
	return &Client{}
}

type Quote struct {
	SellToken         string `json:"sellToken"`
	BuyToken          string `json:"buyToken"`
	SellAmount        string `json:"sellAmount"`
	BuyAmount         string `json:"buyAmount"`
	ValidTo           uint64 `json:"validTo"`
	AppData           string `json:"appData"`
	FeeAmount         string `json:"feeAmount"`
	Kind              string `json:"kind"`
	PartiallyFillable bool   `json:"partiallyFillable"`
	SellTokenBalance  string `json:"sellTokenBalance"`
	BuyTokenBalance   string `json:"buyTokenBalance"`
	SigningScheme     string `json:"signingScheme"`
}

type QuoteResponse struct {
	Quote       Quote     `json:"quote"`
	From        string    `json:"from"`
	Expiration  time.Time `json:"expiration"`
	ID          uint64    `json:"id"`
	ErrorType   string    `json:"errorType"`
	Description string    `json:"description"`
}

type QuoteRequest struct {
	SellToken           string `json:"sellToken"`
	BuyToken            string `json:"buyToken"`
	PartiallyFillable   bool   `json:"partiallyFillable"`
	From                string `json:"from"`
	Kind                string `json:"kind"`
	SellAmountBeforeFee string `json:"sellAmountBeforeFee"`
}

func (c *Client) Quote(ctx context.Context, chainID types.ChainID, req *QuoteRequest) (*QuoteResponse, error) {
	_, log := base.LogFor(ctx)

	chainName, err := chainIDToName(chainID)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("getting chain name")
	}

	marshaled, err := json.Marshal(req)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("marhsaling quote request")
	}

	body := bytes.NewReader(marshaled)
	res, err := http.Post(fmt.Sprintf(quoteURL, chainName), "application/json", body)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("making quote request")
	}

	resBody, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("reading quote response body")
	}

	quote := new(QuoteResponse)
	if err := json.Unmarshal(resBody, quote); err != nil {
		return nil, fmt.Errorf("unmarshaling quote response %s", string(resBody))
	}

	if quote.ErrorType != "" {
		return nil, errors.New(quote.ErrorType)
	}

	return quote, nil
}

type NativePriceResponse struct {
	ErrorType   *string  `json:"errorType"`
	Description *string  `json:"description"`
	Price       *float64 `json:"price"`
}

func (c *Client) NativePrice(ctx context.Context, tokenID types.EVMAccountID) (*NativePriceResponse, error) {
	_, log := base.LogFor(ctx)

	chainName, err := chainIDToName(tokenID.ChainID)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("getting chain name")
	}

	res, err := http.Get(fmt.Sprintf(nativePriceURL, chainName, tokenID.Address().Hex()))
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("getting native price data")
	}
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("reading native price data")
	}

	price := &NativePriceResponse{}
	if err := json.Unmarshal(body, &price); err != nil {
		log.Err(err)
		return nil, fmt.Errorf("marshalling native price data")
	}

	if price.ErrorType != nil {
		return nil, errors.New(*price.Description)
	}

	return price, nil
}

type Order struct {
	UID       string `json:"uid"`
	Status    string `json:"status"`
	BuyAmount string `json:"buyAmount"`
}

func (c *Client) Orders(ctx context.Context, chainID types.ChainID, address common.Address) ([]Order, error) {
	_, log := base.LogFor(ctx)

	chainName, err := chainIDToName(chainID)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("getting chain name")
	}

	res, err := http.Get(fmt.Sprintf(ordersURL, chainName, address.Hex()))
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("getting orders data")
	}
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Err(err)
		return nil, fmt.Errorf("reading orders data")
	}

	var orders []Order
	if err := json.Unmarshal(body, &orders); err != nil {
		log.Err(err)
		return nil, fmt.Errorf("marshalling native price data")
	}

	return orders, nil
}

func chainIDToName(chainID types.ChainID) (string, error) {
	if chainID.Reference == "1" {
		return "mainnet", nil
	}

	return "", errors.New("invalid chain")
}

type FakeClient struct {
	quoteError bool
}

func NewFakeClient() *FakeClient {
	return new(FakeClient)
}

func (fcc *FakeClient) SetQuoteError() {
	fcc.quoteError = true
}

func (fcc *FakeClient) Quote(ctx context.Context, chainID types.ChainID, req *QuoteRequest) (*QuoteResponse, error) {
	if fcc.quoteError {
		return nil, errors.New(ErrSellAmountDoesNotCoverFee)
	}

	return quoteResponse, nil
}

func (fcc *FakeClient) NativePrice(ctx context.Context, tokenID types.EVMAccountID) (*NativePriceResponse, error) {
	return &NativePriceResponse{}, nil
}

func (fcc *FakeClient) Orders(ctx context.Context, chainID types.ChainID, address common.Address) ([]Order, error) {
	return []Order{}, nil
}
