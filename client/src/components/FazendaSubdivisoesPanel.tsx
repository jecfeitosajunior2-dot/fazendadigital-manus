import { useMemo, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TIPOS_DIVISAO, TIPOS_PASTAGEM } from "@/lib/subdivisao-types";
import {
  areaDicaParaTipo,
  areaObrigatoriaParaTipo,
  areaPlaceholderParaTipo,
  convertAreaInputToHectares,
  formatHectaresForStorage,
  incluirAreaPadraoParaTipo,
} from "@/lib/subdivisao-area";
import { SelectItem } from "@/components/ui/select";
import { FormLabel, FormInput, FormSelect } from "@/components/FormFields";
import { ImportarCoordenadasModal } from "@/components/ImportarCoordenadasModal";
import { FazendaSubdivisaoMapaModal } from "@/components/FazendaSubdivisaoMapaModal";
import { useConfirm } from "@/components/ConfirmDialog";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { ordenarFazendasPorNome } from "@/lib/fazendasListagem";
import { exportListPdf } from "@/lib/exportList";
import { DeleteActionIcon, EditActionIcon } from "@/components/icons/FarmActionIcons";
import SemCoordenadasIcon from "@/components/icons/SemCoordenadasIcon";
import { Map } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
const FD_PRIMARY = "#4ECDC4";
const TOAST_ID_OBRIGATORIOS = "subdivisao-campos-obrigatorios";

type CampoObrigatorioSub = "tipo" | "nome" | "area";

const CAMPOS_ORDEM: CampoObrigatorioSub[] = ["tipo", "nome", "area"];

function fieldDomId(campo: CampoObrigatorioSub) {
  return `subdivisao-field-${campo}`;
}

function SubCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("bg-white border border-gray-200 rounded shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-[#4ECDC4]" style={{ fontFamily: "Inter, sans-serif", fontSize: "16px", fontWeight: 600 }}>{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FieldErrorMsg({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-[11px] text-red-600" role="alert">
      {message}
    </p>
  );
}

function focarCampo(campo: CampoObrigatorioSub) {
  const el = document.getElementById(fieldDomId(campo));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    if (el instanceof HTMLElement) el.focus({ preventScroll: true });
  }, 250);
}

function coletarErrosSubdivisao(form: {
  tipo: string;
  nome: string;
  area: string;
}): Partial<Record<CampoObrigatorioSub, string>> {
  const erros: Partial<Record<CampoObrigatorioSub, string>> = {};
  if (!form.tipo.trim()) erros.tipo = "Selecione o tipo de divisão.";
  if (!form.nome.trim()) erros.nome = "Informe o nome da subdivisão.";

  const areaObrigatoria = areaObrigatoriaParaTipo(form.tipo);
  const areaHa = convertAreaInputToHectares(form.area, "ha");
  if (form.area.trim() && areaHa === null) {
    erros.area = "Informe uma área válida.";
  } else if (areaObrigatoria && areaHa === null) {
    erros.area = "Informe a área da subdivisão.";
  }
  return erros;
}

function primeiroCampoInvalido(
  erros: Partial<Record<CampoObrigatorioSub, string>>,
): CampoObrigatorioSub | null {
  return CAMPOS_ORDEM.find(c => !!erros[c]) ?? null;
}

const MSG_TOAST: Record<CampoObrigatorioSub, string> = {
  tipo: "Tipo de divisão é obrigatório.",
  nome: "Nome da subdivisão é obrigatório.",
  area: "Área é obrigatória para este tipo de subdivisão.",
};

type Fazenda = {
  id: number;
  nome: string;
  responsavel?: string | null;
  unidadeArea?: string | null;
  latitude?: string | null;
  longitude?: string | null;
};

const STATUS_OPERACIONAL = [
  { value: "ativo", label: "Disponível" },
  { value: "descanso", label: "Em descanso" },
  { value: "reforma", label: "Em reforma" },
  { value: "interditado", label: "Interditado" },
  { value: "reserva", label: "Reserva" },
  { value: "sem_uso", label: "Sem uso" },
  { value: "vazio", label: "Sem uso" },
] as const;

const emptyForm = () => ({
  tipo: "Invernada",
  nome: "",
  area: "",
  capacidade: "",
  tipoPastagem: "",
  status: "ativo",
  incluirArea: true,
});

function areaUnitLabel(unidade?: string | null) {
  const value = String(unidade || "Hectare").toLowerCase();
  if (value.includes("alqueire")) return "alq.";
  if (value.includes("acre")) return "ac";
  if (value.includes("m²") || value.includes("metro")) return "m²";
  return "ha";
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function formatArea(value: unknown, unidade?: string | null) {
  const unit = areaUnitLabel(unidade);
  const number = parseNumber(value);
  if (number === null) {
    const raw = String(value ?? "").trim();
    return raw ? `${raw} ${unit}` : "—";
  }
  return `${number.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unit}`;
}

function statusOperacionalLabel(status?: string | null) {
  return STATUS_OPERACIONAL.find(s => s.value === status)?.label ?? "Disponível";
}

function corSituacaoSubdivisao(status?: string | null) {
  if (status === "interditado" || status === "reforma") return "#DC2626";
  if (status === "descanso" || status === "reserva") return "#D97706";
  if (status === "sem_uso" || status === "vazio") return "#6B7280";
  return "#16A34A";
}

const fonteLista = "'Inter', sans-serif";
const cabecalhoLista = { fontFamily: fonteLista, fontSize: "12px", fontWeight: 500 };
const infoLista = { fontFamily: fonteLista, fontSize: "14px", fontWeight: 400 };

function textoTipoDivisao(tipo?: string | null) {
  const texto = String(tipo ?? "").trim();
  return texto || "—";
}

function textoPesquisa(valor?: string | null) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function subdivisaoCombinaBusca(
  subdivisao: { nome?: string | null; tipo?: string | null },
  busca: string,
) {
  const termo = textoPesquisa(busca);
  if (!termo) return true;
  return [subdivisao.nome, textoTipoDivisao(subdivisao.tipo)].some(valor => textoPesquisa(valor).includes(termo));
}

function SubdivisaoAcoes({
  nome,
  temMapa,
  onEditar,
  onMapa,
  onExcluir,
}: {
  nome: string;
  temMapa: boolean;
  onEditar: () => void;
  onMapa: () => void;
  onExcluir: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4ECDC4]"
          aria-label={`Ações de ${nome}`}
        >
          <span className="material-icons text-[20px]">more_vert</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" collisionPadding={8} className="min-w-[160px] z-[100]">
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2 text-[#586168] focus:text-white data-[highlighted]:text-white"
          onClick={onEditar}
        >
          <EditActionIcon size={16} style={{ color: "currentColor" }} />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem
          className={`text-[12px] cursor-pointer gap-2 focus:text-white data-[highlighted]:text-white ${temMapa ? "text-[#7CB342]" : "text-[#586168]"}`}
          onClick={onMapa}
        >
          {temMapa ? <Map size={16} strokeWidth={1.75} /> : <SemCoordenadasIcon size={16} />}
          Ver no mapa
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-[12px] cursor-pointer gap-2 text-[#DC2626] focus:text-white data-[highlighted]:text-white"
          onClick={onExcluir}
        >
          <DeleteActionIcon size={16} style={{ color: "currentColor" }} />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function pastagemAplicavel(tipo?: string | null) {
  const value = String(tipo || "").toLowerCase();
  return value.includes("pasto") || value.includes("piquete") || value.includes("potreiro") || value.includes("invernada");
}

export function FazendaSubdivisoesPanel({ fazenda }: { fazenda: Fazenda | null }) {
  const utils = trpc.useUtils();
  const confirm = useConfirm();
  const fazendaId = fazenda?.id ?? 0;

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [errosObrigatorios, setErrosObrigatorios] = useState<
    Partial<Record<CampoObrigatorioSub, string>>
  >({});
  const [importarCoordenadasOpen, setImportarCoordenadasOpen] = useState(false);
  const [mapaPastoDestaque, setMapaPastoDestaque] = useState<{
    id: number;
    nome: string;
  } | null>(null);
  const [nomeCrescente, setNomeCrescente] = useState(true);
  const [busca, setBusca] = useState("");

  const { data: subdivisoes = [], isLoading } = trpc.pastos.listByFazenda.useQuery(
    { fazendaId },
    { enabled: fazendaId > 0 }
  );

  const subdivisoesOrdenadas = useMemo(() => {
    const filtradas = subdivisoes.filter(s => subdivisaoCombinaBusca(s, busca));
    return ordenarFazendasPorNome(filtradas, nomeCrescente);
  }, [subdivisoes, busca, nomeCrescente]);

  const baixarPdf = () => {
    const linhas = subdivisoesOrdenadas.map(s => [
      s.nome,
      textoTipoDivisao(s.tipo),
      formatArea(s.area, fazenda?.unidadeArea),
      statusOperacionalLabel(s.status),
    ]);
    void exportListPdf(`Subdivisões - ${fazenda?.nome ?? "Fazenda"}`, ["Nome", "Tipo", "Área", "Situação"], linhas, {
      fazendaNome: fazenda?.nome,
      columnAligns: ["left", "left", "right", "center"],
      showRegistrosSubtitle: false,
    });
  };
  const invalidate = () => {
    utils.pastos.listByFazenda.invalidate({ fazendaId });
    utils.pastos.list.invalidate();
    utils.pastos.listWithDetails.invalidate();
  };

  const createMutation = trpc.pastos.create.useMutation({
    onSuccess: () => {
      toast.success("Subdivisão cadastrada!");
      invalidate();
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  const updateMutation = trpc.pastos.update.useMutation({
    onSuccess: () => {
      toast.success("Subdivisão atualizada!");
      invalidate();
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  const deleteMutation = trpc.pastos.delete.useMutation({
    onSuccess: () => { toast.success("Subdivisão excluída!"); invalidate(); },
    onError: e => toast.error(e.message),
  });

  const handleDeleteSubdivisao = async (subdivisao: { id: number; nome: string }) => {
    const ok = await confirm({
      title: "Excluir subdivisão",
      description: `Tem certeza que deseja excluir a subdivisão "${subdivisao.nome}"? Esta ação não pode ser desfeita.`,
      confirmText: "Excluir",
      cancelText: "Cancelar",
      variant: "danger",
    });
    if (ok) deleteMutation.mutate({ id: subdivisao.id });
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditId(null);
    setShowForm(false);
    setErrosObrigatorios({});
  };

  const openNovaSubdivisaoForm = () => {
    setEditId(null);
    setForm(emptyForm());
    setErrosObrigatorios({});
    setShowForm(true);
  };

  const toggleNovaSubdivisaoForm = () => {
    if (showForm) resetForm();
    else openNovaSubdivisaoForm();
  };

  const limparErroCampo = (campo: CampoObrigatorioSub) => {
    setErrosObrigatorios(prev => {
      if (!prev[campo]) return prev;
      const next = { ...prev };
      delete next[campo];
      return next;
    });
  };

  const handleSubmit = async () => {
    const erros = coletarErrosSubdivisao(form);
    const primeiro = primeiroCampoInvalido(erros);

    if (primeiro) {
      setErrosObrigatorios(erros);
      const toastMsg =
        primeiro === "area" && form.area.trim() && !convertAreaInputToHectares(form.area, "ha")
          ? "Informe uma área válida."
          : MSG_TOAST[primeiro];
      toast.error(toastMsg, { id: TOAST_ID_OBRIGATORIOS });
      focarCampo(primeiro);
      return;
    }

    setErrosObrigatorios({});
    const areaHa = convertAreaInputToHectares(form.area, "ha");
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      tipoPastagem: form.tipoPastagem || undefined,
      area: areaHa !== null ? formatHectaresForStorage(areaHa) : undefined,
      incluirArea: form.incluirArea,
      capacidade: form.capacidade ? parseInt(form.capacidade, 10) : undefined,
      status: form.status as "ativo" | "descanso" | "vazio" | "reforma" | "interditado" | "reserva" | "sem_uso",
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate({ fazendaId, ...payload });
    }
  };

  const handleTipoChange = (tipo: string) => {
    setForm(f => ({
      ...f,
      tipo,
      incluirArea: editId ? f.incluirArea : incluirAreaPadraoParaTipo(tipo),
    }));
    limparErroCampo("tipo");
    // Área pode deixar de ser obrigatória ao trocar o tipo
    limparErroCampo("area");
  };

  const areaObrigatoria = areaObrigatoriaParaTipo(form.tipo);
  const areaDica = areaDicaParaTipo(form.tipo);

  const startEdit = (s: typeof subdivisoes[0]) => {
    setEditId(s.id);
    setErrosObrigatorios({});
    setForm({
      tipo: s.tipo || "Pasto",
      nome: s.nome,
      area: s.area ? String(s.area) : "",
      capacidade: s.capacidade ? String(s.capacidade) : "",
      tipoPastagem: s.tipoPastagem || "",
      status: s.status === "vazio" ? "sem_uso" : s.status || "ativo",
      incluirArea: s.incluirArea !== false,
    });
    setShowForm(true);
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const tentativaValidacao = Object.keys(errosObrigatorios).length > 0;

  if (!fazenda) {
    return (
      <div className="mt-6 bg-white border border-gray-200 rounded shadow-sm p-8 text-center text-gray-400">
        <span className="material-icons text-4xl block mb-2 opacity-30">touch_app</span>
        <p className="text-[12px]">Selecione uma fazenda acima para visualizar suas subdivisões.</p>
      </div>
    );
  }

  return (
    <div id="fazenda-subdivisoes" className="mt-6">
    <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={baixarPdf}
          title="Baixar PDF"
          aria-label="Baixar PDF"
          className="inline-flex h-10 w-10 items-center justify-center rounded hover:bg-gray-100 active:scale-[0.97] shrink-0"
        >
          <span className="material-icons text-[22px] leading-none" style={{ color: "#E53935" }} aria-hidden>
            picture_as_pdf
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <label className="relative block">
            <span className="material-icons pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-gray-400">search</span>
            <input
              value={busca}
              onChange={evento => setBusca(evento.target.value)}
              placeholder="Buscar subdivisão"
              aria-label="Buscar subdivisão"
              className="min-h-[44px] w-56 rounded border border-gray-200 bg-white pl-10 pr-3 text-gray-700 outline-none focus:border-[#4ECDC4]"
              style={infoLista}
            />
          </label>
          <button
            type="button"
            onClick={toggleNovaSubdivisaoForm}
            className="flex items-center justify-center gap-1 px-3 py-1.5 min-h-[44px] rounded text-white text-[11px] font-medium uppercase"
            style={{ backgroundColor: FD_PRIMARY, fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600 }}
          >
            <span className="material-icons text-[14px]">add</span>
            Nova Subdivisão
          </button>
          <button
            type="button"
            onClick={() => setImportarCoordenadasOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 active:scale-[0.97] transition shrink-0 min-h-[44px]"
            style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", fontWeight: 600 }}
          >
            <span className="material-icons text-[16px] text-gray-500">upload_file</span>
            Importar Coordenadas
          </button>
        </div>
      </div>

      {/* Formulário inline — espelho iRancho */}
      {showForm && (
        <div className="subdivisao-formulario px-4 py-4 space-y-5 bg-gray-50/70">
          <style>{`
            .subdivisao-formulario, .subdivisao-formulario label, .subdivisao-formulario input,
            .subdivisao-formulario textarea, .subdivisao-formulario h2, .subdivisao-formulario h3,
            .subdivisao-formulario [data-slot="select-trigger"],
            .subdivisao-formulario [data-slot="select-trigger"] span {
              font-family: Inter, sans-serif;
            }
            .subdivisao-formulario label { font-size: 13px; font-weight: 500; }
            .subdivisao-formulario input,
            .subdivisao-formulario textarea,
            .subdivisao-formulario [data-slot="select-trigger"],
            .subdivisao-formulario [data-slot="select-trigger"] span {
              font-size: 14px;
              font-weight: 400;
            }
            .subdivisao-formulario .subdivisao-acao { font-size: 14px; font-weight: 600; }
            .subdivisao-formulario .material-icons { font-family: "Material Icons"; }
          `}</style>
          {editId ? (
            <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
              <div className="px-5 py-4">
                <h2 className="text-gray-900" style={{ fontFamily: "Inter, sans-serif", fontSize: "24px", fontWeight: 600 }}>
                  Editar Subdivisão
                </h2>
              </div>
            </div>
          ) : null}

          <SubCard title="Identificação">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="scroll-mt-24">
                <FormLabel required>Tipo de Divisão</FormLabel>
                <FormSelect variant="light"
                  id={fieldDomId("tipo")}
                  value={form.tipo}
                  onChange={handleTipoChange}
                  placeholder="Tipo"
                  required
                  invalid={!!errosObrigatorios.tipo}
                  aria-describedby={errosObrigatorios.tipo ? "subdivisao-err-tipo" : undefined}
                >
                  {TIPOS_DIVISAO.map(t => (
                    <SelectItem key={t} value={t} className="text-[13px]">{t}</SelectItem>
                  ))}
                </FormSelect>
                <FieldErrorMsg id="subdivisao-err-tipo" message={errosObrigatorios.tipo} />
              </div>
              <div className="scroll-mt-24">
                <FormLabel required>Nome da Subdivisão</FormLabel>
                <FormInput variant="light"
                  id={fieldDomId("nome")}
                  required
                  value={form.nome}
                  onChange={v => {
                    setForm(f => ({ ...f, nome: v }));
                    limparErroCampo("nome");
                  }}
                  placeholder="Ex. Pasto A"
                  invalid={!!errosObrigatorios.nome}
                  aria-describedby={errosObrigatorios.nome ? "subdivisao-err-nome" : undefined}
                />
                <FieldErrorMsg id="subdivisao-err-nome" message={errosObrigatorios.nome} />
              </div>
            </div>
          </SubCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <SubCard title="Área e Capacidade" className="h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div className="sm:col-span-2 lg:col-span-1 scroll-mt-24">
                  <FormLabel required={areaObrigatoria}>
                    Área (ha)
                  </FormLabel>
                  <FormInput variant="light"
                    id={fieldDomId("area")}
                    required={areaObrigatoria}
                    type="text"
                    inputMode="decimal"
                    value={form.area}
                    onChange={v => {
                      setForm(f => ({ ...f, area: v }));
                      limparErroCampo("area");
                    }}
                    placeholder={areaPlaceholderParaTipo(form.tipo, "ha")}
                    invalid={!!errosObrigatorios.area}
                    aria-describedby={errosObrigatorios.area ? "subdivisao-err-area" : undefined}
                  />
                  <FieldErrorMsg id="subdivisao-err-area" message={errosObrigatorios.area} />
                  {areaDica && !errosObrigatorios.area && (
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{areaDica}</p>
                  )}
                </div>
                <div>
                  <FormLabel>Capacidade (UA)</FormLabel>
                  <FormInput variant="light"
                    type="number"
                    value={form.capacidade}
                    onChange={v => setForm(f => ({ ...f, capacidade: v }))}
                    placeholder="Ex. 50"
                  />
                </div>
              </div>
            </SubCard>

            <SubCard title="Pastagem e Situação" className="h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <div>
                  <FormLabel>Tipo de Pastagem</FormLabel>
                  <FormSelect variant="light"
                    value={form.tipoPastagem || "__none__"}
                    onChange={v => setForm(f => ({ ...f, tipoPastagem: v === "__none__" ? "" : v }))}
                    placeholder="Selecione o tipo de Pastagem"
                    side="top"
                  >
                    <SelectItem value="__none__" className="text-[13px] text-gray-400">Selecione o tipo de Pastagem</SelectItem>
                    {TIPOS_PASTAGEM.map(t => (
                      <SelectItem key={t} value={t} className="text-[13px]">{t}</SelectItem>
                    ))}
                  </FormSelect>
                  {!pastagemAplicavel(form.tipo) && (
                    <p className="mt-1 text-[11px] text-gray-400">Não aplicável para este tipo de divisão</p>
                  )}
                </div>
                <div>
                  <FormLabel>Situação</FormLabel>
                  <FormSelect variant="light"
                    value={form.status}
                    onChange={v => setForm(f => ({ ...f, status: v }))}
                    placeholder="Situação"
                    side="top"
                  >
                    {STATUS_OPERACIONAL.filter((item, index, arr) => arr.findIndex(i => i.label === item.label) === index).map(s => (
                      <SelectItem key={s.value} value={s.value} className="text-[13px]">{s.label}</SelectItem>
                    ))}
                  </FormSelect>
                </div>
              </div>
            </SubCard>
          </div>
        </div>
      )}

      {!showForm && (
      <TableHorizontalScroll fitWidth>
        <table className="w-full min-w-[640px] table-fixed">
          <colgroup>
            <col style={{ width: "28%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th
                aria-sort={nomeCrescente ? "ascending" : "descending"}
                className="px-3 py-2 text-left text-gray-500 uppercase whitespace-nowrap"
                style={cabecalhoLista}
              >
                <button
                  type="button"
                  onClick={() => setNomeCrescente((atual) => !atual)}
                  className="inline-flex items-center gap-0.5 uppercase hover:text-gray-700"
                  aria-label={nomeCrescente ? "Ordenar nome de Z até A" : "Ordenar nome de A até Z"}
                >
                  Nome
                  <span className="material-icons text-[18px] leading-none text-gray-400" aria-hidden>
                    {nomeCrescente ? "arrow_drop_up" : "arrow_drop_down"}
                  </span>
                </button>
              </th>
              <th className="px-3 py-2 text-left text-gray-500 uppercase whitespace-nowrap" style={cabecalhoLista}>Tipo</th>
              <th className="px-3 py-2 text-right text-gray-500 uppercase whitespace-nowrap" style={cabecalhoLista}>Área</th>
              <th className="px-3 py-2 text-center text-gray-500 uppercase whitespace-nowrap" style={cabecalhoLista}>Situação</th>
              <th className="px-3 py-2 text-center text-gray-500 uppercase whitespace-nowrap" style={cabecalhoLista}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400" style={infoLista}>Carregando...</td></tr>
            )}
            {!isLoading && subdivisoes.length > 0 && subdivisoesOrdenadas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400" style={infoLista}>
                  Nenhuma subdivisão encontrada.
                </td>
              </tr>
            )}
            {!isLoading && subdivisoes.length === 0 && !showForm && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400" style={infoLista}>
                  Nenhuma subdivisão cadastrada.
                </td>
              </tr>
            )}
            {subdivisoesOrdenadas.map(s => (
              <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                <td className="min-w-0 overflow-hidden px-3 py-2 text-left align-middle text-gray-700" style={infoLista}>
                  <span className="block truncate" title={s.nome}>{s.nome}</span>
                </td>
                <td className="min-w-0 overflow-hidden px-3 py-2 text-left align-middle text-gray-700" style={infoLista}>
                  <span className="block truncate" title={textoTipoDivisao(s.tipo)}>{textoTipoDivisao(s.tipo)}</span>
                </td>
                <td className="px-3 py-2 text-right align-middle whitespace-nowrap tabular-nums text-gray-700" style={infoLista}>{formatArea(s.area, fazenda.unidadeArea)}</td>
                <td className="px-3 py-2 text-center align-middle whitespace-nowrap" style={{ ...infoLista, color: corSituacaoSubdivisao(s.status) }}>
                  {statusOperacionalLabel(s.status)}
                </td>
                <td className="px-3 py-2 text-center align-middle whitespace-nowrap">
                  <div className="flex items-center justify-center">
                    <SubdivisaoAcoes
                      nome={s.nome}
                      temMapa={Boolean(s.coordenadas)}
                      onEditar={() => startEdit(s)}
                      onMapa={() => {
                        if (!s.coordenadas) {
                          toast.info("Use o botão Importar Coordenadas no topo para importar o KML da fazenda.");
                          return;
                        }
                        setMapaPastoDestaque({ id: s.id, nome: s.nome });
                      }}
                      onExcluir={() => { void handleDeleteSubdivisao({ id: s.id, nome: s.nome }); }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableHorizontalScroll>
      )}
    </div>

      {showForm && (
        <div className="subdivisao-formulario pt-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-h-[18px]">
            {tentativaValidacao && (
              <p className="text-[12px] text-red-600">
                Preencha os campos obrigatórios destacados.
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end shrink-0">
            <button
              type="button"
              onClick={resetForm}
              disabled={isBusy}
              className="subdivisao-acao px-6 py-2 rounded-full uppercase tracking-wide bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isBusy}
              className="subdivisao-acao px-6 py-2 rounded-full uppercase tracking-wide text-gray-800 hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {isBusy ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
            </button>
          </div>
        </div>
      )}

      <ImportarCoordenadasModal
        open={importarCoordenadasOpen}
        onClose={() => setImportarCoordenadasOpen(false)}
        fazendaId={fazendaId}
        onImportado={invalidate}
      />

      <FazendaSubdivisaoMapaModal
        open={mapaPastoDestaque != null}
        onClose={() => setMapaPastoDestaque(null)}
        fazendaNome={fazenda.nome}
        fazendaLatitude={fazenda.latitude}
        fazendaLongitude={fazenda.longitude}
        subdivisoes={subdivisoes}
        pastoDestaqueId={mapaPastoDestaque?.id ?? 0}
        pastoDestaqueNome={mapaPastoDestaque?.nome ?? ""}
      />
    </div>
  );
}

export default FazendaSubdivisoesPanel;
