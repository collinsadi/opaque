# Opaque Subgraph – StealthAddressAnnouncer

Indexes `Announcement` events from the EIP-5564 StealthAddressAnnouncer for the frontend scanner.

## Networks

| Network | Manifest | Deploy target |
|--------|----------|----------------|
| **Sepolia** | `subgraph.yaml` | The Graph Studio (hosted) |
| **Paseo (Polkadot Hub testnet)** | `subgraph.paseo.yaml` | Self-hosted Graph Node or other indexer |

The Graph’s hosted network does **not** support Paseo. For Polkadot testnet you must run your own Graph Node (or use an indexer that supports Paseo).

---

## Sepolia (The Graph Studio)

1. `yarn codegen && yarn build`
2. `yarn auth` (set `GRAPH_AUTH` / use `--studio` login)
3. `yarn deploy`

Set the frontend env to the Studio subgraph URL:

- `VITE_SUBGRAPH_URL=https://api.studio.thegraph.com/query/.../subgraph/version/latest`

---

## Paseo (Polkadot Hub testnet)

Contract (from `frontend/src/contracts/deployed-addresses.json`):

- **Announcer:** `0xD5FDa624D5F58F4586A959ff3e9c7CA72a9b74D8`
- **Start block:** `5590094`

### Option A: Self-hosted Graph Node

1. Run Graph Node with Paseo in `config.toml`, e.g.:

   ```toml
   [chains.paseo]
   shard = "primary"
   provider = [
     { label = "paseo", url = "https://services.polkadothub-rpc.com/testnet" },
   ]
   ```

2. From this directory:

   ```bash
   yarn codegen:paseo
   yarn build:paseo
   yarn deploy:paseo-local
   ```

   Or deploy to your node URL:

   ```bash
   graph deploy -f subgraph.paseo.yaml --node https://your-graph-node.com/deploy/ opaque-paseo
   ```

3. In the **frontend** `.env` set the subgraph URL for Paseo:

   ```env
   VITE_POLKADOT_SUBGRAPH_URL=https://your-graph-node.com/subgraphs/name/opaque-paseo
   ```

### Option B: No subgraph (RPC fallback)

If you don’t run a subgraph for Paseo, leave `VITE_POLKADOT_SUBGRAPH_URL` unset. The frontend will use chunked RPC `getLogs` for the announcer contract; scanning will still work but can be slower.

---

## Frontend env summary

| Env | Chain | Purpose |
|-----|--------|--------|
| `VITE_SUBGRAPH_URL` | Sepolia (and default) | Subgraph URL for announcement indexer |
| `VITE_POLKADOT_SUBGRAPH_URL` | Paseo (420420417) | Subgraph URL for Polkadot testnet announcer |

When the user is on Paseo (chain id `420420417`), the app uses `VITE_POLKADOT_SUBGRAPH_URL` if set; otherwise it falls back to RPC.
