import { expect, type Locator, type Page } from "@playwright/test";

export class LoginPage {
  readonly page: Page;
  readonly root: Locator;
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("login-page");
    this.form = page.getByTestId("login-form");
    this.emailInput = page.getByTestId("login-email-input");
    this.passwordInput = page.getByTestId("login-password-input");
    this.submitButton = page.getByTestId("login-submit-button");
  }

  async waitForReady() {
    await this.root.waitFor();
    await this.emailInput.waitFor();
  }

  async login(email: string, password: string) {
    await expect(this.emailInput).toBeEnabled();
    await this.fillCredentials(email, password);

    if (!(await this.submitButton.isEnabled())) {
      await this.page.waitForLoadState("networkidle");
      await this.fillCredentials(email, password);
    }

    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  private async fillCredentials(email: string, password: string) {
    await this.emailInput.click();
    await this.emailInput.fill(email);
    await expect(this.emailInput).toHaveValue(email);
    await this.passwordInput.fill(password);
    await expect(this.passwordInput).toHaveValue(password);
  }
}
