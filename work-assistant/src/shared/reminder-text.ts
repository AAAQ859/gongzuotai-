/**
 * 提醒文案纯函数(主进程引擎与渲染层提醒中心共用,有单测)。
 */

/** '2026-10-22 09:30' → '10月22日 09:30' */
export function fmtCn(dateStr: string): string {
  const [d, t] = dateStr.split(' ')
  const [, m, day] = d.split('-').map(Number)
  return `${m}月${day}日 ${t}`
}

/** 催办话术(PRD 场景:截止前点击复制,去微信/邮件催办)。deadlineCn 为已格式化的截止文案(如「10月21日 18:00」) */
export function followupScript(contactName: string, title: string, deadlineCn: string): string {
  return `${contactName},您好!「${title}」将于 ${deadlineCn} 截止,请尽快安排,谢谢!`
}
