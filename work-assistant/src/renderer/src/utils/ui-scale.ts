/**
 * 整体缩放纯逻辑(设置页「字体大小」,采用整体缩放方案):
 * 字体/控件/面板按同一比例缩放,通过 CSS zoom 作用于 <html>,浏览器按比例重排,不会错位。
 * 档位:小 90% / 标准 100% / 大 110% / 特大 120%;设置表存字符串,应用启动时读取并应用。
 */
export interface UiScaleOption {
  key: string
  label: string
  /** CSS zoom 值 */
  zoom: number
}

export const UI_SCALE_OPTIONS: UiScaleOption[] = [
  { key: 'small', label: '小', zoom: 0.9 },
  { key: 'normal', label: '标准', zoom: 1 },
  { key: 'large', label: '大', zoom: 1.1 },
  { key: 'xlarge', label: '特大', zoom: 1.2 }
]

export const DEFAULT_UI_ZOOM = 1
export const MIN_UI_ZOOM = 0.9
export const MAX_UI_ZOOM = 1.2

/** 归一化缩放值:空值视为未设置回退默认,非法/越界做钳制(设置表可被手改,做防御) */
export function normalizeUiZoom(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return DEFAULT_UI_ZOOM
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return DEFAULT_UI_ZOOM
  return Math.min(MAX_UI_ZOOM, Math.max(MIN_UI_ZOOM, n))
}

/** 档位文案:精确匹配档位返回「标准」等,否则返回百分比 */
export function uiScaleLabel(zoom: number): string {
  const found = UI_SCALE_OPTIONS.find((o) => Math.abs(o.zoom - zoom) < 0.001)
  return found ? found.label : `${Math.round(zoom * 100)}%`
}

export function uiScalePercent(zoom: number): number {
  return Math.round(normalizeUiZoom(zoom) * 100)
}

/** 应用到整个应用(html 元素 CSS zoom;浏览器环境函数,单测不覆盖) */
export function applyUiZoom(zoom: number): void {
  // 经 globalThis 取 document,避免纯逻辑编译环境(node,tsconfig.tests)依赖 DOM lib
  const doc = globalThis as unknown as { document?: { documentElement: { style: { zoom: string } } } }
  if (doc.document) doc.document.documentElement.style.zoom = String(normalizeUiZoom(zoom))
}
