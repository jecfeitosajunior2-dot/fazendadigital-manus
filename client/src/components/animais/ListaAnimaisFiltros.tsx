import { useEffect, useRef, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { RACAS } from '@shared/animal-types';
import { getCategoriasPorSexo, todasAsCategorias } from '@shared/animal-types';
import type { AnimaisListFiltersState } from '@shared/animal-filter-types';
import { hasActiveAnimaisFilters } from '@shared/animal-filter-types';

const labelClass = 'block text-[11px] font-medium text-gray-600 mb-1';
const inputClass =
  'w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#7CB342]';
const selectClass =
  'w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#7CB342] appearance-none';
const accentSelectClass =
  'w-full h-[36px] pl-4 pr-3 text-[12px] border border-gray-200 border-l-[3px] border-l-[#7CB342] rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#7CB342] appearance-none';

type FazendaOption = { id: number; nome: string };
type LoteOption = { id: number; nome: string; fazendaId?: number | null };
type PastoOption = { id: number; nome: string; fazendaId?: number | null };

type Props = {
  value: AnimaisListFiltersState;
  onChange: (value: AnimaisListFiltersState) => void;
  onClear: () => void;
  fazendas: FazendaOption[];
  lotes: LoteOption[];
  pastos: PastoOption[];
  marcadoresDisponiveis: string[];
};

function patch(value: AnimaisListFiltersState, partial: Partial<AnimaisListFiltersState>): AnimaisListFiltersState {
  return { ...value, ...partial };
}

function MarcadoresMultiSelect({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: string[];
  onChange: (marcadores: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (marca: string) => {
    onChange(value.includes(marca) ? value.filter(m => m !== marca) : [...value, marca]);
  };

  const label =
    value.length === 0
      ? 'Selecione marcadores'
      : value.length === 1
        ? value[0]
        : `${value.length} marcadores`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${selectClass} text-left flex items-center justify-between gap-2`}
      >
        <span className={value.length === 0 ? 'text-gray-400 truncate' : 'truncate'}>{label}</span>
        <span className="material-icons text-[16px] text-gray-400 shrink-0">expand_more</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-sm shadow-md py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-gray-400">Nenhum marcador cadastrado</p>
          ) : (
            options.map(marca => (
              <label
                key={marca}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={value.includes(marca)}
                  onChange={() => toggle(marca)}
                  className="rounded border-gray-300 text-[#7CB342] focus:ring-[#7CB342]"
                />
                <span className="truncate">{marca}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function ListaAnimaisFiltros({
  value,
  onChange,
  onClear,
  fazendas,
  lotes,
  pastos,
  marcadoresDisponiveis,
}: Props) {
  const categorias = value.sexo
    ? getCategoriasPorSexo(value.sexo === 'macho' ? 'Macho' : 'Fêmea')
    : todasAsCategorias();

  const lotesFiltrados = value.fazendaId
    ? lotes.filter(l => l.fazendaId === Number(value.fazendaId))
    : lotes;

  const pastosFiltrados = value.fazendaId
    ? pastos.filter(p => p.fazendaId === Number(value.fazendaId))
    : pastos;

  return (
    <div className="mb-3 bg-white border border-gray-200 rounded-sm overflow-hidden">
      {/* Linha 1 — filtros principais */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-2">
            <label className={labelClass}>Fazenda</label>
            <select
              value={value.fazendaId}
              onChange={e => onChange(patch(value, { fazendaId: e.target.value, loteId: '' }))}
              className={selectClass}
            >
              <option value="">Selecione uma fazenda</option>
              {fazendas.map(f => (
                <option key={f.id} value={String(f.id)}>{f.nome}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Subdivisão (Pasto)</label>
            <select
              value={value.pastoId}
              onChange={e => onChange(patch(value, { pastoId: e.target.value }))}
              className={selectClass}
            >
              <option value="">Todos os pastos</option>
              {pastosFiltrados.map(p => (
                <option key={p.id} value={String(p.id)}>{p.nome}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className={labelClass}>Raça</label>
            <select
              value={value.raca}
              onChange={e => onChange(patch(value, { raca: e.target.value }))}
              className={selectClass}
            >
              <option value="">Selecione uma raça</option>
              {RACAS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-6">
            <label className={labelClass}>Pesquisar</label>
            <input
              type="text"
              value={value.pesquisa}
              onChange={e => onChange(patch(value, { pesquisa: e.target.value }))}
              placeholder="Digite algo que deseja filtrar"
              className={inputClass}
            />
          </div>

          <div className="lg:col-span-2 flex gap-2 items-end">
            {hasActiveAnimaisFilters(value) && (
              <button
                type="button"
                onClick={onClear}
                className="h-[36px] px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 border border-gray-300 rounded-sm bg-white hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Limpar
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(patch(value, { maisFiltrosAbertos: !value.maisFiltrosAbertos }))}
              className="flex-1 h-[36px] px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-600 bg-[#EEEEEE] border border-gray-200 rounded-sm hover:bg-gray-200 transition-colors whitespace-nowrap"
            >
              Mais Filtros
            </button>
          </div>
        </div>
      </div>

      {/* Área expandida */}
      {value.maisFiltrosAbertos && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-[#F5F5F5]">
          {/* Linha 2: Sexo, Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            <div>
              <label className={labelClass}>Sexo</label>
              <select
                value={value.sexo}
                onChange={e => onChange(patch(value, { sexo: e.target.value, categoria: '' }))}
                className={selectClass}
              >
                <option value="">Selecione o sexo</option>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Categoria</label>
              <select
                value={value.categoria}
                onChange={e => onChange(patch(value, { categoria: e.target.value }))}
                className={accentSelectClass}
              >
                <option value="">Selecione a categoria</option>
                {categorias.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Linha 3: Lote, Peso, Período de nascimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
            <div>
              <label className={labelClass}>Lote</label>
              <select
                value={value.loteId}
                onChange={e => onChange(patch(value, { loteId: e.target.value }))}
                className={selectClass}
              >
                <option value="">Selecione o lote</option>
                {lotesFiltrados.map(l => (
                  <option key={l.id} value={String(l.id)}>{l.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Peso</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={value.pesoInicial}
                  onChange={e => onChange(patch(value, { pesoInicial: e.target.value }))}
                  placeholder="Peso inicial"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <span className="text-gray-400 text-[11px] shrink-0">–</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={value.pesoFinal}
                  onChange={e => onChange(patch(value, { pesoFinal: e.target.value }))}
                  placeholder="Peso final"
                  className={`${inputClass} flex-1 min-w-0`}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Período de nascimento</label>
              <div className="flex items-center gap-1">
                <span className="material-icons text-[18px] text-gray-400 shrink-0">calendar_today</span>
                <input
                  type="date"
                  value={value.dataNascimentoInicial}
                  onChange={e => onChange(patch(value, { dataNascimentoInicial: e.target.value }))}
                  placeholder="Data inicial"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <span className="text-gray-400 text-[11px] shrink-0">–</span>
                <input
                  type="date"
                  value={value.dataNascimentoFinal}
                  onChange={e => onChange(patch(value, { dataNascimentoFinal: e.target.value }))}
                  placeholder="Data final"
                  className={`${inputClass} flex-1 min-w-0`}
                />
              </div>
            </div>
          </div>

          {/* Linha 4: Somente SISBOV, Marcadores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 items-end">
            <div className="flex items-center gap-3 h-[36px]">
              <Switch
                checked={value.somenteSisbov}
                onCheckedChange={checked => onChange(patch(value, { somenteSisbov: checked }))}
                className="data-[state=checked]:bg-[#7CB342]"
              />
              <span className="text-[12px] text-gray-700">Somente SISBOV</span>
            </div>

            <div className="lg:col-span-2">
              <label className={labelClass}>Filtrar por marcadores</label>
              <MarcadoresMultiSelect
                value={value.marcadores}
                options={marcadoresDisponiveis}
                onChange={marcadores => onChange(patch(value, { marcadores }))}
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={onClear}
              className="px-4 h-[32px] text-[10px] font-semibold uppercase tracking-wide text-gray-600 border border-gray-300 rounded-sm bg-white hover:bg-gray-50 transition-colors"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
