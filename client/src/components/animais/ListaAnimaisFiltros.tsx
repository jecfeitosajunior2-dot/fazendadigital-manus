import { type ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { FD_PRIMARY, FD_PRIMARY_SUBTLE_BG } from '@/components/FormFields';
import { RACAS } from '@shared/animal-types';
import { getCategoriasPorSexo, todasAsCategorias } from '@shared/animal-types';
import type { AnimaisListFiltersState } from '@shared/animal-filter-types';
import { hasActiveMaisFiltrosAvancados } from '@shared/animal-filter-types';
import FazendaLandIcon from '@/components/icons/FazendaLandIcon';
import BrincoIcon from '@/components/icons/BrincoIcon';
import SexoIcon from '@/components/icons/SexoIcon';
import { filtrarLotesPorFazenda } from '@/lib/loteFazendaFilter';

const labelClass = 'block text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0 leading-none';
/** Tamanho uniforme dos ícones da barra principal de filtros (16px). */
const PRIMARY_FILTER_ICON_BOX = 'inline-flex items-center justify-center w-4 h-4 shrink-0 overflow-hidden';
const PRIMARY_FILTER_ICON_INNER = 'flex items-center justify-center w-full h-full';
const primaryFilterIconColor = (active?: boolean) => (active ? 'text-[#4ECDC4]' : 'text-gray-400');
/** Switches do painel Mais Filtros — off mais visível, on em FD_PRIMARY (+ Novo Animal). */
const advancedFilterSwitchClass =
  'scale-90 border data-[state=unchecked]:bg-gray-300 data-[state=unchecked]:border-gray-400/55';

function AdvancedFilterSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      className={advancedFilterSwitchClass}
      style={checked ? { backgroundColor: FD_PRIMARY, borderColor: FD_PRIMARY } : undefined}
    />
  );
}
const inputClass =
  'w-full h-[28px] px-2 text-[12px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#4ECDC4] transition-colors duration-150';
const selectClass =
  'w-full h-[28px] px-2 text-[12px] border-0 border-b-2 border-gray-200 bg-transparent text-gray-800 focus:outline-none focus:border-[#4ECDC4] appearance-none transition-colors duration-150 cursor-pointer';

/** Card de filtro principal com ícone e underline style */
function PrimaryFilterCard({
  label,
  icon,
  children,
  active,
  customIcon,
  iconNode,
  iconOpticalScale = 1,
  embedded,
}: {
  label: string;
  icon: string;
  children: ReactNode;
  active?: boolean;
  customIcon?: string;
  iconNode?: ReactNode;
  /** Ajuste fino de escala para equilibrar peso visual entre ícones diferentes. */
  iconOpticalScale?: number;
  embedded?: boolean;
}) {
  const iconInnerStyle = iconOpticalScale !== 1 ? { transform: `scale(${iconOpticalScale})` } : undefined;

  const renderIcon = (node: ReactNode) => (
    <span className={PRIMARY_FILTER_ICON_INNER} style={iconInnerStyle}>
      {node}
    </span>
  );

  return (
    <div className={`relative flex flex-col transition-all duration-150 ${
      embedded
        ? `rounded px-2 pt-1 pb-0.5 ${active ? 'bg-[#4ECDC4]/10' : 'bg-gray-50/50'}`
        : `bg-white rounded px-2 pt-1 pb-0.5 border ${active ? 'border-[#4ECDC4] shadow-[0_0_0_1px_rgba(78,205,196,0.12)]' : 'border-gray-200 hover:border-gray-300'}`
    }`}>
      <div className="flex items-center gap-1 mb-0.5 h-4">
        {iconNode ? (
          <span className={`${PRIMARY_FILTER_ICON_BOX} ${primaryFilterIconColor(active)}`}>{renderIcon(iconNode)}</span>
        ) : customIcon ? (
          <span className={PRIMARY_FILTER_ICON_BOX}>
            {renderIcon(
              <img src={customIcon} alt={label} className="w-full h-full object-contain" style={{ filter: active ? 'none' : 'grayscale(0.4) opacity(0.6)' }} />
            )}
          </span>
        ) : (
          <span className={`${PRIMARY_FILTER_ICON_BOX} ${primaryFilterIconColor(active)}`}>
            {renderIcon(<span className="material-icons text-[14px] leading-none">{icon}</span>)}
          </span>
        )}
        <label className={`text-[9px] font-semibold uppercase tracking-wider leading-none truncate ${primaryFilterIconColor(active)}`}>{label}</label>
      </div>
      <div>{children}</div>
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
  /** Dentro do quadro único da página — sem borda externa própria */
  embedded?: boolean;
};

function patch(value: AnimaisListFiltersState, partial: Partial<AnimaisListFiltersState>): AnimaisListFiltersState {
  return { ...value, ...partial };
}

export default function ListaAnimaisFiltros({
  value,
  onChange,
  onClear,
  fazendas,
  lotes,
  pastos: _pastos,
  marcadoresDisponiveis: _marcadoresDisponiveis,
  embedded = false,
}: Props) {
  const categorias = value.sexo
    ? getCategoriasPorSexo(value.sexo === 'macho' ? 'Macho' : 'Fêmea')
    : todasAsCategorias();

  const lotesFiltrados = filtrarLotesPorFazenda(lotes, value.fazendaId || null);

  const maisFiltrosDestacado =
    value.maisFiltrosAbertos || hasActiveMaisFiltrosAvancados(value);

  return (
    <div className={embedded ? 'border-b border-gray-100' : 'mb-2 border border-gray-200 rounded-lg bg-white overflow-hidden'}>
      <div className={embedded ? 'px-2 py-1.5' : 'px-2 py-1.5'}>
        {/* ── Filtros principais — barra compacta ── */}
        <div className="flex flex-wrap gap-1.5 items-end">

          {/* Fazenda */}
          <div className="flex-1 min-w-[130px] max-w-[200px] sm:max-w-none">
            <PrimaryFilterCard
              label="Fazenda"
              icon="agriculture"
              active={!!value.fazendaId}
              iconNode={<FazendaLandIcon className="w-full h-full" />}
              iconOpticalScale={1.3}
              embedded={embedded}
            >
              <div className="relative">
                <select
                  value={value.fazendaId}
                  onChange={e => onChange(patch(value, { fazendaId: e.target.value, loteId: '', pastoId: '' }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Selecione</option>
                  {fazendas.map(f => (
                    <option key={f.id} value={String(f.id)}>{f.nome}</option>
                  ))}
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Número do Brinco */}
          <div className="flex-1 min-w-[120px] max-w-[180px] sm:max-w-none">
            <PrimaryFilterCard
              label="Brinco"
              icon="tag"
              active={!!value.pesquisa.trim()}
              iconNode={<BrincoIcon className="w-full h-full" />}
              iconOpticalScale={1}
              embedded={embedded}
            >
              <div className="relative">
                <input
                  type="text"
                  value={value.pesquisa}
                  onChange={e => onChange(patch(value, { pesquisa: e.target.value }))}
                  placeholder="Brinco"
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
          <div className="flex-1 min-w-[110px] max-w-[150px] sm:max-w-none">
            <PrimaryFilterCard
              label="Sexo"
              icon="wc"
              active={!!value.sexo}
              iconNode={<SexoIcon className="w-full h-full" />}
              iconOpticalScale={1.45}
              embedded={embedded}
            >
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
          <div className="flex-1 min-w-[120px] max-w-[160px] sm:max-w-none">
            <PrimaryFilterCard label="Categoria" icon="category" active={!!value.categoria} iconOpticalScale={0.7} embedded={embedded}>
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
          <div className="flex-1 min-w-[120px] max-w-[160px] sm:max-w-none">
            <PrimaryFilterCard label="Lote" icon="inventory_2" active={!!value.loteId} iconOpticalScale={0.7} embedded={embedded}>
              <div className="relative">
                <select
                  value={value.loteId}
                  onChange={e => onChange(patch(value, { loteId: e.target.value }))}
                  className={`${selectClass} pr-7`}
                >
                  <option value="">Todos</option>
                  {lotesFiltrados.map(l => (
                    <option key={l.id} value={String(l.id)}>{l.nome}</option>
                  ))}
                </select>
                <span className="material-icons absolute right-1 top-1/2 -translate-y-1/2 text-[16px] text-gray-400 pointer-events-none">expand_more</span>
              </div>
            </PrimaryFilterCard>
          </div>

          {/* Botão Mais Filtros */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onChange(patch(value, { maisFiltrosAbertos: !value.maisFiltrosAbertos }))}
              className={`h-[46px] px-2.5 flex flex-row items-center justify-center gap-1 rounded border text-[10px] font-semibold uppercase tracking-wide transition-all duration-150 whitespace-nowrap ${
                maisFiltrosDestacado
                  ? 'text-[#4ECDC4] border-[#4ECDC4]/40'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-600'
              }`}
              style={
                maisFiltrosDestacado
                  ? { backgroundColor: FD_PRIMARY_SUBTLE_BG }
                  : undefined
              }
            >
              <span className={`${PRIMARY_FILTER_ICON_BOX} ${maisFiltrosDestacado ? 'text-[#4ECDC4]' : 'text-gray-400'}`}>
                <span className={PRIMARY_FILTER_ICON_INNER} style={{ transform: 'scale(0.92)' }}>
                  <span className="material-icons text-[14px] leading-none">tune</span>
                </span>
              </span>
              <span>Mais Filtros</span>
            </button>
          </div>

        </div>
      </div>

      {/* Painel fixo de filtros avançados — fechado por padrão */}
      {value.maisFiltrosAbertos && (
        <div className={`border-t px-2 py-2 space-y-2 ${embedded ? 'border-gray-100 bg-gray-50/40' : 'border-gray-100 bg-gray-50/70'}`}>

          {/* Linha 1: atalhos + limpar */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <AdvancedFilterSwitch
                  checked={value.apenasEmCarencia}
                  onCheckedChange={checked => onChange(patch(value, { apenasEmCarencia: checked }))}
                />
                <span className="text-[11px] text-gray-700">Em Carência</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <AdvancedFilterSwitch
                  checked={value.apenasSemPesagem}
                  onCheckedChange={checked => onChange(patch(value, { apenasSemPesagem: checked }))}
                />
                <span className="text-[11px] text-gray-700">Sem Pesagem</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <AdvancedFilterSwitch
                  checked={value.apenasSemLote}
                  onCheckedChange={checked => onChange(patch(value, { apenasSemLote: checked }))}
                />
                <span className="text-[11px] text-gray-700">Sem Lote</span>
              </label>
            </div>
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-medium text-[#2D5A5A] hover:underline shrink-0 ml-auto"
            >
              Limpar filtros
            </button>
          </div>

          {/* Linha 2: Raça, Peso, Idade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
          </div>

          {/* Linha 3: RFID, Status, Data de Entrada */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <FilterCard label="RFID">
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

        </div>
      )}
    </div>
  );
}
