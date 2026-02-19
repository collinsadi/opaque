# WASM Integration Summary

This document summarizes the changes made to convert the Opaque Cash Rust library into a WebAssembly module for use in the Next.js/React frontend.

## Files Created/Modified

### 1. `scanner/Cargo.toml`
**Changes:**
- Added `[lib]` section with `crate-type = ["cdylib", "rlib"]`
- Added dependencies:
  - `wasm-bindgen = "0.2"`
  - `serde = { version = "1.0", features = ["derive"] }`
  - `serde-wasm-bindgen = "0.6"`
  - `console_error_panic_hook = "0.1"`

### 2. `scanner/src/lib.rs` (NEW)
**Purpose:** WASM bindings wrapper for the scanner module

**Key Features:**
- `#[wasm_bindgen(start)]` function to initialize panic hook for better error messages
- Type conversion functions:
  - `bytes_to_signing_key()` - Converts 32-byte Uint8Array to Rust SigningKey
  - `bytes_to_public_key()` - Converts 33-byte compressed public key to Rust PublicKey
  - `address_to_hex()` / `hex_to_address()` - Converts between Address and hex strings
- Three exported WASM functions:
  - `derive_stealth_address_wasm()` - Derives stealth address and view tag
  - `check_announcement_wasm()` - Checks if announcement matches recipient
  - `check_announcement_view_tag_wasm()` - Quick view-tag filter

### 3. `frontend/src/hooks/useOpaqueWasm.ts` (NEW)
**Purpose:** React hook for loading and using the WASM module

**Features:**
- Dynamic WASM module import
- Loading and error states
- Type-safe TypeScript interfaces
- Helper functions for common operations
- Automatic initialization handling

### 4. `scanner/WASM_BUILD.md` (NEW)
**Purpose:** Comprehensive build and integration guide

**Contents:**
- Build instructions
- Frontend configuration (Vite/Next.js)
- Usage examples
- Troubleshooting guide
- Production build tips

## Build Command

```bash
cd scanner
wasm-pack build --target web --out-dir ./pkg
```

## Frontend Setup

1. **Add to `frontend/package.json`:**
   ```json
   {
     "type": "module"
   }
   ```

2. **Copy WASM package to frontend:**
   ```bash
   cp -r scanner/pkg frontend/public/pkg
   ```

3. **Use the hook in components:**
   ```tsx
   import { useOpaqueWasm } from '@/hooks/useOpaqueWasm';
   
   const { wasm, loading, error, isReady } = useOpaqueWasm('/pkg/cryptography.js');
   ```

## API Reference

### `derive_stealth_address_wasm`
```typescript
derive_stealth_address_wasm(
  viewPrivKey: Uint8Array,      // 32 bytes
  spendPubKey: Uint8Array,       // 33 bytes (compressed)
  ephemeralPubKey: Uint8Array    // 33 bytes (compressed)
): { stealthAddress: string, viewTag: number }
```

### `check_announcement_wasm`
```typescript
check_announcement_wasm(
  announcementStealthAddress: string,  // Hex address (0x...)
  viewTag: number,                     // 0-255
  viewPrivKey: Uint8Array,             // 32 bytes
  spendPubKey: Uint8Array,             // 33 bytes (compressed)
  ephemeralPubKey: Uint8Array          // 33 bytes (compressed)
): boolean
```

### `check_announcement_view_tag_wasm`
```typescript
check_announcement_view_tag_wasm(
  viewTag: number,              // 0-255
  viewPrivKey: Uint8Array,      // 32 bytes
  ephemeralPubKey: Uint8Array   // 33 bytes (compressed)
): 'NoMatch' | 'PossibleMatch'
```

## Next Steps

1. Build the WASM module: `cd scanner && wasm-pack build --target web --out-dir ./pkg`
2. Copy to frontend: `cp -r scanner/pkg frontend/public/pkg`
3. Configure Next.js/Vite (see WASM_BUILD.md)
4. Test the integration in your React components
5. Update your stealth address logic to use WASM functions instead of JavaScript implementations

## Notes

- The WASM module uses compressed public keys (33 bytes) for efficiency
- All addresses are returned as hex strings with `0x` prefix
- View tags are numbers between 0-255
- Private keys must be exactly 32 bytes
- Errors are converted to JavaScript Error objects with descriptive messages
