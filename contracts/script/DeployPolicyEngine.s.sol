// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/FeralPolicyEngine.sol";

/**
 * Deploys the FeralPolicyEngine and grants it an unlimited allowance on the
 * treasury's TIP-20 stablecoin so `engine.pay()` can move funds under policy.
 *
 *   forge script script/DeployPolicyEngine.s.sol --rpc-url $TEMPO_RPC_URL \
 *     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --gas-estimate-multiplier 700
 */
contract DeployPolicyEngine is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address token = vm.envAddress("USDC_ADDRESS");

        console.log("Deployer:", deployer);
        console.log("Token:", token);

        vm.startBroadcast(deployerKey);

        FeralPolicyEngine engine = new FeralPolicyEngine(token);
        console.log("FeralPolicyEngine:", address(engine));

        vm.stopBroadcast();

        // NOTE: the treasury allowance is intentionally NOT set here — this
        // foundry build's revm cannot execute PathUSD's TIP-20 approve() in
        // script simulation (OpcodeNotFound). Set it against the real chain:
        //   cast send $USDC "approve(address,uint256)" <engine> \
        //     \&type(uint256).max --rpc-url $TEMPO_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY

        console.log("\n=== Copy to .env files ===");
        console.log("FERAL_POLICY_ENGINE_ADDRESS=", address(engine));
    }
}
