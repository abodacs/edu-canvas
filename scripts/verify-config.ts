import { readServerConfig, safeConfigSummary } from '@/server/config'

const config = readServerConfig(process.env)
console.log(JSON.stringify(safeConfigSummary(config), null, 2))

if (config.issues.length > 0) {
  process.exitCode = 1
}
