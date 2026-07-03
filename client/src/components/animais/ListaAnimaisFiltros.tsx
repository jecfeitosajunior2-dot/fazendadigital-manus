import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Switch } from '@/components/ui/switch';
import { RACAS } from '@shared/animal-types';
import { getCategoriasPorSexo, todasAsCategorias } from '@shared/animal-types';
import type { AnimaisListFiltersState, FiltroAdicionalKey } from '@shared/animal-filter-types';
import { FILTROS_ADICIONAIS_OPCOES } from '@shared/animal-filter-types';

const labelClass = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5';
const inputClass =
  'w-full h-[32px] px-2.5 text-[12px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-[#0d9488] transition-colors duration-150';
const selectClass =
  'w-full h-[32px] px-2.5 text-[12px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 focus:outline-none focus:border-[#0d9488] appearance-none transition-colors duration-150 cursor-pointer';

/** Card de filtro principal com ícone e underline style */
function PrimaryFilterCard({ label, icon, children, active, customIcon }: { label: string; icon: string; children: ReactNode; active?: boolean; customIcon?: string }) {
  return (
    <div className={`relative bg-white rounded-md px-3 pt-2 pb-1.5 flex flex-col h-full border transition-all duration-150 ${
      active ? 'border-[#0d9488] shadow-[0_0_0_2px_rgba(13,148,136,0.08)]' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-center gap-1 mb-0.5">
        {customIcon ? (
          <img src={customIcon} alt={label} className="w-[14px] h-[14px] object-contain" style={{ filter: active ? 'none' : 'grayscale(0.4) opacity(0.6)' }} />
        ) : (
          <span className={`material-icons text-[14px] ${active ? 'text-[#0d9488]' : 'text-gray-400'}`}>{icon}</span>
        )}
        <label className={`text-[10px] font-semibold uppercase tracking-wider ${active ? 'text-[#0d9488]' : 'text-gray-400'}`}>{label}</label>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function FilterCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-md px-2.5 py-2 flex flex-col h-full">
      <label className={labelClass}>{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

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

/** Dropdown multi-select de marcadores */
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
    value.length === 0 ? 'Selecione marcadores' : value.length === 1 ? value[0] : `${value.length} marcadores`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${selectClass} text-left flex items-center justify-between gap-2`}
      >
        <span className={value.length === 0 ? 'text-gray-400 truncate' : 'truncate'}>{label}</span>
        <span className="material-icons text-[16px] text-gray-400 shrink-0">
          {open ? 'expand_less' : 'expand_more'}
        </span>
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
                  className="rounded border-gray-300 text-[#8ab83d] focus:ring-[#8ab83d]"
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

/** Dropdown de seleção de filtros adicionais (igual ao modal de Alocação) */
function FiltrosAdicionaisDropdown({
  selecionados,
  onChange,
}: {
  selecionados: FiltroAdicionalKey[];
  onChange: (keys: FiltroAdicionalKey[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  // Calcula a posição do menu com base no botão gatilho (posição fixa na viewport)
  const updateCoords = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggle = (key: FiltroAdicionalKey) => {
    onChange(selecionados.includes(key) ? selecionados.filter(k => k !== key) : [...selecionados, key]);
  };

  return (
    <div ref={ref} className="relative">
      {/* Cabeçalho do card */}
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
        Filtros Adicionais
      </div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full h-[36px] px-3 text-[12px] border rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none text-left flex items-center justify-between gap-2 transition-colors ${
          open ? 'border-[#2D5A5A] ring-1 ring-[#2D5A5A]/20' : 'border-gray-200 hover:border-[#2D5A5A]/50'
        }`}
      >
        <span className={`truncate ${open ? 'text-[#2D5A5A] font-medium' : 'text-gray-400'}`}>Adicionar Filtros</span>
        <span className={`material-icons text-[16px] shrink-0 ${open ? 'text-[#2D5A5A]' : 'text-gray-400'}`}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 99999 }}
            className="max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-sm shadow-xl py-1"
          >
            {FILTROS_ADICIONAIS_OPCOES.map(opcao => (
              <label
                key={opcao.key}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={selecionados.includes(opcao.key)}
                  onChange={() => toggle(opcao.key)}
                  className="rounded border-gray-300 text-[#2D5A5A] focus:ring-[#2D5A5A] accent-[#2D5A5A] shrink-0"
                />
                <span>{opcao.label}</span>
              </label>
            ))}
          </div>,
          document.body,
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

  const lotesFiltrados = value.fazendaId ? lotes.filter(l => l.fazendaId === Number(value.fazendaId)) : lotes;
  const pastosFiltrados = value.fazendaId ? pastos.filter(p => p.fazendaId === Number(value.fazendaId)) : pastos;

  const sel = value.filtrosAdicionaisSelecionados;
  const has = (key: FiltroAdicionalKey) => sel.includes(key);
  const maisFiltrosAtivos =
    !!value.raca ||
    !!value.pesoInicial.trim() ||
    !!value.pesoFinal.trim() ||
    !!value.idadeMesesMin.trim() ||
    !!value.idadeMesesMax.trim() ||
    !!value.rfid ||
    !!value.statusFiltro ||
    !!value.dataEntradaDe ||
    !!value.dataEntradaAte ||
    value.apenasEmCarencia ||
    value.apenasSemPesagem ||
    value.apenasSemLote ||
    sel.length > 0;

  return (
    <div className="mb-2 border border-gray-200 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2">
        {/* ── Filtros principais — linha compacta ── */}
        <div className="flex flex-wrap gap-2 items-stretch">

          {/* Fazenda */}
          <div className="flex-1 min-w-[150px]">
            <PrimaryFilterCard label="Fazenda" icon="agriculture" active={!!value.fazendaId} customIcon="/assets/icon-fazenda.png">
              <div className="relative">
                <select
                  value={value.fazendaId}
                  onChange={e => onChange(patch(value, { fazendaId: e.target.value, loteId: '', pastoId: '' }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Selecione uma fazenda</option>
                  {fazendas.map(f => (
                    <option key={f.id} value={String(f.id)}>{f.nome}</option>
                  ))}
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Número do Brinco */}
          <div className="flex-1 min-w-[150px]">
            <PrimaryFilterCard label="Número do Brinco" icon="tag" active={!!value.pesquisa.trim()}>
              <div className="relative">
                <input
                  type="text"
                  value={value.pesquisa}
                  onChange={e => onChange(patch(value, { pesquisa: e.target.value }))}
                  placeholder="Digite o nº do brinco"
                  className={`${inputClass} pr-7`}
                />
                {value.pesquisa && (
                  <button
                    type="button"
                    onClick={() => onChange(patch(value, { pesquisa: '' }))}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                  >
                    <span className="material-icons text-[16px]">close</span>
                  </button>
                )}
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Sexo */}
          <div className="flex-1 min-w-[130px]">
            <PrimaryFilterCard label="Sexo" icon="wc" active={!!value.sexo}>
              <div className="relative">
                <select
                  value={value.sexo}
                  onChange={e => onChange(patch(value, { sexo: e.target.value, categoria: '' }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Todos</option>
                  <option value="macho">Macho</option>
                  <option value="femea">Fêmea</option>
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Categoria */}
          <div className="flex-1 min-w-[140px]">
            <PrimaryFilterCard label="Categoria" icon="category" active={!!value.categoria}>
              <div className="relative">
                <select
                  value={value.categoria}
                  onChange={e => onChange(patch(value, { categoria: e.target.value }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Todas</option>
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Lote */}
          <div className="flex-1 min-w-[140px]">
            <PrimaryFilterCard label="Lote" icon="inventory_2" active={!!value.loteId}>
              <div className="relative">
                <select
                  value={value.loteId}
                  onChange={e => onChange(patch(value, { loteId: e.target.value }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Todos os lotes</option>
                  {lotesFiltrados.map(l => (
                    <option key={l.id} value={String(l.id)}>{l.nome}</option>
                  ))}
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Botão Mais Filtros */}
          <div className="flex items-stretch">
            <button
              type="button"
              onClick={() => onChange(patch(value, { maisFiltrosAbertos: !value.maisFiltrosAbertos }))}
              className={`min-h-[52px] px-3 py-1.5 flex flex-col items-center justify-center gap-0.5 rounded-md border text-[9px] font-semibold uppercase tracking-wide transition-all duration-150 whitespace-nowrap ${
                value.maisFiltrosAbertos || maisFiltrosAtivos
                  ? 'bg-[#0d9488]/10 text-[#0d9488] border-[#0d9488]/40'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#0d9488]/50 hover:text-[#0d9488]'
              }`}
            >
              <span className="material-icons text-[16px]">tune</span>
              <span>Mais Filtros</span>
            </button>
          </div>

        </div>
      </div>

      {/* Painel de filtros secundários — fechado por padrão */}
      {value.maisFiltrosAbertos && (
        <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-2.5 space-y-2.5">

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Filtros adicionais</span>
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-medium text-[#2D5A5A] hover:underline shrink-0"
            >
              Limpar filtros
            </button>
          </div>

          {/* Atalhos rápidos */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={value.apenasEmCarencia}
                onCheckedChange={checked => onChange(patch(value, { apenasEmCarencia: checked }))}
                className="data-[state=checked]:bg-[#2D5A5A] scale-90"
              />
              <span className="text-[11px] text-gray-700">Em Carência</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={value.apenasSemPesagem}
                onCheckedChange={checked => onChange(patch(value, { apenasSemPesagem: checked }))}
                className="data-[state=checked]:bg-[#2D5A5A] scale-90"
              />
              <span className="text-[11px] text-gray-700">Sem Pesagem</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch
                checked={value.apenasSemLote}
                onCheckedChange={checked => onChange(patch(value, { apenasSemLote: checked }))}
                className="data-[state=checked]:bg-[#2D5A5A] scale-90"
              />
              <span className="text-[11px] text-gray-700">Sem Lote</span>
            </label>
          </div>

          {/* Filtros secundários principais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            <FilterCard label="Raça">
              <select
                value={value.raca}
                onChange={e => onChange(patch(value, { raca: e.target.value }))}
                className={selectClass}
              >
                <option value="">Todas</option>
                {RACAS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </FilterCard>

            <FilterCard label="Peso (kg)">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={value.pesoInicial}
                  onChange={e => onChange(patch(value, { pesoInicial: e.target.value }))}
                  placeholder="Mín"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <span className="text-gray-400 text-[10px] shrink-0">–</span>
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={value.pesoFinal}
                  onChange={e => onChange(patch(value, { pesoFinal: e.target.value }))}
                  placeholder="Máx"
                  className={`${inputClass} flex-1 min-w-0`}
                />
              </div>
            </FilterCard>

            <FilterCard label="Idade (meses)">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  value={value.idadeMesesMin}
                  onChange={e => onChange(patch(value, { idadeMesesMin: e.target.value }))}
                  placeholder="Mín"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <span className="text-gray-400 text-[10px] shrink-0">–</span>
                <input
                  type="number"
                  min={0}
                  value={value.idadeMesesMax}
                  onChange={e => onChange(patch(value, { idadeMesesMax: e.target.value }))}
                  placeholder="Máx"
                  className={`${inputClass} flex-1 min-w-0`}
                />
              </div>
            </FilterCard>

            <FilterCard label="Nº RFID">
              <input
                type="text"
                value={value.rfid}
                onChange={e => onChange(patch(value, { rfid: e.target.value }))}
                placeholder="Digite o nº RFID"
                className={inputClass}
              />
            </FilterCard>

            <FilterCard label="Status">
              <select
                value={value.statusFiltro}
                onChange={e => onChange(patch(value, { statusFiltro: e.target.value }))}
                className={selectClass}
              >
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </FilterCard>

            <FilterCard label="Data de Entrada">
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={value.dataEntradaDe}
                  onChange={e => onChange(patch(value, { dataEntradaDe: e.target.value }))}
                  className={`${inputClass} flex-1 min-w-0`}
                />
                <span className="text-gray-400 text-[10px] shrink-0">–</span>
                <input
                  type="date"
                  value={value.dataEntradaAte}
                  onChange={e => onChange(patch(value, { dataEntradaAte: e.target.value }))}
                  className={`${inputClass} flex-1 min-w-0`}
                />
              </div>
            </FilterCard>
          </div>

          {/* Filtros avançados opcionais */}
          <div className="pt-1 border-t border-gray-200/80">
            <div className="max-w-xs">
              <FiltrosAdicionaisDropdown
                selecionados={sel}
                onChange={keys => onChange(patch(value, { filtrosAdicionaisSelecionados: keys }))}
              />
            </div>
          </div>

          {sel.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
              {/* Pelagem */}
              {has('pelagem') && (
                <FilterCard label="Pelagem">
                  <input
                    type="text"
                    value={value.pelagem}
                    onChange={e => onChange(patch(value, { pelagem: e.target.value }))}
                    placeholder="ex: Branca, Vermelha..."
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* Marca */}
              {has('marca') && (
                <FilterCard label="Marca">
                  <input
                    type="text"
                    value={value.marca}
                    onChange={e => onChange(patch(value, { marca: e.target.value }))}
                    placeholder="ex: Marca a fogo"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* Subdivisão */}
              {has('subdivisao') && (
                <FilterCard label="Subdivisão">
                  <select
                    value={value.pastoId}
                    onChange={e => onChange(patch(value, { pastoId: e.target.value }))}
                    className={selectClass}
                    disabled={!value.fazendaId}
                  >
                    <option value="">{value.fazendaId ? 'Todos os pastos' : 'Selecione uma fazenda primeiro'}</option>
                    {pastosFiltrados.map(p => (
                      <option key={p.id} value={String(p.id)}>{p.nome}</option>
                    ))}
                  </select>
                </FilterCard>
              )}

              {/* Data de Nascimento */}
              {has('dataNascimento') && (
                <FilterCard label="Período de Nascimento">
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={value.dataNascimentoInicial}
                      onChange={e => onChange(patch(value, { dataNascimentoInicial: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                    <span className="text-gray-400 text-[11px] shrink-0">–</span>
                    <input
                      type="date"
                      value={value.dataNascimentoFinal}
                      onChange={e => onChange(patch(value, { dataNascimentoFinal: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                  </div>
                </FilterCard>
              )}

              {/* Data de Desmama */}
              {has('dataDesmama') && (
                <FilterCard label="Período de Desmama">
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={value.dataDesmamaDe}
                      onChange={e => onChange(patch(value, { dataDesmamaDe: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                    <span className="text-gray-400 text-[11px] shrink-0">–</span>
                    <input
                      type="date"
                      value={value.dataDesmamAte}
                      onChange={e => onChange(patch(value, { dataDesmamAte: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                  </div>
                </FilterCard>
              )}

              {/* Castrado */}
              {has('castrado') && (
                <FilterCard label="Castrado">
                  <select
                    value={value.castrado}
                    onChange={e => onChange(patch(value, { castrado: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="">Todos</option>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </FilterCard>
              )}

              {/* Produtor de Origem */}
              {has('produtorOrigem') && (
                <FilterCard label="Produtor de Origem">
                  <input
                    type="text"
                    value={value.produtorOrigem}
                    onChange={e => onChange(patch(value, { produtorOrigem: e.target.value }))}
                    placeholder="Nome do produtor"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* SISBOV */}
              {has('animalComSisbov') && (
                <div className="bg-white border border-gray-200 rounded-sm p-3 flex items-center gap-3">
                  <Switch
                    checked={value.animalComSisbov}
                    onCheckedChange={checked => onChange(patch(value, { animalComSisbov: checked }))}
                    className="data-[state=checked]:bg-[#2D5A5A] data-[state=checked]:border-[#2D5A5A]"
                  />
                  <span className="text-[12px] text-gray-700">Animal com SISBOV</span>
                </div>
              )}

              {/* RGN */}
              {has('rgn') && (
                <FilterCard label="Registro Geral de Nascimento (RGN)">
                  <input
                    type="text"
                    value={value.rgn}
                    onChange={e => onChange(patch(value, { rgn: e.target.value }))}
                    placeholder="Digite o RGN"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* RGD */}
              {has('rgd') && (
                <FilterCard label="Registro Genealógico Definitivo (RGD)">
                  <input
                    type="text"
                    value={value.rgd}
                    onChange={e => onChange(patch(value, { rgd: e.target.value }))}
                    placeholder="Digite o RGD"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* Pai (Reprodutor) */}
              {has('pai') && (
                <FilterCard label="Pai (Reprodutor)">
                  <input
                    type="text"
                    value={value.pai}
                    onChange={e => onChange(patch(value, { pai: e.target.value }))}
                    placeholder="Nº brinco do pai"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* Mãe (Matriz) */}
              {has('mae') && (
                <FilterCard label="Mãe (Matriz)">
                  <input
                    type="text"
                    value={value.mae}
                    onChange={e => onChange(patch(value, { mae: e.target.value }))}
                    placeholder="Nº brinco da mãe"
                    className={inputClass}
                  />
                </FilterCard>
              )}

            </div>
          )}

        </div>
      )}
    </div>
  );
}
