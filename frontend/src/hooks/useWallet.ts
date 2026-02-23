import { useState, useEffect, useCallback } from "react";
import { createWalletClient, custom, type EIP1193Provider, type Address } from "viem";
import { getAppChain } from "../lib/chain";

type WalletState = {
  isConnected: boolean;
  address: Address | null;
  chainId: number | null;
  isConnecting: boolean;
  error: string | null;
};

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    chainId: null,
    isConnecting: false,
    error: null,
  });

  const checkConnection = useCallback(async () => {
    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum?.request) {
      setState((prev) => ({ ...prev, isConnected: false, address: null, chainId: null }));
      return;
    }

    try {
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum as EIP1193Provider),
      });
      const accounts = await client.requestAddresses();
      let chainId: number | null = null;
      if (accounts.length > 0) {
        const hexChainId = await ethereum.request({ method: "eth_chainId" });
        chainId = typeof hexChainId === "string" ? parseInt(hexChainId, 16) : null;
        console.log("[useWallet] chainId gotten (checkConnection):", chainId);
        setState({
          isConnected: true,
          address: accounts[0],
          chainId,
          isConnecting: false,
          error: null,
        });
      } else {
        setState((prev) => ({ ...prev, isConnected: false, address: null, chainId: null }));
      }
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isConnected: false,
        address: null,
        chainId: null,
        error: error instanceof Error ? error.message : "Failed to check connection",
      }));
    }
  }, []);

  const connect = useCallback(async () => {
    const ethereum = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (!ethereum?.request) {
      setState((prev) => ({
        ...prev,
        error: "MetaMask not found. Please install MetaMask.",
        isConnecting: false,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const client = createWalletClient({
        chain: getAppChain(),
        transport: custom(ethereum as EIP1193Provider),
      });
      const accounts = await client.requestAddresses();
      if (accounts.length > 0) {
        const hexChainId = await ethereum.request({ method: "eth_chainId" });
        const chainId = typeof hexChainId === "string" ? parseInt(hexChainId, 16) : null;
        console.log("[useWallet] chainId gotten (connect):", chainId);
        setState({
          isConnected: true,
          address: accounts[0],
          chainId,
          isConnecting: false,
          error: null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
          error: "No account selected",
        }));
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to connect wallet";
      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: errorMessage,
      }));
    }
  }, []);

  useEffect(() => {
    // Check connection on mount
    checkConnection();

    // Listen for account changes
    const ethereum = (window as unknown as {
      ethereum?: EIP1193Provider & {
        on?: (event: string, handler: (...args: unknown[]) => void) => void;
        removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      };
    }).ethereum;

    if (ethereum?.on) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setState((prev) => ({
            ...prev,
            isConnected: true,
            address: accounts[0] as Address,
            error: null,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isConnected: false,
            address: null,
            chainId: null,
          }));
        }
      };

      const handleChainChanged = (hexChainId?: string) => {
        const chainId =
          typeof hexChainId === "string" ? parseInt(hexChainId, 16) : null;
        console.log("[useWallet] chainId gotten (chainChanged):", chainId);
        setState((prev) => ({
          ...prev,
          chainId,
        }));
        checkConnection();
      };

      ethereum.on("accountsChanged", handleAccountsChanged);
      ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (ethereum.removeListener) {
          ethereum.removeListener("accountsChanged", handleAccountsChanged);
          ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, [checkConnection]);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      address: null,
      chainId: null,
      isConnecting: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    checkConnection,
  };
}
