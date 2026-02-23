import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8')

const collectTsxFiles = (relativeDir: string): string[] => {
  const absoluteDir = path.join(repoRoot, relativeDir)
  const results: string[] = []

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const nextPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(nextPath)
        continue
      }
      if (entry.isFile() && nextPath.endsWith('.tsx')) {
        results.push(path.relative(repoRoot, nextPath))
      }
    }
  }

  walk(absoluteDir)
  return results.sort()
}

const manualModalPattern = /modal-backdrop|role="dialog"/g
const rawPillSpanPattern =
  /<span[^>]*className=(?:(?:["'`])pill(?:\s|--)|(?:\{[^>]*["'`]pill(?:\s|--)))/g
const strictMigratedRawTagPattern = /<(article|table|button|input|textarea|select|label)\b/g
const readTabRawLayoutPattern = /<(article|table)\b/g

const phase4ReadTabs = [
  'src/components/DashboardTab.tsx',
  'src/components/GoalsTab.tsx',
  'src/components/PlanningTab.tsx',
]

const strictMigratedFiles = [
  'src/components/PwaUpdateToast.tsx',
  'src/components/AccountsTab.tsx',
  'src/components/CardsTab.tsx',
  'src/components/BillsTab.tsx',
  'src/components/IncomeTab.tsx',
  'src/components/PurchasesTab.tsx',
  'src/components/LoansTab.tsx',
  'src/components/ReconcileTab.tsx',
  'src/components/SettingsTab.tsx',
  'src/components/PrintReportModal.tsx',
  'src/components/PrintReport.tsx',
]

const findMatches = (content: string, pattern: RegExp) => [...content.matchAll(new RegExp(pattern.source, pattern.flags))]

describe('UI migration regression checks', () => {
  it('does not reintroduce manual modal backdrops/role-dialog markup outside shadcn ui components', () => {
    const filesToScan = ['src/App.tsx', ...collectTsxFiles('src/components').filter((file) => !file.includes('/ui/'))]
    const failures: string[] = []

    for (const file of filesToScan) {
      const content = read(file)
      const matches = findMatches(content, manualModalPattern)
      if (matches.length > 0) {
        failures.push(`${file}: ${matches.map((match) => match[0]).join(', ')}`)
      }
    }

    expect(
      failures,
      `Manual modal markup should use shadcn Dialog.\n${failures.join('\n')}`,
    ).toEqual([])
  })

  it('keeps Phase 4 read tabs on shared read primitives for cards/tables/pills', () => {
    const failures: string[] = []

    for (const file of phase4ReadTabs) {
      const content = read(file)
      if (findMatches(content, readTabRawLayoutPattern).length > 0) {
        failures.push(`${file}: contains raw <article> or <table>`)
      }
      if (findMatches(content, rawPillSpanPattern).length > 0) {
        failures.push(`${file}: contains raw pill <span>`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  it('keeps Phase 5-6 targets on shared wrappers (no raw form/table/button/article tags)', () => {
    const failures: string[] = []

    for (const file of strictMigratedFiles) {
      const content = read(file)
      if (findMatches(content, strictMigratedRawTagPattern).length > 0) {
        failures.push(`${file}: contains raw migrated tag`)
      }
      if (findMatches(content, rawPillSpanPattern).length > 0) {
        failures.push(`${file}: contains raw pill <span>`)
      }
    }

    expect(failures, failures.join('\n')).toEqual([])
  })

  it('keeps removed legacy shell/modal/toast CSS blocks out of App.css', () => {
    const css = read('src/App.css')

    expect(css).not.toMatch(/^\.dashboard\s*\{/m)
    expect(css).not.toMatch(/^\.modal-backdrop\s*\{/m)
    expect(css).not.toMatch(/^\.pwa-update-toast(?:__[a-z-]+)?\s*\{/m)
  })
})
