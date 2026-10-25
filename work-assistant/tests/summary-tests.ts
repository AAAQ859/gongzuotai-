/**
 * 工作纲要纯逻辑验收测试(src/shared/summary.ts)。
 * 运行方式:npm run test:summary
 * 覆盖:月/周/自定义区间与跨年、月末工作日、完成事项筛选与分类、
 *       统计口径、自动描述、纲要章节生成、模板归一化、纯文本导出。
 */
import {
  DEFAULT_SUMMARY_NOTE,
  DEFAULT_SUMMARY_TEMPLATE,
  addDaysStr,
  autoDescription,
  buildSummaryContent,
  cnNumber,
  customRange,
  emptySummaryContent,
  isCompletedInRange,
  isLastWorkday,
  isSelfMeeting,
  lastWorkdayOfMonth,
  monthRange,
  normalizeSummaryContent,
  normalizeSummaryTemplate,
  nowText,
  parseSummaryTemplate,
  rangeLabel,
  rangeSpanText,
  rangeTitle,
  renderSummaryText,
  sectionOfEvent,
  selectSummaryEvents,
  startOfWeekStr,
  summaryFileName,
  summaryStats,
  visibleSections,
  weekRange
} from '../src/shared/summary'
import type { SummaryEventLike, SummaryExportPayload } from '../src/shared/summary'

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

const NOW = '2026-10-21 12:00'
const OCT = monthRange('2026-10')

function ev(patch: Partial<SummaryEventLike> & { id: number }): SummaryEventLike {
  return {
    kind: 'task',
    title: '事项',
    description: '',
    category: '',
    contact_id: null,
    start_time: '2026-10-05 09:00',
    end_time: null,
    status: 'done',
    location: '',
    attendees: [],
    completed_at: '2026-10-05 10:00',
    ...patch
  }
}

// ---------- 区间 ----------
{
  const oct = monthRange('2026-10')
  check('月区间:10 月开始 2026-10-01', oct.start === '2026-10-01')
  check('月区间:10 月结束 2026-10-31', oct.end === '2026-10-31')
  check('月区间:key 为 YYYY-MM', oct.key === '2026-10')
  check('月区间:mode=month', oct.mode === 'month')

  const feb24 = monthRange('2024-02')
  check('闰年 2 月结束 2024-02-29', feb24.end === '2024-02-29')
  const feb26 = monthRange('2026-02')
  check('平年 2 月结束 2026-02-28', feb26.end === '2026-02-28')

  const week = weekRange('2026-10-21')
  check('周三所在周从周一 2026-10-19 开始', week.start === '2026-10-19')
  check('周三所在周到周日 2026-10-25 结束', week.end === '2026-10-25')
  check('周 key 为周一日期', week.key === '2026-10-19')
  check('周 mode=week', week.mode === 'week')

  check('周日归入上一个周一', startOfWeekStr('2026-10-25') === '2026-10-19')
  check('周一归属自身', startOfWeekStr('2026-10-19') === '2026-10-19')
  const crossWeek = weekRange('2026-12-31')
  check('跨年周:开始 2026-12-28', crossWeek.start === '2026-12-28')
  check('跨年周:结束 2027-01-03', crossWeek.end === '2027-01-03')

  const custom = customRange('2026-10-01', '2026-10-20')
  check('自定义区间 key 为 start_end', custom.key === '2026-10-01_2026-10-20')
  check('自定义区间 mode=custom', custom.mode === 'custom')
  const reversed = customRange('2026-10-20', '2026-10-01')
  check('自定义区间起止颠倒自动交换', reversed.start === '2026-10-01' && reversed.end === '2026-10-20')
  check('addDays 跨月:10-31 +1 → 11-01', addDaysStr('2026-10-31', 1) === '2026-11-01')
  check('addDays 跨年:12-31 +1 → 次年 01-01', addDaysStr('2026-12-31', 1) === '2027-01-01')
}

// ---------- 文案 ----------
{
  check('月区间文案', rangeLabel(OCT) === '2026年10月')
  check('周区间同年文案省略结束年份', rangeLabel(weekRange('2026-10-21')) === '2026年10月19日 - 10月25日')
  check(
    '周区间跨年保留结束年份',
    rangeLabel(weekRange('2026-12-31')) === '2026年12月28日 - 2027年1月3日'
  )
  check('纲要标题为区间 + 工作内容纲要', rangeTitle(OCT) === '2026年10月工作内容纲要')
  check('统计周期文案', rangeSpanText(OCT) === '统计周期:2026年10月1日 - 10月31日')
  check('月份数字不补零', rangeLabel(monthRange('2026-01')) === '2026年1月')
  check('文件名去除 Windows 非法字符', summaryFileName('2026/10 报告:测试?', 'docx') === '202610 报告测试.docx')
  check('文件名全非法字符回退默认名', summaryFileName('///', 'pdf') === '工作内容纲要.pdf')
  check('文件名保留中文与空格', summaryFileName('10月 工作纲要', 'txt') === '10月 工作纲要.txt')
  check('中文序号 1 → 一', cnNumber(1) === '一')
  check('中文序号 4 → 四', cnNumber(4) === '四')
}

// ---------- 月末工作日 ----------
{
  check('2026-10 最后工作日为 10-30(31 日为周六)', lastWorkdayOfMonth(2026, 10) === '2026-10-30')
  check('2026-05 最后工作日为 05-29(31 日为周日)', lastWorkdayOfMonth(2026, 5) === '2026-05-29')
  check('2026-02 最后工作日为 02-27(28 日为周六)', lastWorkdayOfMonth(2026, 2) === '2026-02-27')
  check('10-30 判定为当月最后工作日', isLastWorkday('2026-10-30'))
  check('10-31 周六不是工作日', !isLastWorkday('2026-10-31'))
  check('10-29 不是最后工作日', !isLastWorkday('2026-10-29'))
  check('本地时间文本固定格式', nowText(new Date(2026, 9, 5, 8, 7)) === '2026-10-05 08:07')
}

// ---------- 分类 ----------
{
  const selfMeeting = ev({
    id: 1,
    kind: 'meeting',
    attendees: [{ contact_id: null, name: '我' }]
  })
  const noticeMeeting = ev({
    id: 101,
    kind: 'meeting',
    attendees: [{ contact_id: 1, name: '张三' }]
  })
  check('含「我」的会议归入会议参与', sectionOfEvent(selfMeeting) === 'meeting')
  check('不含「我」的会议归入会议通知', sectionOfEvent(noticeMeeting) === 'meeting_notice')
  check('无参会人的会议归入会议通知', sectionOfEvent(ev({ id: 102, kind: 'meeting' })) === 'meeting_notice')
  check('类别含「报告」归入报告材料', sectionOfEvent(ev({ id: 2, category: '月度报告' })) === 'report')
  check('标题含「材料」归入报告材料', sectionOfEvent(ev({ id: 3, title: '换季准备材料整理' })) === 'report')
  check('标题含「总结」归入报告材料', sectionOfEvent(ev({ id: 4, title: '年度工作总结' })) === 'report')
  check('关联对接人归入对接协调', sectionOfEvent(ev({ id: 5, contact_id: 8 })) === 'coordination')
  check('标题含「对接」归入对接协调', sectionOfEvent(ev({ id: 6, title: '与韩亚对接航班计划' })) === 'coordination')
  check('类别含「协调」归入对接协调', sectionOfEvent(ev({ id: 7, category: '协调事项' })) === 'coordination')
  check('普通事项归入例行工作', sectionOfEvent(ev({ id: 8, title: '整理值班记录' })) === 'routine')
  check(
    '会议优先于报告关键词',
    sectionOfEvent(
      ev({
        id: 9,
        kind: 'meeting',
        title: '报告评审会',
        attendees: [{ contact_id: null, name: '我' }]
      })
    ) === 'meeting'
  )
}

// ---------- 完成筛选 ----------
{
  check('区间内已完成任务纳入', isCompletedInRange(ev({ id: 1 }), OCT, NOW))
  check('待办任务不纳入', !isCompletedInRange(ev({ id: 2, status: 'todo' }), OCT, NOW))
  check('进行中任务不纳入', !isCompletedInRange(ev({ id: 3, status: 'in_progress' }), OCT, NOW))
  check('取消任务不纳入', !isCompletedInRange(ev({ id: 4, status: 'cancelled' }), OCT, NOW))
  const sepTask = ev({ id: 5, completed_at: '2026-09-30 18:00' })
  check('完成日期在区间外不纳入', !isCompletedInRange(sepTask, OCT, NOW))
  const boundaryStart = ev({ id: 6, completed_at: '2026-10-01 00:10' })
  const boundaryEnd = ev({ id: 7, completed_at: '2026-10-31 23:50' })
  check('区间首日边界纳入', isCompletedInRange(boundaryStart, OCT, NOW))
  check('区间末日边界纳入', isCompletedInRange(boundaryEnd, OCT, NOW))

  const pastMeeting = ev({
    id: 8,
    kind: 'meeting',
    status: 'todo',
    start_time: '2026-10-15 09:00',
    completed_at: null
  })
  const futureMeeting = ev({
    id: 9,
    kind: 'meeting',
    status: 'todo',
    start_time: '2026-10-25 09:00',
    completed_at: null
  })
  check('已召开会议(未标完成)纳入', isCompletedInRange(pastMeeting, OCT, NOW))
  check('未召开会议不纳入', !isCompletedInRange(futureMeeting, OCT, NOW))
  const doneFutureMeeting = ev({
    id: 10,
    kind: 'meeting',
    status: 'done',
    start_time: '2026-10-25 09:00',
    completed_at: null
  })
  check('已标记完成的未来会议纳入', isCompletedInRange(doneFutureMeeting, OCT, NOW))
  const cancelledMeeting = ev({ id: 11, kind: 'meeting', status: 'cancelled', start_time: '2026-10-10 09:00' })
  check('取消的会议不纳入', !isCompletedInRange(cancelledMeeting, OCT, NOW))

  const taskWithStartOnly = ev({
    id: 12,
    start_time: '2026-10-08 09:00',
    completed_at: null
  })
  check('任务无完成时间时回退开始日期', isCompletedInRange(taskWithStartOnly, OCT, NOW))
}

// ---------- 自动描述 ----------
{
  const withDesc = ev({ id: 1, title: '例会', description: '  已完成描述  ' })
  check('已有描述去首尾空白', autoDescription(withDesc) === '已完成描述')

  const meeting = ev({
    id: 2,
    kind: 'meeting',
    title: '部门例会',
    start_time: '2026-10-15 09:30',
    location: '3号会议室',
    attendees: [
      { contact_id: null, name: '我' },
      { contact_id: 1, name: '张三' },
      { contact_id: 2, name: '李四' }
    ]
  })
  check('含「我」的会议识别为本人参会', isSelfMeeting(meeting))
  check(
    '本人参会描述含日期/时间/地点/参会人',
    autoDescription(meeting) === '10月15日 09:30在3号会议室参加「部门例会」,参会人员:我、张三、李四'
  )

  const noticed = ev({
    id: 21,
    kind: 'meeting',
    title: '换季协调会',
    start_time: '2026-10-16 14:00',
    location: '线上会议',
    attendees: [
      { contact_id: 1, name: '张三' },
      { contact_id: 2, name: '李四' }
    ]
  })
  check('不含「我」的会议识别为会议通知', !isSelfMeeting(noticed))
  check(
    '会议通知描述为通知参会人参加',
    autoDescription(noticed) === '10月16日 14:00通知张三、李四参加「换季协调会」(地点:线上会议)'
  )

  const noAttendeeMeeting = ev({ id: 22, kind: 'meeting', title: '临时会议' })
  check(
    '未填参会人的会议按会议通知描述',
    autoDescription(noAttendeeMeeting).includes('通知参会人员参加「临时会议」')
  )

  const noticedWithDesc = ev({
    id: 23,
    kind: 'meeting',
    title: '保障协调会',
    description: '确认换季首日保障流程',
    start_time: '2026-10-17 10:00',
    attendees: [{ contact_id: 1, name: '张三' }]
  })
  check(
    '会议通知保留备注并补充通知口径',
    autoDescription(noticedWithDesc) ===
      '10月17日 10:00通知张三参加「保障协调会」 — 确认换季首日保障流程'
  )

  const task = ev({
    id: 3,
    title: '对接韩亚航空换季事宜',
    completed_at: '2026-10-12 16:00',
    contact_id: 8
  })
  const withContact = autoDescription(task, (id) => (id === 8 ? '金敏俊' : undefined))
  check('任务自动描述使用对接人姓名', withContact === '10月12日完成「对接韩亚航空换季事宜」,对接:金敏俊')
  check('取不到对接人姓名时省略', autoDescription(task) === '10月12日完成「对接韩亚航空换季事宜」')
}

// ---------- 统计与纲要生成 ----------
const events: SummaryEventLike[] = [
  ev({ id: 101, title: '整理值班记录', description: '完成每日值班记录整理' }),
  ev({ id: 102, title: '月度工作报告', category: '报告提交', completed_at: '2026-10-10 17:00' }),
  ev({
    id: 103,
    title: '对接韩亚航空换季事宜',
    contact_id: 8,
    completed_at: '2026-10-12 16:00'
  }),
  ev({
    id: 104,
    kind: 'meeting',
    title: '部门例会',
    status: 'todo',
    start_time: '2026-10-15 09:30',
    location: '3号会议室',
    attendees: [
      { contact_id: null, name: '我' },
      { contact_id: 1, name: '张三' }
    ],
    completed_at: null
  }),
  ev({
    id: 109,
    kind: 'meeting',
    title: '换季协调会',
    status: 'todo',
    start_time: '2026-10-16 14:00',
    location: '线上会议',
    attendees: [{ contact_id: 1, name: '张三' }],
    completed_at: null
  }),
  ev({
    id: 105,
    kind: 'meeting',
    title: '下月计划会',
    status: 'todo',
    start_time: '2026-10-25 09:00',
    completed_at: null
  }),
  ev({ id: 106, title: '未完成任务', status: 'todo' }),
  ev({ id: 107, title: '取消任务', status: 'cancelled' }),
  ev({ id: 108, title: '上月事项', completed_at: '2026-09-20 10:00' })
]

{
  const stats = summaryStats(events, OCT, NOW)
  check('完成工作项=3(不含会议)', stats.completed === 3)
  check('参加会议=1(已召开)', stats.meetings === 1)
  check('会议通知=1(已召开)', stats.meeting_notices === 1)
  check('对接事项=1', stats.contacts === 1)
  check('输出报告=1', stats.reports === 1)

  const selected = selectSummaryEvents(events, OCT, NOW)
  check('筛选结果=5 条(3 任务 + 2 会议)', selected.length === 5)
  check('筛选结果按日期升序', selected.map((e) => e.id).join(',') === '101,102,103,104,109')

  const content = buildSummaryContent(events, OCT, NOW, (id) => (id === 8 ? '金敏俊' : undefined))
  check('纲要固定包含五个章节', content.sections.length === 5)
  check(
    '章节顺序:例行/对接/会议参与/会议通知/报告',
    content.sections.map((s) => s.key).join(',') === 'routine,coordination,meeting,meeting_notice,report'
  )
  check('例行工作 1 条', content.sections[0].items.length === 1)
  check('对接协调 1 条', content.sections[1].items.length === 1)
  check('会议参与 1 条', content.sections[2].items.length === 1)
  check('会议通知 1 条', content.sections[3].items.length === 1)
  check('报告材料 1 条', content.sections[4].items.length === 1)
  check('会议参与项为含「我」的会议', content.sections[2].items[0].title === '部门例会')
  check('会议通知项为不含「我」的会议', content.sections[3].items[0].title === '换季协调会')
  check(
    '会议通知描述为通知他人参加',
    content.sections[3].items[0].description.includes('通知张三参加「换季协调会」')
  )
  check('自动事项 id 带 ev- 前缀', content.sections[0].items[0].id === 'ev-101')
  check('自动事项来源为 auto', content.sections[0].items[0].source === 'auto')
  check('事项保留日期', content.sections[4].items[0].date === '2026-10-10')
  check('默认备注', content.note === DEFAULT_SUMMARY_NOTE)
  check(
    '对接事项描述带联系人',
    content.sections[1].items[0].description.includes('对接:金敏俊')
  )

  const empty = buildSummaryContent([], OCT, NOW)
  check('无事项时仍返回五个空章节', empty.sections.length === 5 && empty.sections.every((s) => s.items.length === 0))
}

// ---------- 模板 ----------
{
  const t = normalizeSummaryTemplate({
    include_stats: false,
    include_note: false,
    sections: ['meeting', 'routine', 'meeting']
  })
  check('模板保留统计开关', t.include_stats === false)
  check('模板保留备注开关', t.include_note === false)
  check('模板章节去重并保持顺序', t.sections.join(',') === 'meeting,routine')
  check('模板忽略未知章节', normalizeSummaryTemplate({ sections: ['meeting', 'xxx'] }).sections.join(',') === 'meeting')
  const emptySections = normalizeSummaryTemplate({ sections: [] })
  check('模板章节为空时回退全部章节', emptySections.sections.length === 5)
  check('非对象模板回退默认', normalizeSummaryTemplate(null).sections.length === 5)
  check('默认模板含统计', DEFAULT_SUMMARY_TEMPLATE.include_stats)
  check('默认模板含备注', DEFAULT_SUMMARY_TEMPLATE.include_note)
  check('默认模板五章节', DEFAULT_SUMMARY_TEMPLATE.sections.length === 5)

  const parsed = parseSummaryTemplate('{"include_stats":false,"sections":["report"]}')
  check('解析模板 JSON', parsed.include_stats === false && parsed.sections.join(',') === 'report')
  check('非法 JSON 回退默认', parseSummaryTemplate('{bad').sections.length === 5)
  check('空字符串回退默认', parseSummaryTemplate('').sections.length === 5)
  check('parse 结果与原对象隔离', parseSummaryTemplate('{"sections":["report"]}').sections !== DEFAULT_SUMMARY_TEMPLATE.sections)
}

// ---------- 内容归一化 ----------
{
  const empty = emptySummaryContent()
  check('空内容包含五章节', empty.sections.length === 5)
  check('空内容带默认备注', empty.note === DEFAULT_SUMMARY_NOTE)
  const normalized = normalizeSummaryContent({
    sections: [
      {
        key: 'routine',
        title: '旧标题',
        items: [
          {
            id: 'manual-1',
            title: '手动事项',
            description: '描述',
            date: '2026-10-08',
            source: 'manual'
          }
        ]
      }
    ],
    note: '自定义备注'
  })
  check('归一化补全为五章节', normalized.sections.length === 5)
  check('归一化使用标准章节标题', normalized.sections[0].title === '例行工作')
  check('归一化保留已有事项', normalized.sections[0].items.length === 1)
  check('归一化保留备注', normalized.note === '自定义备注')
  check('归一化空内容', normalizeSummaryContent(null).sections.length === 5)
}

// ---------- 可见章节 ----------
{
  const content = buildSummaryContent(events, OCT, NOW)
  const t = normalizeSummaryTemplate({ sections: ['routine', 'report'] })
  const vis = visibleSections(content, t)
  check('可见章节遵守模板', vis.map((s) => s.key).join(',') === 'routine,report')
  check('空章节不进入可见列表', visibleSections(content, normalizeSummaryTemplate({ sections: ['coordination'] })).length === 1)
  const noItems = visibleSections(buildSummaryContent([], OCT, NOW), DEFAULT_SUMMARY_TEMPLATE)
  check('全部为空时可见章节为空', noItems.length === 0)
}

// ---------- 纯文本导出 ----------
{
  const content = buildSummaryContent(events, OCT, NOW, (id) => (id === 8 ? '金敏俊' : undefined))
  const template = normalizeSummaryTemplate({
    include_stats: true,
    include_note: true,
    sections: ['routine', 'coordination', 'meeting', 'meeting_notice', 'report']
  })
  const payload: SummaryExportPayload = {
    title: rangeTitle(OCT),
    rangeStart: OCT.start,
    rangeEnd: OCT.end,
    periodLabel: rangeSpanText(OCT),
    stats: summaryStats(events, OCT, NOW),
    sections: visibleSections(content, template),
    note: content.note,
    template,
    generatedAt: '2026-10-21 12:30'
  }
  const text = renderSummaryText(payload)
  check('文本首行为纲要标题', text.split('\n')[0] === '2026年10月工作内容纲要')
  check('文本第二行为统计周期', text.split('\n')[1] === '统计周期:2026年10月1日 - 10月31日')
  check(
    '文本含五项统计',
    text.includes(
      '完成工作项 3 项 · 参加会议 1 场 · 会议通知 1 场 · 对接事项 1 项 · 输出报告 1 份'
    )
  )
  check(
    '文本章节使用中文序号',
    text.includes('一、例行工作') &&
      text.includes('四、会议通知') &&
      text.includes('五、报告与材料输出')
  )
  check('文本包含会议参与与会议通知两类会议', text.includes('部门例会') && text.includes('换季协调会'))
  check('文本会议通知写明通知对象', text.includes('通知张三参加「换季协调会」'))
  check('文本事项两位编号', text.includes('01. 整理值班记录'))
  check('文本事项含描述', text.includes('01. 整理值班记录 — 完成每日值班记录整理'))
  check('文本含备注', text.includes(`备注:${DEFAULT_SUMMARY_NOTE}`))
  check('文本末尾含生成时间', text.trimEnd().endsWith('生成时间:2026-10-21 12:30'))

  const noStats = renderSummaryText({
    ...payload,
    template: { ...template, include_stats: false }
  })
  check('关闭统计后不含统计行', !noStats.includes('完成工作项 3 项'))

  const noNote = renderSummaryText({ ...payload, template: { ...template, include_note: false } })
  check('关闭备注后不含备注', !noNote.includes('备注:'))

  const filtered = renderSummaryText({
    ...payload,
    template: { ...template, sections: ['routine'] },
    sections: visibleSections(content, normalizeSummaryTemplate({ sections: ['routine'] }))
  })
  check('模板关闭的章节不导出', !filtered.includes('会议参与') && !filtered.includes('对接协调'))

  const emptyText = renderSummaryText({
    ...payload,
    sections: [],
    stats: { completed: 0, meetings: 0, meeting_notices: 0, contacts: 0, reports: 0 }
  })
  check('无事项时导出提示', emptyText.includes('(本期暂无已完成事项)'))
}

// ---------- 汇总 ----------
console.log(`\n工作纲要测试:${passed} 通过,${failed} 失败`)
if (failed > 0) {
  console.log('失败项:\n' + failureDetails.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
