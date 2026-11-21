import { onRequestGet as __api_ai_proxy_js_onRequestGet } from "/Users/vecsatfoxmailcom/Documents/A-coding/26.11.21-easy-writing/functions/api/ai-proxy.js"
import { onRequestPost as __api_ai_proxy_js_onRequestPost } from "/Users/vecsatfoxmailcom/Documents/A-coding/26.11.21-easy-writing/functions/api/ai-proxy.js"
import { onRequestGet as __api_health_js_onRequestGet } from "/Users/vecsatfoxmailcom/Documents/A-coding/26.11.21-easy-writing/functions/api/health.js"
import { onRequestGet as __api_rank_fetch_js_onRequestGet } from "/Users/vecsatfoxmailcom/Documents/A-coding/26.11.21-easy-writing/functions/api/rank-fetch.js"
import { onRequestPost as __v1_logs_js_onRequestPost } from "/Users/vecsatfoxmailcom/Documents/A-coding/26.11.21-easy-writing/functions/v1/logs.js"

export const routes = [
    {
      routePath: "/api/ai-proxy",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_ai_proxy_js_onRequestGet],
    },
  {
      routePath: "/api/ai-proxy",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_ai_proxy_js_onRequestPost],
    },
  {
      routePath: "/api/health",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_health_js_onRequestGet],
    },
  {
      routePath: "/api/rank-fetch",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_rank_fetch_js_onRequestGet],
    },
  {
      routePath: "/v1/logs",
      mountPath: "/v1",
      method: "POST",
      middlewares: [],
      modules: [__v1_logs_js_onRequestPost],
    },
  ]