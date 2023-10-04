// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;


interface IOrderbook {
    error InvalidCancellationParams();
    error InvalidPrevReference();
    error NotOrderOwner();
    error InvalidOrderUpdate();
    error WrongOrderbookSide();
    error InvalidOrderParams();
    error NonExistingOrder();
    error InvalidStartingLocation();

    struct OrderNode {
        uint128 amountOfNFT;
        uint128 price;
        address owner;
        uint96 nextOrder;
    }

    event OrderCreated(uint256 orderID, uint128 price, uint128 amount, address user, bool isBid);
    event OrderCancelled(uint256 orderID);
    event OrderPartiallyFilled(uint256 orderID, uint128 amount);
    event OrderFilled(uint256 orderID);
    event OrderModified(uint256 orderID, uint128 newAmount);

    /**
     * @notice places a bid order in the orderbook for a desired amount of NFTs at a desired price
     * @param price the desired price of each NFT to be purchased, denominated in 'token'
     * @param amountOfNFT the number of NFTs to purchase
     * @param existingLevel the insert location for the new order
     * 
     * @dev The bid order is first matched against any asks it crosses (if any). Only the remaining
     * unfilled amount of the order is then placed in the orderbook
     */
    function insertBid(
        uint128 price,
        uint128 amountOfNFT,
        uint256 existingLevel
    ) external;

    /**
     * @notice places an ask order in the orderbook for a desired amount of NFTs at a desired price
     * @param price the desired price of each NFT to be sold, denominated in 'token'
     * @param amountOfNFT the number of NFTs to sell
     * @param existingLevel the insert location for the new order
     * 
     * @dev The ask order is first matched against any bids it crosses (if any). Only the remaining
     * unfilled amount of the order is then placed in the orderbook
     */
    function insertAsk(
        uint128 price,
        uint128 amountOfNFT,
        uint256 existingLevel
    ) external;

    /**
     * @notice removes a bid order from the orderbook
     * @param prevOrderID the orderID 1 position immediately before the order to be removed
     * @param orderID the order ID to remove
     * 
     * @dev The previous order ID is needed since its 'next' pointer needs to be updated. Since there is
     * no way to determine this on-chain, it needs to be provided
     */
    function cancelBid(uint256 prevOrderID, uint256 orderID) external;

    /**
     * @notice removes an ask order from the orderbook
     * @param prevOrderID the orderID 1 position immediately before the order to be removed
     * @param orderID the order ID to remove
     * 
     * @dev The previous order ID is needed since its 'next' pointer needs to be updated. Since there is
     * no way to determine this on-chain, it needs to be provided
     */
    function cancelAsk(uint256 prevOrderID, uint256 orderID) external;

    /**
     * @notice modifies the amount for an existing bid order
     * @param orderID the orderID to change the amount for
     * @param newAmount the desired new amount
     */
    function modifyBidAmount(uint256 orderID, uint128 newAmount) external;

    /**
     * @notice Modifies the amount for an existing ask order
     * @param orderID the orderID to change the amount for
     * @param newAmount the desired new amount
     */
    function modifyAskAmount(uint256 orderID, uint128 newAmount) external;

    /**
     * @notice Claims any token and NFT proceeds from the user's orders
     * 
     * @dev Sale proceeds are not directly sent to the market makers, as this is very gas costly and opens the door
     * to easy denial-of-service
     */
    function claimBalances() external;
}
