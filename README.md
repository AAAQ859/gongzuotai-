# 工作台助手 (Work Assistant)

离线桌面工作管理与提醒应用 — 为工作交接期设计的个人工作台,整合日程提醒、月度时间轴、文件板块管理和会议日历等核心能力,做到 **不遗漏、不延迟、文件可追溯**。

- 产品需求文档:[docs/prd/work-assistant-prd.html](docs/prd/work-assistant-prd.html)
- 技术栈:**Electron + Vue 3 + TypeScript + Element Plus + SQLite**(纯离线,数据本地存储)

## 目录结构

```
工作台/
├── docs/
│   ├── prd/            # 产品需求文档
│   └── acceptance/     # 各板块验收校验报告 + 验收截图
└── work-assistant/     # Electron 应用源码
```

## 开发流程约定

按板块逐模块开发。每个板块完成后:

1. 编写该板块的**验收校验报告**(`docs/acceptance/NN-板块名-验收报告.md`),列出验收项、检查方法与结果;
2. 按报告逐项执行验收检查(含界面截图、构建、功能验证);
3. 向用户呈现验收结果,经确认无误后再进入下一板块;
4. 每一步均提交 git 并推送远程仓库。

## 板块计划(按 PRD 三阶段)

| 板块 | 内容 | 阶段 |
|------|------|------|
| 00 | 项目脚手架与基础设施 | 一 |
| 01 | 数据库层与数据模型 | 一 |
| 02 | 仪表盘 | 一 |
| 03 | 日程日历 | 一 |
| 04 | 会议日历 | 一 |
| 05 | 联络接口 | 一 |
| 06 | 基础提醒系统(托盘 + 通知 + 调度) | 一 |
| 07 | 月度时间轴 | 二 |
| 08 | 文件板块 | 二 |
| 09 | 工作纲要导出 | 二 |
| 10 | 增强功能(全文检索 / 批量导入导出 / 高级提醒) | 三 |
| 11 | 打包发布 | 三 |
| 12 | 待办视图与例行事项(体验修正) | 三 |

## 安装与使用(正式版)

构建后的安装包位于 `work-assistant/dist/工作台助手-Setup-1.0.0.exe`(构建产物不纳入 git,需本地执行构建命令生成)。

1. 双击安装包。当前安装包**未做代码签名**,Windows SmartScreen 可能提示「Windows 已保护你的电脑」;点「更多信息」→「仍要运行」即可(应用完全离线,不联网)。
2. 按向导选择安装位置(默认当前用户目录,无需管理员权限),完成后自动创建**桌面快捷方式**与**开始菜单快捷方式**,可直接启动。
3. 安装版为单实例运行:重复双击快捷方式只会激活已打开的窗口;关闭窗口默认隐藏到系统托盘,提醒与月末检查继续运行,托盘菜单「退出」才真正结束进程。
4. 数据位置(重装、升级、卸载均保留):
   - 数据库:`%APPDATA%\work-assistant\db\work-assistant.db`
   - 文件板块与自动备份:`文档\工作台助手`
   - 安装版与开发版共用同一数据目录,可直接沿用开发阶段的数据。
5. 卸载:Windows「设置 → 应用 → 已安装的应用 → 工作台助手」。卸载默认**不删除**上述用户数据;如需彻底清除,请手动删除 `%APPDATA%\work-assistant` 与 `文档\工作台助手`。

## 构建安装包

```bash
cd work-assistant
npm install
npm run dist       # 类型检查 + 构建 + 生成 NSIS 安装包(dist/工作台助手-Setup-1.0.0.exe)
npm run dist:dir   # 仅生成免安装目录(dist/win-unpacked),用于验收
```

- 构建直接使用 `node_modules/electron/dist` 中已安装的 Electron 运行时,无需联网下载。
- electron-builder 的 NSIS/winCodeSign 工具会缓存在 `%LOCALAPPDATA%\electron-builder\Cache`,首次构建需可访问 GitHub 或提前放好缓存。
- 安装包为 x64、当前用户安装(`asInvoker`,不弹 UAC)、简体中文向导。

## 本地开发

```bash
cd work-assistant
npm install
npm run dev      # 开发模式(热更新)
npm run build    # 类型检查 + 构建
npm start        # 预览构建产物
```

也可直接双击仓库根目录的 `启动应用.bat`(等价于 `npm run dev`)。

## 验收截图

开发模式下可用 `SCREENSHOT_PATH` 环境变量让应用启动后自动截取主窗口并退出:

```bash
cd work-assistant && npm run build
SCREENSHOT_PATH="C:/Users/Administrator/Desktop/工作台/docs/acceptance/screenshots/xx.png" npx electron .
```
