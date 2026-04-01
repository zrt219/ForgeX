// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "../lib/forge-std/src/StdInvariant.sol";
import {ForgeXRegistry} from "../contracts/ForgeXRegistry.sol";
import {ForgeXMessageVault} from "../contracts/ForgeXMessageVault.sol";
import {ForgeXTestBase} from "./utils/ForgeXTestBase.sol";

contract ForgeXHandler {
    ForgeXMessageVault internal immutable VAULT;
    uint256 internal nonce;

    constructor(ForgeXMessageVault vault_) {
        VAULT = vault_;
    }

    function write(string calldata nextMessage) external {
        if (bytes(nextMessage).length == 0 || bytes(nextMessage).length > 96) {
            return;
        }

        nonce += 1;
        VAULT.setMessage(nextMessage, keccak256(abi.encodePacked(nonce, nextMessage)));
    }
}

contract ForgeXMessageVaultInvariantTest is StdInvariant, ForgeXTestBase {
    ForgeXRegistry internal registry;
    ForgeXMessageVault internal vault;
    ForgeXHandler internal handler;
    bytes32 internal constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    function setUp() external {
        registry = new ForgeXRegistry();
        vault = new ForgeXMessageVault(address(registry), "hello");
        registry.grantRole(EXECUTOR_ROLE, address(vault));
        registry.registerDeployment(vault.DEPLOYMENT_ID(), address(vault), address(this));

        handler = new ForgeXHandler(vault);
        vault.grantRole(EXECUTOR_ROLE, address(handler));
        targetContract(address(handler));
    }

    function invariant_LatestRunDigestIsConsumed() external view {
        bytes32 latest = vault.latestForgeRunDigest();
        if (latest != bytes32(0)) {
            assertTrue(vault.consumedRuns(latest));
        }
    }
}
