# Demo

Demo Verifier .

## Features

- Verify a proof and cast a vote
- Store used nullifiers in local storage
- Show used nullifiers
- Show proof verification status
- Show vote submission status

## Proof Format

The proof format is a JSON object with the following fields:

- `proof`: The proof object
- `publicSignals`: The public signals
- `nullifier`: The nullifier

The proof object is a JSON object with the following fields:

- `pi_a`: The pi_a array
- `pi_b`: The pi_b array
- `pi_c`: The pi_c array

## Run locally

```bash
cd demo
npm install
npm run dev
```

The dev server starts on the default Vite port.

## Scripts

- `npm run dev` - start local development server
- `npm run build` - type-check and build production assets
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint checks

## Tech stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- viem
