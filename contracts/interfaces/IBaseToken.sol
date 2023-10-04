// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface IBaseToken {
    error InvalidUri();

    // Emitted when the base URI is updated
    event UriUpdated(string value);

    /// @notice Sets up a new base URI string
    /**
     * @dev Only an address with the default admin role is authorised to call this function.
     * The new string cannot be empty.
     * Emits a UriUpdated event.
     */
    /// @param newUri New base URI string to set up
    function setUri(string memory newUri) external;

    /// @notice Mints tokens to the recipient's address.
    /**
     * @dev Only an address with the minter role is authorised to call this function.
     * Emits a TransferSingle event.
     */
    /// @param to Recipient's address
    /// @param id Token id to mint
    /// @param amount Token amount to mint
    /// @param data Additional data to pass on
    function mint(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external;

    /// @notice Mints a batch of tokens to the recipient's address.
    /**
     * @dev Only an address with the minter role is authorised to call this function.
     * Emits a TransferBatch event.
     */
    /// @param to Recipient's address
    /// @param ids Token ids to mint
    /// @param amounts Token amounts to mint
    /// @param data Additional data to pass on
    function mintBatch(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external;

    /// @notice Burns tokens from the source address.
    /**
     * @dev Only an address with the burner role is authorised to call this function.
     * Emits a TransferSingle event.
     */
    /// @param from Source address
    /// @param id Token id to burn
    /// @param amount Token amount to burn
    function burn(
        address from,
        uint256 id,
        uint256 amount
    ) external;

    /// @notice Burns a batch of tokens from the source address.
    /**
     * @dev Only an address with the burner role is authorised to call this function.
     * Emits a TransferBatch event.
     */
    /// @param from Source address
    /// @param ids Token ids to burn
    /// @param amounts Token amounts to burn
    function burnBatch(
        address from,
        uint256[] memory ids,
        uint256[] memory amounts
    ) external;
}
