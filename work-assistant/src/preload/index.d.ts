export interface Api {
  appVersion: () => Promise<string>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}
