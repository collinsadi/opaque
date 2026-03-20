import type { Address, PublicClient } from "viem";

type EthRequestProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/**
 * Reads native balance via the app HTTP RPC and (when available) the injected wallet.
 * Some wallets return `0` from `eth_getBalance` even when the RPC the dApp uses sees funds
 * (provider quirks, multiple injected wallets, etc.). We always query both and reconcile.
 */
export async function readNativeBalance(
  address: Address,
  publicClient: PublicClient,
  walletProvider?: EthRequestProvider | null
): Promise<bigint> {
  const rpcBal = await publicClient.getBalance({ address });

  if (!walletProvider?.request) {
    return rpcBal;
  }

  try {
    const hex = await walletProvider.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });
    if (typeof hex !== "string") {
      return rpcBal;
    }
    const walletBal = BigInt(hex);
    if (walletBal === rpcBal) {
      return walletBal;
    }
    // One path often lies when RPC URL ≠ wallet chain or the active provider is wrong.
    if (rpcBal === 0n && walletBal > 0n) {
      return walletBal;
    }
    if (walletBal === 0n && rpcBal > 0n) {
      return rpcBal;
    }
    return walletBal;
  } catch {
    return rpcBal;
  }
}
