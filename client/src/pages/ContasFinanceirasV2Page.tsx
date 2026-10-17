import { useState, type ReactNode } from "react";
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
import { FINANCEIRO_CONTAS_A_PAGAR_PATH } from "@/lib/contasAPagarListagem";
import {
  FINANCEIRO_CONTAS_V2_PATH,
  MSG_CONTAS_V2_CARREGANDO,
  MSG_CONTAS_V2_ERRO,
  MSG_INATIVAR_CONTA_V2,
  MSG_NENHUMA_CONTA_V2,
  OPCOES_TIPO_CONTA_V2,
  contasVisiveisParaUsuario,
  rotuloSituacaoContaV2,
  rotuloTipoContaV2,
  validarCadastroContaV2,
  type ContaFinanceiraV2Oficial,
  type ErrosCadastroContaV2,
} from "@/lib/contasFinanceirasV2";

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
  const [contaIdDetalhe, setContaIdDetalhe] = useState<number | null>(null);

  const consulta = trpc.financeiroV2.contasList.useQuery();
  const detalhe = trpc.financeiroV2.contasGet.useQuery(
    { id: contaIdDetalhe ?? 0 },
    { enabled: contaIdDetalhe != null },
  );
  const criar = trpc.financeiroV2.contasCreate.useMutation({
    onSuccess: async () => {
      toast.success("Conta financeira cadastrada.");
      setFormAberto(false);
      setForm(formVazio());
      setErros({});
      await utils.financeiroV2.contasList.invalidate();
    },
    onError: erro => {
      toast.error(erro.message || "Não foi possível cadastrar a conta.");
    },
  });
  const inativar = trpc.financeiroV2.contasInativar.useMutation({
    onSuccess: async () => {
      toast.success("Conta inativada.");
      await Promise.all([
        utils.financeiroV2.contasList.invalidate(),
        contaIdDetalhe != null ? utils.financeiroV2.contasGet.invalidate({ id: contaIdDetalhe }) : Promise.resolve(),
      ]);
    },
    onError: erro => {
      toast.error(erro.message || "Não foi possível inativar a conta.");
    },
  });

  const contas = contasVisiveisParaUsuario(
    (consulta.data ?? []) as ContaFinanceiraV2Oficial[],
    user?.id,
  );
  const contaDetalhe = detalhe.data as ContaFinanceiraV2Oficial | undefined;

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

  return (
    <AppLayout>
      <button
        type="button"
        onClick={() => setLocation(FINANCEIRO_CONTAS_A_PAGAR_PATH)}
        className="mb-4 flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors group"
        aria-label="Voltar para Contas a Pagar"
      >
        <span className="material-icons text-[18px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        <span className="text-[13px]">Voltar para Contas a Pagar</span>
      </button>

      <div className="bg-white rounded border border-gray-200 shadow-sm max-w-5xl" data-path={FINANCEIRO_CONTAS_V2_PATH}>
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Financeiro / Contas do caixa</p>
            <h1 className="text-[20px] font-semibold text-gray-900 mt-0.5" style={{ fontFamily: "Fraunces, serif" }}>
              Contas do caixa
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Contas oficiais para pagamentos. O saldo exibido é o saldo atual do Financeiro.
            </p>
          </div>
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
                    ]}
                    actions={conta.ativa ? [{
                      icon: "block",
                      label: "Inativar",
                      variant: "danger",
                      onClick: () => void pedirInativacao(conta),
                    }] : []}
                  />
                ))}
              </div>
              <div className="hidden lg:block">
                <TableHorizontalScroll fitWidth>
                  <table className="w-full min-w-[720px] table-fixed text-[11px] border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {["Nome", "Tipo", "Saldo atual", "Situação", "Banco", ""].map(col => (
                          <th
                            key={col || "acoes"}
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
                          className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                          onClick={() => setContaIdDetalhe(conta.id)}
                        >
                          <td className="px-3 py-2.5 text-gray-800 font-medium">{conta.nome}</td>
                          <td className="px-3 py-2.5 text-gray-700">{rotuloTipoContaV2(conta.tipo)}</td>
                          <td className="px-3 py-2.5 tabular-nums text-gray-800 font-medium">
                            {formatarValorOficial(conta.saldoAtual)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", classeSituacao(conta.ativa))}>
                              {rotuloSituacaoContaV2(conta.ativa)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">{conta.banco?.trim() || "—"}</td>
                          <td className="px-3 py-2.5 text-right">
                            {conta.ativa ? (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-amber-800 hover:underline"
                                onClick={evento => {
                                  evento.stopPropagation();
                                  void pedirInativacao(conta);
                                }}
                              >
                                Inativar
                              </button>
                            ) : null}
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
            <Campo label="Nome da conta" erro={erros.nome}>
              <FormInput variant="light" required value={form.nome} invalid={Boolean(erros.nome)} onChange={nome => setForm(atual => ({ ...atual, nome }))} />
            </Campo>
            <Campo label="Tipo" erro={erros.tipo}>
              <FormSelect
                variant="light"
                required
                modal={false}
                value={form.tipo}
                invalid={Boolean(erros.tipo)}
                placeholder="Selecione o tipo"
                onChange={tipo => setForm(atual => ({ ...atual, tipo }))}
              >
                {OPCOES_TIPO_CONTA_V2.map(opcao => (
                  <SelectItem key={opcao.value} value={opcao.value}>{opcao.label}</SelectItem>
                ))}
              </FormSelect>
            </Campo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Saldo de abertura" erro={erros.saldoAbertura}>
                <FormInput
                  variant="light"
                  required
                  inputMode="decimal"
                  value={form.saldoAbertura}
                  invalid={Boolean(erros.saldoAbertura)}
                  onChange={saldoAbertura => setForm(atual => ({ ...atual, saldoAbertura }))}
                />
              </Campo>
              <Campo label="Data do saldo de abertura" erro={erros.dataSaldoAbertura}>
                <FormInput
                  variant="light"
                  required
                  type="date"
                  value={form.dataSaldoAbertura}
                  invalid={Boolean(erros.dataSaldoAbertura)}
                  onChange={dataSaldoAbertura => setForm(atual => ({ ...atual, dataSaldoAbertura }))}
                />
              </Campo>
            </div>
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
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="h-9 px-3 rounded-lg border border-gray-200 text-[12px] font-medium text-gray-700"
                onClick={() => setFormAberto(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={criar.isPending}
                className="h-9 px-3 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {criar.isPending ? "Salvando..." : "Cadastrar conta"}
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
                {contaDetalhe.agencia ? <p className="text-[12px] text-gray-600">Agência {contaDetalhe.agencia}</p> : null}
                {contaDetalhe.numeroConta ? <p className="text-[12px] text-gray-600">Conta {contaDetalhe.numeroConta}</p> : null}
                {contaDetalhe.ativa ? (
                  <button
                    type="button"
                    className="h-9 px-3 rounded-lg border border-amber-200 text-[12px] font-semibold text-amber-800"
                    onClick={() => void pedirInativacao(contaDetalhe)}
                  >
                    Inativar conta
                  </button>
                ) : (
                  <p className="text-[12px] text-gray-500">{MSG_INATIVAR_CONTA_V2}</p>
                )}
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
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
