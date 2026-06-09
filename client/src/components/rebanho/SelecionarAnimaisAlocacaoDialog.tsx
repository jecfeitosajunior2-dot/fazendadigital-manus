import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { formatDateBR } from "@/lib/date-utils";
import { RACAS, getCategoriasPorSexo, todasAsCategorias } from "@shared/animal-types";
import { animaisFiltersToApiParams } from "@shared/animal-filter-types";
import type { AnimaisListFiltersState } from "@shared/animal-filter-types";
import type { AnimalAlocacaoRow } from "@/components/rebanho/alocacao-types";

const IRANCHO_BTN_GREEN = "#8ab83d";
const IRANCHO_BTN_GREY = "#C0C0C0";

const INITIAL_FILTERS: AnimaisListFiltersState = {
  fazendaId: "",
  raca: "",
  pesquisa: "",
  sexo: "",
  categoria: "",
  loteId: "",
  pesoInicial: "",
  pesoFinal: "",
  dataNascimentoInicial: "",
  dataNascimentoFinal: "",
  somenteSisbov: false,
  marcadores: [],
  maisFiltrosAbertos: false,
  pastoId: "",
};

type AlocacaoAnimaisFiltersState = AnimaisListFiltersState & {
  brincoEletronico: string;
  idadeMesesInicial: string;
  idadeMesesFinal: string;
  rgn: string;
  rgd: string;
  somenteInativos: boolean;
};

const INITIAL_ALOCACAO_FILTERS: AlocacaoAnimaisFiltersState = {
  ...INITIAL_FILTERS,
  brincoEletronico: "",
  idadeMesesInicial: "",
  idadeMesesFinal: "",
  rgn: "",
  rgd: "",
  somenteInativos: false,
};

function alocacaoFiltersToApiParams(filters: AlocacaoAnimaisFiltersState) {
  const base = animaisFiltersToApiParams(filters, filters.pesquisa);
  const idadeMin = filters.idadeMesesInicial.trim() ? Number(filters.idadeMesesInicial) : undefined;
  const idadeMax = filters.idadeMesesFinal.trim() ? Number(filters.idadeMesesFinal) : undefined;
  return {
    ...base,
    status: filters.somenteInativos ? "inativo" : "ativo",
    brincoEletronico: filters.brincoEletronico.trim() || undefined,
    rgn: filters.rgn.trim() || undefined,
    rgd: filters.rgd.trim() || undefined,
    idadeMesesMin: idadeMin !== undefined && !Number.isNaN(idadeMin) ? idadeMin : undefined,
    idadeMesesMax: idadeMax !== undefined && !Number.isNaN(idadeMax) ? idadeMax : undefined,
  };
}

const btnActionClass =
  "w-full px-4 py-2.5 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95";

type Props = {
  open: boolean;
  onClose: () => void;
  jaSelecionados: Set<number>;
  onConfirm: (animais: AnimalAlocacaoRow[]) => void;
};

const labelClass = "block text-[11px] font-medium text-gray-600 mb-1.5";
const inputClass =
  "w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#8ab83d]";
const selectClass =
  "w-full h-[36px] px-3 text-[12px] border border-gray-200 rounded-sm bg-[#EEEEEE] text-gray-800 focus:outline-none focus:border-[#8ab83d] appearance-none";

function FilterCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-sm p-3 flex flex-col h-full">
      <label className={labelClass}>{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
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
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (marca: string) => {
    onChange(value.includes(marca) ? value.filter(m => m !== marca) : [...value, marca]);
  };

  const label =
    value.length === 0
      ? "Selecione marcadores"
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
        <span className={value.length === 0 ? "text-gray-400 truncate" : "truncate"}>{label}</span>
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

function numeroVisual(animal: { brinco: string | null; id: number }) {
  return animal.brinco?.trim() || String(animal.id);
}

function numeroRfid(animal: { brincoEletronico: string | null }) {
  return animal.brincoEletronico?.trim() || "—";
}

function displayNome(animal: { nome: string | null; brinco: string | null }) {
  return animal.nome?.trim() || animal.brinco?.trim() || "—";
}

function fazendaSubdivisao(lote?: {
  fazendaNome?: string | null;
  pastoNome?: string | null;
}) {
  if (!lote?.fazendaNome && !lote?.pastoNome) return "—";
  if (lote.fazendaNome && lote.pastoNome) return `${lote.fazendaNome} - ${lote.pastoNome}`;
  return lote.fazendaNome || lote.pastoNome || "—";
}

function toAlocacaoRow(
  animal: {
    id: number;
    brincoEletronico: string | null;
    brinco: string | null;
    nome: string | null;
    sexo: "macho" | "femea";
    loteId: number | null;
    loteNome: string | null;
  },
  lote?: { nome?: string | null; fazendaNome?: string | null; pastoNome?: string | null },
): AnimalAlocacaoRow {
  return {
    id: animal.id,
    numeroVisual: numeroVisual(animal),
    numeroRfid: numeroRfid(animal),
    sexo: animal.sexo,
    loteNome: lote?.nome ?? animal.loteNome ?? "—",
    fazendaSubdivisao: fazendaSubdivisao(lote),
    ultimaMovimentacao: null,
  };
}

export default function SelecionarAnimaisAlocacaoDialog({
  open,
  onClose,
  jaSelecionados,
  onConfirm,
}: Props) {
  const [draftFilters, setDraftFilters] = useState<AlocacaoAnimaisFiltersState>(INITIAL_ALOCACAO_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AlocacaoAnimaisFiltersState>(INITIAL_ALOCACAO_FILTERS);
  const [filtrosAdicionaisAbertos, setFiltrosAdicionaisAbertos] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: fazendas = [] } = trpc.fazendas.list.useQuery(undefined, { enabled: open });
  const { data: lotes = [] } = trpc.lotes.list.useQuery(undefined, { enabled: open });
  const { data: marcadoresDisponiveis = [] } = trpc.animais.marcasDistintas.useQuery(undefined, { enabled: open });
  const fazendaDraftNum = draftFilters.fazendaId ? Number(draftFilters.fazendaId) : 0;
  const { data: pastos = [] } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId: fazendaDraftNum },
    { enabled: open && fazendaDraftNum > 0 },
  );

  const apiParams = useMemo(
    () => alocacaoFiltersToApiParams(appliedFilters),
    [appliedFilters],
  );

  const { data: animaisData = [], isLoading } = trpc.animais.list.useQuery(apiParams, {
    enabled: open && buscou,
  });

  const lotesMap = useMemo(() => new Map(lotes.map(l => [l.id, l])), [lotes]);

  const lotesFiltrados = draftFilters.fazendaId
    ? lotes.filter(l => l.fazendaId === Number(draftFilters.fazendaId))
    : lotes;

  const disponiveis = useMemo(
    () => (buscou ? animaisData.filter(a => !jaSelecionados.has(a.id)) : []),
    [animaisData, jaSelecionados, buscou],
  );

  const categorias = draftFilters.sexo
    ? getCategoriasPorSexo(draftFilters.sexo === "macho" ? "Macho" : "Fêmea")
    : todasAsCategorias();

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setDraftFilters(INITIAL_ALOCACAO_FILTERS);
      setAppliedFilters(INITIAL_ALOCACAO_FILTERS);
      setFiltrosAdicionaisAbertos(false);
      setBuscou(false);
      return;
    }
    setBuscou(true);
    setAppliedFilters(INITIAL_ALOCACAO_FILTERS);
    setDraftFilters(INITIAL_ALOCACAO_FILTERS);
  }, [open]);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBuscar = () => {
    setAppliedFilters({ ...draftFilters });
    setBuscou(true);
  };

  const limparFiltros = () => {
    setDraftFilters(INITIAL_ALOCACAO_FILTERS);
    setAppliedFilters(INITIAL_ALOCACAO_FILTERS);
    setFiltrosAdicionaisAbertos(false);
    setBuscou(true);
  };

  const handleConfirm = () => {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um animal.");
      return;
    }
    const rows: AnimalAlocacaoRow[] = animaisData
      .filter(a => selected.has(a.id))
      .map(a => toAlocacaoRow(a, a.loteId ? lotesMap.get(a.loteId) : undefined));
    onConfirm(rows);
    onClose();
  };

  const thClass =
    "px-2 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wide text-left whitespace-nowrap border-r border-gray-200";

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-[96vw] lg:max-w-6xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Buscar animais</h2>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-gray-800 hover:brightness-95"
            style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 36 }}
          >
            Fechar
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Filtros principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FilterCard label="Fazenda">
              <select
                value={draftFilters.fazendaId}
                onChange={e => setDraftFilters(f => ({ ...f, fazendaId: e.target.value, loteId: "", pastoId: "" }))}
                className={selectClass}
              >
                <option value="">Selecione a fazenda</option>
                {fazendas.map(f => (
                  <option key={f.id} value={String(f.id)}>{f.nome}</option>
                ))}
              </select>
            </FilterCard>

            <FilterCard label="Nº Visual">
              <input
                type="text"
                value={draftFilters.pesquisa}
                onChange={e => setDraftFilters(f => ({ ...f, pesquisa: e.target.value }))}
                placeholder="Digite o nº visual"
                className={inputClass}
              />
            </FilterCard>

            <FilterCard label="Lote">
              <select
                value={draftFilters.loteId}
                onChange={e => setDraftFilters(f => ({ ...f, loteId: e.target.value }))}
                className={selectClass}
              >
                <option value="">Selecione o lote</option>
                {lotesFiltrados.map(l => (
                  <option key={l.id} value={String(l.id)}>{l.nome}</option>
                ))}
              </select>
            </FilterCard>

            <FilterCard label="Sexo">
              <select
                value={draftFilters.sexo}
                onChange={e => setDraftFilters(f => ({ ...f, sexo: e.target.value, categoria: "" }))}
                className={selectClass}
              >
                <option value="">Todos</option>
                <option value="macho">Macho</option>
                <option value="femea">Fêmea</option>
              </select>
            </FilterCard>
          </div>

          {/* Seta filtros adicionais */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setFiltrosAdicionaisAbertos(v => !v)}
              className="flex items-center justify-center w-10 h-8 rounded-sm border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
              aria-label={filtrosAdicionaisAbertos ? "Recolher filtros adicionais" : "Expandir filtros adicionais"}
            >
              <span className="material-icons text-[20px]">
                {filtrosAdicionaisAbertos ? "expand_less" : "expand_more"}
              </span>
            </button>
          </div>

          {/* Filtros adicionais + ações */}
          {filtrosAdicionaisAbertos ? (
            <div className="flex flex-col lg:flex-row gap-3 items-stretch">
              <div className="flex-1 border border-gray-200 rounded-sm bg-[#F5F5F5] p-4 space-y-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Filtros adicionais</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <FilterCard label="Data de Nascimento">
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={draftFilters.dataNascimentoInicial}
                        onChange={e => setDraftFilters(f => ({ ...f, dataNascimentoInicial: e.target.value }))}
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                      <span className="text-gray-400 text-[11px] shrink-0">–</span>
                      <input
                        type="date"
                        value={draftFilters.dataNascimentoFinal}
                        onChange={e => setDraftFilters(f => ({ ...f, dataNascimentoFinal: e.target.value }))}
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                    </div>
                  </FilterCard>

                  <FilterCard label="Peso">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={draftFilters.pesoInicial}
                        onChange={e => setDraftFilters(f => ({ ...f, pesoInicial: e.target.value }))}
                        placeholder="Inicial"
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                      <span className="text-gray-400 text-[11px] shrink-0">–</span>
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={draftFilters.pesoFinal}
                        onChange={e => setDraftFilters(f => ({ ...f, pesoFinal: e.target.value }))}
                        placeholder="Final"
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                    </div>
                  </FilterCard>

                  <FilterCard label="N° RFID">
                    <input
                      type="text"
                      value={draftFilters.brincoEletronico}
                      onChange={e => setDraftFilters(f => ({ ...f, brincoEletronico: e.target.value }))}
                      placeholder="Digite o n° RFID"
                      className={inputClass}
                    />
                  </FilterCard>

                  <FilterCard label="Subdivisão">
                    <select
                      value={draftFilters.pastoId}
                      onChange={e => setDraftFilters(f => ({ ...f, pastoId: e.target.value }))}
                      disabled={!draftFilters.fazendaId}
                      className={selectClass}
                    >
                      <option value="">Selecione a subdivisão</option>
                      {pastos.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.nome}</option>
                      ))}
                    </select>
                  </FilterCard>

                  <FilterCard label="Raça">
                    <select
                      value={draftFilters.raca}
                      onChange={e => setDraftFilters(f => ({ ...f, raca: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">Todas as raças</option>
                      {RACAS.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </FilterCard>

                  <FilterCard label="Categoria">
                    <select
                      value={draftFilters.categoria}
                      onChange={e => setDraftFilters(f => ({ ...f, categoria: e.target.value }))}
                      className={selectClass}
                    >
                      <option value="">Todas as categorias</option>
                      {categorias.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </FilterCard>

                  <FilterCard label="Filtrar apenas animais inativos">
                    <div className="flex items-center gap-3 h-[36px]">
                      <Switch
                        checked={draftFilters.somenteInativos}
                        onCheckedChange={checked => setDraftFilters(f => ({ ...f, somenteInativos: checked }))}
                        className="data-[state=checked]:bg-[#8ab83d]"
                      />
                      <span className="text-[12px] text-gray-700">Somente inativos</span>
                    </div>
                  </FilterCard>

                  <FilterCard label="Marcadores">
                    <MarcadoresMultiSelect
                      value={draftFilters.marcadores}
                      options={marcadoresDisponiveis}
                      onChange={marcadores => setDraftFilters(f => ({ ...f, marcadores }))}
                    />
                  </FilterCard>

                  <FilterCard label="Idade em Meses">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={draftFilters.idadeMesesInicial}
                        onChange={e => setDraftFilters(f => ({ ...f, idadeMesesInicial: e.target.value }))}
                        placeholder="Inicial"
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                      <span className="text-gray-400 text-[11px] shrink-0">–</span>
                      <input
                        type="number"
                        min={0}
                        value={draftFilters.idadeMesesFinal}
                        onChange={e => setDraftFilters(f => ({ ...f, idadeMesesFinal: e.target.value }))}
                        placeholder="Final"
                        className={`${inputClass} flex-1 min-w-0`}
                      />
                    </div>
                  </FilterCard>

                  <FilterCard label="Registro de Nascimento (RGN)">
                    <input
                      type="text"
                      value={draftFilters.rgn}
                      onChange={e => setDraftFilters(f => ({ ...f, rgn: e.target.value }))}
                      placeholder="Digite o RGN"
                      className={inputClass}
                    />
                  </FilterCard>

                  <FilterCard label="Registro Definitivo (RGD)">
                    <input
                      type="text"
                      value={draftFilters.rgd}
                      onChange={e => setDraftFilters(f => ({ ...f, rgd: e.target.value }))}
                      placeholder="Digite o RGD"
                      className={inputClass}
                    />
                  </FilterCard>

                  <FilterCard label="Animal com SISBOV">
                    <div className="flex items-center gap-3 h-[36px]">
                      <Switch
                        checked={draftFilters.somenteSisbov}
                        onCheckedChange={checked => setDraftFilters(f => ({ ...f, somenteSisbov: checked }))}
                        className="data-[state=checked]:bg-[#8ab83d]"
                      />
                      <span className="text-[12px] text-gray-700">Somente SISBOV</span>
                    </div>
                  </FilterCard>
                </div>
              </div>

              <div className="flex flex-row lg:flex-col gap-2 lg:w-44 shrink-0">
                <button
                  type="button"
                  onClick={handleBuscar}
                  className={`${btnActionClass} lg:flex-1`}
                  style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
                >
                  Buscar Animais
                </button>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className={`${btnActionClass} lg:flex-1`}
                  style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
                >
                  Limpar Filtros
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              <button
                type="button"
                onClick={handleBuscar}
                className={btnActionClass}
                style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
              >
                Buscar Animais
              </button>
              <button
                type="button"
                onClick={limparFiltros}
                className={btnActionClass}
                style={{ backgroundColor: IRANCHO_BTN_GREY, minHeight: 40 }}
              >
                Limpar Filtros
              </button>
            </div>
          )}

          {/* Tabela */}
          <div className="border border-gray-200 rounded-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[340px]">
              <table className="w-full text-[11px] min-w-[1000px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="w-10 px-2 py-2 border-r border-gray-200 bg-gray-50" />
                    <th className={`${thClass} bg-gray-50`}>ID</th>
                    <th className={`${thClass} bg-gray-50`}>Nome</th>
                    <th className={`${thClass} bg-gray-50`}>Sexo</th>
                    <th className={`${thClass} bg-gray-50`}>Data Nascimento</th>
                    <th className={`${thClass} bg-gray-50`}>ID Brinco Eletrônico</th>
                    <th className={`${thClass} bg-gray-50`}>ID SISBOV</th>
                    <th className={`${thClass} bg-gray-50`}>Peso</th>
                    <th className={`${thClass} bg-gray-50`}>Data da Pesagem</th>
                    <th className={`${thClass} bg-gray-50`}>Lote</th>
                    <th className={`${thClass} bg-gray-50`}>Raça</th>
                    <th className={`${thClass} border-r-0 bg-gray-50`}>Fazenda</th>
                  </tr>
                </thead>
                <tbody>
                  {!buscou || isLoading ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-gray-400">
                        {isLoading ? "Carregando..." : "Sem dados"}
                      </td>
                    </tr>
                  ) : disponiveis.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-gray-400">Sem dados</td>
                    </tr>
                  ) : (
                    disponiveis.map((animal, idx) => {
                      const lote = animal.loteId ? lotesMap.get(animal.loteId) : undefined;
                      return (
                        <tr
                          key={animal.id}
                          className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/60"}`}
                        >
                          <td className="px-2 py-2 border-r border-gray-100">
                            <Checkbox
                              checked={selected.has(animal.id)}
                              onCheckedChange={() => toggleSelect(animal.id)}
                              className="data-[state=checked]:bg-[#8ab83d] data-[state=checked]:border-[#8ab83d]"
                            />
                          </td>
                          <td className="px-2 py-2 text-gray-700 border-r border-gray-100">{numeroVisual(animal)}</td>
                          <td className="px-2 py-2 text-gray-800 border-r border-gray-100">{displayNome(animal)}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.sexo === "macho" ? "Macho" : "Fêmea"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {formatDateBR(animal.dataNascimento)}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.brincoEletronico || "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">{animal.sisbov || "—"}</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {animal.ultimoPeso != null ? Number(animal.ultimoPeso).toFixed(1) : "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">—</td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">
                            {lote?.nome || animal.loteNome || "—"}
                          </td>
                          <td className="px-2 py-2 text-gray-600 border-r border-gray-100">{animal.raca || "—"}</td>
                          <td className="px-2 py-2 text-gray-600">{lote?.fazendaNome || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Contador */}
          {buscou && !isLoading && (
            <p className="text-[11px] text-gray-500">
              Qtd. Animais: <span className="font-semibold text-gray-700">{disponiveis.length}</span>
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-5 py-2 rounded text-[11px] font-semibold uppercase tracking-wide text-white hover:brightness-95 disabled:opacity-50"
            style={{ backgroundColor: IRANCHO_BTN_GREEN }}
          >
            {`Adicionar Selecionados${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
