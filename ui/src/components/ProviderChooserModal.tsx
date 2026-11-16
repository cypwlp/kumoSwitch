import { useMemo, useState } from "react";
import type { Preset, ToolView } from "../types";
import { Modal } from "./Modal";
import { ProviderMark } from "./Marks";

type Category = "all" | Preset["category"];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "account", label: "帳號登入" },
  { id: "official", label: "模型廠商" },
  { id: "third_party", label: "第三方平台" },
  { id: "cloud", label: "雲服務商" },
  { id: "local", label: "本機" },
  { id: "unified", label: "跨應用" },
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProviderChooserModal({
  tool,
  presets,
  onPick,
  onCustom,
  onClose,
}: {
  tool: ToolView;
  presets: Preset[];
  onPick: (preset: Preset) => void;
  onCustom: () => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const result = new Map<Category, number>([["all", presets.length]]);
    for (const preset of presets) {
      result.set(preset.category, (result.get(preset.category) ?? 0) + 1);
    }
    return result;
  }, [presets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return presets.filter((preset) => {
      if (category !== "all" && preset.category !== category) return false;
      if (!q) return true;
      return [
        preset.name,
        preset.base_url,
        preset.note,
        preset.website_url,
        preset.docs,
        ...preset.models,
      ].join(" ").toLowerCase().includes(q);
    });
  }, [category, presets, query]);

  const groups = category === "all"
    ? CATEGORIES.filter((item) => item.id !== "all")
        .map((item) => ({
          ...item,
          items: visible.filter((preset) => preset.category === item.id),
        }))
        .filter((group) => group.items.length > 0)
    : [{ id: category, label: CATEGORIES.find((item) => item.id === category)?.label ?? "供應商", items: visible }];

  return (
    <Modal
      top
      title={<>新增供應商 <span className="muted">· {tool.name}</span></>}
      onClose={onClose}
      footer={
        <span className="provider-chooser-footnote">
          選取後仍可修改。只有按下儲存、檢視 diff 並確認後才會寫入 {tool.name} 設定。
        </span>
      }
    >
      <div className="provider-chooser">
        <div className="provider-chooser-search">
          <span aria-hidden="true">⌕</span>
          <input
            data-autofocus
            type="search"
            value={query}
            placeholder="搜尋名稱、Base URL、模型，例如 Kimi、OpenRouter…"
            aria-label="搜尋供應商"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button className="ghost small" onClick={() => setQuery("")}>清除</button> : null}
        </div>

        <div className="provider-chooser-layout">
          <nav className="provider-categories" aria-label="供應商分類">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                className={category === item.id ? "active" : ""}
                aria-pressed={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                <span>{item.label}</span>
                <b>{counts.get(item.id) ?? 0}</b>
              </button>
            ))}
          </nav>

          <div className="provider-results">
            {category === "all" && !query ? (
              <button className="provider-custom-card" aria-label="使用自訂配置" onClick={onCustom}>
                <ProviderMark icon="custom" name="自訂配置" color="#38bdf8" size={42} />
                <span>
                  <strong>自訂配置</strong>
                  <small>手動填寫請求地址、API Key 與模型</small>
                </span>
                <span className="provider-card-arrow" aria-hidden="true">→</span>
              </button>
            ) : null}

            {groups.map((group) => (
              <section className="provider-group" key={group.id} aria-labelledby={`provider-group-${group.id}`}>
                <div className="provider-group-head">
                  <h4 id={`provider-group-${group.id}`}>{group.label}</h4>
                  <span>{group.items.length}</span>
                </div>
                <div className="provider-card-grid">
                  {group.items.map((preset) => (
                    <button
                      key={preset.id}
                      className="provider-card"
                      aria-label={`選擇供應商 ${preset.name}`}
                      onClick={() => onPick(preset)}
                    >
                      <ProviderMark icon={preset.icon} name={preset.name} color={preset.icon_color} />
                      <span className="provider-card-copy">
                        <span className="provider-card-title">
                          <strong>{preset.name}</strong>
                          {preset.requires_routing ? <span className="badge warn">需要路由</span> : null}
                        </span>
                        <small>{preset.auth_type === "oauth" ? preset.note : hostOf(preset.website_url || preset.base_url)}</small>
                        {preset.models.length ? <span className="provider-card-models">{preset.models.length} 個預設模型</span> : null}
                        {preset.auth_type === "oauth" ? <span className="provider-card-auth">帳號登入</span> : null}
                      </span>
                      <span className="provider-card-arrow" aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}

            {visible.length === 0 ? (
              <div className="provider-empty">
                <strong>找不到符合的供應商</strong>
                <span>試試名稱、網址或模型 ID；也可以直接使用自訂配置。</span>
                <button className="ghost" onClick={onCustom}>使用自訂配置</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}
