export function ApiReference() {
  const rows = [
    {
      method: "OpaqueClient.create(config)",
      desc: "Async factory: loads WASM, derives keys from walletSignature, wires RPC.",
    },
    {
      method: "OpaqueClient.supportedChainIds()",
      desc: "Static: chain IDs with bundled contract addresses.",
    },
    {
      method: "OpaqueClient.chainDeployment(chainId)",
      desc: "Static: registry, announcer, optional verifier, default tokens.",
    },
    {
      method: "getMetaAddressHex()",
      desc: "66-byte meta-address hex for sharing / registry.",
    },
    {
      method: "getContracts()",
      desc: "Resolved registry, announcer, optional reputation verifier.",
    },
    {
      method: "resolveRecipientMetaAddress(recipientAddress)",
      desc: "RPC read: registry meta-address for scheme 1; registered flag + optional metaAddressHex.",
    },
    {
      method: "buildRegisterMetaAddressTransaction()",
      desc: "Returns { to, data, chainId, metaAddressHex } for registerKeys.",
    },
    {
      method: "prepareStealthSend(recipientMetaHex)",
      desc: "Random ephemeral key; returns stealth address, view tag, metadata, secrets.",
    },
    {
      method: "prepareGhostReceive()",
      desc: "Same as prepareStealthSend(getMetaAddressHex()) — one-time receive without prior announcement.",
    },
    {
      method: "buildAnnounceTransactionRequest(send)",
      desc: "ABI-encoded announce calldata + human-readable summary fields.",
    },
    {
      method: "buildAnnounceTransactionRequestForGhost(ephemeralPrivateKey)",
      desc: "Recompute announce args from stored 32-byte ephemeral secret (retroactive ghost announce).",
    },
    {
      method: "filterOwnedAnnouncements(rows)",
      desc: "WASM scan over indexer rows → OwnedStealthOutput[].",
    },
    {
      method: "getStealthSignerPrivateKey(output)",
      desc: "32-byte secp256k1 key for output’s stealth address (WASM reconstruct_signing_key).",
    },
    {
      method: "getStealthSignerPrivateKeyFromEphemeralPrivateKey(bytes32)",
      desc: "Same key when you only stored ephemeral secret from prepareGhostReceive / prepareStealthSend.",
    },
    {
      method: "getBalancesFromAnnouncements(rows)",
      desc: "Owned addresses × tracked tokens via rpcUrl → TokenBalanceSummary[].",
    },
    {
      method: "discoverTraits(rows)",
      desc: "Same scan → DiscoveredTrait[] for PSR UI.",
    },
    {
      method: "getReputationTraitsFromAnnouncements(rows)",
      desc: "Alias of discoverTraits — reputation naming.",
    },
    {
      method: "encodeReputationMetadata(viewTag, attestationId)",
      desc: "PSR metadata bytes (view tag + marker + u64 id) via WASM.",
    },
    {
      method: "prepareReputationAssignment(recipientMeta, attestationId)",
      desc: "Issuer: stealth prep with PSR metadata embedded.",
    },
    {
      method: "buildAssignReputationTransaction(recipientMeta, attestationId)",
      desc: "Issuer: announce calldata only (assign trait to derived stealth address).",
    },
    {
      method: "announcementsJsonForReputationWitness(rows)",
      desc: "JSON string for generateReputationProof(attestationsJson) Merkle witness.",
    },
    {
      method: "getStealthSignerPrivateKeyForReputationTrait(trait)",
      desc: "Spend key for a DiscoveredTrait (needs ephemeralPubkey).",
    },
    {
      method: "generateReputationProof({ trait, … })",
      desc: "Groth16 ProofData (snarkjs; optional wasm/zkey URLs default to opaque.cash/circuits).",
    },
    {
      method: "fetchLatestValidReputationRoot()",
      desc: "Latest valid Merkle root on OpaqueReputationVerifier.",
    },
    {
      method: "isReputationRootValid(root)",
      desc: "Whether verifier accepts this root now.",
    },
    {
      method: "fetchReputationRootHistory()",
      desc: "All roots + validity flags.",
    },
    {
      method: "verifyReputationProofView(args)",
      desc: "verifyReputationView — read-only on-chain check.",
    },
    {
      method: "simulateReputationVerification(wallet, args)",
      desc: "Preflight verifyReputation.",
    },
    {
      method: "submitReputationVerification(wallet, args)",
      desc: "Broadcast verifyReputation (nullifier).",
    },
    {
      method: "OpaqueClient.buildReputationActionScope({ chainId, module, actionId })",
      desc: "Static: deterministic scope string.",
    },
    {
      method: "OpaqueClient.reputationExternalNullifierFromScope(scope)",
      desc: "Static: keccak → uint256 nullifier.",
    },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl font-bold text-white">
        API reference — OpaqueClient
      </h1>
      <p className="text-mist">
        Full typings and JSDoc live in the package source under{" "}
        <code className="text-glow">sdk/packages/opaque/</code>.
      </p>
      <div className="overflow-x-auto rounded-xl border border-ink-600">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-600 bg-ink-900/80">
              <th className="p-3 font-mono text-xs text-glow">API</th>
              <th className="p-3 text-mist">Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.method}
                className="border-b border-ink-700/80 text-slate-300"
              >
                <td className="whitespace-nowrap p-3 font-mono text-[13px] text-glow/90">
                  {r.method}
                </td>
                <td className="p-3">{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
