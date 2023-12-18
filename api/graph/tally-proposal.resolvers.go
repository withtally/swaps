package graph

// AvailableSwaps is the resolver for the availableSwaps field.
func (r *queryResolver) AvailableSwaps(ctx context.Context, governorID *proto.AccountID) (*model.SwapAssets, error) {
	gid, err := governorID.ToCAIP()
	if err != nil {
		log.Err(err).Msg("Converting governor id to types.")
		return nil, status.Error(codes.InvalidArgument, "invalid governor id")
	}

	g, err := r.EtlEnt.Governance.Get(ctx, gid)
	if err != nil {
		if etlent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "governor not found")
		}
		log.Err(err).Msg("getting governor")
		return nil, status.Error(codes.Internal, ErrInternalServerError)
	}

	bs, err := r.Covalent.Balances(ctx, g.TreasuryID())
	if err != nil {
		log.Err(err).Msg("Getting balances.")
		return nil, status.Error(codes.Internal, ErrInternalServerError)
	}

	assets := new(model.SwapAssets)

	for _, b := range bs.Data.Items {
		b := b
		tid, err := types.NewEVMAccountID(gid.ChainID, b.ContractAddress)
		if err != nil {
			log.Err(err).Msg("Creating account id from balance item.")
			return nil, status.Error(codes.Internal, ErrInternalServerError)
		}

		// token is sellable asset if is listed in cow.SwapTokensMap or is Ether
		protoTID := proto.AccountIDToProto(tid.AccountID)
		if _, ok := cow.SwapTokensMap[protoTID.String()]; ok || b.ContractName == "Ether" {
			assets.Sell = append(assets.Sell, &b)
		}
	}

	for _, t := range cow.SwapTokens {
		t := t
		if gid.ChainID.Reference == t.ID.GetChainId().Reference {
			assets.Buy = append(assets.Buy, &t)
		}
	}

	return assets, nil
}

// QuoteSwap is the resolver for the quoteSwap field.
func (r *queryResolver) QuoteSwap(ctx context.Context, governorID *proto.AccountID, buy *proto.AccountID, sell *proto.AccountID, sellAmount types.Uint256) (*model.SwapQuote, error) {
	gid, err := governorID.ToCAIP()
	if err != nil {
		log.Err(err).Msg("Converting governor id to types.")
		return nil, status.Error(codes.InvalidArgument, "invalid governor id")
	}

	g, err := r.EtlEnt.Governance.Get(ctx, gid)
	if err != nil {
		if etlent.IsNotFound(err) {
			return nil, status.Error(codes.NotFound, "governor not found")
		}
		log.Err(err).Msg("getting governor")
		return nil, status.Error(codes.Internal, ErrInternalServerError)
	}

	if _, ok := cow.SwapTokensMap[buy.String()]; !ok {
		log.Err(fmt.Errorf("could not find token")).Msgf("Address: %s", buy.String())
		return nil, status.Error(codes.InvalidArgument, "buy token not availble")
	}

	q, err := getSwapQuote(ctx, r.Cow, r.Covalent, gid.ChainID, sell.Address, buy.Address, g.TreasuryID().Address().Hex(), sellAmount.String())
	if err != nil {
		if err.Error() == cow.ErrSellAmountDoesNotCoverFee {
			return nil, status.Error(codes.InvalidArgument, "sell amount is lower than the fee")
		}
		return nil, status.Error(codes.Internal, err.Error())
	}

	return q, nil
}

func getSwapQuote(ctx context.Context, cowClient cow.IClient, covClient covalent.IClient, chainID types.ChainID, sellToken, buyToken, from, sellAmount string) (*model.SwapQuote, error) {
	q, err := cowClient.Quote(ctx, chainID, &cow.QuoteRequest{
		SellToken:           sellToken,
		BuyToken:            buyToken,
		From:                from,
		Kind:                "sell",
		SellAmountBeforeFee: sellAmount,
	})
	if err != nil {
		if err.Error() == cow.ErrSellAmountDoesNotCoverFee {
			return nil, err
		}

		log.Err(err).Msg("Getting cowswap quote.")
		return nil, fmt.Errorf("getting swap quote")
	}

	tp, err := covClient.TokenPrice(ctx, chainID.Reference, buyToken, time.Now())
	if err != nil {
		log.Err(err).Msg("Getting token price.")
		return nil, fmt.Errorf("getting buy token price")
	}

	buyTokenQuoteRate := new(float64)
	if tp != nil {
		buyTokenQuoteRate = tp.LastPrice()
	}

	buyAmount, err := types.ParseUint256(q.Quote.BuyAmount)
	if err != nil {
		return nil, err
	}

	selAmount, err := types.ParseUint256(q.Quote.SellAmount)
	if err != nil {
		return nil, err
	}

	feeAmount, err := types.ParseUint256(q.Quote.FeeAmount)
	if err != nil {
		return nil, err
	}

	return &model.SwapQuote{
		BuyAmount:         *buyAmount,
		BuyTokenQuoteRate: buyTokenQuoteRate,
		SellAmount:        *selAmount,
		FeeAmount:         *feeAmount,
		ValidTo:           timestamppb.New(time.Unix(int64(q.Quote.ValidTo), 0)),
	}, nil
}
