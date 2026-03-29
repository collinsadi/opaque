import { useState } from "react";
import { ChevronRight, Layers, Shield, Zap } from "lucide-react";

export type FlowId = "stealth-only" | "psr" | "full";

const FLOWS: Record<
  FlowId,
  {
    label: string;
    icon: typeof Shield;
    description: string;
    steps: { title: string; detail: string; packages: string[] }[];
  }
> = {
  "stealth-only": {
    label: "Stealth payments",
    icon: Shield,
    description:
      "Register a meta-address, announce transfers, scan logs with WASM, reconstruct one-time keys. No reputation proofs.",
    steps: [
      {
        title: "Configure clients",
        detail:
          "Create a viem publicClient + walletClient. Set registry and announcer addresses for your chain.",
        packages: ["viem", "@opaquecash/stealth-chain"],
      },
      {
        title: "Register meta-address",
        detail:
          "Derive viewing + spending keys (your app’s policy), build 66-byte V||S, call registerStealthMetaAddress.",
        packages: ["@opaquecash/stealth-core", "@opaquecash/stealth-chain"],
      },
      {
        title: "Send: derive + announce",
        detail:
          "Sender derives stealth address + view tag; encodes metadata with tag first byte; announceStealthTransfer.",
        packages: ["@opaquecash/stealth-wasm", "@opaquecash/stealth-chain"],
      },
      {
        title: "Receive: scan + verify",
        detail:
          "watchAnnouncements or fetchAnnouncementsRange; initStealthWasm; filter by view tag then checkAnnouncement.",
        packages: ["@opaquecash/stealth-wasm", "@opaquecash/stealth-chain"],
      },
      {
        title: "Spend / sweep",
        detail:
          "reconstructSigningKey(masterSpend, masterView, ephemeral) → 32-byte key for viem/ethers signer.",
        packages: ["@opaquecash/stealth-wasm"],
      },
    ],
  },
  psr: {
    label: "PSR proofs",
    icon: Zap,
    description:
      "After you already have traits and a stealth private key for an output, build a scope, witness, Groth16 proof, and verify on-chain.",
    steps: [
      {
        title: "Action scope",
        detail:
          "buildActionScope({ chainId, module, actionId }) then externalNullifierFromScope — deterministic per action, not timestamps.",
        packages: ["@opaquecash/psr-core"],
      },
      {
        title: "Merkle root",
        detail:
          "fetchLatestValidRoot or your indexer; root must match the tree the circuit expects and be valid on OpaqueReputationVerifier.",
        packages: ["@opaquecash/psr-chain"],
      },
      {
        title: "Witness",
        detail:
          "buildWitnessFromWasm (real tree paths) or buildWitnessCircuitConsistent (dev placeholder tree).",
        packages: ["@opaquecash/psr-prover", "@opaquecash/stealth-wasm"],
      },
      {
        title: "Prove",
        detail:
          "generateGroth16Proof(witness, { wasmPath, zkeyPath }) → ProofData + publicSignals.",
        packages: ["@opaquecash/psr-prover"],
      },
      {
        title: "Submit",
        detail:
          "submitVerifyReputation(publicClient, wallet, verifier, { proofData, merkleRoot, externalNullifier }).",
        packages: ["@opaquecash/psr-chain", "viem"],
      },
    ],
  },
  full: {
    label: "Full stack",
    icon: Layers,
    description:
      "Stealth announcements carry attestation metadata; WASM scans traits; same signing key feeds the PSR circuit.",
    steps: [
      {
        title: "Keys + registry",
        detail:
          "Same as stealth-only: user has spend/view keys; meta-address on StealthMetaAddressRegistry.",
        packages: ["@opaquecash/stealth-core", "@opaquecash/stealth-chain"],
      },
      {
        title: "Announce with metadata",
        detail:
          "encodeAttestationMetadata(viewTag, attestationId) for PSR markers; first byte remains view tag.",
        packages: ["@opaquecash/stealth-wasm"],
      },
      {
        title: "Discover traits",
        detail:
          "Stream announcements → announcementToScannerJson → scanAttestationsJson → JSON.parse → attestationsToDiscoveredTraits.",
        packages: [
          "@opaquecash/stealth-core",
          "@opaquecash/stealth-wasm",
          "@opaquecash/psr-core",
        ],
      },
      {
        title: "Reconstruct + prove",
        detail:
          "reconstructSigningKey for that announcement; generateReputationProof (optional attestationsJson; artifacts default to opaque.cash/circuits).",
        packages: ["@opaquecash/stealth-wasm", "@opaquecash/psr-prover"],
      },
      {
        title: "Verify reputation",
        detail:
          "submitVerifyReputation or verifyReputationView for read-only checks.",
        packages: ["@opaquecash/psr-chain"],
      },
    ],
  },
};

export function FlowExplorer() {
  const [flow, setFlow] = useState<FlowId>("full");
  const [step, setStep] = useState(0);
  const data = FLOWS[flow];
  const max = data.steps.length - 1;
  const safeStep = Math.min(step, max);
  const Icon = data.icon;
  const current = data.steps[safeStep];

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <div className="flex flex-col gap-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-mist">
          Pick a flow
        </p>
        {(Object.keys(FLOWS) as FlowId[]).map((id) => {
          const f = FLOWS[id];
          const I = f.icon;
          const active = flow === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFlow(id);
                setStep(0);
              }}
              className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                active
                  ? "border-glow/50 bg-glow-muted/20 shadow-[0_0_24px_-8px_rgba(94,234,212,0.35)]"
                  : "border-ink-600 bg-ink-900/40 hover:border-ink-500"
              }`}
            >
              <I
                size={20}
                className={active ? "text-glow" : "text-mist"}
                aria-hidden
              />
              <span>
                <span
                  className={`block font-display text-sm font-semibold ${active ? "text-white" : "text-slate-300"}`}
                >
                  {f.label}
                </span>
                <span className="mt-0.5 block text-xs text-mist">
                  {id === "stealth-only"
                    ? "Payments & balance"
                    : id === "psr"
                      ? "ZK + verifier"
                      : "Wallet-style"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-ink-600 bg-ink-900/50 p-6 md:p-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-glow-muted/30 text-glow">
            <Icon size={22} />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-white">
              {data.label}
            </h3>
            <p className="text-sm text-mist">{data.description}</p>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {data.steps.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === safeStep
                  ? "w-8 bg-glow"
                  : "w-2 bg-ink-600 hover:bg-ink-500"
              }`}
              aria-label={`Step ${i + 1}`}
              aria-current={i === safeStep ? "step" : undefined}
            />
          ))}
        </div>

        <div className="rounded-xl border border-ink-700 bg-ink-950/60 p-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-glow">
            <span>Step {safeStep + 1}</span>
            <ChevronRight size={14} className="text-mist" />
            <span className="text-white normal-case tracking-normal">
              {current.title}
            </span>
          </div>
          <p className="text-[15px] leading-relaxed text-slate-300">
            {current.detail}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {current.packages.map((p) => (
              <span
                key={p}
                className="rounded-md bg-ink-800 px-2 py-1 font-mono text-xs text-glow/90"
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            disabled={safeStep <= 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-glow/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Back
          </button>
          <button
            type="button"
            disabled={safeStep >= max}
            onClick={() => setStep((s) => Math.min(max, s + 1))}
            className="rounded-lg bg-glow px-4 py-2 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next step
          </button>
        </div>
      </div>
    </div>
  );
}
