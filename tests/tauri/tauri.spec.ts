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
  writeFileSync(join(dataDir, "providers.json"), JSON.stringify({
    providers: {
      codex: [{
        id: "e2e-provider",
        config_id: "e2e-provider",
        name: "E2E Provider",
        base_url: "https://e2e.invalid/v1",
        model: "e2e-model",
        models: [{ id: "e2e-model", name: "E2E Model" }],
        kind: "responses",
        note: "real Tauri smoke test",
        last_used: 0,
      }],
    },
    active: {},
    previous_active: {},
    auto_health: false,
    proxy: { enabled: false, port: 27891, stack: [], strategy: "ordered", policies: {} },
  }, null, 2));
  writeFileSync(join(home, ".codex", "config.toml"), 'model = "e2e-model"\nmodel_provider = "e2e-provider"\n');

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
  if (root) rmSync(root, { recursive: true, force: true });
});

test("real Tauri WebView loads providers through Tauri IPC", async () => {
  expect(browser).toBeTruthy();
  const context = browser!.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  await expect(page).toHaveTitle(/kumoSwitch/i);
  await page.evaluate(() => localStorage.setItem("kumoswitch.onboarded", "1"));
  await page.reload();
  await expect(page).toHaveTitle(/kumoSwitch/i);
  await page.getByRole("button", { name: /Codex/ }).first().click();
  await expect(page.getByRole("button", { name: "查看供應商 E2E Provider 的模型與設定" })).toBeVisible();
  await page.getByRole("button", { name: "查看供應商 E2E Provider 的模型與設定" }).click();
  await expect(page.getByRole("heading", { name: "供應商詳情 · Codex" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /^模型/ })).toBeVisible();
});
