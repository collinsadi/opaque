# Competitive Landscape

This document maps Opaque against established and emerging privacy protocols, explains what each offers, and clarifies where Opaque diverges.

---

## Competitor Overview


| Project               | Category            | Privacy Model                                                                                        | Reputation / Identity                                                   | Chain                                         | Token Support                            | Status                                                                                        |
| --------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Tornado Cash**      | Mixer               | Fixed-denomination deposit/withdraw pool; anonymity set = pool size                                  | None                                                                    | Ethereum L1                                   | ETH + select ERC-20 pools                | Sanctioned (OFAC 2022); smart contracts still on-chain but frontend/relayer access restricted |
| **Railgun**           | Shielded balance    | ZK-SNARK shielded transfers inside a unified balance tree; shield/unshield to interact with DeFi     | None natively; integrators can layer compliance proofs                  | Ethereum, Polygon, BSC, Arbitrum              | Multi-token (any ERC-20 after shielding) | Active; ongoing development                                                                   |
| **Umbra (ScopeLift)** | Stealth addresses   | EIP-5564 stealth address protocol; one-time addresses per payment                                    | None                                                                    | Ethereum, Optimism, Arbitrum, Polygon, others | ETH + ERC-20                             | Active; reference implementation of EIP-5564                                                  |
| **Aztec Network**     | ZK rollup           | Full private execution environment; encrypted state, private functions, private/public composability | Planned identity primitives; not shipped as selective disclosure        | Aztec L2 (own rollup)                         | Assets bridged into Aztec                | Testnet (Aztec Sandbox); mainnet pending                                                      |
| **Secret Network**    | Privacy L1          | Encrypted contract state by default; private computation via TEE (Intel SGX) enclaves                | Secret NFTs can carry metadata; no ZK selective disclosure layer        | Secret (Cosmos SDK chain)                     | Native SNIP-20 tokens                    | Active; mainnet live                                                                          |
| **Zcash**             | Privacy L1          | Shielded pool (Sapling/Orchard) with ZK proofs; transparent and shielded address types               | None                                                                    | Zcash (own chain)                             | ZEC only                                 | Active; mature protocol                                                                       |
| **Monero**            | Privacy L1          | Ring signatures, stealth addresses, RingCT; all transactions private by default                      | None                                                                    | Monero (own chain)                            | XMR only                                 | Active; mature protocol                                                                       |
| **Panther Protocol**  | Multi-chain privacy | ZK-based shielded pools (zAssets) across chains; DeFi integrations via privacy DEX                   | ZK KYC credentials (selective disclosure of compliance status)          | Polygon (expanding multi-chain)               | Multi-token via shielding                | Active; early mainnet                                                                         |
| **Nocturne**          | Stealth + shielded  | Stealth addresses with a shielded account abstraction layer; deposit screening for compliance        | Compliance screening at deposit; no reputation layer                    | Ethereum L1                                   | ETH + ERC-20                             | Shut down (2024)                                                                              |
| **Fluidkey**          | Stealth addresses   | Deterministic stealth addresses derived from ENS; predictable receive addresses                      | None                                                                    | Ethereum, Optimism, Arbitrum, Base, others    | ETH + ERC-20                             | Active; early stage                                                                           |
| **Labyrinth**         | Privacy middleware  | Shielded transfers with compliance hooks; AML screening integration                                  | Compliance attestations at entry/exit; no user-facing reputation proofs | Ethereum L2s                                  | Multi-token                              | Active; early stage                                                                           |
| **Manta Network**     | Privacy L1/L2       | ZK-based private transfers (MantaPay) and private DEX; Celestia DA layer                             | zkSBT (zero-knowledge soulbound tokens) for identity claims             | Manta Pacific (own L2)                        | Multi-token via bridging                 | Active; mainnet live                                                                          |
| **Penumbra**          | Privacy DEX         | Private staking, private DEX (ZSwap), shielded pool; all activity private by default                 | None                                                                    | Penumbra (Cosmos IBC chain)                   | IBC assets                               | Active; mainnet launched                                                                      |


---

## Feature-by-Feature Comparison


| Feature                                       | Opaque                                                       | Tornado Cash                 | Railgun                    | Umbra                      | Aztec                     | Panther                 | Manta                          |
| --------------------------------------------- | ------------------------------------------------------------ | ---------------------------- | -------------------------- | -------------------------- | ------------------------- | ----------------------- | ------------------------------ |
| **Privacy mechanism**                         | EIP-5564 stealth addresses (per-payment unique address)      | Fixed-size mixing pool       | Shielded balance tree      | EIP-5564 stealth addresses | Encrypted L2 state        | Shielded pool (zAssets) | ZK shielded transfers          |
| **Runs on Ethereum L1**                       | Yes                                                          | Yes                          | Yes (+ L2s)                | Yes (+ L2s)                | No (own rollup)           | Polygon                 | No (own L2)                    |
| **Requires separate chain/bridge**            | No                                                           | No                           | No                         | No                         | Yes                       | Partial                 | Yes                            |
| **Private reputation / selective disclosure** | Yes (PSR — ZK proofs of traits without identity exposure)    | No                           | No                         | No                         | Planned                   | ZK KYC only             | zkSBT (limited)                |
| **Sybil-resistant action gating**             | Yes (nullifier-scoped proofs per action)                     | No                           | No                         | No                         | No                        | No                      | No                             |
| **Composable on-chain verification**          | Yes (Groth16 verifier contract, `ReputationVerified` events) | No                           | Limited                    | No                         | Within Aztec only         | Limited                 | Within Manta only              |
| **Client-side proof generation**              | Yes (WASM + snarkjs in browser)                              | Yes (client-side proof)      | Yes (client-side proof)    | N/A (no proofs)            | Yes                       | Yes                     | Yes                            |
| **Multi-token support**                       | ETH + any ERC-20                                             | Fixed pools per denomination | Any ERC-20 after shielding | ETH + ERC-20               | Bridged assets            | Multi-token             | Bridged assets                 |
| **SDK / developer integration**               | Modular SDK (stealth-only, PSR-only, or full stack)          | No SDK                       | SDK available              | Basic SDK                  | Full dev framework (Noir) | SDK available           | SDK available                  |
| **Trusted hardware dependency**               | None                                                         | None                         | None                       | None                       | None                      | None                    | None (Secret Network uses TEE) |
| **Open issuance of attestations**             | Yes (extensible to policy-controlled issuers in V2)          | N/A                          | N/A                        | N/A                        | N/A                       | Centralized KYC issuers | Centralized SBT issuers        |


---

## Head-to-Head: What Each Competitor Lacks

### Tornado Cash

- No reputation or identity layer at all.
- Fixed denomination pools (0.1, 1, 10, 100 ETH) leak information via deposit/withdraw amount matching.
- Regulatory sanctions have crippled frontend access and relayer infrastructure.
- No per-payment unique addressing; all users share the same pool.

### Railgun

- Strong shielded transfer capability, but no privacy-preserving reputation or selective disclosure.
- Users cannot prove traits (governance eligibility, compliance status, badges) without unshielding.
- Shielding/unshielding model adds UX friction compared to direct stealth address receives.

### Umbra

- Closest architectural cousin (also EIP-5564 stealth addresses).
- No reputation, attestation, or proof layer whatsoever — purely payments.
- No ZK circuits, no on-chain verifier, no action-scoped nullifiers.
- No SDK modularization for developer integrations beyond basic send/receive.

### Aztec Network

- Requires users and dApps to move to a separate L2 with its own execution environment (Noir language).
- Not composable with existing Ethereum L1 contracts without bridging.
- Identity/reputation primitives are planned but not shipped.
- High barrier for existing Solidity/EVM dApps to integrate.

### Secret Network

- TEE-based privacy (Intel SGX) — hardware trust assumption vs. pure cryptographic guarantees.
- SGX has known side-channel vulnerabilities.
- Separate Cosmos chain; not EVM-compatible without bridges.
- No ZK-based selective disclosure for reputation.

### Zcash / Monero

- Separate blockchains; no interaction with Ethereum DeFi, governance, or smart contracts.
- Single-asset only (ZEC / XMR).
- No programmable reputation, attestation, or access-gating layer.
- Users must bridge to Ethereum for any EVM utility, losing privacy guarantees in the process.

### Panther Protocol

- ZK KYC is compliance-focused, not general-purpose reputation — users cannot prove arbitrary traits.
- Credential issuance is controlled by centralized KYC providers.
- Shielded pool model requires depositing and wrapping assets (zAssets).

### Manta Network

- zkSBTs are limited to predefined credential types issued by centralized authorities.
- No action-scoped nullifiers for sybil-resistant gating.
- Requires bridging to Manta's own L2.
- Not composable with Ethereum L1 contracts.

### Fluidkey

- Stealth addresses only — no reputation, no proofs, no on-chain verification.
- Focused on predictable/deterministic stealth addresses (receive-address UX) rather than full privacy protocol.
- No ZK layer.

### Nocturne

- Shut down in 2024.
- Had compliance screening at deposit but no user-controlled reputation or selective disclosure.

---

## Why Opaque Is Better

### 1. Privacy and Reputation in One Protocol

Every other privacy protocol forces a choice: private transfers **or** verifiable reputation. Opaque is the only protocol that unifies stealth-address privacy with a programmable reputation layer (PSR). Users can receive funds privately **and** prove traits like governance eligibility, compliance status, or community membership — all without revealing their wallet address or transaction history.

### 2. No Separate Chain, No Bridge, No Rollup

Aztec, Manta, Penumbra, and Secret Network all require users to move to a different execution environment. Opaque runs directly on Ethereum L1. Contracts, proofs, and verifications happen on the same chain where the rest of DeFi, governance, and NFT infrastructure already lives. There is no bridging risk, no new validator set to trust, and no separate token economics to navigate.

### 3. Selective Disclosure With ZK, Not Compliance Theater

Panther and Manta offer "ZK KYC" or "zkSBTs," but these are centrally issued credentials that prove compliance status to regulators — not general-purpose reputation. Opaque's PSR lets **any** attestation be issued, discovered privately, and proven in zero knowledge. A dApp can define whatever trait gates it needs (early adopter, high-volume trader, DAO participant, repayment history) and users prove them without exposing identity. The difference is programmability: Opaque makes reputation a building block, not a compliance checkbox.

### 4. Action-Scoped Sybil Resistance

Opaque's nullifier system is scoped per action context (proposal ID, campaign ID, loan application). This means one proof per identity per action — true sybil resistance without identity disclosure. No other stealth address protocol (Umbra, Fluidkey) offers this. Mixer and shielded-pool protocols (Tornado Cash, Railgun) have no concept of "one action per identity" because they lack an identity/reputation layer entirely.

### 5. Composable On-Chain Verification

When an Opaque user proves a trait, the proof is verified by a Solidity contract (`OpaqueReputationVerifier`) that emits a `ReputationVerified` event. Any downstream contract — a governance module, a vault, a claim contract, a lending protocol — can check this event or call the verifier directly. This composability works with existing EVM infrastructure. Aztec's privacy is composable only within its own L2; Manta's within its own L2; Secret Network's within its Cosmos chain.

### 6. Modular SDK — Use What You Need

Opaque's SDK is layered: `@opaque/stealth-`* for private payments, `@opaque/psr-*` for reputation, or both together. An integrator building a privacy wallet only needs the stealth layer. An integrator building a gated community only needs PSR. This modularity does not exist in monolithic privacy protocols. Railgun and Aztec offer SDKs, but they are all-or-nothing for their specific privacy model.

### 7. Pure Cryptographic Trust — No Hardware Assumptions

Secret Network relies on Intel SGX enclaves, which have documented side-channel attacks (Foreshadow, SGAxe, Plundervolt). Opaque's privacy is based entirely on secp256k1 ECDH, Keccak-256 hashing, Groth16 ZK proofs, and Poseidon hashing — well-studied cryptographic primitives with no hardware trust requirement. If the math holds, the privacy holds.

### 8. Client-Side Everything

Opaque runs key derivation, announcement scanning, trait discovery, witness construction, and Groth16 proof generation entirely in the browser via Rust WASM and snarkjs. No server sees user keys, traits, or proof inputs. This is a stronger trust model than protocols that require server-side indexing of user-specific data or centralized relayer infrastructure for basic functionality.

### 9. Standards-Based (EIP-5564)

Opaque implements EIP-5564, an Ethereum standards-track specification for stealth addresses. This means interoperability with any other EIP-5564-compatible tool or wallet in the future. Proprietary privacy schemes (Aztec Noir circuits, Manta's zkSBT format, Panther's zAsset model) lock integrators into a single ecosystem.

### 10. Clear Upgrade Path

Opaque's V2 roadmap addresses real production concerns: deterministic nullifiers, sender-bound proofs (anti-front-run), decentralized Merkle root management, and issuer policy controls. These upgrades strengthen the protocol without requiring migration to a new chain or breaking existing integrations. The layered architecture means each improvement lands in its specific SDK package without disrupting the rest.

---

## Summary

Opaque occupies a unique position: **stealth-address privacy + programmable ZK reputation, on Ethereum, with no separate chain**. Competitors either offer privacy without reputation (Umbra, Tornado Cash, Railgun, Zcash, Monero), reputation without real privacy (Panther ZK KYC, Manta zkSBT), or privacy on a separate chain that fragments composability (Aztec, Secret Network, Penumbra). Opaque is the protocol where a user can receive funds at a one-time address, privately discover that they hold a governance badge, prove that badge in zero knowledge, and have a smart contract on Ethereum verify it — all without linking their identity.