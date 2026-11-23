import { resolveManagedUpstream, validateManagedAiSubpath } from '../../../edge-lib/managed-ai.js'

const GATEWAY_UA = 'Mozilla/5.0 (compatible; easy-writing-web/2.1)'

const SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
}

function jsonError(status, message) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...SECURITY_HEADERS,
    },
  })
}

async function handleManagedRequest({ request, env, params }) {
  const rawPath = Array.isArray(params?.path) ? params.path.join('/') : String(params?.path || '')
  const pathCheck = validateManagedAiSubpath(request.method, rawPath)
  if (!pathCheck.ok) {
    return jsonError(pathCheck.status, pathCheck.error)
  }

  const upstream = resolveManagedUpstream(env, pathCheck.subpath)
  if (!upstream.ok) {
    return jsonError(upstream.status, upstream.error)
  }

  const outHeaders = new Headers()
  outHeaders.set('Authorization', `Bearer ${upstream.apiKey}`)
  outHeaders.set('User-Agent', GATEWAY_UA)
  const contentType = request.headers.get('content-type')
  if (contentType) outHeaders.set('Content-Type', contentType)
  const accept = request.headers.get('accept')
  if (accept) outHeaders.set('Accept', accept)

  try {
    const upRes = await fetch(upstream.url, {
      method: request.method,
      headers: outHeaders,
      body: request.method === 'GET' ? undefined : request.body,
      redirect: 'follow',
    })
    const respHeaders = new Headers(SECURITY_HEADERS)
    const upContentType = upRes.headers.get('content-type')
    if (upContentType) respHeaders.set('Content-Type', upContentType)
    return new Response(upRes.body, {
      status: upRes.status,
      headers: respHeaders,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(502, `managed AI gateway error: ${message.slice(0, 160)}`)
  }
}

export async function onRequestGet(context) {
  return handleManagedRequest(context)
}

export async function onRequestPost(context) {
  return handleManagedRequest(context)
}
