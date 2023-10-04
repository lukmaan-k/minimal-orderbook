import { ethers } from "ethers"
import { BigNumber } from "ethers"

// ############################ ALL VALUES BELOW NEED TO BE DECIDED FOR FINAL CONFIG ############################

// ------------------------ Other configs ------------------------
export const VERIFICATION_BLOCK_CONFIRMATIONS = 2
export const VERIFICATION_BLOCK_CONFIRMATIONS_DEV = 1
export const developmentChains: Array<string> = ["hardhat", "localhost"]
export const MINTER_ROLE: string = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MINTER_ROLE"))
export const BURNER_ROLE: string = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BURNER_ROLE"))
export const DEFAULT_ADMIN_ROLE = "0x0000000000000000000000000000000000000000000000000000000000000000"
export const BASE_URI_OBJECTS = "[METADATA_URI]/1"
export const BASE_URI_RESOURCES = "[METADATA_URI]/2"

export const ONE: BigNumber = ethers.utils.parseUnits("1", 18)
export const ERC20_AMOUNT: string = ONE.mul(10000000).toString()
export const RESOURCE_ID = 1
export const RESOURCE_AMOUNT = 1000000000
