import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterSemenReprodutorExternoCatalogoSugestao,
  formatSemenReprodutorExternoCatalogoSubtitulo,
  type SemenReprodutorExternoCatalogoItem,
} from "@shared/semenReprodutorExternoCatalogo";

type SemenReprodutorExternoFieldProps = {
  value: string;
  onChange: (texto: string) => void;
  onSelect: (item: SemenReprodutorExternoCatalogoItem) => void;
  onCadastrarNovo: () => void;
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
        placeholder="Ex.: GSC-7117 ou REM Armador"
        className={inputClassName}
        maxLength={500}
        disabled={disabled}
        autoComplete="off"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
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
            <p className="px-3 py-2 text-[11px] text-gray-400">
              {loading ? "Consultando cadastros…" : "Nenhum reprodutor cadastrado ainda."}
            </p>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-[12px] font-medium text-[#2D5A5A] hover:bg-gray-50 border-t border-gray-100"
            onClick={() => {
              setOpen(false);
              onCadastrarNovo();
            }}
          >
            + Cadastrar novo sêmen/reprodutor
          </button>
        </div>
      ) : null}
      {loading ? (
        <p className="text-[11px] text-gray-500 mt-1">Consultando cadastro de sêmen…</p>
      ) : (
        <p className="text-[11px] text-gray-400 mt-1">
          Clique para ver os já cadastrados ou cadastre um novo sem sair desta tela.
        </p>
      )}
    </div>
  );
}
