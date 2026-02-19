// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @dev ERC-5564 Announcer interface: emit announcements for stealth address transfers.
interface IStealthAddressAnnouncer {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function announce(
        uint256 schemeId,
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external;
}
