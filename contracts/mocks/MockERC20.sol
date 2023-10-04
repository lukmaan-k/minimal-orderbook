//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    error InvalidLength();

    constructor(address[] memory accounts, uint256[] memory amounts) ERC20("RandomToken", "RTK") {
        if (accounts.length != amounts.length) revert InvalidLength();
        for (uint256 i = 0; i < accounts.length; i++) {
            _mint(accounts[i], amounts[i]);
        }
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
