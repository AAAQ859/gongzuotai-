import type { DbApi } from '@shared/types'

export interface Api {
  appVersion: () => Promise<string>
  db: DbApi
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
