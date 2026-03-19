/**
 * Block explorer URLs by chainId.
 * Sepolia-only app: primary base is Sepolia; mainnet kept for optional future use.
 * ChainId comes from useWallet().chainId so links switch automatically.
 */

const EXPLORER_BASES: Record<number, string> = {
  // 1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  // 31337: "http://localhost:8545",
  // 420420417: "https://blockscout-testnet.polkadot.io",
};

export function getExplorerTxUrl(chainId: number, txHash: string | null): string | null {
  if (!txHash) return null;
  const base = EXPLORER_BASES[chainId];
  if (!base) return null;
  return `${base}/tx/${txHash}`;
}

export function getExplorerAddressUrl(chainId: number, address: string | null): string | null {
  if (!address) return null;
  const base = EXPLORER_BASES[chainId];
  if (!base) return null;
  return `${base}/address/${address}`;
}
