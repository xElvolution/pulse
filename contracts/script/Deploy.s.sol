// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {PulseWill} from "../src/PulseWill.sol";

/// @notice Deploys PulseWill. The verifier is the account that performs email-OTP
///         claims for wallet-less heirs (defaults to the deployer for the demo).
///         forge script script/Deploy.s.sol --rpc-url monad_testnet --private-key $PK --broadcast
contract DeployPulse is Script {
    function run() external {
        address verifier = vm.envOr("VERIFIER_ADDRESS", msg.sender);
        vm.startBroadcast();
        PulseWill pulse = new PulseWill(verifier);
        vm.stopBroadcast();
        console.log("PulseWill deployed at:", address(pulse));
        console.log("Verifier:", verifier);
    }
}
