import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ANIMAL_AUTOCOMPLETE_MENU_ATTR } from "@shared/animalAutocomplete";
import {
  filterSemenReprodutorExternoCatalogoSugestao,
  formatSemenReprodutorExternoCatalogoSubtitulo,
  semenReprodutorExternoCatalogoDropdownEmptyMessage,
  type SemenReprodutorExternoCatalogoItem,
} from "@shared/semenReprodutorExternoCatalogo";

export const SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL = "+ Cadastrar Reprodutor";

type SemenReprodutorExternoFieldProps = {
  value: string;
  onChange: (texto: string) => void;
  onSelect: (item: SemenReprodutorExternoCatalogoItem) => void;
  onCadastrarNovo?: () => void;
  /** Exibe "+ Cadastrar novo" no dropdown. Desligado no curral (fluxo enxuto). */
  showCadastrarNovo?: boolean;
  /** Rótulo alternativo do botão cadastrar (ex.: Nova entrada de sêmen). */
  cadastrarNovoLabel?: string;
  options: SemenReprodutorExternoCatalogoItem[];
  disabled?: boolean;
  loading?: boolean;
  inputClassName: string;
  labelClassName: string;
  /** Padrão no Manejo. Nova entrada usa "Reprodutor". */
  label?: string;
  /** Texto cinza abaixo do campo. Nova entrada omite. */
  showHint?: boolean;
  /** Substitui o hint padrão (ex.: curral só com estoque). */
  hint?: string;
  emptyNoOptionsMessage?: string;
  emptyNoMatchMessage?: string;
  loadingLabel?: string;
};

export function SemenReprodutorExternoField({
  value,
  onChange,
  onSelect,
  onCadastrarNovo,
  showCadastrarNovo = true,
  cadastrarNovoLabel,
  options,
  disabled,
  loading,
  inputClassName,
  labelClassName,
  label = "Reprodutor / Sêmen",
  showHint = true,
  hint,
  emptyNoOptionsMessage,
  emptyNoMatchMessage,
  loadingLabel,
}: SemenReprodutorExternoFieldProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sugestoes = useMemo(
    () => filterSemenReprodutorExternoCatalogoSugestao(options, value),
    [options, value],
  );

  const emptyDropdownMessage = useMemo(() => {
    if (loading) return loadingLabel ?? semenReprodutorExternoCatalogoDropdownEmptyMessage(options, value, true);
    const ativos = options.filter(i => i.ativo);
    if (ativos.length === 0 && emptyNoOptionsMessage) return emptyNoOptionsMessage;
    if (value.trim() && sugestoes.length === 0 && emptyNoMatchMessage) return emptyNoMatchMessage;
    return semenReprodutorExternoCatalogoDropdownEmptyMessage(options, value, false);
  }, [
    emptyNoMatchMessage,
    emptyNoOptionsMessage,
    loading,
    loadingLabel,
    options,
    sugestoes.length,
    value,
  ]);

  const showCadastrarAcao = Boolean(onCadastrarNovo && (showCadastrarNovo || cadastrarNovoLabel));
  const cadastrarLabel =
    cadastrarNovoLabel ?? "+ Cadastrar Novo Sêmen/Reprodutor";
  const dropdownVisible = open && !disabled;

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
  }, [dropdownVisible, sugestoes.length, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handlePick = (item: SemenReprodutorExternoCatalogoItem) => {
    onSelect(item);
    setOpen(false);
  };

  return (
    <div className="relative z-30" ref={rootRef}>
      <label className={labelClassName}>
        {label}<span className="text-red-500">*</span>
      </label>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={e => {
          const next = e.relatedTarget as Node | null;
          if (next && (rootRef.current?.contains(next) || listRef.current?.contains(next))) return;
          setOpen(false);
        }}
        placeholder="Ex.: GSC-7117 ou REM Armador"
        className={inputClassName}
        maxLength={500}
        disabled={disabled}
        autoComplete="off"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {dropdownVisible && menuStyle && portalRoot
        ? createPortal(
            <div
              ref={listRef}
              {...{ [ANIMAL_AUTOCOMPLETE_MENU_ATTR]: "" }}
              className="pointer-events-auto max-h-56 overflow-auto rounded-xl border border-gray-100 bg-white shadow-md"
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
              {sugestoes.length > 0 ? (
                <ul role="listbox">
                  {sugestoes.map(item => (
                    <li key={item.reprodutorKey}>
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                        onPointerDown={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handlePick(item);
                        }}
                      >
                        <span className="font-medium text-gray-800">{item.reprodutorTexto}</span>
                        <span className="block text-[11px] text-gray-500">
                          {formatSemenReprodutorExternoCatalogoSubtitulo(item)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-2 text-[11px] text-gray-400">{emptyDropdownMessage}</p>
              )}
              {showCadastrarAcao ? (
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-[12px] font-medium text-[#2D5A5A] hover:bg-gray-50 border-t border-gray-100"
                  onMouseDown={e => e.preventDefault()}
                  onPointerDown={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    onCadastrarNovo?.();
                  }}
                >
                  {cadastrarLabel}
                </button>
              ) : null}
            </div>,
            portalRoot,
          )
        : null}
      {loading ? (
        <p className="text-[11px] text-gray-500 mt-1">
          {loadingLabel ?? "Consultando cadastro de sêmen…"}
        </p>
      ) : showHint && hint ? (
        <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
      ) : showHint && showCadastrarNovo ? (
        <p className="text-[11px] text-gray-400 mt-1">
          Clique para ver os já cadastrados ou cadastre um novo sem sair desta tela.
        </p>
      ) : showHint && cadastrarNovoLabel ? (
        <p className="text-[11px] text-gray-400 mt-1">
          Selecione da lista, cadastre abaixo ou continue digitando para usar só nesta entrada.
        </p>
      ) : showHint ? (
        <p className="text-[11px] text-gray-400 mt-1">
          Digite ou selecione um reprodutor já cadastrado.
        </p>
      ) : null}
    </div>
  );
}
