// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ForgeXAccessManaged} from "./ForgeXAccessManaged.sol";

contract ForgeXRegistry is ForgeXAccessManaged {
    error ForgeXInvalidAddress();
    error ForgeXDeploymentAlreadyRegistered(bytes32 deploymentId);
    error ForgeXDeploymentNotFound(bytes32 deploymentId);
    error ForgeXRunAlreadyFinalized(bytes32 forgeRunDigest);

    struct DeploymentRecord {
        address vault;
        address executor;
        uint64 registeredAt;
        bool exists;
    }

    struct RunRecord {
        bytes32 deploymentId;
        bytes32 actionHash;
        address target;
        address executor;
        uint64 finalizedAt;
        bool exists;
    }

    mapping(bytes32 deploymentId => DeploymentRecord record) private _deployments;
    mapping(bytes32 forgeRunDigest => RunRecord record) private _runs;

    event DeploymentRegistered(bytes32 indexed deploymentId, address indexed vault, address indexed executor);
    event RunFinalized(
        bytes32 indexed forgeRunDigest,
        bytes32 indexed deploymentId,
        address indexed target,
        address executor,
        bytes32 actionHash
    );

    function registerDeployment(bytes32 deploymentId, address vault, address executor)
        external
        onlyRole(EXECUTOR_ROLE)
        whenNotPaused
    {
        if (vault == address(0) || executor == address(0)) {
            revert ForgeXInvalidAddress();
        }
        if (_deployments[deploymentId].exists) {
            revert ForgeXDeploymentAlreadyRegistered(deploymentId);
        }

        _deployments[deploymentId] =
            DeploymentRecord({vault: vault, executor: executor, registeredAt: uint64(block.timestamp), exists: true});

        emit DeploymentRegistered(deploymentId, vault, executor);
    }

    function finalizeRun(
        bytes32 forgeRunDigest,
        bytes32 deploymentId,
        bytes32 actionHash,
        address target,
        address executor
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused {
        if (!_deployments[deploymentId].exists) {
            revert ForgeXDeploymentNotFound(deploymentId);
        }
        if (_runs[forgeRunDigest].exists) {
            revert ForgeXRunAlreadyFinalized(forgeRunDigest);
        }

        _runs[forgeRunDigest] = RunRecord({
            deploymentId: deploymentId,
            actionHash: actionHash,
            target: target,
            executor: executor,
            finalizedAt: uint64(block.timestamp),
            exists: true
        });

        emit RunFinalized(forgeRunDigest, deploymentId, target, executor, actionHash);
    }

    function getDeployment(bytes32 deploymentId) external view returns (DeploymentRecord memory) {
        return _deployments[deploymentId];
    }

    function getRun(bytes32 forgeRunDigest) external view returns (RunRecord memory) {
        return _runs[forgeRunDigest];
    }
}
