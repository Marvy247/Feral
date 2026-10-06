// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/InvoiceVault.sol";

contract InvoiceVaultTest is Test {
    InvoiceVault vault;

    address relayer  = address(0x1);
    address business = address(0x2);
    address payer    = address(0x3);
    address usdc     = address(0x4);
    address vAddr    = address(0x2612766cFDFDFDFDFDFDFDFDFD0000);
    bytes6  userTag  = bytes6(hex"000000000001");

    function setUp() public {
        vault = new InvoiceVault(relayer);
    }

    function test_CreateAndPay() public {
        bytes32 invId = keccak256("inv-001");

        vm.prank(business);
        vault.createInvoice(invId, vAddr, userTag, 1250_000000, usdc, uint64(block.timestamp + 7 days), bytes32("INV-0001"));

        assertEq(uint(vault.getInvoice(invId).status), uint(InvoiceVault.InvoiceStatus.Pending));

        vm.prank(relayer);
        vault.markPaid(invId, payer, 1250_000000, keccak256("tx-hash"));

        assertTrue(vault.getInvoice(invId).paidBy == payer);
        assertEq(uint(vault.getInvoice(invId).status), uint(InvoiceVault.InvoiceStatus.Paid));
    }

    function test_LookupByVirtualAddress() public {
        bytes32 invId = keccak256("inv-002");
        vm.prank(business);
        vault.createInvoice(invId, vAddr, userTag, 500_000000, usdc, uint64(block.timestamp + 7 days), bytes32("INV-0002"));

        InvoiceVault.Invoice memory inv = vault.getInvoiceByVirtualAddress(vAddr);
        assertEq(inv.invoiceId, invId);
    }

    function test_OnlyRelayerCanMarkPaid() public {
        bytes32 invId = keccak256("inv-003");
        vm.prank(business);
        vault.createInvoice(invId, vAddr, userTag, 100_000000, usdc, uint64(block.timestamp + 7 days), bytes32("INV-0003"));

        vm.prank(address(0xAB));
        vm.expectRevert("Not relayer");
        vault.markPaid(invId, payer, 100_000000, bytes32(0));
    }
}