// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @dev ERC-6538 Registry interface for mapping accounts to stealth meta-addresses.
interface IStealthMetaAddressRegistry {
    error StealthMetaAddressRegistry__InvalidSignature();

    event StealthMetaAddressSet(
        address indexed registrant,
        uint256 indexed schemeId,
        bytes stealthMetaAddress
    );
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory);
    function nonceOf(address registrant) external view returns (uint256);
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external;
    function register(uint256 schemeId, bytes calldata stealthMetaAddress) external;
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes memory signature,
        bytes calldata stealthMetaAddress
    ) external;
    function incrementNonce() external;
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function ERC6538REGISTRY_ENTRY_TYPE_HASH() external view returns (bytes32);
}
