import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import { useFocusLayer } from "../focus";
import type { ModelProfile, Provider, ToolView } from "../types";

interface Props {
  tools: ToolView[];
  onPick: (tool: ToolView, provider: Provider, model?: ModelProfile) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

interface Row {
  tool: ToolView;
  provider: Provider;
  model?: ModelProfile;
}

/** Ctrl+K: jump to any provider of any tool without touching the rail. */
export function CommandPalette({ tools, onPick, onClose, onError }: Props) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const paletteRef = useRef<HTMLDivElement>(null);
  useFocusLayer(paletteRef, onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      const collected: Row[] = [];
      try {
        const index = await api.providerSearchIndex();
        if (!alive) return;
        const byId = new Map(tools.map((tool) => [tool.id, tool]));
        for (const row of index) {
          const tool = byId.get(row.tool) ?? { id: row.tool, name: row.tool_name } as ToolView;
          collected.push({ tool, provider: row.provider });
          for (const model of row.provider.models ?? []) {
            if (!model.archived) collected.push({ tool, provider: row.provider, model });
          }
        }
      } catch (err) {
        onErrorRef.current(errorText(err));
      }
      if (alive) {
        setRows(collected);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tools]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter((row) =>
          [row.provider.name, row.provider.base_url, row.provider.model, row.tool.name, row.model?.id, row.model?.name]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : rows.filter((row) => !row.model);
    return list.slice(0, 80);
  }, [rows, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const commit = (row: Row | undefined) => {
    if (!row) return;
    onPick(row.tool, row.provider, row.model);
  };

  return (
    <div
      className="palette-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="快速切換" ref={paletteRef} tabIndex={-1}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="跳到任何供應商…（輸入名稱、模型或工具）"
          value={query}
          role="combobox"
          aria-label="搜尋供應商"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls="palette-provider-list"
          aria-activedescendant={matches[cursor] ? `palette-option-${cursor}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              commit(matches[cursor]);
            }
          }}
        />
        <div className="palette-list" id="palette-provider-list" role="listbox">
          {matches.length === 0 ? (
            <div className="palette-empty">
              {loading ? "正在讀取供應商與模型…" : rows.length === 0 ? "還沒有任何供應商" : "沒有符合的供應商"}
            </div>
          ) : (
            matches.map((row, index) => (
              <button
                key={`${row.tool.id}-${row.provider.id}-${row.model?.id ?? "provider"}`}
                id={`palette-option-${index}`}
                role="option"
                aria-selected={index === cursor}
                className={`palette-row${index === cursor ? " active" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => commit(row)}
              >
                <span className="palette-tool">{row.tool.name}</span>
                <span className="palette-name">{row.provider.name}</span>
                {row.model ? (
                  <span className="palette-model mono">{row.model.favorite ? "★ " : ""}{row.model.name || row.model.id}</span>
                ) : (
                  <span className="palette-url mono">{row.provider.base_url}</span>
                )}
                {row.model ? <span className="palette-url mono">{row.model.id}</span> : row.provider.model ? <span className="palette-model mono">{row.provider.model}</span> : null}
                {row.tool.active_id === row.provider.id && (!row.model || row.provider.model === row.model.id) ? <span className="badge ok">使用中</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 移動</span>
          <span><kbd>Enter</kbd> 查看 diff</span>
          <span><kbd>Esc</kbd> 關閉</span>
        </div>
      </div>
    </div>
  );
}
