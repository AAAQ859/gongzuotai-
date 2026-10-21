import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { initDatabase } from './db/database'
import { registerIpc } from './ipc'
import * as reminderEngine from './reminders/engine'

// 验收截图模式可指定独立数据目录(SCREENSHOT_USERDATA),用于演示数据验收,不污染真实用户数据
if (process.env.SCREENSHOT_USERDATA) {
  app.setPath('userData', process.env.SCREENSHOT_USERDATA)
}
// 截图验收时可将「文档」目录也指向隔离位置(SCREENSHOT_DOCUMENTS),
// 避免新建板块的默认文件夹写入真实 文档\工作台助手
if (process.env.SCREENSHOT_DOCUMENTS) {
  app.setPath('documents', process.env.SCREENSHOT_DOCUMENTS)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: '工作台助手',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // 缩放唯一入口是设置页「字体大小」(CSS zoom):禁用 Ctrl+滚轮/Ctrl+加减号页面缩放,
  // 避免页面被放大后视口变小、固定宽度面板互相挤压
  win.webContents.setVisualZoomLevelLimits(1, 1)

  // 验收截图模式可指定窗口尺寸(SCREENSHOT_WINDOW="1024x700"),用于小窗口自适应验收
  const screenshotWindow = process.env.SCREENSHOT_WINDOW
  if (screenshotWindow) {
    const [w, h] = screenshotWindow.split('x').map(Number)
    if (w > 0 && h > 0) win.setSize(w, h)
  }

  // 验收截图模式:SCREENSHOT_PATH 指定输出路径时,页面加载完成后自动截图并退出,
  // 同时导出 DOM 状态快照(截图旁同名 .dom.json),供验收程序化校验使用
  // 可选 SCREENSHOT_ROUTE 指定截图的路由(如 #/settings);
  // 可选 SCREENSHOT_SCRIPT 指定截图前在页面执行的脚本(如打开对话框)
  const screenshotPath = process.env.SCREENSHOT_PATH
  const screenshotRoute = process.env.SCREENSHOT_ROUTE
  const screenshotScript = process.env.SCREENSHOT_SCRIPT
  if (screenshotPath) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          if (screenshotRoute) {
            await win.webContents.executeJavaScript(
              `location.hash = ${JSON.stringify(screenshotRoute)}`
            )
            await new Promise((r) => setTimeout(r, 800))
          }
          if (screenshotScript) {
            await win.webContents.executeJavaScript(screenshotScript)
            await new Promise((r) => setTimeout(r, 800))
          }
          const image = await win.webContents.capturePage()
          writeFileSync(screenshotPath, image.toPNG())
          console.log(`[screenshot] saved to ${screenshotPath}`)
          const dom = await win.webContents.executeJavaScript(`JSON.stringify({
            title: document.title,
            url: location.href,
            navItems: document.querySelectorAll('.el-menu-item').length,
            activeNav: document.querySelector('.el-menu-item.is-active')?.textContent?.trim() ?? null,
            heading: document.querySelector('.app-header__title')?.textContent?.trim() ?? null,
            bodyText: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 800)
          })`)
          writeFileSync(screenshotPath.replace(/\.png$/, '.dom.json'), dom)
          console.log('[dom-check] saved')
        } catch (err) {
          console.error('[screenshot] failed:', err)
        } finally {
          app.quit()
        }
      }, 1500)
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // 初始化本地数据库(userData/db/work-assistant.db)+ 注册 IPC
  initDatabase(app.getPath('userData'))
  registerIpc()

  ipcMain.handle('app:version', () => app.getVersion())

  createWindow()

  // 提醒引擎:回填事件提醒行并开始定时检查(板块 06)
  reminderEngine.startEngine(() => BrowserWindow.getAllWindows()[0] ?? null)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
