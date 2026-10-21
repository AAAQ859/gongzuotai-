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

  /** 系统集成:拨号(仅 tel: 协议)、通讯录 Excel/CSV 导入与通知测试 */
  shell: {
    openExternal: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openExternal', url),
    pickImportFile: (): Promise<{ path: string; name: string } | null> =>
      ipcRenderer.invoke('file:pickImportFile'),
    readImportFile: (
      filePath: string
    ): Promise<{ kind: 'xlsx' | 'csv'; raw: string | string[][] }> =>
      ipcRenderer.invoke('file:readImportFile', filePath),
    testNotification: (): Promise<{ ok: boolean; system: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:testNotification'),
    openNotificationSettings: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openNotificationSettings')
  },

  /** 系统通知点击 → 主进程导航指令(提醒引擎发送,如 '#/meetings') */
  onNavigate: (cb: (route: string) => void): void => {
    ipcRenderer.on('app:navigate', (_event, route: string) => cb(route))
  },

  /** 提醒触发 → 通知渲染层刷新提醒中心 */
  onRemindersChanged: (cb: () => void): void => {
    ipcRenderer.on('app:reminders-changed', () => cb())
  },

  /** 应用内通知兜底(提醒触发/测试通知;系统 toast 被勿扰等抑制时仍可见) */
  onInAppNotify: (cb: (payload: { title: string; body: string; route: string | null }) => void): void => {
    ipcRenderer.on('app:in-app-notify', (_event, payload) => cb(payload))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
