import { expect, test, chromium, type Browser } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let app: ChildProcess | undefined;
let browser: Browser | undefined;
let root = "";

function processDiagnostics(): string {
  if (process.platform !== "win32") return "";
  try {
    return execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'kumoswitch|msedgewebview2' } | Select-Object ProcessId,ParentProcessId,Name,CommandLine | Format-List | Out-String -Width 300",
    ], { encoding: "utf8" });
  } catch {
    return "process diagnostics unavailable";
  }
}

async function waitForCdp(url: string, child: ChildProcess, stderr: () => string): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Tauri exited before WebView2 CDP started (code ${child.exitCode})\n${stderr()}`);
    }
    try {
      const response = await fetch(`${url}/json/version`);
      if (response.ok) return;
    } catch {
      /* app still starting */
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`Tauri WebView2 CDP did not start\n${stderr()}\n${processDiagnostics()}`);
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "kumoswitch-tauri-e2e-"));
  const appData = join(root, "AppData", "Roaming");
  const localAppData = join(root, "AppData", "Local");
  const home = join(root, "home");
  const dataDir = join(appData, "kumoSwitch");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  mkdirSync(join(root, "tmp"), { recursive: true });
  mkdirSync(join(home, ".codex"), { recursive: true });
  writeFileSync(join(home, ".codex", "config.toml"), [
    'model = "e2e-model"',
    'model_provider = "e2e-provider"',
    "",
    "[model_providers.e2e-provider]",
    'name = "E2E Provider"',
    'base_url = "https://e2e.invalid/v1"',
    'wire_api = "responses"',
    "",
  ].join("\n"));

  const executable = resolve(process.cwd(), "src-tauri/target/release/kumoswitch.exe");
  const cdp = "http://127.0.0.1:9229";
  let stderr = "";
  app = spawn(executable, [], {
    env: {
      ...process.env,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      CODEX_HOME: join(home, ".codex"),
      TEMP: join(root, "tmp"),
      TMP: join(root, "tmp"),
      // WRY forwards this to WebView2, enabling the CDP endpoint used below.
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9229",
    },
    stdio: "pipe",
  });
  app.stderr?.on("data", (chunk) => { stderr += String(chunk); });
  app.stdout?.on("data", (chunk) => { stderr += String(chunk); });
  await waitForCdp(cdp, app, () => stderr);
  browser = await chromium.connectOverCDP(cdp);
});

test.afterAll(async () => {
  await browser?.close().catch(() => {});
  if (app?.pid && process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* already exited */
    }
  }
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500));
  if (root) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch {
      // Windows can keep WebView2 profile files locked briefly after process exit.
    }
  }
});

test("real Tauri WebView loads providers through Tauri IPC", async () => {
  expect(browser).toBeTruthy();
  const context = browser!.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  await expect(page).toHaveTitle(/kumoSwitch/i);
  await page.evaluate(() => {
    localStorage.setItem("kumoswitch.onboarded", "1");
    localStorage.setItem("kumoswitch.lang", "zh");
    localStorage.setItem("kumoswitch.accessibility", JSON.stringify({ uiMode: "advanced" }));
  });
  await page.reload();
  await expect(page).toHaveTitle(/kumoSwitch/i);
  await page.getByRole("button", { name: /Codex/ }).first().click();
  const providerButton = page.getByRole("button", { name: "查看供應商 E2E Provider 的模型與設定" });
  const importButton = page.getByRole("button", { name: /^從設定檔導入/ });
  const skipOnboarding = page.getByRole("button", { name: "略過，稍後再說" });
  try {
    await expect(importButton.or(skipOnboarding)).toBeVisible({ timeout: 10_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(async () => {
      const internals = (window as any).__TAURI_INTERNALS__;
      const invoke = async (cmd: string, args?: Record<string, unknown>) => {
        try {
          return await internals.invoke(cmd, args);
        } catch (invokeError) {
          return { invokeError: String(invokeError) };
        }
      };
      return {
        url: location.href,
        hash: location.hash,
        body: document.body.innerText.slice(0, 3000),
        localStorage: { ...localStorage },
        appInfo: await invoke("app_info"),
        tools: await invoke("tool_list"),
        providers: await invoke("provider_list", { tool: "codex" }),
      };
    });
    throw new Error(`${String(error)}\nTAURI_DIAGNOSTIC=${JSON.stringify(diagnostic)}`);
  }
  if (await skipOnboarding.isVisible()) await skipOnboarding.click();
  await expect(importButton).toBeVisible();
  if (!await providerButton.isVisible()) {
    await importButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /掃描到 \d+ 個供應商/ })).toBeVisible();
    await dialog.getByRole("button", { name: /^匯入 \d+ 個/ }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(providerButton).toBeVisible();
  await providerButton.click();
  await expect(page.getByRole("heading", { name: "供應商詳情 · Codex" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^模型/ })).toBeVisible();
  const editor = page.getByRole("dialog");
  await editor.getByRole("tab", { name: /^模型/ }).click();
  await expect(editor.getByLabel("搜尋目前供應商的模型")).toBeVisible();
  await editor.getByLabel("思考等級 e2e-model", { exact: true }).selectOption("high");
  await editor.getByRole("button", { name: "儲存並預覽" }).click();
  const reasoningDiff = page.getByRole("dialog").filter({ hasText: "套用「E2E Provider」到 Codex" });
  await expect(reasoningDiff.locator("pre.diff")).toContainText('model_reasoning_effort = "high"');
  await reasoningDiff.getByRole("button", { name: "取消" }).click();

  await page.getByRole("button", { name: /^設定/ }).first().click();
  const settings = page.getByRole("dialog").last();
  await settings.getByRole("tab", { name: /^(進階|Advanced)$/ }).click();
  await settings.getByRole("button", { name: /工具管理/ }).click();
  await expect(page.getByRole("heading", { name: "工具安裝與管理" })).toBeVisible();
  await page.getByRole("button", { name: /其他工具/ }).click();
  await expect(page.locator(".rail .harness-icon")).toHaveCount(15);
  await expect(page.locator(".harness-manager-card")).toHaveCount(15);
  await expect(page.getByRole("article", { name: "工具 Codex" })).toContainText("CLI + 桌面版");

  await page.locator(".rail .tool").filter({ has: page.locator("b", { hasText: "Codex" }) }).first().click();
  await page.getByRole("button", { name: /新增供應商/ }).click();
  await page.getByRole("button", { name: /瀏覽供應商目錄/ }).click();
  await expect(page.locator(".provider-chooser")).toBeVisible();
  const chooserGeometry = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(".modal.top .sheet")!;
    const results = document.querySelector<HTMLElement>(".provider-results")!;
    const foot = document.querySelector<HTMLElement>(".modal.top .sheet-foot")!;
    results.scrollTop = 420;
    return {
      footerGap: Math.abs(sheet.getBoundingClientRect().bottom - foot.getBoundingClientRect().bottom),
      resultsScrollTop: results.scrollTop,
    };
  });
  expect(chooserGeometry.footerGap).toBeLessThanOrEqual(2);
  expect(chooserGeometry.resultsScrollTop).toBeGreaterThan(0);
});
