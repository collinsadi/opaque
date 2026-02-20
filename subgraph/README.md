# Announcements Subgraph

Indexes `Announcement` events from the StealthAddressAnnouncer contract for fast vault sync without RPC rate limits.

## Schema

- **Announcement**: `id` (txHash-logIndex), `etherealPublicKey`, `viewTag`, `metadata`, `blockNumber`, `timestamp`, `stealthAddress`, `logIndex`, `transactionHash` — only the raw hex data needed for stealth derivation.

## Build & deploy

1. Install [Graph CLI](https://github.com/graphprotocol/graph-cli): `npm i -g @graphprotocol/graph-cli`
2. From this directory: `graph codegen` then `graph build`
3. Deploy to [The Graph Studio](https://thegraph.com/studio/) or a self-hosted graph-node; set the deployed query URL as `VITE_SUBGRAPH_URL` in the frontend `.env`.

## Frontend

The app queries the subgraph for the latest 1000 announcements. If the subgraph is unavailable or `VITE_SUBGRAPH_URL` is unset, it falls back to chunked RPC getLogs.
