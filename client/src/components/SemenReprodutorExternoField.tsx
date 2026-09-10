import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterSemenReprodutorExternoCatalogoSugestao,
  formatSemenReprodutorExternoCatalogoSubtitulo,
  semenReprodutorExternoCatalogoDropdownEmptyMessage,
  type SemenReprodutorExternoCatalogoItem,
} from "@shared/semenReprodutorExternoCatalogo";

export const SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL = "+ Cadastrar reprodutor";

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
}: SemenReprodutorExternoFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const sugestoes = useMemo(
    () => filterSemenReprodutorExternoCatalogoSugestao(options, value),
    [options, value],
  );

  const emptyDropdownMessage = useMemo(
    () => semenReprodutorExternoCatalogoDropdownEmptyMessage(options, value, Boolean(loading)),
    [options, value, loading],
  );

  const showCadastrarAcao = Boolean(onCadastrarNovo && (showCadastrarNovo || cadastrarNovoLabel));
  const cadastrarLabel =
    cadastrarNovoLabel ?? "+ Cadastrar novo sêmen/reprodutor";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <label className={labelClassName}>
        Reprodutor / Sêmen<span className="text-red-500">*</span>
      </label>
      <input
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={e => {
          const next = e.relatedTarget as Node | null;
          if (next && rootRef.current?.contains(next)) return;
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
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-xl border border-gray-100 bg-white shadow-md">
          {sugestoes.length > 0 ? (
            <ul role="listbox">
              {sugestoes.map(item => (
                <li key={item.reprodutorKey}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50"
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
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
              onClick={() => {
                setOpen(false);
                onCadastrarNovo?.();
              }}
            >
              {cadastrarLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      {loading ? (
        <p className="text-[11px] text-gray-500 mt-1">Consultando cadastro de sêmen…</p>
      ) : showCadastrarNovo ? (
        <p className="text-[11px] text-gray-400 mt-1">
          Clique para ver os já cadastrados ou cadastre um novo sem sair desta tela.
        </p>
      ) : cadastrarNovoLabel ? (
        <p className="text-[11px] text-gray-400 mt-1">
          Selecione da lista, cadastre abaixo ou continue digitando para usar só nesta entrada.
        </p>
      ) : (
        <p className="text-[11px] text-gray-400 mt-1">
          Digite ou selecione um reprodutor já cadastrado.
        </p>
      )}
    </div>
  );
}
