// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @title StealthAddressAnnouncer (ERC-5564)
/// @notice Singleton contract that emits Announcement events when something is sent to a stealth address.
///         One deployment per chain so scanners (e.g. Opaque Cash) can subscribe to a single log source.
/// @dev schemeId 1 = secp256k1 with view tags. metadata MUST have view tag as first byte; remaining
///      bytes can be used for encrypted payment IDs or other sender-defined data.
/// @dev See https://eips.ethereum.org/EIPS/eip-5564
contract StealthAddressAnnouncer {
    /// @notice Emitted when a sender announces a stealth transfer.
    /// @param schemeId Stealth scheme (1 = secp256k1).
    /// @param stealthAddress The one-time stealth address for the recipient.
    /// @param caller The address that called announce (sender or relayer).
    /// @param ephemeralPubKey Ephemeral public key used to derive the stealth address.
    /// @param metadata First byte MUST be the view tag; rest is optional (e.g. encrypted payment ID).
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    /// @notice Emit an announcement so the recipient's scanner can detect the transfer.
    /// @param schemeId Stealth address scheme; use 1 for secp256k1 (ERC-5564).
    /// @param stealthAddress The computed stealth address for the recipient.
    /// @param ephemeralPubKey Ephemeral public key used by the sender to derive the stealth address.
    /// @param metadata First byte MUST be the view tag (msb of Keccak256(shared_secret)); remaining
    ///        bytes are optional (e.g. encrypted payment ID for future flexibility).
    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
