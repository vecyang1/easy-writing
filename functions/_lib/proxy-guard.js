const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^\[?(::1|::)\]?$/i,
  /^\[?(fc|fd)[0-9a-f]{2}:/i,
  /^\[?fe[89ab][0-9a-f]:/i,
];

export function validateRankTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { ok: false, error: "missing url parameter" };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return { ok: false, error: "unsupported url scheme or credentials" };
  }
  if (parsed.port && parsed.port !== "443") {
    return { ok: false, error: "unsupported port" };
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "fanqienovel.com" && (parsed.pathname === "/rank" || parsed.pathname.startsWith("/rank/"))) {
    return { ok: true, url: parsed.toString(), site: "fanqie" };
  }
  if (host === "www.qimao.com" && parsed.pathname === "/qimaoapi/api/rank/book-list") {
    return { ok: true, url: parsed.toString(), site: "qimao" };
  }
  return { ok: false, error: "target host or path is not allowlisted" };
}

export function validateAiProxyTargetUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { ok: false, error: "missing target url" };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "invalid target url" };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    return { ok: false, error: "only https endpoints without embedded credentials are allowed" };
  }
  const host = parsed.hostname.toLowerCase();
  if (!host || PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    return { ok: false, error: "private or loopback target host is not allowed" };
  }
  if (parsed.port && parsed.port !== "443") {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      return { ok: false, error: "unsupported target port" };
    }
  }
  return { ok: true, url: parsed.toString() };
}
