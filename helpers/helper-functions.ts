import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { BigNumber, Contract, ContractTransaction,  Transaction } from "ethers"
import { getContractAddress, Interface, Result } from "ethers/lib/utils"
import { run, ethers } from "hardhat"
import { HardhatRuntimeEnvironment, Network } from "hardhat/types"
import { Resource as ResourceType, MockERC20 as MockERC20Type, Orderbook as OrderbookType } from "../types"

import { VERIFICATION_BLOCK_CONFIRMATIONS, VERIFICATION_BLOCK_CONFIRMATIONS_DEV, RESOURCE_ID, RESOURCE_AMOUNT } from "../helpers/constants"

export const getCurrentTimestamp =  ():number => {
    return Math.round(new Date().getTime() / 1000)
}

export const unlockAddress = async (hre:HardhatRuntimeEnvironment, address: string): Promise<SignerWithAddress> => {
    await hre.network.provider.request({
        method : "hardhat_impersonateAccount",
        params : [address],
    })
    return await ethers.getSigner(address)
}

export const setupUsers = async <ContractTypeArray extends {[contractName: string] : Contract}>(
    addresses: string[],
    contracts: ContractTypeArray
): Promise<({address: string, signer: SignerWithAddress} & ContractTypeArray)[]> => {
    const users: ({address: string, signer: SignerWithAddress} & ContractTypeArray)[] = []
    for (const address of addresses) {
        users.push(await setupUser(address, contracts))
    }
    return users
}

export const setupUser = async <ContractTypeArray extends {[contractName: string]: Contract}>(
    address: string,
    contracts: ContractTypeArray
): Promise<{address: string, signer: SignerWithAddress} & ContractTypeArray> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user: any = { address: address, signer: await ethers.getSigner(address) }
    for (const key of Object.keys(contracts)) {
        user[key] = contracts[key].connect(await ethers.getSigner(address))
    }
    return user as {address: string, signer: SignerWithAddress} & ContractTypeArray
}

export const mineBlocks = async (hre:HardhatRuntimeEnvironment, blocksToMine:number, blockTime = 13) => {
    await hre.network.provider.send("hardhat_mine", ["0x"+blocksToMine.toString(16), "0x"+blockTime.toString(16)])
}

export const setNetworkTime = async (hre:HardhatRuntimeEnvironment, secondsToForward:number) => {
    await hre.network.provider.send("evm_setNextBlockTimestamp", [secondsToForward])
    await hre.network.provider.send("evm_mine")
}

export const getFutureContractAddress = async (signer:SignerWithAddress, skipCount?:number): Promise<string> => {
    const txCount = await signer.getTransactionCount()

    const futureAddress = getContractAddress({
        from  : await signer.getAddress(),
        nonce : skipCount ? txCount + skipCount : txCount,
    })
    return futureAddress
}

export const getEventEmitted = async (tx:ContractTransaction, contractInterface:Interface, eventString:string):Promise<{ eventFound: boolean; args: Result }>=> {
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash)

    const arr = receipt.logs.map((log) => {
        const data = log.data
        const topics = log.topics
        const temp = contractInterface.parseLog({ data, topics })
        return temp
    }).filter((log) => {
        return eventString === log.name
    })

    if (arr.length === 1) {
        return { eventFound: true, args: arr[0].args }
    } else if (arr.length === 0) {
        return { eventFound: false, args: [] }
    }

    const args = arr.map((elem) => {
        return elem.args
    })

    return { eventFound: true, args: args }
}

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export const verify = async (contractAddress: string, args: any[]) => {
    console.log("Verifying contract...")
    try {
        await run("verify:verify", {
            address              : contractAddress,
            constructorArguments : args,
        })
    // eslint-disable-next-line  @typescript-eslint/no-explicit-any
    } catch (e: any) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Already verified!")
        } else {
            console.log(e)
        }
    }
}

// eslint-disable-next-line  @typescript-eslint/no-explicit-any
export const deployContract = async <ContractType extends Contract> (contractName: string, args?: any[]): Promise<ContractType> => {
    const contractFactory = await ethers.getContractFactory(contractName)

    let contract
    if (args === undefined) {
        contract = (await contractFactory.deploy()) as ContractType
    } else {
        contract = (await contractFactory.deploy(...args)) as ContractType
    }

    await contract.deployed()
    return contract
}

type txObject = {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key:string] : any
}

export const sendETHTransaction = async (signer:SignerWithAddress, txData:txObject): Promise<Transaction> => {
    const tx = await signer.sendTransaction(txData)
    return tx

}

export const sleep = (timeInMs: number) => {
    console.log(`Sleeping for ${timeInMs}`)
    return new Promise((resolve) => setTimeout(resolve, timeInMs))
}

export const getInterfaceID = (contractInterface: Interface) => {
    let interfaceID: BigNumber = ethers.constants.Zero
    const functions: string[] = Object.keys(contractInterface.functions)
    for (let i=0; i< functions.length; i++) {
        interfaceID = interfaceID.xor(contractInterface.getSighash(functions[i]))
    }

    return interfaceID
}

export const getInterfaceIDArray = (contractInterface: Array<string>) => {
    let interfaceID: BigNumber = ethers.constants.Zero
    for (let i=0; i< contractInterface.length; i++) {
        interfaceID = interfaceID.xor(ethers.utils.keccak256(Buffer.from(contractInterface[i])).substring(0, 10))
    }

    return interfaceID
}

export const getBlockConfirmations = (developmentChains: Array<string>, network: Network): number => {
    return developmentChains.includes(network.name) ? VERIFICATION_BLOCK_CONFIRMATIONS_DEV : VERIFICATION_BLOCK_CONFIRMATIONS
}

type TestAccount = {
    address: string,
    signer: SignerWithAddress
} & {
    orderbook: OrderbookType,
    mockERC20: MockERC20Type,
    resource: ResourceType
}


// Transfers resources and mockERC20 tokens to orderbook users and gives approval to orderbook
export const transferTokensToOrderbookUsers = async (deployer: TestAccount, users: TestAccount[]): Promise<void> => {
    const tx:ContractTransaction = await deployer.resource.mint(deployer.address, RESOURCE_ID, RESOURCE_AMOUNT, [])
    await tx.wait()
    const individualNFTAmount = Math.floor(RESOURCE_AMOUNT / (users.length))
    const userErc20Amount:BigNumber = (await deployer.mockERC20.totalSupply()).div(users.length)

    for (const user of users) {
        const tx1:ContractTransaction = await user.mockERC20.approve(user.orderbook.address, ethers.constants.MaxUint256)
        await tx1.wait()
        const tx2:ContractTransaction = await user.resource.setApprovalForAll(user.orderbook.address, true)
        await tx2.wait()
        const tx3:ContractTransaction = await deployer.mockERC20.transfer(user.address, userErc20Amount)
        await tx3.wait()
        const tx4:ContractTransaction = await deployer.resource.safeTransferFrom(deployer.address, user.address, RESOURCE_ID, individualNFTAmount, [])
        await tx4.wait()
    }
}
