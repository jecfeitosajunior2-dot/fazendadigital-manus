import {
  filterAnimalAutocompleteCandidates,
  shouldClearAutocompleteSelection,
  type AnimalAutocompleteRow,
} from "@shared/animalAutocomplete";
import {
  labelAnimalBusca,
  subtituloAnimalBusca,
} from "@shared/animalBuscaDisplay";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () =>
      filterAnimalAutocompleteCandidates(animals, {
        search,
        limit,
        isCandidate: filterCandidate,
      }),
    [animals, search, limit, filterCandidate],
  );

  const dropdownVisible = open && !disabled && search.trim().length >= 1 && !selected;

  useEffect(() => {
    if (!dropdownVisible) setHighlightIndex(0);
    else if (highlightIndex >= options.length) setHighlightIndex(0);
  }, [dropdownVisible, options.length, highlightIndex]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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
          <span className="text-[12px] font-semibold text-gray-800">{getOptionLabel(selected)}</span>
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
      {dropdownVisible ? (
        <ul
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {loading ? (
            <li className="px-3 py-2.5 text-[11px] text-gray-400">Buscando…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2.5 text-[11px] text-gray-400">{emptyMessage}</li>
          ) : (
            options.map((a, index) => (
              <li key={a.id} role="option" aria-selected={index === highlightIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlightIndex(index)}
                  onClick={() => handlePick(a)}
                  className={`w-full text-left px-3 py-2.5 transition border-b border-gray-50 last:border-0 ${
                    index === highlightIndex
                      ? "bg-[#4ECDC4]/[0.12]"
                      : "hover:bg-[#4ECDC4]/[0.08]"
                  }`}
                >
                  <div className="text-[13px] font-semibold text-gray-900">{getOptionLabel(a)}</div>
                  {getOptionSubtitle(a) ? (
                    <div className="text-[11px] text-gray-500">{getOptionSubtitle(a)}</div>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {errorMessage ? (
        <p className="text-[11px] text-red-600 mt-1">{errorMessage}</p>
      ) : hintMessage ? (
        <p className="text-[10px] text-gray-400 mt-1">{hintMessage}</p>
      ) : null}
    </div>
  );
}
