import { MOCK } from "./api";

export type UpdateCheck =
  | { kind: "idle" }
  | { kind: "none" }
  | { kind: "available"; version: string; notes?: string }
  | { kind: "error"; message: string };

type UpdaterModule = typeof import("@tauri-apps/plugin-updater");
type PendingUpdate = Awaited<ReturnType<UpdaterModule["check"]>>;

let pending: PendingUpdate = null;

async function loadUpdater(): Promise<UpdaterModule | null> {
  if (MOCK) return null;
  try {
    return await import("@tauri-apps/plugin-updater");
  } catch {
    return null;
  }
}

/** Ask the release endpoint whether a newer signed build exists. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const mod = await loadUpdater();
  if (!mod) return { kind: "error", message: "此環境不支援自動更新" };
  try {
    const update = await mod.check();
    if (!update) {
      pending = null;
      return { kind: "none" };
    }
    pending = update;
    return { kind: "available", version: update.version, notes: update.body ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "error", message: shorter(message) };
  }
}

function shorter(message: string) {
  if (/could not fetch|failed to fetch|dns|404|Not Found/i.test(message)) {
    return "更新來源尚未發佈（或網路不可達）";
  }
  return message.length > 120 ? `${message.slice(0, 120)}…` : message;
}

/** Download, verify the signature and install, then relaunch. */
export async function installUpdate(onProgress: (percent: number) => void): Promise<void> {
  const update = pending;
  if (!update) throw new Error("沒有可安裝的更新");
  let downloaded = 0;
  let total = 0;
  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? 0;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (total > 0) onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
    } else if (event.event === "Finished") {
      onProgress(100);
    }
  });
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    onProgress(100);
  }
}
