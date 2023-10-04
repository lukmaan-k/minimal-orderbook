import { getNamedAccounts, getUnnamedAccounts } from "hardhat"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { network, deployments, ethers } from "hardhat"
import { setupUser, setupUsers } from "../../helpers/helper-functions"
import { developmentChains, ONE } from "../../helpers/constants"
import { Resource as ResourceType, MockERC20 as MockERC20Type, MockNFTWrapper as MockNFTWrapperType, Orderbook as OrderbookType } from "../../types"
import { BigNumberish, BigNumber } from "ethers"


const setupAccounts = deployments.createFixture(async () => {
    await deployments.fixture()
    const { deployer, alice, bob, charlie, dave } = await getNamedAccounts()

    const contracts = {
        orderbook      : <OrderbookType> await ethers.getContract("Orderbook"),
        mockERC20      : <MockERC20Type> await ethers.getContract("MockERC20"),
        resource       : <ResourceType> await ethers.getContract("Resource"),
        mockNFTWrapper : <MockNFTWrapperType> await ethers.getContract("MockNFTWrapper"),
    }

    return {
        ...contracts,
        accounts : await setupUsers(await getUnnamedAccounts(), contracts),
        deployer : await setupUser(deployer, contracts),
        alice    : await setupUser(alice, contracts),
        bob      : await setupUser(bob, contracts),
        charlie  : await setupUser(charlie, contracts),
        dave     : await setupUser(dave, contracts),
    }
})

type TestAccount = {
    address: string,
    signer: SignerWithAddress
} & {
    orderbook: OrderbookType,
    mockERC20: MockERC20Type,
    resource: ResourceType
    mockNFTWrapper: MockNFTWrapperType
}

!developmentChains.includes(network.name) ? describe.skip :
    describe("Orderbook Unit Tests", function () {

        const bidPrice1 = ONE.mul(50)
        const bidPrice2 = ONE.mul(40)
        const bidPrice3 = ONE.mul(30)
        const bidPrice4 = ONE.mul(20)
        const bidPrice5 = ONE.mul(10)

        const askPrice1 = ONE.mul(3500)
        const askPrice2 = ONE.mul(4000)
        const askPrice3 = ONE.mul(4500)
        const askPrice4 = ONE.mul(5000)
        const askPrice5 = ONE.mul(6000)

        const aliceOrderAmount = BigNumber.from(10)
        const bobOrderAmount = BigNumber.from(15)
        const charlieOrderAmount = BigNumber.from(20)

        let deployer: TestAccount,
            alice: TestAccount,
            bob: TestAccount,
            charlie: TestAccount,
            dave: TestAccount,
            orderbook: OrderbookType,
            mockERC20: MockERC20Type,
            mockNFTWrapper: MockNFTWrapperType

        describe("Order Insertions", () => {
            describe("Bids", () => {
                before("Setup accounts and contracts, and set token approvals", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])
                })
                it("Adds order into an empty orderbook", async () => {
                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 0 // We know this is the first order being inserted, so ref is 0
                    const tx = alice.orderbook.insertBid(bidPrice3, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice3.mul(aliceOrderAmount).mul(-1),
                            bidPrice3.mul(aliceOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice3, aliceOrderAmount, alice.address, true)

                    // Head should be updated
                    expect(await orderbook.bidsHead()).to.be.equal(orderID)

                    // Check order node params
                    const orderID1Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID1Node, [aliceOrderAmount, bidPrice3, alice.address, 0]) // end of list, so last arg is 0
                })

                it("Adds order at end of list", async () => {
                    // Orderbook state is now: [1]
                    // New order should go at end

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 1 // We know this order should come after orderID 1
                    const tx = bob.orderbook.insertBid(bidPrice5, bobOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            bidPrice5.mul(bobOrderAmount).mul(-1),
                            bidPrice5.mul(bobOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice5, bobOrderAmount, bob.address, true)

                    // Check the head is still equal to order ID 1, as this new order is a lower priced bid.
                    expect(await orderbook.bidsHead()).to.be.equal(1)

                    // Check order node params
                    const orderID2Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID2Node, [bobOrderAmount, bidPrice5, bob.address, 0]) // end of list, so last arg is 0

                    // Check the previous node's 'next' pointer is updated
                    expect((await orderbook.bids(1)).nextOrder).to.be.equal(orderID)
                })

                it("Adds order at beginning of list", async () => {
                    // Orderbook state is now: [1] - [2]
                    // New order should go in the beginning

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 0 // We know this order goes in the beginning
                    const tx = charlie.orderbook.insertBid(bidPrice1, charlieOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [charlie.address, orderbook],
                        [
                            bidPrice1.mul(charlieOrderAmount).mul(-1),
                            bidPrice1.mul(charlieOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice1, charlieOrderAmount, charlie.address, true)

                    // Check the head is equal to new order just inserted
                    expect(await orderbook.bidsHead()).to.be.equal(orderID)

                    // Check order node params
                    const orderID3Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID3Node, [charlieOrderAmount, bidPrice1, charlie.address, 1])
                })

                it("Add order in middle of list", async () => {
                    // Orderbook state is now: [3] - [1] - [2]
                    // New order should go between [3] and [1]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 3 // We know this order should come after orderID 3
                    const tx = bob.orderbook.insertBid(bidPrice2, bobOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            bidPrice2.mul(bobOrderAmount).mul(-1),
                            bidPrice2.mul(bobOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice2, bobOrderAmount, bob.address, true)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.bidsHead()).to.be.equal(3)

                    // Check order node params
                    const orderID4Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID4Node, [bobOrderAmount, bidPrice2, bob.address, 1])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 3
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Add order in middle of list with some traversal", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [2]
                    // New order should go between [1] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 3 // Use order 3 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertBid(bidPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice4.mul(aliceOrderAmount).mul(-1),
                            bidPrice4.mul(aliceOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice4, aliceOrderAmount, alice.address, true)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.bidsHead()).to.be.equal(3)

                    // Check order node params
                    const orderID5Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID5Node, [aliceOrderAmount, bidPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 1
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Orders of the same price respect FIFO order", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [2]
                    // New order will be at same price as order [5], so should go between [5] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 5 // Use order 3 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertBid(bidPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice4.mul(aliceOrderAmount).mul(-1),
                            bidPrice4.mul(aliceOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice4, aliceOrderAmount, alice.address, true)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.bidsHead()).to.be.equal(3)

                    // Check order node params
                    const orderID6Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID6Node, [aliceOrderAmount, bidPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 5
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Orders of the same price respect FIFO order with some on-chain traversal", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [6] - [2]
                    // New order will be at same price as orders [5] and [6], so should go between [6] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 4 // Use order 4 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertBid(bidPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice4.mul(aliceOrderAmount).mul(-1),
                            bidPrice4.mul(aliceOrderAmount),
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, bidPrice4, aliceOrderAmount, alice.address, true)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.bidsHead()).to.be.equal(3)

                    // Check order node params
                    const orderID6Node = await orderbook.bids(orderID)
                    await verifyOrderNode(orderID6Node, [aliceOrderAmount, bidPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 6
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Cannot add orders with price of 0", async () => {
                    const tx = alice.orderbook.insertBid(0, aliceOrderAmount, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderParams")
                })

                it("Cannot add orders with amount of 0", async () => {
                    const tx = alice.orderbook.insertBid(bidPrice1, 0, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderParams")
                })

                it("Cannot add orders using an invalid order number for insert location", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [6] - [7] - [2]
                    // Stuff some orders in the asks side of orderbook
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)

                    // Order ID 9 only exists in asks side of orderbook, so should revert as non-existing
                    const invalidOrderID = 9
                    const tx = alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, invalidOrderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "NonExistingOrder")
                })

                it("Cannot add order with an insert location that would require more than 4 iterations of on-chain traversal", async () => {
                    const tx = alice.orderbook.insertBid(bidPrice4, aliceOrderAmount, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })

                it("Cannot add order with an insert location that should be after the order that is being added", async () => {
                    // Bid orderbook state is now: [3] - [4] - [1] - [5] - [6] - [7] - [2]
                    // Adding an order at bidPrice1 should result in an addition between [3] and [4], but a starting location of [1] is ahead of this so should revert
                    const tx = alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 1) // Try adding order that
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })
            })

            describe("Asks", () => {
                before("Setup accounts and contracts, and set token approvals", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])
                })

                it("Adds order into an empty orderbook", async () => {
                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 0 // We know this is the first order being inserted, so ref is 0
                    const tx = alice.orderbook.insertAsk(askPrice3, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount.mul(-1),
                            aliceOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice3, aliceOrderAmount, alice.address, false)

                    // Head should be updated
                    expect(await orderbook.asksHead()).to.be.equal(orderID)

                    // Check order node params
                    const orderID1Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID1Node, [aliceOrderAmount, askPrice3, alice.address, 0]) // end of list, so last arg is 0
                })

                it("Adds order at end of list", async () => {
                    // Orderbook state is now: [1]
                    // New order should go at end

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 1 // We know this order should come after orderID 1
                    const tx = bob.orderbook.insertAsk(askPrice5, bobOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            bobOrderAmount.mul(-1),
                            bobOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice5, bobOrderAmount, bob.address, false)

                    // Check the head is still equal to order ID 1, as this new order is a higher priced ask.
                    expect(await orderbook.asksHead()).to.be.equal(1)

                    // Check order node params
                    const orderID2Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID2Node, [bobOrderAmount, askPrice5, bob.address, 0]) // end of list, so last arg is 0

                    // Check the previous node's 'next' pointer is updated
                    expect((await orderbook.asks(1)).nextOrder).to.be.equal(orderID)
                })

                it("Adds order at beginning of list", async () => {
                    // Orderbook state is now: [1] - [2]
                    // New order should go in the beginning

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 0 // We know this order goes in the beginning
                    const tx = charlie.orderbook.insertAsk(askPrice1, charlieOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [charlie.address, orderbook],
                        [
                            charlieOrderAmount.mul(-1),
                            charlieOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice1, charlieOrderAmount, charlie.address, false)

                    // Check the head is equal to new order just inserted
                    expect(await orderbook.asksHead()).to.be.equal(orderID)

                    // Check order node params
                    const orderID3Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID3Node, [charlieOrderAmount, askPrice1, charlie.address, 1])
                })

                it("Add order in middle of list", async () => {
                    // Orderbook state is now: [3] - [1] - [2]
                    // New order should go between [3] and [1]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 3 // We know this order should come after orderID 3
                    const tx = bob.orderbook.insertAsk(askPrice2, bobOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            bobOrderAmount.mul(-1),
                            bobOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice2, bobOrderAmount, bob.address, false)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.asksHead()).to.be.equal(3)

                    // Check order node params
                    const orderID4Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID4Node, [bobOrderAmount, askPrice2, bob.address, 1])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 3
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Add order in middle of list with some traversal", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [2]
                    // New order should go between [1] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 3 // Use order 3 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertAsk(askPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount.mul(-1),
                            aliceOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice4, aliceOrderAmount, alice.address, false)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.asksHead()).to.be.equal(3)

                    // Check order node params
                    const orderID5Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID5Node, [aliceOrderAmount, askPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 1
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Orders of the same price respect FIFO order", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [2]
                    // New order will be at same price as order [5], so should go between [5] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 5 // Use order 3 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertAsk(askPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount.mul(-1),
                            aliceOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice4, aliceOrderAmount, alice.address, false)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.asksHead()).to.be.equal(3)

                    // Check order node params
                    const orderID6Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID6Node, [aliceOrderAmount, askPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 5
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Orders of the same price respect FIFO order with some on-chain traversal", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [6] - [2]
                    // New order will be at same price as orders [5] and [6], so should go between [6] and [2]

                    const orderID = await orderbook.orderIDCount()
                    const insertLocation = 4 // Use order 4 as starting location, causing some traversal on-chain
                    const tx = alice.orderbook.insertAsk(askPrice4, aliceOrderAmount, insertLocation)
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount.mul(-1),
                            aliceOrderAmount,
                        ])
                        .and.to.emit(orderbook, "OrderCreated").withArgs(orderID, askPrice4, aliceOrderAmount, alice.address, false)

                    // Check the head is still equal to orderID 3
                    expect(await orderbook.asksHead()).to.be.equal(3)

                    // Check order node params
                    const orderID6Node = await orderbook.asks(orderID)
                    await verifyOrderNode(orderID6Node, [aliceOrderAmount, askPrice4, alice.address, 2])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    const prevOrderID = 6
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(orderID)
                })

                it("Cannot add orders with price of 0", async () => {
                    const tx = alice.orderbook.insertAsk(0, aliceOrderAmount, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderParams")
                })

                it("Cannot add orders with amount of 0", async () => {
                    const tx = alice.orderbook.insertAsk(askPrice1, 0, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderParams")
                })

                it("Cannot add orders using an invalid order number for insert location", async () => {
                    // Orderbook state is now: [3] - [4] - [1] - [5] - [6] - [7] - [2]
                    // Stuff some orders
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)

                    // Order ID 9 only exists in asks side of orderbook, so should revert as non-existing
                    const invalidOrderID = 9
                    const tx = alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, invalidOrderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "NonExistingOrder")
                })

                it("Cannot add order with an insert location that would require more than 4 iterations of on-chain traversal", async () => {
                    const tx = alice.orderbook.insertAsk(askPrice4, aliceOrderAmount, 0)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })

                it("Cannot add order with an insert location that should be after the order that is being added", async () => {
                    // Ask orderbook state is now: [3] - [4] - [1] - [5] - [6] - [7] - [2]
                    // Adding an order at askPrice1 should result in an addition between [3] and [4], but a starting location of [1] is ahead of this so should revert
                    const tx = alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 1) // Try adding order that
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })
            })
        })

        describe("Order Modification", () => {
            before("Setup accounts and contracts, and set token approvals", async () => {
                ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                await transferTokens(deployer, [alice, bob, charlie, dave])
            })

            it("Modifies a bid order to a higher amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)

                // Modify the order
                const newAmount = aliceOrderAmount.mul(3)
                const tx = alice.orderbook.modifyBidAmount(orderID, newAmount)

                await expect(tx).to.changeTokenBalances(mockERC20,
                    [alice.address, orderbook],
                    [
                        bidPrice1.mul(aliceOrderAmount).mul(-2),
                        bidPrice1.mul(aliceOrderAmount).mul(2),
                    ])
                    .and.to.emit(orderbook, "OrderModified").withArgs(orderID, newAmount)
            })

            it("Modifies a bid order to a lower amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)

                // Modify the order
                const newAmount = aliceOrderAmount.div(2)
                const tx = alice.orderbook.modifyBidAmount(orderID, newAmount)

                await expect(tx).to.changeTokenBalances(mockERC20,
                    [alice.address, orderbook],
                    [
                        bidPrice1.mul(aliceOrderAmount).div(2),
                        bidPrice1.mul(aliceOrderAmount).div(-2),
                    ])
                    .and.to.emit(orderbook, "OrderModified").withArgs(orderID, newAmount)
            })

            it("Cannot modify a bid order to same amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)

                // Modify the order
                const tx = alice.orderbook.modifyBidAmount(orderID, aliceOrderAmount)

                await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderUpdate")
            })

            it("Modifies an ask order to a higher amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)

                // Modify the order
                const newAmount = aliceOrderAmount.mul(3)
                const tx = alice.orderbook.modifyAskAmount(orderID, newAmount)

                await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                    [alice.address, orderbook],
                    [
                        aliceOrderAmount.mul(-2),
                        aliceOrderAmount.mul(2),
                    ])
                    .and.to.emit(orderbook, "OrderModified").withArgs(orderID, newAmount)
            })

            it("Modifies an ask order to a lower amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)

                // Modify the order
                const newAmount = aliceOrderAmount.div(2)
                const tx = alice.orderbook.modifyAskAmount(orderID, newAmount)

                await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                    [alice.address, orderbook],
                    [
                        aliceOrderAmount.div(2),
                        aliceOrderAmount.div(-2),
                    ])
                    .and.to.emit(orderbook, "OrderModified").withArgs(orderID, newAmount)
            })

            it("Cannot modify an ask order to same amount", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)

                // Modify the order
                const tx = alice.orderbook.modifyAskAmount(orderID, aliceOrderAmount)

                await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidOrderUpdate")
            })

            it("Cannot modify someone else's bid order", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertBid(askPrice1, aliceOrderAmount, 0)

                // Modify order with another user
                const tx = bob.orderbook.modifyBidAmount(orderID, aliceOrderAmount)

                await expect(tx).to.be.revertedWithCustomError(orderbook, "NotOrderOwner")
            })

            it("Cannot modify someone else's ask order", async () => {
                // Insert an order as before
                const orderID = await orderbook.orderIDCount()
                await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)

                // Modify order with another user
                const tx = bob.orderbook.modifyAskAmount(orderID, aliceOrderAmount)

                await expect(tx).to.be.revertedWithCustomError(orderbook, "NotOrderOwner")
            })
        })

        describe("Order Cancellation", () => {
            describe("Bids", () => {
                before("Setup accounts and contracts, and set token approvals", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])

                    // Setup the orderbook for all tests in this section. The resulting state after all additions will be:
                    // BIDS: [3: 50] - [4: 50] - [1: 40] - [5: 40] - [6: 40] - [2: 30] - [7: 30]  , where format is [orderID: price]
                    await alice.orderbook.insertBid(bidPrice2, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice3, aliceOrderAmount, 1)
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice2, aliceOrderAmount, 1)
                    await alice.orderbook.insertBid(bidPrice2, aliceOrderAmount, 1)
                    await alice.orderbook.insertBid(bidPrice3, aliceOrderAmount, 6)

                    // Test that the orderbook is setup as described in comment above
                    expect((await orderbook.bids(0)).nextOrder).to.be.equal(3)
                    expect((await orderbook.bids(3)).nextOrder).to.be.equal(4)
                    expect((await orderbook.bids(4)).nextOrder).to.be.equal(1)
                    expect((await orderbook.bids(1)).nextOrder).to.be.equal(5)
                    expect((await orderbook.bids(5)).nextOrder).to.be.equal(6)
                    expect((await orderbook.bids(6)).nextOrder).to.be.equal(2)
                    expect((await orderbook.bids(2)).nextOrder).to.be.equal(7)
                    expect((await orderbook.bids(7)).nextOrder).to.be.equal(0)
                })

                it("Cannot cancel an order if it requires more than 4 iterations of traversal", async () => {
                    const prevOrderID = 3 // Start at first order in list
                    const orderID = 7 // Try deleting the last order
                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })

                it("Cancels an order from the middle of a list when it is the same price as both the previous and the next order", async () => {
                    // Order 5 matches this requirement. Store IDs of both prev and next too
                    const prevOrderID = 1
                    const orderID = 5
                    const nextOrderID = 6

                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice2.mul(aliceOrderAmount),
                            bidPrice2.mul(aliceOrderAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.bids(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the middle of a list when it is a different price to the previous one", async () => {
                    // Orderbook state is now: [3: 50] - [4: 50] - [1: 40] - [6: 40] - [2: 30] - [7: 30]
                    // Order 1 matches this unit test's requirement. Store IDs of both prev and next too
                    const prevOrderID = 4
                    const orderID = 1
                    const nextOrderID = 6

                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice2.mul(aliceOrderAmount),
                            bidPrice2.mul(aliceOrderAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.bids(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the end of a list with some traversal", async () => {
                    // Orderbook state is now: [3: 50] - [4: 50] - [6: 40] - [2: 30] - [7: 30]
                    // Pick order 7 to delete
                    let prevOrderID = 4 // Use orderID 4 as starting location
                    const orderID = 7
                    const nextOrderID = 0 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice3.mul(aliceOrderAmount),
                            bidPrice3.mul(aliceOrderAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.bids(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    prevOrderID = 2 // Set to the actual previous order to the one that was just deleted
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the beginning of a list", async () => {
                    // Orderbook state is now: [3: 50] - [4: 50] - [6: 40] - [2: 30]
                    const prevOrderID = 0 // 0 since it is the first order in the list
                    const orderID = 3
                    const nextOrderID = 4 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice1.mul(aliceOrderAmount),
                            bidPrice1.mul(aliceOrderAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.bids(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(nextOrderID)

                    // Check head is updated to 4, the previously second order in the list
                    expect(await orderbook.bidsHead()).to.be.equal(4)
                })

                it("Cannot cancel an order if not the owner", async () => {
                    // Orderbook state is now: [4: 50] - [6: 40] - [2: 30]
                    const prevOrderID = 4
                    const orderID = 6
                    const tx = bob.orderbook.cancelBid(prevOrderID, orderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "NotOrderOwner")
                })

                it("Cancels the only order in the list, giving an empty orderbook", async () => {
                    // Orderbook state is: [4: 50] - [6: 40] - [2: 30]
                    // Delete any 2 orders to give a single order
                    await alice.orderbook.cancelBid(0, 6)
                    await alice.orderbook.cancelBid(0, 2)

                    // Now cancel the only remaining order (ID 4)
                    const prevOrderID = 0 // 0 since it is the first order in the list
                    const orderID = 4
                    const nextOrderID = 0 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelBid(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            bidPrice1.mul(aliceOrderAmount),
                            bidPrice1.mul(aliceOrderAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.bids(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.bids(prevOrderID)).nextOrder).to.be.equal(nextOrderID)

                    // Check head is updated to 0
                    expect(await orderbook.bidsHead()).to.be.equal(0)
                })
            })

            describe("Asks", () => {
                before("Setup accounts and contracts, and set token approvals", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])

                    // Setup the orderbook for all tests in this section. The resulting state after all additions will be:
                    // ASKS: [3: 3500] - [4: 3500] - [1: 4000] - [5: 4000] - [6: 4000] - [2: 4500] - [7: 4500]  , where format is [orderID: price]
                    await alice.orderbook.insertAsk(askPrice2, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice3, aliceOrderAmount, 1)
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice2, aliceOrderAmount, 1)
                    await alice.orderbook.insertAsk(askPrice2, aliceOrderAmount, 1)
                    await alice.orderbook.insertAsk(askPrice3, aliceOrderAmount, 6)

                    // Test that the orderbook is setup as described in comment above
                    expect((await orderbook.asks(0)).nextOrder).to.be.equal(3)
                    expect((await orderbook.asks(3)).nextOrder).to.be.equal(4)
                    expect((await orderbook.asks(4)).nextOrder).to.be.equal(1)
                    expect((await orderbook.asks(1)).nextOrder).to.be.equal(5)
                    expect((await orderbook.asks(5)).nextOrder).to.be.equal(6)
                    expect((await orderbook.asks(6)).nextOrder).to.be.equal(2)
                    expect((await orderbook.asks(2)).nextOrder).to.be.equal(7)
                    expect((await orderbook.asks(7)).nextOrder).to.be.equal(0)
                })

                it("Cannot cancel an order if it requires more than 4 iterations of traversal", async () => {
                    const prevOrderID = 3 // Start at first order in list
                    const orderID = 7 // Try deleting the last order
                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "InvalidPrevReference")
                })

                it("Cancels an order from the middle of a list when it is the same price as both the previous and the next order", async () => {
                    // Order 5 matches this requirement. Store IDs of both prev and next too
                    const prevOrderID = 1
                    const orderID = 5
                    const nextOrderID = 6

                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount,
                            aliceOrderAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.asks(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the middle of a list when it is a different price to the previous one", async () => {
                    // Orderbook state is now: [3: 3500] - [4: 3500] - [1: 4000] - [6: 4000] - [2: 4500] - [7: 4500]
                    // Order 1 matches this unit test's requirement. Store IDs of both prev and next too
                    const prevOrderID = 4
                    const orderID = 1
                    const nextOrderID = 6

                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount,
                            aliceOrderAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.asks(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the end of a list with some traversal", async () => {
                    // Orderbook state is now: [3: 3500] - [4: 3500] - [6: 4000] - [2: 4500] - [7: 4500]
                    // Pick order 7 to delete
                    let prevOrderID = 4 // Use orderID 4 as starting location
                    const orderID = 7
                    const nextOrderID = 0 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount,
                            aliceOrderAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.asks(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    prevOrderID = 2 // Set to the actual previous order to the one that was just deleted
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(nextOrderID)
                })

                it("Cancels an order from the beginning of a list", async () => {
                    // Orderbook state is now: [3: 3500] - [4: 3500] - [6: 4000] - [2: 4500]
                    const prevOrderID = 0 // 0 since it is the first order in the list
                    const orderID = 3
                    const nextOrderID = 4 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount,
                            aliceOrderAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.asks(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(nextOrderID)

                    // Check head is updated to 4, the previously second order in the list
                    expect(await orderbook.asksHead()).to.be.equal(4)
                })

                it("Cannot cancel an order if not the owner", async () => {
                    // Orderbook state is now: [4: 3500] - [6: 4000] - [2: 4500]
                    const prevOrderID = 4
                    const orderID = 6
                    const tx = bob.orderbook.cancelAsk(prevOrderID, orderID)
                    await expect(tx).to.be.revertedWithCustomError(orderbook, "NotOrderOwner")
                })

                it("Cancels the only order in the list, giving an empty orderbook", async () => {
                    // Orderbook state is: [4: 3500] - [6: 4000] - [2: 4500]
                    // Delete any 2 orders to give a single order
                    await alice.orderbook.cancelAsk(0, 6)
                    await alice.orderbook.cancelAsk(0, 2)

                    // Now cancel the only remaining order (ID 4)
                    const prevOrderID = 0 // 0 since it is the first order in the list
                    const orderID = 4
                    const nextOrderID = 0 // 0 since it is at end of list

                    const tx = alice.orderbook.cancelAsk(prevOrderID, orderID)

                    // Check tokens are returned
                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            aliceOrderAmount,
                            aliceOrderAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderCancelled").withArgs(orderID)

                    // Check that the node is deleted
                    const orderNode = await orderbook.asks(orderID)
                    verifyOrderNode(orderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the previous node's 'next' pointer is updated to order just inserted
                    expect((await orderbook.asks(prevOrderID)).nextOrder).to.be.equal(nextOrderID)

                    // Check head is updated to 0
                    expect(await orderbook.asksHead()).to.be.equal(0)
                })
            })
        })

        describe("Order Matching", () => {
            describe("Bids", () => {
                beforeEach("Setup accounts and contracts, set token approvals, and populate the orderbook", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])

                    // Setup the asks side of the orderbook, resulting in:
                    // ASKS: [1: 3500] - [2: 4000] - [3: 4500]
                    await alice.orderbook.insertAsk(askPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice2, aliceOrderAmount, 0)
                    await alice.orderbook.insertAsk(askPrice3, aliceOrderAmount, 0)

                    // Test that the orderbook is setup as described in comment above
                    expect((await orderbook.asks(0)).nextOrder).to.be.equal(1)
                    expect((await orderbook.asks(1)).nextOrder).to.be.equal(2)
                    expect((await orderbook.asks(2)).nextOrder).to.be.equal(3)
                    expect((await orderbook.asks(3)).nextOrder).to.be.equal(0)
                })

                it("Matches with an order but does not consume the order, with an input price exactly as the order being taken", async () => {
                    const desiredPrice = askPrice1 // Exact price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.asksHead()
                    let matchedOrderNode = await orderbook.asks(matchedOrderID)
                    const orderPrice = matchedOrderNode.price

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            desiredPrice.mul(desiredAmount).mul(-1),
                            desiredPrice.mul(desiredAmount),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))

                    // Check ordernode is updated
                    const originalOrderAmount = matchedOrderNode.amountOfNFT
                    matchedOrderNode = await orderbook.asks(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [originalOrderAmount.sub(desiredAmount), matchedOrderNode.price, matchedOrderNode.owner, matchedOrderNode.nextOrder])

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount),
                            orderPrice.mul(desiredAmount).mul(-1),
                        ])
                })

                it("As previous: ERC1155 balance change check", async () => {
                    const desiredPrice = askPrice1 // Exact price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.asksHead()
                    const matchedOrderNode = await orderbook.asks(matchedOrderID)

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))
                })

                it("Matches but does not consume the order, with an input price slightly higher than order being taken", async () => {
                    const desiredPrice = ONE.mul(3700) // Slightly higher than best ask price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.asksHead()
                    let matchedOrderNode = await orderbook.asks(matchedOrderID)
                    const orderPrice = matchedOrderNode.price

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount).mul(-1),
                            orderPrice.mul(desiredAmount),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))

                    // Check ordernode is updated
                    const originalOrderAmount = matchedOrderNode.amountOfNFT
                    matchedOrderNode = await orderbook.asks(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [originalOrderAmount.sub(desiredAmount), matchedOrderNode.price, matchedOrderNode.owner, matchedOrderNode.nextOrder])

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount),
                            orderPrice.mul(desiredAmount).mul(-1),
                        ])
                })

                it("As previous: ERC1155 balance change check", async () => {
                    const desiredPrice = ONE.mul(3700) // Slightly higher than best ask price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.asksHead()
                    const matchedOrderNode = await orderbook.asks(matchedOrderID)

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))
                })

                it("Matches to consume exactly 1 order", async () => {
                    const desiredPrice = ONE.mul(3700) // Slightly higher than best ask price
                    const desiredAmount = aliceOrderAmount
                    const matchedOrderID = await orderbook.asksHead()
                    let matchedOrderNode = await orderbook.asks(matchedOrderID)
                    const orderPrice = matchedOrderNode.price

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount).mul(-1),
                            orderPrice.mul(desiredAmount),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID)

                    // Check ordernode is updated
                    matchedOrderNode = await orderbook.asks(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the head is updated
                    expect(await orderbook.asksHead()).to.be.equal(2)

                    // Check that the anchor points to the head
                    expect((await orderbook.asks(0)).nextOrder).to.be.equal(await orderbook.asksHead())

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount),
                            orderPrice.mul(desiredAmount).mul(-1),
                        ])
                })

                it("As previous: ERC1155 balance change check", async () => {
                    const desiredPrice = ONE.mul(3700) // Slightly higher than best ask price
                    const desiredAmount = aliceOrderAmount
                    const matchedOrderID = await orderbook.asksHead()

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID)
                })

                it("Matches to consume exactly 2 orders", async () => {
                    const desiredPrice = ONE.mul(4000) // Same price as second best ask order
                    const desiredAmount = aliceOrderAmount.mul(2) // twice the order amount, consuming 2 orders
                    const matchedOrderID1 = await orderbook.asksHead()
                    const matchedOrderID2 = 2
                    let matchedOrderNode1 = await orderbook.asks(matchedOrderID1)
                    const matchedOrderNode2 = await orderbook.asks(matchedOrderID2)
                    const orderPrice1 = matchedOrderNode1.price
                    const orderPrice2 = matchedOrderNode2.price

                    const tokenCost = aliceOrderAmount.mul(orderPrice1).add(aliceOrderAmount.mul(orderPrice2))

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            tokenCost.mul(-1),
                            tokenCost,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)

                    // Check ordernode is updated
                    matchedOrderNode1 = await orderbook.asks(matchedOrderID1)
                    await verifyOrderNode(matchedOrderNode1, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the head is updated
                    expect(await orderbook.asksHead()).to.be.equal(3)

                    // Check that the anchor points to the head
                    expect((await orderbook.asks(0)).nextOrder).to.be.equal(await orderbook.asksHead())

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()

                    await expect(tx2).to.changeTokenBalances(mockERC20,
                        [alice.address, orderbook],
                        [
                            tokenCost,
                            tokenCost.mul(-1),
                        ])
                })

                it("As previous: ERC1155 balance change check", async () => {
                    const desiredPrice = ONE.mul(4000) // Same price as second best ask order
                    const desiredAmount = aliceOrderAmount.mul(2) // twice the order amount, consuming 2 orders

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)
                })

                it("Matches to consume 2 orders and places a bid for remaining amount", async () => {
                    const desiredPrice = ONE.mul(4000) // Same price as second best ask order
                    const desiredAmount = aliceOrderAmount.mul(3) // 3 times the order amount, but only consuming 2 orders due to price
                    const orderID = await orderbook.orderIDCount()

                    const matchedOrderID1 = 1
                    const matchedOrderID2 = 2
                    const matchedOrderNode1 = await orderbook.asks(matchedOrderID1)
                    const matchedOrderNode2 = await orderbook.asks(matchedOrderID2)
                    const orderPrice1 = matchedOrderNode1.price
                    const orderPrice2 = matchedOrderNode2.price

                    // Cost = (orderSize * price1) + (orderSize * price2) + (orderSize * desiredPrice)
                    const tokenCost = aliceOrderAmount.mul(orderPrice1).add(aliceOrderAmount.mul(orderPrice2)).add(desiredPrice.mul(aliceOrderAmount))

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            tokenCost.mul(-1),
                            tokenCost,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)

                    // Check order node is added for remaining amount
                    const unfilledAmount = desiredAmount.sub(aliceOrderAmount.mul(2)) // Placed order for 30, only 20 filled, leaving 10 NFTs to buy
                    const orderNode = await orderbook.bids(orderID)

                    await verifyOrderNode(orderNode, [unfilledAmount, desiredPrice, bob.address, 0]) // Should be the only order in the bid side
                })

                it("Matches to consume 2 and a half orders", async () => {
                    const desiredPrice = ONE.mul(5000) // Higher price than all orders
                    const desiredAmount = aliceOrderAmount.mul(5).div(2) // 2.5 times order amount

                    const matchedOrderID1 = 1
                    const matchedOrderID2 = 2
                    const matchedOrderID3 = 3
                    const matchedOrderNode1 = await orderbook.asks(matchedOrderID1)
                    const matchedOrderNode2 = await orderbook.asks(matchedOrderID2)
                    const matchedOrderNode3 = await orderbook.asks(matchedOrderID3)
                    const orderPrice1 = matchedOrderNode1.price
                    const orderPrice2 = matchedOrderNode2.price
                    const orderPrice3 = matchedOrderNode3.price

                    // Cost = (orderSize * price1) + (orderSize * price2) + (orderSize/2 * price3)
                    const tokenCost = orderPrice1.mul(aliceOrderAmount).add(orderPrice2.mul(aliceOrderAmount)).add(orderPrice3.mul(aliceOrderAmount.div(2)))

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            tokenCost.mul(-1),
                            tokenCost,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(3, 5)

                    // Check the half filled order node
                    const orderNode = await orderbook.asks(3)
                    await verifyOrderNode(orderNode, [aliceOrderAmount.div(2), askPrice3, alice.address, 0])
                })

                it("Matches to consume all orders, and places remaining amount in orderbook", async () => {
                    const desiredPrice = ONE.mul(5000) // Higher price than all orders
                    const desiredAmount = aliceOrderAmount.mul(4) // enough to consume all orders and more

                    const matchedOrderID1 = 1
                    const matchedOrderID2 = 2
                    const matchedOrderID3 = 3
                    const matchedOrderNode1 = await orderbook.asks(matchedOrderID1)
                    const matchedOrderNode2 = await orderbook.asks(matchedOrderID2)
                    const matchedOrderNode3 = await orderbook.asks(matchedOrderID3)
                    const orderPrice1 = matchedOrderNode1.price
                    const orderPrice2 = matchedOrderNode2.price
                    const orderPrice3 = matchedOrderNode3.price

                    // Cost = (orderSize * price1) + (orderSize * price2) + (orderSize * price3), where orderSize = aliceOrderAmount
                    const matchedOrderCost = orderPrice1.mul(aliceOrderAmount).add(orderPrice2.mul(aliceOrderAmount)).add(orderPrice3.mul(aliceOrderAmount))
                    // Cost = desiredPrice * orderSize
                    const placedOrderCost = desiredPrice.mul(aliceOrderAmount)

                    const orderID = await orderbook.orderIDCount()

                    const tx = bob.orderbook.insertBid(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            matchedOrderCost.add(placedOrderCost).mul(-1),
                            matchedOrderCost.add(placedOrderCost),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(3)

                    // Check the newly inserted node in bid side
                    const orderNode = await orderbook.bids(orderID)
                    await verifyOrderNode(orderNode, [aliceOrderAmount, desiredPrice, bob.address, 0])
                })
            })

            describe("Asks", () => {
                beforeEach("Setup accounts and contracts, set token approvals, and populate the orderbook", async () => {
                    ({ deployer, alice, bob, charlie, dave, orderbook, mockERC20, mockNFTWrapper }  = await setupAccounts())
                    await transferTokens(deployer, [alice, bob, charlie, dave])

                    // Setup the bids side of the orderbook, resulting in:
                    // BIDS: [1: 50] - [2: 40] - [3: 30]
                    await alice.orderbook.insertBid(bidPrice1, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice2, aliceOrderAmount, 0)
                    await alice.orderbook.insertBid(bidPrice3, aliceOrderAmount, 0)

                    // Test that the orderbook is setup as described in comment above
                    expect((await orderbook.bids(0)).nextOrder).to.be.equal(1)
                    expect((await orderbook.bids(1)).nextOrder).to.be.equal(2)
                    expect((await orderbook.bids(2)).nextOrder).to.be.equal(3)
                    expect((await orderbook.bids(3)).nextOrder).to.be.equal(0)
                })

                it("Matches with an order but does not consume the order, with an input price exactly as the order being taken", async () => {
                    const desiredPrice = bidPrice1 // Exact price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.bidsHead()
                    let matchedOrderNode = await orderbook.bids(matchedOrderID)

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))

                    // Check ordernode is updated
                    const originalOrderAmount = matchedOrderNode.amountOfNFT
                    matchedOrderNode = await orderbook.bids(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [originalOrderAmount.sub(desiredAmount), matchedOrderNode.price, matchedOrderNode.owner, matchedOrderNode.nextOrder])

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                })

                it("As previous: ERC20 balance change check", async () => {
                    const desiredPrice = bidPrice1 // Exact price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.bidsHead()
                    const matchedOrderNode = await orderbook.bids(matchedOrderID)

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            desiredPrice.mul(desiredAmount),
                            desiredPrice.mul(desiredAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))
                })

                it("Matches with an order but does not consume the order, with an input price slightly lower than order being taken", async () => {
                    const desiredPrice = ONE.mul(45) // Slightly higher than best bid price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.bidsHead()
                    let matchedOrderNode = await orderbook.bids(matchedOrderID)

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))

                    // Check ordernode is updated
                    const originalOrderAmount = matchedOrderNode.amountOfNFT
                    matchedOrderNode = await orderbook.bids(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [originalOrderAmount.sub(desiredAmount), matchedOrderNode.price, matchedOrderNode.owner, matchedOrderNode.nextOrder])

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                })

                it("As previous: ERC20 balance change check", async () => {
                    const desiredPrice = ONE.mul(45) // Slightly higher than best bid price
                    const desiredAmount = aliceOrderAmount.div(2)
                    const matchedOrderID = await orderbook.bidsHead()
                    const matchedOrderNode = await orderbook.bids(matchedOrderID)
                    const orderPrice = matchedOrderNode.price

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount),
                            orderPrice.mul(desiredAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(matchedOrderID, matchedOrderNode.amountOfNFT.sub(desiredAmount))
                })

                it("Matches to consume exactly 1 order", async () => {
                    const desiredPrice = ONE.mul(45) // Slightly lower than best bid price
                    const desiredAmount = aliceOrderAmount
                    const matchedOrderID = await orderbook.bidsHead()
                    let matchedOrderNode = await orderbook.bids(matchedOrderID)

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID)

                    // Check ordernode is updated
                    matchedOrderNode = await orderbook.bids(matchedOrderID)
                    await verifyOrderNode(matchedOrderNode, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the head is updated
                    expect(await orderbook.bidsHead()).to.be.equal(2)

                    // Check that the anchor points to the head
                    expect((await orderbook.bids(0)).nextOrder).to.be.equal(await orderbook.bidsHead())

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    await expect(tx2).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            desiredAmount,
                            desiredAmount.mul(-1),
                        ])
                })

                it("As previous: ERC20 balance change check", async () => {
                    const desiredPrice = ONE.mul(45) // Slightly lower than best bid price
                    const desiredAmount = aliceOrderAmount
                    const matchedOrderID = await orderbook.bidsHead()
                    const matchedOrderNode = await orderbook.bids(matchedOrderID)
                    const orderPrice = matchedOrderNode.price

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            orderPrice.mul(desiredAmount),
                            orderPrice.mul(desiredAmount).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID)
                })

                it("Matches to consume exactly 2 orders", async () => {
                    const desiredPrice = ONE.mul(40) // Same price as second best bid order
                    const desiredAmount = aliceOrderAmount.mul(2) // twice the order amount, consuming 2 orders
                    const matchedOrderID1 = await orderbook.bidsHead()
                    const matchedOrderID2 = 2
                    let matchedOrderNode1 = await orderbook.bids(matchedOrderID1)
                    let matchedOrderNode2 = await orderbook.bids(matchedOrderID2)

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID2)

                    // Check ordernode is updated
                    matchedOrderNode1 = await orderbook.bids(matchedOrderID1)
                    await verifyOrderNode(matchedOrderNode1, [0, 0, ethers.constants.AddressZero, 0])

                    // Check ordernode is updated
                    matchedOrderNode2 = await orderbook.bids(matchedOrderID2)
                    await verifyOrderNode(matchedOrderNode2, [0, 0, ethers.constants.AddressZero, 0])

                    // Check the head is updated
                    expect(await orderbook.bidsHead()).to.be.equal(3)

                    // Check that the anchor points to the head
                    expect((await orderbook.bids(0)).nextOrder).to.be.equal(await orderbook.bidsHead())

                    // Check that the order owner can claim their proceeds
                    const tx2 = alice.orderbook.claimBalances()
                    const proceedsFromFirstOrder = aliceOrderAmount
                    const proceedsFromSecondOrder = aliceOrderAmount

                    await expect(tx2).to.changeTokenBalances(mockNFTWrapper,
                        [alice.address, orderbook],
                        [
                            proceedsFromFirstOrder.add(proceedsFromSecondOrder),
                            proceedsFromFirstOrder.add(proceedsFromSecondOrder).mul(-1),
                        ])
                })

                it("As previous: ERC20 balance change check", async () => {
                    const desiredPrice = ONE.mul(40) // Same price as second best bid order
                    const desiredAmount = aliceOrderAmount.mul(2) // twice the order amount, consuming 2 orders
                    const matchedOrderID1 = await orderbook.bidsHead()
                    const matchedOrderID2 = 2
                    const matchedOrderNode1 = await orderbook.bids(matchedOrderID1)
                    const matchedOrderNode2 = await orderbook.bids(matchedOrderID2)
                    const orderPrice1 = matchedOrderNode1.price
                    const orderPrice2 = matchedOrderNode2.price

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockERC20,
                        [bob.address, orderbook],
                        [
                            orderPrice1.mul(desiredAmount.div(2)).add(orderPrice2.mul(desiredAmount.div(2))),
                            orderPrice1.mul(desiredAmount.div(2)).add(orderPrice2.mul(desiredAmount.div(2))).mul(-1),
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(matchedOrderID2)
                })

                it("Matches to consume 2 orders and places an ask for remaining amount", async () => {
                    const desiredPrice = ONE.mul(40) // Same price as second best bid order
                    const desiredAmount = aliceOrderAmount.mul(3) // 3 times the order amount, but only consuming 2 orders due to price
                    const orderID = await orderbook.orderIDCount()

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)

                    // Check order node is added for remaining amount
                    const unfilledAmount = desiredAmount.sub(aliceOrderAmount.mul(2)) // Placed order for 30, only 20 filled, leaving 10 NFTs to buy
                    const orderNode = await orderbook.asks(orderID)

                    await verifyOrderNode(orderNode, [unfilledAmount, desiredPrice, bob.address, 0]) // Should be the only order in the bid side
                })

                it("Matches to consume 2 and a half orders", async () => {
                    const desiredPrice = ONE.mul(25) // Lower price than all orders
                    const desiredAmount = aliceOrderAmount.mul(5).div(2) // 2.5 times order amount

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)
                        .and.to.emit(orderbook, "OrderPartiallyFilled").withArgs(3, 5)

                    // Check the half filled order node
                    const orderNode = await orderbook.bids(3)
                    await verifyOrderNode(orderNode, [aliceOrderAmount.div(2), bidPrice3, alice.address, 0])
                })

                it("Matches to consume all orders, and places remaining amount in orderbook", async () => {
                    const desiredPrice = ONE.mul(25) // Lower price than all orders
                    const desiredAmount = aliceOrderAmount.mul(4) // enough to consume all orders and more
                    const orderID = await orderbook.orderIDCount()

                    const tx = bob.orderbook.insertAsk(desiredPrice, desiredAmount, 0)

                    await expect(tx).to.changeTokenBalances(mockNFTWrapper,
                        [bob.address, orderbook],
                        [
                            desiredAmount.mul(-1),
                            desiredAmount,
                        ])
                        .and.to.emit(orderbook, "OrderFilled").withArgs(1)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(2)
                        .and.to.emit(orderbook, "OrderFilled").withArgs(3)

                    // Check the newly inserted node in ask side
                    const orderNode = await orderbook.asks(orderID)
                    await verifyOrderNode(orderNode, [aliceOrderAmount, desiredPrice, bob.address, 0])
                })
            })
        })
    })

const approveTokens = async (user: TestAccount): Promise<void> => {
    user.mockERC20.approve(user.orderbook.address, ethers.constants.MaxUint256)
    user.resource.setApprovalForAll(user.orderbook.address, true)
}

const transferTokens = async (deployer: TestAccount, users: TestAccount[]): Promise<void> => {
    await deployer.resource.mint(deployer.address, 1, 1000000000, [])
    const individualNFTAmount = (await deployer.resource.balanceOf(deployer.address, 1)).div(4)

    for (const user of users) {
        approveTokens(user)
        deployer.mockERC20.transfer(user.address, (await deployer.mockERC20.totalSupply()).div(4))
        await deployer.resource.safeTransferFrom(deployer.address, user.address, 1, individualNFTAmount, [])
    }
}

const verifyOrderNode = async (orderNode:[BigNumber, BigNumber, string, BigNumber], matchWith: [BigNumberish, BigNumberish, string, BigNumberish]) => {
    for (let i=0; i<orderNode.length; i++) {
        expect(orderNode[i]).to.be.equal(matchWith[i])
    }
}
