# Failproof Travel

Hackathon MVP repo for a collaborative, evidence-backed travel planner with memory (MongoDB Atlas vector search) and an x402 purchase demo flow.

## What is here
- Monorepo layout with `apps/web` (Next.js) and `apps/api` (Express)
- Stubbed chat → plan flow that mirrors the spec API shape
- UI shell that matches the plan box + evidence + options layout

## Structure
```text
apps/
  web/     # Next.js UI (Chat + Plan + Evidence + Options)
  api/     # Express API (chat, buy, x402 merchant stub)
packages/
  shared/  # shared constants
```

## Quick start
```bash
pnpm install
pnpm --filter api dev
pnpm --filter web dev
```

## Environment
Copy `.env.example` to `.env` (API) and `apps/web/.env.local` (Web) and fill the keys.

```bash
# Web (apps/web/.env.local)
NEXT_PUBLIC_API_ORIGIN=http://localhost:3001
```

## API summary
- `POST /api/chat` -> returns `{ tripId, planMarkdown, options, evidence }`
- `POST /api/buy` -> x402 demo flow, returns confirmation
- `POST /merchant/purchase` -> returns 402 unless `X-Payment` header is present

## Next steps
- Wire Fireworks for routing + plan synthesis
- Add SerpAPI search + scraping + chunking
- Store embeddings and vector search in MongoDB Atlas

The full spec lives in `failproof_travel_codex_spec.md`.
