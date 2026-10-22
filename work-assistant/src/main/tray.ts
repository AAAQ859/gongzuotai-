/**
 * 系统托盘 + 开机自启(板块 10):
 * - 托盘常驻:显示主界面 / 工作纲要 / 提醒中心 / 退出;单击/双击托盘图标显示窗口
 * - 关闭主窗口时按设置隐藏到托盘(退出流程放行)
 * - 开机自启通过 app.setLoginItemSettings 注册;开发模式指向 Electron + 应用目录
 * 托盘图标用原生位图绘制(青绿圆角底 + 白色 W),无需外部资源文件。
 */
import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'
import * as settingsRepo from './db/repositories/settings'
import type { TrayStatus } from '@shared/tray'
import {
  AUTO_LAUNCH_KEY,
  TRAY_CLOSE_KEY,
  settingFlag,
  shouldHideOnClose,
  trayMenuItems
} from '@shared/tray'

let tray: Tray | null = null
let quitting = false

export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

export function closeToTrayEnabled(): boolean {
  return settingFlag(settingsRepo.get(TRAY_CLOSE_KEY, ''), true)
}

export function shouldHideWindowOnClose(): boolean {
  return shouldHideOnClose(closeToTrayEnabled(), quitting)
}

/**
 * 自启注册参数。开发模式必须带 Electron 可执行文件 + 应用目录参数;
 * 读取状态时也要用同一组参数,否则 getLoginItemSettings() 会误报未开启。
 */
function loginItemOptions(openAtLogin: boolean): Parameters<typeof app.setLoginItemSettings>[0] {
  const options: Parameters<typeof app.setLoginItemSettings>[0] = { openAtLogin }
  if (!app.isPackaged) {
    options.path = process.execPath
    options.args = [app.getAppPath()]
  }
  return options
}

export function autoLaunchEnabled(): boolean {
  return app.getLoginItemSettings(loginItemOptions(false)).openAtLogin
}

/** 写入开机自启并持久化设置;返回系统实际状态 */
export function setAutoLaunch(enabled: boolean): boolean {
  app.setLoginItemSettings(loginItemOptions(enabled))
  settingsRepo.set(AUTO_LAUNCH_KEY, enabled ? '1' : '0')
  return autoLaunchEnabled()
}

/** 启动时按保存的设置校正系统自启项(设置缺失时记录当前系统状态) */
export function applyAutoLaunchFromSettings(): void {
  const raw = settingsRepo.get(AUTO_LAUNCH_KEY, '')
  if (raw === '') {
    settingsRepo.set(AUTO_LAUNCH_KEY, autoLaunchEnabled() ? '1' : '0')
    return
  }
  const want = settingFlag(raw, false)
  if (want !== autoLaunchEnabled()) setAutoLaunch(want)
}

function segmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  const x = x1 + t * dx
  const y = y1 + t * dy
  return Math.hypot(px - x, py - y)
}

/** 32×32 BGRA 托盘图标:青绿圆角方块 + 白色 W */
function buildTrayIcon(): NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const radius = 8
  const bg = { r: 0x12, g: 0xb8, b: 0x86 }
  const strokes = [
    [8, 10, 12, 22],
    [12, 22, 16, 12],
    [16, 12, 20, 22],
    [20, 22, 24, 10]
  ]

  const insideRounded = (x: number, y: number): boolean => {
    const cx = Math.min(Math.max(x, radius), size - radius)
    const cy = Math.min(Math.max(y, radius), size - radius)
    return Math.hypot(x - cx, y - cy) <= radius
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!insideRounded(x + 0.5, y + 0.5)) continue
      let white = 0
      for (const [x1, y1, x2, y2] of strokes) {
        const d = segmentDistance(x + 0.5, y + 0.5, x1, y1, x2, y2)
        if (d <= 2.2) white = Math.max(white, Math.min(1, 2.2 - d + 0.35))
      }
      const i = (y * size + x) * 4
      buf[i] = Math.round(bg.b * (1 - white) + 255 * white)
      buf[i + 1] = Math.round(bg.g * (1 - white) + 255 * white)
      buf[i + 2] = Math.round(bg.r * (1 - white) + 255 * white)
      buf[i + 3] = 255
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

function showMain(getWin: () => BrowserWindow | null, create: () => BrowserWindow): BrowserWindow {
  const win = getWin()
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    return win
  }
  return create()
}

export function setupTray(
  getWin: () => BrowserWindow | null,
  create: () => BrowserWindow
): void {
  if (tray) return
  const template = trayMenuItems().map((item) => {
    if (item.id === 'separator') return { type: 'separator' as const }
    return {
      label: item.label,
      click: (): void => {
        if (item.id === 'quit') {
          markQuitting()
          app.quit()
          return
        }
        const win = showMain(getWin, create)
        if (item.route && !win.webContents.isLoading()) {
          win.webContents.send('app:navigate', item.route)
        }
      }
    }
  })
  tray = new Tray(buildTrayIcon())
  tray.setToolTip('工作台助手')
  tray.setContextMenu(Menu.buildFromTemplate(template))
  tray.on('click', () => showMain(getWin, create))
  tray.on('double-click', () => showMain(getWin, create))
}

export function trayStatus(): TrayStatus {
  const win = BrowserWindow.getAllWindows()[0]
  return {
    active: !!tray,
    menu: trayMenuItems()
      .filter((i) => i.id !== 'separator')
      .map((i) => i.label),
    closeToTray: closeToTrayEnabled(),
    autoLaunch: autoLaunchEnabled(),
    window: win
      ? { visible: win.isVisible(), minimized: win.isMinimized() }
      : null
  }
}

/** 设置页/验收脚本:显示主界面(与托盘菜单同逻辑) */
export function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

/** 应用退出时销毁托盘 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
