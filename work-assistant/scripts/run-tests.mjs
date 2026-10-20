/**
 * 在 Electron 内置 Node 环境中运行数据库测试。
 * 必须使用应用同款运行时(node:sqlite 与 FTS5 行为与系统 Node 可能不一致)。
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

// electron npm 包在纯 Node 下 require 返回二进制路径字符串
const electronPath = require('electron')

const testEntry = fileURLToPath(new URL('../dist-tests/tests/db-tests.js', import.meta.url))

const result = spawnSync(electronPath, [testEntry], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1'
  }
})

process.exit(result.status ?? 1)
