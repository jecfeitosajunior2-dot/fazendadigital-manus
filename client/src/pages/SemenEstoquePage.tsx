import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import FazendaOverviewSelect from "@/components/FazendaOverviewSelect";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
  inputClass,
} from "@/components/FormFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDateBR } from "@/lib/date-utils";
import { semenEntradaModalLayout } from "@/lib/semenEntradaModalLayout";
import { isValidSemenMovimentacaoId, semenEntradaResumoPath } from "@/lib/semenRoutes";
import { trpc } from "@/lib/trpc";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import {
  persistRebanhoFazendaId,
  readPersistedRebanhoFazendaId,
} from "@shared/animal-filter-types";
import type { AnimalAutocompleteRow } from "@shared/animalAutocomplete";
import { formatMoedaBrlExcel, parseValorDecimalBanco } from "@shared/parseMoedaBr";
import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  SEMEN_STATUS_DISPONIVEL,
  SEMEN_STATUS_ESGOTADO,
  calcSemenCustoUnitarioEntrada,
  formatSemenCustoTotalDisplay,
  isSemenEntradaFormSubmittable,
  parseSemenCustoTotal,
  parseSemenQuantidadeDoses,
} from "@shared/semenEstoque";
import { shouldShowSemenMovimentacaoCustoTotal } from "@shared/semenMovimentacaoDisplay";
import { filterMachosReprodutoresCandidatos } from "@shared/reproMachoSelect";
import { toDateOnlyISO } from "@shared/carenciaAnimal";
import { toast } from "sonner";
import { ArrowLeft, Plus, Search } from "lucide-react";

const fieldCls = inputClass;
const labelCls = "block text-[11px] text-gray-600 font-medium mb-1";
const sectionTitleCls = "text-[13px] font-semibold text-gray-800";

type StatusFilter = "todos" | typeof SEMEN_STATUS_DISPONIVEL | typeof SEMEN_STATUS_ESGOTADO;

function formatCustoDisplay(val: string | null | undefined): string {
  if (val == null || val === "") return "—";
  const n = parseValorDecimalBanco(val);
  return n != null ? formatMoedaBrlExcel(n) : "—";
}

export default function SemenEstoquePage() {
  const [, params] = useRoute("/reproducao/estoque-semen/:id");
  const [, setLocation] = useLocation();
  const detailId = params?.id ? Number(params.id) : null;

  const utils = trpc.useUtils();
  const { data: fazendas = [], isLoading: loadingFazendas } = trpc.fazendas.list.useQuery();
  const [fazendaId, setFazendaId] = useState("");
  const [fazendaInitDone, setFazendaInitDone] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [entradaOpen, setEntradaOpen] = useState(false);

  useEffect(() => {
    if (loadingFazendas || fazendaInitDone) return;
    if (!fazendas.length) {
      setFazendaInitDone(true);
      return;
    }
    const ids = fazendas.map(f => f.id);
    const fromStorage = readPersistedRebanhoFazendaId(ids);
    const resolved = fromStorage || (fazendas.length === 1 ? String(fazendas[0]!.id) : "");
    if (resolved) {
      setFazendaId(resolved);
      persistRebanhoFazendaId(resolved);
    }
    setFazendaInitDone(true);
  }, [fazendas, fazendaInitDone, loadingFazendas]);

  const fazendaNum = fazendaId ? Number(fazendaId) : 0;

  const { data: partidas = [], isLoading: loadingPartidas, refetch } = trpc.semen.list.useQuery(
    {
      fazendaId: fazendaNum,
      search: search.trim() || undefined,
      status: statusFilter,
    },
    { enabled: fazendaNum > 0 && !detailId },
  );

  const { data: detalhe, isLoading: loadingDetalhe } = trpc.semen.getById.useQuery(
    { id: detailId! },
    { enabled: detailId != null && detailId > 0 },
  );

  const { data: animaisFazenda = [], isLoading: carregandoAnimais } = trpc.animais.list.useQuery(
    { fazendaId: fazendaNum || undefined, status: "ativo" },
    { enabled: fazendaNum > 0 && entradaOpen },
  );

  const onChangeFazenda = (value: string) => {
    setFazendaId(value);
    if (value) persistRebanhoFazendaId(value);
  };

  const abrirDetalhe = (id: number) => {
    setLocation(`/reproducao/estoque-semen/${id}`);
  };

  const voltarLista = () => {
    setLocation("/reproducao/estoque-semen");
  };

  if (detailId && detailId > 0) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          <p className="text-[11px] text-gray-500 font-medium">Reprodução</p>
          <button
            type="button"
            onClick={voltarLista}
            className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para lista
          </button>

          {loadingDetalhe ? (
            <p className="text-sm text-gray-500">Carregando partida…</p>
          ) : detalhe ? (
            <>
              <div className="bg-white border border-gray-100 rounded-xl p-5 space-y-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">{detalhe.partida}</h1>
                    <p className="text-sm text-gray-600 mt-0.5">{detalhe.reprodutorDisplay}</p>
                  </div>
                  <Badge
                    variant={detalhe.status === SEMEN_STATUS_ESGOTADO ? "secondary" : "default"}
                    className={cn(
                      detalhe.status === SEMEN_STATUS_DISPONIVEL && "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {detalhe.statusLabel}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[12px]">
                  <div>
                    <p className="text-gray-500">Central / origem</p>
                    <p className="font-medium text-gray-800">{detalhe.centralOrigem || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Saldo</p>
                    <p className="font-medium text-gray-800">{detalhe.saldoDoses} doses</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Custo por dose</p>
                    <p className="font-medium text-gray-800">
                      {formatCustoDisplay(detalhe.custoUnitario)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Origem</p>
                    <p className="font-medium text-gray-800">
                      {detalhe.origemReprodutor === SEMEN_ORIGEM_INTERNO
                        ? "Rebanho"
                        : "Externo"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h2 className={sectionTitleCls}>Histórico de movimentações</h2>
                </div>
                {detalhe.movimentacoes.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-gray-500">Nenhuma movimentação registrada.</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {detalhe.movimentacoes.map(mov => {
                      const showCustoTotal = shouldShowSemenMovimentacaoCustoTotal(mov.tipo);
                      return (
                      <div key={mov.id} className="px-5 py-3 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[12px]">
                        <div>
                          <p className="text-gray-500">Data</p>
                          <p className="font-medium">{formatDateBR(mov.dataEntrada)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Tipo</p>
                          <p className="font-medium">{mov.tipoLabel}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Quantidade</p>
                          <p className="font-medium">{mov.quantidadeLabel}</p>
                        </div>
                        {showCustoTotal ? (
                          <div>
                            <p className="text-gray-500">Custo total</p>
                            <p className="font-medium">{formatCustoDisplay(mov.custoTotal)}</p>
                          </div>
                        ) : null}
                        <div>
                          <p className="text-gray-500">
                            {showCustoTotal ? "Custo / dose" : "Custo da dose"}
                          </p>
                          <p className="font-medium">{formatCustoDisplay(mov.custoUnitario)}</p>
                        </div>
                        {mov.contextoDisplay ? (
                          <div className="sm:col-span-5 text-gray-600">{mov.contextoDisplay}</div>
                        ) : null}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">Partida não encontrada.</p>
          )}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <p className="text-[11px] text-gray-500 font-medium">Reprodução</p>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Estoque de sêmen</h1>
            <p className="text-[12px] text-gray-500 mt-1">
              Cadastro de partidas, saldo de doses e custo por dose.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setEntradaOpen(true)}
            disabled={!fazendaNum}
            style={{ backgroundColor: FD_PRIMARY }}
            className="text-white hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nova entrada
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FazendaOverviewSelect
            fazendas={fazendas}
            value={fazendaId}
            onChange={onChangeFazenda}
          />
          <div>
            <FormLabel>Busca</FormLabel>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Reprodutor, partida ou central…"
                className="pl-8 text-[12px] h-[34px]"
              />
            </div>
          </div>
          <div>
            <FormLabel>Status</FormLabel>
            <FormNativeSelect
              value={statusFilter}
              onChange={v => setStatusFilter(v as StatusFilter)}
              placeholder="Status"
              options={[
                { value: "todos", label: "Todos" },
                { value: SEMEN_STATUS_DISPONIVEL, label: "Disponível" },
                { value: SEMEN_STATUS_ESGOTADO, label: "Esgotado" },
              ]}
            />
          </div>
        </div>

        {!fazendaNum ? (
          <p className="text-sm text-gray-500">Selecione uma fazenda para ver o estoque.</p>
        ) : loadingPartidas ? (
          <p className="text-sm text-gray-500">Carregando partidas…</p>
        ) : partidas.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-8 text-center">
            <p className="text-sm text-gray-600">Nenhuma partida de sêmen cadastrada.</p>
            <Button
              type="button"
              variant="outline"
              className="mt-4"
              onClick={() => setEntradaOpen(true)}
            >
              Registrar primeira entrada
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 border-b border-gray-100">
                    <th className="text-left font-semibold px-4 py-2.5">Reprodutor</th>
                    <th className="text-left font-semibold px-4 py-2.5">Partida</th>
                    <th className="text-left font-semibold px-4 py-2.5">Central</th>
                    <th className="text-right font-semibold px-4 py-2.5">Saldo</th>
                    <th className="text-right font-semibold px-4 py-2.5">Custo/dose</th>
                    <th className="text-center font-semibold px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {partidas.map(p => (
                    <tr
                      key={p.id}
                      className="border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer"
                      onClick={() => abrirDetalhe(p.id)}
                    >
                      <td className="px-4 py-3 text-gray-800">{p.reprodutorDisplay}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.partida}</td>
                      <td className="px-4 py-3 text-gray-600">{p.centralOrigem || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-800">{p.saldoDoses} doses</td>
                      <td className="px-4 py-3 text-right text-gray-800">
                        {formatCustoDisplay(p.custoUnitario)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge
                          variant={p.status === SEMEN_STATUS_ESGOTADO ? "secondary" : "default"}
                          className={cn(
                            p.status === SEMEN_STATUS_DISPONIVEL &&
                              "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
                          )}
                        >
                          {p.statusLabel}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <NovaEntradaSemenDialog
          open={entradaOpen}
          onOpenChange={setEntradaOpen}
          fazendaId={fazendaNum}
          animais={animaisFazenda as AnimalAutocompleteRow[]}
          loadingAnimais={carregandoAnimais}
          onSuccess={async result => {
            await refetch();
            utils.semen.list.invalidate();
            setEntradaOpen(false);
            toast.success("Entrada de sêmen registrada.");
            if (!isValidSemenMovimentacaoId(result.movimentacaoId)) {
              toast.error("Entrada registrada, mas não foi possível abrir o resumo.");
              return;
            }
            setLocation(semenEntradaResumoPath(result.movimentacaoId));
          }}
        />
      </div>
    </AppLayout>
  );
}

function NovaEntradaSemenDialog({
  open,
  onOpenChange,
  fazendaId,
  animais,
  loadingAnimais,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: number;
  animais: AnimalAutocompleteRow[];
  loadingAnimais: boolean;
  onSuccess: (result: {
    movimentacaoId: number;
    partidaId: number;
    saldoAtual: number;
    custoMedioAtual: string | null;
    novaEntrada: boolean;
  }) => void;
}) {
  const [origem, setOrigem] = useState<"" | typeof SEMEN_ORIGEM_INTERNO | typeof SEMEN_ORIGEM_EXTERNO>(
    "",
  );
  const [machoSel, setMachoSel] = useState<AnimalAutocompleteRow | null>(null);
  const [reprodutorTexto, setReprodutorTexto] = useState("");
  const [partida, setPartida] = useState("");
  const [centralOrigem, setCentralOrigem] = useState("");
  const [quantidadeDoses, setQuantidadeDoses] = useState("");
  const [custoTotal, setCustoTotal] = useState("");
  const [dataEntrada, setDataEntrada] = useState(toDateOnlyISO(new Date()));

  const resetForm = useCallback(() => {
    setOrigem("");
    setMachoSel(null);
    setReprodutorTexto("");
    setPartida("");
    setCentralOrigem("");
    setQuantidadeDoses("");
    setCustoTotal("");
    setDataEntrada(toDateOnlyISO(new Date()));
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  const qtdNum = parseSemenQuantidadeDoses(quantidadeDoses);
  const custoNum = parseSemenCustoTotal(custoTotal);
  const custoPorDose =
    qtdNum != null && custoNum != null
      ? formatSemenCustoTotalDisplay(
          parseFloat(calcSemenCustoUnitarioEntrada(qtdNum, custoNum)),
        )
      : "—";

  const formCanSubmit = useMemo(
    () =>
      isSemenEntradaFormSubmittable({
        origem,
        machoId: machoSel?.id ?? null,
        reprodutorTexto,
        partida,
        quantidadeDoses,
        custoTotal,
        dataEntrada,
      }),
    [origem, machoSel, reprodutorTexto, partida, quantidadeDoses, custoTotal, dataEntrada],
  );

  const filterMacho = useCallback(
    (a: AnimalAutocompleteRow) =>
      filterMachosReprodutoresCandidatos([a], { fazendaId }).length > 0,
    [fazendaId],
  );

  const registrar = trpc.semen.registrarEntrada.useMutation({
    onSuccess: result => onSuccess(result),
    onError: err => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCanSubmit || registrar.isPending) return;

    const custoParsed = parseSemenCustoTotal(custoTotal);
    const qtdParsed = parseSemenQuantidadeDoses(quantidadeDoses);
    if (custoParsed == null || qtdParsed == null || !origem) return;

    registrar.mutate({
      fazendaId,
      origemReprodutor: origem,
      machoId: origem === SEMEN_ORIGEM_INTERNO ? machoSel?.id : undefined,
      reprodutorTexto: origem === SEMEN_ORIGEM_EXTERNO ? reprodutorTexto : undefined,
      partida,
      centralOrigem: centralOrigem || undefined,
      quantidadeDoses: qtdParsed,
      custoTotal: custoParsed,
      dataEntrada,
    });
  };

  const submitDisabled = !formCanSubmit || registrar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={semenEntradaModalLayout.content}
        data-semen-entrada-modal
      >
        <DialogHeader className={semenEntradaModalLayout.header}>
          <DialogTitle>Nova entrada de sêmen</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className={semenEntradaModalLayout.form}
          data-semen-entrada-form
        >
          <div className={semenEntradaModalLayout.body} data-semen-entrada-body>
          <div>
            <FormLabel required>Origem do reprodutor</FormLabel>
            <FormNativeSelect
              value={origem}
              onChange={v => {
                setOrigem(v as typeof origem);
                setMachoSel(null);
                setReprodutorTexto("");
              }}
              placeholder="Selecione a origem"
              options={[
                { value: SEMEN_ORIGEM_INTERNO, label: "Animal do rebanho" },
                { value: SEMEN_ORIGEM_EXTERNO, label: "Sêmen / reprodutor externo" },
              ]}
            />
          </div>

          {origem === SEMEN_ORIGEM_INTERNO ? (
            <AnimalAutocomplete
              label="Macho do rebanho"
              required
              selected={machoSel}
              onSelect={setMachoSel}
              animals={animais}
              loading={loadingAnimais}
              disabled={!fazendaId}
              inputClassName={fieldCls}
              placeholder="Busque pelo brinco ou nome do touro"
              emptyMessage="Nenhum reprodutor elegível encontrado."
              filterCandidate={filterMacho}
            />
          ) : null}

          {origem === SEMEN_ORIGEM_EXTERNO ? (
            <div>
              <label className={labelCls}>
                Reprodutor / Sêmen<span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={reprodutorTexto}
                onChange={e => setReprodutorTexto(e.target.value)}
                placeholder="Ex.: GSC-7117 ou REM Armador"
                className={fieldCls}
                maxLength={500}
              />
            </div>
          ) : null}

          <div className={semenEntradaModalLayout.fieldGrid}>
            <div>
              <label className={labelCls}>Partida / lote</label>
              <input
                type="text"
                value={partida}
                onChange={e => setPartida(e.target.value)}
                placeholder="Opcional — ex.: L23081"
                className={fieldCls}
                maxLength={120}
              />
            </div>
            <div>
              <label className={labelCls}>Central / origem</label>
              <input
                type="text"
                value={centralOrigem}
                onChange={e => setCentralOrigem(e.target.value)}
                placeholder="Ex.: Alta Genetics"
                className={fieldCls}
                maxLength={150}
              />
            </div>
          </div>

          <div className={semenEntradaModalLayout.fieldGrid}>
            <div>
              <label className={labelCls}>
                Quantidade de doses<span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={quantidadeDoses}
                onChange={e => setQuantidadeDoses(e.target.value)}
                placeholder="Ex.: 10"
                className={fieldCls}
              />
            </div>
            <div className="min-w-0">
              <FormLabel required>Custo total (R$)</FormLabel>
              <FormInput
                value={custoTotal}
                onChange={v => setCustoTotal(formatCurrencyBrl(v))}
                placeholder="R$ 0,00"
                inputMode="decimal"
                required
                aria-label="Custo total em reais"
              />
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] text-gray-700">
            Custo por dose calculado: <strong>{custoPorDose}</strong>
          </div>

          <div>
            <FormLabel required>Data de entrada</FormLabel>
            <FormDatePicker
              value={dataEntrada}
              onChange={setDataEntrada}
              max={toDateOnlyISO(new Date())}
              required
            />
          </div>
          </div>

          <div className={semenEntradaModalLayout.footer} data-semen-entrada-footer>
            <div className={semenEntradaModalLayout.footerActions}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={registrar.isPending}
                className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex items-center justify-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {registrar.isPending ? "Salvando…" : "Registrar entrada"}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
