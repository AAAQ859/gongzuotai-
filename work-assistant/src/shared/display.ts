/** 会议信息显示方式:文字标签(默认) / 图标前缀 */
export type MeetingDisplayMode = 'text' | 'icon'

export const MEETING_DISPLAY_SETTING_KEY = 'meeting_display_mode'
export const DEFAULT_MEETING_DISPLAY_MODE: MeetingDisplayMode = 'text'

export function normalizeMeetingDisplayMode(value: string | null | undefined): MeetingDisplayMode {
  return value === 'icon' ? 'icon' : DEFAULT_MEETING_DISPLAY_MODE
}
