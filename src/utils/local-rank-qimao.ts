import { invoke, Resource } from '@tauri-apps/api/core'
import { isTauriRuntime } from '@/storage/writing-storage'
import { abortable, throwIfAborted } from '@/utils/abortable'

/** 复用窗口资源关闭协议取消请求；兼容策略由宿主限定在七猫榜单接口内。 */
export async function fetchQimaoRankPage(url: string, signal?: AbortSignal): Promise<unknown> {
  throwIfAborted(signal)
  if (!isTauriRuntime()) {
    const response = await window.fetch(`/api/rank-fetch?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      signal,
    })
    if (!response.ok) {
      throw new Error(`七猫接口返回 HTTP ${response.status}`)
    }
    return response.json()
  }
  let resource: Resource | undefined
  let closing: Promise<void> | undefined
  const close = () => resource
    ? (closing ??= resource.close().catch(error => console.warn('释放七猫请求失败', error)))
    : Promise.resolve()
  const abort = () => {
    void close()
  }
  try {
    const rid = await invoke<number>('qimao_rank_request', { url })
    resource = new Resource(rid)
    signal?.addEventListener('abort', abort, { once: true })
    throwIfAborted(signal)
    return await abortable(invoke<unknown>('qimao_rank_response', { rid }), signal)
  } catch (error) {
    // Tauri 的 Result<String> 错误会作为字符串拒绝，统一为 Error 供界面展示。
    throw error instanceof Error ? error : new Error(String(error))
  } finally {
    signal?.removeEventListener('abort', abort)
    await close()
  }
}
