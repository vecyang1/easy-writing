import { parseManagedCatalog } from '../../edge-lib/managed-ai.js'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
}

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin
  const catalog = parseManagedCatalog(env, origin)
  return new Response(JSON.stringify(catalog), {
    status: 200,
    headers: JSON_HEADERS,
  })
}
