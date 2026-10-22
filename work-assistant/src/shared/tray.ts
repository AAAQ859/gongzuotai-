/**
 * 系统托盘与开机自启(板块 10)共享定义:
 * 设置键、开关解析、关闭窗口行为、托盘菜单结构。纯逻辑,可单测。
 */

export const TRAY_CLOSE_KEY = 'tray_close_to_tray'
export const AUTO_LAUNCH_KEY = 'auto_launch'

/** 设置值('1'/'0')转布尔;缺省时使用默认值 */
export function settingFlag(value: string | undefined | null, defaultValue: boolean): boolean {
  if (value === '1') return true
  if (value === '0') return false
  return defaultValue
}

/** 关闭主窗口时是否隐藏到托盘(退出流程中必须放行) */
export function shouldHideOnClose(closeToTray: boolean, quitting: boolean): boolean {
  return closeToTray && !quitting
}

export interface TrayStatus {
  active: boolean
  menu: string[]
  closeToTray: boolean
  autoLaunch: boolean
  window: { visible: boolean; minimized: boolean } | null
}

export type TrayMenuId = 'show' | 'summary' | 'reminders' | 'separator' | 'quit'

export interface TrayMenuItem {
  id: TrayMenuId
  label: string
  /** 点击后跳转的路由(主进程发送 app:navigate) */
  route?: string
}

/** 托盘右键菜单:显示主界面 / 工作纲要 / 提醒中心 / 退出 */
export function trayMenuItems(): TrayMenuItem[] {
  return [
    { id: 'show', label: '显示主界面' },
    { id: 'summary', label: '工作纲要', route: '#/summary' },
    { id: 'reminders', label: '提醒中心', route: '#/reminders' },
    { id: 'separator', label: '' },
    { id: 'quit', label: '退出工作台助手' }
  ]
}
