# Serverless Web Deployment (Cloudflare Pages)

This fork adapts Easy Writing's browser mode (`IndexedDB + localStorage`) for zero-cost serverless hosting on Cloudflare Pages while preserving upstream desktop Tauri 2 behavior and AGPL-3.0 licensing.

## Architecture

- **Static SPA (`dist/`)**: Vue 3 + Vite build served on Cloudflare Pages (`$0`, unlimited static requests).
- **Pages Functions (`functions/`)**:
  - `GET /api/health` (`functions/api/health.js`): zero-DB liveness probe returning HTTP 200 JSON (`service: "easy-writing-web"`, `features.managedAiGateway`).
  - `POST /v1/logs` (`functions/v1/logs.js`): OTLP log relay using `HYPERDX_INGEST_URL` and `HYPERDX_API_KEY` environment secrets.
  - `GET /api/rank-fetch` (`functions/api/rank-fetch.js`): SSRF-allowlisted proxy enabling Fanqie and Qimao ranking crawls in browser mode.
  - `GET|POST /api/ai-proxy` (`functions/api/ai-proxy.js`): SSRF-guarded HTTPS relay fallback when a BYOK model provider omits browser CORS headers.
  - `GET /api/managed-models` (`functions/api/managed-models.js`): optional edge-configured model catalog hydrated on web startup (`src/storage/managed-ai-bootstrap.ts`) without exposing upstream API keys to browser storage.
  - `GET|POST /api/managed-ai/[[path]]` (`functions/api/managed-ai/[[path]].js`): allowlisted OpenAI-compatible edge relay (`v1/models`, `v1/chat/completions`, `v1/images/generations`, `v1/audio/speech`) injecting server-side API credentials (`MANAGED_AI_API_KEY` / optional `MANAGED_AI_IMAGE_API_KEY`).
- **Dual Telemetry (`src/telemetry.ts`)**: Sentry (`VITE_SENTRY_DSN` injected at build time) + HyperDX `/v1/logs` with `consoleCapture: false` and `advancedNetworkCapture: false`.

## Required Environment Variables

- Build-time (CI / Vite): `VITE_SENTRY_DSN`
- Runtime telemetry (Cloudflare Pages Secrets / Env): `HYPERDX_API_KEY`, `HYPERDX_INGEST_URL`
- Optional Managed AI Gateway (Cloudflare Pages Secrets / Env, recommended behind Zero Trust Access):
  - `MANAGED_AI_BASE_URL`: upstream OpenAI-compatible HTTPS base URL (e.g. `https://api.example.com/v1`)
  - `MANAGED_AI_API_KEY`: server-side Bearer token for text/chat and model listing (never returned to browser)
  - `MANAGED_AI_IMAGE_API_KEY` (optional): dedicated Bearer token for `v1/images/generations` (falls back to `MANAGED_AI_API_KEY`)
  - `MANAGED_AI_IMAGE_BASE_URL` (optional): dedicated HTTPS base URL for `v1/images/generations`
  - `MANAGED_AI_MODELS_JSON`: JSON object `{ "models": [...], "defaultPreferences": { ... } }` declaring curated negative-ID models and default slot assignments

## Upstream Stable Sync

Keep the fork cleanly aligned with upstream stable semver tags (`vX.Y.Z`, excluding prereleases):

```bash
node scripts/sync-upstream-stable.mjs                 # dry-run check
node scripts/sync-upstream-stable.mjs --apply --push  # merge, verify, and push to trigger Pages deploy
```

## Operations Backlink

- Service ID: `infra-easy-writing`
- Registry: `infrastructure-services.md`
