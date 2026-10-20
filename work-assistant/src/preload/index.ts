import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的受控 API(后续板块按模块逐步扩展)
const api = {
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version')
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
