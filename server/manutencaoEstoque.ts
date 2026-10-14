/**
 * Manutenção no motor oficial de estoque.
 * Create e estorno na mesma transação da OS.
 * Sem título financeiro. Sem backfill.
 */
import {
  aplicarSaidaEstoqueNoTx,
  estornarMovimentacaoEstoqueNoTx,
} from "./estoqueSaldoTx";
import type { EstoqueMovimentacaoExecutor } from "./estoqueMovimentacaoTx";
import { persistirCapital, persistirQuantidadeEstoque } from "../shared/estoqueCapital";
import {
  decidirEstornoManutencao,
  destinoMovimentacaoManutencao,
  grupoEstornoManutencao,
  grupoMovimentacaoManutencao,
  MANUT_MOV_MANEJO,
  MANUT_MOV_TIPO,
  MANUT_STATUS_CONCLUIDA,
  MANUT_STATUS_ESTORNADO,
  MOTIVO_ESTORNO_MANUT_PADRAO,
  MSG_MANUT_ESTOQUE_AUSENTE_MYSQL,
  MSG_MANUT_ESTORNO_LEGADO,
  MSG_MANUT_MOV_JA_ESTORNADA,
  MSG_MANUT_NAO_ENCONTRADA,
  MSG_MANUT_VINCULO_INVALIDO,
  valorUnitarioDeSnapshot,
} from "../shared/manutencaoEstoque";

export class ManutencaoEstoqueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManutencaoEstoqueError";
  }
}

export type ManutencaoPecaResolvida = {
  estoqueId: number;
  nome: string;
  quantidade: number;
  valorUnitario: number;
};

export type ManutencaoPecaRow = {
  id: number;
  manutencaoId: number;
  estoqueId?: number | null;
  nome: string;
  quantidade: string | number;
  valorUnitario?: string | number | null;
  valorTotal?: string | number | null;
  estoqueMovimentacaoId?: number | null;
};

export type ManutencaoOsRow = {
  id: number;
  userId: number;
  maquinaId: number;
  status?: string | null;
  valorMaoObra?: string | number | null;
};

export type ManutencaoMovimentacaoRow = {
  id: number;
  estoqueId: number;
  fazendaId?: number | null;
  quantidade: string | number;
  valorEstoqueMovimentado?: string | number | null;
  grupoId?: string | null;
  tipo?: string | null;
  manejo?: string | null;
  status?: string | null;
  destino?: string | null;
};

export type ManutencaoOsInsert = {
  userId: number;
  maquinaId: number;
  tipo: string;
  descricao?: string | null;
  data: string;
  horimetro?: string | null;
  proximaManutencao?: string | null;
  status: string;
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  valorMaoObra: string;
  valorPecas: string;
  valorTotal: string;
  custo: string;
  observacoes?: string | null;
};

export type ManutencaoEstoqueTx = EstoqueMovimentacaoExecutor & {
  insertOs(row: ManutencaoOsInsert): Promise<number>;
  updateOs(id: number, patch: {
    valorPecas?: string;
    valorTotal?: string;
    custo?: string;
    status?: string;
    estornadoEmAgora?: boolean;
    motivoEstorno?: string | null;
  }): Promise<void>;
  insertPeca(row: {
    manutencaoId: number;
    estoqueId: number;
    nome: string;
    quantidade: string;
    valorUnitario: string;
    valorTotal: string;
    estoqueMovimentacaoId?: number | null;
  }): Promise<number>;
  updatePeca(id: number, patch: {
    estoqueMovimentacaoId?: number | null;
    valorUnitario?: string;
    valorTotal?: string;
  }): Promise<void>;
  findOs(userId: number, id: number): Promise<ManutencaoOsRow | null>;
  listPecas(manutencaoId: number): Promise<ManutencaoPecaRow[]>;
  findMovimentacao(id: number): Promise<ManutencaoMovimentacaoRow | null>;
  marcarMovimentacaoEstornada?(id: number, motivo: string): Promise<void>;
};

export type PersistirManutencaoInput = {
  userId: number;
  registradoPor: string;
  maquinaId: number;
  fazendaId: number;
  tipo: string;
  descricao?: string | null;
  data: string;
  horimetro?: string | null;
  proximaManutencao?: string | null;
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  valorMaoObra: number;
  observacoes?: string | null;
  pecas: ManutencaoPecaResolvida[];
};

export type EstornarManutencaoInput = {
  userId: number;
  registradoPor: string;
  id: number;
  motivo?: string;
  hojeISO: string;
  algumEstoqueComCapital?: boolean;
};

export async function persistirManutencaoComPecasNoTx(
  tx: ManutencaoEstoqueTx,
  input: PersistirManutencaoInput,
): Promise<{ id: number; pecaIds: number[]; movimentacaoIds: number[] }> {
  if (!input.pecas.length) {
    throw new ManutencaoEstoqueError("Informe ao menos uma peça de estoque.");
  }
  if (!input.fazendaId) {
    throw new ManutencaoEstoqueError("Informe a fazenda da máquina para baixar o estoque.");
  }

  const totaisPrevistos = input.pecas.reduce((s, p) => s + p.quantidade * p.valorUnitario, 0);
  const maoObra = Number.isFinite(input.valorMaoObra) ? input.valorMaoObra : 0;
  const osId = await tx.insertOs({
    userId: input.userId,
    maquinaId: input.maquinaId,
    tipo: input.tipo,
    descricao: input.descricao,
    data: input.data,
    horimetro: input.horimetro,
    proximaManutencao: input.proximaManutencao,
    status: MANUT_STATUS_CONCLUIDA,
    prestadorNome: input.prestadorNome,
    prestadorContato: input.prestadorContato,
    valorMaoObra: persistirCapital(maoObra),
    valorPecas: persistirCapital(totaisPrevistos),
    valorTotal: persistirCapital(totaisPrevistos + maoObra),
    custo: persistirCapital(totaisPrevistos + maoObra),
    observacoes: input.observacoes,
  });
  if (!osId) {
    throw new ManutencaoEstoqueError("Não foi possível gravar a manutenção.");
  }

  const pecaIds: number[] = [];
  const movimentacaoIds: number[] = [];
  let valorPecasOficial = 0;

  for (const peca of input.pecas) {
    const item = await tx.findEstoque(peca.estoqueId);
    if (!item) {
      throw new ManutencaoEstoqueError(MSG_MANUT_ESTOQUE_AUSENTE_MYSQL);
    }

    const qtd = persistirQuantidadeEstoque(peca.quantidade);
    const vuPrevisto = persistirCapital(peca.valorUnitario);
    const pecaId = await tx.insertPeca({
      manutencaoId: osId,
      estoqueId: peca.estoqueId,
      nome: peca.nome,
      quantidade: qtd,
      valorUnitario: vuPrevisto,
      valorTotal: persistirCapital(peca.quantidade * peca.valorUnitario),
      estoqueMovimentacaoId: null,
    });
    if (!pecaId) {
      throw new ManutencaoEstoqueError("Não foi possível gravar a peça da manutenção.");
    }

    const saida = await aplicarSaidaEstoqueNoTx(tx, {
      estoqueId: peca.estoqueId,
      fazendaId: input.fazendaId,
      grupoId: grupoMovimentacaoManutencao(osId, pecaId),
      tipo: MANUT_MOV_TIPO,
      manejo: MANUT_MOV_MANEJO,
      dataMovimentacao: input.data,
      quantidade: String(peca.quantidade),
      destino: destinoMovimentacaoManutencao(osId),
      userId: input.userId,
      registradoPor: input.registradoPor,
      observacoes: input.observacoes ?? undefined,
    });

    const usaSnap = saida.usaCapital && saida.valorEstoqueMovimentado != null;
    const valorTotal = usaSnap
      ? persistirCapital(saida.valorEstoqueMovimentado!)
      : persistirCapital(peca.quantidade * peca.valorUnitario);
    const valorUnitario = usaSnap
      ? valorUnitarioDeSnapshot(saida.valorEstoqueMovimentado!, peca.quantidade)
      : vuPrevisto;

    await tx.updatePeca(pecaId, {
      estoqueMovimentacaoId: saida.id,
      valorTotal,
      valorUnitario,
    });

    pecaIds.push(pecaId);
    movimentacaoIds.push(saida.id);
    valorPecasOficial += Number(valorTotal);
  }

  await tx.updateOs(osId, {
    valorPecas: persistirCapital(valorPecasOficial),
    valorTotal: persistirCapital(valorPecasOficial + maoObra),
    custo: persistirCapital(valorPecasOficial + maoObra),
  });

  return { id: osId, pecaIds, movimentacaoIds };
}

export async function estornarManutencaoNoTx(
  tx: ManutencaoEstoqueTx,
  input: EstornarManutencaoInput,
): Promise<{ id: number; alreadyEstornado?: boolean; movimentacaoEstornoIds: number[] }> {
  const os = await tx.findOs(input.userId, input.id);
  if (!os) {
    throw new ManutencaoEstoqueError(MSG_MANUT_NAO_ENCONTRADA);
  }
  const pecas = await tx.listPecas(os.id);
  const decisao = decidirEstornoManutencao({
    status: os.status,
    pecas,
    algumEstoqueComCapital: input.algumEstoqueComCapital,
  });

  if (decisao.kind === "ja_estornado") {
    return { id: os.id, alreadyEstornado: true, movimentacaoEstornoIds: [] };
  }
  if (decisao.kind === "sem_consumo") {
    throw new ManutencaoEstoqueError(
      "Estorno aplica-se apenas a manutenções que consumiram peças do estoque. Para serviços sem peças, use Excluir.",
    );
  }
  if (decisao.kind === "legado_bloqueado") {
    throw new ManutencaoEstoqueError(MSG_MANUT_ESTORNO_LEGADO);
  }
  if (decisao.kind !== "com_vinculo") {
    throw new ManutencaoEstoqueError(MSG_MANUT_ESTORNO_LEGADO);
  }

  const motivo = (input.motivo ?? "").trim() || MOTIVO_ESTORNO_MANUT_PADRAO;
  const movimentacaoEstornoIds: number[] = [];

  for (const peca of pecas) {
    const movId = Number(peca.estoqueMovimentacaoId);
    if (!Number.isInteger(movId) || movId <= 0) continue;
    const mov = await tx.findMovimentacao(movId);
    if (!mov) {
      throw new ManutencaoEstoqueError(MSG_MANUT_VINCULO_INVALIDO);
    }
    if (peca.estoqueId != null && Number(mov.estoqueId) !== Number(peca.estoqueId)) {
      throw new ManutencaoEstoqueError(MSG_MANUT_VINCULO_INVALIDO);
    }
    const statusMov = String(mov.status ?? "ativa").toLowerCase();
    if (statusMov !== "ativa") {
      throw new ManutencaoEstoqueError(
        statusMov === "estornada" || statusMov === "estorno"
          ? MSG_MANUT_MOV_JA_ESTORNADA
          : MSG_MANUT_VINCULO_INVALIDO,
      );
    }

    const inverso = await estornarMovimentacaoEstoqueNoTx(tx, {
      estoqueId: mov.estoqueId,
      quantidadeOriginal: mov.quantidade,
      valorSnapshot: mov.valorEstoqueMovimentado,
      grupoId: grupoEstornoManutencao(os.id),
      originalGrupoId: mov.grupoId,
      tipo: mov.tipo,
      manejo: mov.manejo ?? MANUT_MOV_MANEJO,
      dataMovimentacao: input.hojeISO,
      fazendaId: mov.fazendaId,
      userId: input.userId,
      registradoPor: input.registradoPor,
      motivoEstorno: motivo,
      destino: mov.destino,
      originalMovId: mov.id,
    });
    movimentacaoEstornoIds.push(inverso.id);
  }

  await tx.updateOs(os.id, {
    status: MANUT_STATUS_ESTORNADO,
    estornadoEmAgora: true,
    motivoEstorno: motivo,
  });

  return { id: os.id, movimentacaoEstornoIds };
}
