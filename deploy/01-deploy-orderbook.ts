import { ethers } from "hardhat"
import { Address } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { developmentChains, RESOURCE_ID } from "../helpers/constants"
import { getBlockConfirmations } from "../helpers/helper-functions"
import { Resource as ResourceType } from "../types"

module.exports = async (hre:HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    const waitBlockConfirmations: number = getBlockConfirmations(developmentChains, network)

    let erc20List: Array<Address> = []
    if (developmentChains.includes(network.name) || !process.env.ERC20_LIST) {
        const erc20Address: Address = (await ethers.getContract("MockERC20")).address
        erc20List = [erc20Address]
    } else {
        erc20List = process.env.ERC20_LIST.split(",")
    }

    const resourceIdList: Array<number> = process.env.RESOURCE_ID_LIST ? process.env.RESOURCE_ID_LIST.split(",").map((x) => parseInt(x)) : [RESOURCE_ID]
    const resource : ResourceType = await ethers.getContract("Resource")
    for (const token of erc20List) {
        for (const resourceId of resourceIdList) {
            const args: [Address, Address, number] = [token, resource.address, resourceId]
            const orderbookDeployment = await deploy("Orderbook", {
                from              : deployer,
                args              : args,
                waitConfirmations : waitBlockConfirmations,
            })

            console.log(`\n###\n Orderbook for token ${token} and resource with ID ${resourceId} deployed to:\t ${orderbookDeployment.address}\n`)
        }
    }
}

module.exports.tags = ["all", "orderbook"]
module.exports.dependencies = ["tokens", "mock"]
