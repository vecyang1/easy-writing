export async function onRequestGet({ request }) {
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
