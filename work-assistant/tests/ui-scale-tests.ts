/**
 * 字体大小(整体缩放)纯逻辑验收测试(utils/ui-scale.ts)。
 * 运行方式:npm run test:ui-scale
 * 覆盖:档位表完整性、归一化(非法/越界/边界/合法)、档位文案、百分比。
 * applyUiZoom 依赖浏览器 document,由截图验收覆盖,不进单测。
 */
import {
  DEFAULT_UI_ZOOM,
  MAX_UI_ZOOM,
  MIN_UI_ZOOM,
  UI_SCALE_OPTIONS,
  normalizeUiZoom,
  uiScaleLabel,
  uiScalePercent
} from '../src/renderer/src/utils/ui-scale'

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

// ---------- 档位表 ----------
check('档位表含四档', UI_SCALE_OPTIONS.length === 4)
check('档位顺序 小→特大 且缩放递增', UI_SCALE_OPTIONS.every((o, i, a) => i === 0 || o.zoom > a[i - 1].zoom))
check('标准档 zoom=1', UI_SCALE_OPTIONS.find((o) => o.key === 'normal')?.zoom === 1)
check('档位 key 唯一', new Set(UI_SCALE_OPTIONS.map((o) => o.key)).size === UI_SCALE_OPTIONS.length)
check('档位均在 0.9-1.2 区间', UI_SCALE_OPTIONS.every((o) => o.zoom >= MIN_UI_ZOOM && o.zoom <= MAX_UI_ZOOM))

// ---------- 归一化 ----------
check('字符串 "1.2" → 1.2', normalizeUiZoom('1.2') === 1.2)
check('字符串 "1" → 1', normalizeUiZoom('1') === 1)
check('数字 1.1 → 1.1', normalizeUiZoom(1.1) === 1.1)
check('null/undefined → 默认 1', normalizeUiZoom(null) === 1 && normalizeUiZoom(undefined) === 1)
check('空串 → 默认 1', normalizeUiZoom('') === 1)
check('非数字字符串 → 默认 1', normalizeUiZoom('abc') === 1)
check('越界 2.5 → 钳制 1.2', normalizeUiZoom('2.5') === MAX_UI_ZOOM)
check('越界 0.5 → 钳制 0.9', normalizeUiZoom('0.5') === MIN_UI_ZOOM)
check('边界 0.9 保持', normalizeUiZoom(0.9) === 0.9)
check('边界 1.2 保持', normalizeUiZoom(1.2) === 1.2)
check('负值 → 钳制 0.9', normalizeUiZoom(-1) === MIN_UI_ZOOM)
check('NaN → 默认 1', normalizeUiZoom(NaN) === DEFAULT_UI_ZOOM)
check('Infinity → 默认 1', normalizeUiZoom(Infinity) === DEFAULT_UI_ZOOM)

// ---------- 文案与百分比 ----------
check('档位文案:0.9 → 小', uiScaleLabel(0.9) === '小')
check('档位文案:1 → 标准', uiScaleLabel(1) === '标准')
check('档位文案:1.1 → 大', uiScaleLabel(1.1) === '大')
check('档位文案:1.2 → 特大', uiScaleLabel(1.2) === '特大')
check('非档位值文案回退百分比', uiScaleLabel(1.15) === '115%')
check('百分比换算 0.9 → 90', uiScalePercent(0.9) === 90)
check('百分比换算 1.1 → 110', uiScalePercent(1.1) === 110)
check('百分比换算越界值先归一', uiScalePercent(2) === 120)

console.log(`\nui-scale: ${passed} passed, ${failed} failed`)
if (failed) {
  console.error('FAILED:\n' + failureDetails.join('\n'))
  process.exit(1)
}
