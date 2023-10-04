import { ethers } from "hardhat"
import { Address, DeployResult } from "hardhat-deploy/dist/types"
import { HardhatRuntimeEnvironment } from "hardhat/types"
import { getBlockConfirmations } from "../helpers/helper-functions"
import { BASE_URI_RESOURCES, developmentChains, ERC20_AMOUNT } from "../helpers/constants"

module.exports = async (hre:HardhatRuntimeEnvironment) => {
    const { getNamedAccounts, deployments, network } = hre
    const { deploy } = deployments
    const { deployer, charlie } = await getNamedAccounts()

    const waitBlockConfirmations: number = getBlockConfirmations(developmentChains, network)
    const testUsers: Array<Address> = process.env.TEST_USERS?.split(",") || [deployer]
    const erc20Amounts: Array<string> = process.env.ERC20_AMOUNTS?.split(",") || Array(testUsers.length).fill(ERC20_AMOUNT)

    if (developmentChains.includes(network.name)) {

        const baseUriResources: string = process.env.BASE_URI_RESOURCES || BASE_URI_RESOURCES
        const waitBlockConfirmations: number = getBlockConfirmations(developmentChains, network)

        const deployArgsResources: [string] = [baseUriResources]
        const resourceDeployment: DeployResult = await deploy("Resource", {
            from              : deployer,
            args              : deployArgsResources,
            waitConfirmations : waitBlockConfirmations,
        })

        console.log(`\n###\n Resource deployed to address ${resourceDeployment.address}`)

        const argsNftWrapper: [string] = [(await ethers.getContract("Resource")).address]
        const nftWrapperDeployment: DeployResult = await deploy("MockNFTWrapper", {
            from              : deployer,
            args              : argsNftWrapper,
            waitConfirmations : waitBlockConfirmations,
        })

        console.log(`\n###\n MockNFTWrapper deployed to address ${nftWrapperDeployment.address}`)
    }

    if (developmentChains.includes(network.name) || !process.env.ERC20_LIST) {
        const argsERC20: [accounts: Array<Address>, amounts: Array<string>] = [testUsers, erc20Amounts]
        const erc20Deployment: DeployResult = await deploy("MockERC20", {
            from              : deployer,
            args              : argsERC20,
            waitConfirmations : waitBlockConfirmations,
        })

        console.log(`\n###\n MockERC20 deployed to address ${erc20Deployment.address}`)
    }
}

module.exports.tags = ["all", "mock"]
module.exports.dependencies = ["tokens"]
