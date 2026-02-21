# Disclaimer

**Opaque Cash** is experimental software. Use at your own risk.

## Stealth Address Cryptography

- The **stealth address math** (DKSAP / EIP-5564) implemented in this project is intended to follow the public specification. It has **not** been formally audited. Bugs in key derivation, shared-secret hashing, or point arithmetic could lead to loss of funds or reduced privacy.
- Implementations exist in both **TypeScript** (frontend) and **Rust** (WASM scanner). Consistency between these and with EIP-5564 is maintained by the maintainers but is not guaranteed.
- **Do not rely on this software for high-value or production use** without independent review and testing.

## Local Storage and Data

- **Manual Ghost Addresses** (one-time stealth addresses generated without an on-chain announcement) store ephemeral keys and metadata in **local storage** (e.g. browser `localStorage` via Zustand persist). This data is **device-specific** and is **not** recoverable from the protocol or from another device.
- Clearing browser data, losing the device, or switching browsers will prevent the app from associating those addresses with your keys. **Back up any critical receive addresses or keys** if you rely on Manual Ghost Addresses.
- Stealth keys derived from your wallet signature are kept **in memory** by default; they are not stored on-chain. Refreshing the page or closing the tab may require re-initializing the protocol (sign again). Any optional persistence of keys is at the implementer’s risk.

## No Warranty

This software is provided **as is**, without warranty of any kind. See the [LICENSE](LICENSE) file for the full disclaimer under the MIT License.
