/**
 * React hook for loading and using the Opaque Cash WASM module.
 * 
 * Dynamically imports the WASM module and provides access to Rust functions:
 * - derive_stealth_address_wasm
 * - check_announcement_wasm
 * - check_announcement_view_tag_wasm
 */

import { useEffect, useState } from 'react';

// Type definitions for WASM module exports
export interface OpaqueWasmModule {
  derive_stealth_address_wasm: (
    view_privkey_bytes: Uint8Array,
    spend_pubkey_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => {
    stealthAddress: string;
    viewTag: number;
  };
  check_announcement_wasm: (
    announcement_stealth_address: string,
    view_tag: number,
    view_privkey_bytes: Uint8Array,
    spend_pubkey_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => boolean;
  check_announcement_view_tag_wasm: (
    view_tag: number,
    view_privkey_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => string;
  reconstruct_signing_key_wasm: (
    master_spend_priv_bytes: Uint8Array,
    master_view_priv_bytes: Uint8Array,
    ephemeral_pubkey_bytes: Uint8Array
  ) => Uint8Array;
}

interface UseOpaqueWasmReturn {
  wasm: OpaqueWasmModule | null;
  loading: boolean;
  error: Error | null;
  isReady: boolean;
}

/**
 * React hook that loads the Opaque Cash WASM module.
 * 
 * @param wasmPath - Path to the WASM module (default: '/pkg/cryptography.js')
 * @returns Object containing the WASM module, loading state, error, and ready flag
 * 
 * @example
 * ```tsx
 * const { wasm, loading, error, isReady } = useOpaqueWasm();
 * 
 * if (loading) return <div>Loading WASM...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * if (!isReady) return null;
 * 
 * const result = wasm.derive_stealth_address_wasm(
 *   viewKey,
 *   spendPubKey,
 *   ephemeralPubKey
 * );
 * ```
 */
export function useOpaqueWasm(wasmPath: string = '/pkg/cryptography.js'): UseOpaqueWasmReturn {
  const [wasm, setWasm] = useState<OpaqueWasmModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWasm() {
      try {
        console.log("📦 [Opaque] Loading WASM…", { path: wasmPath });
        setLoading(true);
        setError(null);

        // Dynamic import of the WASM module
        // wasm-pack generates a default export that initializes the module
        const wasmModule = await import(/* @vite-ignore */ wasmPath);
        
        // Initialize the WASM module
        // The default export from wasm-pack is the init function
        if (wasmModule.default) {
          await wasmModule.default();
        }

        if (!cancelled) {
          // After initialization, the functions are available on the module
          setWasm(wasmModule as unknown as OpaqueWasmModule);
          setLoading(false);
          console.log("📦 [Opaque] WASM loaded ✅");
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error(String(err));
          setError(error);
          setLoading(false);
          console.error("⚠️ [Opaque] WASM load failed:", error);
        }
      }
    }

    loadWasm();

    return () => {
      cancelled = true;
    };
  }, [wasmPath]);

  return {
    wasm,
    loading,
    error,
    isReady: wasm !== null && !loading && error === null,
  };
}

/**
 * Helper function to derive a stealth address using the WASM module.
 * 
 * @param wasm - The WASM module instance
 * @param viewPrivKey - 32-byte viewing private key
 * @param spendPubKey - 33-byte spending public key (compressed)
 * @param ephemeralPubKey - 33-byte ephemeral public key (compressed)
 * @returns Object with stealthAddress (hex string) and viewTag (number)
 */
export function deriveStealthAddress(
  wasm: OpaqueWasmModule,
  viewPrivKey: Uint8Array,
  spendPubKey: Uint8Array,
  ephemeralPubKey: Uint8Array
): { stealthAddress: string; viewTag: number } {
  if (viewPrivKey.length !== 32) {
    throw new Error('View private key must be 32 bytes');
  }
  if (spendPubKey.length !== 33) {
    throw new Error('Spend public key must be 33 bytes (compressed)');
  }
  if (ephemeralPubKey.length !== 33) {
    throw new Error('Ephemeral public key must be 33 bytes (compressed)');
  }

  return wasm.derive_stealth_address_wasm(viewPrivKey, spendPubKey, ephemeralPubKey);
}

/**
 * Helper function to check if an announcement matches this recipient.
 * 
 * @param wasm - The WASM module instance
 * @param announcementStealthAddress - Stealth address from announcement (hex string)
 * @param viewTag - View tag from announcement (0-255)
 * @param viewPrivKey - 32-byte viewing private key
 * @param spendPubKey - 33-byte spending public key (compressed)
 * @param ephemeralPubKey - 33-byte ephemeral public key (compressed)
 * @returns true if the announcement is for this recipient
 */
export function checkAnnouncement(
  wasm: OpaqueWasmModule,
  announcementStealthAddress: string,
  viewTag: number,
  viewPrivKey: Uint8Array,
  spendPubKey: Uint8Array,
  ephemeralPubKey: Uint8Array
): boolean {
  if (viewPrivKey.length !== 32) {
    throw new Error('View private key must be 32 bytes');
  }
  if (spendPubKey.length !== 33) {
    throw new Error('Spend public key must be 33 bytes (compressed)');
  }
  if (ephemeralPubKey.length !== 33) {
    throw new Error('Ephemeral public key must be 33 bytes (compressed)');
  }
  if (viewTag < 0 || viewTag > 255) {
    throw new Error('View tag must be between 0 and 255');
  }

  return wasm.check_announcement_wasm(
    announcementStealthAddress,
    viewTag,
    viewPrivKey,
    spendPubKey,
    ephemeralPubKey
  );
}

/**
 * Helper function to quickly check view tag before expensive operations.
 * 
 * @param wasm - The WASM module instance
 * @param viewTag - View tag from announcement (0-255)
 * @param viewPrivKey - 32-byte viewing private key
 * @param ephemeralPubKey - 33-byte ephemeral public key (compressed)
 * @returns 'NoMatch' if view tag doesn't match, 'PossibleMatch' if it matches
 */
export function checkAnnouncementViewTag(
  wasm: OpaqueWasmModule,
  viewTag: number,
  viewPrivKey: Uint8Array,
  ephemeralPubKey: Uint8Array
): 'NoMatch' | 'PossibleMatch' {
  if (viewPrivKey.length !== 32) {
    throw new Error('View private key must be 32 bytes');
  }
  if (ephemeralPubKey.length !== 33) {
    throw new Error('Ephemeral public key must be 33 bytes (compressed)');
  }
  if (viewTag < 0 || viewTag > 255) {
    throw new Error('View tag must be between 0 and 255');
  }

  const result = wasm.check_announcement_view_tag_wasm(viewTag, viewPrivKey, ephemeralPubKey);
  return result === "NoMatch" ? "NoMatch" : "PossibleMatch";
}
