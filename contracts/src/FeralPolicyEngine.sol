// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeralPolicyEngine
 * @notice Protocol-enforced spend policy, in the payment path.
 *
 * The treasury never calls `token.transfer()` directly for member spend:
 * every payment executes `pay()`, which checks the on-chain policy first and
 * REVERTS with a machine-readable error when policy is violated:
 *
 *   - MemberInactive()        — the member/agent was revoked (kill switch)
 *   - CallNotAllowed()        — target vendor is not on the member's approved list
 *   - SpendingLimitExceeded() — weekly limit would be surpassed
 *
 * Policy state is written by the owner (the business treasury key) whenever
 * the dashboard mutates team/vendor/limit settings, so the dashboard DB and
 * the chain stay in sync and the CHAIN is the authority at payment time.
 *
 * Design notes:
 * - Amounts are in the token's base units (TIP-20 stablecoins: 6 decimals).
 * - Weekly accounting is per (business, member, weekIndex) where
 *   weekIndex = timestamp / 1 weeks; the mapping persists across weeks so
 *   every week starts from a fresh accumulator.
 * - `weeklyLimit == 0` means no spend is allowed (matches the app's rules).
 */
contract FeralPolicyEngine is ReentrancyGuard {
    error NotOwner();
    error MemberInactive();
    error CallNotAllowed();
    error SpendingLimitExceeded();
    error InvalidAddress();

    /// @notice Only the treasury (business owner key) may sync policy or pay.
    address public immutable owner;
    /// @notice TIP-20 stablecoin the engine moves (approve()d by the treasury).
    IERC20 public immutable token;

    struct MemberPolicy {
        uint256 weeklyLimit; // token base units per week
        bool active;
    }

    // businessId => member => policy
    mapping(bytes32 => mapping(address => MemberPolicy)) public memberPolicy;
    // businessId => member => vendor => approved
    mapping(bytes32 => mapping(address => mapping(address => bool))) public vendorApproved;
    // businessId => member => weekIndex => spent base units this week
    mapping(bytes32 => mapping(address => mapping(uint256 => uint256))) public weeklySpent;

    event MemberSynced(bytes32 indexed businessId, address indexed member, uint256 weeklyLimit, bool active);
    event VendorSynced(bytes32 indexed businessId, address indexed member, address indexed vendor, bool approved);
    event PolicyPayment(
        bytes32 indexed businessId,
        address indexed member,
        address indexed vendor,
        uint256 amount,
        uint256 weekIndex
    );

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address token_) {
        if (token_ == address(0)) revert InvalidAddress();
        owner = msg.sender;
        token = IERC20(token_);
    }

    /**
     * @notice Push a member's full policy (limit, active flag, approved
     *         vendors) in a single transaction. Called by the backend when a
     *         member/agent is created or updated in the dashboard.
     * @dev    Re-syncing a vendor only ADDS approvals; use
     *         `setVendorApproved(..., false)` to revoke.
     */
    function syncMember(
        bytes32 businessId,
        address member,
        uint256 weeklyLimit,
        bool active,
        address[] calldata approvedVendors
    ) external onlyOwner {
        if (member == address(0)) revert InvalidAddress();
        memberPolicy[businessId][member] = MemberPolicy({weeklyLimit: weeklyLimit, active: active});
        emit MemberSynced(businessId, member, weeklyLimit, active);

        for (uint256 i = 0; i < approvedVendors.length; i++) {
            address vendor = approvedVendors[i];
            if (vendor == address(0)) revert InvalidAddress();
            vendorApproved[businessId][member][vendor] = true;
            emit VendorSynced(businessId, member, vendor, true);
        }
    }

    /// @notice Toggle one vendor on/off for a member (kill switch granularity).
    function setVendorApproved(
        bytes32 businessId,
        address member,
        address vendor,
        bool approved
    ) external onlyOwner {
        if (vendor == address(0)) revert InvalidAddress();
        vendorApproved[businessId][member][vendor] = approved;
        emit VendorSynced(businessId, member, vendor, approved);
    }

    /**
     * @notice Execute a policy-checked payment from the treasury to a vendor.
     *         Reverts (no state change, no transfer) when policy is violated.
     */
    function pay(
        bytes32 businessId,
        address member,
        address vendor,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (vendor == address(0)) revert InvalidAddress();

        MemberPolicy memory mp = memberPolicy[businessId][member];
        if (!mp.active) revert MemberInactive();
        if (!vendorApproved[businessId][member][vendor]) revert CallNotAllowed();

        uint256 week = block.timestamp / 1 weeks;
        uint256 spent = weeklySpent[businessId][member][week];
        if (spent + amount > mp.weeklyLimit) revert SpendingLimitExceeded();

        weeklySpent[businessId][member][week] = spent + amount;

        // Treasury funded this allowance up-front; moves funds to the vendor.
        token.transferFrom(msg.sender, vendor, amount);

        emit PolicyPayment(businessId, member, vendor, amount, week);
    }

    // ─── Views (used by the backend/UI for read-only checks) ───────────────

    /// @notice Dry-run policy verdict without moving funds.
    function check(
        bytes32 businessId,
        address member,
        address vendor,
        uint256 amount
    ) external view returns (bool allowed, bytes32 reason) {
        MemberPolicy memory mp = memberPolicy[businessId][member];
        if (!mp.active) return (false, "MemberInactive");
        if (!vendorApproved[businessId][member][vendor]) return (false, "CallNotAllowed");
        uint256 spent = weeklySpent[businessId][member][block.timestamp / 1 weeks];
        if (spent + amount > mp.weeklyLimit) return (false, "SpendingLimitExceeded");
        return (true, "OK");
    }

    /// @notice Base units spent by a member in the current week.
    function spentThisWeek(bytes32 businessId, address member) external view returns (uint256) {
        return weeklySpent[businessId][member][block.timestamp / 1 weeks];
    }
}
