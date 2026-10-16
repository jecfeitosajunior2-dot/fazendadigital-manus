/**
 * Orquestrador da OS completa (estoque + oficina + totais).
 * Reutiliza o motor homologado. Não recalcula custo médio nem snapshot.
 */
import { persistirCapital, persistirQuantidadeEstoque } from "../shared/estoqueCapital";
import {
  decidirEstornoManutencao,
  MANUT_STATUS_ESTORNADO,
  MOTIVO_ESTORNO_MANUT_PADRAO,
  MSG_MANUT_ESTORNO_LEGADO,
  MSG_MANUT_NAO_ENCONTRADA,
} from "../shared/manutencaoEstoque";
import {
  calcularCustosManutencaoCompletos,
  estornoCompletoSemMovimentacao,
  MANUT_PECA_ORIGEM_OFICINA,
  type PecaOficinaNormalizada,
} from "../shared/manutencaoPecasOrigem";
import {
  estornarManutencaoNoTx,
  ManutencaoEstoqueError,
  type EstornarManutencaoInput,
  type ManutencaoEstoqueTx,
  type PersistirManutencaoInput,
} from "./manutencaoEstoque";

export type PersistirManutencaoCompletaInput = Omit<PersistirManutencaoInput, "fazendaId"> & {
  /** Oficial da máquina. Nunca 0. Obrigatória só quando há peça de estoque. */
  fazendaId?: number | null;
  tipoExecucao?: string | null;
  pecasOficina?: PecaOficinaNormalizada[];
  prestadorPessoaId?: number | null;
  chaveOperacao?: string | null;
};

export type ComplementoOsPatch = {
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  valorPecas: string;
  valorPecasOficina: string;
  valorCobradoOficina: string;
  valorTotal: string;
  custo: string;
};

export type OsChaveOperacaoSnapshot = {
  id: number;
  userId: number;
  maquinaId: number;
  data: string;
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  valorMaoObra: string | number;
  valorCobradoOficina?: string | number | null;
  pecas: Array<{
    estoqueId?: number | null;
    nome?: string | null;
    quantidade?: string | number | null;
    valorUnitario?: string | number | null;
    origem?: string | null;
  }>;
};

export type PersistenciaCompletaCtx = {
  persistirEstoque: (
    input: PersistirManutencaoInput,
  ) => Promise<{ id: number; pecaIds: number[]; movimentacaoIds: number[] }>;
  inserirOsSemEstoque: (row: {
    userId: number;
    maquinaId: number;
    tipo: string;
    descricao?: string | null;
    data: string;
    horimetro?: string | null;
    proximaManutencao?: string | null;
    prestadorNome?: string | null;
    prestadorContato?: string | null;
    prestadorPessoaId?: number | null;
    tipoExecucao?: string | null;
    valorMaoObra: string;
    valorPecas: string;
    valorPecasOficina: string;
    valorCobradoOficina: string;
    valorTotal: string;
    custo: string;
    observacoes?: string | null;
    chaveOperacao?: string | null;
  }) => Promise<number>;
  findOsPorChaveOperacao?: (
    userId: number,
    chave: string,
  ) => Promise<OsChaveOperacaoSnapshot | null>;
  marcarOrigemEstoque: (pecaIds: number[]) => Promise<void>;
  gravarPecasOficina: (osId: number, pecas: PecaOficinaNormalizada[]) => Promise<number[]>;
  lerTotaisOs: (osId: number) => Promise<{ valorPecas: number; valorMaoObra: number }>;
  atualizarComplementoOs: (osId: number, patch: ComplementoOsPatch) => Promise<void>;
};

export type EstornoCompletoResult =
  | {
      handled: true;
      id: number;
      alreadyEstornado?: boolean;
      movimentacaoEstornoIds: number[];
    }
  | { handled: false; kind: "legado_sem_capital"; id: number };

function tipoExecucaoPersistido(raw: string | null | undefined): string | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "interna" || v === "externa" ? v : undefined;
}

function fazendaIdParaMotorEstoque(raw: number | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ManutencaoEstoqueError("Informe a fazenda da máquina para baixar o estoque.");
  }
  return n;
}

export function complementoTotaisOs(input: {
  valorPecasEstoqueOficial: number;
  pecasOficina: PecaOficinaNormalizada[];
  valorMaoObra: number;
}): ComplementoOsPatch {
  const custos = calcularCustosManutencaoCompletos({
    pecasEstoque: [{ quantidade: 1, valorUnitario: input.valorPecasEstoqueOficial }],
    pecasOficina: input.pecasOficina,
    valorMaoObra: input.valorMaoObra,
  });
  return {
    valorPecas: persistirCapital(custos.valorPecas),
    valorPecasOficina: persistirCapital(custos.valorPecasOficina),
    valorCobradoOficina: persistirCapital(custos.valorCobradoOficina),
    valorTotal: persistirCapital(custos.valorTotal),
    custo: persistirCapital(custos.valorTotal),
  };
}

export async function persistirManutencaoCompletaNoTx(
  ctx: PersistenciaCompletaCtx,
  input: PersistirManutencaoCompletaInput,
): Promise<{
  id: number;
  pecaIds: number[];
  pecaOficinaIds: number[];
  movimentacaoIds: number[];
}> {
  const pecasOficina = input.pecasOficina ?? [];
  const tipoExecucao = tipoExecucaoPersistido(input.tipoExecucao);

  if (input.pecas.length > 0) {
    const persistido = await ctx.persistirEstoque({
      userId: input.userId,
      registradoPor: input.registradoPor,
      maquinaId: input.maquinaId,
      fazendaId: fazendaIdParaMotorEstoque(input.fazendaId),
      tipo: input.tipo,
      descricao: input.descricao,
      data: input.data,
      horimetro: input.horimetro,
      proximaManutencao: input.proximaManutencao,
      prestadorNome: input.prestadorNome,
      prestadorContato: input.prestadorContato,
      valorMaoObra: input.valorMaoObra,
      observacoes: input.observacoes,
      pecas: input.pecas,
      chaveOperacao: input.chaveOperacao ?? undefined,
    });
    await ctx.marcarOrigemEstoque(persistido.pecaIds);
    const pecaOficinaIds = await ctx.gravarPecasOficina(persistido.id, pecasOficina);
    const oficiais = await ctx.lerTotaisOs(persistido.id);
    await ctx.atualizarComplementoOs(persistido.id, {
      ...complementoTotaisOs({
        valorPecasEstoqueOficial: oficiais.valorPecas,
        pecasOficina,
        valorMaoObra: oficiais.valorMaoObra,
      }),
      tipoExecucao: tipoExecucao ?? null,
      prestadorPessoaId: input.prestadorPessoaId ?? null,
    });
    return {
      id: persistido.id,
      pecaIds: persistido.pecaIds,
      pecaOficinaIds,
      movimentacaoIds: persistido.movimentacaoIds,
    };
  }

  const custos = calcularCustosManutencaoCompletos({
    pecasEstoque: [],
    pecasOficina,
    valorMaoObra: input.valorMaoObra,
  });
  const osId = await ctx.inserirOsSemEstoque({
    userId: input.userId,
    maquinaId: input.maquinaId,
    tipo: input.tipo,
    descricao: input.descricao,
    data: input.data,
    horimetro: input.horimetro,
    proximaManutencao: input.proximaManutencao,
    prestadorNome: input.prestadorNome,
    prestadorContato: input.prestadorContato,
    prestadorPessoaId: input.prestadorPessoaId ?? null,
    tipoExecucao: tipoExecucao ?? null,
    valorMaoObra: persistirCapital(custos.valorMaoObra),
    valorPecas: persistirCapital(custos.valorPecas),
    valorPecasOficina: persistirCapital(custos.valorPecasOficina),
    valorCobradoOficina: persistirCapital(custos.valorCobradoOficina),
    valorTotal: persistirCapital(custos.valorTotal),
    custo: persistirCapital(custos.valorTotal),
    observacoes: input.observacoes,
    chaveOperacao: input.chaveOperacao ?? undefined,
  });
  if (!osId) {
    throw new ManutencaoEstoqueError("Não foi possível gravar a manutenção.");
  }
  const pecaOficinaIds = await ctx.gravarPecasOficina(osId, pecasOficina);
  return { id: osId, pecaIds: [], pecaOficinaIds, movimentacaoIds: [] };
}

export async function estornarManutencaoCompletaNoTx(
  motor: ManutencaoEstoqueTx,
  input: EstornarManutencaoInput,
  patrimonial: typeof estornarManutencaoNoTx = estornarManutencaoNoTx,
): Promise<EstornoCompletoResult> {
  const os = await motor.findOs(input.userId, input.id);
  if (!os) {
    throw new ManutencaoEstoqueError(MSG_MANUT_NAO_ENCONTRADA);
  }
  const pecas = await motor.listPecas(os.id);
  const decisao = decidirEstornoManutencao({
    status: os.status,
    pecas,
    algumEstoqueComCapital: input.algumEstoqueComCapital,
  });

  if (decisao.kind === "ja_estornado") {
    return { handled: true, id: os.id, alreadyEstornado: true, movimentacaoEstornoIds: [] };
  }

  if (estornoCompletoSemMovimentacao(decisao.kind)) {
    const motivo = (input.motivo ?? "").trim() || MOTIVO_ESTORNO_MANUT_PADRAO;
    await motor.updateOs(os.id, {
      status: MANUT_STATUS_ESTORNADO,
      estornadoEmAgora: true,
      motivoEstorno: motivo,
    });
    return { handled: true, id: os.id, movimentacaoEstornoIds: [] };
  }

  if (decisao.kind === "com_vinculo") {
    const resultado = await patrimonial(motor, input);
    return {
      handled: true,
      id: resultado.id,
      alreadyEstornado: resultado.alreadyEstornado,
      movimentacaoEstornoIds: resultado.movimentacaoEstornoIds,
    };
  }

  if (decisao.kind === "legado_sem_capital") {
    return { handled: false, kind: "legado_sem_capital", id: os.id };
  }

  throw new ManutencaoEstoqueError(MSG_MANUT_ESTORNO_LEGADO);
}

export function pecaOficinaParaInsert(osId: number, peca: PecaOficinaNormalizada) {
  return {
    manutencaoId: osId,
    estoqueId: null as number | null,
    nome: peca.nome,
    quantidade: persistirQuantidadeEstoque(peca.quantidade),
    valorUnitario: persistirCapital(peca.valorUnitario),
    valorTotal: persistirCapital(peca.valorTotal),
    origem: MANUT_PECA_ORIGEM_OFICINA,
  };
}
