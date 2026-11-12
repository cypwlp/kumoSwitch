import { expect, test } from "@playwright/test";

const APP = "/?mock=1&onboarded=1#codex,lang=zh";

test.beforeEach(async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" })).toBeVisible();
});

test("provider details show the model while keeping the API Key masked", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "供應商詳情 · Codex" })).toBeVisible();
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await expect(dialog.getByLabel("Model ID").first()).toHaveValue("glm-5.3-flash");
  await dialog.getByRole("tab", { name: "連線", exact: true }).click();
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
  const openProvider = page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" });
  await openProvider.click();

  let dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "連線", exact: true }).click();
  const key = dialog.getByLabel("API Key");
  await dialog.getByRole("button", { name: "清除金鑰", exact: true }).click();
  await expect(key).toBeDisabled();
  await expect(key).toHaveAttribute("placeholder", "儲存後清除");
  await dialog.getByRole("button", { name: "只儲存", exact: true }).click();
  await expect(dialog).toBeHidden();

  await openProvider.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "連線", exact: true }).click();
  await expect(dialog.getByLabel("API Key")).toHaveValue("");
  await expect(dialog.getByLabel("API Key")).toHaveAttribute("placeholder", "sk-...");
  await expect(dialog.getByRole("button", { name: "查看", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "清除金鑰", exact: true })).toHaveCount(0);
});

test("provider keeps multiple models and can switch the active model", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await dialog.getByRole("button", { name: "＋ 新增模型" }).click();

  const card = dialog.locator(".model-card").last();
  await card.getByLabel("Model ID").fill("deepseek-v4.1-flash");
  await card.getByLabel("模型顯示名稱").fill("DeepSeek v4.1");
  await card.getByLabel("Context window").fill("128000");
  await card.getByLabel("Max output").fill("16384");
  await card.getByLabel("Reasoning").selectOption("true");
  await card.getByRole("button", { name: "設為目前" }).click();
  await expect(card.getByText("目前模型")).toBeVisible();

  await dialog.getByRole("button", { name: "儲存並預覽" }).click();
  await expect(page.getByRole("heading", { name: /套用「OpenCode Go」到 Codex/ })).toBeVisible();
});

test("each model can be tested and quickly switched without the full editor", async ({ page }) => {
  const openProvider = page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" });
  await openProvider.click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();

  await dialog.getByRole("button", { name: "測試模型 glm-5.3-flash" }).click();
  await expect(dialog.getByText(/最近 100% · 平均 \d+ms · 200/)).toBeVisible();

  await dialog.getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toBeHidden();
  await openProvider.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await expect(dialog.getByText(/最近 100% · 平均 \d+ms · 200/)).toBeVisible();

  const model = dialog.getByRole("article", { name: "模型 muse-spark-1.3" });
  await model.getByRole("button", { name: "切換並預覽" }).click();
  await expect(page.getByRole("heading", { name: "套用「OpenCode Go」到 Codex" })).toBeVisible();
  await expect(page.locator("pre.diff")).toContainText('model = "muse-spark-1.3"');
});

test("narrow window keeps the Harness usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 700 });
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "已設定的供應商" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
  const layout = await page.locator(".app").evaluate((element) => getComputedStyle(element).flexDirection);
  expect(layout).toBe("column");
});

test("unsaved provider edits require confirmation before closing", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "連線", exact: true }).click();
  await dialog.getByLabel("Base URL").fill("https://changed.invalid/v1");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  const confirm = page.getByRole("dialog").last();
  await expect(confirm.getByRole("heading", { name: "放棄未儲存的變更？" })).toBeVisible();
  await confirm.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("heading", { name: "放棄未儲存的變更？" })).toHaveCount(0);
});

test("Harness provider overview matches the visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "已設定的供應商" })).toBeVisible();
  await expect(page).toHaveScreenshot("harness-overview.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.08,
    threshold: 0.3,
  });
});

test("Harness more menu closes on outside click and Escape", async ({ page }) => {
  const trigger = page.getByRole("button", { name: /^更多/ });
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();

  await page.getByRole("heading", { name: "已設定的供應商" }).click();
  await expect(menu).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("proxy route strategy and observability are usable", async ({ page }) => {
  await page.getByRole("button", { name: "代理", exact: true }).click();
  await expect(page.getByRole("heading", { name: "代理／故障轉移" })).toBeVisible();
  const health = page.getByRole("radio", { name: /健康優先/ });
  await health.click();
  await expect(health).toHaveAttribute("aria-checked", "true");

  await page.getByText("Codex · OpenCode Go", { exact: true }).first().click();
  const policy = page.getByText("策略設定").first();
  await policy.click();
  await expect(page.getByLabel(/Codex · OpenCode Go 權重/)).toHaveValue("100");
  await expect(page.getByText(/平均 TTFB/)).toBeVisible();
  await expect(page.getByText("upstream rate limited (429); cooling down")).toBeVisible();
});

test("one-click rollback offers the previous provider", async ({ page }) => {
  const provider = page.getByRole("article", { name: "供應商 Command Code" });
  await provider.getByRole("button", { name: "套用", exact: true }).click();
  const diff = page.getByRole("dialog");
  await diff.getByRole("button", { name: "確認套用" }).click();
  await expect(diff).toBeHidden();
  await expect(page.getByRole("button", { name: "切回上一個供應商" })).toBeVisible();
  await page.getByRole("button", { name: "切回上一個供應商" }).click();
  await expect(page.getByRole("heading", { name: "套用「OpenCode Go」到 Codex" })).toBeVisible();
});

test("configuration import previews conflicts and applies a bulk policy", async ({ page }) => {
  await page.getByRole("button", { name: /^從設定檔導入/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /掃描到 \d+ 個供應商/ })).toBeVisible();
  await expect(dialog.getByText("Codex", { exact: true })).toBeVisible();
  await dialog.getByLabel("衝突處理方式").selectOption("merge");
  await dialog.getByRole("button", { name: /^匯入 \d+ 個/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/已匯入 \d+ 筆，略過 \d+ 筆/)).toBeVisible();
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
  const provider = page.getByRole("article", { name: "供應商 Command Code" });
  await provider.getByRole("button", { name: "套用", exact: true }).click();

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
