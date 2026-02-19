# Opaque Cash — Frontend

Minimalist stealth address wallet UI: key setup, send to stealth meta-addresses, and private balance (with indexer status).

## Stack

- **Vite** + **React** + **TypeScript**
- **Tailwind CSS** (v4) — dark glassmorphism theme
- **viem** — wallet connection, signing, transactions
- **@noble/curves** (secp256k1) + **@noble/hashes** — client-side stealth address crypto (EIP-5564 / DKSAP)

## Setup

```bash
npm install
cp .env.example .env   # optional: set VITE_ANNOUNCER_ADDRESS and chain
npm run dev
```

## Env

- `VITE_ANNOUNCER_ADDRESS` — EIP-5564 StealthAddressAnnouncer contract address (default placeholder).

## Features

1. **Setup** — Sign a message with MetaMask/Rainbow; signature is used as entropy to derive viewing and spending keys. Displays your **Stealth Meta-Address** (V ‖ S) to share for receiving.
2. **Send** — Enter recipient stealth meta-address and amount. Client derives ephemeral key, stealth address P, and view tag; sends ETH to P and calls the Announcer in two transactions.
3. **Private balance** — Placeholder list of “found” stealth txs and a **scanning** progress indicator; wire to your Rust indexer API when ready.

## Crypto

- Keys: HKDF-SHA256(signature, domain "opaque-cash-v1") → 64 bytes → viewing key (32) ‖ spending key (32).
- Stealth meta-address: compressed(V) ‖ compressed(S) (66 bytes).
- Send flow: ephemeral (r, R), shared secret r·P_view, s_h = Keccak256(shared), viewTag = s_h[0], P_stealth = P_spend + s_h·G, address = last 20 bytes of Keccak256(uncompressed(P_stealth)). Matches the `scanner` crate logic.

## Build

```bash
npm run build
npm run preview
```
