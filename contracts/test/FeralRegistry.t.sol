// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/FeralRegistry.sol";

contract FeralRegistryTest is Test {
    FeralRegistry registry;

    address owner   = address(0xA);
    address hacker  = address(0xB);
    address vendor  = address(0xC);

    function setUp() public {
        registry = new FeralRegistry();
    }

    function test_RegisterBusiness() public {
        vm.prank(owner);
        bytes32 id = registry.registerBusiness("Acme Agency");

        FeralRegistry.Business memory b = registry.getBusiness(id);
        assertEq(b.masterWallet, owner);
        assertEq(b.name, "Acme Agency");
        assertTrue(b.active);
    }

    function test_CannotRegisterTwice() public {
        vm.startPrank(owner);
        registry.registerBusiness("Acme");
        vm.expectRevert("Already registered");
        registry.registerBusiness("Acme");
        vm.stopPrank();
    }

    function test_AddHumanAndAgent() public {
        vm.startPrank(owner);
        bytes32 id = registry.registerBusiness("Acme");

        registry.addTeamMember(id, address(0xAA), "Alice", FeralRegistry.MemberType.Human, 50000);
        registry.addTeamMember(id, address(0xBB), "Claude Agent", FeralRegistry.MemberType.Agent, 5000);

        assertEq(registry.getBusiness(id).memberCount, 2);
        assertEq(uint(registry.getTeamMember(id, address(0xBB)).memberType), uint(FeralRegistry.MemberType.Agent));
        vm.stopPrank();
    }

    function test_VendorApproveRevoke() public {
        vm.startPrank(owner);
        bytes32 id = registry.registerBusiness("Acme");
        registry.approveVendor(id, vendor, "Notion");
        assertTrue(registry.isVendorApproved(id, vendor));
        registry.revokeVendor(id, vendor);
        assertFalse(registry.isVendorApproved(id, vendor));
        vm.stopPrank();
    }

    function test_OnlyOwnerCanManage() public {
        vm.prank(owner);
        bytes32 id = registry.registerBusiness("Acme");
        vm.prank(hacker);
        vm.expectRevert("Not business owner");
        registry.approveVendor(id, vendor, "Notion");
    }
}