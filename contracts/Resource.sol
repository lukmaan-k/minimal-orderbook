// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./BaseToken.sol";

/// @title A smart contract for resources
/// @dev Supports token minting and burning.
contract Resource is BaseToken {
    constructor(string memory uri_) BaseToken(uri_) {}
}
