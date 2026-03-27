/**
 * ReputationDashboardView — Displays discovered "Verified Traits" and lets
 * the user generate ZK proofs for selective disclosure.
 *
 * Traits are discovered by the Rust WASM scanner from announcement metadata.
 * When the user clicks "Prove Trait," a modal explains what will be shared
 * (the trait) vs what stays hidden (wallet, history). The WASM core then
 * generates a witness, and snarkjs creates the Groth16 proof in a background worker.
 */

import { useState, useCallback } from "react";
import { useReputationStore } from "../store/reputationStore";
import { KNOWN_TRAITS, type DiscoveredTrait, type ProofStage } from "../lib/reputation";
import { ProveTraitModal } from "./ProveTraitModal";
import { IssueTraitModal } from "./IssueTraitModal";

const ICONS: Record<string, string> = {
  code: "</> ",
  "trending-up": "↗ ",
  zap: "⚡ ",
  shield: "🛡 ",
  layers: "◈ ",
};

const CATEGORY_COLORS: Record<string, string> = {
  developer: "border-emerald-500/40 bg-emerald-500/5",
  trader: "border-amber-500/40 bg-amber-500/5",
  community: "border-violet-500/40 bg-violet-500/5",
  custom: "border-neutral-500/40 bg-neutral-500/5",
};

const CATEGORY_BADGES: Record<string, string> = {
  developer: "bg-emerald-500/20 text-emerald-400",
  trader: "bg-amber-500/20 text-amber-400",
  community: "bg-violet-500/20 text-violet-400",
  custom: "bg-neutral-500/20 text-neutral-400",
};

type ReputationDashboardViewProps = {
  onBack: () => void;
};

export function ReputationDashboardView({ onBack }: ReputationDashboardViewProps) {
  const { discoveredTraits, proofState } = useReputationStore();
  const [selectedTrait, setSelectedTrait] = useState<DiscoveredTrait | null>(null);
  const [showProveModal, setShowProveModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);

  const handleProveTrait = useCallback((trait: DiscoveredTrait) => {
    setSelectedTrait(trait);
    setShowProveModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowProveModal(false);
    setSelectedTrait(null);
  }, []);

  const discoveredIds = new Set(discoveredTraits.map((t) => t.attestationId));
  const undiscoveredTraits = KNOWN_TRAITS.filter((t) => !discoveredIds.has(t.attestationId));

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-neutral-400 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h2 className="text-lg font-semibold text-white">Reputation</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowIssueModal(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white border border-white/20 hover:border-white/40 transition-colors"
        >
          Issue Trait
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-6">
        Verified Traits discovered from your stealth history. Prove any trait without revealing your identity.
      </p>

      {/* Discovered traits */}
      {discoveredTraits.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
            Your Verified Traits
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {discoveredTraits.map((trait) => {
              const def = trait.traitDef;
              return (
                <div
                  key={`${trait.txHash}-${trait.attestationId}`}
                  className={`rounded-xl border p-4 ${CATEGORY_COLORS[def.category]} transition-colors`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg" aria-hidden>
                          {ICONS[def.icon] || "● "}
                        </span>
                        <span className="font-semibold text-white">{def.label}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_BADGES[def.category]}`}>
                          {def.category}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400 mb-2">{def.description}</p>
                      <div className="flex items-center gap-3 text-[10px] text-neutral-600">
                        <span>Block #{trait.blockNumber}</span>
                        <span className="truncate max-w-[140px]" title={trait.txHash}>
                          tx: {trait.txHash.slice(0, 10)}...
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleProveTrait(trait)}
                      disabled={proofState.stage !== "idle" && proofState.stage !== "error" && proofState.stage !== "verified"}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 border border-white/10 hover:border-white/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Prove Trait
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {discoveredTraits.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center mb-8">
          <div className="text-3xl mb-3" aria-hidden>🔍</div>
          <h3 className="text-sm font-semibold text-white mb-1">No traits discovered yet</h3>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Traits are automatically detected when scanning your stealth announcements.
            Use the Private Balance scanner to discover attestations in your history.
          </p>
        </div>
      )}

      {/* Undiscovered / available traits */}
      {undiscoveredTraits.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
            Available Traits
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {undiscoveredTraits.map((def) => (
              <div
                key={def.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 opacity-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base" aria-hidden>
                    {ICONS[def.icon] || "● "}
                  </span>
                  <span className="font-medium text-neutral-300 text-sm">{def.label}</span>
                </div>
                <p className="text-[11px] text-neutral-600">{def.description}</p>
                <span className="inline-block mt-2 text-[10px] text-neutral-600 border border-neutral-800 rounded px-1.5 py-0.5">
                  Not yet earned
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proof generation status bar */}
      {proofState.stage !== "idle" && (
        <ProofProgressBar stage={proofState.stage} progress={proofState.progress} error={proofState.error} />
      )}

      {/* Prove modal */}
      {showProveModal && selectedTrait && (
        <ProveTraitModal trait={selectedTrait} onClose={handleCloseModal} />
      )}

      {/* Issue modal */}
      {showIssueModal && (
        <IssueTraitModal onClose={() => setShowIssueModal(false)} />
      )}
    </div>
  );
}

// =============================================================================
// Proof progress bar (shown at bottom of dashboard)
// =============================================================================

function ProofProgressBar({ stage, progress, error }: { stage: ProofStage; progress: number; error: string | null }) {
  const messages: Record<ProofStage, string> = {
    idle: "",
    "preparing-witness": "Preparing witness data...",
    "generating-proof": "Generating ZK-Proof...",
    "proof-ready": "Proof ready!",
    submitting: "Submitting to verifier...",
    verified: "Verified on-chain!",
    error: error || "Proof generation failed",
  };

  const isError = stage === "error";
  const isDone = stage === "proof-ready" || stage === "verified";

  return (
    <div className={`fixed bottom-20 left-4 right-4 md:left-auto md:right-6 z-40 max-w-sm md:ml-auto rounded-xl border px-4 py-3 shadow-xl ${
      isError
        ? "border-red-500/30 bg-red-950/80"
        : isDone
          ? "border-emerald-500/30 bg-emerald-950/80"
          : "border-neutral-700 bg-neutral-900/95"
    }`}>
      <div className="flex items-center gap-3">
        {!isDone && !isError && (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" aria-hidden />
        )}
        {isDone && <span className="text-emerald-400 shrink-0" aria-hidden>✓</span>}
        {isError && <span className="text-red-400 shrink-0" aria-hidden>✗</span>}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${isError ? "text-red-300" : isDone ? "text-emerald-300" : "text-white"}`}>
            {messages[stage]}
          </p>
          {!isDone && !isError && (
            <div className="mt-1.5 h-1 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
