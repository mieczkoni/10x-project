import { expect, test as base } from "@playwright/test"
import fs from "node:fs/promises"
import path from "node:path"

const coverageDir = path.resolve(process.cwd(), "coverage/e2e")

export const test = base.extend({})

test.beforeEach(async ({ page }) => {
  if (!process.env.PLAYWRIGHT_COVERAGE) {
    return
  }

  await page.coverage.startJSCoverage({ resetOnNavigation: false })
})

test.afterEach(async ({ page }, testInfo) => {
  if (!process.env.PLAYWRIGHT_COVERAGE) {
    return
  }

  const coverage = await page.coverage.stopJSCoverage()
  await fs.mkdir(coverageDir, { recursive: true })

  const safeTitle = testInfo.titlePath
    .join(" ")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")

  const outputPath = path.join(
    coverageDir,
    `${safeTitle}-${testInfo.retry}.json`
  )

  await fs.writeFile(outputPath, JSON.stringify(coverage))
})

export { expect }
