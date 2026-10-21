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
  }
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
