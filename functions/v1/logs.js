export async function onRequestPost({ request, env }) {
  const apiKey = env?.HYPERDX_API_KEY;
  const ingestUrl = env?.HYPERDX_INGEST_URL;
  if (!apiKey || !ingestUrl) {
    return new Response(JSON.stringify({ ok: false, error: "hyperdx_unconfigured" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const upRes = await fetch(ingestUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: apiKey,
      },
      body: request.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (upRes.ok) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, upstreamStatus: upRes.status }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, deferred: true }), {
      status: 202,
      headers: { "content-type": "application/json" },
    });
  }
}
