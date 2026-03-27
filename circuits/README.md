# Opaque Stealth Attestation Circuit

ZK-SNARK circuit for proving ownership of a stealth address and the validity of an
attestation (e.g. "" badge) **without revealing the address**.

## Architecture

- **Curve**: BabyJubJub (efficient inside SNARKs)
- **Hash**: Poseidon (algebraic, ~8x cheaper in constraints vs Keccak)
- **Proof system**: Groth16 (constant-size proofs, fast on-chain verification)
- **Tree depth**: 20 levels (~1 million announcement capacity)

## Circuit Logic

1. **Derive stealth public key** from `stealth_private_key` via BabyJubJub scalar multiplication
2. **ECDH shared secret** between stealth key and `ephemeral_pubkey`
3. **Stealth address commitment** = `Poseidon(shared_secret, stealth_pubkey)`
4. **Announcement leaf** = `Poseidon(commitment, attestation_id)`
5. **Merkle inclusion proof** — walk from leaf to root
6. **Root check** — computed root must match public `merkle_root`
7. **Attestation check** — announcement's attestation must match public `attestation_id`
8. **Nullifier** = `Poseidon(stealth_private_key, external_nullifier)` — Sybil resistance

## Build & Prove

```bash
npm install
mkdir -p build

# Compile circuit (requires circom 2.x — install from https://github.com/iden3/circom)
circom stealth_attestation.circom --r1cs --wasm --sym -o build/

# Generate Powers of Tau locally (one-time, for development)
npx snarkjs powersoftau new bn128 16 pot16_0000.ptau -v
npx snarkjs powersoftau contribute pot16_0000.ptau pot16_0001.ptau --name="dev" -e="$(head -c 64 /dev/urandom | xxd -p -c 128)"
npx snarkjs powersoftau prepare phase2 pot16_0001.ptau pot16_final.ptau -v   # ~15 min

# Trusted setup
npx snarkjs groth16 setup build/stealth_attestation.r1cs pot16_final.ptau build/sa_0000.zkey
npx snarkjs zkey contribute build/sa_0000.zkey build/sa_final.zkey --name="dev" -e="$(head -c 64 /dev/urandom | xxd -p -c 128)"

# Generate witness
node generate_witness.js
cd build/stealth_attestation_js && node generate_witness.js ../stealth_attestation.wasm ../input.json ../witness.wtns && cd ../..

# Prove & verify
npx snarkjs groth16 prove build/sa_final.zkey build/witness.wtns build/proof.json build/public.json
npx snarkjs groth16 verify <(npx snarkjs zkey export verificationkey build/sa_final.zkey) build/public.json build/proof.json

# Export Solidity verifier
npx snarkjs zkey export solidityverifier build/sa_final.zkey build/Groth16Verifier.sol
```
