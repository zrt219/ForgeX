// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ForgeXAccessManaged} from "./ForgeXAccessManaged.sol";
import {ForgeXRegistry} from "./ForgeXRegistry.sol";

contract ForgeXMessageVault is ForgeXAccessManaged {
    error ForgeXEmptyMessage();
    error ForgeXRunAlreadyApplied(bytes32 forgeRunDigest);

    ForgeXRegistry public immutable REGISTRY;
    address public immutable ADMIN;
    bytes32 public immutable DEPLOYMENT_ID;
    uint256 public immutable DEPLOYED_AT;

    string private _message;
    bytes32 public latestForgeRunDigest;
    address public lastExecutor;

    mapping(bytes32 forgeRunDigest => bool consumed) public consumedRuns;

    event MessageUpdated(bytes32 indexed forgeRunDigest, address indexed executor, string message, uint256 timestamp);

    constructor(address registryAddress, string memory initialMessage) {
        if (bytes(initialMessage).length == 0) {
            revert ForgeXEmptyMessage();
        }

        REGISTRY = ForgeXRegistry(registryAddress);
        ADMIN = msg.sender;
        DEPLOYMENT_ID = keccak256(abi.encodePacked(block.chainid, address(this)));
        DEPLOYED_AT = block.timestamp;
        _message = initialMessage;
        latestForgeRunDigest = bytes32(0);
        lastExecutor = msg.sender;
        emit MessageUpdated(bytes32(0), msg.sender, initialMessage, block.timestamp);
    }

    /// @notice Only approved executors can update the message, and each forgeRunDigest can be used once.
    function setMessage(string calldata newMessage, bytes32 forgeRunDigest)
        external
        onlyRole(EXECUTOR_ROLE)
        whenNotPaused
    {
        if (bytes(newMessage).length == 0) {
            revert ForgeXEmptyMessage();
        }
        if (consumedRuns[forgeRunDigest]) {
            revert ForgeXRunAlreadyApplied(forgeRunDigest);
        }

        consumedRuns[forgeRunDigest] = true;
        _message = newMessage;
        latestForgeRunDigest = forgeRunDigest;
        lastExecutor = msg.sender;

        REGISTRY.finalizeRun(forgeRunDigest, DEPLOYMENT_ID, keccak256(bytes(newMessage)), address(this), msg.sender);

        emit MessageUpdated(forgeRunDigest, msg.sender, newMessage, block.timestamp);
    }

    function getMessage() external view returns (string memory) {
        return _message;
    }

    function getDeploymentMeta()
        external
        view
        returns (
            address adminAddress,
            uint256 deployedTimestamp,
            bytes32 registeredDeploymentId,
            address registryAddress
        )
    {
        return (ADMIN, DEPLOYED_AT, DEPLOYMENT_ID, address(REGISTRY));
    }
}
