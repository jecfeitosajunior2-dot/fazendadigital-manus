/**
 * Manejo sanitário no motor oficial de estoque.
 * Create e estorno na mesma transação do registro.
 * Sem título financeiro. Sem backfill de histórico.
 */
import {
  aplicarSaidaEstoqueNoTx,
  estornarMovimentacaoEstoqueNoTx,
} from "./estoqueSaldoTx";
import type { EstoqueMovimentacaoExecutor } from "./estoqueMovimentacaoTx";
import { dataCivilParaColunaDate } from "../shared/dataCivil";
import {
  SAUDE_MOV_MANEJO,
  SAUDE_MOV_TIPO,
  SAUDE_STATUS_ATIVO,
  SAUDE_STATUS_ESTORNADO,
  MSG_SAUDE_ESTORNO_DUPLO,
  MSG_SAUDE_ESTORNO_LEGADO,
  MSG_SAUDE_MOV_JA_ESTORNADA,
  MSG_SAUDE_NAO_ENCONTRADO,
  MSG_SAUDE_VINCULO_INVALIDO,
  MOTIVO_ESTORNO_SAUDE_PADRAO,
  decidirEstornoSaude,
  destinoMovimentacaoSaude,
  grupoEstornoSaude,
  grupoMovimentacaoSaude,
} from "../shared/saudeEstoque";

export class SaudeEstoqueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaudeEstoqueError";
  }
}

export type SaudeRegistroRow = {
  id: number;
  userId: number;
  animalId: number;
  tipo: string;
  descricao?: string | null;
  medicamento?: string | null;
  dosagem?: string | null;
  viaAplicacao?: string | null;
  estoqueId?: number | null;
  quantidadeConsumo?: string | number | null;
  valorUnitario?: string | number | null;
  veterinario?: string | null;
  custo?: string | number | null;
  dataRegistro: string;
  proximaData?: string | null;
  observacoes?: string | null;
  estoqueMovimentacaoId?: number | null;
  status?: string | null;
  estornadoEm?: Date | string | null;
  motivoEstorno?: string | null;
};

export type SaudeMovimentacaoRow = {
  id: number;
  estoqueId: number;
  fazendaId?: number | null;
  quantidade: string | number;
  valorEstoqueMovimentado?: string | number | null;
  valor?: string | number | null;
  grupoId?: string | null;
  tipo?: string | null;
  manejo?: string | null;
  status?: string | null;
  destino?: string | null;
};

export type SaudeRegistroInsert = {
  userId: number;
  animalId: number;
  tipo: string;
  descricao?: string | null;
  medicamento?: string | null;
  dosagem?: string | null;
  viaAplicacao?: string | null;
  estoqueId?: number | null;
  quantidadeConsumo?: string | null;
  valorUnitario?: string | null;
  veterinario?: string | null;
  custo?: string | null;
  dataRegistro: string;
  proximaData?: string | null;
  observacoes?: string | null;
  estoqueMovimentacaoId?: number | null;
  status: string;
};

export type SaudeEstoqueTx = EstoqueMovimentacaoExecutor & {
  insertRegistro(row: SaudeRegistroInsert): Promise<number>;
  updateRegistro(id: number, patch: {
    estoqueMovimentacaoId?: number | null;
    custo?: string | null;
    status?: string;
    /** Relógio da sessão MySQL (CURRENT_TIMESTAMP). Não usar Date JS. */
    estornadoEmAgora?: boolean;
    motivoEstorno?: string | null;
  }): Promise<void>;
  findRegistro(userId: number, id: number): Promise<SaudeRegistroRow | null>;
  findMovimentacao(id: number): Promise<SaudeMovimentacaoRow | null>;
  marcarMovimentacaoEstornada?(id: number, motivo: string): Promise<void>;
};

export type PersistirManejoSanitarioInput = {
  userId: number;
  registradoPor: string;
  animalId: number;
  fazendaId: number;
  tipo: string;
  descricao?: string;
  medicamento?: string;
  dosagem?: string;
  viaAplicacao?: string;
  veterinario?: string;
  estoqueId?: number | null;
  quantidadeConsumo?: string | null;
  valorUnitario?: string | null;
  custoPrevisto?: string | null;
  dataRegistro: string;
  proximaData?: string;
  observacoes?: string;
  unidadeEstoque?: string | null;
};

export type EstornarManejoSanitarioInput = {
  userId: number;
  registradoPor: string;
  id: number;
  motivo?: string;
  hojeISO: string;
};

function dataCivilSanitario(iso: string | undefined, mensagem: string): string {
  try {
    return dataCivilParaColunaDate(iso ?? "");
  } catch {
    throw new SaudeEstoqueError(mensagem);
  }
}

/**
 * Conversão de unidade (ml/dose/frasco → unidade do estoque) já vem
 * pronta em quantidadeConsumo. A movimentação oficial usa essa mesma
 * quantidade — sem segunda fórmula.
 */
export async function persistirManejoSanitarioNoTx(
  tx: SaudeEstoqueTx,
  input: PersistirManejoSanitarioInput,
): Promise<{ id: number; movimentacaoId: number | null; custo: string | null }> {
  const dataRegistro = dataCivilSanitario(
    input.dataRegistro,
    "Data do manejo sanitário inválida.",
  );

  const id = await tx.insertRegistro({
    userId: input.userId,
    animalId: input.animalId,
    tipo: input.tipo,
    descricao: input.descricao,
    medicamento: input.medicamento,
    dosagem: input.dosagem,
    viaAplicacao: input.viaAplicacao,
    estoqueId: input.estoqueId ?? null,
    quantidadeConsumo: input.quantidadeConsumo ?? null,
    valorUnitario: input.valorUnitario ?? null,
    veterinario: input.veterinario,
    custo: input.custoPrevisto ?? null,
    dataRegistro,
    proximaData: input.proximaData
      ? dataCivilSanitario(input.proximaData, "Data de carência inválida.")
      : null,
    observacoes: input.observacoes,
    estoqueMovimentacaoId: null,
    status: SAUDE_STATUS_ATIVO,
  });
  if (!id) {
    throw new SaudeEstoqueError("Não foi possível gravar o manejo sanitário.");
  }

  const estoqueId = input.estoqueId ?? null;
  const qtd = Number(String(input.quantidadeConsumo ?? "").replace(",", "."));
  if (estoqueId == null || !Number.isFinite(qtd) || qtd <= 0) {
    return { id, movimentacaoId: null, custo: input.custoPrevisto ?? null };
  }

  const saida = await aplicarSaidaEstoqueNoTx(tx, {
    estoqueId,
    fazendaId: input.fazendaId,
    grupoId: grupoMovimentacaoSaude(id),
    tipo: SAUDE_MOV_TIPO,
    manejo: SAUDE_MOV_MANEJO,
    dataMovimentacao: dataRegistro,
    quantidade: String(qtd),
    destino: destinoMovimentacaoSaude(input.animalId),
    userId: input.userId,
    registradoPor: input.registradoPor,
    observacoes: input.observacoes,
  });

  const custoOficial =
    saida.usaCapital && saida.valorEstoqueMovimentado != null
      ? saida.valorEstoqueMovimentado
      : (input.custoPrevisto ?? null);

  await tx.updateRegistro(id, {
    estoqueMovimentacaoId: saida.id,
    custo: custoOficial,
  });

  return { id, movimentacaoId: saida.id, custo: custoOficial };
}

export async function estornarManejoSanitarioNoTx(
  tx: SaudeEstoqueTx,
  input: EstornarManejoSanitarioInput,
): Promise<{ id: number; movimentacaoEstornoId: number | null }> {
  const row = await tx.findRegistro(input.userId, input.id);
  if (!row) {
    throw new SaudeEstoqueError(MSG_SAUDE_NAO_ENCONTRADO);
  }

  const decisao = decidirEstornoSaude(row);
  if (decisao.kind === "ja_estornado") {
    throw new SaudeEstoqueError(MSG_SAUDE_ESTORNO_DUPLO);
  }
  if (decisao.kind === "legado_bloqueado") {
    throw new SaudeEstoqueError(MSG_SAUDE_ESTORNO_LEGADO);
  }

  const motivo = (input.motivo ?? "").trim() || MOTIVO_ESTORNO_SAUDE_PADRAO;
  let movimentacaoEstornoId: number | null = null;

  if (decisao.kind === "com_estoque") {
    const mov = await tx.findMovimentacao(decisao.movimentacaoId);
    if (!mov) {
      throw new SaudeEstoqueError(MSG_SAUDE_VINCULO_INVALIDO);
    }
    if (row.estoqueId != null && Number(mov.estoqueId) !== Number(row.estoqueId)) {
      throw new SaudeEstoqueError(MSG_SAUDE_VINCULO_INVALIDO);
    }
    const statusMov = String(mov.status ?? "ativa").toLowerCase();
    if (statusMov !== "ativa") {
      throw new SaudeEstoqueError(
        statusMov === "estornada" || statusMov === "estorno"
          ? MSG_SAUDE_MOV_JA_ESTORNADA
          : MSG_SAUDE_VINCULO_INVALIDO,
      );
    }

    const inverso = await estornarMovimentacaoEstoqueNoTx(tx, {
      estoqueId: mov.estoqueId,
      quantidadeOriginal: mov.quantidade,
      valorSnapshot: mov.valorEstoqueMovimentado,
      grupoId: grupoEstornoSaude(row.id),
      originalGrupoId: mov.grupoId,
      tipo: mov.tipo,
      manejo: mov.manejo ?? SAUDE_MOV_MANEJO,
      dataMovimentacao: input.hojeISO,
      fazendaId: mov.fazendaId,
      userId: input.userId,
      registradoPor: input.registradoPor,
      motivoEstorno: motivo,
      destino: mov.destino,
      originalMovId: mov.id,
    });
    movimentacaoEstornoId = inverso.id;
  }

  await tx.updateRegistro(row.id, {
    status: SAUDE_STATUS_ESTORNADO,
    estornadoEmAgora: true,
    motivoEstorno: motivo,
  });

  return { id: row.id, movimentacaoEstornoId };
}
