import type { DbApi } from '@shared/types'

export interface Api {
  appVersion: () => Promise<string>
  db: DbApi
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
    pickImportFile: () => Promise<{ path: string; name: string } | null>
    readImportFile: (
      filePath: string
    ) => Promise<{ kind: 'xlsx' | 'csv'; raw: string | string[][] }>
    testNotification: () => Promise<{ ok: boolean; system: boolean; error?: string }>
    openNotificationSettings: () => Promise<{ ok: boolean; error?: string }>
  }
  onNavigate: (cb: (route: string) => void) => void
  onRemindersChanged: (cb: () => void) => void
  onInAppNotify: (
    cb: (payload: { title: string; body: string; route: string | null; persistent?: boolean }) => void
  ) => void
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
