import {
  ANIMAL_AUTOCOMPLETE_MENU_ATTR,
  filterAnimalAutocompleteCandidates,
  shouldClearAutocompleteSelection,
  shouldShowAnimalAutocompleteDropdown,
  type AnimalAutocompleteRow,
} from "@shared/animalAutocomplete";
import {
  labelAnimalBusca,
  labelSexoAnimal,
  sexoDotClassName,
  subtituloAnimalBusca,
  withSexoNoSubtitulo,
} from "@shared/animalBuscaDisplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

function SexoBolinha({ sexo }: { sexo?: string | null }) {
  const cls = sexoDotClassName(sexo);
  if (!cls) return null;
  return (
    <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} aria-hidden />
  );
}

const defaultInputCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";

export type AnimalAutocompleteProps<T extends AnimalAutocompleteRow> = {
  label?: React.ReactNode;
  required?: boolean;
  selected: T | null;
  onSelect: (animal: T | null) => void;
  animals: T[];
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  hintMessage?: string;
  errorMessage?: string;
  filterCandidate?: (animal: T) => boolean;
  getOptionLabel?: (animal: T) => string;
  getOptionSubtitle?: (animal: T) => string;
  limit?: number;
  inputClassName?: string;
  /** Quando informado, substitui o chip padrão de seleção. */
  renderSelected?: (animal: T, onClear: () => void) => React.ReactNode;
};

export function AnimalAutocomplete<T extends AnimalAutocompleteRow>({
  label,
  required,
  selected,
  onSelect,
  animals,
  loading = false,
  disabled = false,
  placeholder = "Buscar por brinco, RFID ou nome…",
  emptyMessage = "Nenhum animal encontrado.",
  hintMessage,
  errorMessage,
  filterCandidate,
  getOptionLabel = labelAnimalBusca,
  getOptionSubtitle = subtituloAnimalBusca,
  limit = 40,
  inputClassName = defaultInputCls,
  renderSelected,
}: AnimalAutocompleteProps<T>) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(
    () =>
      filterAnimalAutocompleteCandidates(animals, {
        search,
        limit,
        isCandidate: filterCandidate,
      }),
    [animals, search, limit, filterCandidate],
  );

  const dropdownVisible = shouldShowAnimalAutocompleteDropdown({
    open,
    disabled,
    selected,
  });

  useEffect(() => {
    if (!dropdownVisible) setHighlightIndex(0);
    else if (highlightIndex >= options.length) setHighlightIndex(0);
  }, [dropdownVisible, options.length, highlightIndex]);

  /** Sincroniza busca quando o pai limpa a seleção (ex.: após registrar cobertura no curral). */
  useEffect(() => {
    if (selected == null) {
      setSearch("");
      setOpen(false);
    }
  }, [selected]);

  const updateMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el || typeof document === "undefined") return;
    const dialog = el.closest("[data-slot=dialog-content]") as HTMLElement | null;
    const root = dialog ?? document.body;
    setPortalRoot(root);
    const rect = el.getBoundingClientRect();
    if (dialog) {
      const rootRect = dialog.getBoundingClientRect();
      setMenuStyle({
        top: rect.bottom - rootRect.top + 4,
        left: rect.left - rootRect.left,
        width: rect.width,
      });
      return;
    }
    setMenuStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!dropdownVisible) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    const onReposition = () => updateMenuPosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [dropdownVisible, options.length, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleClear = useCallback(() => {
    onSelect(null);
    setSearch("");
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onSelect]);

  const handlePick = useCallback(
    (animal: T) => {
      onSelect(animal);
      setSearch(getOptionLabel(animal));
      setOpen(false);
    },
    [getOptionLabel, onSelect],
  );

  const handleSearchChange = (next: string) => {
    setSearch(next);
    setOpen(true);
    if (shouldClearAutocompleteSelection(next, selected, getOptionLabel)) {
      onSelect(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownVisible) {
      if (e.key === "Escape") setOpen(false);
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !disabled) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, Math.max(0, options.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = options[highlightIndex];
      if (picked) handlePick(picked);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (selected) {
    if (renderSelected) return <>{renderSelected(selected, handleClear)}</>;
    return (
      <div>
        {label ? (
          <label className="block text-[11px] text-gray-600 font-medium mb-1">
            {label}
            {required ? <span className="text-red-500">*</span> : null}
          </label>
        ) : null}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <SexoBolinha sexo={selected.sexo} />
            <span className="text-[12px] font-semibold text-gray-800 truncate">
              {getOptionLabel(selected)}
            </span>
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] font-semibold text-gray-500 hover:text-gray-700"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-30" ref={containerRef}>
      {label ? (
        <label className="block text-[11px] text-gray-600 font-medium mb-1">
          {label}
          {required ? <span className="text-red-500">*</span> : null}
        </label>
      ) : null}
      <input
        ref={inputRef}
        type="search"
        value={search}
        onChange={e => handleSearchChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={dropdownVisible}
        aria-autocomplete="list"
      />
      {dropdownVisible && menuStyle && portalRoot
        ? createPortal(
            <ul
              ref={listRef}
              {...{ [ANIMAL_AUTOCOMPLETE_MENU_ATTR]: "" }}
              className="pointer-events-auto max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
              role="listbox"
              style={{
                position: "fixed",
                top: menuStyle.top,
                left: menuStyle.left,
                width: menuStyle.width,
                zIndex: 200,
                pointerEvents: "auto",
              }}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
            >
              {loading ? (
                <li className="px-3 py-2.5 text-[11px] text-gray-400">Buscando…</li>
              ) : options.length === 0 ? (
                <li className="px-3 py-2.5 text-[11px] text-gray-400">{emptyMessage}</li>
              ) : (
                options.map((a, index) => {
                  const titulo = getOptionLabel(a);
                  const sexoLabel = labelSexoAnimal(a.sexo);
                  const temBolinha = Boolean(sexoDotClassName(a.sexo));
                  const subtitle = withSexoNoSubtitulo(a.sexo, getOptionSubtitle(a) ?? "");
                  return (
                    <li key={a.id} role="option" aria-selected={index === highlightIndex}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIndex(index)}
                        onPointerDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePick(a);
                        }}
                        aria-label={sexoLabel ? `${titulo} — ${sexoLabel}` : titulo}
                        className={`w-full text-left px-3 py-2.5 transition border-b border-gray-50 last:border-0 ${
                          index === highlightIndex
                            ? "bg-[#4ECDC4]/[0.12]"
                            : "hover:bg-[#4ECDC4]/[0.08]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <SexoBolinha sexo={a.sexo} />
                          <span className="text-[13px] font-semibold text-gray-900 truncate">
                            {titulo}
                          </span>
                        </div>
                        {subtitle ? (
                          <div
                            className={`text-[11px] text-gray-500 ${temBolinha ? "pl-3.5" : ""}`}
                          >
                            {subtitle}
                          </div>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>,
            portalRoot,
          )
        : null}
      {errorMessage ? (
        <p className="text-[11px] text-red-600 mt-1">{errorMessage}</p>
      ) : hintMessage ? (
        <p className="text-[10px] text-gray-400 mt-1">{hintMessage}</p>
      ) : null}
    </div>
  );
}
