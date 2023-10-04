import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "@nomiclabs/hardhat-ethers"
import "hardhat-deploy"
import "hardhat-contract-sizer"

import dotenv from "dotenv"
dotenv.config()

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0000000000000000000000000000000000000000000000000000000000000000"
const PRIVATE_KEY_2 =  process.env.PRIVATE_KEY_P || "0000000000000000000000000000000000000000000000000000000000000000"
const PRIVATE_KEY_3 =  process.env.PRIVATE_KEY_Hardhat_0 || "0000000000000000000000000000000000000000000000000000000000000000"
const POLYGON_MUMBAI_ETHERSCAN_KEY = process.env.POLYGON_MUMBAI_ETHERSCAN_API_KEY || "0000000000000000000000000000000000000000000000000000000000000000"


const config: HardhatUserConfig = {
    defaultNetwork : "hardhat",
    gasReporter    : {
        enabled       : true,
        coinmarketcap : process.env.COINMARKETCAP_KEY,
    },
    typechain: {
        outDir: "types",
    },
    solidity: {
        compilers: [{
            version  : "0.8.16",
            settings : {
                optimizer: {
                    enabled : true,
                    runs    : 1000,
                },
            },
        }],
    },
    etherscan: {
        apiKey: {
            polygonMumbai: POLYGON_MUMBAI_ETHERSCAN_KEY,
        },
    },
    networks: {
        /**
        hardhat: {
            forking: {
                url         : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_KEY}`, // Fork live Ethereum mainnet when testing locally
                blockNumber : blockNumberToPin, // We pin to a block so we don't keep requesting Alchemy for the chain's new state so tests run faster. Update this frequently
            },
        },
        localhost: {
            forking: {
                url         : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_KEY}`, // As above
                blockNumber : blockNumberToPin, // As above
            },
        },
        */
        goerli: {
            url             : `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_GOERLI_KEY}`,
            accounts        : [`${PRIVATE_KEY}`],
            saveDeployments : true,
        },
        polygonMumbai: {
            url             : `https://polygon-mumbai.g.alchemy.com/v2/${process.env.ALCHEMY_MUMBAI_KEY}`,
            chainId         : 80001,
            accounts        : [`${PRIVATE_KEY}`],
            saveDeployments : true,
        },
        mainnet: {
            url             : `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_KEY}`,
            accounts        : [`${PRIVATE_KEY}`],
            saveDeployments : true,
        },

        polygonEdge: {
            url             : `${process.env.POLYGON_EDGE_URL}`,
            chainId         : 6476,
            accounts        : [`${PRIVATE_KEY}`, `${PRIVATE_KEY_2}`, `${PRIVATE_KEY_3}`],
            saveDeployments : true,
        },
        hardhat: {
            chainId: 1337,
        },
    },
    namedAccounts: {
        deployer: {
            default : 0,
            80001   : 0,
            6476    : 0,
        },
        alice: {
            default : 1,
            80001   : 1,
            6476    : 1,
        },
        bob: {
            default : 2,
            80001   : 2,
            6476    : 2,
        },
        charlie: {
            default: 3,
        },
        dave: {
            default: 4,
        },
        erin: {
            default: 5,
        },
    },
    mocha: {
        timeout: 100000000,
    },
}

export default config
