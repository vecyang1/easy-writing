export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  return new Response(
    JSON.stringify({
      status: "healthy",
      service: "easy-writing-web",
      host: url.hostname,
      timestamp: new Date().toISOString(),
      runtime: "cloudflare-pages",
      features: {
        rankProxy: true,
        aiCorsRelay: true,
        managedAiGateway: Boolean(env?.MANAGED_AI_BASE_URL && env?.MANAGED_AI_API_KEY),
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        "Cache-Control": "private, no-cache",
      },
    },
  );
}
