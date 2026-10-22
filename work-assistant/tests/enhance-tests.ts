/**
 * 板块 10 增强功能纯逻辑验收测试(shared/backup.ts + shared/tray.ts)。
 * 运行方式:npm run test:enhance
 * 覆盖:备份文件名/清单构造/清单严格校验/统计摘要;托盘设置解析、关闭行为、菜单结构。
 */
import {
  BACKUP_APP,
  BACKUP_KIND,
  BACKUP_VERSION,
  backupFileName,
  buildBackupManifest,
  countsSummary,
  parseBackupManifest
} from '../src/shared/backup'
import type { BackupCounts, BackupManifest } from '../src/shared/backup'
import {
  AUTO_LAUNCH_KEY,
  TRAY_CLOSE_KEY,
  settingFlag,
  shouldHideOnClose,
  trayMenuItems
} from '../src/shared/tray'

let passed = 0
let failed = 0
const failureDetails: string[] = []

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    failureDetails.push(name + (detail ? `(${detail})` : ''))
    console.log(`  ✗ ${name}${detail ? `  ${detail}` : ''}`)
  }
}

const COUNTS: BackupCounts = {
  calendars: 4,
  events: 120,
  contacts: 18,
  fileBoards: 3,
  fileItems: 42,
  summaryDrafts: 2,
  reminders: 7
}

function manifest(over: Partial<BackupManifest> = {}): BackupManifest {
  return buildBackupManifest({
    appVersion: '0.1.0',
    schemaVersion: 6,
    createdAt: '2026-10-22 09:05',
    counts: { ...COUNTS },
    includesFiles: false,
    ...over
  })
}

// ---------- 备份文件名 ----------
{
  check(
    '文件名格式:日期时间补零',
    backupFileName(new Date(2026, 0, 2, 3, 4)) === '工作台助手备份-20260102-0304.zip'
  )
  check(
    '文件名格式:常规时间',
    backupFileName(new Date(2026, 9, 22, 14, 35)) === '工作台助手备份-20261022-1435.zip'
  )
  check('文件名以 .zip 结尾', backupFileName(new Date()).endsWith('.zip'))
  check('文件名含中文标识', backupFileName(new Date()).startsWith('工作台助手备份-'))
}

// ---------- 清单构造 ----------
{
  const m = manifest()
  check('固定 app 标识', m.app === BACKUP_APP && m.app === 'work-assistant')
  check('固定 kind 标识', m.kind === BACKUP_KIND && m.kind === 'work-assistant-backup')
  check('固定 version', m.version === BACKUP_VERSION && m.version === 1)
  check('保留传入字段', m.appVersion === '0.1.0' && m.schemaVersion === 6)
  check('备份不含实际文件(includesFiles=false)', m.includesFiles === false)
  check('counts 原样保留', m.counts.events === 120 && m.counts.fileItems === 42)
}

// ---------- 清单校验:合法 ----------
{
  const r = parseBackupManifest(manifest())
  check('合法清单通过校验', r.ok === true)
  if (r.ok) {
    check('校验返回完整清单', r.manifest.counts.calendars === 4)
    check('校验保留创建时间', r.manifest.createdAt === '2026-10-22 09:05')
  }
  check('允许附加未知字段', parseBackupManifest({ ...manifest(), extra: 'x' }).ok === true)
  check(
    '允许 schemaVersion 小于当前(恢复后迁移升级)',
    parseBackupManifest(manifest({ schemaVersion: 1 })).ok === true
  )
  check(
    'counts 全为 0 合法',
    parseBackupManifest(
      manifest({
        counts: {
          calendars: 0,
          events: 0,
          contacts: 0,
          fileBoards: 0,
          fileItems: 0,
          summaryDrafts: 0,
          reminders: 0
        }
      })
    ).ok === true
  )
}

// ---------- 清单校验:非法 ----------
function errOf(raw: unknown): string {
  const r = parseBackupManifest(raw)
  return r.ok ? '' : r.error
}

check('null 拒绝', errOf(null) !== '')
check('字符串拒绝', errOf('backup') !== '')
check('数组拒绝', errOf([]) !== '')
check('空对象拒绝', errOf({}) !== '')
check('其他应用的备份拒绝', errOf({ ...manifest(), app: 'other-app' }).includes('工作台助手'))
check('类型标识错误拒绝', errOf({ ...manifest(), kind: 'plain-zip' }).includes('类型'))
check('备份版本 2 拒绝并提示版本', errOf({ ...manifest(), version: 2 }).includes('不支持的备份版本'))
check('版本为字符串拒绝', errOf({ ...manifest(), version: '1' }) !== '')
check('缺少 appVersion 拒绝', errOf({ ...manifest(), appVersion: '' }) !== '')
check('appVersion 非字符串拒绝', errOf({ ...manifest(), appVersion: 1 }) !== '')
check('schemaVersion=0 拒绝', errOf({ ...manifest(), schemaVersion: 0 }) !== '')
check('schemaVersion 小数拒绝', errOf({ ...manifest(), schemaVersion: 5.5 }) !== '')
check('schemaVersion 字符串拒绝', errOf({ ...manifest(), schemaVersion: '6' }) !== '')
check('createdAt 格式错误拒绝', errOf({ ...manifest(), createdAt: '2026/10/22 09:05' }) !== '')
check('createdAt 仅日期拒绝', errOf({ ...manifest(), createdAt: '2026-10-22' }) !== '')
check('includesFiles=true 拒绝', errOf({ ...manifest(), includesFiles: true }) !== '')
check(
  '缺少 includesFiles 拒绝',
  errOf({ ...manifest(), includesFiles: undefined }) !== ''
)
check('counts 缺失拒绝', errOf({ ...manifest(), counts: undefined }) !== '')
check('counts 为字符串拒绝', errOf({ ...manifest(), counts: 'many' }) !== '')
check(
  'counts 缺 key 拒绝并指出字段名',
  errOf({ ...manifest(), counts: { ...COUNTS, reminders: undefined } }).includes('reminders')
)
check(
  'counts 负数拒绝',
  errOf({ ...manifest(), counts: { ...COUNTS, events: -1 } }).includes('events')
)
check(
  'counts 小数拒绝',
  errOf({ ...manifest(), counts: { ...COUNTS, contacts: 1.5 } }).includes('contacts')
)
check(
  'counts 字符串拒绝',
  errOf({ ...manifest(), counts: { ...COUNTS, fileBoards: '3' } }).includes('fileBoards')
)
check(
  'counts NaN 拒绝',
  errOf({ ...manifest(), counts: { ...COUNTS, summaryDrafts: NaN } }) !== ''
)
check('中文错误信息(可直接展示给用户)', errOf({ ...manifest(), version: 9 }).length > 4)

// ---------- 统计摘要 ----------
check(
  '统计摘要包含全部七项',
  countsSummary(COUNTS) ===
    '4 个日历 · 120 条事项 · 18 位联系人 · 3 个文件板块 · 42 条文件索引 · 2 份纲要草稿 · 7 条提醒'
)
check(
  '统计摘要零值可读',
  countsSummary({
    calendars: 0,
    events: 0,
    contacts: 0,
    fileBoards: 0,
    fileItems: 0,
    summaryDrafts: 0,
    reminders: 0
  }).startsWith('0 个日历 · 0 条事项')
)

// ---------- 设置键与开关解析 ----------
check('关闭到托盘设置键', TRAY_CLOSE_KEY === 'tray_close_to_tray')
check('开机自启设置键', AUTO_LAUNCH_KEY === 'auto_launch')
check("'1' → true", settingFlag('1', false) === true)
check("'0' → false", settingFlag('0', true) === false)
check('空串 → 默认值(true)', settingFlag('', true) === true)
check('空串 → 默认值(false)', settingFlag('', false) === false)
check('undefined → 默认值', settingFlag(undefined, true) === true)
check('null → 默认值', settingFlag(null, false) === false)
check('非 0/1 字符串 → 默认值', settingFlag('yes', true) === true && settingFlag('yes', false) === false)

// ---------- 关闭窗口行为 ----------
check('开启隐藏 + 非退出 → 隐藏', shouldHideOnClose(true, false) === true)
check('开启隐藏 + 退出流程 → 放行', shouldHideOnClose(true, true) === false)
check('关闭隐藏 + 非退出 → 放行', shouldHideOnClose(false, false) === false)
check('关闭隐藏 + 退出流程 → 放行', shouldHideOnClose(false, true) === false)

// ---------- 托盘菜单 ----------
{
  const items = trayMenuItems()
  check('菜单项数量 5(含分隔线)', items.length === 5)
  check(
    '菜单顺序:显示主界面 / 工作纲要 / 提醒中心 / 分隔线 / 退出',
    items.map((i) => i.id).join(',') === 'show,summary,reminders,separator,quit'
  )
  check('显示主界面无路由', items[0].label === '显示主界面' && items[0].route === undefined)
  check('工作纲要路由 #/summary', items[1].label === '工作纲要' && items[1].route === '#/summary')
  check('提醒中心路由 #/reminders', items[2].label === '提醒中心' && items[2].route === '#/reminders')
  check('分隔线无文案', items[3].label === '')
  check('退出菜单项文案', items[4].label === '退出工作台助手' && items[4].route === undefined)
  check('每次调用返回新数组(不共享可变状态)', trayMenuItems() !== items)
}

console.log('')
if (failed) {
  console.log(`✗ 增强功能测试失败 ${failed} 项 / 共 ${passed + failed} 项`)
  for (const f of failureDetails) console.log(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ 增强功能测试全部通过(${passed} 项)`)
