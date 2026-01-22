import type { Locator, Page } from "@playwright/test"

export class CreateDeckDialog {
  readonly page: Page
  readonly dialog: Locator
  readonly nameInput: Locator
  readonly descriptionInput: Locator
  readonly submitButton: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByTestId("create-deck-dialog")
    this.nameInput = page.getByTestId("create-deck-name-input")
    this.descriptionInput = page.getByTestId("create-deck-description-input")
    this.submitButton = page.getByTestId("create-deck-submit-button")
  }

  async waitForOpen() {
    await this.dialog.waitFor()
  }

  async createDeck(name: string, description: string) {
    await this.nameInput.fill(name)
    await this.descriptionInput.fill(description)
    await this.submitButton.click()
  }
}
