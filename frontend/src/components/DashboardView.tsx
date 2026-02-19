import type { Tab } from "./Layout";

type DashboardViewProps = {
  onNavigate: (t: Tab) => void;
};

export function DashboardView({ onNavigate }: DashboardViewProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-white mb-1">Dashboard</h2>
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
