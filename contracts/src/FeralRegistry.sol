// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeralRegistry
 * @notice On-chain registry for FERAL business accounts and their vendor directories.
 *
 * @dev Core spend enforcement is handled by Tempo's AccountKeychain precompile at
 *      0xAAAAAAAA00000000000000000000000000000000 — not this contract.
 *      This contract provides verifiable, auditable business metadata on-chain.
 */
contract FeralRegistry is ReentrancyGuard {

    enum MemberType { Human, Agent }

    struct Business {
        bytes32 businessId;
        address masterWallet;
        string name;
        bool active;
        uint256 registeredAt;
        uint256 memberCount;
        uint256 vendorCount;
    }

    struct TeamMember {
        address accessKeyId;
        string name;
        MemberType memberType;
        uint256 weeklyLimitUsdcCents;
        bool active;
        uint256 addedAt;
    }

    struct Vendor {
        address vendorAddress;
        string vendorName;
        bool approved;
        uint256 addedAt;
    }

    // businessId => Business
    mapping(bytes32 => Business) public businesses;
    // masterWallet => businessId
    mapping(address => bytes32) public walletToBusinessId;
    // businessId => accessKeyId => TeamMember
    mapping(bytes32 => mapping(address => TeamMember)) public teamMembers;
    // businessId => accessKeyId[]
    mapping(bytes32 => address[]) public businessMemberKeys;
    // businessId => vendorAddress => Vendor
    mapping(bytes32 => mapping(address => Vendor)) public vendors;
    // businessId => vendorAddress[]
    mapping(bytes32 => address[]) public businessVendorAddresses;

    uint256 public totalBusinesses;

    event BusinessRegistered(bytes32 indexed businessId, address indexed masterWallet, string name);
    event TeamMemberAdded(bytes32 indexed businessId, address indexed accessKeyId, string name, MemberType memberType);
    event TeamMemberRevoked(bytes32 indexed businessId, address indexed accessKeyId);
    event VendorApproved(bytes32 indexed businessId, address indexed vendorAddress, string vendorName);
    event VendorRevoked(bytes32 indexed businessId, address indexed vendorAddress);

    modifier onlyBusinessOwner(bytes32 businessId) {
        require(businesses[businessId].masterWallet == msg.sender, "Not business owner");
        _;
    }

    function registerBusiness(string calldata name)
        external nonReentrant returns (bytes32 businessId)
    {
        require(bytes(name).length > 0 && bytes(name).length <= 100, "Invalid name");
        require(walletToBusinessId[msg.sender] == bytes32(0), "Already registered");

        businessId = keccak256(abi.encodePacked(msg.sender, name, block.timestamp));

        businesses[businessId] = Business({
            businessId: businessId,
            masterWallet: msg.sender,
            name: name,
            active: true,
            registeredAt: block.timestamp,
            memberCount: 0,
            vendorCount: 0
        });

        walletToBusinessId[msg.sender] = businessId;
        totalBusinesses++;

        emit BusinessRegistered(businessId, msg.sender, name);
    }

    function addTeamMember(
        bytes32 businessId,
        address accessKeyId,
        string calldata name,
        MemberType memberType,
        uint256 weeklyLimitUsdcCents
    ) external nonReentrant onlyBusinessOwner(businessId) {
        require(accessKeyId != address(0), "Invalid key ID");
        require(!teamMembers[businessId][accessKeyId].active, "Already active");

        teamMembers[businessId][accessKeyId] = TeamMember({
            accessKeyId: accessKeyId,
            name: name,
            memberType: memberType,
            weeklyLimitUsdcCents: weeklyLimitUsdcCents,
            active: true,
            addedAt: block.timestamp
        });

        businessMemberKeys[businessId].push(accessKeyId);
        businesses[businessId].memberCount++;

        emit TeamMemberAdded(businessId, accessKeyId, name, memberType);
    }

    function revokeTeamMember(bytes32 businessId, address accessKeyId)
        external nonReentrant onlyBusinessOwner(businessId)
    {
        require(teamMembers[businessId][accessKeyId].active, "Not active");
        teamMembers[businessId][accessKeyId].active = false;
        businesses[businessId].memberCount--;
        emit TeamMemberRevoked(businessId, accessKeyId);
    }

    function approveVendor(bytes32 businessId, address vendorAddress, string calldata vendorName)
        external nonReentrant onlyBusinessOwner(businessId)
    {
        require(vendorAddress != address(0), "Invalid address");
        require(!vendors[businessId][vendorAddress].approved, "Already approved");

        vendors[businessId][vendorAddress] = Vendor({
            vendorAddress: vendorAddress,
            vendorName: vendorName,
            approved: true,
            addedAt: block.timestamp
        });

        businessVendorAddresses[businessId].push(vendorAddress);
        businesses[businessId].vendorCount++;

        emit VendorApproved(businessId, vendorAddress, vendorName);
    }

    function revokeVendor(bytes32 businessId, address vendorAddress)
        external nonReentrant onlyBusinessOwner(businessId)
    {
        require(vendors[businessId][vendorAddress].approved, "Not approved");
        vendors[businessId][vendorAddress].approved = false;
        businesses[businessId].vendorCount--;
        emit VendorRevoked(businessId, vendorAddress);
    }

    // ─── View Functions ───────────────────────────────────────────────────

    function getBusiness(bytes32 businessId) external view returns (Business memory) {
        return businesses[businessId];
    }

    function getBusinessByWallet(address wallet) external view returns (Business memory) {
        return businesses[walletToBusinessId[wallet]];
    }

    function isVendorApproved(bytes32 businessId, address vendor) external view returns (bool) {
        return vendors[businessId][vendor].approved;
    }

    function getTeamMember(bytes32 businessId, address accessKeyId)
        external view returns (TeamMember memory)
    {
        return teamMembers[businessId][accessKeyId];
    }

    function getBusinessVendors(bytes32 businessId) external view returns (address[] memory) {
        return businessVendorAddresses[businessId];
    }

    function getBusinessMembers(bytes32 businessId) external view returns (address[] memory) {
        return businessMemberKeys[businessId];
    }
}