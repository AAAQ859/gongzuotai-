import { contextBridge, ipcRenderer } from 'electron'
import type { DbAction, DbApi, DbResult } from '@shared/types'

// 暴露给渲染进程的受控 API(后续板块按模块逐步扩展)
const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),

  /** 数据库操作统一入口(主进程 ipc.ts 路由) */
  db: {
    invoke: <T = unknown>(action: DbAction, payload?: unknown): Promise<DbResult<T>> =>
      ipcRenderer.invoke('db:invoke', action, payload)
  } satisfies DbApi,

  /** 系统集成:拨号(仅 tel: 协议)与通讯录 CSV 导入 */
  shell: {
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openExternal', url),
    pickCsv: (): Promise<{ path: string; content: string } | null> =>
      ipcRenderer.invoke('file:pickCsv')
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
