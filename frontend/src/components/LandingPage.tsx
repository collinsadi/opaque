/**
 * Landing for Opaque: EIP-5564 stealth + PSR protocol infrastructure.
 * Shown before "Enter the Vault" for first-time visitors.
 */

import { Footer } from "./Footer";

type LandingPageProps = {
  onEnterVault: () => void;
};

function BentoTile({
  className = "",
  label,
  title,
  body,
}: {
  className?: string;
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/8 bg-white/3 p-5 md:p-6 flex flex-col justify-between min-h-[140px] hover:border-white/12 hover:bg-white/5 transition-colors duration-300 ${className}`}
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-600 mb-2">{label}</p>
      <div>
        <p className="text-sm font-semibold text-white mb-1.5">{title}</p>
        <p className="text-xs text-neutral-500 leading-relaxed">{body}</p>
      </div>
    </div>
  );
}

export function LandingPage({ onEnterVault }: LandingPageProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-black text-white relative overflow-x-hidden">
      {/* Ambient — clipped so blurs don’t extend past viewport width; page scrolls vertically */}
      <div className="absolute inset-0 overflow-x-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)" }}
        />
        <div
          className="absolute -top-32 right-0 w-[min(55vw,520px)] h-[min(55vh,480px)] opacity-90"
          style={{
            background:
              "radial-gradient(ellipse at 70% 20%, rgba(255,255,255,0.04) 0%, transparent 55%)",
            filter: "blur(48px)",
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-[min(45vw,400px)] h-[40vh] opacity-60"
          style={{
            background: "radial-gradient(ellipse at 0% 100%, rgba(255,255,255,0.03) 0%, transparent 60%)",
            filter: "blur(40px)",
          }}
        />
      </div>

      <div className="flex-1 relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-8 pt-12 sm:pt-14 md:pt-20 lg:pt-24 pb-[max(2rem,env(safe-area-inset-bottom))] sm:pb-12 md:pb-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-10 xl:gap-14 items-start">
          {/* Left: narrative + CTA */}
          <div className="lg:col-span-5 flex flex-col lg:sticky lg:top-24">
            <div className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full border border-white/10 bg-white/4 text-[11px] text-neutral-400 mb-8">
              <span
                className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                style={{ boxShadow: "0 0 8px rgba(52,211,153,0.6)" }}
              />
              Sepolia · EIP-5564
            </div>

            <p className="text-xs uppercase tracking-[0.25em] text-neutral-600 mb-4">Protocol infrastructure</p>
            <h1
              className="text-4xl sm:text-5xl lg:text-[2.75rem] xl:text-6xl font-bold tracking-tight leading-[1.05] mb-6"
            >
              Stealth rails
              <br />
              <span className="text-neutral-500">you can build on.</span>
            </h1>
            <p className="text-neutral-500 text-base leading-relaxed mb-8 max-w-md">
              Opaque is <span className="text-neutral-300">on-chain infrastructure</span> for{" "}
              <span className="text-neutral-300">EIP-5564</span> stealth payments and{" "}
              <span className="text-neutral-300">Programmable Stealth Reputation</span> — deployed contracts, a
              shared announcement stream, verifiers, and a client-side proving stack so applications can offer
              private receive and selective disclosure without running custodial infra.
            </p>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
              <button
                type="button"
                onClick={onEnterVault}
                className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold bg-white text-black transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98]"
                style={{ boxShadow: "0 0 36px rgba(255,255,255,0.07)" }}
              >
                Enter the Vault
                <span className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </button>
              <p className="text-[11px] text-neutral-600 max-w-[200px] leading-snug">
                Reference client on Sepolia — same contracts and circuits integrators use.
              </p>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-700 border-t border-white/6 pt-6">
              <span>Registry &amp; announcer</span>
              <span className="text-neutral-800">·</span>
              <span>Groth16 verifiers</span>
              <span className="text-neutral-800">·</span>
              <span>Subgraph-indexed events</span>
              <span className="text-neutral-800">·</span>
              <span>WASM + Circom</span>
            </div>
          </div>

          {/* Right: bento */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <BentoTile
              className="sm:col-span-2 min-h-[160px]"
              label="Stealth layer"
              title="EIP-5564 rails"
              body="Meta-address registry and a singleton announcer for standardized Announcement logs — the same stream wallets and indexers can subscribe to, without a proprietary backend."
            />
            <BentoTile
              label="Reputation"
              title="PSR verification"
              body="Groth16 proofs, Merkle roots, and nullifiers on-chain so gates can trust selective-disclosure credentials composably."
            />
            <BentoTile
              label="Verification"
              title="OpaqueReputationVerifier"
              body="Verifier contracts pin proof semantics; apps integrate by calling verify with public inputs and proof bytes."
            />
            <BentoTile
              className="sm:col-span-2 min-h-[130px]"
              label="Client stack"
              title="Proving &amp; scanning in the browser"
              body="Rust WASM for secp256k1 scanning and witness paths; snarkjs + Circom for proofs — suitable for embedding in dapps and wallet surfaces that connect to the same deployed infrastructure."
            />
          </div>
        </div>
      </div>

      <div className="shrink-0 relative z-10 w-full pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Footer />
      </div>
    </div>
  );
}
