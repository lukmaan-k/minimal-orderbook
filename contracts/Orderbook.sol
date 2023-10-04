// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./interfaces/IOrderbook.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";


contract Orderbook is IOrderbook, ERC1155Holder {
    using SafeERC20 for IERC20;
    
    uint96 public bidsHead; // orderID of highest priced bid
    uint96 public asksHead; // orderID of lowest priced ask
    uint96 public orderIDCount = 1; // Initialise with 1. EVM initialises all storage with 0, making an orderID of 0 ambiguous
    
    mapping(uint256 => OrderNode) public bids; // Singly linked list containing all bids. Ordered in price-time priority (descending, FIFO)
    mapping(uint256 => OrderNode) public asks; // Singly linked list containing all asks. Ordered in price-time priority (ascending, FIFO)

    IERC20 public immutable token; // The quote asset in this trading pair
    IERC1155 public immutable nft;  // The base asset in this trading pair
    uint256 public immutable nftTokenId; // tokenID in the ERC1155 collection

    uint256 constant TOKEN_INDEX = 1;
    uint256 constant NFT_INDEX = 2;
    uint256 constant TRAVERSAL_TOLERANCE = 4;

    // Proceeds from orders matching are not directly sent to owner creators, but are instead recorded for claim for gas efficiency
    mapping(address => mapping(uint256 => uint256)) public balances;

    constructor(IERC20 token_, IERC1155 nft_, uint256 nftTokenId_) {
        token = token_;
        nft = nft_;
        nftTokenId = nftTokenId_;

        // Set the 'anchor' on the bid side to the max price, as 'order' 0 will always be at start of both bids and asks lists.
        // The anchor will point to the first real order in the list. Since the bid side is ordered in a descending manner, the anchor needs to be set
        // to the highest price possible. Note that that is not necessary for the asks side, since 0 is already the lowest price possible
        bids[0].price = type(uint128).max;
    }

    modifier onlyValidOrders(uint128 price, uint128 amount) {
        if (amount > 0 && price > 0) {
            _;
        } else {
            revert InvalidOrderParams();
        }
    }

    modifier onlyOrderOwner(
        uint256 orderID,
        mapping(uint256=>OrderNode) storage orderbook
    ) {
        if (msg.sender == orderbook[orderID].owner) {
            _;
        } else {
            revert NotOrderOwner();
        }
    }

    /**
     * @notice Places a bid order in the orderbook for a desired amount of NFTs at a desired price
     * @param price The desired price of each NFT to be purchased, denominated in 'token'
     * @param amountOfNFT The number of NFTs to purchase
     * @param existingLevel The insert location for the new order
     * 
     * @dev The bid order is first matched against any asks it crosses (if any). Only the remaining
     * unfilled amount of the order is then placed in the orderbook
     */
    function insertBid(
        uint128 price,
        uint128 amountOfNFT,
        uint256 existingLevel
    ) external onlyValidOrders(price, amountOfNFT) {

        // Try filling from existing asks that are priced lower than user's desired buying price
        uint128 amountOfNftToSend;
        uint256 tokenAmountSpent;
        (amountOfNFT, amountOfNftToSend, tokenAmountSpent) = _matchAgainstAsks(amountOfNFT, price);

        // Insert bid for remaining amount
        uint256 tokenAmountInOrder = 0;
        if (amountOfNFT > 0) {
            tokenAmountInOrder = amountOfNFT * price;
            _insertBid(amountOfNFT, price, existingLevel);
        }
        
        // Transfer quote asset (token) from user to this contract first
        token.safeTransferFrom(msg.sender, address(this), tokenAmountSpent + tokenAmountInOrder);

        // Send all NFTs bought by user, if any
        if (amountOfNftToSend > 0) {
            nft.safeTransferFrom(address(this), msg.sender, nftTokenId, amountOfNftToSend, "");
        }
    }

    /**
     * @notice Places an ask order in the orderbook for a desired amount of NFTs at a desired price
     * @param price The desired price of each NFT to be sold, denominated in 'token'
     * @param amountOfNFT The number of NFTs to sell
     * @param existingLevel The insert location for the new order
     * 
     * @dev The ask order is first matched against any bids it crosses (if any). Only the remaining
     * unfilled amount of the order is then placed in the orderbook
     */
    function insertAsk(
        uint128 price,
        uint128 amountOfNFT,
        uint256 existingLevel
    ) external onlyValidOrders(price, amountOfNFT) {
        // Transfer base asset (nft) from user to this contract first
        nft.safeTransferFrom(msg.sender, address(this), nftTokenId, amountOfNFT, "");

        // Try filling from existing bids that are price higher than user's desired selling price
        uint128 amountOfTokensToSend;
        (amountOfNFT, amountOfTokensToSend) = _matchAgainstBids(amountOfNFT, price);

        // Insert Ask
        if (amountOfNFT > 0) {
            _insertAsk(amountOfNFT, price, existingLevel);
        }

        // Send all tokens from sale proceeds to user, if any
        if (amountOfTokensToSend > 0) {
            token.safeTransfer(msg.sender, amountOfTokensToSend);
        }

    }

    /**
     * @notice removes a bid order from the orderbook
     * @param prevOrderID the orderID 1 position immediately before the order to be removed
     * @param orderID the order ID to remove
     * 
     * @dev The previous order ID is needed since its 'next' pointer needs to be updated. Since there is
     * no way to determine this on-chain, it needs to be provided
     */    
    function cancelBid(uint256 prevOrderID, uint256 orderID) external onlyOrderOwner(orderID, bids) {
        // Do some limited traversal, as starting location may be slightly off due to transactions included between off-chain calculation and current execution context
        prevOrderID = _confirmPrevOrderID(prevOrderID, orderID, bids);

        // Update head if the order being deleted is current head
        if (bidsHead == orderID) {
            bidsHead = bids[orderID].nextOrder;
        }
        // Save amount of tokens to send
        uint256 amountToSend = bids[orderID].amountOfNFT * bids[orderID].price;

        // Delete the order
        _removeOrder(prevOrderID, orderID, bids);

        emit OrderCancelled(orderID);

        // Send tokens back
        token.safeTransfer(msg.sender, amountToSend);
    }

    /**
     * @notice Removes an ask order from the orderbook
     * @param prevOrderID The orderID 1 position immediately before the order to be removed
     * @param orderID The order ID to remove
     * 
     * @dev The previous order ID is needed since its 'next' pointer needs to be updated. Since there is
     * no way to determine this on-chain, it needs to be provided
     */
    function cancelAsk(uint256 prevOrderID, uint256 orderID) external onlyOrderOwner(orderID, asks) {
        // Do some limited traversal, as starting location may be slightly off due to transactions included between off-chain calculation and current execution context
        prevOrderID = _confirmPrevOrderID(prevOrderID, orderID, asks);

        // Update head if the order being deleted is current head
        if (asksHead == orderID) {
            asksHead = asks[orderID].nextOrder;
        }
        // Save amount of tokens to send
        uint256 amountToSend = asks[orderID].amountOfNFT;

        // Delete the order
        _removeOrder(prevOrderID, orderID, asks);

        emit OrderCancelled(orderID);

        // Send nft back
        nft.safeTransferFrom(address(this), msg.sender, nftTokenId, amountToSend, "");
    }

    /**
     * @notice Modifies the amount for an existing bid order
     * @param orderID The orderID to change the amount for
     * @param newAmount The desired new amount
     */
    function modifyBidAmount(uint256 orderID, uint128 newAmount) external onlyOrderOwner(orderID, bids) {
        bool toSend = false;
        uint256 difference = 0;
        uint128 currentAmount = bids[orderID].amountOfNFT;
        uint128 price = bids[orderID].price;

        if (currentAmount > newAmount) {
            toSend = true;
            difference = (currentAmount - newAmount) * price;
        } else if(currentAmount < newAmount) {
            toSend = false;
            difference =  (newAmount - currentAmount) * price;
        } else {
            revert InvalidOrderUpdate();
        }

        bids[orderID].amountOfNFT = newAmount;

        emit OrderModified(orderID, newAmount);

        if (toSend) {
            token.safeTransfer(msg.sender, difference);
        } else {
            token.safeTransferFrom(msg.sender, address(this), difference);
        }
    }

    /**
     * @notice Modifies the amount for an existing ask order
     * @param orderID The orderID to change the amount for
     * @param newAmount The desired new amount
     */
    function modifyAskAmount(uint256 orderID, uint128 newAmount) external onlyOrderOwner(orderID, asks) {
        bool toSend = false;
        uint256 difference = 0;
        uint128 currentAmount = asks[orderID].amountOfNFT;
        if (currentAmount > newAmount) {
            toSend = true;
            difference = currentAmount - newAmount;
        } else if (currentAmount < newAmount) {
            toSend = false;
            difference = newAmount - currentAmount;
        } else {
            revert InvalidOrderUpdate();
        }

        asks[orderID].amountOfNFT = newAmount;
        emit OrderModified(orderID, newAmount);
        if (toSend) {
            nft.safeTransferFrom(address(this), msg.sender, nftTokenId, difference, "");
        } else {
            nft.safeTransferFrom(msg.sender, address(this), nftTokenId, difference, "");
        }
    }

    /**
     * @notice Claims any token and NFT proceeds from the user's orders
     * 
     * @dev Sale proceeds are not directly sent to the market makers, as this is very gas costly and opens the door
     * to easy denial-of-service
     */
    function claimBalances() external {
        uint256 tokenBalance = balances[msg.sender][TOKEN_INDEX];
        uint256 nftBalance = balances[msg.sender][NFT_INDEX];

        balances[msg.sender][TOKEN_INDEX] = 0;
        balances[msg.sender][NFT_INDEX] = 0;

        if (tokenBalance > 0) {
            token.safeTransfer(msg.sender, tokenBalance);
        }

        if (nftBalance > 0) {
            nft.safeTransferFrom(address(this), msg.sender, nftTokenId, nftBalance, "");
        }
    }

    /**
     * @notice Internal function to match incoming ask orders with existing bids in the orderbook
     * @param nftAmountToSell Amount of NFTs the incoming ask order wishes to sell
     * @param price The minimum price the incoming ask order is willing to sell at
     */
    function _matchAgainstBids(uint128 nftAmountToSell, uint128 price) internal returns(uint128,uint128) {
        uint128 tokenAmountToSend = 0;
        uint96 matchedOrderID = bidsHead;
        OrderNode storage matchedOrder = bids[matchedOrderID];
        uint128 matchedOrderPrice = matchedOrder.price;
        uint128 matchedOrderAmount;

        while
        (
            matchedOrderPrice >= price && // Continue matching if buying price in orders is >= seller's price
            nftAmountToSell > 0 && // Continue matching if there is any outstanding amount
            matchedOrderID != 0 // An order ID of zero indicates the orderbook is completely empty
        ) {
            matchedOrderAmount = matchedOrder.amountOfNFT;
            if (matchedOrderAmount > nftAmountToSell) { // When a single bid order can fulfill entire request of seller
                // Update order amount left
                matchedOrder.amountOfNFT -= nftAmountToSell;

                // Record token amount to send to seller
                tokenAmountToSend += nftAmountToSell * matchedOrderPrice;

                // Update order owner claimable balance
                balances[matchedOrder.owner][NFT_INDEX] += nftAmountToSell;

                // Emit
                emit OrderPartiallyFilled(matchedOrderID, matchedOrderAmount - nftAmountToSell);

                // Update remaining amount to 0
                nftAmountToSell = 0;
            } else { // When an incoming sell results in a bid order being consumed
                // Update order owner claimable balance
                balances[matchedOrder.owner][NFT_INDEX] += matchedOrderAmount;
                
                // Update remaining amount of NFTs to sell
                nftAmountToSell -= matchedOrderAmount;

                // Record amount of tokens to send to buyer
                tokenAmountToSend += matchedOrderAmount * matchedOrderPrice;
                
                // Save reference to next order from consumed node, then delete
                uint96 nextOrderID = matchedOrder.nextOrder;
                _removeOrder(0, matchedOrderID, bids);
                emit OrderFilled(matchedOrderID);

                // Update values for next iteration of loop
                matchedOrderID = nextOrderID;
                matchedOrder = bids[matchedOrderID];
                matchedOrderPrice = matchedOrder.price;
            }
        }

        bidsHead = matchedOrderID;

        return (nftAmountToSell, tokenAmountToSend);
    }

    /**
     * @notice Internal function to match incoming bid order with existing asks in the orderbook
     * @param nftAmountToBuy Amount of NFTs the incoming bid order wishes to buy
     * @param price The maximum price the incoming bid order is willing to pay
     */
    function _matchAgainstAsks(uint128 nftAmountToBuy, uint128 price) internal returns(uint128, uint128, uint256) {

        uint128 nftAmountToSend = 0;
        uint96 matchedOrderID = asksHead;
        OrderNode storage matchedOrder = asks[matchedOrderID];
        uint128 matchedOrderPrice = matchedOrder.price;
        uint128 matchedOrderAmount;
        uint256 tokenAmountSpent = 0;
        
        while
        (
            matchedOrderPrice <= price && // Continue matching if selling price in orders is <= buyer's price
            nftAmountToBuy > 0 && // Continue matching if there is any outstanding amount
            matchedOrderID != 0 // An order ID of zero indicates the orderbook is completely depleted
        ) {
            matchedOrderAmount = matchedOrder.amountOfNFT;
            if (matchedOrderAmount > nftAmountToBuy) { // When a single ask order can fulfill entire request of buyer
                // Update order amount left
                matchedOrder.amountOfNFT -= nftAmountToBuy;

                // Record amount of NFTs to send to buyer
                nftAmountToSend += nftAmountToBuy;

                // Update order owner claimable balance
                uint256 tokensClaimable = matchedOrderPrice * nftAmountToBuy;
                tokenAmountSpent += tokensClaimable;
                balances[matchedOrder.owner][TOKEN_INDEX] += tokensClaimable;

                // Emit
                emit OrderPartiallyFilled(matchedOrderID, matchedOrderAmount - nftAmountToBuy);

                // Update remaining amount to 0
                nftAmountToBuy = 0;

            } else { // When an incoming buy results in an ask order being consumed
                // Update order owner claimable balance
                uint256 tokensClaimable = matchedOrderPrice * matchedOrderAmount;
                tokenAmountSpent += tokensClaimable;
                balances[matchedOrder.owner][TOKEN_INDEX] += (tokensClaimable);
                
                // Upate remaining amount of NFTs to buy
                nftAmountToBuy -= matchedOrderAmount;

                // Record amount of NFTs to send to buyer
                nftAmountToSend += matchedOrderAmount;
                
                // Save reference to next order from consumed node, then delete
                uint96 nextOrderID = matchedOrder.nextOrder;
                _removeOrder(0, matchedOrderID, asks);
                emit OrderFilled(matchedOrderID);

                // Update values for next iteration of loop
                matchedOrderID = nextOrderID;
                matchedOrder = asks[matchedOrderID];
                matchedOrderPrice = matchedOrder.price;
            }
        }

        asksHead = matchedOrderID;

        return (nftAmountToBuy, nftAmountToSend, tokenAmountSpent);
    }

    /**
     * @notice Internal function for inserting bids
     * @param amountOfNFT Amount of NFTs to buy
     * @param price The price willing to pay
     * @param prevOrderID The order ID that should come immediately before this incoming order
     * 
     * @dev The prevOrderID is used as the insert location for the new order. On-chain traversal is costly, so this computation needs to happen
     * 0ff-chain, though some limited traversal is still allowed to counter blockchain state changes between off-chain computation and on-chain
     * execution during busy periods
     */
    function _insertBid(
        uint128 amountOfNFT,
        uint128 price,
        uint256 prevOrderID
    ) internal {
        _isExistingOrder(prevOrderID, bids);

        // If the prevOrder's price is already less than the new order being inserted, then this is invalid
        if (bids[prevOrderID].price < price) {
            revert InvalidPrevReference();
        }

        // Do some limited traversal, as starting location may be slightly off due to transactions included between off-chain calculation and current execution context
        if (bidsHead != 0) {
            uint256 count;
            uint256 nextOrderID = bids[prevOrderID].nextOrder;
            while (bids[nextOrderID].price >= price) {
                if (count == TRAVERSAL_TOLERANCE) {
                    revert InvalidPrevReference();
                }

                prevOrderID = nextOrderID;
                nextOrderID = bids[prevOrderID].nextOrder;

                // Break if reaching end of list
                if (nextOrderID == 0 ){
                    break;
                }

                count++;
            }
        }

        // Update head if the new incoming order is inserted at start of list
        if (prevOrderID == 0) {
            bidsHead = orderIDCount;
        }

        // Store new order node
        bids[orderIDCount] = OrderNode(amountOfNFT, price, msg.sender, bids[prevOrderID].nextOrder);
        // Update pointer of 'prev' node to new node
        bids[prevOrderID].nextOrder = orderIDCount;

        emit OrderCreated(orderIDCount, price, amountOfNFT, msg.sender, true);
        orderIDCount++;
    }

    /**
     * @notice Internal function for inserting asks
     * @param amountOfNFT Amount of NFTs to sell
     * @param price The price willing to sell at
     * @param prevOrderID The order ID that should come immediately before this incoming order
     * 
     * @dev The prevOrderID is used as the insert location for the new order. On-chain traversal is costly, so this computation needs to happen
     * 0ff-chain, though some limited traversal is still allowed to counter blockchain state changes between off-chain computation and on-chain
     * execution during busy periods
     */
    function _insertAsk(
        uint128 amountOfNFT,
        uint128 price,
        uint256 prevOrderID
    ) internal {
        _isExistingOrder(prevOrderID, asks);
        // If the prevOrder's price is already more than the new order being inserted, then this is invalid
        if (asks[prevOrderID].price > price) {
            revert InvalidPrevReference();
        }

        // Do some limited traversal
        if (asksHead != 0) {
            uint256 count;
            uint256 nextOrderID = asks[prevOrderID].nextOrder;
            while (asks[nextOrderID].price <= price) {
                if (count == TRAVERSAL_TOLERANCE) {
                    revert InvalidPrevReference();
                }

                prevOrderID = nextOrderID;
                nextOrderID = asks[prevOrderID].nextOrder;
                // Break if reaching end of list
                if (nextOrderID == 0){
                    break;
                }

                count++;
            }
        }

        // Update head if the new incoming order is inserted at start of list
        if (prevOrderID == 0) {
            asksHead = orderIDCount;
        }
        
        // Store new order node
        asks[orderIDCount] = OrderNode(amountOfNFT, price, msg.sender, asks[prevOrderID].nextOrder);
        // Update pointer of 'prev' node to new node
        asks[prevOrderID].nextOrder = orderIDCount;

        emit OrderCreated(orderIDCount, price, amountOfNFT, msg.sender, false);
        orderIDCount++;
    }

    /**
     * @notice Internal function to check if an order exists
     * @param existingOrder The order ID to check
     * @param orderbook Pointer to the side of the orderbook (bids or asks)
     * 
     * @dev We use the amountOfNFT field in the Order struct to determine if an order exists. There should be no situation
     * where an order exists with 0 amount recorded
     */
    function _isExistingOrder(
        uint256 existingOrder,
        mapping(uint256=>OrderNode) storage orderbook
    ) internal view {
        if (orderbook[existingOrder].amountOfNFT == 0 && existingOrder != 0) {
            revert NonExistingOrder();
        }
    }

    /**
     * @notice Internal function to remove an order from the orderbook
     * @param prevOrderID The order immediately preceding to the one being deleted
     * @param orderID The order ID to remove
     * @param orderbook Pointer to the side of the orderbook (bids or asks)
     */
    function _removeOrder(
        uint256 prevOrderID,
        uint256 orderID,
        mapping(uint256=>OrderNode) storage orderbook
    ) internal {
        // Update next pointer of node at n-1 to that being deleted
        orderbook[prevOrderID].nextOrder = orderbook[orderID].nextOrder;
        // Delete node
        delete(orderbook[orderID]);
    }

    /**
     * @notice Does some limited to traversal to confirm the given order ID is previous to the one being cancelled
     * @param prevOrderID The given order ID, ideally located immediately preceding to the one being deleted (but can be different depending on tx ordering)
     * @param orderID The order ID to remove
     * @param orderbook Pointer to the side of the orderbook (bids or asks)
     */
    function _confirmPrevOrderID(
        uint256 prevOrderID,
        uint256 orderID,
        mapping(uint256=>OrderNode) storage orderbook
    ) internal view returns(uint256) {
        uint256 count;
        while (orderbook[prevOrderID].nextOrder != orderID) {
            if (count == TRAVERSAL_TOLERANCE) {
                revert InvalidPrevReference();
            }

            prevOrderID = orderbook[prevOrderID].nextOrder;
            count++;
        }
        return prevOrderID;
    }
}
