/**
 * Minimal landing page explaining the Dual-Key Stealth Protocol.
 * Shown before "Enter the Vault" for first-time visitors.
 */

import { Footer } from "./Footer";

type LandingPageProps = {
  onEnterVault: () => void;
};

export function LandingPage({ onEnterVault }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 max-w-xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12">
          Dual-Key Stealth Protocol
        </h1>
        <div className="space-y-8 text-neutral-400 text-sm md:text-base leading-relaxed">
          <p className="text-neutral-300">
            Send and receive without linking your identity to your wallet on-chain.
          </p>
          <div className="space-y-4 pl-0 md:pl-4 border-l-0 md:border-l border-neutral-700 border-l-neutral-700">
            <p>
              <span className="text-white font-medium">Stealth Meta-Address</span> — Your public privacy identity (derived from a signature). No one can see your balances from this alone.
            </p>
            <p>
              <span className="text-white font-medium">ECDH Derivation</span> — Each payment uses a shared secret (sender’s ephemeral key + your viewing key). Only you can detect and open your payments.
            </p>
            <p>
              <span className="text-white font-medium">One-time Ghost Address</span> — Every transfer goes to a unique, one-time address. No address reuse; no graph analysis.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEnterVault}
          className="mt-14 w-full max-w-sm py-4 px-6 rounded-xl text-base font-semibold bg-white text-black hover:opacity-90 transition-opacity"
        >
          Enter the Vault
        </button>
      </div>
      <Footer />
    </div>
  );
}
