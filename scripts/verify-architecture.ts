import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readDemoSnapshot } from '@/server/demo/read-model'
import { demoSnapshotSchema } from '@/shared/demo-contract.schema'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = join(projectRoot, 'src')
const sourceExtensions = new Set(['.ts', '.tsx'])
const importPattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g
const globalStateModules = new Set([
  'jotai',
  'mobx',
  'redux',
  'valtio',
  'zustand',
  '@reduxjs/toolkit',
])
const globalStateCalls = /\b(createStore|configureStore|createSlice)\s*\(/
const globalStateFile = /(?:^|\/)(store|global-state|app-state)\.(?:ts|tsx)$/

type SourceScope =
  'components' | 'lib' | 'routes' | 'server' | 'shared' | 'other'

async function listSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(entryPath)))
      continue
    }

    if (sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath)
    }
  }

  return files
}

function sourceScope(filePath: string): SourceScope {
  const pathFromSource = relative(sourceRoot, filePath)
  const topLevel = pathFromSource.split(sep)[0]

  if (
    topLevel === 'components' ||
    topLevel === 'lib' ||
    topLevel === 'routes' ||
    topLevel === 'server' ||
    topLevel === 'shared'
  ) {
    return topLevel
  }

  return 'other'
}

function resolveSourceImport(
  importer: string,
  specifier: string,
): string | undefined {
  let candidate: string
  if (specifier.startsWith('@/')) {
    candidate = join(sourceRoot, specifier.slice(2))
  } else if (specifier.startsWith('#/')) {
    candidate = join(sourceRoot, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    candidate = resolve(dirname(importer), specifier)
  } else {
    return undefined
  }

  const candidates = [
    candidate,
    candidate + '.ts',
    candidate + '.tsx',
    candidate + '.js',
    candidate + '.jsx',
    join(candidate, 'index.ts'),
    join(candidate, 'index.tsx'),
  ]

  return candidates.find((path) => existsSync(path))
}

function checkImportRules(
  importer: string,
  specifier: string,
  importedFile: string | undefined,
  issues: string[],
): void {
  const importerScope = sourceScope(importer)
  const importedScope = importedFile ? sourceScope(importedFile) : undefined

  if (
    importerScope === 'shared' &&
    (importedScope === 'server' ||
      importedScope === 'routes' ||
      importedScope === 'components')
  ) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        relative(projectRoot, importedFile ?? specifier) +
        '; shared modules cannot depend on runtime modules.',
    )
  }

  if (
    importerScope === 'shared' &&
    (specifier.startsWith('node:') ||
      specifier === 'postgres' ||
      specifier.startsWith('postgres/'))
  ) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        specifier +
        '; shared modules must remain browser-safe.',
    )
  }

  if (
    importerScope === 'components' &&
    (importedScope === 'server' ||
      importedScope === 'routes' ||
      importedScope === 'other')
  ) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        relative(projectRoot, importedFile ?? specifier) +
        '; UI modules cannot own runtime or delivery behavior.',
    )
  }

  if (
    importerScope === 'server' &&
    (importedScope === 'routes' || importedScope === 'components')
  ) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        relative(projectRoot, importedFile ?? specifier) +
        '; server modules cannot depend on delivery or UI modules.',
    )
  }

  if (
    importerScope === 'routes' &&
    importedScope === 'server' &&
    !specifier.endsWith('.server') &&
    !specifier.endsWith('/server-function')
  ) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        specifier +
        '; routes may cross only named delivery seams.',
    )
  }

  if (globalStateModules.has(specifier)) {
    issues.push(
      relative(projectRoot, importer) +
        ' imports ' +
        specifier +
        '; global mutable state needs an explicit owner and decision record.',
    )
  }
}

async function checkSourceStructure(files: string[]): Promise<string[]> {
  const issues: string[] = []

  for (const file of files) {
    const contents = await readFile(file, 'utf8')
    const pathFromSource = relative(sourceRoot, file)

    if (globalStateFile.test(pathFromSource)) {
      issues.push(
        pathFromSource +
          ' looks like an unowned global-state module; keep state local or document its owner.',
      )
    }

    if (globalStateCalls.test(contents)) {
      issues.push(
        pathFromSource +
          ' creates a global store; state ownership must be explicit before adding one.',
      )
    }

    for (const match of contents.matchAll(importPattern)) {
      const specifier = match[1]
      if (!specifier) continue

      checkImportRules(
        file,
        specifier,
        resolveSourceImport(file, specifier),
        issues,
      )
    }
  }

  return issues
}

async function checkPublicContract(): Promise<string[]> {
  const snapshot = await readDemoSnapshot('student', {})
  const result = demoSnapshotSchema.safeParse(snapshot)
  const issues: string[] = []

  if (!result.success) {
    issues.push(
      'the seeded demo snapshot does not satisfy the shared runtime contract: ' +
        result.error.message,
    )
  }

  if (JSON.stringify(snapshot).includes('answerKey')) {
    issues.push('the public demo snapshot contains the private answer key.')
  }

  return issues
}

const files = await listSourceFiles(sourceRoot)
const issues = [
  ...(await checkSourceStructure(files)),
  ...(await checkPublicContract()),
]

if (issues.length > 0) {
  console.error('FAIL architecture harness')
  for (const issue of issues) {
    console.error('- ' + issue)
  }
  process.exitCode = 1
} else {
  console.log(
    'PASS architecture harness: layer imports, state ownership, and public contract are intact.',
  )
}
