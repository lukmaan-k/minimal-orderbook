# Project Ganache
This repository contains the implementations for Project Ganache

# Quickstart

1. Clone repo with `git clone this_repo_url`
2. `cd` into repo and install dependencies with `yarn install`
3. Run tests with `npx hardhat test` (or `hh test` if you have hardhat shorthand installed)

# Getting Started

## Visual Studio Code Extensions
- Install the "Solidity + Hardhat" Extension

## Install Node.js & Yarn 

### Windows && macOS

Install Node.js: https://nodejs.org/en/

If you’re not sure whether you already have it, check for its version in terminal by running:

`node -v` (recommended to update to 16.15.1 LTS)

### Linux / Ubuntu / Windows Subsystem for Linux (WSL) 

1. Install nvm 

```curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash```

2. Install node 

```nvm install --lts```

3. Install yarn 

```corepack enable```

## Get dependencies (using Yarn)

Upon installation, you should be able to run `yarn install` to pull all the dependencies of the project.

## Setup keys and acquire test Ether

Standard best practice is to store sensitive in a separate `.env` file. This file should never leave your local machine, and is ignored when `git push`-ing to remote repositories. To do this, make a blank `.env` file in the root directory of the project, see the `.env.example`. The following steps outline which keys we need for this repo.

1. Private Key:

    Open Metamask and click the 3 dotted icon in the top right > Account details > Export private key > copy the key. Save the key in your .env file in the following format:

    `PRIVATE_KEY=“YourKeyHere”` (recommended to keep quotes)

    Remember that leaking this private key to anyone else WILL result in the loss of ALL funds from this address. It is highly recommended to create a new account used only for testing

2. Alchemy Keys:

    Make an account with Alchemy: https://www.alchemy.com/

    Signup with your Improbable Google account and choose `Ethereum + L2` when prompted for which ecosystem. Once in your dashboard, click `+ Create App` button somewhere in top right of window and choose `Ethereum` for chain, and `Ethereum Mainnet` for network. Repeat for `Goerli`, giving you 2 apps in your dashboard. Two new entries should pop up under your Apps and copy just the Api Key (without the ‘https://…v2/' base URL). Save this in the `.env` file like so:

    `ALCHEMY_MAINNET_KEY="YourKeyHere"`

    `ALCHEMY_GOERLI_KEY="YourKeyHere"`

Finally, get some test Ether for Goerli from here: https://goerlifaucet.com/. (you will need to sign in with your Alchemy account)

## Compiling and runnings tests

### Local (forked mainnet) tests

Go back to your Terminal and stay in the root directory of the project for the following commands:

`yarn test` runs the unit tests on your local machine on a fork of ethereum mainnet. This combines `hh updateBlockNumber`, `hh compile`, and `hh test` sequentially, where each individual command can be run individually:

`hh updateBlockNumber` is a small custom HardHat Task which fetches the latest Ethereum block if the one stored in the config file is more than 3 days old. We use this to pin to a specific block when forking mainnet to our local machine during testing

`hh compile` compiles the smart contracts and generates typescript types. This needs to be run before `hh test` separately the first time as the `./types` folder is part of `./.gitignore`, but is used by `./hardhat.config.ts`

`hh test` runs the unit tests found in the `./test` folder. See HardHat help pages for optional arguments & flags

### Staging tests on Goerli

[Update this section with appropriate commands when staging tests are written]

# Static Analysis Tools
We make use of 3 static analysis tools to scan for common security vulnerabilities in smart contracts. The following setup instructions are for OS X (tested on M1 Max chip unless otherwise stated).

## Prerequisites

The static analysis tools have a few common prerequisites. These are:

1. homebrew, a package manager for OS X. Installation instructions can be found here: https://brew.sh/

Homebrew can now be used to install the various packages used by the static analysis tools:

2. Python3.8. You can check your current version with `python3 --version` in your terminal. If you didn't have homebrew installed before, then your python3 is the one distributed with OS X. This project makes use of homebrew, so we also use homebrew's python3 for consistency: 
3. Install python3 with homebrew: `brew install python3`
4. Update symlinks with `brew link python3`. This will set the default `python3` on your machine to be the homebrew one.
5. Steps 3 and 4 will likely install a newer version of python3. To install python3.8, run `brew install python@3.8`
6. Make a note of where this python version is installed. Following this setup will likely place it in `/opt/homebrew/opt/python@3.8/bin`. We will need this location later.

Install the required packages:

7. `brew tap ethereum/ethereum`
8. `brew install leveldb`
9. `brew install solidity`

The static analysis tools recommend that each is installed in a separate virtual environment. This is to prevent incompatibility issues arising from the use of different versions of the same package by different tools. Install `virtualenv` with:

10. `pip3 install virtualenv`

Each of the 3 static analysis tools will live in a different virtual environment. Typically all 3 environements can be inside the project's root directory. However, since these tools will be used in other smart contract projects, we can place them anywhere convenient outside of this project. Once you've decided your tools directory, `cd` into it and create 3 virtual environments:

11. `python3 -m venv env-slither`
12. `python3 -m venv env-mythril`
13. `virtualenv -p=/opt/homebrew/opt/python@3.8/bin/python3 env-manticore` Note that we are using the location from step 6 aboven (with `/python3` added to the end of the path)

We're now ready to install the static analysis tools

## Slither
### Installation

1. From inside the directory where the virtual environments were made, activate the environment with: `source env-slither/bin/activate`
2. Install with `pip3 install slither-analyzer`

### Usage
Change to the root directory of this hardhat project and run:

`slither .`

This will check all contracts in the `./contracts` directory against slither's database of vulnerabilities. More usage info can be found at: https://github.com/crytic/slither

## Mythril
### Installation

1. If you're in a virtual environment already that is not mythril's, leave with `deactivate`
2. As before, from inside the directory where the virtual environments were made, activate the environment with: `source env-mythril/bin/activate`
3. Install with `pip3 install mythril`

If this doesn't work, try installing the nightly build of Rust with:

`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`

Reload the terminal and run the following:

`rustup default nightly`

Now repeat step 3 

### Usage

Change to the root directory of this hardhat project and run:

`myth analyze contracts/**/*.sol --solc-json helpers/static-analysis-remappings.json`

This will check all contracts for vulnerabilities in mythril's database. However, it's likely that this will not finish running for some time (~10 minutes). The reason for this is mythril uses symbolic execution, meaning that it tries to reach different contract states by varying the inputs to function call. Varying one input while keeping others constant can lead to different contract states, which is the equivalent of a different 'path' in the analysis. This branching behaviour can lead to many branches, and coupled with large recursion depths (default is a max recursion depth of 128), this will extend analysis times. We can visualise the branches by adding the `--graph` flag, though this requires single contracts to be analysed at a time:

`myth analyze contracts/MockReceiverSpender.sol --solc-json helpers/static-analysis-remappings.json --graph graphOut.html` (This takes 15 minutes to run on an Apple M1 Max)

In this case, any warnings can be ignored for MockReceiverSpender.sol as this is only used as a target during testing and not part of any production code.

Some helpful flags for `myth` are:
1. `--max-depth`, accepts a `uint` argument. Default = 128
2. `--execution-timeout`, accepts a `uint` argument (units in seconds). Default = 86400

More usage info can be found at: https://github.com/ConsenSys/mythril

Also see definition of `create_analyzer_parser()` at https://mythril-classic.readthedocs.io/en/master/_modules/mythril/interfaces/cli.html for additional option flags

## Manticore
### Installation
Manticore is only supported on Linux. The following was tested on Ubuntu 20.04 (using Windows Subsystem for Linux, laptop 11th gen i9 cpu)

1. If you're in a virtual environment already that is not mythril's, leave with `deactivate`
2. As before, from inside the directory where the virtual environments were made, activate the environment with: `source env-manticore/bin/activate`
3. Install with `pip3 install "manticore[native]"`

Some additional steps are required to use the correct version of protobuf (or the incorrect type formats will be generated). First try downgrading protobuf to the version manticore wants with:

4. `pip3 install protobuf==3.20.*`

If this does not work, use the default protocol buffer implementation (though as the error message would suggest, this can degrade performance as its using pure python parsing):

5. `export PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION=python`

### Usage

Like mythril, manticore also uses symbolic execution, so expect extended execution times. Analyze a contract by changing to the root directory of this hardhat project and run:

`manticore contracts/ContractName.sol --solc-remaps @=node_modules/@ --contract ContractName`

A couple of notes to keep in mind with the above command:
1. The remappings do not take a json file as an argument like mythril, and the remappings need to be directly passed to the --solc-remaps flag as an argument
2. Manticore also requires specifying which contract to analyse (as there are several contracts in a single file due to the imports). This will usually be the lowest level contract in the inheritance tree

More usage info can be found at: https://github.com/trailofbits/manticore

## Workflow when making PRs
The above 3 tools will run automatically on every pull request to `main`. Unlike the unit tests, these github action workflows are not a requirement for merging. It is up to the contributor opening the PR to check if these tools have run successfully, and whether any changes need to be made. **This needs to be checked manually even if the runs show a green tick.** This is because any issues found by the tools do not throw an error, and only print to the std.out. Issues can be checked with the following:

### Slither

In the details page of the slither github action run, check the `Run crytic/slither-action@v0.1.1` section. Check the final line of the output for:

`. analyzed (X contracts with 59 detectors), 0 result(s) found`, where X = the number of contracts checked

### Mythril

In the details page of the mythril github action run, check the `Run mythril analysis` section. Check that the output shows:

`The analysis was completed successfully. No issues were detected.`

### Manticore

In the details page of the mythril github action run, check the `Run manticore analysis` section. Check that the output only shows `INFO`-severity logs.

# Linting & Formatting

For setup instructions, please see the wiki link below.

## Usage

`yarn lint` will highlight all rule violations for both typescript and solidity, but not automatically fix any issues.

The `eslint` package supports comprehensive auto-fixes, but ethlint does not. As such, the following workflow is recommended:

1. Right-click anywhere in a solidity file and click `Format Document`. This will use `prettier` to apply most of the `ethlint` rules (but violate some)
2. Run `yarn lint:fix` in terminal to apply all typescript and solidity fixes (wherever it can)
3. Proceed to manually fix ethlint’s rules, as well as moving input arguments to functions back to a single line. The latter is the only formatting choice the team currently prescribes which does not have a built-in rule checker in any formatting/linting tool.

# Tasks

Tasks are used to automate some actions, such as interacting with contracts. You can find all custom tasks in the `tasks` folder.

If you want to add new tasks and create a separate file for this, import it into the `tasks/index.ts` file.

## Usage

To view all the tasks available in the project, use `yarn hardhat`.

To find out details about running a specific task, use `yarn hardhat help <TASK>`.

To run a task, use `yarn hardhat [GLOBAL OPTIONS] <TASK> [TASK OPTIONS]`.

If you want to run a task on a local node, use `yarn hardhat --network localhost [OTHER GLOBAL OPTIONS] <TASK> [TASK OPTIONS]`

If you want to run tasks for smart contracts other than the ones in your `deployments` folder, add the corresponding variables to your `.env` file (see the `variables to run tasks` section in `.env.example`).
