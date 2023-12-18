import {
  HStack,
  Input,
  FormLabel,
  Box,
  Spinner,
  Flex,
  Stack,
  Text,
  FormControl,
  Tooltip,
  Link,
} from "@chakra-ui/react"
import type { ChangeEvent, FC } from "react"
import { useCallback, useEffect, useMemo } from "react"
import { useFormikContext } from "formik"
import { ArrowDownIcon, InfoOutlineIcon } from "@chakra-ui/icons"
import type { SingleValue } from "react-select"
import { useDebounce } from "use-debounce"
import { formatUnits } from "ethers/lib/utils.js"
import type { BigNumberish } from "ethers"
import BigNumber from "bignumber.js"

import SwapRecipeInfo from "createProposal/components/actions/SwapRecipeInfo"
import UniPriceChecker from "createProposal/components/actions/UniPriceChecker"
import type { AssetForSelector } from "createProposal/components/actions/AssetSelectorWithInput"
import AssetSelectorWithInput from "createProposal/components/actions/AssetSelectorWithInput"
import type SwapAction from "createProposal/action/SwapAction"
import { useCreateProposal } from "createProposal/providers/CreateProposalProvider"
import type { CreateProposalFormValues } from "createProposal/types/form"
import { useQuoteSwapQuery, useAvailableSwapsQuery } from "query/graphql"
import {
  addressToAccountId,
  chainIdToChainReference,
  parseAccountId,
} from "web3/helpers/transformers"
import {
  ETH,
  PriceCheckerOption,
  UNI_V3_ADDRESS,
  WETH,
} from "createProposal/action/SwapAction"
import { CustomSelect } from "common/components/CustomSelect"
import { formatDollars } from "common/helpers/formatDollars"
import { EXTERNAL_ROUTES } from "common/constants/routes"
import { getMainnetReference } from "web3/helpers/chainReference"

const ETH_ACCOUNT_ID = addressToAccountId(ETH, getMainnetReference())
const WETH_ACCOUNT_ID = addressToAccountId(WETH, getMainnetReference())

type SwapRecipeProps = {
  action: SwapAction
  index: number
}

const SwapRecipe: FC<SwapRecipeProps> = ({ action, index }) => {
  const { amountIn, sellToken, buyToken } = action

  const { governanceId, governanceChainId } = useCreateProposal()
  const { setFieldValue } = useFormikContext<CreateProposalFormValues>()

  const { data: availableSwapsData, isLoading: isLoadingAvailableSwaps } =
    useAvailableSwapsQuery({
      governorId: governanceId,
    })

  const [debouncedAmountIn] = useDebounce(amountIn, 1000)
  const chainReference = chainIdToChainReference(governanceChainId)
  const sell = sellToken
    ? addressToAccountId(sellToken?.address, chainReference)
    : undefined
  const buy = buyToken
    ? addressToAccountId(buyToken?.address, chainReference)
    : undefined

  const isFetchQuoteEnabled = Boolean(debouncedAmountIn !== "0" && buy && sell)
  const { data: quoteData, isFetching: isFetchingQuote } = useQuoteSwapQuery(
    {
      governorID: governanceId,
      buy: buy as string,
      // Cannot directly sell ETH, must first deposit to WETH. Use WETH directly to get quote.
      sell:
        (sell as string) === ETH_ACCOUNT_ID
          ? WETH_ACCOUNT_ID
          : (sell as string),
      sellAmount: debouncedAmountIn,
    },
    {
      enabled: isFetchQuoteEnabled,
    },
  )

  useEffect(() => {
    if (!quoteData || !buyToken) return

    const { buyTokenQuoteRate } = quoteData.quoteSwap

    if (buyTokenQuoteRate === buyToken.quoteRate) return

    const newBuyToken: AssetForSelector = {
      ...buyToken,
      quoteRate: buyTokenQuoteRate,
    }

    setFieldValue(`actions.${index}.buyToken`, newBuyToken)
  }, [quoteData, buyToken, index, setFieldValue])

  useEffect(() => {
    if (!quoteData) {
      setFieldValue(`actions.${index}.quote`, undefined)

      return
    }

    setFieldValue(`actions.${index}.quote`, quoteData.quoteSwap)
  }, [quoteData, index, setFieldValue])

  const sellAssets = availableSwapsData?.availableSwaps.sell || []

  const handleChangeSellAmount = useCallback(
    (newAmount: string) => {
      setFieldValue(`actions.${index}.amountIn`, newAmount)
    },
    [index, setFieldValue],
  )

  const handleChangeSellAsset = (newAsset: AssetForSelector) => {
    setFieldValue(`actions.${index}.sellToken`, newAsset)
  }

  const buyAssets: AssetForSelector[] = useMemo(() => {
    if (!availableSwapsData) return []

    const { buy } = availableSwapsData.availableSwaps

    return buy.map((asset) => {
      const { address } = parseAccountId(asset.id)

      return {
        address,
        ...asset,
      }
    })
  }, [availableSwapsData])

  const defaultAmountIn = useMemo(() => {
    if (!sellToken) return

    const { decimals } = sellToken

    const formattedAmount = formatUnits(amountIn, decimals)

    if (formattedAmount.endsWith(".0")) {
      const [whole] = formattedAmount.split(".")

      return whole
    }

    return formattedAmount
  }, [amountIn, sellToken])

  const amountOut = useMemo(() => {
    if (!quoteData) return "0"

    const {
      quoteSwap: { buyAmount },
    } = quoteData

    const bigBuyAmount = new BigNumber(buyAmount).toPrecision(4)

    return new BigNumber(bigBuyAmount).toFixed()
  }, [quoteData])

  const handleChangeBuyAsset = (newAsset: AssetForSelector) => {
    setFieldValue(`actions.${index}.buyToken`, newAsset)
  }

  return (
    <Stack spacing={8}>
      <Stack spacing={4}>
        <Text fontSize="sm">
          Want to learn more about Swaps? Check out our docs{" "}
          <Link
            isExternal
            color="purple.500"
            href={EXTERNAL_ROUTES.tally.docs.swaps()}
          >
            here
          </Link>
          . Don&apos;t see an asset here? Reach out on{" "}
          <Link isExternal color="purple.500" href={EXTERNAL_ROUTES.discord()}>
            Discord
          </Link>{" "}
          or via the chat button to let us know which tokens you&apos;d like to
          see supported.
        </Text>
        <Stack spacing={0.5}>
          <AssetSelectorWithInput
            withBalance
            assets={sellAssets}
            defaultAmount={defaultAmountIn}
            selectPlaceholder="Sell"
            selectedAsset={sellToken}
            onChangeAmount={handleChangeSellAmount}
            onChangeAsset={handleChangeSellAsset}
          />
          <SwapIcon isLoading={isFetchingQuote || isLoadingAvailableSwaps} />
          <AssetSelectorWithInput
            isInputDisabled
            amount={amountOut}
            assets={buyAssets}
            selectPlaceholder="Buy"
            selectedAsset={buyToken}
            onChangeAmount={() => console.log("no-op")}
            onChangeAsset={handleChangeBuyAsset}
          />
        </Stack>
        <Summary
          action={action}
          amountOut={amountOut}
          buyAsset={buyToken}
          fee={quoteData?.quoteSwap.feeAmount}
          sellAsset={sellToken}
        />
      </Stack>
      <Stack spacing={4}>
        <PriceChecker
          action={action}
          buyAmount={quoteData?.quoteSwap.buyAmount}
          index={index}
        />
        <SwapRecipeInfo
          body={
            <Text>
              Estimated price based on current market conditions. Actual swap
              price will depend on market prices at the time of execution.
            </Text>
          }
          colorScheme="purple"
          leftIcon={InfoOutlineIcon}
        />
      </Stack>
    </Stack>
  )
}

export default SwapRecipe

type SwapIconProps = {
  isLoading: boolean
}

const SwapIcon: FC<SwapIconProps> = ({ isLoading }) => {
  return (
    <Box position="relative" w="full">
      <Flex
        align="center"
        bg="white"
        border="gray.light"
        borderRadius="full"
        h="10"
        justify="center"
        left="50%"
        position="absolute"
        transform="translate(-50%, -50%)"
        w="10"
      >
        {isLoading ? <Spinner /> : <ArrowDownIcon />}
      </Flex>
    </Box>
  )
}

type PriceCheckerProps = {
  action: Pick<
    SwapAction,
    | "amountIn"
    | "sellToken"
    | "buyToken"
    | "priceChecker"
    | "priceCheckerAddress"
    | "slippage"
    | "getPriceCheckerData"
    | "quote"
  >
  index: number
  buyAmount?: BigNumberish
}

type PriceCheckerSelectOptions = {
  [key in PriceCheckerOption]: {
    label: string
    value: PriceCheckerOption
  }
}

const options: PriceCheckerSelectOptions = {
  [PriceCheckerOption.UNI_V3]: {
    label: "Uniswap v3 price oracle",
    value: PriceCheckerOption.UNI_V3,
  },
  [PriceCheckerOption.CUSTOM]: {
    label: "Use custom price checker",
    value: PriceCheckerOption.CUSTOM,
  },
}

const PriceChecker: FC<PriceCheckerProps> = ({ action, index, buyAmount }) => {
  const { priceChecker, priceCheckerAddress } = action

  const { setFieldValue } = useFormikContext<CreateProposalFormValues>()

  const handleChangePriceChecker = (
    newValue: SingleValue<{
      label: string
      value: PriceCheckerOption
    }>,
  ) => {
    if (!newValue) return

    const { value } = newValue

    setFieldValue(`actions.${index}.priceChecker`, value)
    setFieldValue(
      `actions.${index}.priceCheckerAddress`,
      value === PriceCheckerOption.UNI_V3 ? UNI_V3_ADDRESS : "",
    )
    setFieldValue(`actions.${index}.priceCheckerData`, "")
  }

  const handleChangePriceCheckerAddress = (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const { value } = e.target

    setFieldValue(`actions.${index}.priceCheckerAddress`, value)
  }

  const handleChangePriceCheckerData = (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target

    setFieldValue(`actions.${index}.priceCheckerData`, value)
  }

  const value = options[priceChecker]

  return (
    <Stack>
      <Stack spacing={0}>
        <FormLabel color="gray.700" fontSize="sm">
          Price checker
        </FormLabel>
        <CustomSelect
          components={{ IndicatorSeparator: null }}
          isSearchable={false}
          options={[
            options[PriceCheckerOption.UNI_V3],
            options[PriceCheckerOption.CUSTOM],
          ]}
          styles={{
            control: (baseStyles) => ({
              ...baseStyles,
              borderColor: "#E2E8F0", // gray.200
            }),
          }}
          value={value}
          onChange={handleChangePriceChecker}
        />
      </Stack>
      <Box>
        {priceChecker === PriceCheckerOption.UNI_V3 ? (
          <UniPriceChecker
            action={action}
            buyAmount={buyAmount}
            index={index}
          />
        ) : (
          <Stack>
            <FormControl>
              <FormLabel color="gray.700" fontSize="sm">
                Price checker address
              </FormLabel>
              <Input
                value={priceCheckerAddress}
                onChange={handleChangePriceCheckerAddress}
              />
            </FormControl>
            <FormControl>
              <FormLabel color="gray.700" fontSize="sm">
                Price checker data
              </FormLabel>
              <Input
                value={action.getPriceCheckerData()}
                onChange={handleChangePriceCheckerData}
              />
            </FormControl>
          </Stack>
        )}
      </Box>
    </Stack>
  )
}

type SummaryProps = {
  action: Pick<SwapAction, "amountIn">
  amountOut: string
  sellAsset?: Pick<AssetForSelector, "decimals" | "quoteRate" | "symbol">
  buyAsset?: Pick<AssetForSelector, "decimals" | "symbol">
  fee?: string
}

const Summary: FC<SummaryProps> = ({
  action,
  amountOut,
  sellAsset,
  buyAsset,
  fee,
}) => {
  const priceString = useMemo(() => {
    if (!sellAsset || !buyAsset) return "N/A"

    const { decimals: sellDecimals, symbol: sellSymbol } = sellAsset
    const { decimals: buyDecimals, symbol: buySymbol } = buyAsset
    const { amountIn } = action

    const ratio =
      Number(formatUnits(amountOut, buyDecimals)) /
      Number(formatUnits(amountIn, sellDecimals))

    return `1 ${sellSymbol} = ${ratio.toFixed(4)} ${buySymbol}`
  }, [sellAsset, buyAsset, amountOut, action])

  const formattedFee = useMemo(() => {
    if (!sellAsset || !fee) return 0

    const { decimals } = sellAsset

    const feeWithSigFigs = new BigNumber(fee).toPrecision(4)
    const feeWithSigFigsWhole = new BigNumber(feeWithSigFigs).toFixed()
    const formatted = formatUnits(feeWithSigFigsWhole.toString(), decimals)

    return Number(formatted)
  }, [sellAsset, fee])

  const usdAmount = useMemo(() => {
    if (!sellAsset?.quoteRate || !formattedFee) return 0

    const { quoteRate } = sellAsset

    return formattedFee * quoteRate
  }, [formattedFee, sellAsset])

  const { formattedDollars, formattedCents } = formatDollars(usdAmount)

  return (
    <Stack color="gray.700" fontSize="sm" fontWeight="medium" spacing={0}>
      <HStack justify="space-between">
        <Text>Price</Text>
        <Text>{priceString}</Text>
      </HStack>
      <HStack justify="space-between">
        <HStack>
          <Text>Execution cost</Text>
        </HStack>
        <Text>
          {formattedFee} {sellAsset?.symbol}{" "}
          <Text as="b" color="gray.500" fontWeight="medium">
            (~${formattedDollars}.{formattedCents})
          </Text>
        </Text>
      </HStack>
      <HStack justify="space-between">
        <HStack>
          <Text>Fee</Text>
          <Tooltip
            cursor="pointer"
            label="Swaps are a premium feature, but they’re free for now."
          >
            <InfoOutlineIcon color="gray.500" />
          </Tooltip>
        </HStack>
        <Text>$0</Text>
      </HStack>
    </Stack>
  )
}
