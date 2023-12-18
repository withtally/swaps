import { defaultAbiCoder, Interface, parseEther } from "ethers/lib/utils.js"
import type { AbiInput, AbiItem } from "web3-utils"
import invariant from "tiny-invariant"

import type { EncodeForTallyApiArgs } from "createProposal/action/types"
import TallyAction from "createProposal/action/TallyAction"
import type {
  GovernorExecutableCallInput,
  SwapMetaInput,
  SwapQuote,
} from "query/graphql"
import { Recipe } from "query/graphql"
import { jsonStringify } from "common/helpers/serialization"
import { getInputTypesAndValues } from "createProposal/helpers/action"
import type { AbiInputWithValue } from "createProposal/types/abi"
import type { AssetForSelector } from "createProposal/components/actions/AssetSelectorWithInput"
import { getChainIdParams } from "web3/helpers/chainId"
import { addressToAccountId } from "web3/helpers/transformers"
import type { Pool, Token } from "query/uniswap"
import { isSameAddress } from "web3/helpers/address"

type SwapActionArgs = {
  to: string
  milkmanContractAddress: string
}

export const ETH = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
export const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
export const UNI_V3_ADDRESS = "0x2F965935f93718bB66d53a37a97080785657f0AC"

const depositMethod: AbiItem = {
  constant: false,
  inputs: [],
  name: "deposit",
  outputs: [],
  payable: true,
  stateMutability: "payable",
  type: "function",
}
const encodeDepositMethod = (): string => {
  const wethAbi = [depositMethod]

  const wethInterface = new Interface(jsonStringify(wethAbi))

  return wethInterface.encodeFunctionData("deposit")
}

const approveInputs: AbiInput[] = [
  { internalType: "address", name: "spender", type: "address" },
  { internalType: "uint256", name: "amount", type: "uint256" },
]
const approveMethod: AbiItem = {
  inputs: approveInputs,
  name: "approve",
  outputs: [{ internalType: "bool", name: "", type: "bool" }],
  stateMutability: "nonpayable",
  type: "function",
}
const encodeApproveMethod = (spender: string, amount: string): string => {
  const approveInputsWithValues: AbiInputWithValue[] = approveInputs.map(
    (input) => {
      switch (input.name) {
        case "spender":
          return {
            ...input,
            value: spender,
          }
        case "amount":
          return {
            ...input,
            value: amount,
          }
        default:
          throw new Error("default case not allowed")
      }
    },
  )

  const { values: approveValues } = getInputTypesAndValues(
    approveInputsWithValues,
  )

  const erc20Abi = [approveMethod]

  const erc20Interface = new Interface(jsonStringify(erc20Abi))

  return erc20Interface.encodeFunctionData("approve", approveValues)
}

const swapInputs: AbiInput[] = [
  {
    internalType: "uint256",
    name: "amountIn",
    type: "uint256",
  },
  {
    internalType: "contract IERC20",
    name: "fromToken",
    type: "address",
  },
  {
    internalType: "contract IERC20",
    name: "toToken",
    type: "address",
  },
  {
    internalType: "address",
    name: "to",
    type: "address",
  },
  {
    internalType: "address",
    name: "priceChecker",
    type: "address",
  },
  {
    internalType: "bytes",
    name: "priceCheckerData",
    type: "bytes",
  },
]
const swapMethod: AbiItem = {
  inputs: swapInputs,
  name: "requestSwapExactTokensForTokens",
  outputs: [],
  stateMutability: "nonpayable",
  type: "function",
}
const encodeSwapMethod = (
  amount: string,
  fromToken: string,
  toToken: string,
  to: string,
  priceChecker: string,
  priceCheckerData: string,
): string => {
  const swapInputsWithValues: AbiInputWithValue[] = swapInputs.map((input) => {
    switch (input.name) {
      case "amountIn":
        return {
          ...input,
          value: amount,
        }
      case "fromToken":
        return {
          ...input,
          value: fromToken,
        }
      case "toToken":
        return {
          ...input,
          value: toToken,
        }
      case "to":
        return {
          ...input,
          value: to,
        }
      case "priceChecker":
        return {
          ...input,
          value: priceChecker,
        }
      case "priceCheckerData":
        return {
          ...input,
          value: priceCheckerData,
        }
      default:
        throw new Error("default case not allowed")
    }
  })

  const { values: swapValues } = getInputTypesAndValues(swapInputsWithValues)

  const milkmanAbi = [swapMethod]

  const milkmanInterface = new Interface(jsonStringify(milkmanAbi))

  return milkmanInterface.encodeFunctionData(
    "requestSwapExactTokensForTokens",
    swapValues,
  )
}

const encodePriceCheckerData = (
  slippage: number,
  path: string[],
  feePath: number[],
): string => {
  return defaultAbiCoder.encode(
    ["uint256", "bytes"],
    [
      slippage,
      defaultAbiCoder.encode(["address[]", "uint24[]"], [path, feePath]),
    ],
  )
}

export enum PriceCheckerOption {
  UNI_V3,
  CUSTOM,
}

type UniPoolPath = (Pick<Pool, "id" | "feeTier"> & {
  token0: Pick<Token, "id" | "symbol">
  token1: Pick<Token, "id" | "symbol">
})[]

class SwapAction extends TallyAction {
  recipe = Recipe.Swap

  milkmanContractAddress: string
  to: string
  amountIn: string

  sellToken?: AssetForSelector
  buyToken?: AssetForSelector

  priceChecker: PriceCheckerOption
  priceCheckerAddress: string
  priceCheckerData: string
  slippage: number

  quote?: SwapQuote
  uniPoolPath?: UniPoolPath

  constructor({ milkmanContractAddress, to }: SwapActionArgs) {
    super()

    this.milkmanContractAddress = milkmanContractAddress
    this.to = to
    this.amountIn = "0"

    this.priceChecker = PriceCheckerOption.UNI_V3
    this.priceCheckerAddress = UNI_V3_ADDRESS
    this.priceCheckerData = ""
    this.slippage = 200
  }

  getTarget(): string[] {
    const { milkmanContractAddress, sellToken } = this

    invariant(sellToken, "`sellToken` must be defined.")

    const { address: sellTokenAddress } = sellToken

    // if selling ETH, first must deposit to WETH contract
    if (sellTokenAddress === ETH) {
      return [WETH, WETH, milkmanContractAddress]
    }

    return [sellTokenAddress, milkmanContractAddress]
  }

  getSignature(): string[] {
    const { name: depositName, inputs: depositInputs } = depositMethod
    const { name: approveName, inputs: approveInputs } = approveMethod
    const { name: swapName, inputs: swapInputs } = swapMethod

    invariant(
      depositName && depositInputs,
      "`depositMethod` must be correctly defined",
    )
    invariant(
      approveName && approveInputs,
      "`approveMethod` must be correctly defined",
    )
    invariant(swapName && swapInputs, "`swapMethod` must be correctly defined")

    const depositSig = `${depositName}(${depositInputs
      .map((input) => input.type)
      .join(",")})`
    const approveSig = `${approveName}(${approveInputs
      .map((input) => input.type)
      .join(",")})`
    const swapSig = `${swapName}(${swapInputs
      .map((input) => input.type)
      .join(",")})`

    const { sellToken } = this
    invariant(sellToken, "`sellToken` must be defined.")

    const { address: sellTokenAddress } = sellToken

    // if selling ETH, first must deposit to WETH contract
    if (sellTokenAddress === ETH) {
      return [depositSig, approveSig, swapSig]
    }

    return [approveSig, swapSig]
  }

  getCalldata(): string[] {
    const {
      amountIn,
      buyToken,
      sellToken,
      to,
      priceCheckerAddress,
      uniPoolPath,
      milkmanContractAddress,
    } = this

    const priceCheckerData = this.getPriceCheckerData(uniPoolPath)

    invariant(sellToken, "`sellToken` must be defined")
    invariant(buyToken, "`buyToken` must be defined")
    invariant(priceCheckerData, "`priceCheckerData` must be defined")

    const { address: buyTokenAddress } = buyToken
    const { address: sellTokenAddress } = sellToken

    const encodedApprove = encodeApproveMethod(milkmanContractAddress, amountIn)

    // if selling ETH, first must deposit to WETH contract
    if (sellTokenAddress === ETH) {
      const encodedDeposit = encodeDepositMethod()
      const encodedSwap = encodeSwapMethod(
        amountIn,
        WETH,
        buyTokenAddress,
        to,
        priceCheckerAddress,
        priceCheckerData,
      )

      return [encodedDeposit, encodedApprove, encodedSwap]
    }

    const encodedSwap = encodeSwapMethod(
      amountIn,
      sellTokenAddress,
      buyTokenAddress,
      to,
      priceCheckerAddress,
      priceCheckerData,
    )

    return [encodedApprove, encodedSwap]
  }

  getValue(): string | string[] {
    const { amountIn, sellToken } = this

    invariant(sellToken, "`sellToken` must be defined.")

    const { address: sellTokenAddress } = sellToken
    const valueInWei = parseEther("0").toString()

    // if selling ETH, first must deposit to WETH contract
    if (sellTokenAddress === ETH) {
      return [amountIn, valueInWei, valueInWei]
    }

    return [valueInWei, valueInWei]
  }

  getPriceCheckerData(uniPoolPath?: UniPoolPath): string | undefined {
    const { buyToken, sellToken, slippage, priceChecker, priceCheckerData } =
      this

    if (priceChecker === PriceCheckerOption.CUSTOM) {
      return priceCheckerData
    }

    if (!uniPoolPath?.length || !sellToken || !buyToken) return

    const sellTokenAddress =
      sellToken.address === ETH ? WETH : sellToken.address

    if (uniPoolPath.length === 1) {
      const [{ feeTier }] = uniPoolPath
      const tokenPath = [sellTokenAddress, buyToken.address]
      const feePath = [Number(feeTier) / 100]

      return encodePriceCheckerData(slippage, tokenPath, feePath)
    }

    const { tokenPath, feePath } = uniPoolPath.reduce(
      (prev, pool, i) => {
        const { feeTier, token0, token1 } = pool
        const feePathElement = Number(feeTier) / 100

        if (i === 0) {
          const tokenPath = [
            sellTokenAddress,
            sellTokenAddress === token0.id ? token1.id : token0.id,
          ]

          return {
            tokenPath,
            feePath: [feePathElement],
          }
        }

        const prevToken = prev.tokenPath[i]

        return {
          tokenPath: [
            ...prev.tokenPath,
            prevToken === token0.id ? token1.id : token0.id,
          ],
          feePath: [...prev.feePath, feePathElement],
        }
      },
      {
        tokenPath: [],
        feePath: [],
      } as { tokenPath: string[]; feePath: number[] },
    )

    invariant(
      isSameAddress(tokenPath[0], sellTokenAddress) &&
        isSameAddress(tokenPath[tokenPath.length - 1], buyToken.address),
      "`tokenPath` is incorrect.",
    )

    return encodePriceCheckerData(slippage, tokenPath, feePath)
  }

  encodeForTallyApi({
    chainId,
  }: EncodeForTallyApiArgs): GovernorExecutableCallInput[] {
    const { recipe, uniPoolPath } = this

    invariant(recipe, "recipe not defined")

    const { reference } = getChainIdParams(chainId)
    const blockchainData = this.encodeForBlockchain()

    invariant(Array.isArray(blockchainData), "blockchain data must be an array")

    const swapSig = `${swapMethod?.name}(${swapInputs
      .map((input) => input.type)
      .join(",")})`

    return blockchainData.map((datum) => ({
      target: addressToAccountId(datum.target, reference),
      data: datum.calldata,
      method: datum.signature,
      value: datum.value,
      recipe,
      meta:
        datum.signature === swapSig && uniPoolPath
          ? JSON.stringify({
              uniPoolPath: uniPoolPath.map((pool) => pool.id),
            } as SwapMetaInput)
          : undefined,
    }))
  }
}

export default SwapAction
