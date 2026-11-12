import { expect, test } from "@playwright/test";

const APP = "/?mock=1&onboarded=1#codex,lang=zh";

test.beforeEach(async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: "供應商 OpenCode Go" })).toBeVisible();
});

test("API Key stays masked until explicitly revealed", async ({ page }) => {
  const row = page.getByRole("row", { name: "供應商 OpenCode Go" });
  await row.getByRole("button", { name: "編輯", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "編輯供應商 · Codex" })).toBeVisible();
  const key = dialog.getByLabel("API Key");
  await expect(key).toHaveValue("");
  await expect(key).toHaveAttribute("type", "password");
  await expect(key).toHaveAttribute("placeholder", "••••9f2a");
  await expect(dialog).not.toContainText("sk-zen-8f31c0d9f2a");

  await dialog.getByRole("button", { name: "查看", exact: true }).click();
  await expect(key).toHaveValue("sk-zen-8f31c0d9f2a");
  await expect(key).toHaveAttribute("type", "text");
});

test("API Key can be explicitly cleared without rewriting other fields", async ({ page }) => {
  const row = page.getByRole("row", { name: "供應商 OpenCode Go" });
  await row.getByRole("button", { name: "編輯", exact: true }).click();

  let dialog = page.getByRole("dialog");
  const key = dialog.getByLabel("API Key");
  await dialog.getByRole("button", { name: "清除金鑰", exact: true }).click();
  await expect(key).toBeDisabled();
  await expect(key).toHaveAttribute("placeholder", "儲存後清除");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toBeHidden();

  await row.getByRole("button", { name: "編輯", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("API Key")).toHaveValue("");
  await expect(dialog.getByLabel("API Key")).toHaveAttribute("placeholder", "sk-...");
  await expect(dialog.getByRole("button", { name: "查看", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "清除金鑰", exact: true })).toHaveCount(0);
});

test("encrypted export requires a confirmed password", async ({ page }) => {
  await page.getByRole("button", { name: "匯出清單" }).click();

  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "加密匯出供應商" })).toBeVisible();
  await dialog.getByLabel("備份密碼").fill("correct horse battery");
  await dialog.getByLabel("再次輸入密碼").fill("different password");
  await dialog.getByRole("button", { name: "建立加密備份" }).click();
  await expect(dialog.getByText("兩次輸入的密碼不一致")).toBeVisible();

  await dialog.getByLabel("再次輸入密碼").fill("correct horse battery");
  await dialog.getByRole("button", { name: "建立加密備份" }).click();

  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "加密備份完成" })).toBeVisible();
  await expect(dialog.getByText(/已加密匯出 \d+ 個供應商/)).toBeVisible();
  await expect(dialog.getByText(/\.kumoswitch$/)).toBeVisible();
});

test("encrypted backup import opens the password flow", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup.kumoswitch",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"kumoswitch-export","version":1}'),
  });

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "匯入加密備份" })).toBeVisible();
  await expect(dialog.getByText("backup.kumoswitch")).toBeVisible();
  await dialog.getByLabel("備份密碼").fill("correct horse battery");
  await dialog.getByRole("button", { name: "解密並匯入" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText("已解密匯入 3 筆，略過 1 筆")).toBeVisible();
});

test("Command Code preview shows the intended non-destructive diff", async ({ page }) => {
  const row = page.getByRole("row", { name: "供應商 Command Code" });
  await row.getByRole("button", { name: "套用", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "套用「Command Code」到 Codex" }),
  ).toBeVisible();
  const diff = dialog.locator("pre.diff");
  await expect(diff).toContainText('model_provider = "command-code"');
  await expect(diff).toContainText("[model_providers.command-code]");
  await expect(diff).not.toContainText("sk-cc-77b21e4041d7");
  await expect(diff).not.toContainText("sk-zen-8f31c0d9f2a");
  await expect(diff).toContainText("••••41d7");
  await expect(diff).toContainText("••••9f2a");
  await expect(dialog.getByRole("button", { name: "確認套用" })).toBeVisible();
});
