import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { DOC_NAV } from "@/nav";

function navClassName({ isActive }: { isActive: boolean }) {
  return `block rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-glow-muted/30 font-medium text-glow"
      : "text-mist hover:bg-ink-800 hover:text-white"
  }`;
}

export function DocsLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-ink-950 bg-grid-fade bg-size-grid">
      <header className="sticky top-0 z-50 border-b border-ink-700/80 bg-ink-950/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-mist hover:bg-ink-800 hover:text-white lg:hidden"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={22} />
            </button>
            <NavLink
              to="/"
              className="font-display text-lg font-bold tracking-tight text-white"
            >
              Opaque<span className="text-glow">.</span>docs
            </NavLink>
          </div>
          <NavLink
            to="/playground"
            className="rounded-lg bg-glow/15 px-3 py-1.5 text-sm font-medium text-glow hover:bg-glow/25"
          >
            Playground
          </NavLink>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {/* Mobile sidebar */}
        {sidebarOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              aria-label="Close sidebar"
              onClick={() => setSidebarOpen(false)}
            />
            <aside className="absolute left-0 top-0 flex h-full w-[min(280px,88vw)] flex-col border-r border-ink-600 bg-ink-900 shadow-xl">
              <div className="flex items-center justify-between border-b border-ink-700 p-4">
                <span className="text-sm font-semibold text-white">Navigate</span>
                <button
                  type="button"
                  className="rounded-lg p-2 text-mist hover:bg-ink-800"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4">
                <SidebarNav onNavigate={() => setSidebarOpen(false)} />
              </nav>
            </aside>
          </div>
        ) : null}

        {/* Desktop sidebar */}
        <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-64 shrink-0 overflow-y-auto border-r border-ink-700/80 bg-ink-950/40 py-8 pl-4 pr-3 lg:block xl:w-72">
          <nav className="pb-12">
            <SidebarNav />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 md:px-8 md:py-12 lg:pl-10">
          <div className="mx-auto w-full max-w-6xl animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="border-t border-ink-800 py-6 text-center text-xs text-mist">
        Experimental cryptography — review project disclaimers before production.
      </footer>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {DOC_NAV.map((section) => (
        <div key={section.title} className="mb-6">
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-mist/90">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === "/" || item.to === "/guides/psr"}
                  className={navClassName}
                  onClick={onNavigate}
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
