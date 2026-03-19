# Opaque Cash

**[Visit Website](https://opaque.cash)** · **[Registry Contract on Sepolia](https://sepolia.etherscan.io/address/0x77425e04163d608B876c7f50E34A378624A12067)** · **[Announcer Contract on Sepolia](https://sepolia.etherscan.io/address/0x840f72249A8bF6F10b0eB64412E315efBD730865)** · **[Demo Video](https://youtu.be/bwYRj09Hz6M)**

**Opaque Cash** is a stealth-address wallet and privacy protocol. See [DISCLAIMER.md](DISCLAIMER.md) for important notes on the experimental nature of the stealth address cryptography and local storage usage. built on **EIP-5564** (Stealth Addresses) and a **Stealth Meta-Address Registry**. Users receive ETH and ERC-20 tokens at one-time stealth addresses derived from a single meta-address; senders can target recipients by meta-address or by standard Ethereum address (resolved via the Registry).

This document is the authoritative technical reference for the protocol architecture, system components, local setup, mainnet deployment, and user experience.

---

## Table of Contents

1. [Protocol Architecture & Cryptography](#1-protocol-architecture--cryptography)
2. [System Components](#2-system-components)
3. [Step-by-Step Local Setup](#3-step-by-step-local-setup)
4. [Mainnet & Scaling Guide](#4-mainnet--scaling-guide)
5. [User Experience & Security](#5-user-experience--security)
6. [Contracts and Deployment Reference](#6-contracts-and-deployment-reference)

---

## 1. Protocol Architecture & Cryptography

### 1.1 Dual-Key Stealth Address Protocol (DKSAP) — EIP-5564

Opaque Cash implements the **Dual-Key Stealth Address Protocol** as specified in [EIP-5564](https://eips.ethereum.org/EIPS/eip-5564). Each recipient has a **stealth meta-address** composed of two public keys (66 bytes total):

- **Viewing public key** \(V\) — used to derive a shared secret with the sender’s ephemeral key; enables the recipient to *detect* incoming transfers.
- **Spending public key** \(S\) — used together with the shared secret to derive the one-time **stealth address** \(P\) where funds are sent.

The meta-address is encoded as **compressed(V) || compressed(S)** (33 + 33 bytes), typically shared as a 0x-prefixed hex string (132 hex chars).

### 1.2 Key Roles

| Key | Role | Use |
|-----|------|-----|
| **Spending key** (private) | Sweeping / spending | Used with the shared secret to derive the **one-time private key** for the stealth address. Required to sign withdrawals. |
| **Viewing key** (private) | Scanning | Used with the ephemeral public key from announcements to compute the same shared secret and verify ownership. Enables filtering and key reconstruction without exposing the spending key. |

Keys are derived once from a wallet signature (see [User Experience & Security](#5-user-experience--security)) and are kept in-memory in the app; they are not stored on-chain.

### 1.3 Shared Secret and One-Time Stealth Address

Sender and recipient both compute the same **shared secret** using Elliptic Curve Diffie-Hellman (ECDH) on the secp256k1 curve:

1. **Sender** generates an ephemeral key pair \((r, R)\) and computes:
   - **Shared secret (point):** \(S_{point} = r \cdot V\) (ephemeral private key × recipient’s viewing public key).
   - The shared secret is encoded as the **compressed curve point** (33 bytes), then hashed with **Keccak-256** to obtain \(s_h\) (32 bytes) per EIP-5564.

2. **View tag:** \(v = s_h[0]\) (first byte of the hash). Emitted in announcement metadata so the recipient’s scanner can **filter** announcements without performing full EC math for non-matching entries (~255/256 of them).

3. **Stealth public key and address:**
   - \(S_h = (s_h \bmod n) \cdot G\) (scalar multiplication on the curve generator).
   - \(P_{stealth} = S + S_h\) (point addition: spending public key + derived point).
   - **Stealth address** = last 20 bytes of `Keccak256(uncompressed(P_stealth))`, formatted as an EIP-55 Ethereum address.

4. **Recipient** (with viewing key \(v_{priv}\) and spending key \(s_{priv}\)):
   - From each announcement: ephemeral public key \(R\), view tag, stealth address.
   - **Shared secret:** \(v_{priv} \cdot R\) (same curve point as sender’s \(r \cdot V\)).
   - Same hash → \(s_h\), same \(S_h\), same \(P_{stealth}\) → can verify the announced stealth address and derive **one-time private key** \(p_{stealth} = s_{priv} + (s_h \bmod n)\).

This ensures **unlinkability**: each payment uses a unique address; only the recipient with both keys can see and spend it.

---

## 2. System Components

### 2.1 Rust WASM Core

The **scanner** is implemented in **Rust** and compiled to WebAssembly for use in the browser.

- **Why Rust:** secp256k1 arithmetic (ECDH, point addition, scalar multiplication) is performance-critical. Rust provides predictable performance and memory safety; the `k256` crate offers auditable, constant-time-friendly elliptic curve operations. JavaScript-only implementations are possible but slower for bulk scanning.
- **wasm-pack** builds the crate with target `web`, producing:
  - A WASM binary and JS/TS bindings.
  - Exposed functions such as `check_announcement_view_tag_wasm`, `check_announcement_wasm`, and `reconstruct_signing_key_wasm` for view-tag filtering, ownership check, and one-time key reconstruction.

The frontend loads the WASM module from `/pkg/cryptography.js` and uses it inside `StealthScanner` and the Private Balance view so that heavy crypto runs in the WASM layer while the UI stays responsive.

### 2.2 Smart Contracts

| Contract | Purpose |
|----------|---------|
| **StealthAddressAnnouncer.sol** | **Event logging.** Singleton that emits `Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata)` when a sender announces a stealth transfer. One deployment per chain; scanners subscribe to this single log source. `metadata` must have the view tag as the first byte (EIP-5564). |
| **StealthMetaAddressRegistry.sol** | **Public key directory.** Maps `(registrant address, schemeId) → 66-byte stealth meta-address`. Exposes `stealthMetaAddressOf(registrant, schemeId)` for lookup and `registerKeys(schemeId, stealthMetaAddress)` (and optional `registerKeysOnBehalf` with EIP-712) for registration. schemeId 1 = secp256k1 (EIP-5564). |

See [Contracts and Deployment Reference](#6-contracts-and-deployment-reference) for deployment and addresses.

### 2.3 Frontend Portfolio

- **Asset-centric UI:** Balances and sends are organized by **asset** (ETH, USDC, USDT, etc.). The Private Balance view aggregates per stealth address and per token; Send allows choosing asset and amount with multi-token support.
- **Multi-token support:** Native ETH plus configurable ERC-20 tokens per chain (see `frontend/src/lib/tokens.ts`). Mock ERC-20s (USDC, USDT) are deployed for local dev; mainnet uses real token addresses.
- **Manual Ghost Address system:** Users can generate a **one-time stealth address + ephemeral key** without an on-chain announcement (“Receive” → “Manual Ghost Address”). These entries are stored **locally** (e.g. `localStorage` via Zustand persist). The app can still check balances and sweep those addresses because it holds the ephemeral key for key reconstruction. This supports “share this address once, no announcement” flows; data is device-specific and not recoverable from protocol state alone.

---

## 3. Step-by-Step Local Setup

### 3.1 Prerequisites

- **Node.js** and npm (or equivalent)
- **Rust** toolchain: [rustup.rs](https://rustup.rs/)
- **wasm-pack:** `cargo install wasm-pack`
- **Hardhat** (in `infra/`): contracts and deploy script

### 3.2 Build the WASM Core

From the **project root**:

```bash
cd scanner
wasm-pack build --target web --out-dir ./pkg
```

Then copy the built package into the frontend so it can be served:

```bash
# From project root
cp -r scanner/pkg frontend/public/pkg
```

For release builds (smaller, faster):

```bash
cd scanner && wasm-pack build --target web --out-dir ./pkg --release
cp -r scanner/pkg frontend/public/pkg
```

### 3.3 Start a Local Hardhat Node

In a dedicated terminal:

```bash
cd infra
npm install
npx hardhat compile
npx hardhat node
```

Leave this running (default RPC: `http://127.0.0.1:8545`).

### 3.4 Deploy Contracts and Mocks

With the local node running, from **another terminal**:

```bash
cd infra
npm run deploy:scripts
```

Or explicitly:

```bash
npx hardhat compile
RPC_URL=http://127.0.0.1:8545 tsx scripts/deploy.ts
```

This script:

- Deploys **StealthMetaAddressRegistry** and **StealthAddressAnnouncer**
- Deploys **MockERC20** instances for USDC and USDT
- Writes **`frontend/src/contracts/deployedAddresses.ts`** with chainId and contract addresses
- Copies ABIs to **`frontend/src/contracts/abis/`**

### 3.5 Launch the Vite/React Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`). Ensure MetaMask (or another injected provider) is pointed at the same chain (e.g. chainId 31337 for Hardhat) and that the frontend’s chain config matches.

---

## 4. Mainnet & Scaling Guide

### 4.1 Adding New ERC-20 Tokens

Edit **`frontend/src/lib/tokens.ts`**:

- In **`TOKENS_BY_CHAIN`**, select the target `chainId` (e.g. `1` for mainnet).
- Add a new entry to the `tokens` array with `symbol`, `name`, `decimals`, and `address` (contract address). Use `null` for the native asset.

Example (snippet):

```ts
1: {
  native: { symbol: "ETH", name: "Ether", decimals: 18, address: null },
  tokens: [
    { symbol: "USDC", name: "USD Coin", decimals: 6, address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address },
    { symbol: "USDT", name: "Tether USD", decimals: 6, address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address },
    // Add more tokens here
  ],
},
```

`getTokensForChain(chainId)` and `getSelectableAssets(chainId)` will expose the new token for send and balance views.

### 4.2 Mainnet Deployment

1. **RPC:** Configure a mainnet RPC URL (e.g. Infura, Alchemy) and set it in your deploy environment or Hardhat network config.
2. **Deploy contracts:** Run the same deploy script (or your mainnet Hardhat/Ignition flow) with the mainnet network and a funded deployer key. Ensure **`frontend/src/contracts/deployedAddresses.ts`** is updated for the target chainId and new contract addresses (or use a build step that injects them).
3. **Gas:** On EIP-1559 chains, the deploy script uses the provider’s default fee behavior; adjust `maxFeePerGas` / `maxPriorityFeePerGas` in the script or wallet if needed. User txs (register, announce, sweep) are standard; gas estimation is handled by the frontend via viem.
4. **Frontend:** Point the app’s default chain and RPC to mainnet so that `getAppChain()`, `deployedAddresses`, and token configs all refer to the same chainId.

---

## 5. User Experience & Security

### 5.1 “Initialize Protocol” Onboarding Flow

When the user is not yet initialized, the app shows an entry gate (e.g. “Enter the Vault” / “Initialize Protocol”):

1. **Connect wallet** (if not already).
2. **Sign a fixed message** (e.g. “Sign this message to derive your Opaque Cash stealth keys…”). The signature is **not** sent to any server; it is used only in the browser as entropy.
3. **Key derivation:** The app uses HKDF (SHA-256, domain `"opaque-cash-v1"`) to expand the signature to 64 bytes, then splits into viewing and spending private keys. It computes the two compressed public keys and forms the 66-byte stealth meta-address.
4. **Registry check:** The app checks whether the connected ETH address is already registered in **StealthMetaAddressRegistry**.
5. **Optional registration:** If not registered, the user is prompted to send a transaction to **`registerKeys(schemeId, stealthMetaAddress)`**, linking their ETH address to their meta-address so others can send by ETH address.

After this, keys live in memory only; refreshing the page loses them unless you add a persistence mechanism (not in the baseline).

### 5.2 Privacy Trade-offs

- **Protocol-linked addresses (Registry):** If the user registers their meta-address, anyone can resolve it from their ETH address. Sends to “ETH address” go through the Registry and produce standard EIP-5564 announcements. **Recoverable** from chain + Registry; scanning works from any device that can recompute keys (e.g. same wallet signature).
- **Manual Ghost Addresses:** One-time addresses (and ephemeral keys) stored **only in local storage** on the device. No on-chain announcement; the app monitors those addresses for balance. **Device-specific and local**—clearing storage or losing the device means losing the ability to associate those addresses with the user unless the user has a separate backup. Intentionally not recoverable from the protocol alone.

### 5.3 View Tags and Scanning Performance

Announcements include a **view tag** (first byte of Keccak256(shared_secret)). The scanner:

1. Fetches all `Announcement` logs from **StealthAddressAnnouncer** (optionally in chunks for large ranges).
2. For each log, runs **view-tag check** first (WASM: `check_announcement_view_tag_wasm`). If the tag does not match the value derived from the user’s viewing key and the log’s ephemeral public key, the announcement is skipped (no EC point addition).
3. Only for **possible matches**, it runs full derivation and compares the derived stealth address to the log. For owned announcements, it then reconstructs the one-time signing key for sweeping.

This reduces CPU and battery use when many announcements exist on-chain.

---

## 6. Contracts and Deployment Reference

| Contract | Role |
|----------|------|
| **StealthMetaAddressRegistry** | `stealthMetaAddressOf(registrant, schemeId)`; `registerKeys(schemeId, stealthMetaAddress)`; optional `registerKeysOnBehalf` with EIP-712. |
| **StealthAddressAnnouncer** | `announce(schemeId, stealthAddress, ephemeralPubKey, metadata)`; emits `Announcement` for scanners. |

Deployment (e.g. `infra/scripts/deploy.ts`) writes **`frontend/src/contracts/deployedAddresses.ts`** and copies ABIs to **`frontend/src/contracts/abis/`**. The frontend uses these for Registry and Announcer addresses, encoding calls (viem), and parsing logs.

---

## Quick Reference: User Journey

1. **Visit** → Connect wallet (required for Initialize / Register / Send).
2. **Initialize Protocol** → Sign message → derive view/spend keys and meta-address (in-memory).
3. **Register** (optional) → If not already registered, send `registerKeys(schemeId, metaAddress)` to link wallet ↔ meta-address.
4. **Send** → Enter recipient (meta-address or ETH address); if ETH address, app resolves meta-address from Registry → derive one-time stealth address → send asset + announce.
5. **Receive** → Use “Payment link” (protocol announcement) or “Manual Ghost Address” (local-only).
6. **Private balance** → Scan Announcer logs (with view-tag filter) + optional Manual Ghost list → reconstruct keys for owned addresses → show balances and sweep.

For WASM build details and troubleshooting, see **`scanner/WASM_BUILD.md`**.
