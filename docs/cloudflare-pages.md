# Serverless Web Deployment (Cloudflare Pages)

This fork adapts Easy Writing's browser mode (`IndexedDB + localStorage`) for zero-cost serverless hosting on Cloudflare Pages while preserving upstream desktop Tauri 2 behavior and AGPL-3.0 licensing.

## Architecture

- **Static SPA (`dist/`)**: Vue 3 + Vite build served on Cloudflare Pages (`$0`, unlimited static requests).
- **Pages Functions (`functions/`)**:
  - `GET /api/health` (`functions/api/health.js`): zero-DB liveness probe returning HTTP 200 JSON (`service: "easy-writing-web"`).
  - `POST /v1/logs` (`functions/v1/logs.js`): OTLP log relay using `HYPERDX_INGEST_URL` and `HYPERDX_API_KEY` environment secrets.
  - `GET /api/rank-fetch` (`functions/api/rank-fetch.js`): SSRF-allowlisted proxy enabling Fanqie and Qimao ranking crawls in browser mode.
  - `GET|POST /api/ai-proxy` (`functions/api/ai-proxy.js`): SSRF-guarded HTTPS relay fallback when a BYOK model provider omits browser CORS headers.
- **Dual Telemetry (`src/telemetry.ts`)**: Sentry (`VITE_SENTRY_DSN` injected at build time) + HyperDX `/v1/logs` with `consoleCapture: false` and `advancedNetworkCapture: false`.

## Required Environment Variables

- Build-time (CI / Vite): `VITE_SENTRY_DSN`
- Runtime (Cloudflare Pages Secrets / Env): `HYPERDX_API_KEY`, `HYPERDX_INGEST_URL`

## Operations Backlink

- Service ID: `infra-easy-writing`
- Registry: `infrastructure-services.md`
