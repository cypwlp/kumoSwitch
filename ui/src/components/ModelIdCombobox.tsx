import { useMemo, useRef, useState } from "react";

interface Props {
  value: string;
  options: string[];
  ariaLabel: string;
  placeholder?: string;
  onFocus?: () => void;
  onChange: (value: string) => void;
  onPick: (value: string) => void;
}

export function ModelIdCombobox({ value, options, ariaLabel, placeholder, onFocus, onChange, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((id) => id.toLowerCase().includes(q)) : options;
    return [...new Set(list)].slice(0, 40);
  }, [options, value]);

  const closeSoon = () => {
    if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    blurTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  const pick = (id: string) => {
    if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
    setOpen(false);
    onPick(id);
  };

  return (
    <div className="model-id-combo">
      <input
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onFocus={() => {
          if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
          setOpen(true);
          onFocus?.();
        }}
        onBlur={closeSoon}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open && filtered.length) {
            event.preventDefault();
            pick(filtered[0]);
          }
        }}
      />
      {open && filtered.length ? (
        <div className="model-id-options" role="listbox" aria-label="候選模型">
          {filtered.map((id) => (
            <button
              type="button"
              role="option"
              aria-selected={value === id}
              key={id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(id)}
            >
              {id}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
