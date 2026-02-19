// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @title StealthMetaAddressRegistry (ERC-6538)
/// @notice Canonical registry mapping accounts to their stealth meta-addresses.
///         Use schemeId 1 for secp256k1 (ERC-5564). One singleton per chain.
/// @dev See https://eips.ethereum.org/EIPS/eip-6538
contract StealthMetaAddressRegistry {
    /// @notice Emitted when an invalid signature is provided to `registerKeysOnBehalf`.
    error StealthMetaAddressRegistry__InvalidSignature();

    /// @notice Stealth meta-address for a given registrant and scheme.
    /// @dev schemeId: 1 = secp256k1 with view tags (ERC-5564).
    mapping(address registrant => mapping(uint256 schemeId => bytes)) public stealthMetaAddressOf;

    /// @notice Nonce for replay protection when registering on behalf of another account.
    mapping(address registrant => uint256) public nonceOf;

    /// @notice EIP-712 type hash for `registerKeysOnBehalf` payload.
    bytes32 public constant ERC6538REGISTRY_ENTRY_TYPE_HASH =
        keccak256("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)");

    uint256 internal immutable INITIAL_CHAIN_ID;
    bytes32 internal immutable INITIAL_DOMAIN_SEPARATOR;

    /// @notice Emitted when a registrant sets or updates their stealth meta-address.
    event StealthMetaAddressSet(
        address indexed registrant,
        uint256 indexed schemeId,
        bytes stealthMetaAddress
    );

    /// @notice Emitted when a registrant increments their nonce.
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    constructor() {
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();
    }

    /// @notice Sets the caller's stealth meta-address for the given scheme (e.g. 1 for secp256k1).
    /// @param schemeId Stealth address scheme; use 1 for secp256k1 (ERC-5564).
    /// @param stealthMetaAddress The stealth meta-address (e.g. spendingPubKey || viewingPubKey).
    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        stealthMetaAddressOf[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Alias for registerKeys for API compatibility.
    function register(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        stealthMetaAddressOf[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Sets the registrant's stealth meta-address using their EIP-712 or EIP-1271 signature.
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes memory signature,
        bytes calldata stealthMetaAddress
    ) external {
        bytes32 dataHash;
        address recoveredAddress;

        unchecked {
            dataHash = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR(),
                    keccak256(
                        abi.encode(
                            ERC6538REGISTRY_ENTRY_TYPE_HASH,
                            schemeId,
                            keccak256(stealthMetaAddress),
                            nonceOf[registrant]++
                        )
                    )
                )
            );
        }

        if (signature.length == 65) {
            bytes32 r;
            bytes32 s;
            uint8 v;
            assembly ("memory-safe") {
                r := mload(add(signature, 0x20))
                s := mload(add(signature, 0x40))
                v := byte(0, mload(add(signature, 0x60)))
            }
            recoveredAddress = ecrecover(dataHash, v, r, s);
        }

        if (
            (recoveredAddress == address(0) || recoveredAddress != registrant)
                && (
                    IERC1271(registrant).isValidSignature(dataHash, signature)
                        != IERC1271.isValidSignature.selector
                )
        ) revert StealthMetaAddressRegistry__InvalidSignature();

        stealthMetaAddressOf[registrant][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(registrant, schemeId, stealthMetaAddress);
    }

    /// @notice Increments the sender's nonce to invalidate existing signatures.
    function incrementNonce() external {
        unchecked {
            nonceOf[msg.sender]++;
        }
        emit NonceIncremented(msg.sender, nonceOf[msg.sender]);
    }

    /// @notice Returns the EIP-712 domain separator (recomputed on chain fork).
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator();
    }

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("ERC6538Registry"),
                keccak256("1.0"),
                block.chainid,
                address(this)
            )
        );
    }
}

/// @notice EIP-1271: contract signature validation.
interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue);
}
