/**
 * 启动包装脚本:剥离 ELECTRON_RUN_AS_NODE 环境变量后执行命令。
 *
 * 原因:部分 Windows 机器系统环境中存在 ELECTRON_RUN_AS_NODE=1,
 * 会让 Electron 以纯 Node 模式启动(require('electron') 失效、窗口无法创建)。
 * 该变量按"存在即生效"判断,必须整体删除而非置空。
 *
 * 用法:node scripts/run.mjs <命令> [参数...]
 */
delete process.env.ELECTRON_RUN_AS_NODE

const [cmd, ...args] = process.argv.slice(2)

if (!cmd) {
  console.error('用法: node scripts/run.mjs <命令> [参数...]')
  process.exit(1)
}

const { spawnSync } = await import('node:child_process')

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  // Windows 下 npm 命令是 .cmd 批处理,需要 shell 包装;env 显式传入已剥离变量的环境
  shell: process.platform === 'win32',
  env: process.env
})

process.exit(result.status ?? 1)
