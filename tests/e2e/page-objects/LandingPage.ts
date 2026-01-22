import type { Locator, Page } from "@playwright/test"

export class LandingPage {
  readonly page: Page
  readonly root: Locator
  readonly loginCta: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId("landing-page")
    this.loginCta = page.getByTestId("landing-login-cta")
  }

  async goto() {
    await this.page.goto("/")
    await this.root.waitFor()
  }

  async openLogin() {
    await this.loginCta.click()
  }
}
