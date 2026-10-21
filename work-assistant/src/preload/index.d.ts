import type { DbApi } from '@shared/types'

export interface Api {
  appVersion: () => Promise<string>
  db: DbApi
  shell: {
    openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
    pickCsv: () => Promise<{ path: string; content: string } | null>
  }
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
