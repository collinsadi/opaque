import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export function PlaygroundLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 bg-grid-fade bg-size-grid">
      <header className="sticky top-0 z-50 border-b border-ink-700/80 bg-ink-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <NavLink
              to="/"
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-mist hover:bg-ink-800 hover:text-white"
            >
              <ArrowLeft size={16} aria-hidden />
              Docs
            </NavLink>
            <span className="hidden text-ink-600 md:inline">/</span>
            <span className="font-display text-lg font-bold tracking-tight text-white">
              Playground
            </span>
          </div>
          <NavLink
            to="/sdk/api"
            className="rounded-lg bg-glow/15 px-3 py-1.5 text-sm font-medium text-glow hover:bg-glow/25"
          >
            API reference
          </NavLink>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-4 py-8 md:px-8 md:py-12">
        <div className="w-full animate-fade-up">{children}</div>
      </main>
    </div>
  );
}

