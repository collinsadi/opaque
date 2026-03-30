import { Link } from "react-router-dom";
import { LegalPageLayout } from "./LegalPageLayout";

export function GasTankPage() {
  return (
    <LegalPageLayout title="Gas Tank">
      <section>
        <h2 className="text-white font-medium text-base mb-2">What is the Gas Tank?</h2>
        <p>
          The Gas Tank is a stealth address generated specifically for you to hold native Sepolia ETH used only to pay network fees when sweeping ERC20 tokens that support EIP-2612 permit.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">Why use it?</h2>
        <p>
          When you withdraw (sweep) an ERC20 from a stealth address, the transaction normally has to be sent from that stealth address, so it needs a small amount of native token to pay gas. If you fund that stealth address from your main wallet, you link your identity to the stealth address on-chain. The Gas Tank lets you fund a single, dedicated stealth address once. For tokens that support permit, the Gas Tank can pay the gas for the sweep so the stealth address holding the ERC20 never needs any native token—keeping your privacy set intact.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">How it works</h2>
        <p>
          You initialize the tank from the dashboard. The app derives a deterministic stealth address from your keys (same address every time on this device). You send native tokens to that address. When you sweep an ERC20 that supports permit, the stealth address signs an EIP-712 permit message authorizing the transfer, and the Gas Tank submits the transaction and pays the gas. The tokens move from the stealth address to your destination without that stealth address ever spending native tokens.
        </p>
      </section>

      <section>
        <h2 className="text-white font-medium text-base mb-2">This device vs other devices</h2>
        <p>
          <strong className="text-neutral-200">On this device</strong>, the Gas Tank is available as a gas-paying wallet: you can fund it and use it to pay for ERC20 permit sweeps. <strong className="text-neutral-200">On another device</strong>, you will not have the same “Gas Tank” setup unless you repeat the process there. On another device, the same deterministic address could only be used as a normal stealth wallet—you could receive and hold native tokens there, but the app on that device would not treat it as your Gas Tank for gasless sweeps. So you might only be able to use this tank as a gas tank on this device; on another device you would only be able to access it as a normal stealth wallet with native tokens (e.g. to sweep ETH from it), not as the dedicated gas payer for permit-based ERC20 sweeps.
        </p>
      </section>

      <p className="pt-4">
        <Link to="/app" className="text-white underline hover:no-underline">
          ← Back to app
        </Link>
      </p>
    </LegalPageLayout>
  );
}
