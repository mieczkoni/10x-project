import { expect, test } from "./fixtures";

import { CreateDeckDialog } from "./page-objects/CreateDeckDialog";
import { DashboardPage } from "./page-objects/DashboardPage";
import { LandingPage } from "./page-objects/LandingPage";
import { LoginPage } from "./page-objects/LoginPage";

function getRequiredEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }
  throw new Error(`Missing credentials in .env.test. Set one of: ${keys.join(", ")}`);
}

test("user can create a deck from dashboard", async ({ page }) => {
  const userEmail = getRequiredEnv("E2E_USERNAME");
  const userPassword = getRequiredEnv("E2E_PASSWORD");
  const deckName = `E2E Deck ${Date.now()}`;
  const deckDescription = "Created by Playwright e2e";

  const landingPage = new LandingPage(page);
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const createDeckDialog = new CreateDeckDialog(page);

  // Arrange
  await landingPage.goto();

  // Act
  await landingPage.openLogin();
  await loginPage.waitForReady();
  await loginPage.login(userEmail, userPassword);
  await dashboardPage.waitForReady();
  await dashboardPage.openCreateDeckDialog();
  await createDeckDialog.waitForOpen();
  await createDeckDialog.createDeck(deckName, deckDescription);

  // Assert
  await expect(createDeckDialog.dialog).toBeHidden();
  await expect(page.getByRole("link", { name: deckName })).toBeVisible();
});
