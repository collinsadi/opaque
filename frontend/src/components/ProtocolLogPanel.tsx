import { useState } from "react";
import { useProtocolLog } from "../context/ProtocolLogContext";
import type { ProtocolLogSource } from "../context/ProtocolLogContext";

const sourceLabel: Record<ProtocolLogSource, string> = {
  wasm: "WASM",
  blockchain: "Chain",
  ui: "UI",
};

const sourceClass: Record<ProtocolLogSource, string> = {
  wasm: "text-cyan",
  blockchain: "text-emerald-400",
  ui: "text-slate-400",
};

export function ProtocolLogPanel() {
  const { entries, clear } = useProtocolLog();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="border-t border-frost-border glass">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2 text-left text-sm font-mono text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
      >
        <span>
          Protocol Log {entries.length > 0 && `(${entries.length})`}
        </span>
        <span className="text-slate-500">{collapsed ? "▼" : "▲"}</span>
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 max-h-48 overflow-y-auto">
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={clear}
              className="text-xs font-mono text-slate-500 hover:text-slate-300 px-2 py-1 rounded border border-frost-border hover:border-slate-500"
            >
              Clear
            </button>
          </div>
          <ul className="space-y-1 font-mono text-xs">
            {entries.length === 0 ? (
              <li className="text-slate-600">No entries yet.</li>
            ) : (
              entries.map((e) => (
                <li
                  key={e.id}
                  className="flex gap-2 items-baseline text-slate-400"
                >
                  <span
                    className={`shrink-0 w-12 ${sourceClass[e.source]}`}
                  >
                    [{sourceLabel[e.source]}]
                  </span>
                  <span className="text-slate-500 text-[10px] shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="break-all">{e.message}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
