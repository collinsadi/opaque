import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Footer } from "./Footer";
import { AddressDisplay } from "./AddressDisplay";
import { TestnetBanner } from "./TestnetBanner";

export type Tab = "dashboard" | "send" | "receive" | "balance" | "history" | "subens" | "profile";

type LayoutProps = {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  isConnected: boolean;
  address: string | undefined;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  children: ReactNode;
  protocolLog: ReactNode;
};

const navItems: { id: Tab; label: string }[] = [];

function DesktopNav({
  tab,
  onTabChange,
  isConnected,
  address,
  isConnecting,
  onConnect,
  onDisconnect,
}: Pick<
  LayoutProps,
  "tab" | "onTabChange" | "isConnected" | "address" | "isConnecting" | "onConnect" | "onDisconnect"
>) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="shrink-0 border-b border-border bg-black">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          {location.pathname === "/" ? (
            <Link
              to="/"
              onClick={() => onTabChange("dashboard")}
              className="text-sm font-semibold tracking-tight text-white hover:text-neutral-300 transition-colors"
            >
              Opaque
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/", { state: { tab: "dashboard" } })}
              className="text-sm font-semibold tracking-tight text-white hover:text-neutral-300 transition-colors"
            >
              Opaque
            </button>
          )}
          <Link
            to="/faucet"
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Faucet
          </Link>
          {navItems.length > 0 && (
            <nav className="flex items-center gap-1">
              {navItems.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange(id)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    tab === id
                      ? "text-white bg-neutral-800"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          )}
        </div>
        <div className="relative flex items-center gap-3" ref={dropdownRef}>
          {!isConnected && (
            <button
              type="button"
              onClick={onConnect}
              disabled={isConnecting}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-white text-black hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {isConnecting ? "Connecting…" : "Connect"}
            </button>
          )}
          {isConnected && address && (
            <>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDropdownOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDropdownOpen((o) => !o);
                  }
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-neutral-900 hover:border-neutral-700 transition-colors cursor-pointer"
                data-tour="meta"
              >
                <img
                  src={`https://robohash.org/${address}`}
                  alt=""
                  className="w-8 h-8 rounded-full bg-neutral-800"
                />
                <span
                  className="hidden sm:inline"
                  onClick={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <AddressDisplay address={address} />
                </span>
              </div>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 py-1 w-48 rounded-lg border border-border bg-neutral-900 shadow-xl z-30">
                  <button
                    type="button"
                    onClick={() => { onTabChange("balance"); setDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Private balance
                  </button>
                  <button
                    type="button"
                    onClick={() => { onTabChange("history"); setDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Transaction history
                  </button>
                  <button
                    type="button"
                    onClick={() => { onTabChange("profile"); setDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onTabChange("subens");
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Setup Sub-ENS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDisconnect();
                      setDropdownOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                  >
                    Disconnect Wallet
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const mobileTabs: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Home", icon: "⌂" },
  { id: "profile", label: "Profile", icon: "⚙" },
];

function MobileNav({ tab, onTabChange }: Pick<LayoutProps, "tab" | "onTabChange">) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-black border-t border-border pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-2 px-2">
        {mobileTabs.map(({ id, label, icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`flex flex-col items-center gap-0.5 py-2 px-4 rounded-lg min-w-[72px] transition-colors ${
                active ? "text-white" : "text-neutral-600 hover:text-neutral-400"
              }`}
            >
              <span className="text-lg" aria-hidden>{icon}</span>
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export function Layout({
  tab,
  onTabChange,
  isConnected,
  address,
  isConnecting,
  onConnect,
  onDisconnect,
  children,
  protocolLog,
}: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-black">
      <div className="hidden md:flex flex-col fixed top-0 left-0 right-0 z-20">
        <TestnetBanner isConnected={isConnected} />
        <DesktopNav
          tab={tab}
          onTabChange={onTabChange}
          isConnected={isConnected}
          address={address}
          isConnecting={isConnecting}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      </div>

      <div className="md:hidden">
        <TestnetBanner isConnected={isConnected} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-8 md:pt-28 pb-20 md:pb-52">
        <main
          className={`w-full mx-auto px-4 sm:px-6 pt-8 pb-8 flex-1 flex flex-col min-h-0 ${
            tab === "balance" ? "max-w-none" : "max-w-2xl"
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <MobileNav tab={tab} onTabChange={onTabChange} />

      <footer className="hidden md:flex md:flex-col fixed bottom-0 left-0 right-0 z-10 h-52 border-t border-border bg-black">
        <div className="shrink-0">
          <Footer />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {protocolLog}
        </div>
      </footer>
    </div>
  );
}
