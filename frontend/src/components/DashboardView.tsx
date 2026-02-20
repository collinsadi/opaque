import type { Tab } from "./Layout";
import { AddressDisplay } from "./AddressDisplay";

type DashboardViewProps = {
  onNavigate: (t: Tab) => void;
  address?: string;
};

export function DashboardView({ onNavigate, address }: DashboardViewProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 className="text-lg font-semibold text-white">Dashboard</h2>
        {address && (
          <AddressDisplay address={address} className="shrink-0" />
        )}
      </div>
      <p className="text-sm text-neutral-500 mb-8">
        Send or receive with privacy.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => onNavigate("send")}
          className="card flex flex-col items-center justify-center min-h-[140px] hover:border-neutral-600 transition-colors"
        >
          <span className="text-3xl mb-2" aria-hidden>↑</span>
          <span className="text-lg font-semibold text-white">Send</span>
          <span className="text-xs text-neutral-500 mt-1">Stealth transfer</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate("receive")}
          className="card flex flex-col items-center justify-center min-h-[140px] hover:border-neutral-600 transition-colors"
          data-tour="receive"
        >
          <span className="text-3xl mb-2" aria-hidden>↓</span>
          <span className="text-lg font-semibold text-white">Receive</span>
          <span className="text-xs text-neutral-500 mt-1">Payment link or ghost address</span>
        </button>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onNavigate("balance")}
          className="px-4 py-2 rounded-lg text-sm btn-secondary"
          data-tour="vault"
        >
          Private balance
        </button>
        <button
          type="button"
          onClick={() => onNavigate("history")}
          className="px-4 py-2 rounded-lg text-sm btn-secondary"
        >
          Transaction history
        </button>
      </div>
    </div>
  );
}
