/**
 * Inline explorer link: truncated address (or tx hash) with a "Launch" icon on hover.
 * Clicking the icon opens the block explorer for that address or transaction in a new tab.
 */

import { useState } from "react";
import { getExplorerAddressUrl, getExplorerTxUrl } from "../lib/explorer";

function truncate(value: string, start = 6, end = 4): string {
  if (value.length <= start + end + 2) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

const LaunchIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

type ExplorerLinkProps = {
  /** Chain ID from useWallet().chainId (Sepolia-only app: expect 11155111) */
  chainId: number | null;
  /** Address (0x…) or transaction hash */
  value: string;
  /** "address" = link to /address/…; "tx" = link to /tx/… */
  type?: "address" | "tx";
  /** Optional class name for the wrapper */
  className?: string;
  /** Truncation: characters to show at start and end (default 10 and 8 for address-like) */
  startChars?: number;
  endChars?: number;
};

export function ExplorerLink({
  chainId,
  value,
  type = "address",
  className = "",
  startChars = 10,
  endChars = 8,
}: ExplorerLinkProps) {
  const [hover, setHover] = useState(false);
  const url =
    type === "tx"
      ? chainId != null ? getExplorerTxUrl(chainId, value) : null
      : chainId != null ? getExplorerAddressUrl(chainId, value) : null;

  const display = truncate(value, startChars, endChars);

  if (url == null) {
    return (
      <span className={`font-mono text-neutral-400 ${className}`} title={value}>
        {display}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-mono text-neutral-400 hover:text-neutral-300 transition-colors ${className}`}
      title={value}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span className="tabular-nums">{display}</span>
      {hover && (
        <span className="inline-flex text-neutral-500 hover:text-neutral-300" aria-hidden>
          <LaunchIcon />
        </span>
      )}
    </a>
  );
}
