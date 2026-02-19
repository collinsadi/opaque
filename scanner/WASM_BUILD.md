# Building and Using the Opaque Cash WASM Module

This guide explains how to build the Rust library as a WebAssembly module and integrate it into your Next.js/React frontend.

## Prerequisites

1. **Rust toolchain** - Install from [rustup.rs](https://rustup.rs/)
2. **wasm-pack** - Install with: `cargo install wasm-pack`
3. **Node.js** and npm/yarn for the frontend

## Building the WASM Module

From the `scanner` directory, run:

```bash
wasm-pack build --target web --out-dir ./pkg
```

This will:
- Compile the Rust code to WebAssembly
- Generate JavaScript bindings
- Create TypeScript definitions
- Output everything to `./scanner/pkg/`

### Build Output

The `pkg` directory will contain:
- `cryptography_bg.wasm` - The compiled WebAssembly binary
- `cryptography.js` - JavaScript bindings and loader
- `cryptography.d.ts` - TypeScript type definitions
- `package.json` - Package metadata

## Copying to Frontend

Copy the `pkg` directory to your frontend's `public` folder so it can be served:

```bash
# From project root
cp -r scanner/pkg frontend/public/pkg
```

Or, if you prefer to keep it in the scanner directory and reference it:

```bash
# Create a symlink (macOS/Linux)
ln -s ../scanner/pkg frontend/public/pkg

# Or copy it
cp -r scanner/pkg frontend/public/pkg
```

## Frontend Integration

### 1. Update `frontend/package.json`

Add `"type": "module"` to enable ES modules:

```json
{
  "name": "opaque-frontend",
  "version": "0.1.0",
  "type": "module",
  // ... rest of your package.json
}
```

### 2. Configure Vite/Next.js to Serve WASM

#### For Vite (if using Vite):

Add to `vite.config.ts`:

```typescript
export default defineConfig({
  // ... other config
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    exclude: ['cryptography'],
  },
});
```

#### For Next.js:

Add to `next.config.js`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      };
    }
    return config;
  },
  // Serve WASM files with correct MIME type
  async headers() {
    return [
      {
        source: '/pkg/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
```

### 3. Use the React Hook

Import and use the hook in your components:

```tsx
import { useOpaqueWasm } from '@/hooks/useOpaqueWasm';

function MyComponent() {
  const { wasm, loading, error, isReady } = useOpaqueWasm('/pkg/cryptography.js');

  if (loading) return <div>Loading WASM module...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!isReady || !wasm) return null;

  // Use the WASM functions
  const handleDerive = () => {
    const result = wasm.derive_stealth_address_wasm(
      viewPrivKey,    // Uint8Array(32)
      spendPubKey,    // Uint8Array(33)
      ephemeralPubKey // Uint8Array(33)
    );
    console.log('Stealth address:', result.stealthAddress);
    console.log('View tag:', result.viewTag);
  };

  return <button onClick={handleDerive}>Derive Stealth Address</button>;
}
```

## Development Workflow

1. **Make changes to Rust code** in `scanner/src/`
2. **Rebuild WASM**: `cd scanner && wasm-pack build --target web --out-dir ./pkg`
3. **Copy to frontend**: `cp -r scanner/pkg frontend/public/pkg` (or use symlink)
4. **Restart dev server** if needed
5. **Test in browser**

## Troubleshooting

### "Module not found" errors

- Ensure `pkg` directory is in `frontend/public/`
- Check that the path in `useOpaqueWasm()` matches your setup
- Verify Next.js/Vite is configured to serve WASM files

### "Cannot find module" in TypeScript

- Ensure `cryptography.d.ts` is in the `pkg` directory
- TypeScript should automatically pick it up from `public/pkg/`

### WASM loading fails

- Check browser console for CORS errors
- Ensure WASM files are served with correct MIME type (`application/wasm`)
- Verify `Cross-Origin-Embedder-Policy` headers if using SharedArrayBuffer

### Build errors

- Run `rustup target add wasm32-unknown-unknown` if missing
- Ensure all dependencies in `Cargo.toml` are compatible with WASM
- Check that `wasm-bindgen` version matches your Rust toolchain

## Production Build

For production, ensure:

1. WASM files are included in your build output
2. `pkg` directory is copied to your static assets
3. Paths are correct (use absolute paths like `/pkg/cryptography.js`)

Example build script:

```json
{
  "scripts": {
    "build:wasm": "cd scanner && wasm-pack build --target web --out-dir ./pkg --release",
    "build:frontend": "npm run build:wasm && npm run build"
  }
}
```
