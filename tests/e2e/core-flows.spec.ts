import { expect, test } from "@playwright/test";

const APP = "/?mock=1&onboarded=1#codex,lang=zh";

async function openSettings(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^(設定|设置|Settings)/ }).first().click();
  return page.getByRole("dialog").last();
}

async function openAdvancedSettings(page: import("@playwright/test").Page) {
  const dialog = await openSettings(page);
  const tab = dialog.getByRole("tab", { name: /^(進階|进阶|高级|Advanced)$/ });
  if (await tab.count()) await tab.click();
  return dialog;
}

async function openWorkspace(page: import("@playwright/test").Page, name: string | RegExp) {
  const dialog = await openAdvancedSettings(page);
  await dialog.getByRole("button", { name }).click();
}

async function enableCompatibilityBridge(page: import("@playwright/test").Page) {
  const dialog = await openAdvancedSettings(page);
  await dialog.getByRole("button", { name: /讀取其他切換工具的本機資料/ }).click();
  await dialog.locator(".sheet-foot").getByRole("button", { name: "關閉" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "管理供應商" }).click();
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

test("compatibility bridge is opt-in and off by default", async ({ page }) => {
  await expect(page.getByText("其他切換工具管理的供應商", { exact: true })).toHaveCount(0);
  const dialog = await openAdvancedSettings(page);
  await expect(dialog.getByText("相容匯入", { exact: true })).toBeVisible();
  const toggle = dialog.getByRole("button", { name: /讀取其他切換工具的本機資料/ });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("compatibility bridge providers are shown separately and can be imported", async ({ page }) => {
  await enableCompatibilityBridge(page);
  await expect(page.getByText("其他切換工具管理的供應商", { exact: true })).toBeVisible();
  await expect(page.getByText(/來自本機相容資料庫/)).toBeVisible();
  await page.getByText("其他切換工具管理的供應商", { exact: true }).click();
  const externalProviders = page.locator(".ccswitch-provider");
  await expect(externalProviders).toHaveCount(3);
  const openRouter = externalProviders.filter({ hasText: "OpenRouter" });
  await expect(openRouter).toBeVisible();
  await openRouter.getByRole("button", { name: "匯入 kumoSwitch" }).click();
  await expect(page.getByText("已從相容資料庫匯入「OpenRouter」")).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenRouter", exact: true })).toBeVisible();
});

test("compatibility batch import and route-stack mirroring are available", async ({ page }) => {
  await enableCompatibilityBridge(page);
  await page.getByText("其他切換工具管理的供應商", { exact: true }).click();
  const openRouter = page.locator(".ccswitch-provider").filter({ hasText: "OpenRouter" });
  await openRouter.getByRole("checkbox", { name: /選取 OpenRouter/ }).check();
  await page.getByRole("button", { name: "批次匯入", exact: true }).click();
  await expect(page.getByText(/批次匯入 1 個供應商/)).toBeVisible();
  await page.getByRole("button", { name: "鏡像路由堆疊" }).click();
  await expect(page.getByText(/已鏡像路由堆疊/)).toBeVisible();
});

test("Pi and Oh My Pi are available as first-class Harnesses", async ({ page }) => {
  await page.getByRole("button", { name: /Pi coding agent/ }).click();
  await expect(page.getByRole("heading", { name: "Pi", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "完成供應商設定" })).toBeVisible();
  await page.getByRole("button", { name: /Oh My Pi \(omp\) coding agent/ }).click();
  await expect(page.getByRole("heading", { name: "Oh My Pi", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "完成供應商設定" })).toBeVisible();
});

test("Harness rail shows distinct icons and desktop configuration scope", async ({ page }) => {
  const icons = page.locator(".rail .tool .harness-icon");
  await page.getByRole("button", { name: /其他工具/ }).click();
  await expect(icons).toHaveCount(15);
  await expect(page.locator('.rail .harness-icon[data-harness="codex"]')).toBeVisible();
  await expect(page.locator('.rail .harness-icon[data-harness="pi"]')).toBeVisible();
  await expect(page.locator('.rail .harness-icon[data-harness="omp"]')).toBeVisible();

  await page.getByRole("button", { name: /Pi coding agent/ }).click();
  await expect(page.getByRole("heading", { name: "Pi", exact: true })).toBeVisible();
  await expect(page.locator(".harness-setup-flow")).toBeVisible();
  await page.getByRole("button", { name: "進階設定" }).click();
  await expect(page.locator(".panel-head .surface-badge")).toHaveText("CLI");
  await expect(page.getByText("~/.pi/agent/models.json")).toBeVisible();

  await page.getByRole("button", { name: /OpenAI Codex CLI/ }).click();
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.locator(".panel-head .surface-badge")).toHaveText("CLI + 桌面版");
});

test("provider chooser searches categories and keeps account login explicit", async ({ page }) => {
  await page.getByRole("button", { name: "進階", exact: true }).click();
  await page.getByRole("button", { name: /新增供應商/ }).click();
  const editor = page.getByRole("dialog").last();
  await editor.getByRole("button", { name: /瀏覽供應商目錄/ }).click();
  let chooser = page.getByRole("dialog").last();
  await expect(chooser.getByRole("heading", { name: /新增供應商.*Codex/ })).toBeVisible();
  await expect(chooser.getByRole("button", { name: "使用自訂配置", exact: true })).toBeVisible();
  await expect(chooser.getByRole("navigation", { name: "供應商分類" })).toBeVisible();
  const footerLayout = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".modal.top .sheet")!;
    const results = document.querySelector<HTMLElement>(".provider-results")!;
    const foot = document.querySelector<HTMLElement>(".modal.top .sheet-foot")!;
    results.scrollTop = 420;
    const sheetRect = sheet.getBoundingClientRect();
    const footRect = foot.getBoundingClientRect();
    return {
      footerGap: Math.abs(sheetRect.bottom - footRect.bottom),
      footerPosition: getComputedStyle(foot).position,
      resultsScrollTop: results.scrollTop,
    };
  });
  expect(footerLayout.footerGap).toBeLessThanOrEqual(2);
  expect(footerLayout.footerPosition).not.toBe("sticky");
  expect(footerLayout.resultsScrollTop).toBeGreaterThan(0);
  await page.locator(".provider-results").evaluate((element) => { element.scrollTop = 0; });

  await chooser.getByRole("button", { name: /^模型廠商/ }).click();
  await chooser.getByLabel("搜尋供應商").fill("Kimi");
  await expect(chooser.getByRole("button", { name: "選擇供應商 Kimi / Moonshot" })).toBeVisible();
  await chooser.getByRole("button", { name: "選擇供應商 Kimi / Moonshot" }).click();

  await expect(page.locator(".provider-chooser")).toBeHidden();
  await expect(editor.getByLabel("名稱")).toHaveValue("Kimi / Moonshot");
  await expect(editor.getByLabel("Base URL")).toHaveValue("https://api.moonshot.cn/v1");
  await expect(editor.getByLabel(/類型/)).toHaveValue("chat");

  await editor.getByRole("button", { name: /瀏覽供應商目錄/ }).click();
  chooser = page.getByRole("dialog").last();
  await chooser.getByRole("button", { name: /^帳號登入/ }).click();
  await chooser.getByRole("button", { name: "選擇供應商 OpenAI Official" }).click();
  await expect(page.locator(".provider-chooser")).toBeHidden();
  await expect(editor.getByText("OpenAI Official 需要帳號登入")).toBeVisible();
  await expect(editor.getByText(/不會代為處理 OAuth token/)).toBeVisible();
  await editor.getByRole("button", { name: "改用自訂配置" }).click();
  await expect(editor.getByText("OpenAI Official 需要帳號登入")).toHaveCount(0);
});

test("Harness manager installs a fixed package and explains desktop support", async ({ page }) => {
  await openWorkspace(page, "工具管理");
  await expect(page.getByRole("heading", { name: "工具安裝與管理" })).toBeVisible();
  await expect(page.locator(".harness-manager-card")).toHaveCount(15);

  const codex = page.getByRole("article", { name: "工具 Codex" });
  await expect(codex).toContainText("CLI + 桌面版");
  await expect(codex).toContainText("已偵測");

  const gemini = page.getByRole("article", { name: "工具 Gemini CLI" });
  await expect(gemini).toContainText("CLI");
  await gemini.getByRole("button", { name: "安裝 Gemini CLI" }).click();
  const installDialog = page.getByRole("dialog").last();
  await expect(installDialog.getByRole("heading", { name: "安裝或更新 Gemini CLI" })).toBeVisible();
  await expect(installDialog.locator(".harness-command")).toContainText("npm install -g");
  await expect(installDialog.locator(".harness-command")).toContainText("@google/gemini-cli");
  await installDialog.getByRole("button", { name: "執行固定命令" }).click();
  const resultDialog = page.getByRole("dialog").last();
  await expect(resultDialog.getByRole("heading", { name: "工具安裝完成" })).toBeVisible();
  await resultDialog.locator(".sheet-foot").getByRole("button", { name: "關閉" }).click();
  await expect(gemini).toContainText("已偵測");
  await expect(gemini.getByRole("button", { name: "更新 Gemini CLI" })).toBeVisible();

  await page.getByRole("button", { name: "桌面版", exact: true }).click();
  await expect(page.getByRole("article", { name: "工具 Gemini CLI" })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "工具 Codex" })).toBeVisible();
});

test("narrow provider chooser and Harness manager remain contained", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 820 });
  await page.reload();
  await page.getByRole("button", { name: "進階設定" }).click();
  await page.getByRole("button", { name: /新增供應商/ }).click();
  await page.getByRole("button", { name: /瀏覽供應商目錄/ }).click();
  await expect(page.locator(".provider-chooser")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "供應商分類" })).toBeVisible();
  const chooserGeometry = await page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>(".provider-card-grid");
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length : 0,
    };
  });
  expect(chooserGeometry.overflow).toBe(false);
  expect(chooserGeometry.columns).toBe(1);

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "取消", exact: true }).last().click();
  await openWorkspace(page, "工具管理");
  await expect(page.locator(".harness-manager-card")).toHaveCount(15);
  await expect(page.locator(".harness-toolbar .segmented button")).toHaveCount(4);
  const managerGeometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    filters: Array.from(document.querySelectorAll<HTMLElement>(".harness-toolbar .segmented button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    }),
    viewport: window.innerWidth,
  }));
  expect(managerGeometry.overflow).toBe(false);
  expect(managerGeometry.filters.every((button) => button.left >= -1 && button.right <= managerGeometry.viewport + 1)).toBe(true);
});

test("settings exposes manual update and fallback installer", async ({ page }) => {
  const dialog = await openSettings(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "版本與更新" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "檢查更新" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "開啟安裝／更新向導" })).toBeVisible();
  await dialog.getByRole("button", { name: "檢查更新" }).click();
  await expect(dialog.getByText("檢查失敗")).toBeVisible();
  await dialog.locator(".sheet-foot").getByRole("button", { name: "關閉" }).click();
  await expect(dialog).toHaveCount(0);
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
  await card.getByRole("button", { name: "自動獲取模型資訊 deepseek-v4.1-flash" }).click();
  await expect(card.getByLabel("Context window")).toHaveValue("128000");
  await expect(card.getByLabel("Max output")).toHaveValue("16384");
  await card.getByLabel("思考等級 deepseek-v4.1-flash", { exact: true }).selectOption("high");
  await card.locator(".model-advanced > summary").click();
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

  const activeModel = dialog.getByRole("article", { name: "模型 glm-5.3-flash" });
  await activeModel.locator(".model-more > summary").click();
  await activeModel.getByRole("button", { name: "測試模型 glm-5.3-flash" }).click();
  await expect(dialog.getByText(/最近 100% · 平均 \d+ms · 200/)).toBeVisible();

  await dialog.locator(".sheet-head").getByRole("button", { name: "關閉" }).click();
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

test("model manager searches models and persists the selected reasoning level", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();

  const search = dialog.getByLabel("搜尋目前供應商的模型");
  await search.fill("muse");
  await expect(dialog.locator(".model-card")).toHaveCount(1);
  await expect(dialog.getByRole("article", { name: "模型 muse-spark-1.3" })).toBeVisible();
  await expect(dialog.getByText("1 / 2 個模型")).toBeVisible();
  await search.fill("high");
  await expect(dialog.locator(".model-card")).toHaveCount(2);
  await search.fill("");

  const activeModel = dialog.getByRole("article", { name: "模型 glm-5.3-flash" });
  const level = activeModel.getByLabel("思考等級 glm-5.3-flash", { exact: true });
  await expect(level).toHaveValue("medium");
  await activeModel.getByRole("button", { name: "自動獲取模型資訊 glm-5.3-flash" }).click();
  await expect(activeModel.getByText(/Context 262144.*Max output 32768.*寫入 config\.toml/)).toBeVisible();
  await expect(activeModel.getByLabel("Context window")).toHaveValue("262144");
  await expect(activeModel.getByLabel("Max output")).toHaveValue("32768");
  await level.selectOption("high");
  await dialog.getByRole("button", { name: "儲存並預覽" }).click();

  const diff = page.getByRole("dialog").filter({ hasText: "套用「OpenCode Go」到 Codex" });
  await expect(diff.locator("pre.diff")).toContainText('model_reasoning_effort = "high"');
});

test("model discovery previews additions and preserves unreturned models", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("tab", { name: /^模型/ }).click();
  await editor.getByRole("button", { name: "↻ 同步模型" }).click();

  const sync = page.getByRole("dialog").filter({ hasText: "同步模型 · OpenCode Go" });
  await expect(sync.getByRole("heading", { name: "同步模型 · OpenCode Go" })).toBeVisible();
  await expect(sync.getByLabel("同步模型 deepseek-v4.1-flash")).toBeChecked();
  await expect(sync.getByLabel("同步模型 qwen3-coder-plus")).toBeChecked();
  await expect(sync.getByLabel("同步模型 glm-5.3-flash")).not.toBeChecked();
  await expect(sync.getByText("本次未回報的既有模型（1）")).toBeVisible();
  await expect(sync.getByText("muse-spark-1.3", { exact: true })).toBeVisible();

  await sync.getByLabel("同步模型 glm-5.3-flash").check();
  await expect(sync.getByRole("button", { name: /Context.*128K.*256K/ })).toBeVisible();
  await sync.getByRole("button", { name: "套用到模型清單" }).click();
  await expect(sync).toBeHidden();
  await expect(editor.getByRole("article", { name: "模型 deepseek-v4.1-flash" })).toBeVisible();
  await expect(editor.getByRole("article", { name: "模型 qwen3-coder-plus" })).toBeVisible();
  const missingModel = editor.getByRole("article", { name: "模型 muse-spark-1.3" });
  await expect(missingModel).toBeVisible();
  await expect(missingModel.getByText("本次未回報")).toBeVisible();
  await expect(editor.getByRole("tab", { name: /^模型\s*4/ })).toBeVisible();
});

test("provider cards and command palette can switch models directly", async ({ page }) => {
  await page.getByRole("button", { name: "進階", exact: true }).click();
  const quick = page.getByLabel("OpenCode Go 快速切換模型");
  await quick.selectOption("muse-spark-1.3");
  await expect(page.getByRole("heading", { name: "套用「OpenCode Go」到 Codex" })).toBeVisible();
  await expect(page.locator("pre.diff")).toContainText('model = "muse-spark-1.3"');
  await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();

  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "快速切換" });
  await palette.getByLabel("搜尋供應商").fill("Muse Spark");
  const option = palette.getByRole("option").filter({ hasText: "Muse Spark 1.3" });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByRole("heading", { name: "套用「OpenCode Go」到 Codex" })).toBeVisible();
});

test("live model test requires explicit cost warning", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("tab", { name: /^模型/ }).click();
  const activeModel = editor.getByRole("article", { name: "模型 glm-5.3-flash" });
  await activeModel.locator(".model-more > summary").click();
  await activeModel.getByRole("button", { name: "實測模型 glm-5.3-flash" }).click();

  const confirm = page.getByRole("dialog").filter({ hasText: "進行真實模型實測？" });
  await expect(confirm.getByText(/供應商可能收取少量費用/)).toBeVisible();
  await confirm.getByRole("button", { name: "送出實測" }).click();
  await expect(editor.getByText(/最小推論請求成功/)).toBeVisible();
});

test("drift center sorts attention first and filters by status", async ({ page }) => {
  await openWorkspace(page, "設定守護");
  await expect(page.getByRole("heading", { name: "設定守護中心" })).toBeVisible();
  await expect(page.locator(".drift-summary").getByText("已漂移", { exact: true })).toBeVisible();
  await expect(page.locator(".drift-summary").getByText("未納管", { exact: true })).toBeVisible();
  await expect(page.locator(".drift-card").first().getByRole("heading", { name: "Claude Code" })).toBeVisible();
  await expect(page.getByText("實際設定與 kumoSwitch 紀錄不同")).toBeVisible();
  await expect(page.getByText("external-provider", { exact: true })).toBeVisible();

  await page.locator(".drift-filters").getByRole("button", { name: "未納管", exact: true }).click();
  await expect(page.locator(".drift-card")).toHaveCount(1);
  await expect(page.locator(".drift-card").getByRole("heading", { name: "Gemini CLI" })).toBeVisible();

  await page.locator(".drift-filters").getByRole("button", { name: "待處理", exact: true }).click();
  await expect(page.locator(".drift-card")).toHaveCount(2);
});

test("drift batch selection can reapply drifted Harnesses", async ({ page }) => {
  await openWorkspace(page, "設定守護");
  await page.getByRole("button", { name: /選取待處理/ }).click();
  await expect(page.getByRole("button", { name: /批次重新套用 1/ })).toBeEnabled();
  await page.getByRole("button", { name: /批次重新套用 1/ }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: "批次重新套用設定？" })).toBeVisible();
  await confirm.getByRole("button", { name: "開始重新套用" }).click();
  await expect(page.getByText("批次重新套用 1 個工具")).toBeVisible();
});

test("drift batch selection can import unmanaged Harnesses", async ({ page }) => {
  await openWorkspace(page, "設定守護");
  await page.getByRole("checkbox", { name: "選取 Gemini CLI" }).check();
  await page.getByRole("button", { name: /批次匯入 1/ }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: "批次匯入未納管供應商？" })).toBeVisible();
  await confirm.getByRole("button", { name: "開始匯入" }).click();
  await expect(page.getByText(/批次匯入 .*個供應商/)).toBeVisible();
});

test("settings navigation stays contained at desktop and narrow widths", async ({ page }) => {
  for (const width of [1222, 760, 480]) {
    await page.setViewportSize({ width, height: 784 });
    await page.reload();
    const dialog = await openAdvancedSettings(page);
    const nav = dialog.locator(".settings-nav-grid");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("button")).toHaveCount(6);
    const geometry = await page.evaluate(() => ({
      documentScrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
      buttons: Array.from(document.querySelectorAll<HTMLElement>(".settings-nav-grid button")).map((button) => {
        const rect = button.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
      viewport: window.innerWidth,
    }));
    expect(geometry.documentScrolls, `document overflows at ${width}px`).toBe(false);
    expect(geometry.buttons.every((button) => button.left >= -1 && button.right <= geometry.viewport + 1), `settings buttons leave viewport at ${width}px`).toBe(true);
    await dialog.locator(".sheet-foot").getByRole("button", { name: "關閉" }).click();
  }
});

test("narrow window keeps the Harness usable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 700 });
  await page.goto(APP);
  await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "讓 Codex 顯示 GPT Plus 和其他模型" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(overflow).toBe(true);
  const layout = await page.locator(".app").evaluate((element) => getComputedStyle(element).flexDirection);
  expect(layout).toBe("column");
});

test("proxy decision trace explains skipped and selected providers", async ({ page }) => {
  await openWorkspace(page, "代理與路由");
  await expect(page.getByRole("heading", { name: "即時切換與故障轉移" })).toBeVisible();
  await expect(page.getByText("最近請求決策")).toBeVisible();
  const trace = page.locator(".proxy-trace").first();
  await trace.locator("summary").click();
  await expect(trace.getByText("候選順序")).toBeVisible();
  await expect(trace.getByText("429 限流，進入冷卻")).toBeVisible();
  await expect(trace.getByText("選中並成功回應")).toBeVisible();
  await expect(trace.getByText(/選中|Codex/).first()).toBeVisible();
});

test("model sync schedule and live-test budget are configurable", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  const automation = dialog.locator(".model-automation-details");
  const automationToggle = automation.getByRole("button", { name: /自動同步與實測成本保護/ });
  await automationToggle.click();
  await expect(automationToggle).toHaveAttribute("aria-expanded", "true");

  await expect(dialog.getByLabel("模型同步間隔")).toHaveValue("86400");
  await expect(dialog.getByText(/離線快取：2 個模型/)).toBeVisible();
  await expect(dialog.getByLabel("每日實測次數上限")).toHaveValue("20");
  await expect(dialog.getByLabel("實測輸出 token 上限")).toHaveValue("8");

  await dialog.getByLabel("每日實測次數上限").fill("6");
  await dialog.getByLabel("實測輸出 token 上限").fill("4");
  await dialog.getByRole("button", { name: "儲存政策" }).click();
  await expect(dialog.getByText("實測配額與 token 上限已儲存。")).toBeVisible();

  await dialog.getByRole("checkbox", { name: "選取實測模型 glm-5.3-flash" }).check();
  await dialog.getByRole("checkbox", { name: "選取實測模型 muse-spark-1.3" }).check();
  await expect(dialog.getByText(/已選 2 個模型/)).toBeVisible();
  await dialog.getByRole("button", { name: /實測選取 2/ }).click();

  const confirm = page.getByRole("dialog").last();
  await expect(confirm.getByText(/每次最多 4 tokens/)).toBeVisible();
  await expect(confirm.getByText(/近 24 小時剩餘 3 次配額/)).toBeVisible();
  await confirm.getByRole("button", { name: "實測 2 個模型" }).click();
  await expect(dialog.getByText("實測完成：成功 2，失敗 0。")).toBeVisible();
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
  await page.evaluate(() => localStorage.setItem("kumoswitch.theme", "light"));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "讓 Codex 顯示 GPT Plus 和其他模型" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page).toHaveScreenshot("harness-overview.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.08,
    threshold: 0.3,
  });
});

test("dark visual system matches the v0.14 baseline", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("kumoswitch.theme", "dark"));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.getByRole("heading", { name: "讓 Codex 顯示 GPT Plus 和其他模型" }).waitFor();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page).toHaveScreenshot("harness-overview-dark.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.06,
    threshold: 0.3,
  });
});

test("drift center matches the visual baseline", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(APP);
  await openWorkspace(page, "設定守護");
  await page.locator(".drift-card").first().waitFor();
  await expect(page).toHaveScreenshot("drift-center.png", {
    animations: "disabled",
    maxDiffPixelRatio: 0.06,
    threshold: 0.3,
  });
});

test("mobile rail keeps one consolidated settings entry", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 860 });
  await page.evaluate(() => localStorage.setItem("kumoswitch.theme", "light"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "讓 Codex 顯示 GPT Plus 和其他模型" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^設定/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /更多操作/ })).toHaveCount(0);
  await expect(page.locator(".rail-actions")).toHaveCount(0);
  await expect(page).toHaveScreenshot("mobile-rail.png", {
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

  await page.locator(".provider-list-head h3").click();
  await expect(menu).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("stats dashboard shows usage and scan diagnostics", async ({ page }) => {
  await openWorkspace(page, "用量統計");
  await expect(page.getByRole("heading", { name: "統計儀表板" })).toBeVisible();
  await expect(page.getByText("掃描診斷")).toBeVisible();
  await expect(page.getByText("2,590")).toBeVisible();
  await expect(page.locator(".scan-root")).toHaveCount(5);
  await expect(page.locator(".scan-root").getByText("Claude Code")).toBeVisible();
  await expect(page.locator(".scan-root").getByText("Codex", { exact: true })).toBeVisible();
  await expect(page.locator(".scan-root").getByText("DSH", { exact: true })).toBeVisible();
  await expect(page.getByLabel("統計範圍")).toBeVisible();
  await expect(page.getByLabel("統計範圍")).toContainText("今天");
  await expect(page.locator(".day-chart-legend")).toContainText("快取");
  await expect(page.locator(".source-overheads")).toContainText("固定開銷");
  await page.getByLabel("統計範圍").selectOption("0");
  await expect(page.getByRole("heading", { name: "每日用量（今天）" })).toBeVisible();
  await page.getByLabel("統計範圍").selectOption("30");
  await page.getByLabel("來源篩選").selectOption("pi");
  await expect(page.locator(".stats .grid:not(.request-grid) tbody tr")).toHaveCount(1);
  await expect(page.locator(".stats .grid:not(.request-grid) tbody")).toContainText("deepseek-v4.1-flash");
  await page.getByLabel("來源篩選").selectOption("all");
  await page.getByLabel("搜尋模型").fill("glm");
  await expect(page.locator(".stats .grid:not(.request-grid) tbody tr")).toHaveCount(1);
  await page.getByLabel("搜尋模型").fill("");
  await page.locator(".stats").getByRole("button", { name: "重新掃描" }).click();
  await expect(page.getByText("掃描診斷")).toBeVisible();
});

test("recent request status uses readable tones", async ({ page }) => {
  await openWorkspace(page, "用量統計");
  const rows = page.locator(".request-grid tbody tr");
  await expect(rows.first()).toBeVisible();
  const tones = await rows.evaluateAll((items) =>
    items.map((row) => {
      const badge = row.querySelector("td:nth-child(5) .badge");
      return { text: badge?.textContent?.trim(), cls: badge?.className, title: badge?.getAttribute("title") };
    }),
  );
  expect(tones.length).toBeGreaterThan(0);
  expect(tones.every((item) => item.title === item.text)).toBe(true);
  expect(tones.some((item) => item.cls?.includes("badge info"))).toBe(true);
});

test("manual rescan shows a fresh timestamp", async ({ page }) => {
  await openWorkspace(page, "用量統計");
  const updated = page.locator(".stats-updated");
  await expect(updated).toBeVisible();
  const before = await updated.textContent();
  await page.waitForTimeout(1100);
  await page.locator(".stats").getByRole("button", { name: "重新掃描" }).click();
  await expect(updated).not.toHaveText(before ?? "");
});

test("usage dashboard auto refresh preference persists", async ({ page }) => {
  await openWorkspace(page, "用量統計");
  const select = page.getByLabel("自動重新整理");
  await expect(select).toHaveValue("15");
  await select.selectOption("5");
  await page.reload();
  await openWorkspace(page, "用量統計");
  await expect(page.getByLabel("自動重新整理")).toHaveValue("5");
});

test("usage dashboard shows per-request history", async ({ page }) => {
  await openWorkspace(page, "用量統計");
  await expect(page.getByRole("heading", { name: "最近請求" })).toBeVisible();
  const rows = page.locator(".request-grid tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("7f3c5fc0");
  await expect(rows.first()).toContainText("$0.00");
  await page.getByLabel("來源篩選").selectOption("pi");
  await expect(rows).toHaveCount(2);
});

test("instant switch is a first-class action on the tool page", async ({ page }) => {
  await expect(page.getByRole("button", { name: "一鍵啟用" })).toBeVisible();
  await page.getByRole("button", { name: "一鍵啟用" }).click();
  const successToast = page.locator(".toast");
  await expect(successToast).toContainText(/已啟用即時切換|Codex 合併模型目錄已啟用/);
  await expect(page.getByText("Codex 已連接", { exact: true })).toBeVisible();
  await expect(page.getByText("已連接；模型會從 Codex 的模型選單切換。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "更多" }).first().click();
  await expect(page.getByRole("menuitem", { name: "即時切換設定" })).toBeVisible();
});

test("proxy route strategy and observability are usable", async ({ page }) => {
  await openWorkspace(page, "代理與路由");
  await expect(page.getByRole("heading", { name: "即時切換與故障轉移" })).toBeVisible();
  const health = page.getByRole("radio", { name: /健康優先/ });
  await health.click();
  await expect(health).toHaveAttribute("aria-checked", "true");

  await page.getByText("Codex · OpenCode Go", { exact: true }).first().click();
  const policy = page.getByText("策略設定").first();
  await policy.click();
  await expect(page.getByLabel(/Codex · OpenCode Go 權重/)).toHaveValue("100");
  await page.getByLabel(/Codex · OpenCode Go 允許模型/).fill("glm-5.3-flash, deepseek-v4.1");
  await page.getByLabel(/Codex · OpenCode Go 模型映射/).fill("glm-5.3-flash=vendor/glm-5.3");
  await expect(page.getByLabel(/Codex · OpenCode Go 允許模型/)).toHaveValue("glm-5.3-flash, deepseek-v4.1");
  await expect(page.locator(".proxy-summary-strip").getByText("平均 TTFB", { exact: true })).toBeVisible();
  await expect(page.locator(".proxy-alert-list")).toContainText("429 rate limit");
  await expect(page.getByText("upstream rate limited (429); cooling down")).toBeVisible();
});

test("quick switch applies immediately and can be undone", async ({ page }) => {
  const provider = page.getByRole("article", { name: "供應商 Command Code" });
  await provider.getByRole("button", { name: "套用", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".toast").filter({ hasText: "已切換到「Command Code」" })).toBeVisible();
  await expect(page.locator(".recent-chip").filter({ hasText: "Command Code" })).toBeVisible();
  await expect(page.locator(".toast-action")).toBeVisible();
  await page.locator(".toast-action").click();
  await expect(page.locator(".toast").filter({ hasText: "已復原切換前的設定" })).toBeVisible();
  await expect(page.locator(".current-provider")).toContainText("OpenCode Go");
});

test("quick add saves and switches a new provider", async ({ page }) => {
  await page.getByRole("button", { name: /新增供應商/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /快速新增 · Codex/ })).toBeVisible();
  await dialog.getByLabel("Base URL").fill("https://api.quick.test/v1");
  await dialog.getByLabel("API Key").fill("sk-quick-1234");
  await dialog.getByRole("button", { name: /儲存並切換/ }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".toast").filter({ hasText: "已切換到" })).toBeVisible();
  await expect(page.getByRole("article", { name: "供應商 api.quick.test" })).toBeVisible();
});

test("quick add can start from the provider catalogue", async ({ page }) => {
  await page.getByRole("button", { name: /新增供應商/ }).click();
  await page.getByRole("button", { name: /從供應商目錄選擇/ }).click();
  const chooser = page.getByRole("dialog").last();
  await chooser.getByLabel("搜尋供應商").fill("OpenRouter");
  await chooser.getByRole("button", { name: /OpenRouter/ }).first().click();
  await expect(page.getByLabel("Base URL")).toHaveValue("https://openrouter.ai/api/v1");
  await page.getByLabel("API Key").fill("sk-or-quick-test");
  await page.getByRole("button", { name: /儲存並切換/ }).click();
  await expect(page.locator(".toast").filter({ hasText: "已切換到" })).toBeVisible();
});

test("Ctrl+Z undoes the last quick switch", async ({ page }) => {
  const provider = page.getByRole("article", { name: "供應商 Command Code" });
  await provider.getByRole("button", { name: "套用", exact: true }).click();
  await expect(page.locator(".toast").filter({ hasText: "已切換到「Command Code」" })).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.locator(".toast").filter({ hasText: "已復原切換前的設定" })).toBeVisible();
});

test("providers can be pinned to the top", async ({ page }) => {
  const command = page.getByRole("article", { name: "供應商 Command Code" });
  await command.getByRole("button", { name: "☆ 釘選" }).click();
  await expect(command.getByRole("button", { name: "★ 釘選" })).toBeVisible();
  await expect(page.locator(".provider-card").first()).toContainText("Command Code");
});

test("configuration import previews conflicts and applies a bulk policy", async ({ page }) => {
  await page.getByRole("button", { name: "進階", exact: true }).click();
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
  const settings = await openAdvancedSettings(page);
  await settings.getByRole("button", { name: "匯出加密清單" }).click();

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
  await page.getByRole("button", { name: "進階", exact: true }).click();
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


test("shared Profile library syncs the same provider across Harnesses", async ({ page }) => {
  await openWorkspace(page, "共用 Profile");
  await expect(page.getByRole("heading", { name: "共用供應商 Profile" })).toBeVisible();
  const card = page.locator(".profile-card").first();
  await expect(card.getByRole("heading", { name: "OpenCode Zen" })).toBeVisible();
  await expect(card.getByText("3 個工具")).toBeVisible();
  await card.getByRole("button", { name: "同步全部" }).click();
  await expect(page.getByText(/已同步 1 個工具/)).toBeVisible();
  await card.getByRole("button", { name: "編輯" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "編輯共用 Profile" })).toBeVisible();
  await expect(dialog.getByLabel("OpenCode 模型映射")).toHaveValue("glm-5.3-flash");
  await expect(dialog.getByLabel("Claude Code protocol 映射")).toHaveValue("");
});

test("backup center exposes version metadata and safe restore", async ({ page }) => {
  await openWorkspace(page, "備份中心");
  await expect(page.getByRole("heading", { name: "備份／遷移中心" })).toBeVisible();
  await expect(page.locator(".backup-stats")).toContainText("最新／最舊");
  await expect(page.locator(".backup-entry")).toHaveCount(5);
  await page.getByRole("button", { name: "立即建立快照" }).click();
  await expect(page.getByText(/已建立 .* 的設定快照/)).toBeVisible();
  await page.locator(".backup-entry").first().getByRole("button", { name: "還原" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/還原前會先為目前內容建立/)).toBeVisible();
  await dialog.getByRole("button", { name: "確認還原" }).click();
  await expect(page.getByText(/已還原 \d+ 個設定檔，並先建立安全快照/)).toBeVisible();
});

test("guardian timeline records drift and auto-repair is opt-in", async ({ page }) => {
  await openWorkspace(page, "設定守護");
  await expect(page.getByRole("heading", { name: "設定守護中心" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "變更時間線" })).toBeVisible();
  await expect(page.locator(".guardian-event")).toHaveCount(2);
  const autoRepair = page.getByRole("button", { name: /自動修復/ });
  await expect(autoRepair).toHaveAttribute("aria-pressed", "false");
  await autoRepair.click();
  await expect(autoRepair).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("守護中心設定已更新")).toBeVisible();
});

test("API key lifecycle supports a new encrypted rotation key", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /金鑰生命週期/ }).click();
  await expect(dialog.getByText("API Key 生命週期")).toBeVisible();
  await expect(dialog.getByText("目前金鑰", { exact: true })).toBeVisible();
  await dialog.getByLabel("標籤").fill("Q4 輪替");
  await dialog.getByLabel("新 API Key").fill("sk-rotated-test-7788");
  await dialog.getByLabel("備註").fill("測試輪替流程");
  await dialog.getByRole("button", { name: "加密保存並切換" }).click();
  await expect(dialog.getByText("新金鑰已加密保存並切換為使用中。")).toBeVisible();
});

test("collapsed model card leaves no empty placeholder row", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await dialog.locator(".model-summary-main").first().click();
  const gap = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>(".model-card");
    const summary = card?.querySelector<HTMLElement>(".model-card-summary");
    return card && summary ? card.getBoundingClientRect().height - summary.getBoundingClientRect().height : -1;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(3);
});

test("new model can be searched from the provider catalogue", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await dialog.getByRole("button", { name: /從目錄新增/ }).click();
  const picker = page.getByRole("dialog").last();
  await picker.getByLabel("搜尋供應商模型").fill("qwen");
  const item = picker.locator(".model-picker-item").filter({ hasText: "qwen3-coder-plus" });
  await expect(item).toContainText("262K ctx");
  await expect(item).toContainText("33K out");
  await item.click();
  const card = page.locator(".model-card").last();
  await expect(card.getByLabel("Model ID")).toHaveValue("qwen3-coder-plus");
  await expect(card.getByLabel("Context window")).toHaveValue("262144");
  await expect(card.getByLabel("Max output")).toHaveValue("32768");
});

test("new manual model can fetch limits from the catalogue", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await dialog.getByRole("button", { name: "＋ 新增模型" }).click();
  const card = page.locator(".model-card").last();
  await card.getByLabel("Model ID").fill("deepseek-v4.1-flash");
  await card.getByRole("button", { name: /自動獲取模型資訊/ }).click();
  await expect(card.getByLabel("Context window")).toHaveValue("128000");
  await expect(card.getByLabel("Max output")).toHaveValue("16384");
});

test("theme accent palette can be switched and persists", async ({ page }) => {
  const dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "極光", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "aurora");
  await dialog.locator(".sheet-foot").getByRole("button", { name: "關閉" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "aurora");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /^(dark|light)$/);
});

test("compatibility matrix and accessibility preferences are visible", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await expect(dialog.getByText("工具相容性矩陣", { exact: false }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();

  dialog = await openAdvancedSettings(page);
  await dialog.getByRole("button", { name: /高對比模式/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-contrast", "high");
  await dialog.locator(".settings-choice-row").filter({ hasText: "文字大小" }).getByRole("button", { name: "大", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-text-scale", "large");
});

test("Simplified Chinese locale applies to the full interface", async ({ page }) => {
  let dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "简中" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
  await dialog.getByRole("tab", { name: /^(进阶|進階|高级|Advanced)$/ }).click();
  await expect(dialog.getByRole("heading", { name: "无障碍与阅读" })).toBeVisible();
  await dialog.locator(".sheet-foot").getByRole("button", { name: /^(关闭|關閉)/ }).click();
  await openWorkspace(page, "工具管理");
  await expect(page.getByRole("heading", { name: "工具安装与管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^(设置|設定)/ }).first()).toBeVisible();
  dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "繁中" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
});


test("English locale leaves no translatable Chinese residue", async ({ page }) => {
  const allow = new Set(["繁中", "简中"]);
  const chinese = /[一-鿿]/;
  const scan = async (label: string) => {
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const text = (node.nodeValue || "").trim();
        if (text && /[一-鿿]/.test(text)) out.push(text.slice(0, 120));
      }
      for (const el of document.querySelectorAll("[title],[aria-label],[placeholder]")) {
        for (const attr of ["title", "aria-label", "placeholder"]) {
          const value = el.getAttribute(attr);
          if (value && /[一-鿿]/.test(value)) out.push(attr + ": " + value.slice(0, 120));
        }
      }
      return [...new Set(out)];
    });
    const residue = found.filter((text) => !allow.has(text));
    expect(residue, label + ": " + residue.join(" | ")).toEqual([]);
  };

  await page.getByRole("button", { name: /^設定/ }).first().click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator(".sheet-foot").getByRole("button", { name: /^(Close|關閉)/ }).click();
  await scan("main");

  await page.getByRole("button", { name: /^Settings/ }).first().click();
  await scan("settings basic");
  await page.getByRole("tab", { name: /Advanced/ }).click();
  await scan("settings advanced");
  await page.locator(".sheet-foot").getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /View model and settings for provider OpenCode Go/ }).click();
  const tabs = page.locator(".detail-tabs button");
  for (const index of [0, 1, 2, 3]) {
    await tabs.nth(index).click();
    await page.waitForTimeout(80);
    await scan("provider tab " + index);
  }
  const close = page.locator(".sheet-foot").getByRole("button", { name: "Close" }).last();
  if (await close.count()) await close.click();
});

async function browserCloseDialog(page: import("@playwright/test").Page) {
  await page.locator(".sheet-foot").getByRole("button", { name: "Close" }).click();
}

test("model ID combobox filters live without closing", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  await dialog.getByRole("button", { name: "＋ 新增模型" }).click();
  const card = page.locator(".model-card").last();
  const input = card.getByLabel("Model ID");
  await input.click();
  await expect(card.locator(".model-id-options")).toBeVisible();
  await input.fill("coder-plus");
  await expect(card.locator(".model-id-options")).toBeVisible();
  await expect(card.locator(".model-id-options button")).toHaveCount(1);
  await card.locator(".model-id-options button").first().click();
  await expect(input).toHaveValue("qwen3-coder-plus");
  await expect(card.getByLabel("Context window")).toHaveValue("262144");
});

test("feedback modal builds a local-only report", async ({ page }) => {
  const dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "提供回饋" }).click();
  const feedback = page.getByRole("dialog").last();
  await expect(feedback.getByRole("heading", { name: "提供回饋" })).toBeVisible();
  await feedback.getByRole("button", { name: "功能想法" }).click();
  await feedback.getByLabel("你想說什麼？").fill("希望統計頁能篩選供應商");
  await feedback.getByRole("button", { name: "預覽內容" }).click();
  const preview = feedback.locator(".feedback-preview");
  await expect(preview).toContainText("【kumoSwitch 回饋 · 功能想法】");
  await expect(preview).toContainText("希望統計頁能篩選供應商");
  await expect(preview).toContainText("診斷摘要");
  await expect(preview).not.toContainText("sk-zen-8f31c0d9f2a");
  await expect(feedback.getByRole("button", { name: "開啟 GitHub Issue" })).toBeVisible();
});

test("migration centre groups backup, config scan and compatibility import", async ({ page }) => {
  await openAdvancedSettings(page);
  await page.getByRole("button", { name: "搬家中心" }).click();
  const dialog = page.getByRole("dialog").last();
  await expect(dialog.getByRole("heading", { name: "搬家中心" })).toBeVisible();
  await expect(dialog).toContainText("先備份現在的設定");
  await expect(dialog).toContainText("從官方設定檔帶入");
  await expect(dialog).toContainText("第三方相容匯入（選用）");
});

test("collapsed model card hides secondary badges", async ({ page }) => {
  await page.getByRole("button", { name: "查看供應商 OpenCode Go 的模型與設定" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /^模型/ }).click();
  const card = page.locator(".model-card").last();
  await expect(card).not.toHaveClass(/expanded/);
  await expect(card.locator(".badge.optional").first()).toBeHidden();
  await card.locator(".model-summary-main").click();
  await expect(card.locator(".badge.optional").first()).toBeVisible();
});

test("English locale covers the new roadmap screens", async ({ page }) => {
  let dialog = await openSettings(page);
  await dialog.getByRole("button", { name: "EN", exact: true }).click();
  await dialog.locator(".sheet-foot").getByRole("button", { name: /^(Close|關閉)/ }).click();
  await openWorkspace(page, "Shared profiles");
  await expect(page.getByRole("heading", { name: "Shared provider profiles" })).toBeVisible();
  await openWorkspace(page, "Backup center");
  await expect(page.getByRole("heading", { name: "Backup & migration center" })).toBeVisible();
  await openWorkspace(page, "Guardian");
  await expect(page.getByRole("heading", { name: "Settings Guardian" })).toBeVisible();
  await openWorkspace(page, "Tool management");
  await expect(page.getByRole("heading", { name: "Tool setup & management" })).toBeVisible();
});
