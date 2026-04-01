// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "../lib/forge-std/src/Script.sol";
import {ForgeXRegistry} from "../contracts/ForgeXRegistry.sol";
import {ForgeXMessageVault} from "../contracts/ForgeXMessageVault.sol";

contract DeployScript is Script {
    function run() external returns (ForgeXRegistry registry, ForgeXMessageVault vault) {
        string memory initialMessage =
            vm.envOr("FORGEX_INITIAL_MESSAGE", string(unicode"🗻 ForgeX online on XRPL EVM"));

        vm.startBroadcast();
        registry = new ForgeXRegistry();
        vault = new ForgeXMessageVault(address(registry), initialMessage);
        registry.grantRole(registry.EXECUTOR_ROLE(), address(vault));
        registry.registerDeployment(vault.DEPLOYMENT_ID(), address(vault), msg.sender);
        vm.stopBroadcast();
    }
}
