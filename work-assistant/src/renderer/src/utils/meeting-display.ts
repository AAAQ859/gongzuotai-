import { ref } from 'vue'
import {
  DEFAULT_MEETING_DISPLAY_MODE,
  MEETING_DISPLAY_SETTING_KEY,
  normalizeMeetingDisplayMode,
  type MeetingDisplayMode
} from '@shared/display'
import { db } from '@/api/db'

/** 全局共享的会议信息显示方式;设置页修改后待办弹窗/会议日历立即跟随 */
export const meetingDisplayMode = ref<MeetingDisplayMode>(DEFAULT_MEETING_DISPLAY_MODE)

let loaded = false

export async function loadMeetingDisplayMode(force = false): Promise<MeetingDisplayMode> {
  if (loaded && !force) return meetingDisplayMode.value
  try {
    meetingDisplayMode.value = normalizeMeetingDisplayMode(
      await db.settings.get(MEETING_DISPLAY_SETTING_KEY, DEFAULT_MEETING_DISPLAY_MODE)
    )
  } catch {
    meetingDisplayMode.value = DEFAULT_MEETING_DISPLAY_MODE
  }
  loaded = true
  return meetingDisplayMode.value
}

export async function saveMeetingDisplayMode(mode: MeetingDisplayMode): Promise<void> {
  const next = normalizeMeetingDisplayMode(mode)
  await db.settings.set(MEETING_DISPLAY_SETTING_KEY, next)
  meetingDisplayMode.value = next
  loaded = true
}
