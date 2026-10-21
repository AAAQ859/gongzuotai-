/**
 * 文件板块纯逻辑验收测试(src/shared/files.ts)。
 * 运行方式:npm run test:files
 * 覆盖:体积格式化、扩展名/类型判定、类型图标与标签、文件夹优先排序、
 *       相对路径拼接、面包屑、日期文案、正文命中片段、文件名匹配。
 */
import {
  breadcrumbSegments,
  extIcon,
  extLabel,
  extOf,
  formatFileDate,
  formatSize,
  isOfficeExt,
  isSearchableExt,
  isTextExt,
  joinRelative,
  nameMatches,
  snippetOf,
  sortFileEntries
} from '../src/shared/files'

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

// ---------- formatSize ----------
check('0 字节 → 0 B', formatSize(0) === '0 B')
check('890 字节 → 890 B', formatSize(890) === '890 B')
check('1023 字节仍按 B', formatSize(1023) === '1023 B')
check('1024 字节 → 1 KB', formatSize(1024) === '1 KB')
check('1536 字节 → 1.5 KB', formatSize(1536) === '1.5 KB')
check('102400 字节 → 100 KB(整数不显示 .0)', formatSize(102400) === '100 KB')
check('1048576 字节 → 1 MB', formatSize(1048576) === '1 MB')
check('1572864 字节 → 1.5 MB', formatSize(1572864) === '1.5 MB')
check('1073741824 字节 → 1 GB', formatSize(1073741824) === '1 GB')
check('负数按 0 处理', formatSize(-5) === '0 B')
check('小数四舍五入到整字节', formatSize(10.6) === '11 B')

// ---------- extOf ----------
check('扩展名小写化:DOCX → docx', extOf('季度报告.DOCX') === 'docx')
check('多点文件取最后一段:tar.gz → gz', extOf('备份.tar.gz') === 'gz')
check('无扩展名 → 空串', extOf('README') === '')
check('隐藏文件 .gitignore 不算扩展名', extOf('.gitignore') === '')
check('带路径的文件名按 basename 解析', extOf('C:\\工作\\计划.XLSX') === 'xlsx')
check('正斜杠路径同样解析', extOf('板块/说明.MD') === 'md')

// ---------- 类型判定 ----------
check('txt 为文本类', isTextExt('txt'))
check('MD 大写仍为文本类', isTextExt('MD'))
check('json 为文本类', isTextExt('json'))
check('xlsx 不是纯文本类', !isTextExt('xlsx'))
check('xlsx 为 Office 可提取类', isOfficeExt('xlsx'))
check('docx 为 Office 可提取类', isOfficeExt('docx'))
check('pdf 不属于 Office 可提取类', !isOfficeExt('pdf'))
check('文本类参与内容检索', isSearchableExt('csv'))
check('Office 类参与内容检索', isSearchableExt('docx'))
check('pdf 不参与内容检索(仅文件名)', !isSearchableExt('pdf'))
check('png 不参与内容检索', !isSearchableExt('png'))

// ---------- 图标与标签 ----------
check('pdf 图标 📕', extIcon('pdf') === '📕')
check('docx 图标 📄', extIcon('docx') === '📄')
check('xlsx 图标 📊', extIcon('xlsx') === '📊')
check('csv 图标 📊', extIcon('csv') === '📊')
check('pptx 图标 📽️', extIcon('pptx') === '📽️')
check('jpg 图标 🖼️', extIcon('jpg') === '🖼️')
check('zip 图标 🗜️', extIcon('zip') === '🗜️')
check('mp4 图标 🎬', extIcon('mp4') === '🎬')
check('mp3 图标 🎵', extIcon('mp3') === '🎵')
check('md 图标 📝', extIcon('md') === '📝')
check('未知类型图标 📎', extIcon('abc') === '📎')
check('大写扩展名同样出图标', extIcon('PDF') === '📕')
check('类型标签大写', extLabel('docx') === 'DOCX')
check('无扩展名标签为「文件」', extLabel('') === '文件')

// ---------- sortFileEntries ----------
const sorted = sortFileEntries([
  { name: 'b.txt', is_dir: false },
  { name: 'A文件夹', is_dir: true },
  { name: 'a.txt', is_dir: false },
  { name: 'B文件夹', is_dir: true }
])
check('文件夹排在文件前', sorted[0].is_dir && sorted[1].is_dir)
check('文件夹按名称升序(A/B)', sorted[0].name === 'A文件夹' && sorted[1].name === 'B文件夹')
check('文件按名称升序(a/b,不区分大小写)', sorted[2].name === 'a.txt' && sorted[3].name === 'b.txt')
const numericSorted = sortFileEntries([
  { name: '第10章.md', is_dir: false },
  { name: '第2章.md', is_dir: false }
])
check('名称数字按数值排序(第2章 < 第10章)', numericSorted[0].name === '第2章.md')
const original = [
  { name: 'z', is_dir: false },
  { name: 'a', is_dir: true }
]
sortFileEntries(original)
check('排序不修改原数组', original[0].name === 'z')

// ---------- joinRelative ----------
check('根目录拼接:直接返回文件名', joinRelative('', 'a.txt') === 'a.txt')
check('子目录拼接:x + y → x/y', joinRelative('x', 'y') === 'x/y')
check('去除首尾斜杠', joinRelative('/x/', '/y/') === 'x/y')
check('反斜杠统一为正斜杠', joinRelative('x\\y', 'z.txt') === 'x/y/z.txt')
check('空名称返回当前路径', joinRelative('x/y', '') === 'x/y')

// ---------- breadcrumbSegments ----------
check('面包屑按斜杠拆分', breadcrumbSegments('客运部/月度报告').join('|') === '客运部|月度报告')
check('反斜杠路径同样拆分', breadcrumbSegments('a\\b\\c').join('|') === 'a|b|c')
check('根目录 → 空数组', breadcrumbSegments('').length === 0)
check('忽略多余斜杠与空白', breadcrumbSegments(' /a//b/ ').join('|') === 'a|b')

// ---------- formatFileDate ----------
const now = new Date(2026, 9, 21)
check('同年显示 M-D', formatFileDate('2026-10-05 09:30:00', now) === '10-5')
check('跨年显示 YYYY-M-D', formatFileDate('2025-12-31 23:00:00', now) === '2025-12-31')
check('无时间的纯日期可解析', formatFileDate('2026-01-02', now) === '1-2')
check('无法解析原样返回', formatFileDate('未知', now) === '未知')

// ---------- snippetOf ----------
const content = '本周工作重点:完成韩亚项目月度报告,并同步客运部对接人。'
const snip = snippetOf(content, '月度报告', 6)
check('正文命中返回片段', snip !== null && snip.includes('月度报告'))
check('片段带省略号(前后截断)', snip !== null && snip.startsWith('…') && snip.endsWith('…'))
check('关键词在开头时不加前省略号', snippetOf(content, '本周', 4)?.startsWith('…') === false)
check('关键词在结尾时不加后省略号', snippetOf(content, '对接人', 4)?.endsWith('…') === false)
check('未命中返回 null', snippetOf(content, '不存在的内容') === null)
check('空关键词返回 null', snippetOf(content, '  ') === null)
check('英文不区分大小写命中', snippetOf('Monthly Report 2026', 'monthly', 3) !== null)
check('连续空白归一为单空格', snippetOf('a\n\n  b\t关键词 c', '关键词', 5) === 'a b 关键词 c')

// ---------- nameMatches ----------
check('文件名包含关键词命中', nameMatches('月度报告.xlsx', '报告'))
check('英文不区分大小写', nameMatches('Monthly-Report.xlsx', 'monthly'))
check('不包含则不命中', !nameMatches('说明.txt', '报告'))
check('空关键词不命中', !nameMatches('说明.txt', '  '))

console.log(`\nfiles: ${passed} passed, ${failed} failed`)
if (failed) {
  console.error('FAILED:\n' + failureDetails.join('\n'))
  process.exit(1)
}
