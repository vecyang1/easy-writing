import { validateAiProxyTargetUrl } from "../_lib/proxy-guard.js";

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "x-api-key",
  "anthropic-version",
  "http-referer",
  "x-title",
];

async function forwardRequest(request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "method not allowed" } }), {
      status: 405,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const target = request.headers.get("x-ew-target-url") || "";
  const check = validateAiProxyTargetUrl(target);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: { message: check.error } }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const outHeaders = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) outHeaders.set(name, value);
  }

  try {
    const upRes = await fetch(check.url, {
      method: request.method,
      headers: outHeaders,
      body: request.method === "GET" ? undefined : request.body,
      redirect: "error",
    });
    const respHeaders = new Headers();
    const contentType = upRes.headers.get("content-type");
    if (contentType) respHeaders.set("Content-Type", contentType);
    respHeaders.set("Cache-Control", "private, no-store");
    respHeaders.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return new Response(upRes.body, {
      status: upRes.status,
      headers: respHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: { message: `AI proxy error: ${message.slice(0, 160)}` } }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  }
}

export async function onRequestGet({ request }) {
  return forwardRequest(request);
}

export async function onRequestPost({ request }) {
  return forwardRequest(request);
}
