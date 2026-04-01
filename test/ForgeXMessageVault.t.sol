// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ForgeXRegistry} from "../contracts/ForgeXRegistry.sol";
import {ForgeXMessageVault} from "../contracts/ForgeXMessageVault.sol";
import {ForgeXAccessManaged} from "../contracts/ForgeXAccessManaged.sol";
import {ForgeXTestBase} from "./utils/ForgeXTestBase.sol";

contract ForgeXMessageVaultTest is ForgeXTestBase {
    ForgeXRegistry internal registry;
    ForgeXMessageVault internal vault;

    address internal executor = address(0xBEEF);
    address internal pauser = address(0xCAFE);
    address internal unauthorized = address(0xDEAD);
    bytes32 internal constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    function setUp() external {
        registry = new ForgeXRegistry();
        vault = new ForgeXMessageVault(address(registry), "hello");

        registry.grantRole(EXECUTOR_ROLE, address(vault));
        registry.registerDeployment(vault.DEPLOYMENT_ID(), address(vault), address(this));
        vault.grantRole(EXECUTOR_ROLE, executor);
        vault.grantRole(PAUSER_ROLE, pauser);
    }

    function testExecutorCanSetMessage() external {
        bytes32 runDigest = keccak256("run-1");

        VM.prank(executor);
        vault.setMessage("updated", runDigest);

        assertEq(vault.getMessage(), "updated");
        assertEq(vault.latestForgeRunDigest(), runDigest);
    }

    function testUnauthorizedCallerCannotSetMessage() external {
        VM.prank(unauthorized);
        VM.expectRevert();
        vault.setMessage("bad", keccak256("run-2"));
    }

    function testDuplicateForgeRunDigestReverts() external {
        bytes32 runDigest = keccak256("run-3");

        VM.startPrank(executor);
        vault.setMessage("updated", runDigest);
        VM.expectRevert(abi.encodeWithSelector(ForgeXMessageVault.ForgeXRunAlreadyApplied.selector, runDigest));
        vault.setMessage("updated again", runDigest);
        VM.stopPrank();
    }

    function testPauseBlocksWrites() external {
        VM.prank(pauser);
        vault.pause();

        VM.prank(executor);
        VM.expectRevert(ForgeXAccessManaged.ForgeXPaused.selector);
        vault.setMessage("blocked", keccak256("run-4"));
    }

    function testFuzzExecutorSetMessage(string memory nextMessage) external {
        VM.assume(bytes(nextMessage).length > 0);
        VM.assume(bytes(nextMessage).length < 120);

        VM.prank(executor);
        vault.setMessage(nextMessage, keccak256(bytes(nextMessage)));

        assertEq(vault.getMessage(), nextMessage);
    }
}
