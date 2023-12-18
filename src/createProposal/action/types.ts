import type TallyAction from "createProposal/action/TallyAction"
import type CustomAction from "createProposal/action/CustomAction"
import type TransferErc20Action from "createProposal/action/TransferErc20Action"
import type TransferNativeAssetAction from "createProposal/action/TransferNativeAssetAction"
import type ManageOrcaPodAction from "createProposal/action/ManageOrcaPodAction"
import type { ChainId } from "query/graphql"

export type EncodeForTallyApiArgs = {
  chainId: ChainId
}

export type TallyActionArgs = {
  targetAddress?: string
  value?: string
}

export type GovernorExecutableCallInputForBlockchain = {
  calldata: string
  signature: string
  target: string
  value: string
}

export type GovernorExecutableCallInputsForBlockchain = {
  calldatas: string[]
  signatures: string[]
  targets: string[]
  values: string[]
}

export type Action =
  | TallyAction
  | CustomAction
  | TransferErc20Action
  | TransferNativeAssetAction
  | ManageOrcaPodAction
