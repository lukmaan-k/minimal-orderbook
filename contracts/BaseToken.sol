// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./interfaces/IBaseToken.sol";

contract BaseToken is IBaseToken, AccessControl, ERC1155 {
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function setUri(string memory newUri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bytes(newUri).length == 0) revert InvalidUri();
        _setURI(newUri);
        emit UriUpdated(newUri);
    }

    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) {
        _mint(to, id, amount, data);
    }

    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyRole(MINTER_ROLE) {
        _mintBatch(to, ids, amounts, data);
    }

    function burn(
        address from,
        uint256 id,
        uint256 amount
    ) external onlyRole(BURNER_ROLE) {
        _burn(from, id, amount);
    }

    function burnBatch(
        address from,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external onlyRole(BURNER_ROLE) {
        _burnBatch(from, ids, amounts);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl, ERC1155) returns (bool) {
        return interfaceId == type(IBaseToken).interfaceId || super.supportsInterface(interfaceId);
    }
}
