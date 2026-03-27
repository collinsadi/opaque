# Programmable Stealth Reputation (PSR)

Programmable Stealth Reputation (PSR) is Opaque's privacy-preserving reputation layer. It allows users to prove they have specific traits (attestations) without exposing their wallet identity, stealth address history, or full transaction graph.

This document explains:

- what PSR is,
- how it works end-to-end,
- why it is important,
- where it fits in Opaque,
- and real-world use cases.

---

## 1) What PSR Is

PSR is a selective disclosure system built on top of stealth-address infrastructure.

At a high level:

1. A trait is issued as metadata in a stealth announcement.
2. The recipient privately discovers that trait using their stealth keys.
3. The recipient generates a ZK proof locally in-browser.
4. The proof can be submitted on-chain (or used off-chain) to unlock access.

The verifier learns: "this user has trait X for action Y."

The verifier does **not** learn:

- the user's main wallet (unless user reveals it elsewhere),
- the underlying stealth address,
- the rest of the user's history,
- or unrelated traits.

---

## 2) Why PSR Matters

Most reputation systems force a tradeoff:

- either public transparency (good verifiability, poor privacy),
- or private identity (good privacy, weak composability).

PSR is important because it gives both:

- **Verifiable access control:** contracts/services can enforce reputation gates.
- **Minimal disclosure:** only the required trait claim is revealed.
- **Sybil resistance:** nullifiers prevent repeated use for the same action.
- **Composability:** proofs can be checked by smart contracts or third-party services.

This is useful for privacy-first systems where users should not have to "doxx" their full profile to pass a gate.

---

## 3) Core Concepts

## 3.1 Trait / Attestation

A trait is represented by an `attestation_id` (integer).

Examples:

- Early adopter
- High volume trader
- Governance participant
- Ecosystem contributor
- Custom third-party badge

## 3.2 Selective Disclosure

The user proves one statement, such as:

"I possess attestation 200."

without revealing the private data used to prove it.

## 3.3 External Nullifier

An external nullifier scopes a proof to a specific action context.

Example action scopes:

- Vote #42
- Campaign #2026-Q1
- Loan application #A17

Nullifier is derived from stealth secret + external nullifier so the same identity cannot reuse the same action proof repeatedly.

## 3.4 Merkle Root

Merkle roots anchor the set of attestations included in proof membership logic.

The verifier accepts proofs only against recognized/valid roots.

---

## 4) Architecture Overview

PSR spans four layers:

## 4.1 Frontend (React/TypeScript)

- Reputation dashboard
- Trait discovery display
- Prove modal
- Issue trait modal
- On-chain submission UX

## 4.2 Scanner / Witness Layer (Rust WASM)

- Parses announcement metadata
- Finds traits belonging to recipient
- Provides inputs used for witness/proof generation

## 4.3 ZK Circuit Layer (Circom + Groth16)

- Encodes validity constraints
- Produces proof + public signals
- Exposes nullifier and validity signal

## 4.4 Verifier Layer (Solidity)

- Verifies Groth16 proof
- Checks root validity
- Enforces nullifier one-time usage
- Emits verification events

---

## 5) End-to-End Flow

## 5.1 Issuance (Trait Creation)

1. Issuer chooses a recipient stealth meta-address.
2. Issuer selects known/custom trait id.
3. App computes stealth destination/view-tag metadata.
4. Issuer calls announcer `announce(...)` with attestation metadata.

Result: trait is written into chain-observable announcement data, but only the recipient can efficiently discover ownership.

## 5.2 Discovery (Private Trait Detection)

1. Recipient scans announcements.
2. WASM performs view-tag prefilter and ownership checks.
3. Matching attestation metadata is decoded.
4. Trait appears in `Reputation -> Your Verified Traits`.

## 5.3 Proof Generation

1. User clicks `Prove Trait`.
2. App reconstructs trait-specific stealth private key.
3. Witness is prepared.
4. snarkjs generates Groth16 proof locally.
5. App stores proof payload, root, nullifier, public signals.

## 5.4 Submission / Verification

1. App validates that Merkle root is accepted by verifier.
2. App simulates call to detect reverts early.
3. User signs transaction to `verifyReputation(...)`.
4. Contract verifies proof and consumes nullifier.
5. `ReputationVerified` event is emitted.

---

## 6) What Is Public vs Private

## Public (in verification context)

- attestation id being proven
- external nullifier context
- nullifier value
- proof verification success/failure
- verifier transaction/event trail

## Private

- main wallet linkage (unless user separately links it)
- stealth private key
- stealth address graph/history
- other unrelated traits

---

## 7) Why This Is "Programmable"

PSR is programmable because gates can be defined by application logic.

Examples:

- "Trait 200 required for Discord role claim"
- "Trait 4 + one-time nullifier required for vote"
- "Trait 2 required for vault access"
- "Trait 5 for fee discount or launch participation"

A dApp can set any trait/action rule and rely on proofs instead of raw identity disclosure.

---

## 8) Practical Use Cases

## 8.1 Private Token-Gated Communities

- Requirement: user must hold trait `community_member`.
- User proves trait on-chain.
- Backend/listener grants access role after verification event.

## 8.2 Governance Eligibility Without Doxxing

- Requirement: one vote per eligible trait holder.
- Nullifier prevents repeated voting for same proposal context.
- Wallet and full reputation history remain private.

## 8.3 Sybil-Resistant Campaign Claims

- Requirement: user has campaign participation trait.
- Nullifier scoped to campaign id prevents duplicate claim.

## 8.4 Private Credit/Risk Prequalification

- User proves qualifying trait (e.g., repayment badge) without exposing account graph.
- Lender verifies proof and grants access to better terms.

## 8.5 Selective Enterprise Compliance

- User proves possession of compliance attestation from approved issuer.
- No need to expose complete identity wallet tree.

---

## 9) Third-Party Integration Model

Third parties can integrate PSR in two modes:

## 9.1 On-chain Gate

- Contract checks proof via `verifyReputation`.
- Third party listens for verifier events or reads contract state.

## 9.2 Off-chain Gate

- User shares proof payload directly.
- Service verifies proof off-chain and grants access.

On-chain mode offers trustless composability.
Off-chain mode offers lower cost and faster UX.

---

## 10) Operational Considerations

## 10.1 Merkle Root Management

Verifier requires accepted/valid roots.

Operational best practice:

- publish roots in scheduled windows,
- keep proofs pinned to their generation root,
- avoid high-frequency root churn,
- monitor root expiry windows.

## 10.2 Retry Behavior

Retry should re-attempt submission using the proof-pinned root; otherwise root/proof mismatch can cause failures.

## 10.3 Nullifier Strategy

Use action-scoped external nullifiers.
Changing nullifier changes anti-replay semantics.

---

## 11) Current Trust / Policy Notes

- Trait issuance policy is currently open (anyone can issue).
- Root update is admin-controlled at verifier level.
- Identity-linking proof ("this stealth identity is main wallet X") is not the default PSR statement.

If required, issuer policy and identity-link proofs can be added as extensions.

---

## 12) Summary

Programmable Stealth Reputation gives Opaque:

- privacy-preserving reputation,
- verifiable selective disclosure,
- anti-Sybil action control,
- and practical composability for access gating.

It enables applications to trust proofs instead of demanding full wallet transparency.

