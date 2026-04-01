// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal role and pause layer for ForgeX. This keeps Foundry workflows simple
/// while making the contract surface explicit and auditable.
abstract contract ForgeXAccessManaged {
    error ForgeXMissingRole(address account, bytes32 role);
    error ForgeXPaused();
    error ForgeXAlreadyPaused();
    error ForgeXNotPaused();

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 role => mapping(address account => bool enabled)) private _roles;

    bool public paused;

    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);
    event Paused(address indexed account);
    event Unpaused(address indexed account);

    modifier onlyRole(bytes32 role) {
        _onlyRole(role);
        _;
    }

    modifier whenNotPaused() {
        _whenNotPaused();
        _;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(EXECUTOR_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function hasRole(bytes32 role, address account) public view returns (bool) {
        return _roles[role][account];
    }

    function grantRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(role, account);
    }

    function revokeRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_roles[role][account]) {
            _roles[role][account] = false;
            emit RoleRevoked(role, account, msg.sender);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        if (paused) {
            revert ForgeXAlreadyPaused();
        }
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        if (!paused) {
            revert ForgeXNotPaused();
        }
        paused = false;
        emit Unpaused(msg.sender);
    }

    function _grantRole(bytes32 role, address account) internal {
        if (!_roles[role][account]) {
            _roles[role][account] = true;
            emit RoleGranted(role, account, msg.sender);
        }
    }

    function _onlyRole(bytes32 role) internal view {
        if (!_roles[role][msg.sender]) {
            revert ForgeXMissingRole(msg.sender, role);
        }
    }

    function _whenNotPaused() internal view {
        if (paused) {
            revert ForgeXPaused();
        }
    }
}
