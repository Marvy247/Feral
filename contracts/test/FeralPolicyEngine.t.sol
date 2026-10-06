// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/FeralPolicyEngine.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "mUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract FeralPolicyEngineTest is Test {
    FeralPolicyEngine engine;
    MockUSDC token;

    bytes32 constant BIZ = keccak256("acme-uuid");
    address member = address(0xAA);
    address vendor = address(0xC0FFEE);
    address outsider = address(0xB);

    uint256 constant LIMIT_500 = 500e6;

    function setUp() public {
        token = new MockUSDC();
        // owner of the engine = this test contract (msg.sender of constructor)
        engine = new FeralPolicyEngine(address(token));
        token.mint(address(this), 1_000_000e6);
        token.approve(address(engine), type(uint256).max);
    }

    function _sync(uint256 limit, bool active) internal {
        address[] memory vendors = new address[](1);
        vendors[0] = vendor;
        engine.syncMember(BIZ, member, limit, active, vendors);
    }

    function test_PayHappyPath() public {
        _sync(LIMIT_500, true);

        engine.pay(BIZ, member, vendor, 125e6);

        assertEq(token.balanceOf(vendor), 125e6);
        assertEq(engine.spentThisWeek(BIZ, member), 125e6);
    }

    function test_RevertWhenVendorNotApproved() public {
        _sync(LIMIT_500, true);
        address rogue = address(0xDEAD);

        vm.expectRevert(FeralPolicyEngine.CallNotAllowed.selector);
        engine.pay(BIZ, member, rogue, 10e6);
    }

    function test_RevertWhenMemberInactive_KillSwitch() public {
        _sync(LIMIT_500, true);
        // Owner flips the member off (dashboard revoke -> on-chain)
        engine.syncMember(BIZ, member, LIMIT_500, false, new address[](0));

        vm.expectRevert(FeralPolicyEngine.MemberInactive.selector);
        engine.pay(BIZ, member, vendor, 10e6);
    }

    function test_RevertWhenOverWeeklyLimit() public {
        _sync(LIMIT_500, true);

        engine.pay(BIZ, member, vendor, 400e6); // 400 of 500 spent

        vm.expectRevert(FeralPolicyEngine.SpendingLimitExceeded.selector);
        engine.pay(BIZ, member, vendor, 200e6); // would total 600
    }

    function test_LimitAccumulatesAcrossPayments() public {
        _sync(LIMIT_500, true);
        engine.pay(BIZ, member, vendor, 300e6);
        engine.pay(BIZ, member, vendor, 200e6); // exactly at limit: allowed

        assertEq(token.balanceOf(vendor), 500e6);
        assertEq(engine.spentThisWeek(BIZ, member), 500e6);
    }

    function test_WeeklyWindowResets() public {
        _sync(LIMIT_500, true);
        engine.pay(BIZ, member, vendor, 500e6);

        // next week the accumulator starts fresh
        vm.warp(block.timestamp + 7 days);
        engine.pay(BIZ, member, vendor, 500e6);
        assertEq(token.balanceOf(vendor), 1000e6);
    }

    function test_RevokeVendorBlocksPayment() public {
        _sync(LIMIT_500, true);
        engine.setVendorApproved(BIZ, member, vendor, false);

        vm.expectRevert(FeralPolicyEngine.CallNotAllowed.selector);
        engine.pay(BIZ, member, vendor, 1e6);
    }

    function test_OnlyOwnerCanSyncAndPay() public {
        vm.prank(outsider);
        vm.expectRevert(FeralPolicyEngine.NotOwner.selector);
        engine.syncMember(BIZ, member, LIMIT_500, true, new address[](0));

        vm.prank(outsider);
        vm.expectRevert(FeralPolicyEngine.NotOwner.selector);
        engine.pay(BIZ, member, vendor, 1e6);
    }

    function test_CheckViewReturnsReasons() public {
        _sync(LIMIT_500, true);

        (bool ok, bytes32 reason) = engine.check(BIZ, member, vendor, 100e6);
        assertTrue(ok);
        assertEq(reason, "OK");

        (ok, reason) = engine.check(BIZ, member, address(0xDEAD), 1e6);
        assertFalse(ok);
        assertEq(reason, "CallNotAllowed");

        (ok, reason) = engine.check(BIZ, member, vendor, 600e6);
        assertFalse(ok);
        assertEq(reason, "SpendingLimitExceeded");

        engine.syncMember(BIZ, member, LIMIT_500, false, new address[](0));
        (ok, reason) = engine.check(BIZ, member, vendor, 1e6);
        assertFalse(ok);
        assertEq(reason, "MemberInactive");
    }

    function test_RevertWhenFundsNotApproved() public {
        // engine has no allowance: policy passes but transferFrom fails
        _sync(LIMIT_500, true);
        token.approve(address(engine), 0);

        vm.expectRevert(); // ERC20: insufficient allowance
        engine.pay(BIZ, member, vendor, 1e6);
    }
}
