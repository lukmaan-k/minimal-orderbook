// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

// Contract only needed for wrapping some convient test functions in hardhat

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";


contract MockNFTWrapper {

    address underlyingNFTAddress;

    constructor(address underlyingNFTAddress_) {
        underlyingNFTAddress = underlyingNFTAddress_;
    }

    function balanceOf(address account) external view returns(uint256) {
        return IERC1155(underlyingNFTAddress).balanceOf(account, 1);
    }
}