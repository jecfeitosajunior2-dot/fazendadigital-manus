import { useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import MobileCard from "@/components/MobileCard";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { useConfirm } from "@/components/ConfirmDialog";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { formatDateBR, formatDateInputLocal } from "@/lib/date-utils";
import { cn, formatCurrencyBrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { FINANCEIRO_VISAO_GERAL_PATH } from "@/lib/financeiroNavegacao";
import {
  FINANCEIRO_CONTAS_V2_PATH,
  MSG_CONTAS_V2_CARREGANDO,
  MSG_CONTAS_V2_ERRO,
  MSG_INATIVAR_CONTA_V2,
  MSG_NENHUMA_CONTA_V2,
  OPCOES_TIPO_CONTA_V2,
  rotuloSituacaoContaV2,
  rotuloTipoContaV2,
  validarCadastroContaV2,
  type ContaFinanceiraV2Oficial,
  type ErrosCadastroContaV2,
} from "@/lib/contasFinanceirasV2";
import {
  MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO,
  MSG_EXTRATO_V2_VAZIO,
  MSG_TRANSFERENCIA_OCUPADA,
  MSG_TRANSFERENCIA_RESULTADO_DESCONHECIDO,
  contasParaListagemCaixa,
  deveOmitirSaldoAcumulado,
  novaChaveIdempotenciaTransferencia,
  ordenarMovimentosExtrato,
  origemMovimentoExtrato,
  periodoExtratoValido,
  resumoTransferenciaCaixa,
  rotuloDirecaoExtrato,
  validarEdicaoContaV2,
  validarTransferenciaCaixaV2,
  type ExtratoV2Oficial,
  type FiltroExtratoV2,
  type TransferenciaCaixaValida,
} from "@/lib/caixaBancosV2";

function formatarValorOficial(valor: string | number | null | undefined): string {
  if (valor == null || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return formatCurrencyBrl(String(Math.round(n * 100)));
}

function classeSituacao(ativa: boolean): string {
  return ativa ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500";
}

const formVazio = () => ({
  nome: "",
  tipo: "",
  saldoAbertura: "0,00",
  dataSaldoAbertura: formatDateInputLocal(),
  banco: "",
  agencia: "",
  numeroConta: "",
});

export default function ContasFinanceirasV2Page() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const [formAberto, setFormAberto] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [erros, setErros] = useState<ErrosCadastroContaV2>({});
  const [somenteAtivas, setSomenteAtivas] = useState(false);
  const [contaIdDetalhe, setContaIdDetalhe] = useState<number | null>(null);
  const [contaEdicao, setContaEdicao] = useState<ContaFinanceiraV2Oficial | null>(null);
  const [extratoFiltro, setExtratoFiltro] = useState<FiltroExtratoV2 | null>(null);
  const [transferAberto, setTransferAberto] = useState(false);
  const [transferForm, setTransferForm] = useState({
    contaOrigemId: "",
    contaDestinoId: "",
    valor: "",
    dataTransferencia: formatDateInputLocal(),
    descricao: "",
  });
  const [errosTransfer, setErrosTransfer] = useState<Record<string, string>>({});
  const [transferPendencia, setTransferPendencia] = useState<{
    payload: TransferenciaCaixaValida;
    chave: string;
  } | null>(null);

  const consulta = trpc.financeiroV2.contasList.useQuery();
  const detalhe = trpc.financeiroV2.contasGet.useQuery(
    { id: contaIdDetalhe ?? 0 },
    { enabled: contaIdDetalhe != null },
  );
  const extrato = trpc.financeiroV2.movimentosExtrato.useQuery(
    {
      contaId: extratoFiltro?.contaId || 0,
      de: extratoFiltro?.de || undefined,
      ate: extratoFiltro?.ate || undefined,
    },
    { enabled: Boolean(extratoFiltro && extratoFiltro.contaId && periodoExtratoValido(extratoFiltro)) },
  );
  const criar = trpc.financeiroV2.contasCreate.useMutation({
    onSuccess: async () => {
      toast.success("Conta financeira cadastrada.");
      setFormAberto(false);
      setForm(formVazio());
      setErros({});
      await utils.financeiroV2.contasList.invalidate();
    },
    onError: erro => toast.error(erro.message || "Não foi possível cadastrar a conta."),
  });
  const editar = trpc.financeiroV2.contasUpdate.useMutation({
    onSuccess: async () => {
      toast.success("Conta atualizada.");
      setContaEdicao(null);
      await Promise.all([
        utils.financeiroV2.contasList.invalidate(),
        contaIdDetalhe != null ? utils.financeiroV2.contasGet.invalidate({ id: contaIdDetalhe }) : Promise.resolve(),
      ]);
    },
    onError: erro => toast.error(erro.message || "Não foi possível editar a conta."),
  });
  const inativar = trpc.financeiroV2.contasInativar.useMutation({
    onSuccess: async () => {
      toast.success("Conta inativada.");
      await Promise.all([
        utils.financeiroV2.contasList.invalidate(),
        contaIdDetalhe != null ? utils.financeiroV2.contasGet.invalidate({ id: contaIdDetalhe }) : Promise.resolve(),
      ]);
    },
    onError: erro => toast.error(erro.message || "Não foi possível inativar a conta."),
  });
  const reativar = trpc.financeiroV2.contasReativar.useMutation({
    onSuccess: async () => {
      toast.success("Conta reativada.");
      await Promise.all([
        utils.financeiroV2.contasList.invalidate(),
        contaIdDetalhe != null ? utils.financeiroV2.contasGet.invalidate({ id: contaIdDetalhe }) : Promise.resolve(),
      ]);
    },
    onError: erro => toast.error(erro.message || "Não foi possível reativar a conta."),
  });
  const transferir = trpc.financeiroV2.transferenciaCreate.useMutation({
    onSuccess: async resultado => {
      toast.success(resultado.idempotente ? "Transferência já estava registrada." : "Transferência concluída.");
      setTransferPendencia(null);
      setTransferAberto(false);
      setTransferForm({
        contaOrigemId: "",
        contaDestinoId: "",
        valor: "",
        dataTransferencia: formatDateInputLocal(),
        descricao: "",
      });
      await Promise.all([
        utils.financeiroV2.contasList.invalidate(),
        extratoFiltro ? utils.financeiroV2.movimentosExtrato.invalidate() : Promise.resolve(),
      ]);
    },
    onError: erro => {
      toast.error(erro.message || MSG_TRANSFERENCIA_RESULTADO_DESCONHECIDO);
    },
  });

  const contas = contasParaListagemCaixa(
    (consulta.data ?? []) as ContaFinanceiraV2Oficial[],
    user?.id,
    somenteAtivas,
  );
  const todasContas = contasParaListagemCaixa(
    (consulta.data ?? []) as ContaFinanceiraV2Oficial[],
    user?.id,
    false,
  );
  const contaDetalhe = detalhe.data as ContaFinanceiraV2Oficial | undefined;
  const extratoData = extrato.data as ExtratoV2Oficial | undefined;
  const movimentos = useMemo(
    () => ordenarMovimentosExtrato(extratoData?.movimentos ?? []),
    [extratoData?.movimentos],
  );

  const abrirCadastro = () => {
    setForm(formVazio());
    setErros({});
    setFormAberto(true);
  };

  const enviarCadastro = () => {
    const validado = validarCadastroContaV2(form);
    if (!validado.ok) {
      setErros(validado.erros);
      return;
    }
    setErros({});
    criar.mutate(validado.payload);
  };

  const enviarEdicao = () => {
    if (!contaEdicao) return;
    const validado = validarEdicaoContaV2(form);
    if (!validado.ok) {
      setErros(validado.erros);
      return;
    }
    setErros({});
    editar.mutate({ id: contaEdicao.id, ...validado.payload });
  };

  const pedirInativacao = async (conta: Pick<ContaFinanceiraV2Oficial, "id" | "nome" | "ativa">) => {
    if (!conta.ativa) return;
    const ok = await confirm({
      title: "Inativar conta?",
      description: (
        <span>
          A conta <strong>{conta.nome}</strong> deixará de aparecer para novos pagamentos.
          {" "}{MSG_INATIVAR_CONTA_V2}
        </span>
      ),
      confirmText: "Inativar",
      cancelText: "Manter ativa",
      variant: "warning",
      onConfirm: () => inativar.mutateAsync({ id: conta.id }),
    });
    if (ok) setContaIdDetalhe(null);
  };

  const pedirReativacao = async (conta: Pick<ContaFinanceiraV2Oficial, "id" | "nome" | "ativa">) => {
    if (conta.ativa) return;
    await confirm({
      title: "Reativar conta?",
      description: (
        <span>
          A conta <strong>{conta.nome}</strong> voltará a aceitar pagamentos e transferências. O saldo e o histórico permanecem iguais.
        </span>
      ),
      confirmText: "Reativar",
      cancelText: "Manter inativa",
      onConfirm: () => reativar.mutateAsync({ id: conta.id }),
    });
  };

  const abrirEdicao = (conta: ContaFinanceiraV2Oficial) => {
    setContaEdicao(conta);
    setForm({
      nome: conta.nome,
      tipo: conta.tipo,
      saldoAbertura: String(conta.saldoAbertura),
      dataSaldoAbertura: conta.dataSaldoAbertura,
      banco: conta.banco ?? "",
      agencia: conta.agencia ?? "",
      numeroConta: conta.numeroConta ?? "",
    });
    setErros({});
  };

  const abrirExtrato = (contaId: number) => {
    setExtratoFiltro({ contaId, de: "", ate: "" });
  };

  const prepararTransferencia = () => {
    const validado = validarTransferenciaCaixaV2(transferForm, todasContas, user?.id);
    if (!validado.ok) {
      setErrosTransfer(validado.erros);
      return;
    }
    setErrosTransfer({});
    setTransferPendencia({
      payload: validado.payload,
      chave: transferPendencia?.chave ?? novaChaveIdempotenciaTransferencia(),
    });
  };

  const confirmarTransferencia = () => {
    if (!transferPendencia) return;
    if (transferir.isPending) {
      toast.error(MSG_TRANSFERENCIA_OCUPADA);
      return;
    }
    transferir.mutate({
      ...transferPendencia.payload,
      idempotencyKey: transferPendencia.chave,
    });
  };

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(FINANCEIRO_VISAO_GERAL_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar ao Financeiro"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-[13px]">Voltar ao Financeiro</span>
      </button>

      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl" data-path={FINANCEIRO_CONTAS_V2_PATH}>
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Financeiro / Caixa e Bancos</p>
            <h1 className="text-[20px] font-semibold text-gray-900 mt-0.5" style={{ fontFamily: "Fraunces, serif" }}>
              Caixa e Bancos
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Contas oficiais do Financeiro V2. O saldo exibido é o saldo atual do núcleo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTransferAberto(true)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700"
            >
              <span className="material-icons text-[16px]">swap_horiz</span>
              Transferir
            </button>
            <button
              type="button"
              onClick={abrirCadastro}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[12px] font-semibold text-white"
              style={{ backgroundColor: FD_PRIMARY }}
            >
              <span className="material-icons text-[16px]">add</span>
              Nova conta
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-gray-50">
          <label className="inline-flex items-center gap-2 text-[12px] text-gray-600">
            <input
              type="checkbox"
              checked={somenteAtivas}
              onChange={evento => setSomenteAtivas(evento.target.checked)}
            />
            Ocultar contas inativas
          </label>
        </div>

        <div className="px-4 py-4">
          {consulta.isLoading ? (
            <p className="text-[13px] text-gray-400">{MSG_CONTAS_V2_CARREGANDO}</p>
          ) : consulta.error ? (
            <p className="text-[13px] text-gray-600">{consulta.error.message || MSG_CONTAS_V2_ERRO}</p>
          ) : contas.length === 0 ? (
            <p className="text-[13px] text-gray-600">{MSG_NENHUMA_CONTA_V2}</p>
          ) : (
            <>
              <div className="lg:hidden space-y-3">
                {contas.map(conta => (
                  <MobileCard
                    key={conta.id}
                    title={conta.nome}
                    subtitle={rotuloTipoContaV2(conta.tipo)}
                    onClick={() => setContaIdDetalhe(conta.id)}
                    badge={
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(conta.ativa))}>
                        {rotuloSituacaoContaV2(conta.ativa)}
                      </span>
                    }
                    fields={[
                      { label: "Saldo atual", value: formatarValorOficial(conta.saldoAtual), emphasis: true },
                      { label: "Banco", value: conta.banco?.trim() || "—" },
                      { label: "Fazenda", value: "—" },
                    ]}
                    actions={[
                      { icon: "receipt_long", label: "Extrato", onClick: () => abrirExtrato(conta.id) },
                      { icon: "edit", label: "Editar", onClick: () => abrirEdicao(conta) },
                      ...(conta.ativa
                        ? [{ icon: "block", label: "Inativar", variant: "danger" as const, onClick: () => void pedirInativacao(conta) }]
                        : [{ icon: "restart_alt", label: "Reativar", onClick: () => void pedirReativacao(conta) }]),
                    ]}
                  />
                ))}
              </div>
              <div className="hidden lg:block">
                <TableHorizontalScroll fitWidth>
                  <table className="w-full min-w-[860px] table-fixed text-[11px] border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Nome", "Tipo", "Fazenda", "Saldo atual", "Situação", "Ações"].map(col => (
                          <th
                            key={col}
                            className="px-3 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contas.map(conta => (
                        <tr
                          key={conta.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="px-3 py-2.5 text-gray-800 font-medium">
                            <button type="button" className="hover:underline" onClick={() => setContaIdDetalhe(conta.id)}>
                              {conta.nome}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{rotuloTipoContaV2(conta.tipo)}</td>
                          <td className="px-3 py-2.5 text-gray-500">—</td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-800 font-medium">
                            {formatarValorOficial(conta.saldoAtual)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(conta.ativa))}>
                              {rotuloSituacaoContaV2(conta.ativa)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Acao texto="Extrato" onClick={() => abrirExtrato(conta.id)} />
                              <Acao texto="Editar" onClick={() => abrirEdicao(conta)} />
                              {conta.ativa ? (
                                <Acao texto="Inativar" perigo onClick={() => void pedirInativacao(conta)} />
                              ) : (
                                <Acao texto="Reativar" onClick={() => void pedirReativacao(conta)} />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableHorizontalScroll>
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={formAberto} onOpenChange={aberto => { if (!aberto) setFormAberto(false); }}>
        <DialogContent className="max-w-lg bg-white p-0 gap-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">Nova conta do caixa</DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              Cadastro oficial do Financeiro. O saldo de abertura entra no saldo atual da conta.
            </DialogDescription>
          </div>
          <form
            className="px-4 py-4 space-y-3"
            onSubmit={evento => {
              evento.preventDefault();
              enviarCadastro();
            }}
          >
            <CamposConta form={form} setForm={setForm} erros={erros} incluirAbertura />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700" onClick={() => setFormAberto(false)}>Cancelar</button>
              <button type="submit" disabled={criar.isPending} className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: FD_PRIMARY }}>
                {criar.isPending ? "Salvando..." : "Cadastrar conta"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contaEdicao != null} onOpenChange={aberto => { if (!aberto) setContaEdicao(null); }}>
        <DialogContent className="max-w-lg bg-white p-0 gap-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">Editar conta</DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              Só dados cadastrais. O saldo não é alterado por esta tela.
            </DialogDescription>
          </div>
          <form
            className="px-4 py-4 space-y-3"
            onSubmit={evento => {
              evento.preventDefault();
              enviarEdicao();
            }}
          >
            <CamposConta form={form} setForm={setForm} erros={erros} incluirAbertura={false} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700" onClick={() => setContaEdicao(null)}>Cancelar</button>
              <button type="submit" disabled={editar.isPending} className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: FD_PRIMARY }}>
                {editar.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contaIdDetalhe != null} onOpenChange={aberto => { if (!aberto) setContaIdDetalhe(null); }}>
        <DialogContent className="max-w-md bg-white p-0 gap-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">
              {contaDetalhe?.nome || "Conta financeira"}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              Dados oficiais da conta. O saldo atual vem do Financeiro.
            </DialogDescription>
          </div>
          <div className="px-4 py-4 space-y-3">
            {detalhe.isLoading ? (
              <p className="text-[13px] text-gray-400">{MSG_CONTAS_V2_CARREGANDO}</p>
            ) : detalhe.error ? (
              <p className="text-[13px] text-gray-600">{detalhe.error.message || MSG_CONTAS_V2_ERRO}</p>
            ) : contaDetalhe ? (
              <>
                <p className="text-[13px] text-gray-800">
                  {rotuloTipoContaV2(contaDetalhe.tipo)}
                  {" · "}
                  {rotuloSituacaoContaV2(contaDetalhe.ativa)}
                </p>
                <p className="text-[20px] font-semibold tabular-nums text-gray-900">
                  {formatarValorOficial(contaDetalhe.saldoAtual)}
                </p>
                <p className="text-[12px] text-gray-500">
                  Abertura {formatarValorOficial(contaDetalhe.saldoAbertura)} em {formatDateBR(contaDetalhe.dataSaldoAbertura)}
                </p>
                {contaDetalhe.banco ? <p className="text-[12px] text-gray-600">Banco {contaDetalhe.banco}</p> : null}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700" onClick={() => abrirExtrato(contaDetalhe.id)}>Extrato</button>
                  <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700" onClick={() => abrirEdicao(contaDetalhe)}>Editar</button>
                  {contaDetalhe.ativa ? (
                    <button type="button" className="h-9 px-3 rounded-lg border border-amber-200 text-[12px] font-semibold text-amber-800" onClick={() => void pedirInativacao(contaDetalhe)}>Inativar conta</button>
                  ) : (
                    <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-700" onClick={() => void pedirReativacao(contaDetalhe)}>Reativar conta</button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={extratoFiltro != null} onOpenChange={aberto => { if (!aberto) setExtratoFiltro(null); }}>
        <DialogContent className="max-w-3xl bg-white p-0 gap-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">Extrato</DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              Movimentações oficiais do Financeiro V2. Sem exclusão e sem lançamento manual.
            </DialogDescription>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Campo label="Conta">
                <FormSelect
                  variant="light"
                  modal={false}
                  value={String(extratoFiltro?.contaId ?? "")}
                  onChange={contaId => setExtratoFiltro(atual => ({ ...(atual ?? { de: "", ate: "" }), contaId: Number(contaId) || "" }))}
                >
                  {todasContas.map(conta => (
                    <SelectItem key={conta.id} value={String(conta.id)}>{conta.nome}</SelectItem>
                  ))}
                </FormSelect>
              </Campo>
              <Campo label="De">
                <FormInput variant="light" type="date" value={extratoFiltro?.de ?? ""} onChange={de => setExtratoFiltro(atual => atual ? { ...atual, de } : atual)} />
              </Campo>
              <Campo label="Até">
                <FormInput variant="light" type="date" value={extratoFiltro?.ate ?? ""} onChange={ate => setExtratoFiltro(atual => atual ? { ...atual, ate } : atual)} />
              </Campo>
            </div>
            {extratoData ? (
              <p className="text-[13px] text-gray-700">
                Saldo atual: <strong>{formatarValorOficial(extratoData.saldoAtual)}</strong>
              </p>
            ) : null}
            {extratoFiltro && deveOmitirSaldoAcumulado(extratoFiltro) ? (
              <p className="text-[11px] text-gray-500">{MSG_EXTRATO_V2_SEM_SALDO_ACUMULADO}</p>
            ) : null}
            {extrato.isLoading ? (
              <p className="text-[13px] text-gray-400">{MSG_CONTAS_V2_CARREGANDO}</p>
            ) : extrato.error ? (
              <p className="text-[13px] text-gray-600">{extrato.error.message}</p>
            ) : movimentos.length === 0 ? (
              <p className="text-[13px] text-gray-600">{MSG_EXTRATO_V2_VAZIO}</p>
            ) : (
              <TableHorizontalScroll fitWidth>
                <table className="w-full min-w-[680px] text-[11px] border-collapse">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Data", "Descrição", "Tipo", "Origem", "Valor"].map(col => (
                        <th key={col} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimentos.map(mov => (
                      <tr key={mov.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-700">{formatDateBR(mov.dataMovimento)}</td>
                        <td className="px-3 py-2 text-gray-800">{mov.descricao}</td>
                        <td className={cn("px-3 py-2 font-medium", mov.direcao === "entrada" ? "text-emerald-700" : "text-red-700")}>
                          {rotuloDirecaoExtrato(mov.direcao)}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{origemMovimentoExtrato(mov)}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-800">{formatarValorOficial(mov.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableHorizontalScroll>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={transferAberto} onOpenChange={aberto => {
        if (!aberto && !transferir.isPending) {
          setTransferAberto(false);
          setTransferPendencia(null);
        }
      }}>
        <DialogContent className="max-w-lg bg-white p-0 gap-0">
          <div className="px-4 py-3 border-b border-gray-100">
            <DialogTitle className="text-[16px] font-semibold text-gray-900">
              {transferPendencia ? "Confirmar transferência" : "Transferir entre contas"}
            </DialogTitle>
            <DialogDescription className="text-[12px] text-gray-500 mt-1">
              A operação usa o núcleo V2. Uma saída e uma entrada na mesma transação.
            </DialogDescription>
          </div>
          {transferPendencia ? (
            <div className="px-4 py-4 space-y-3">
              {(() => {
                const resumo = resumoTransferenciaCaixa(transferPendencia.payload, todasContas);
                return (
                  <div className="text-[13px] text-gray-700 space-y-1">
                    <p>Origem: <strong>{resumo.origem}</strong></p>
                    <p>Destino: <strong>{resumo.destino}</strong></p>
                    <p>Valor: <strong>{formatarValorOficial(resumo.valor)}</strong></p>
                    <p>Data: <strong>{formatDateBR(resumo.data)}</strong></p>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={transferir.isPending} className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700" onClick={() => setTransferPendencia(null)}>Voltar</button>
                <button type="button" disabled={transferir.isPending} className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50" style={{ backgroundColor: FD_PRIMARY }} onClick={confirmarTransferencia}>
                  {transferir.isPending ? "Transferindo..." : "Confirmar transferência"}
                </button>
              </div>
            </div>
          ) : (
            <form
              className="px-4 py-4 space-y-3"
              onSubmit={evento => {
                evento.preventDefault();
                prepararTransferencia();
              }}
            >
              <Campo label="Conta de origem" erro={errosTransfer.contaOrigemId}>
                <FormSelect variant="light" modal={false} value={transferForm.contaOrigemId} invalid={Boolean(errosTransfer.contaOrigemId)} placeholder="Selecione" onChange={contaOrigemId => setTransferForm(atual => ({ ...atual, contaOrigemId }))}>
                  {todasContas.filter(c => c.ativa).map(conta => (
                    <SelectItem key={conta.id} value={String(conta.id)}>{conta.nome}</SelectItem>
                  ))}
                </FormSelect>
              </Campo>
              <Campo label="Conta de destino" erro={errosTransfer.contaDestinoId}>
                <FormSelect variant="light" modal={false} value={transferForm.contaDestinoId} invalid={Boolean(errosTransfer.contaDestinoId)} placeholder="Selecione" onChange={contaDestinoId => setTransferForm(atual => ({ ...atual, contaDestinoId }))}>
                  {todasContas.filter(c => c.ativa).map(conta => (
                    <SelectItem key={conta.id} value={String(conta.id)}>{conta.nome}</SelectItem>
                  ))}
                </FormSelect>
              </Campo>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label="Valor" erro={errosTransfer.valor}>
                  <FormInput variant="light" inputMode="decimal" value={transferForm.valor} invalid={Boolean(errosTransfer.valor)} onChange={valor => setTransferForm(atual => ({ ...atual, valor }))} />
                </Campo>
                <Campo label="Data" erro={errosTransfer.dataTransferencia}>
                  <FormInput variant="light" type="date" value={transferForm.dataTransferencia} invalid={Boolean(errosTransfer.dataTransferencia)} onChange={dataTransferencia => setTransferForm(atual => ({ ...atual, dataTransferencia }))} />
                </Campo>
              </div>
              <Campo label="Descrição (opcional)">
                <FormInput variant="light" value={transferForm.descricao} onChange={descricao => setTransferForm(atual => ({ ...atual, descricao }))} />
              </Campo>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700" onClick={() => setTransferAberto(false)}>Cancelar</button>
                <button type="submit" className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white" style={{ backgroundColor: FD_PRIMARY }}>Revisar</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Acao({ texto, onClick, perigo }: { texto: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      type="button"
      className={cn("text-[11px] font-semibold hover:underline", perigo ? "text-amber-800" : "text-[#2D5A5A]")}
      onClick={evento => {
        evento.stopPropagation();
        onClick();
      }}
    >
      {texto}
    </button>
  );
}

function CamposConta({
  form,
  setForm,
  erros,
  incluirAbertura,
}: {
  form: ReturnType<typeof formVazio>;
  setForm: (fn: (atual: ReturnType<typeof formVazio>) => ReturnType<typeof formVazio>) => void;
  erros: ErrosCadastroContaV2;
  incluirAbertura: boolean;
}) {
  return (
    <>
      <Campo label="Nome da conta" erro={erros.nome}>
        <FormInput variant="light" required value={form.nome} invalid={Boolean(erros.nome)} onChange={nome => setForm(atual => ({ ...atual, nome }))} />
      </Campo>
      <Campo label="Tipo" erro={erros.tipo}>
        <FormSelect variant="light" required modal={false} value={form.tipo} invalid={Boolean(erros.tipo)} placeholder="Selecione o tipo" onChange={tipo => setForm(atual => ({ ...atual, tipo }))}>
          {OPCOES_TIPO_CONTA_V2.map(opcao => (
            <SelectItem key={opcao.value} value={opcao.value}>{opcao.label}</SelectItem>
          ))}
        </FormSelect>
      </Campo>
      {incluirAbertura ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Saldo de abertura" erro={erros.saldoAbertura}>
            <FormInput variant="light" required inputMode="decimal" value={form.saldoAbertura} invalid={Boolean(erros.saldoAbertura)} onChange={saldoAbertura => setForm(atual => ({ ...atual, saldoAbertura }))} />
          </Campo>
          <Campo label="Data do saldo de abertura" erro={erros.dataSaldoAbertura}>
            <FormInput variant="light" required type="date" value={form.dataSaldoAbertura} invalid={Boolean(erros.dataSaldoAbertura)} onChange={dataSaldoAbertura => setForm(atual => ({ ...atual, dataSaldoAbertura }))} />
          </Campo>
        </div>
      ) : null}
      <Campo label="Banco (opcional)" erro={erros.banco}>
        <FormInput variant="light" value={form.banco} invalid={Boolean(erros.banco)} onChange={banco => setForm(atual => ({ ...atual, banco }))} />
      </Campo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Agência (opcional)" erro={erros.agencia}>
          <FormInput variant="light" value={form.agencia} invalid={Boolean(erros.agencia)} onChange={agencia => setForm(atual => ({ ...atual, agencia }))} />
        </Campo>
        <Campo label="Número da conta (opcional)" erro={erros.numeroConta}>
          <FormInput variant="light" value={form.numeroConta} invalid={Boolean(erros.numeroConta)} onChange={numeroConta => setForm(atual => ({ ...atual, numeroConta }))} />
        </Campo>
      </div>
    </>
  );
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      {children}
      {erro ? <span className="block text-[11px] text-red-600 mt-1">{erro}</span> : null}
    </label>
  );
}
