import { validateRankTargetUrl } from "../_lib/proxy-guard.js";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 25_000;

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const target = reqUrl.searchParams.get("url") || "";
  const check = validateRankTargetUrl(target);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.error }), {
      status: 400,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Referer: check.site === "qimao" ? "https://www.qimao.com/paihang/" : "https://fanqienovel.com/",
      Accept:
        check.site === "qimao"
          ? "application/json, text/plain, */*"
          : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    const upRes = await fetch(check.url, {
      method: "GET",
      headers,
      redirect: "error",
      signal: controller.signal,
    });
    const buf = await upRes.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "upstream payload too large" }), {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    const contentType =
      upRes.headers.get("content-type") ||
      (check.site === "qimao" ? "application/json; charset=utf-8" : "text/html; charset=utf-8");
    return new Response(buf, {
      status: upRes.status,
      headers: {
        "Content-Type": contentType,
        "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `rank fetch failed: ${message.slice(0, 160)}` }), {
      status: 502,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}
