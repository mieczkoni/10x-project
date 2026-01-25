import type { Locator, Page } from "@playwright/test"

export class DashboardPage {
  readonly page: Page
  readonly createDeckButton: Locator

  constructor(page: Page) {
    this.page = page
    this.createDeckButton = page.getByTestId("dashboard-create-deck-button")
  }

  async waitForReady() {
    await this.createDeckButton.waitFor()
    await this.page.waitForLoadState("networkidle")
  }

  async openCreateDeckDialog() {
    await this.createDeckButton.click()
  }
}
