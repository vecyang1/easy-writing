import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { validateRankTargetUrl, validateAiProxyTargetUrl } from '../edge-lib/proxy-guard.js'
import {
  parseManagedCatalog,
  resolveManagedUpstream,
  validateManagedAiSubpath,
} from '../edge-lib/managed-ai.js'
import { onRequestGet as onHealthGet } from '../functions/api/health.js'
import { onRequestGet as onManagedModelsGet } from '../functions/api/managed-models.js'
import { onRequestPost as onLogsPost } from '../functions/v1/logs.js'

test('validateRankTargetUrl allows Fanqie and Qimao ranking endpoints only', () => {
  assert.deepEqual(
    validateRankTargetUrl('https://fanqienovel.com/rank/1_2_1014'),
    { ok: true, url: 'https://fanqienovel.com/rank/1_2_1014', site: 'fanqie' },
  )
  assert.equal(
    validateRankTargetUrl('https://www.qimao.com/qimaoapi/api/rank/book-list?is_girl=0&rank_type=1').site,
    'qimao',
  )
  assert.equal(validateRankTargetUrl('http://fanqienovel.com/rank/1_2_1014').ok, false)
  assert.equal(validateRankTargetUrl('https://127.0.0.1/rank/1').ok, false)
  assert.equal(validateRankTargetUrl('https://evil.example.com/rank/1').ok, false)
  assert.equal(validateRankTargetUrl('https://www.qimao.com/admin').ok, false)
})

test('validateAiProxyTargetUrl blocks private, loopback, metadata, and non-https targets', () => {
  assert.equal(validateAiProxyTargetUrl('https://api.deepseek.com/v1/chat/completions').ok, true)
  assert.equal(validateAiProxyTargetUrl('https://openrouter.ai/api/v1/models').ok, true)
  assert.equal(validateAiProxyTargetUrl('http://api.openai.com/v1/chat/completions').ok, false)
  assert.equal(validateAiProxyTargetUrl('https://127.0.0.1/v1').ok, false)
  assert.equal(validateAiProxyTargetUrl('https://localhost:8443/v1').ok, false)
  assert.equal(validateAiProxyTargetUrl('https://169.254.169.254/latest/meta-data').ok, false)
  assert.equal(validateAiProxyTargetUrl('https://10.0.0.1/v1').ok, false)
  assert.equal(validateAiProxyTargetUrl('https://user:pass@api.openai.com/v1').ok, false)
})

test('/api/health returns 200 healthy JSON without DB dependency', async () => {
  const req = new Request('https://example.pages.dev/api/health')
  const res = await onHealthGet({ request: req })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.status, 'healthy')
  assert.equal(body.service, 'easy-writing-web')
  assert.equal(body.host, 'example.pages.dev')
  assert.equal(res.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive, nosnippet')
})

test('/v1/logs returns 202 when unconfigured instead of crashing', async () => {
  const req = new Request('https://example.pages.dev/v1/logs', {
    method: 'POST',
    body: JSON.stringify({ resourceLogs: [] }),
  })
  const res = await onLogsPost({ request: req, env: {} })
  assert.equal(res.status, 202)
  const body = await res.json()
  assert.equal(body.ok, false)
  assert.equal(body.error, 'hyperdx_unconfigured')
})

test('telemetry facade respects HyperDX 5 invariants', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/telemetry.ts'), 'utf8')
  assert.match(src, /consoleCapture:\s*false/)
  assert.match(src, /advancedNetworkCapture:\s*false/)
  assert.match(src, /debounceTrack/)
  assert.match(src, /reportHandledError/)
  assert.doesNotMatch(src, /https:\/\/log\./i)
})

test('validateManagedAiSubpath strictly allowlists OpenAI-compatible paths and methods', () => {
  assert.deepEqual(validateManagedAiSubpath('GET', 'v1/models'), { ok: true, subpath: 'v1/models' })
  assert.deepEqual(validateManagedAiSubpath('POST', 'v1/chat/completions'), { ok: true, subpath: 'v1/chat/completions' })
  assert.deepEqual(validateManagedAiSubpath('POST', 'v1/images/generations'), { ok: true, subpath: 'v1/images/generations' })
  assert.equal(validateManagedAiSubpath('GET', 'v1/chat/completions').ok, false)
  assert.equal(validateManagedAiSubpath('DELETE', 'v1/models').status, 405)
  assert.equal(validateManagedAiSubpath('POST', 'v1/../admin').ok, false)
  assert.equal(validateManagedAiSubpath('GET', 'v1/billing/usage').ok, false)
})

test('resolveManagedUpstream separates image key when provided and fails closed when unconfigured', () => {
  assert.equal(resolveManagedUpstream({}, 'v1/chat/completions').status, 503)
  const env = {
    MANAGED_AI_BASE_URL: 'https://api.example.com/v1',
    MANAGED_AI_API_KEY: 'sk-text-secret',
    MANAGED_AI_IMAGE_API_KEY: 'sk-image-secret',
  }
  assert.deepEqual(resolveManagedUpstream(env, 'v1/chat/completions'), {
    ok: true,
    url: 'https://api.example.com/v1/chat/completions',
    apiKey: 'sk-text-secret',
  })
  assert.deepEqual(resolveManagedUpstream(env, 'v1/images/generations'), {
    ok: true,
    url: 'https://api.example.com/v1/images/generations',
    apiKey: 'sk-image-secret',
  })
  assert.equal(
    resolveManagedUpstream({ MANAGED_AI_BASE_URL: 'http://127.0.0.1/v1', MANAGED_AI_API_KEY: 'k' }, 'v1/models').status,
    500,
  )
})

test('parseManagedCatalog and /api/managed-models never leak API keys and filter invalid entries', async () => {
  const unconfigured = parseManagedCatalog({}, 'https://app.example.com')
  assert.deepEqual(unconfigured, { enabled: false, models: [], defaultPreferences: {} })

  const env = {
    MANAGED_AI_BASE_URL: 'https://api.example.com/v1',
    MANAGED_AI_API_KEY: 'sk-super-secret-value',
    MANAGED_AI_MODELS_JSON: JSON.stringify({
      models: [
        { id: -101, name: 'Primary Text', scene: 'text', provider: 'deepseek', modelCode: 'model-a', thinking: 'off' },
        { id: 5, name: 'Positive ID Rejected', scene: 'text', provider: 'openai', modelCode: 'bad' },
        { id: -102, name: 'Cover Image', scene: 'image', provider: 'openai', modelCode: 'img-a' },
      ],
      defaultPreferences: {
        text_assist: '-101',
        workflow_book: '-101',
        image_generation: '-102',
        invalid_ref: '-999',
      },
    }),
  }
  const req = new Request('https://app.example.com/api/managed-models')
  const res = await onManagedModelsGet({ request: req, env })
  assert.equal(res.status, 200)
  const rawText = await res.text()
  assert.doesNotMatch(rawText, /sk-super-secret-value/)
  const body = JSON.parse(rawText)
  assert.equal(body.enabled, true)
  assert.equal(body.models.length, 2)
  assert.equal(body.models[0].baseUrl, 'https://app.example.com/api/managed-ai/v1')
  assert.deepEqual(body.defaultPreferences, {
    text_assist: '-101',
    workflow_book: '-101',
    image_generation: '-102',
  })
})
