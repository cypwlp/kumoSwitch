import { useMemo, useState } from "react";
import { api } from "../api";
import type { AppInfo, ToolView, UsageReport } from "../types";
import { Modal } from "./Modal";
import { t } from "../i18n";

type FeedbackKind = "bug" | "idea" | "confusing" | "other";

interface Props {
  info: AppInfo | null;
  tools: ToolView[];
  report: UsageReport | null;
  busy: boolean;
  onCancel: () => void;
  onToast: (message: string, kind?: "ok" | "err") => void;
}

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: "bug", label: "問題回報" },
  { id: "idea", label: "功能想法" },
  { id: "confusing", label: "看不懂／找不到" },
  { id: "other", label: "其他" },
];

const MOODS = [
  { value: "😞", label: "不好用" },
  { value: "😐", label: "普通" },
  { value: "😊", label: "好用" },
];

export function FeedbackModal({ info, tools, report, busy, onCancel, onToast }: Props) {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [mood, setMood] = useState("");
  const [message, setMessage] = useState("");
  const [attachDiagnostics, setAttachDiagnostics] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const diagnostics = useMemo(() => {
    const lines = [
      `kumoSwitch ${info?.version ?? "unknown"}`,
      `OS: ${navigator.userAgent}`,
      `Theme: ${document.documentElement.dataset.theme ?? "unknown"} / accent=${document.documentElement.dataset.accent ?? "unknown"}`,
      `Language: ${document.documentElement.lang}`,
      `Providers: ${tools.reduce((sum, tool) => sum + tool.provider_count, 0)} across ${tools.length} tools`,
      `Detected tools: ${tools.filter((tool) => tool.detected).map((tool) => tool.name).join(", ") || "none"}`,
    ];
    if (report) {
      lines.push(`Usage scan: ${report.files} files, ${report.records} records, ${report.elapsed_ms}ms, skipped ${report.skipped_files}`);
    }
    return lines.join("\n");
  }, [info, tools, report]);

  const payload = useMemo(() => {
    const kindLabel = KINDS.find((item) => item.id === kind)?.label ?? kind;
    return [
      `【kumoSwitch 回饋 · ${kindLabel}】`,
      mood ? `心情：${mood}` : "",
      "",
      message.trim() || "（未填寫描述）",
      "",
      attachDiagnostics ? "--- 診斷摘要（不含金鑰／prompt／對話內容）---" : "",
      attachDiagnostics ? diagnostics : "",
    ].filter(Boolean).join("\n");
  }, [kind, mood, message, attachDiagnostics, diagnostics]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      onToast(t("回饋內容已複製"), "ok");
    } catch {
      setCopied(false);
      onToast(t("複製失敗，請改用預覽手動複製"), "err");
    }
  };

  const openIssue = async () => {
    const title = `[${kind}] ${message.trim().slice(0, 60) || "kumoSwitch feedback"}`;
    const url = `https://github.com/cypwlp/kumoSwitch/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(payload)}`;
    try {
      await api.openExternalUrl(url);
      onToast(t("已開啟 GitHub，送出前請再檢查內容"), "ok");
    } catch (error) {
      onToast(t("無法開啟 GitHub，請改用複製"), "err");
    }
  };

  return (
    <Modal
      title={t("提供回饋")}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel} disabled={busy}>{t("取消")}</button>
          <span className="spacer" />
          <button className="ghost" onClick={() => setShowPreview((value) => !value)}>{showPreview ? t("隱藏預覽") : t("預覽內容")}</button>
          <button className="ghost" onClick={() => void copy()} disabled={busy}>{copied ? t("已複製") : t("複製到剪貼簿")}</button>
          <button className="primary" onClick={() => void openIssue()} disabled={busy}>{t("開啟 GitHub Issue")}</button>
        </>
      }
    >
      <div className="feedback-form">
        <div className="settings-choice-row">
          <span>{t("類型")}</span>
          <div className="segmented compact" role="group" aria-label={t("回饋類型")}>
            {KINDS.map((item) => (
              <button key={item.id} type="button" className={kind === item.id ? "on" : ""} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>
                {t(item.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="settings-choice-row">
          <span>{t("整體感受（選填）")}</span>
          <div className="segmented compact" role="group" aria-label={t("整體感受")}>
            {MOODS.map((item) => (
              <button key={item.value} type="button" className={mood === item.value ? "on" : ""} aria-pressed={mood === item.value} onClick={() => setMood(mood === item.value ? "" : item.value)} title={t(item.label)}>
                {item.value}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>{t("你想說什麼？")}</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("哪裡卡住、預期什麼、實際發生什麼…")}
            rows={5}
          />
        </label>
        <label className="quick-add-check">
          <input type="checkbox" checked={attachDiagnostics} onChange={(event) => setAttachDiagnostics(event.target.checked)} />
          <span>{t("附上診斷摘要（不含 API Key、prompt 或對話內容）")}</span>
        </label>
        <p className="fineprint">{t("所有內容只會在本機產生；按下複製或開啟 GitHub 後，由你決定是否送出。kumoSwitch 不會自動上傳任何回饋。")}</p>
        {showPreview ? <pre className="feedback-preview">{payload}</pre> : null}
      </div>
    </Modal>
  );
}
