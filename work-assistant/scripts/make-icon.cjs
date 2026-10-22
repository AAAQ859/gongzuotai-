/**
 * 生成应用图标(构建资源,一次性脚本):
 * 1024×1024 品牌图标(青绿渐变圆角方块 + 白色 W)→ build/icon.png 与多尺寸 build/icon.ico。
 * 运行:node scripts/run.mjs "<electron.exe>" "<本脚本绝对路径>"
 */
const { app, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const SIZE = 1024
const RADIUS = SIZE * 0.22
const MARGIN = SIZE * 0.02

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function insideRounded(x, y) {
  const left = MARGIN
  const right = SIZE - MARGIN
  const cx = Math.min(Math.max(x, left + RADIUS), right - RADIUS)
  const cy = Math.min(Math.max(y, left + RADIUS), right - RADIUS)
  return Math.hypot(x - cx, y - cy) <= RADIUS
}

function buildBitmap() {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  // 与托盘图标同源的 W 折线,按 1024 画布缩放
  const k = SIZE / 32
  const strokes = [
    [8, 10, 12, 22],
    [12, 22, 16, 12],
    [16, 12, 20, 22],
    [20, 22, 24, 10]
  ].map((p) => p.map((v) => v * k))
  const half = 2.2 * k

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4
      if (!insideRounded(x + 0.5, y + 0.5)) {
        buf[i] = 0
        buf[i + 1] = 0
        buf[i + 2] = 0
        buf[i + 3] = 0
        continue
      }
      // 纵向渐变:#12B886 → #0CA678
      const t = y / SIZE
      let r = Math.round(0x12 + (0x0c - 0x12) * t)
      let g = Math.round(0xb8 + (0xa6 - 0xb8) * t)
      let b = Math.round(0x86 + (0x78 - 0x86) * t)
      let white = 0
      for (const [x1, y1, x2, y2] of strokes) {
        const d = segmentDistance(x + 0.5, y + 0.5, x1, y1, x2, y2)
        if (d <= half) white = Math.max(white, Math.min(1, half - d + 2))
      }
      if (white > 0) {
        r = Math.round(r * (1 - white) + 255 * white)
        g = Math.round(g * (1 - white) + 255 * white)
        b = Math.round(b * (1 - white) + 255 * white)
      }
      // BGRA
      buf[i] = b
      buf[i + 1] = g
      buf[i + 2] = r
      buf[i + 3] = 255
    }
  }
  return buf
}

/** ICO(多尺寸,PNG 压缩):Windows Vista 及以上支持 */
function buildIco(images) {
  const count = images.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(count, 4)

  const entries = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  images.forEach((img, idx) => {
    const e = 16 * idx
    entries[e] = img.size >= 256 ? 0 : img.size
    entries[e + 1] = img.size >= 256 ? 0 : img.size
    entries[e + 2] = 0
    entries[e + 3] = 0
    entries.writeUInt16LE(1, e + 4)
    entries.writeUInt16LE(32, e + 6)
    entries.writeUInt32LE(img.png.length, e + 8)
    entries.writeUInt32LE(offset, e + 12)
    offset += img.png.length
  })
  return Buffer.concat([header, entries, ...images.map((i) => i.png)])
}

app.whenReady().then(() => {
  const buf = buildBitmap()
  const base = nativeImage.createFromBitmap(buf, { width: SIZE, height: SIZE })
  if (base.isEmpty()) throw new Error('图标位图生成失败')

  const buildDir = resolve(__dirname, '..', 'build')
  mkdirSync(buildDir, { recursive: true })

  const png512 = base.resize({ width: 512, height: 512, quality: 'best' }).toPNG()
  writeFileSync(join(buildDir, 'icon.png'), png512)
  console.log(`[icon] icon.png ${png512.length} bytes`)

  const icoSizes = [16, 24, 32, 48, 64, 128, 256]
  const images = icoSizes.map((size) => ({
    size,
    png: base.resize({ width: size, height: size, quality: 'best' }).toPNG()
  }))
  const ico = buildIco(images)
  writeFileSync(join(buildDir, 'icon.ico'), ico)
  console.log(`[icon] icon.ico ${ico.length} bytes (${icoSizes.join('/')})`)
  app.quit()
})
