import type { DbApi } from '@shared/types'
import type { FileEntry, FileSearchHit, ScanAllResult } from '@shared/files'
import type {
  SummaryExportPayload,
  SummaryExportResult,
  SummaryFormat
} from '@shared/summary'

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
  files: {
    defaultRoot: () => Promise<string>
    list: (boardId: number, path?: string) => Promise<{ dir: string; entries: FileEntry[] }>
    scan: (boardId: number) => Promise<{ files: number; folders: number }>
    scanAll: () => Promise<ScanAllResult>
    counts: () => Promise<Record<number, number>>
    createFolder: (boardId: number, path: string, name: string) => Promise<null>
    upload: (boardId: number, path: string) => Promise<{ copied: number } | null>
    copyPaths: (boardId: number, path: string, paths: string[]) => Promise<{ copied: number }>
    open: (boardId: number, path: string) => Promise<null>
    reveal: (boardId: number, path: string) => Promise<null>
    openBoardFolder: (boardId: number) => Promise<null>
    search: (query: string) => Promise<FileSearchHit[]>
    pickFolder: (defaultPath?: string) => Promise<string | null>
    dropPaths: (files: File[]) => string[]
  }
  summary: {
    export: (
      format: SummaryFormat,
      payload: SummaryExportPayload
    ) => Promise<SummaryExportResult | null>
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
