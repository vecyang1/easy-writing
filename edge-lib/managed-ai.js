import { validateAiProxyTargetUrl } from './proxy-guard.js'

export const MANAGED_API_KEY_SENTINEL = 'managed-edge-gateway'

const ALLOWED_SUBPATHS = {
  GET: new Set(['v1/models']),
  POST: new Set(['v1/chat/completions', 'v1/images/generations', 'v1/audio/speech']),
}

const VALID_SCENES = new Set(['text', 'image'])
const VALID_THINKING = new Set(['off', 'default', 'on'])

export function validateManagedAiSubpath(method, rawSubpath) {
  const upperMethod = String(method || '').toUpperCase()
  const allowed = ALLOWED_SUBPATHS[upperMethod]
  if (!allowed) {
    return { ok: false, status: 405, error: 'method not allowed' }
  }
  const normalized = String(rawSubpath || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  if (!normalized || normalized.includes('..') || !allowed.has(normalized)) {
    return { ok: false, status: 400, error: 'managed AI endpoint path is not allowlisted' }
  }
  return { ok: true, subpath: normalized }
}

function normalizeUpstreamBase(rawBase) {
  const trimmed = String(rawBase || '').trim().replace(/\/+$/, '')
  const check = validateAiProxyTargetUrl(trimmed)
  if (!check.ok) return null
  return trimmed.endsWith('/v1') ? trimmed.slice(0, -3) : trimmed
}

export function resolveManagedUpstream(env, subpath) {
  const isImage = subpath === 'v1/images/generations'
  const rawBase = (isImage && env?.MANAGED_AI_IMAGE_BASE_URL) || env?.MANAGED_AI_BASE_URL || ''
  const apiKey = String(
    (isImage && env?.MANAGED_AI_IMAGE_API_KEY) || env?.MANAGED_AI_API_KEY || '',
  ).trim()

  if (!rawBase || !apiKey) {
    return { ok: false, status: 503, error: 'managed AI gateway is not configured' }
  }
  const baseOrigin = normalizeUpstreamBase(rawBase)
  if (!baseOrigin) {
    return { ok: false, status: 500, error: 'invalid managed AI upstream base url' }
  }
  return {
    ok: true,
    url: `${baseOrigin}/${subpath}`,
    apiKey,
  }
}

export function parseManagedCatalog(env, origin) {
  const baseOrigin = normalizeUpstreamBase(env?.MANAGED_AI_BASE_URL || '')
  const apiKey = String(env?.MANAGED_AI_API_KEY || '').trim()
  if (!baseOrigin || !apiKey) {
    return { enabled: false, models: [], defaultPreferences: {} }
  }

  let parsed = null
  try {
    parsed = env?.MANAGED_AI_MODELS_JSON ? JSON.parse(String(env.MANAGED_AI_MODELS_JSON)) : null
  } catch {
    return { enabled: false, models: [], defaultPreferences: {} }
  }

  const rawModels = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.models) ? parsed.models : []
  const rawPrefs = !Array.isArray(parsed) && parsed?.defaultPreferences && typeof parsed.defaultPreferences === 'object'
    ? parsed.defaultPreferences
    : {}

  const cleanOrigin = String(origin || '').replace(/\/+$/, '')
  const managedBaseUrl = `${cleanOrigin}/api/managed-ai/v1`

  const models = []
  const seenIds = new Set()
  for (let i = 0; i < rawModels.length; i += 1) {
    const item = rawModels[i]
    if (!item || typeof item !== 'object') continue
    const id = Number(item.id)
    const name = String(item.name || '').trim()
    const modelCode = String(item.modelCode || '').trim()
    const scene = String(item.scene || 'text').trim()
    if (!Number.isInteger(id) || id >= 0 || seenIds.has(id)) continue
    if (!name || !modelCode || !VALID_SCENES.has(scene)) continue
    seenIds.add(id)
    const thinking = VALID_THINKING.has(String(item.thinking || '')) ? String(item.thinking) : 'default'
    models.push({
      id,
      name,
      scene,
      provider: String(item.provider || 'custom').trim() || 'custom',
      protocol: 'openai_compatible',
      modelCode,
      baseUrl: managedBaseUrl,
      maxContext: Number.isFinite(Number(item.maxContext)) ? Number(item.maxContext) : 128000,
      maxOutputTokens: Number.isFinite(Number(item.maxOutputTokens)) ? Number(item.maxOutputTokens) : 16384,
      thinking,
      extraParams: typeof item.extraParams === 'string' ? item.extraParams.trim() : '',
      status: item.status === 0 ? 0 : 1,
      sort: Number.isFinite(Number(item.sort)) ? Number(item.sort) : i + 1,
      managed: true,
    })
  }

  const validCodes = new Set(models.map(m => String(m.id)))
  const defaultPreferences = {}
  for (const [group, code] of Object.entries(rawPrefs)) {
    const strCode = String(code ?? '').trim()
    if (group && validCodes.has(strCode)) {
      defaultPreferences[group] = strCode
    }
  }

  return {
    enabled: models.length > 0,
    models,
    defaultPreferences,
  }
}
