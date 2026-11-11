import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText } from "../api";
import type { Provider, ToolView } from "../types";

interface Props {
  tools: ToolView[];
  onPick: (tool: ToolView, provider: Provider) => void;
  onClose: () => void;
  onError: (message: string) => void;
}

interface Row {
  tool: ToolView;
  provider: Provider;
}

/** Ctrl+K: jump to any provider of any tool without touching the rail. */
export function CommandPalette({ tools, onPick, onClose, onError }: Props) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const collected: Row[] = [];
      for (const tool of tools.filter((t) => t.provider_count > 0)) {
        try {
          const list = await api.providerList(tool.id);
          if (!alive) return;
          for (const provider of list) collected.push({ tool, provider });
        } catch (err) {
          onError(errorText(err));
        }
      }
      if (alive) setRows(collected);
    })();
    return () => {
      alive = false;
    };
  }, [tools, onError]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter((row) =>
          [row.provider.name, row.provider.base_url, row.provider.model, row.tool.name]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : rows;
    return list.slice(0, 60);
  }, [rows, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  const commit = (row: Row | undefined) => {
    if (!row) return;
    onPick(row.tool, row.provider);
  };

  return (
    <div
      className="palette-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="快速切換">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="跳到任何供應商…（輸入名稱、模型或工具）"
          value={query}
          aria-label="搜尋供應商"
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
        <div className="palette-list" role="listbox">
          {matches.length === 0 ? (
            <div className="palette-empty">
              {rows.length === 0 ? "還沒有任何供應商" : "沒有符合的供應商"}
            </div>
          ) : (
            matches.map((row, index) => (
              <button
                key={`${row.tool.id}-${row.provider.id}`}
                role="option"
                aria-selected={index === cursor}
                className={`palette-row${index === cursor ? " active" : ""}`}
                onMouseEnter={() => setCursor(index)}
                onClick={() => commit(row)}
              >
                <span className="palette-tool">{row.tool.name}</span>
                <span className="palette-name">{row.provider.name}</span>
                <span className="palette-url mono">{row.provider.base_url}</span>
                {row.provider.model ? <span className="palette-model mono">{row.provider.model}</span> : null}
                {row.tool.active_id === row.provider.id ? <span className="badge ok">使用中</span> : null}
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
