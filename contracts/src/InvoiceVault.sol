// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title InvoiceVault
 * @notice On-chain record of FERAL invoices and their Tempo virtual addresses.
 *
 * @dev Payment routing is handled natively by Tempo's TIP-20 virtual address system.
 *      Funds flow directly to the master wallet — this contract stores the record only.
 *
 * Virtual address format (Tempo TIP-1022):
 *   0x | masterId (4 bytes) | VIRTUAL_MAGIC (10 bytes) | userTag (6 bytes)
 *
 * userTag = lower 6 bytes of keccak256(invoiceId)
 */
contract InvoiceVault is ReentrancyGuard {

    enum InvoiceStatus { Pending, Paid, Overdue, Cancelled }

    struct Invoice {
        bytes32 invoiceId;
        address businessWallet;
        address virtualAddress;
        bytes6 userTag;
        uint256 amountUsdc;
        address tokenAddress;
        uint64 dueDate;
        bytes32 memo;
        InvoiceStatus status;
        uint256 createdAt;
        address paidBy;
        bytes32 paymentTxHash;
        uint256 paidAt;
    }

    mapping(bytes32 => Invoice) public invoices;
    mapping(address => bytes32) public virtualAddressToInvoice;
    mapping(address => bytes32[]) public businessInvoices;

    address public relayer;
    uint256 public totalInvoices;

    event InvoiceCreated(bytes32 indexed invoiceId, address indexed businessWallet, address virtualAddress, uint256 amountUsdc);
    event InvoicePaid(bytes32 indexed invoiceId, address indexed paidBy, bytes32 paymentTxHash);
    event InvoiceCancelled(bytes32 indexed invoiceId);

    constructor(address _relayer) {
        relayer = _relayer;
    }

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }

    function createInvoice(
        bytes32 invoiceId,
        address virtualAddress,
        bytes6 userTag,
        uint256 amountUsdc,
        address tokenAddress,
        uint64 dueDate,
        bytes32 memo
    ) external nonReentrant {
        require(invoices[invoiceId].businessWallet == address(0), "Already exists");
        require(virtualAddressToInvoice[virtualAddress] == bytes32(0), "Address taken");
        require(amountUsdc > 0, "Amount required");
        require(dueDate > block.timestamp, "Due date in past");

        invoices[invoiceId] = Invoice({
            invoiceId: invoiceId,
            businessWallet: msg.sender,
            virtualAddress: virtualAddress,
            userTag: userTag,
            amountUsdc: amountUsdc,
            tokenAddress: tokenAddress,
            dueDate: dueDate,
            memo: memo,
            status: InvoiceStatus.Pending,
            createdAt: block.timestamp,
            paidBy: address(0),
            paymentTxHash: bytes32(0),
            paidAt: 0
        });

        virtualAddressToInvoice[virtualAddress] = invoiceId;
        businessInvoices[msg.sender].push(invoiceId);
        totalInvoices++;

        emit InvoiceCreated(invoiceId, msg.sender, virtualAddress, amountUsdc);
    }

    function markPaid(
        bytes32 invoiceId,
        address paidBy,
        uint256 amount,
        bytes32 paymentTxHash
    ) external nonReentrant onlyRelayer {
        Invoice storage inv = invoices[invoiceId];
        require(inv.businessWallet != address(0), "Not found");
        require(inv.status == InvoiceStatus.Pending, "Not pending");

        inv.status = InvoiceStatus.Paid;
        inv.paidBy = paidBy;
        inv.paymentTxHash = paymentTxHash;
        inv.paidAt = block.timestamp;

        emit InvoicePaid(invoiceId, paidBy, paymentTxHash);
    }

    function cancelInvoice(bytes32 invoiceId) external nonReentrant {
        require(invoices[invoiceId].businessWallet == msg.sender, "Not owner");
        require(
            invoices[invoiceId].status == InvoiceStatus.Pending ||
            invoices[invoiceId].status == InvoiceStatus.Overdue,
            "Cannot cancel"
        );
        invoices[invoiceId].status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(invoiceId);
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return invoices[invoiceId];
    }

    function getInvoiceByVirtualAddress(address virtualAddress) external view returns (Invoice memory) {
        return invoices[virtualAddressToInvoice[virtualAddress]];
    }

    function getBusinessInvoices(address businessWallet) external view returns (bytes32[] memory) {
        return businessInvoices[businessWallet];
    }

    function updateRelayer(address newRelayer) external onlyRelayer {
        relayer = newRelayer;
    }
}