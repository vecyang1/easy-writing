import { appSettings, flushAppSettings } from '@/storage/app-settings'
import { isTauriRuntime } from '@/storage/writing-storage'
import type { LocalAiModel } from '@/storage/local-ai-models'
import type { AiModelGroupCode } from '@/types/ai-model'
import type { AiThinkingMode, UserAiModelScene } from '@/types/user-ai-model'

const STORAGE_KEY = 'ew-local-ai-models'
const MANAGED_API_KEY_SENTINEL = 'managed-edge-gateway'
const FETCH_TIMEOUT_MS = 5000

interface ManagedModelEntry {
  id: number
  name: string
  scene: UserAiModelScene
  provider: string
  protocol: 'openai_compatible'
  modelCode: string
  baseUrl: string
  maxContext: number
  maxOutputTokens: number
  thinking?: AiThinkingMode
  extraParams?: string
  status: number
  sort: number
  managed?: boolean
}

interface ManagedCatalogResponse {
  enabled: boolean
  models: ManagedModelEntry[]
  defaultPreferences?: Partial<Record<AiModelGroupCode, string>>
}

interface StoredModelFile {
  version: 1
  models: LocalAiModel[]
  preferences: Partial<Record<AiModelGroupCode, string>>
}

const isManagedUrl = (baseUrl: string, origin: string) =>
  String(baseUrl || '').replace(/\/+$/, '') === `${origin}/api/managed-ai/v1`

const readStore = (): StoredModelFile => {
  try {
    const raw = appSettings.getItem(STORAGE_KEY)
    if (!raw) return { version: 1, models: [], preferences: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.models)) {
      return { version: 1, models: [], preferences: {} }
    }
    return {
      version: 1,
      models: parsed.models,
      preferences: parsed.preferences && typeof parsed.preferences === 'object' ? { ...parsed.preferences } : {},
    }
  } catch {
    return { version: 1, models: [], preferences: {} }
  }
}

/**
 * Web-only startup hydration: pulls optional edge-configured managed models from
 * GET /api/managed-models (never exposes upstream API keys to browser storage),
 * merges them cleanly without touching user BYOK models, and fills empty default slots.
 */
export async function hydrateManagedAiModels(): Promise<boolean> {
  if (isTauriRuntime() || typeof window === 'undefined') return false
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return false

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await window.fetch('/api/managed-models', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return false
    const catalog = (await res.json()) as ManagedCatalogResponse
    if (!catalog?.enabled || !Array.isArray(catalog.models) || catalog.models.length === 0) {
      return false
    }

    const origin = window.location.origin
    const store = readStore()
    const now = new Date().toISOString()
    const managedIds = new Set(catalog.models.map(item => item.id))

    // Preserve all user BYOK models; keep managed models only if still present in catalog
    const existingById = new Map<number, LocalAiModel>()
    const userModels: LocalAiModel[] = []
    for (const model of store.models) {
      if (model.id < 0 && isManagedUrl(model.baseUrl, origin)) {
        existingById.set(model.id, model)
      } else {
        userModels.push(model)
      }
    }

    const mergedManaged: LocalAiModel[] = catalog.models.map(entry => {
      const prev = existingById.get(entry.id)
      const sameEndpoint =
        prev &&
        prev.baseUrl === entry.baseUrl &&
        prev.modelCode === entry.modelCode &&
        prev.provider === entry.provider &&
        prev.thinking === (entry.thinking || 'default')
      return {
        id: entry.id,
        name: entry.name,
        scene: entry.scene,
        provider: entry.provider,
        protocol: 'openai_compatible',
        modelCode: entry.modelCode,
        baseUrl: entry.baseUrl,
        apiKey: MANAGED_API_KEY_SENTINEL,
        maxContext: entry.maxContext,
        maxOutputTokens: entry.maxOutputTokens,
        status: prev ? prev.status : entry.status,
        sort: entry.sort,
        createTime: prev?.createTime || now,
        thinking: entry.thinking || 'default',
        extraParams: entry.extraParams || '',
        ...(sameEndpoint && prev
          ? {
              testStatus: prev.testStatus,
              lastTestOutcome: prev.lastTestOutcome,
              lastTestAt: prev.lastTestAt,
              lastLatency: prev.lastLatency,
              lastError: prev.lastError,
            }
          : {}),
      }
    })

    const nextModels = [...mergedManaged, ...userModels]
    const validCodes = new Set(nextModels.filter(m => m.status !== 0).map(m => String(m.id)))
    const nextPrefs: Partial<Record<AiModelGroupCode, string>> = { ...store.preferences }

    // Drop preferences pointing at removed managed models
    for (const [group, code] of Object.entries(nextPrefs) as Array<[AiModelGroupCode, string | undefined]>) {
      if (code && Number(code) < 0 && !managedIds.has(Number(code))) {
        delete nextPrefs[group]
      }
    }

    // Seed empty preference slots from server defaults without overwriting user choices
    for (const [group, code] of Object.entries(catalog.defaultPreferences || {}) as Array<[AiModelGroupCode, string]>) {
      if (!nextPrefs[group] && validCodes.has(String(code))) {
        nextPrefs[group] = String(code)
      }
    }

    appSettings.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        models: nextModels,
        preferences: nextPrefs,
      }),
    )
    await flushAppSettings()
    return true
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}
