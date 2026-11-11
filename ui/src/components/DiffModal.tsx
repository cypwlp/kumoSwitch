import { useMemo } from "react";
import type { FileDiff, Preview, Provider, ToolView } from "../types";
import { parseDiff } from "../diff";
import { Modal } from "./Modal";
import { WarnIcon } from "./Icons";

function DiffBlock({ file }: { file: FileDiff }) {
  const lines = useMemo(() => parseDiff(file.diff, file.fmt), [file.diff, file.fmt]);
  return (
    <>
      <div className="diff-head">
        <code>{file.file}</code>
        <span className="badge subtle">{file.fmt}</span>
        <span className="diff-stat">
          <span className="add">+{file.added}</span> / <span className="del">-{file.removed}</span>
        </span>
        {file.existed ? null : <span className="badge warn">檔案不存在，將新建</span>}
      </div>
      <pre className="diff">
        {lines.map((line, index) => (
          <span key={index} className={`line ${line.kind}`}>
            {line.tokens.map((token, t) => (
              <span key={t} className={`t-${token.cls}`}>
                {token.text}
              </span>
            ))}
          </span>
        ))}
      </pre>
    </>
  );
}

interface DiffProps {
  tool: ToolView;
  provider: Provider;
  preview: Preview;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DiffModal({ tool, provider, preview, busy, onCancel, onConfirm }: DiffProps) {
  return (
    <Modal
      title={`套用「${provider.name}」到 ${tool.name}`}
      onClose={onCancel}
      footer={
        <>
          <button className="ghost" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button className="primary" onClick={onConfirm} disabled={busy} data-autofocus>
            {busy ? <span className="spin" /> : null} 確認套用
          </button>
        </>
      }
    >
      {preview.warnings.length ? (
        <div className="warn-box">
          <h4>
            <WarnIcon /> 套用前請注意（{preview.warnings.length}）
          </h4>
          <ul>
            {preview.warnings.map((w, index) => (
              <li key={index}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="note">
        以下是實際會寫入的變更。只列出被修改的行；未列出的內容一個字都不會動。寫入前會自動建立時間戳備份。
      </div>

      {preview.files.map((file) => (
        <DiffBlock key={file.file} file={file} />
      ))}
    </Modal>
  );
}