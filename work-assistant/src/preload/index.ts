import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { DbAction, DbApi, DbResult } from '@shared/types'
import type { FileEntry, FileSearchHit, FilesResult, ScanAllResult } from '@shared/files'

/** 文件板块通道调用:失败统一抛错,调用方 catch 后提示 */
async function invokeFiles<T>(channel: string, payload?: unknown): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, payload)) as FilesResult<T>
  if (!res.ok) throw new Error(res.error ?? '文件操作失败')
  return res.data as T
}

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

  /** 文件板块:板块=本地文件夹(列举/扫描索引/检索/打开/上传) */
  files: {
    defaultRoot: (): Promise<string> =>
      invokeFiles<{ root: string }>('files.defaultRoot').then((d) => d.root),
    list: (boardId: number, path = ''): Promise<{ dir: string; entries: FileEntry[] }> =>
      invokeFiles('files.list', { boardId, path }),
    scan: (boardId: number): Promise<{ files: number; folders: number }> =>
      invokeFiles('files.scan', { boardId }),
    scanAll: (): Promise<ScanAllResult> => invokeFiles('files.scanAll'),
    counts: (): Promise<Record<number, number>> => invokeFiles('files.counts'),
    createFolder: (boardId: number, path: string, name: string): Promise<null> =>
      invokeFiles('files.createFolder', { boardId, path, name }),
    upload: (boardId: number, path: string): Promise<{ copied: number } | null> =>
      invokeFiles('files.upload', { boardId, path }),
    copyPaths: (boardId: number, path: string, paths: string[]): Promise<{ copied: number }> =>
      invokeFiles('files.copyPaths', { boardId, path, paths }),
    open: (boardId: number, path: string): Promise<null> =>
      invokeFiles('files.open', { boardId, path }),
    reveal: (boardId: number, path: string): Promise<null> =>
      invokeFiles('files.reveal', { boardId, path }),
    openBoardFolder: (boardId: number): Promise<null> =>
      invokeFiles('files.openBoardFolder', { boardId }),
    search: (query: string): Promise<FileSearchHit[]> => invokeFiles('files.search', { query }),
    pickFolder: (defaultPath?: string): Promise<string | null> =>
      invokeFiles('files.pickFolder', { defaultPath }),
    /** 拖拽进窗口的文件 → 本地绝对路径(webUtils 仅预加载可用) */
    dropPaths: (files: unknown[]): string[] =>
      files.map((f) => webUtils.getPathForFile(f as Parameters<typeof webUtils.getPathForFile>[0]))
  },

  /** 系统通知点击 → 主进程导航指令(提醒引擎发送,如 '#/meetings') */
  onNavigate: (cb: (route: string) => void): void => {
    ipcRenderer.on('app:navigate', (_event, route: string) => cb(route))
  },

  /** 提醒触发 → 通知渲染层刷新提醒中心 */
  onRemindersChanged: (cb: () => void): void => {
    ipcRenderer.on('app:reminders-changed', () => cb())
  },

  /** 应用内通知兜底(提醒触发/测试通知;系统 toast 被勿扰等抑制时仍可见;persistent 时不自动消失) */
  onInAppNotify: (
    cb: (payload: { title: string; body: string; route: string | null; persistent?: boolean }) => void
  ): void => {
    ipcRenderer.on('app:in-app-notify', (_event, payload) => cb(payload))
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
