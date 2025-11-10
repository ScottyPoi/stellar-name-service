# Stellar Name Service Frontend

This package hosts the Next.js 16 app-router frontend for the Stellar Name Service demo.

## Requirements
- Node.js 18+ (Next.js 16 LTS target)
- npm 9+

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template and fill in the contract + RPC details:
   ```bash
   cp .env.example .env.local
   # edit .env.local with real contract IDs and URLs
   ```

The `lib/config.ts` helper validates that every required `NEXT_PUBLIC_*` variable is present at runtime.

## Development
- Run the dev server: `npm run dev`
- Type-check & lint: `npm run lint`
- Build for production: `npm run build`
- Start the production server: `npm run start`

The app exposes a simple header/layout plus a placeholder home page. Later steps will add indexer connectivity and interactive flows.
