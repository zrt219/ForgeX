// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "../../lib/forge-std/src/Vm.sol";

abstract contract ForgeXTestBase {
    address internal constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm internal constant VM = Vm(HEVM_ADDRESS);

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "assertEq(bytes32) failed");
    }

    function assertEq(string memory left, string memory right) internal pure {
        require(keccak256(bytes(left)) == keccak256(bytes(right)), "assertEq(string) failed");
    }
}
