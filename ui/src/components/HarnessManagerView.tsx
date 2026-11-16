import { useEffect, useMemo, useState } from "react";
import { api, errorText } from "../api";
import type { HarnessInstallResult, HarnessManagerEntry } from "../types";
import { HarnessIcon } from "./Marks";
import { Modal } from "./Modal";

type Filter = "all" | "missing" | "cli" | "desktop";

export function HarnessManagerView({
  onError,
  onToast,
  onChanged,
}: {
  onError: (message: string) => void;
  onToast: (message: string) => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<HarnessManagerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [installTarget, setInstallTarget] = useState<HarnessManagerEntry | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installResult, setInstallResult] = useState<HarnessInstallResult | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setEntries(await api.harnessManager());
    } catch (error) {
      onError(errorText(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filter === "missing" && entry.installed) return false;
      if (filter === "cli" && entry.surface === "desktop") return false;
      if (filter === "desktop" && entry.surface === "cli") return false;
      if (!q) return true;
      return [
        entry.id,
        entry.name,
        entry.blurb,
        entry.config_path,
        entry.cli_path ?? "",
        entry.install_package ?? "",
        entry.desktop_note,
      ].join(" ").toLowerCase().includes(q);
    });
  }, [entries, filter, query]);

  const summary = useMemo(() => ({
    total: entries.length,
    installed: entries.filter((entry) => entry.installed).length,
    cli: entries.filter((entry) => entry.surface !== "desktop").length,
    desktop: entries.filter((entry) => entry.surface !== "cli").length,
    installable: entries.filter((entry) => entry.installable).length,
  }), [entries]);

  const cliLabel = (entry: HarnessManagerEntry, action: "安裝" | "更新" | "安裝或更新") =>
    `${action} ${entry.name}${/CLI$/i.test(entry.name) ? "" : " CLI"}`;

  const openUrl = (url: string) => {
    void api.openExternalUrl(url).catch((error) => onError(errorText(error)));
  };

  const runInstall = async () => {
    if (!installTarget) return;
    const entry = installTarget;
    setInstallTarget(null);
    setInstalling(entry.id);
    try {
      const result = await api.harnessInstall(entry.id);
      setInstallResult(result);
      if (result.ok) {
        onToast(`已${entry.installed ? "更新" : "安裝"} ${entry.name} CLI`);
        await refresh();
        onChanged();
      } else {
        onError(`${entry.name} 安裝命令結束，exit code ${result.exit_code}`);
      }
    } catch (error) {
      onError(errorText(error));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <section className="harness-manager">
      <header className="harness-manager-head">
        <div>
          <span className="kicker">Tool lifecycle</span>
          <h2>工具安裝與管理</h2>
          <p>查看 CLI／桌面版支援、安裝固定套件、開啟官方下載頁，並直接跳到各工具的設定位置。</p>
        </div>
        <button className="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? <span className="spin" /> : null} 重新掃描
        </button>
      </header>

      <div className="harness-summary-grid">
        <div><span>工具</span><strong>{summary.total}</strong><small>已納入設定管理</small></div>
        <div><span>已偵測</span><strong>{summary.installed}</strong><small>CLI 或設定目錄存在</small></div>
        <div><span>CLI</span><strong>{summary.cli}</strong><small>可在終端使用</small></div>
        <div><span>桌面版</span><strong>{summary.desktop}</strong><small>有第一方或共用設定</small></div>
        <div><span>可安裝</span><strong>{summary.installable}</strong><small>內建安全 npm 命令</small></div>
      </div>

      <div className="harness-manager-note">
        <strong>安裝邊界</strong>
        <span>kumoSwitch 只執行下方顯示的固定 npm 套件命令，不接受任意 shell script 或使用者輸入的參數。沒有安全安裝命令的工具會改開官方文件或下載頁。</span>
      </div>

      <div className="harness-toolbar">
        <div className="harness-search">
          <span aria-hidden="true">⌕</span>
          <input type="search" value={query} placeholder="搜尋工具、套件或設定路徑…" aria-label="搜尋工具" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="segmented compact" role="group" aria-label="工具篩選">
          {([
            ["all", "全部"],
            ["missing", "未安裝"],
            ["cli", "CLI"],
            ["desktop", "桌面版"],
          ] as [Filter, string][]).map(([value, label]) => (
            <button key={value} className={filter === value ? "on" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="harness-manager-grid">
        {filtered.map((entry) => (
          <article className={`harness-manager-card${entry.installed ? " installed" : ""}`} key={entry.id} aria-label={`工具 ${entry.name}`}>
            <div className="harness-card-head">
              <HarnessIcon id={entry.id} name={entry.name} size={42} />
              <div className="harness-card-title">
                <h3>{entry.name}</h3>
                <p>{entry.blurb}</p>
              </div>
              <span className={`harness-state ${entry.installed ? "on" : ""}`}>{entry.installed ? "已偵測" : "未安裝"}</span>
            </div>

            <div className="harness-badges">
              <span className={`badge surface-badge ${entry.surface}`}>{entry.surface_label}</span>
              {entry.cli_path ? <span className="badge ok">CLI 可用</span> : <span className="badge subtle">未找到 CLI</span>}
              {entry.desktop_available ? <span className="badge subtle">桌面版可取得</span> : null}
            </div>

            <dl className="harness-facts">
              <div><dt>設定檔</dt><dd><code>{entry.config_path}</code></dd></div>
              {entry.cli_path ? <div><dt>CLI</dt><dd><code title={entry.cli_path}>{entry.cli_path}</code></dd></div> : null}
              {entry.install_package ? <div><dt>套件</dt><dd><code>{entry.install_package}</code></dd></div> : null}
            </dl>

            <p className="harness-desktop-note">{entry.desktop_note}</p>

            <div className="harness-card-actions">
              {entry.installable && entry.install_command ? (
                <button className="primary small" disabled={Boolean(installing)} onClick={() => setInstallTarget(entry)} aria-label={cliLabel(entry, entry.installed ? "更新" : "安裝")}>
                  {installing === entry.id ? <span className="spin" /> : null}
                  {entry.installed ? "更新 CLI" : "安裝 CLI"}
                </button>
              ) : (
                <button className="ghost small" onClick={() => openUrl(entry.docs_url)}>官方安裝說明</button>
              )}
              {entry.desktop_available && entry.desktop_url ? (
                <button className="ghost small" onClick={() => openUrl(entry.desktop_url!)} aria-label={`取得 ${entry.name} 桌面版`}>取得桌面版</button>
              ) : null}
              <button className="ghost small" onClick={() => void api.revealPath(entry.config_dir).catch((error) => onError(errorText(error)))}>開啟設定位置</button>
              <button className="ghost small" onClick={() => openUrl(entry.website_url)}>官方網站</button>
            </div>
          </article>
        ))}
      </div>

      {!loading && filtered.length === 0 ? <div className="empty">沒有符合條件的工具。</div> : null}

      {installTarget ? (
        <Modal
          top
          narrow
          title={cliLabel(installTarget, "安裝或更新")}
          onClose={() => setInstallTarget(null)}
          footer={
            <>
              <button className="ghost" onClick={() => setInstallTarget(null)}>取消</button>
              <button className="primary" data-autofocus onClick={() => void runInstall()}>執行固定命令</button>
            </>
          }
        >
          <p className="harness-install-intro">接下來只會執行這一個預先定義的 npm 命令。安裝完成後，可能仍需重新開啟終端或桌面版。</p>
          <pre className="harness-command">{installTarget.install_command}</pre>
          <div className="note">套件來源：<strong>{installTarget.install_package}</strong>。命令不經 shell、不串接其他指令，也不會執行使用者輸入。</div>
          {installTarget.desktop_available ? <p className="muted small">{installTarget.desktop_note}</p> : null}
        </Modal>
      ) : null}

      {installResult ? (
        <Modal
          top
          narrow
          title={installResult.ok ? "工具安裝完成" : "工具安裝未完成"}
          onClose={() => setInstallResult(null)}
          footer={<button className="primary" onClick={() => setInstallResult(null)}>關閉</button>}
        >
          <div className={`note ${installResult.ok ? "" : "error"}`}>
            {installResult.ok ? "命令成功結束。" : `命令以 exit code ${installResult.exit_code} 結束。`}
          </div>
          <pre className="harness-command">{installResult.command}</pre>
          <pre className="harness-install-output">{installResult.output || "（命令沒有輸出）"}</pre>
        </Modal>
      ) : null}
    </section>
  );
}
