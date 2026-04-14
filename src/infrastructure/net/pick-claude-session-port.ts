import net from 'node:net'

/**
 * 为本机临时选取一个空闲 TCP 端口（绑定后立即释放）。
 * 用于生成 `agent-{port}` 形式的 Agent ID，并在拉起 Claude Code 时通过环境变量传入同一端口。
 */
export function pickClaudeSessionPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      try {
        const addr = server.address()
        const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0
        if (!port) {
          server.close(() => reject(new Error('pickClaudeSessionPort: invalid address')))
          return
        }
        server.close((err) => {
          if (err) reject(err)
          else resolve(port)
        })
      } catch (e) {
        server.close(() => reject(e))
      }
    })
  })
}
