# Opaque Cash

A stealth-address wallet built on **EIP-5564** (Stealth Addresses) and a **Stealth Meta-Address Registry**. Users receive ETH at one-time stealth addresses derived from a single “meta-address”; senders can target recipients either by meta-address or by their standard Ethereum address (resolved via the Registry).

This document explains **how the system works step by step**, from the moment a user visits the platform.

---

## Table of contents

1. [High-level flow](#1-high-level-flow)
2. [When the user first visits](#2-when-the-user-first-visits)
3. [Setup: deriving stealth keys](#3-setup-deriving-stealth-keys)
4. [Registry: linking your ETH address to your meta-address](#4-registry-linking-your-eth-address-to-your-meta-address)
5. [Sending: recipient by meta-address or by ETH address](#5-sending-recipient-by-meta-address-or-by-eth-address)
6. [Receiving and viewing private balance](#6-receiving-and-viewing-private-balance)
7. [Where the Stealth Meta-Address Registry is used](#7-where-the-stealth-meta-address-registry-is-used)
8. [Contracts and deployment](#8-contracts-and-deployment)

---

## 1. High-level flow

- **Recipient** signs a message once → app derives **viewing** and **spending** keys → public keys form a **66-byte stealth meta-address** (shareable).
- Recipient can **register** that meta-address on-chain under their **standard ETH address** so others can send using only the ETH address.
- **Sender** enters either a 66-byte meta-address or a 42-char ETH address → if ETH address, app **resolves** meta-address from the Registry → app derives a **one-time stealth address** and sends ETH there, then **announces** the ephemeral data on-chain.
- **Recipient**’s app **scans** announcements, checks ownership with the viewing key, **reconstructs** the one-time private key, and shows **private balance** (and sweep when implemented).

---

## 2. When the user first visits

1. User opens the frontend (e.g. Vite dev server or production build).
2. **Header**: Tabs **Setup**, **Register**, **Send**, **Private balance**; **Connect MetaMask** (or similar) if not connected.
3. **Wallet connection** (`useWallet`):
   - The app checks for an injected provider (`window.ethereum`).
   - It requests accounts (e.g. `eth_requestAccounts`). If at least one account is returned, the user is “connected”; the current address is stored.
   - Account/chain changes are listened for so the UI stays in sync.
4. **Key state**: No keys exist yet. `KeysContext` holds `stealthMetaAddressHex: null`, `isSetup: false`, `masterKeys: null`.
5. **Default tab** is **Setup**. The user must complete Setup before they can meaningfully use Register or Send (and before their private balance can be decrypted).

---

## 3. Setup: deriving stealth keys

**Goal:** Derive a **stealth meta-address** (and the viewing/spending keys) from the user’s wallet, **without** storing the keys on-chain. Keys exist only in the session.

**Steps:**

1. User is on **Setup** and clicks **“Connect wallet & sign to derive keys”**.
2. **SetupView** uses a viem **wallet client** (e.g. MetaMask) to:
   - Resolve the current account.
   - Call **`signMessage`** with a fixed string, e.g.  
     `"Sign this message to derive your Opaque Cash stealth keys. This does not approve any transaction."`
3. The wallet returns a **signature** (e.g. 65-byte ECDSA). The app **does not** send this to any server; it is used only in the browser.
4. **KeysContext.setFromSignature(signature)**:
   - **Key derivation** (`lib/stealth.ts`):  
     The signature is used as entropy. **HKDF** (SHA-256, domain `"opaque-cash-v1"`) expands it to 64 bytes, split into:
     - **Viewing private key** (32 bytes)
     - **Spending private key** (32 bytes)
   - **Public keys**: secp256k1 compressed public keys are computed for both (33 bytes each).
   - **Stealth meta-address**: `metaAddress = viewPubKey || spendPubKey` (66 bytes). Encoded as hex (0x + 132 hex chars), this is **stealthMetaAddressHex**.
   - **KeysContext** stores:
     - `stealthMetaAddressHex` (to show and to register)
     - `masterKeys`: `viewPrivKey`, `spendPrivKey`, `spendPubKey` (for scanning and spending)
     - `isSetup: true`
5. Setup view then shows **“Your Stealth Meta-Address”** so the user can copy it. They can share this with senders, or (next step) register it so senders can use their ETH address instead.

**Important:** Keys are **in-memory only**; they are lost on refresh unless you add persistence (not in this baseline).

---

## 4. Registry: linking your ETH address to your meta-address

**Goal:** Store on-chain the binding **“this ETH address → this 66-byte stealth meta-address”** so senders can resolve a meta-address from a standard address.

**Where it happens:**

- **Reads**: `frontend/src/lib/registry.ts` — `resolveMetaAddress(address)` and `isRegistered(address)`.
- **Writes**: `frontend/src/components/RegistrationView.tsx` — user clicks **Register** and sends a transaction to the Registry contract.

**Steps:**

1. User opens the **Register** tab. They must be **Setup** (have a derived meta-address) and **connected** (have an ETH address).
2. **RegistrationView** calls **`isRegistered(address)`**:
   - In **registry.ts**, this calls the Registry contract’s **`stealthMetaAddressOf(registrant, schemeId)`** (schemeId = 1 for secp256k1) via a viem **public client** (RPC read).
   - The contract returns the stored 66-byte meta-address for that (address, schemeId), or empty.
   - If the returned bytes length is 66, the user is **registered**.
3. **If already registered:** The UI shows “You’re already registered…” and does **not** show the Register button.
4. **If not registered:** The UI shows a **Register** button. On click:
   - **RegistrationView** builds calldata for **`registerKeys(schemeId, stealthMetaAddress)`** (ABI and address from `registry.ts` / `deployedAddresses`).
   - It uses a viem **wallet client** to **send a transaction** to **`REGISTRY_ADDRESS`** with that calldata (value 0).
   - The **Registry contract** stores the mapping `(msg.sender, schemeId) → stealthMetaAddress`. So the “registrant” is the connected wallet address.
5. After a successful tx, the view sets “registered” to true and shows the tx hash.

**Result:** Anyone can now call **`stealthMetaAddressOf(yourEthAddress, 1)`** and get your 66-byte meta-address to send to.

---

## 5. Sending: recipient by meta-address or by ETH address

**Goal:** Send ETH to a **one-time stealth address** derived from the recipient’s meta-address, and **announce** the data needed for the recipient to detect and spend it.

**Where the Registry is used:** Only when the sender enters a **42-character ETH address**. Then the app **resolves** the meta-address via the Registry before deriving the stealth address.

**Steps:**

1. User is on **Send**, has completed Setup, and enters a **recipient** and an **amount**.
2. **Recipient input** can be:
   - **Direct 66-byte meta-address** (0x02 or 0x03 + 132 hex chars), or  
   - **Standard ETH address** (0x + 40 hex chars).
3. **If the user types an ETH address:**
   - **SendView** runs a **useEffect** that checks if the trimmed input is a valid 42-char address.
   - If yes, it calls **`resolveMetaAddress(address)`** from **registry.ts**:
     - Normalizes the address (viem `getAddress`).
     - Uses a viem **public client** to call **`stealthMetaAddressOf(registrant, SCHEME_ID_SECP256K1)`** on the **Registry** contract.
     - Returns the 66-byte meta-address hex or `null` if not registered.
   - The result is stored in **resolvedMeta**. The UI shows “Resolving from registry…” and then “Resolved meta-address: 0x…” when successful.
4. **On Send click**, the app decides the effective meta-address:
   - If input is a **direct meta-address**, use it as-is.
   - If input is an **ETH address**, use **resolvedMeta**; if it’s null (e.g. not registered), show an error and do not send.
5. **Stealth address derivation** (`lib/stealth.ts` — `computeStealthAddressAndViewTag`):
   - Parse the 66-byte meta-address into **view pub key** (33 bytes) and **spend pub key** (33 bytes).
   - Generate a random **ephemeral key pair** (r, R).
   - **Shared secret** = r × viewPubKey (ECDH). Hash with **Keccak-256** → **s_h**; **view tag** = first byte of hash (used later for filtering).
   - **Stealth public key** = spendPubKey + (s_h mod n)×G. **Stealth address** = last 20 bytes of Keccak256(uncompressed(stealth pub key)) (EIP-55).
   - **Metadata** = 1 byte (view tag).
6. **Two transactions** are sent (wallet client):
   - **1)** Send **ETH** to the **stealth address** (value = amount, data = 0x).
   - **2)** Call **Announcer** contract **`announce(schemeId, stealthAddress, ephemeralPubKey, metadata)`** so the recipient’s scanner can find the announcement and derive the one-time key.

**Result:** ETH sits at the one-time stealth address; only the recipient (with viewing + spending keys) can detect it and derive the private key for that address.

---

## 6. Receiving and viewing private balance

**Goal:** Show the user which stealth addresses received funds and allow them to see (and eventually sweep) the balance.

**Steps:**

1. User opens **Private balance** tab. The app loads the **WASM** module (for key reconstruction) and, if Setup is done, has access to **masterKeys** (view + spend private keys and spend public key).
2. **Fetching announcements:** The app uses a viem **public client** to call **`getLogs`** on the **StealthAddressAnnouncer** contract for the **Announcement** event (schemeId, stealthAddress, caller, ephemeralPubKey, metadata).
3. For each log, the app has: **stealth address**, **ephemeral public key**, **view tag** (from metadata).
4. **Filtering / ownership** (when implemented): For each announcement, the app can use the WASM **check_announcement** (or equivalent) with the user’s **viewPrivKey** and **spendPubKey** to see if this announcement is for them (view tag and key derivation must match). In the current code, filtering may be relaxed to show all announcements for demo purposes.
5. **Key reconstruction:** For “owned” announcements, the app uses WASM **reconstruct_signing_key** (spend priv, view priv, ephemeral pub key) to get the **one-time private key** for that stealth address.
6. **Balance:** The app calls **`getBalance`** for each such stealth address and displays the list with balances and option to **Sweep** (sweep flow may be stubbed).

**Result:** The user sees a list of stealth addresses that received funds and their balances, and can reveal the one-time private key for sweeping.

---

## 7. Where the Stealth Meta-Address Registry is used

| Location | What happens |
|--------|----------------|
| **`frontend/src/lib/registry.ts`** | **Lookup (read only).** `resolveMetaAddress(address)` and `isRegistered(address)` call the Registry’s **`stealthMetaAddressOf(registrant, schemeId)`** via a viem **public client** (RPC). Contract address comes from **`deployedAddresses.StealthMetaAddressRegistry`**. Returns the 66-byte meta-address hex or null / boolean. |
| **`frontend/src/components/RegistrationView.tsx`** | **Registration (write).** On load, calls **`isRegistered(address)`** to decide whether to show “already registered” or the Register button. On Register click, **encodes** **`registerKeys(schemeId, stealthMetaAddressHex)`** and **sends a transaction** to **`REGISTRY_ADDRESS`** (same as above) so the user’s wallet signs and submits the write. |
| **`frontend/src/components/SendView.tsx`** | **Lookup only.** When the recipient input is a 42-char ETH address, a **useEffect** calls **`resolveMetaAddress(with0x)`** and stores the result in **resolvedMeta**. On Send, if the input was an ETH address, the effective meta-address used for **computeStealthAddressAndViewTag** is **resolvedMeta** (from the Registry). |

**Summary:** The Registry is a single on-chain contract. **Reads** (resolve / is registered) happen in **registry.ts** and **SendView** via RPC. **Writes** (register) happen in **RegistrationView** via a signed transaction to the same contract.

---

## 8. Contracts and deployment

- **StealthMetaAddressRegistry:** Maps `(registrant address, schemeId) → 66-byte stealth meta-address`. Exposes **`stealthMetaAddressOf(registrant, schemeId)`** and **`registerKeys(schemeId, stealthMetaAddress)`** (and possibly **register** with signature for gasless registration).
- **StealthAddressAnnouncer (EIP-5564):** Emits **Announcement** events with schemeId, stealth address, caller, ephemeral pub key, metadata. Senders call **`announce(...)`** after sending ETH to the stealth address so recipients can scan and derive the one-time key.

Deployment (e.g. Hardhat) writes **`frontend/src/contracts/deployedAddresses.ts`** and copies ABIs into **`frontend/src/contracts/abis/`**. The frontend uses these for Registry and Announcer addresses and for encoding calls (viem) and parsing logs.

---

## Quick reference: user journey

1. **Visit** → Connect wallet (optional for Setup, required for Register/Send).
2. **Setup** → Sign message → derive view/spend keys and meta-address (in-memory).
3. **Register** → If not already registered, send `registerKeys(schemeId, metaAddress)` to Registry (links wallet address ↔ meta-address).
4. **Send** → Enter recipient (meta-address or ETH address); if ETH address, app resolves meta-address from Registry → derive one-time stealth address → send ETH + announce.
5. **Private balance** → Scan Announcer logs → filter/reconstruct with view/spend keys → show balances and sweep option.

This is the full step-by-step flow from first visit through sending and receiving with the Stealth Meta-Address Registry.
