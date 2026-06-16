import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Switch } from '@/components/ui/switch';
import { RACAS } from '@shared/animal-types';
import { getCategoriasPorSexo, todasAsCategorias } from '@shared/animal-types';
import type { AnimaisListFiltersState, FiltroAdicionalKey } from '@shared/animal-filter-types';
import { FILTROS_ADICIONAIS_OPCOES } from '@shared/animal-filter-types';

const labelClass = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1';
const inputClass =
  'w-full h-[38px] px-3 text-[13px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 placeholder:text-gray-300 focus:outline-none focus:border-[#0d9488] transition-colors duration-150';
const selectClass =
  'w-full h-[38px] px-3 text-[13px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 focus:outline-none focus:border-[#0d9488] appearance-none transition-colors duration-150 cursor-pointer';
const accentSelectClass =
  'w-full h-[38px] pl-4 pr-3 text-[13px] border-0 border-b-2 border-[#0d9488] bg-transparent text-gray-800 focus:outline-none appearance-none cursor-pointer';

/** Card de filtro principal com ícone e underline style */
function PrimaryFilterCard({ label, icon, children, active, customIcon }: { label: string; icon: string; children: ReactNode; active?: boolean; customIcon?: string }) {
  return (
    <div className={`relative bg-white rounded-lg px-4 pt-3 pb-2 flex flex-col h-full shadow-sm border transition-all duration-150 ${
      active ? 'border-[#0d9488] shadow-[0_0_0_3px_rgba(13,148,136,0.08)]' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
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
    <div className="bg-white border border-gray-200 rounded-sm p-3 flex flex-col h-full">
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

  return (
    <div className="mb-3 bg-gradient-to-b from-gray-50 to-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-4">
        {/* ── Filtros principais — 5 cards profissionais + botão Mais Filtros ── */}
        <div className="flex flex-wrap gap-3 items-stretch">

          {/* Fazenda */}
          <div className="flex-1 min-w-[150px]">
            <PrimaryFilterCard label="Fazenda" icon="agriculture" active={!!value.fazendaId} customIcon="/manus-storage/icon-fazenda_3a7a9041.png">
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

          {/* Botão Mais/Menos Filtros */}
          <div className="flex items-center self-stretch">
            <button
              type="button"
              onClick={() => onChange(patch(value, { maisFiltrosAbertos: !value.maisFiltrosAbertos }))}
              className={`h-full min-h-[72px] px-4 flex flex-col items-center justify-center gap-1 rounded-lg border text-[10px] font-semibold uppercase tracking-wide transition-all duration-150 whitespace-nowrap ${
                value.maisFiltrosAbertos
                  ? 'bg-[#0d9488] text-white border-[#0d9488] shadow-md'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#0d9488] hover:text-[#0d9488] hover:shadow-md'
              }`}
            >
              <span className="material-icons text-[18px]">{value.maisFiltrosAbertos ? 'filter_list_off' : 'tune'}</span>
              <span>{value.maisFiltrosAbertos ? 'Menos' : 'Mais Filtros'}</span>
            </button>
          </div>

        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          Painel de filtros adicionais — mesmo padrão do modal Buscar Animais
          ══════════════════════════════════════════════════════════════ */}
      {value.maisFiltrosAbertos && (
        <div className="border-t border-gray-200 bg-[#F7F7F7] px-4 py-4 space-y-4">

          {/* ── Linha de ações: Buscar Animais | Filtros Adicionais | Limpar Filtros ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr_1fr] gap-3 items-start">
            {/* Buscar Animais */}
            <button
              type="button"
              onClick={() => onChange(patch(value, { maisFiltrosAbertos: false }))}
              className="h-[40px] w-full text-[12px] font-semibold uppercase tracking-wide text-gray-700 bg-[#EEEEEE] border border-gray-200 hover:bg-gray-200 rounded-sm transition-colors"
            >
              Buscar Animais
            </button>

            {/* Filtros Adicionais (card com dropdown) */}
            <div className="bg-white border border-gray-200 rounded-sm p-3 overflow-visible relative">
              <FiltrosAdicionaisDropdown
                selecionados={sel}
                onChange={keys => onChange(patch(value, { filtrosAdicionaisSelecionados: keys }))}
              />
            </div>

            {/* Limpar Filtros */}
            <button
              type="button"
              onClick={onClear}
              className="h-[40px] w-full text-[12px] font-semibold uppercase tracking-wide text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-sm transition-colors"
            >
              Limpar Filtros
            </button>
          </div>

          {/* ── Campos dinâmicos conforme seleção ── */}
          {sel.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

              {/* Peso */}
              {has('peso') && (
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
                    <span className="text-gray-400 text-[11px] shrink-0">–</span>
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
              )}

              {/* Nº RFID */}
              {has('rfid') && (
                <FilterCard label="Nº RFID">
                  <input
                    type="text"
                    value={value.rfid}
                    onChange={e => onChange(patch(value, { rfid: e.target.value }))}
                    placeholder="Digite o nº RFID"
                    className={inputClass}
                  />
                </FilterCard>
              )}

              {/* Raça */}
              {has('raca') && (
                <FilterCard label="Raça">
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
                </FilterCard>
              )}

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

              {/* Data de Entrada */}
              {has('dataEntrada') && (
                <FilterCard label="Período de Entrada na Fazenda">
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={value.dataEntradaDe}
                      onChange={e => onChange(patch(value, { dataEntradaDe: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                    <span className="text-gray-400 text-[11px] shrink-0">–</span>
                    <input
                      type="date"
                      value={value.dataEntradaAte}
                      onChange={e => onChange(patch(value, { dataEntradaAte: e.target.value }))}
                      className={`${inputClass} flex-1 min-w-0`}
                    />
                  </div>
                </FilterCard>
              )}

              {/* Status */}
              {has('status') && (
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
              )}
            </div>
          )}

          {/* Indicador de filtro Em Carência ativo */}
          {value.apenasEmCarencia && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
              <span className="material-icons text-[14px] text-amber-600">medication</span>
              <span className="text-[12px] font-medium text-amber-700">Filtrando apenas animais em carência</span>
              <button
                onClick={() => onChange(patch(value, { apenasEmCarencia: false }))}
                className="ml-auto text-amber-500 hover:text-amber-700 transition-colors"
              >
                <span className="material-icons text-[14px]">close</span>
              </button>
            </div>
          )}

          {/* Indicador de filtro Sem Lote ativo */}
          {value.apenasSemLote && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-md">
              <span className="material-icons text-[14px] text-orange-600">folder_off</span>
              <span className="text-[12px] font-medium text-orange-700">Filtrando apenas animais sem lote</span>
              <button
                onClick={() => onChange(patch(value, { apenasSemLote: false }))}
                className="ml-auto text-orange-500 hover:text-orange-700 transition-colors"
              >
                <span className="material-icons text-[14px]">close</span>
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
