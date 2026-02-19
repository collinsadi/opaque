# Opaque Cash — Smart Contracts

Core stealth address infrastructure for **Opaque Cash**: ERC-6538 Registry and ERC-5564 Announcer.

- **Solidity:** `^0.8.20`

## Contracts

### 1. `StealthMetaAddressRegistry` (ERC-6538)

**Role:** The “phonebook” — maps an address (e.g. `bob.eth`) to a stealth meta-address (viewing + spending public keys).

- **Storage:** `stealthMetaAddressOf[registrant][schemeId]` → `bytes` meta-address.
- **Actions:**
  - `registerKeys(schemeId, stealthMetaAddress)` — set caller’s meta-address.
  - `register(schemeId, stealthMetaAddress)` — alias for `registerKeys`.
  - `registerKeysOnBehalf(registrant, schemeId, signature, stealthMetaAddress)` — register using EIP-712 / EIP-1271.
  - `incrementNonce()` — invalidate previous signatures.
- **Event:** `StealthMetaAddressSet(registrant, schemeId, stealthMetaAddress)`.

Use **schemeId = 1** for secp256k1 (ERC-5564). Deploy as a **singleton** per chain so everyone reads from the same registry.

### 2. `StealthAddressAnnouncer` (ERC-5564)

**Role:** The “signal” — when a sender transfers to a stealth address, they call `announce()` so the recipient’s scanner can see it.

- **Action:** `announce(schemeId, stealthAddress, ephemeralPubKey, metadata)`.
- **Event:** `Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata)`.

**Metadata:** First byte **MUST** be the view tag (MSB of `Keccak256(shared_secret)`). Remaining bytes are optional (e.g. encrypted payment ID). Your Rust scanner should subscribe to this contract’s `Announcement` events and filter by view tag before doing full DKSAP derivation.

Deploy as a **singleton** per chain so all announcements are in one place for the scanner.

## Integration

- **Registry:** Resolve a recipient’s meta-address with `registry.stealthMetaAddressOf(bob, 1)` then derive the stealth address and call `announcer.announce(...)` before sending funds.
- **Announcer:** In your app or relayer, call `announcer.announce(1, stealthAddress, ephemeralPubKey, metadata)` (with `metadata[0] = viewTag`) so the recipient’s scanner can pick it up.

No OpenZeppelin dependencies are required for these two contracts.
