/**
 * Edição atômica das peças da oficina.
 * Não altera quantidade, snapshot nem vínculo das peças de estoque.
 */
import { persistirCapital } from "../shared/estoqueCapital";
import {
  MANUT_STATUS_CONCLUIDA,
  MSG_MANUT_NAO_ENCONTRADA,
  manutencaoEstaEstornada,
} from "../shared/manutencaoEstoque";
import {
  MSG_MANUT_EDICAO_ESTORNADA,
  validarEdicaoOrigemPecas,
  validarPecasOficinaNaExecucao,
  valorPecasEstoqueCongelado,
  type PecaOficinaNormalizada,
} from "../shared/manutencaoPecasOrigem";
import { complementoTotaisOs, type ComplementoOsPatch } from "./manutencaoCompleta";
import { ManutencaoEstoqueError } from "./manutencaoEstoque";

export type OsEdicaoRow = {
  id: number;
  userId: number;
  status?: string | null;
  valorPecas?: string | number | null;
  valorPecasOficina?: string | number | null;
  valorMaoObra?: string | number | null;
};

export type PecaEdicaoRow = {
  id?: number;
  origem?: string | null;
  estoqueId?: number | null;
  quantidade?: string | number | null;
  valorTotal?: string | number | null;
  estoqueMovimentacaoId?: number | null;
};

export type CabecalhoEdicaoOs = {
  maquinaId?: number;
  tipo?: string;
  descricao?: string | null;
  data?: string;
  horimetro?: string | null;
  proximaManutencao?: string | null;
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  prestadorPessoaId?: number | null;
  observacoes?: string | null;
  tipoExecucao?: string | null;
};

export type EditarPecasOficinaInput = {
  userId: number;
  id: number;
  tipoExecucao?: string | null;
  valorMaoObra: number;
  pecasOficina: PecaOficinaNormalizada[];
  pecasEstoqueInput: Array<{
    estoqueId?: number | null;
    quantidade: number;
    origem?: string | null;
  }>;
  cabecalho?: CabecalhoEdicaoOs;
};

export type EdicaoOficinaCtx = {
  bloquearOs: () => Promise<OsEdicaoRow | null>;
  listarPecas: () => Promise<PecaEdicaoRow[]>;
  substituirPecasOficina: (pecas: PecaOficinaNormalizada[]) => Promise<void>;
  atualizarOs: (
    patch: ComplementoOsPatch & CabecalhoEdicaoOs & { valorMaoObra: string },
  ) => Promise<void>;
};

export async function editarPecasOficinaNoTx(
  ctx: EdicaoOficinaCtx,
  input: EditarPecasOficinaInput,
): Promise<{ id: number; totais: ComplementoOsPatch }> {
  const os = await ctx.bloquearOs();
  if (!os || os.userId !== input.userId) {
    throw new ManutencaoEstoqueError(MSG_MANUT_NAO_ENCONTRADA);
  }
  if (
    manutencaoEstaEstornada(os.status)
    || String(os.status ?? "").trim().toLowerCase() !== MANUT_STATUS_CONCLUIDA
  ) {
    throw new ManutencaoEstoqueError(MSG_MANUT_EDICAO_ESTORNADA);
  }

  const pecasAntigas = await ctx.listarPecas();
  const pecasOficina = input.pecasOficina.map((p) => ({
    ...p,
    valorTotal: p.quantidade * p.valorUnitario,
  }));
  const origem = validarEdicaoOrigemPecas({
    pecasAntigas,
    pecasEstoqueNovas: input.pecasEstoqueInput,
    pecasOficinaNovas: pecasOficina,
  });
  if (!origem.ok) {
    throw new ManutencaoEstoqueError(origem.message);
  }

  const oficinaNaExecucao = validarPecasOficinaNaExecucao(input.tipoExecucao, pecasOficina);
  if (!oficinaNaExecucao.ok) {
    throw new ManutencaoEstoqueError(oficinaNaExecucao.message);
  }

  const totais = complementoTotaisOs({
    valorPecasEstoqueOficial: valorPecasEstoqueCongelado(pecasAntigas, os),
    pecasOficina,
    valorMaoObra: input.valorMaoObra,
  });

  await ctx.substituirPecasOficina(pecasOficina);
  await ctx.atualizarOs({
    ...input.cabecalho,
    ...totais,
    tipoExecucao: input.tipoExecucao ?? input.cabecalho?.tipoExecucao ?? null,
    valorMaoObra: persistirCapital(input.valorMaoObra),
  });

  return { id: os.id, totais };
}
