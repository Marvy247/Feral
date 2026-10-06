// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/FeralRegistry.sol";
import "../src/InvoiceVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid); // must be 268

        vm.startBroadcast(deployerKey);

        FeralRegistry registry = new FeralRegistry();
        console.log("FeralRegistry:", address(registry));

        // Initial relayer = deployer; update to backend service address after deploy
        InvoiceVault vault = new InvoiceVault(deployer);
        console.log("InvoiceVault:", address(vault));

        vm.stopBroadcast();

        console.log("\n=== Copy to .env files ===");
        console.log("FERAL_REGISTRY_ADDRESS=", address(registry));
        console.log("INVOICE_VAULT_ADDRESS=", address(vault));
    }
}