import { useEffect, useMemo, useState } from "react";
import { api, errorText } from "../api";
import type { Provider, ProxyConfig, ToolView } from "../types";

interface Props {
  onError: (m: string) => void;
  onToast: (m: string, kind?: "ok" | "err") => void;
}

export function ProxyView({ onError, onToast }: Props) {
  const [config, setConfig] = useState<ProxyConfig>({ enabled: false, port: 17890, stack: [] });
  const [tools, setTools] = useState<ToolView[]>([]);
  const [providers, setProviders] = useState<Record<string, Provider[]>>({});
  const [attachTool, setAttachTool] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cfg, ts] = await Promise.all([api.proxyStatus(), api.toolList()]);
        if (!alive) return;
        setConfig(cfg);
        setTools(ts);
        const map: Record<string, Provider[]> = {};
        for (const t of ts) map[t.id] = await api.providerList(t.id);
        if (alive) setProviders(map);
      } catch (err) {
        onError(errorText(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [onError]);

  const all = useMemo(() => {
    const rows: { ref: string; label: string }[] = [];
    for (const t of tools) {
      for (const p of providers[t.id] ?? []) {
        rows.push({ ref: `${t.id}:${p.id}`, label: `${t.name} · ${p.name}` });
      }
    }
    // keep chosen order first, then the rest
    const chosen = config.stack.map((r) => rows.find((x) => x.ref === r)).filter(Boolean) as { ref: string; label: string }[];
    const rest = rows.filter((x) => !config.stack.includes(x.ref));
    return [...chosen, ...rest];
  }, [tools, providers, config.stack]);

  const toggle = (ref: string) =>
    setConfig((c) => ({
      ...c,
      stack: c.stack.includes(ref) ? c.stack.filter((x) => x !== ref) : [...c.stack, ref],
    }));

  const save = async () => {
    setBusy(true);
    try {
      const saved = await api.proxySave(config);
      setConfig(saved);
      onToast(saved.enabled ? `代理已啟動於 127.0.0.1:${saved.port}` : "代理已關閉", "ok");
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    if (!attachTool) return;
    setBusy(true);
    try {
      const r = await api.proxyAttach(attachTool);
      onToast(r.message, "ok");
    } catch (err) {
      onError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stats">
      <header className="stats-head">
        <h2>代理／故障轉移</h2>
        <span className="muted small">本地反向代理，依序備援；Beta</span>
      </header>

      <div className="proxy-row">
        <label className="onboard-item on" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))} />
          <span className="onboard-name">啟用代理</span>
        </label>
        <div className="field" style={{ margin: 0, width: 120 }}>
          <label>連接埠</label>
          <input type="number" value={config.port} onChange={(e) => setConfig((c) => ({ ...c, port: Number(e.target.value) || 17890 }))} />
        </div>
        <div className="spacer" />
        <button className="primary" onClick={() => void save()} disabled={busy}>儲存並套用</button>
      </div>

      <h3 className="stats-sub">備援順序（勾選加入，順序即故障轉移順序）</h3>
      <div className="proxy-stack">
        {all.length === 0 ? (
          <div className="empty small">還沒有供應商，先到各工具新增或導入</div>
        ) : (
          all.map((row) => {
            const idx = config.stack.indexOf(row.ref);
            return (
              <label key={row.ref} className={`onboard-item${idx >= 0 ? " on" : ""}`}>
                <input type="checkbox" checked={idx >= 0} onChange={() => toggle(row.ref)} />
                {idx >= 0 ? <span className="badge ok">#{idx + 1}</span> : null}
                <span className="onboard-name">{row.label}</span>
              </label>
            );
          })
        )}
      </div>

      <h3 className="stats-sub">把工具掛載到代理</h3>
      <div className="proxy-row">
        <select className="mini-select" value={attachTool} onChange={(e) => setAttachTool(e.target.value)}>
          <option value="">選擇工具…</option>
          {tools.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={() => void attach()} disabled={busy || !attachTool}>
          寫入代理設定
        </button>
        <span className="muted small">會把該工具的 base URL 指向 127.0.0.1:{config.port}/v1</span>
      </div>
      <p className="fineprint">
        代理只轉發到你勾選的供應商；連線錯誤、429、5xx 會自動換下一個。回應串流穿透。金鑰由代理注入，不寫進工具設定。
      </p>
    </section>
  );
}
