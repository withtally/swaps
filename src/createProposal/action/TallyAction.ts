import { defaultAbiCoder, parseEther } from "ethers/lib/utils"
import invariant from "tiny-invariant"

import type {
  EncodeForTallyApiArgs,
  TallyActionArgs,
  GovernorExecutableCallInputForBlockchain,
} from "createProposal/action/types"
import type { GovernorExecutableCallInput, Recipe } from "query/graphql"
import { getChainIdParams } from "web3/helpers/chainId"
import { addressToAccountId } from "web3/helpers/transformers"

class TallyAction {
  targetAddress: string | string[]
  value: string
  recipe?: Recipe

  constructor(args?: TallyActionArgs) {
    this.targetAddress = args?.targetAddress || ""
    this.value = args?.value || "0"
  }

  getTarget(): string | string[] {
    return this.targetAddress
  }

  getSignature(): string | string[] {
    return ""
  }

  getCalldata(): string | string[] {
    return defaultAbiCoder.encode([], [])
  }

  getValue(): string | string[] {
    const { value } = this

    const valueInWei = parseEther(value.toString())

    return valueInWei.toString()
  }

  encodeForTallyApi({
    chainId,
  }: EncodeForTallyApiArgs):
    | GovernorExecutableCallInput
    | GovernorExecutableCallInput[] {
    const { recipe } = this

    invariant(recipe, "recipe not defined")

    const { reference } = getChainIdParams(chainId)
    const blockchainData = this.encodeForBlockchain()

    if (Array.isArray(blockchainData)) {
      return blockchainData.map((datum) => ({
        target: addressToAccountId(datum.target, reference),
        data: datum.calldata,
        method: datum.signature,
        value: datum.value,
        recipe,
      }))
    }

    return {
      target: addressToAccountId(blockchainData.target, reference),
      data: blockchainData.calldata,
      method: blockchainData.signature,
      value: blockchainData.value,
      recipe,
    }
  }

  encodeForBlockchain():
    | GovernorExecutableCallInputForBlockchain
    | GovernorExecutableCallInputForBlockchain[] {
    const target = this.getTarget()
    const payloadLength = Array.isArray(target) ? target.length : 1

    if (payloadLength > 1) {
      invariant(
        Array.isArray(target) && target.length === payloadLength,
        `This action requires ${payloadLength} targets.`,
      )

      const data = this.getCalldata()
      invariant(
        Array.isArray(data) && data.length === payloadLength,
        `This action requires ${payloadLength} calldata.`,
      )

      const method = this.getSignature()
      invariant(
        Array.isArray(method) && method.length === payloadLength,
        `This action requires ${payloadLength} signatures.`,
      )

      const value = this.getValue()
      invariant(
        Array.isArray(value) && value.length === payloadLength,
        `This action requires ${payloadLength} values.`,
      )

      return data.map((_, index) => ({
        target: target[index],
        calldata: data[index],
        signature: method[index],
        value: value[index],
      }))
    }

    invariant(
      typeof target === "string",
      "This action requires a single target address.",
    )

    const data = this.getCalldata()
    invariant(
      typeof data === "string",
      "This action requires a single calldata.",
    )

    const method = this.getSignature()
    invariant(
      typeof method === "string",
      "This action requires a single signature.",
    )

    const value = this.getValue()
    invariant(
      typeof value === "string",
      "This action requires a single signature.",
    )

    return {
      target,
      calldata: data,
      signature: method,
      value,
    }
  }
}

export default TallyAction
