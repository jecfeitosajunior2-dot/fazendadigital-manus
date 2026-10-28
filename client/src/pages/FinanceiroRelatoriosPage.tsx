import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import ListExportButtons from "@/components/ListExportButtons";
import TableHorizontalScroll from "@/components/TableHorizontalScroll";
import { FD_PRIMARY, FormInput, FormSelect } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { periodoMesAtual, formatDateBR } from "@/lib/date-utils";
import { trpc } from "@/lib/trpc";
import {
  MSG_RELATORIO_SALDO_CONSOLIDADO,
  MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO,
} from "@shared/financeiroRelatoriosV2";
import { rotuloOrigemTitulo, rotuloSituacaoTitulo } from "@/lib/contasAPagarListagem";
import {
  formatarValorRelatorioV2,
  linhasExportFluxo,
  linhasExportTitulos,
  linhasExportVisao,
  periodoRelatorioTexto,
} from "@/lib/financeiroRelatoriosExport";
import { sessaoHttpConfirmada } from "@/lib/sessaoHttpAuth";

function CardIndicador(props: { titulo: string; valor: number; detalhe?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-[12px] text-gray-500">{props.titulo}</p>
      <p className="text-[20px] font-semibold text-gray-900 mt-1">{formatarValorRelatorioV2(props.valor)}</p>
      {props.detalhe ? <p className="text-[11px] text-gray-500 mt-1">{props.detalhe}</p> : null}
    </div>
  );
}

export function FinanceiroRelatoriosPage() {
  const mes = periodoMesAtual();
  const [de, setDe] = useState(mes.de);
  const [ate, setAte] = useState(mes.ate);
  const [fazendaId, setFazendaId] = useState("");
  const [contaId, setContaId] = useState("");
  const [aba, setAba] = useState("visao");

  const sessaoQuery = trpc.auth.me.useQuery(undefined, { retry: false });
  const autenticado = sessaoHttpConfirmada(sessaoQuery.data);
  const consultasHabilitadas = { enabled: autenticado };
  const fazendasQuery = trpc.fazendas.list.useQuery(undefined, consultasHabilitadas);
  const contasQuery = trpc.financeiroV2.contasList.useQuery(undefined, consultasHabilitadas);
  const relatorioQuery = trpc.financeiroV2.relatorioFinanceiro.useQuery({
    de,
    ate,
    fazendaId: fazendaId ? Number(fazendaId) : null,
    contaId: contaId ? Number(contaId) : null,
  }, consultasHabilitadas);

  const rel = relatorioQuery.data;
  const fazendas = fazendasQuery.data ?? [];
  const contas = contasQuery.data ?? [];
  const subtitulos = useMemo(() => {
    const linhas = [periodoRelatorioTexto(de, ate)];
    if (fazendaId) {
      const nome = fazendas.find(f => f.id === Number(fazendaId))?.nome;
      if (nome) linhas.push(`Fazenda: ${nome}`);
    }
    if (contaId) {
      const nome = contas.find(c => c.id === Number(contaId))?.nome;
      if (nome) linhas.push(`Conta: ${nome}`);
    }
    return linhas;
  }, [ate, contaId, contas, de, fazendaId, fazendas]);

  return (
    <AppLayout>
      <div className="bg-white rounded border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900" style={{ fontFamily: "Fraunces, serif" }}>
              Relatórios financeiros
            </h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Somente dados oficiais do Financeiro. Transferências não entram no resultado.
            </p>
          </div>
          {rel ? (
            <ListExportButtons
              title="Relatórios financeiros"
              filename="relatorios-financeiros-v2"
              headers={aba === "fluxo"
                ? ["Data", "Descrição", "Tipo", "Natureza", "Conta", "Valor"]
                : aba === "visao"
                  ? ["Indicador", "Valor"]
                  : ["Pessoa", "Origem", "Descrição", "Vencimento", "Original", "Liquidado", "Pendente", "Situação"]}
              rows={aba === "fluxo"
                ? linhasExportFluxo(rel)
                : aba === "visao"
                  ? linhasExportVisao(rel)
                  : linhasExportTitulos(aba === "receber" ? rel.receber.linhas : rel.pagar.linhas)}
              spreadsheetReportTitle="Relatórios financeiros"
              spreadsheetReportSubtitles={subtitulos}
              spreadsheetCurrencyCols={aba === "visao" ? [1] : aba === "fluxo" ? [5] : [4, 5, 6]}
              spreadsheetFooterRowCount={aba === "fluxo" ? 3 : 0}
              buttonLabel="Exportar Excel"
            />
          ) : null}
        </div>

        <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-3">
          <label className="text-[12px] text-gray-600">
            De
            <FormInput variant="light" type="date" value={de} onChange={setDe} className="mt-1 w-[160px]" />
          </label>
          <label className="text-[12px] text-gray-600">
            Até
            <FormInput variant="light" type="date" value={ate} onChange={setAte} className="mt-1 w-[160px]" />
          </label>
          <label className="text-[12px] text-gray-600">
            Fazenda
            <FormSelect
              variant="light"
              placeholder="Todas"
              value={fazendaId}
              onChange={setFazendaId}
            >
              {fazendas.map(f => (
                <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
              ))}
            </FormSelect>
          </label>
          <label className="text-[12px] text-gray-600">
            Conta financeira
            <FormSelect
              variant="light"
              placeholder="Todas"
              value={contaId}
              onChange={setContaId}
            >
              {contas.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
              ))}
            </FormSelect>
          </label>
        </div>

        {sessaoQuery.isLoading || !autenticado || relatorioQuery.isLoading || (relatorioQuery.isFetching && !rel) ? (
          <p className="px-4 py-8 text-[13px] text-gray-500">Carregando relatórios oficiais…</p>
        ) : relatorioQuery.error ? (
          <p className="px-4 py-8 text-[13px] text-red-600">{relatorioQuery.error.message}</p>
        ) : !rel ? null : (
          <Tabs value={aba} onValueChange={setAba} className="px-4 py-4">
            <TabsList>
              <TabsTrigger value="visao">Visão geral</TabsTrigger>
              <TabsTrigger value="fluxo">Fluxo de caixa</TabsTrigger>
              <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
              <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
            </TabsList>

            <TabsContent value="visao" className="mt-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <CardIndicador titulo="Saldo em Caixa e Bancos" valor={rel.visao.saldoCaixaBancos} detalhe={MSG_RELATORIO_SALDO_CONSOLIDADO} />
                <CardIndicador titulo="Total a receber" valor={rel.visao.totalAReceber} />
                <CardIndicador titulo="Total a pagar" valor={rel.visao.totalAPagar} />
                <CardIndicador titulo="Recebimentos do período" valor={rel.visao.recebimentosPeriodo} />
                <CardIndicador titulo="Pagamentos do período" valor={rel.visao.pagamentosPeriodo} />
                <CardIndicador titulo="Resultado financeiro realizado" valor={rel.visao.resultadoRealizado} detalhe="Não é lucro contábil." />
              </div>
            </TabsContent>

            <TabsContent value="fluxo" className="mt-4 space-y-6">
              <div>
                <h2 className="text-[14px] font-semibold text-gray-800 mb-2">Fluxo realizado</h2>
                <p className="text-[12px] text-gray-500 mb-3">{MSG_RELATORIO_TRANSFERENCIA_FORA_RESULTADO}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <CardIndicador titulo="Entradas" valor={rel.fluxoRealizado.entradas} />
                  <CardIndicador titulo="Saídas" valor={rel.fluxoRealizado.saidas} />
                  <CardIndicador titulo="Resultado líquido" valor={rel.fluxoRealizado.resultado} />
                </div>
                <TabelaMovimentos linhas={rel.fluxoRealizado.linhas} />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-gray-800 mb-2">Fluxo previsto</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                  <CardIndicador titulo="Recebimentos previstos" valor={rel.fluxoPrevisto.recebimentos} />
                  <CardIndicador titulo="Pagamentos previstos" valor={rel.fluxoPrevisto.pagamentos} />
                  <CardIndicador titulo="Resultado previsto" valor={rel.fluxoPrevisto.resultado} />
                  {rel.fluxoPrevisto.saldoProjetado != null
                    ? <CardIndicador titulo="Saldo projetado" valor={rel.fluxoPrevisto.saldoProjetado} />
                    : <CardIndicador titulo="Valores sem vencimento" valor={rel.fluxoPrevisto.semVencimentoReceber + rel.fluxoPrevisto.semVencimentoPagar} detalhe="Não distribuídos nos meses." />}
                </div>
                {(rel.fluxoPrevisto.semVencimentoReceber > 0 || rel.fluxoPrevisto.semVencimentoPagar > 0) && (
                  <p className="text-[12px] text-gray-500 mb-2">
                    Sem vencimento definido: receber {formatarValorRelatorioV2(rel.fluxoPrevisto.semVencimentoReceber)},
                    pagar {formatarValorRelatorioV2(rel.fluxoPrevisto.semVencimentoPagar)}.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="receber" className="mt-4 space-y-3">
              <ResumoPendencias
                pendente={rel.receber.totalPendente}
                vencido={rel.receber.totalVencido}
                aVencer={rel.receber.aVencer}
                noPeriodo={rel.receber.recebidoPeriodo}
                rotuloPeriodo="Recebido no período"
                titulos={rel.receber.quantidadeTitulos}
                parcelas={rel.receber.quantidadeParcelasPendentes}
              />
              <TabelaTitulos linhas={rel.receber.linhas} pessoa="Pagador" />
            </TabsContent>

            <TabsContent value="pagar" className="mt-4 space-y-3">
              <ResumoPendencias
                pendente={rel.pagar.totalPendente}
                vencido={rel.pagar.totalVencido}
                aVencer={rel.pagar.aVencer}
                noPeriodo={rel.pagar.pagoPeriodo}
                rotuloPeriodo="Pago no período"
                titulos={rel.pagar.quantidadeTitulos}
                parcelas={rel.pagar.quantidadeParcelasPendentes}
              />
              <TabelaTitulos linhas={rel.pagar.linhas} pessoa="Fornecedor" />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}

function ResumoPendencias(props: {
  pendente: number;
  vencido: number;
  aVencer: number;
  noPeriodo: number;
  rotuloPeriodo: string;
  titulos: number;
  parcelas: number;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <CardIndicador titulo="Total pendente" valor={props.pendente} />
      <CardIndicador titulo="Vencido" valor={props.vencido} />
      <CardIndicador titulo="A vencer" valor={props.aVencer} />
      <CardIndicador titulo={props.rotuloPeriodo} valor={props.noPeriodo} />
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-[12px] text-gray-500">Títulos</p>
        <p className="text-[20px] font-semibold text-gray-900 mt-1">{props.titulos}</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <p className="text-[12px] text-gray-500">Parcelas pendentes</p>
        <p className="text-[20px] font-semibold text-gray-900 mt-1">{props.parcelas}</p>
      </div>
    </div>
  );
}

function TabelaMovimentos({ linhas }: { linhas: Array<{
  movimentoId: number;
  data: string;
  descricao: string;
  tipo: string;
  natureza: string;
  contaNome: string;
  valor: number;
}> }) {
  if (!linhas.length) {
    return <p className="text-[13px] text-gray-500">Nenhum movimento no período.</p>;
  }
  return (
    <TableHorizontalScroll>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3">Data</th>
            <th className="py-2 pr-3">Descrição</th>
            <th className="py-2 pr-3">Tipo</th>
            <th className="py-2 pr-3">Conta</th>
            <th className="py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={l.movimentoId} className="border-b border-gray-100">
              <td className="py-2 pr-3">{formatDateBR(l.data)}</td>
              <td className="py-2 pr-3">{l.descricao}</td>
              <td className="py-2 pr-3">{l.tipo}</td>
              <td className="py-2 pr-3">{l.contaNome}</td>
              <td className="py-2 text-right" style={{ color: FD_PRIMARY }}>{formatarValorRelatorioV2(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableHorizontalScroll>
  );
}

function TabelaTitulos({
  linhas,
  pessoa,
}: {
  linhas: Array<{
    tituloId: number;
    parcelaId: number | null;
    pessoa: string;
    origemTipo: string;
    descricao: string;
    vencimento: string | null;
    valorOriginal: number;
    valorLiquidado: number;
    saldoPendente: number;
    situacao: string;
  }>;
  pessoa: string;
}) {
  if (!linhas.length) {
    return <p className="text-[13px] text-gray-500">Nenhum título neste recorte.</p>;
  }
  return (
    <TableHorizontalScroll>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 pr-3">{pessoa}</th>
            <th className="py-2 pr-3">Origem</th>
            <th className="py-2 pr-3">Descrição</th>
            <th className="py-2 pr-3">Vencimento</th>
            <th className="py-2 pr-3 text-right">Original</th>
            <th className="py-2 pr-3 text-right">Liquidado</th>
            <th className="py-2 pr-3 text-right">Pendente</th>
            <th className="py-2">Situação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={`${l.tituloId}-${l.parcelaId ?? "t"}`} className="border-b border-gray-100">
              <td className="py-2 pr-3">{l.pessoa}</td>
              <td className="py-2 pr-3">{rotuloOrigemTitulo(l.origemTipo)}</td>
              <td className="py-2 pr-3">{l.descricao}</td>
              <td className="py-2 pr-3">{l.vencimento ? formatDateBR(l.vencimento) : "A definir"}</td>
              <td className="py-2 pr-3 text-right">{formatarValorRelatorioV2(l.valorOriginal)}</td>
              <td className="py-2 pr-3 text-right">{formatarValorRelatorioV2(l.valorLiquidado)}</td>
              <td className="py-2 pr-3 text-right">{formatarValorRelatorioV2(l.saldoPendente)}</td>
              <td className="py-2">
                {l.situacao === "cancelado" ? "Cancelado" : rotuloSituacaoTitulo(l.situacao as "em_aberto" | "parcial" | "liquidado" | "vencido")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableHorizontalScroll>
  );
}
