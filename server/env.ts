import { existsSync } from 'node:fs'
import path from 'node:path'

let hasAttemptedEnvLoad = false

export function loadLocalEnvFileIfPresent() {
  if (hasAttemptedEnvLoad) {
    return
  }

  hasAttemptedEnvLoad = true

  if (typeof process.loadEnvFile !== 'function') {
    return
  }

  const localEnvFilePath = path.resolve(process.cwd(), '.env.local')

  if (!existsSync(localEnvFilePath)) {
    return
  }

  process.loadEnvFile(localEnvFilePath)
}
