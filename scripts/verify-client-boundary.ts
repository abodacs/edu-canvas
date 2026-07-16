import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDirectory = fileURLToPath(
  new URL('../.output/public/', import.meta.url),
)
const forbiddenTokens = [
  'answerKey',
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'postgresql://',
]
const entries = await readdir(publicDirectory, { recursive: true })

for (const entry of entries) {
  const path = join(publicDirectory, entry)
  let contents: string
  try {
    contents = await readFile(path, 'utf8')
  } catch {
    continue
  }

  for (const token of forbiddenTokens) {
    if (contents.includes(token)) {
      throw new Error(`Client boundary violation: ${token} found in ${entry}.`)
    }
  }
}

console.log('PASS client bundle contains no server-only secret/key markers.')
