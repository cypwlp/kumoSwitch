import { Modal } from "./Modal";

interface Props {
  ccSwitchBridge: boolean;
  onExport: () => void;
  onImport: () => void;
  onScanConfigs: () => void;
  onOpenCompatSettings: () => void;
  onClose: () => void;
}

export function MigrationModal({
  ccSwitchBridge,
  onExport,
  onImport,
  onScanConfigs,
  onOpenCompatSettings,
  onClose,
}: Props) {
  return (
    <Modal
      title="搬家中心"
      onClose={onClose}
      footer={<button className="ghost" onClick={onClose}>關閉</button>}
    >
      <div className="migration-steps">
        <section className="migration-step">
          <span className="migration-num">1</span>
          <div>
            <h4>先備份現在的設定</h4>
            <p>把 current providers 加密匯出成 .kumoswitch；換機或直接升級前都能還原。</p>
            <div className="migration-actions">
              <button className="ghost small" onClick={onExport}>匯出加密清單</button>
              <button className="ghost small" onClick={onImport}>匯入清單</button>
            </div>
          </div>
        </section>
        <section className="migration-step">
          <span className="migration-num">2</span>
          <div>
            <h4>從官方設定檔帶入</h4>
            <p>只讀取各工具自己的設定檔（TOML / JSON / YAML），逐項預覽後再匯入。</p>
            <div className="migration-actions">
              <button className="primary small" onClick={onScanConfigs}>掃描所有工具設定</button>
            </div>
          </div>
        </section>
        <section className="migration-step">
          <span className="migration-num">3</span>
          <div>
            <h4>第三方相容匯入（選用）</h4>
            <p>
              預設關閉。只有你明確開啟後才會讀取本機相容資料庫；只讀、不上傳、不修改。
              {ccSwitchBridge ? "目前已開啟。" : "目前未開啟。"}
            </p>
            <div className="migration-actions">
              <button className="ghost small" onClick={onOpenCompatSettings}>前往相容匯入設定</button>
            </div>
          </div>
        </section>
      </div>
      <p className="fineprint">kumoSwitch 與任何第三方切換工具都沒有官方合作或背書關係。相容匯入使用前請自行確認第三方工具的條款。</p>
    </Modal>
  );
}
