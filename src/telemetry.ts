// Dual-telemetry facade for Easy Writing Web (Sentry crash/breadcrumbs + HyperDX OTLP logs).
// Follows the 5 HyperDX invariants:
// 1. consoleCapture: false (Sentry owns window.console)
// 2. advancedNetworkCapture: false (never capture user BYOK API keys, prompts, or novel text)
// 3. Debounced high-frequency updates (350ms)
// 4. Single facade module (components never import Sentry or call /v1/logs directly)
// 5. Non-blocking async dispatch isolated in try/catch

import { isTauriRuntime } from '@/storage/writing-storage'

const SENTRY_DSN = String(import.meta.env.VITE_SENTRY_DSN || '').trim()
const SENTRY_CDN = 'https://browser.sentry-cdn.com/8.38.0/bundle.min.js'
const SERVICE_NAME = 'easy-writing-web'
const APP_VERSION = '2.1.1'
const LOG_ENDPOINT = '/v1/logs'

const isLocalHost = (): boolean => {
  if (typeof location === 'undefined') return true
  return (
    ['127.0.0.1', 'localhost', '::1', ''].includes(location.hostname) ||
    location.protocol === 'file:'
  )
}

const isTelemetryEnabled = (): boolean => !isTauriRuntime() && !isLocalHost()

let initialized = false
let sentryReady = false
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

interface SentryBrowserApi {
  init: (opts: Record<string, unknown>) => void
  addBreadcrumb: (crumb: Record<string, unknown>) => void
  captureException: (err: Error, ctx?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    Sentry?: SentryBrowserApi
  }
}

function initSentryInstance() {
  if (sentryReady || !SENTRY_DSN || typeof window === 'undefined' || !window.Sentry) return
  try {
    window.Sentry.init({
      dsn: SENTRY_DSN,
      environment: 'production',
      release: `${SERVICE_NAME}@${APP_VERSION}`,
      tracesSampleRate: 0.2,
    })
    sentryReady = true
  } catch (err) {
    console.warn('[telemetry] Sentry init failed', err)
  }
}

function loadSentryBundle() {
  if (!isTelemetryEnabled() || !SENTRY_DSN || typeof document === 'undefined') return
  if (window.Sentry) {
    initSentryInstance()
    return
  }
  try {
    const script = document.createElement('script')
    script.src = SENTRY_CDN
    script.crossOrigin = 'anonymous'
    script.async = true
    script.onload = () => initSentryInstance()
    script.onerror = () => {
      console.warn('[telemetry] Sentry bundle load skipped')
    }
    document.head.appendChild(script)
  } catch (err) {
    console.warn('[telemetry] Sentry script mount failed', err)
  }
}

export function initTelemetry() {
  if (initialized || !isTelemetryEnabled()) return
  initialized = true
  loadSentryBundle()
}

function toOtlpAttribute(key: string, v: unknown) {
  if (typeof v === 'boolean') return { key, value: { boolValue: v } }
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v)
      ? { key, value: { intValue: String(v) } }
      : { key, value: { doubleValue: v } }
  }
  return {
    key,
    value: {
      stringValue: typeof v === 'object' ? JSON.stringify(v) : String(v),
    },
  }
}

function dispatchOtlp(
  actionName: string,
  bodyText: string,
  attrs: Record<string, unknown>,
  severityNumber = 9,
  severityText = 'INFO',
) {
  if (!isTelemetryEnabled() || typeof fetch === 'undefined') return
  try {
    const attributes = Object.entries(attrs)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([key, v]) => toOtlpAttribute(key, v))
    const payload = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: SERVICE_NAME } },
              { key: 'service.version', value: { stringValue: APP_VERSION } },
              { key: 'environment', value: { stringValue: 'production' } },
            ],
          },
          scopeLogs: [
            {
              scope: { name: `${SERVICE_NAME}.frontend` },
              logRecords: [
                {
                  timeUnixNano: (Date.now() * 1000000).toString(),
                  severityNumber,
                  severityText,
                  body: { stringValue: bodyText || actionName },
                  attributes,
                },
              ],
            },
          ],
        },
      ],
    }
    fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined)
  } catch (err) {
    console.warn('[telemetry] OTLP dispatch skipped', err)
  }
}

export function trackAction(
  actionName: string,
  params: Record<string, unknown> = {},
  category = 'user.action',
) {
  if (!isTelemetryEnabled()) return
  try {
    if (window.Sentry) {
      window.Sentry.addBreadcrumb({
        category,
        message: actionName,
        data: params,
        level: 'info',
      })
    }
  } catch (err) {
    console.warn('[telemetry] Sentry breadcrumb failed', err)
  }
  dispatchOtlp(actionName, actionName, { action: actionName, category, ...params })
}

export function trackSettingChange(
  setting: string,
  oldValue: unknown,
  newValue: unknown,
  extra: Record<string, unknown> = {},
) {
  trackAction(
    'setting_changed',
    { setting, oldValue, newValue, ...extra },
    'user.settings',
  )
}

export function debounceTrack(
  key: string,
  actionName: string,
  paramsFn: Record<string, unknown> | (() => Record<string, unknown>),
  delayMs = 350,
  category = 'user.action',
) {
  if (!isTelemetryEnabled()) return
  const prev = debounceTimers.get(key)
  if (prev) clearTimeout(prev)
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key)
      try {
        const params = typeof paramsFn === 'function' ? paramsFn() : paramsFn
        trackAction(actionName, params || {}, category)
      } catch (err) {
        console.warn('[telemetry] debounced track failed', err)
      }
    }, delayMs),
  )
}

export function reportHandledError(
  error: unknown,
  context: Record<string, unknown> = {},
  actionName = 'handled_error',
) {
  if (!isTelemetryEnabled()) return
  const message = error instanceof Error ? error.message : String(error)
  try {
    if (window.Sentry) {
      window.Sentry.captureException(
        error instanceof Error ? error : new Error(message),
        { tags: { actionName }, extra: context },
      )
    }
  } catch (err) {
    console.warn('[telemetry] Sentry capture failed', err)
  }
  dispatchOtlp(
    actionName,
    message,
    { action: actionName, errorMessage: message.slice(0, 240), ...context },
    17,
    'ERROR',
  )
}
