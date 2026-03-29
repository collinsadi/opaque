# @opaquecash/opaque

Single entry point for Opaque **stealth** (EIP-5564) and **PSR** flows used together with your own indexer.

## Install

Build the `sdk/` workspace, then depend on this package (path or npm link).

```bash
cd sdk && npm install && npm run build
```

Peer stack: `viem`, wasm-pack output (`cryptography.js`).

## Initialize

```ts
import { OpaqueClient } from "@opaquecash/opaque";

const client = await OpaqueClient.create({
  chainId: 11155111,
  rpcUrl: "https://…",
  walletSignature: userSignatureHex,
  ethereumAddress: userAddress,
  wasmModuleSpecifier: new URL("/pkg/cryptography.js", import.meta.url).href,
});
```

## Constants

- `OpaqueClient.supportedChainIds()`
- `OpaqueClient.chainDeployment(chainId)` — registry, announcer, verifier, default tokens
- `NATIVE_TOKEN_ADDRESS` — sentinel for ETH in balance aggregation

## Indexer announcements

Pass subgraph-shaped rows:

```ts
const rows: IndexerAnnouncement[] = [
  {
    blockNumber: "10533630",
    etherealPublicKey: "0x02…",
    logIndex: 161,
    metadata: "0x…",
    stealthAddress: "0x…",
    transactionHash: "0x…",
    viewTag: 234,
  },
];
```

## Flows

| Goal | API |
|------|-----|
| Resolve recipient meta-address (registry read via `rpcUrl`) | `resolveRecipientMetaAddress(normalAddress)` |
| Register meta-address calldata | `buildRegisterMetaAddressTransaction()` |
| Send: derive stealth + ephemeral | `prepareStealthSend(recipientMetaHex)` |
| Announce calldata | `buildAnnounceTransactionRequest(prepareResult)` |
| Owned outputs | `filterOwnedAnnouncements(rows)` |
| Balances by token | `getBalancesFromAnnouncements(rows)` |
| PSR traits | `discoverTraits(rows)` |

You always submit transactions from your own wallet; the SDK returns **structured calldata** and **read results**.

## Lower-level packages

`@opaquecash/stealth-core`, `@opaquecash/stealth-wasm`, `@opaquecash/stealth-chain`, `@opaquecash/psr-core`, etc. remain available for advanced integrations.
