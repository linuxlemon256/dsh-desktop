/** Typed face of the Electron-injected window.__dshDesktop__ bridge. */

export interface DshDesktopSettingsInfo {
  port: number
  portSource: 'env' | 'config' | 'default'
  configPort: number | null
  running: boolean
  appVersion: string
}

export interface DshDesktopPortScanEntry {
  port: number
  pid: number | null
  name: string | null
  kind: 'dsh' | 'other' | 'free' | 'unknown'
}

export interface DshDesktopBridge {
  get(): Promise<DshDesktopSettingsInfo>
  setPort(port: number): Promise<{ ok: boolean; error?: string }>
  scanPorts(start: number, end: number): Promise<{ list?: DshDesktopPortScanEntry[]; error?: string }>
  identify(port: number): Promise<{ kind: 'dsh' | 'other' | 'free' | 'unknown'; pid: number | null; name: string | null }>
  restart(): Promise<{ ok: boolean; port?: number; attached?: boolean; error?: string }>
}

declare global {
  interface Window {
    __dshDesktop__?: DshDesktopBridge
  }
}
