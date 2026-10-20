import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'

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

  // 验收截图模式:SCREENSHOT_PATH 指定输出路径时,页面加载完成后自动截图并退出,
  // 同时导出 DOM 状态快照(截图旁同名 .dom.json),供验收程序化校验使用
  const screenshotPath = process.env.SCREENSHOT_PATH
  if (screenshotPath) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage()
          writeFileSync(screenshotPath, image.toPNG())
          console.log(`[screenshot] saved to ${screenshotPath}`)
          const dom = await win.webContents.executeJavaScript(`JSON.stringify({
            title: document.title,
            url: location.href,
            navItems: document.querySelectorAll('.el-menu-item').length,
            activeNav: document.querySelector('.el-menu-item.is-active')?.textContent?.trim() ?? null,
            heading: document.querySelector('.app-header__title')?.textContent?.trim() ?? null,
            bodyText: document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)
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
  ipcMain.handle('app:version', () => app.getVersion())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
