import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { compraGrupos, compras, fazendas, lotes, pastos, pessoas } from "../drizzle/schema";
import { normalizarDataOperacional } from "../shared/animalBaixa";
import {
  avaliarConfirmacaoCompraNaoIdentificados,
  MSG_COMPRA_DATA_INVALIDA,
  MSG_COMPRA_FORNECEDOR_INVALIDO,
  MSG_COMPRA_LOTE_OUTRA_FAZENDA,
  MSG_COMPRA_PASTO_OUTRA_FAZENDA,
  MSG_COMPRA_SEM_DATA,
  MSG_COMPRA_SEM_FAZENDA,
} from "../shared/compraComercial";
import {
  buildPastoFazendaMap,
  resolveLoteFazendaId,
} from "./animaisPorFazenda";
import { assertFazendaDoUsuario } from "./manejoContexto";
import { db } from "./db";

export type ConfirmarCompraGrupoInput = {
  categoria: string;
  sexo: string;
  quantidade: number;
  pesoTotal?: number | null;
};

export type ConfirmarCompraNaoIdentificadosInput = {
  fazendaId: number;
  data: string;
  fornecedorId: number;
  referencia?: string | null;
  formaPrecificacao: "kg" | "cabeca";
  precoUnitario: number;
  frete?: number | null;
  outrosCustos?: number | null;
  loteDestinoId?: number | null;
  pastoDestinoId?: number | null;
  observacoes?: string | null;
  modoIdentificacao: "nao_identificados";
  grupos: ConfirmarCompraGrupoInput[];
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

export async function confirmarCompraNaoIdentificados(
  userId: number,
  input: ConfirmarCompraNaoIdentificadosInput,
) {
  const avaliado = avaliarConfirmacaoCompraNaoIdentificados(input);
  if (!avaliado.ok) toTrpc(avaliado.message);
  const calc = avaliado.calculado;

  if (!(input.data ?? "").trim()) toTrpc(MSG_COMPRA_SEM_DATA);
  const dataISO = normalizarDataOperacional(input.data);
  if (!dataISO) toTrpc(MSG_COMPRA_DATA_INVALIDA);

  await assertFazendaDoUsuario(userId, input.fazendaId);

  try {
    const result = await db.transaction(async tx => {
      const [fazenda] = await tx
        .select({ id: fazendas.id })
        .from(fazendas)
        .where(and(eq(fazendas.userId, userId), eq(fazendas.id, input.fazendaId)))
        .limit(1);
      if (!fazenda) toTrpc(MSG_COMPRA_SEM_FAZENDA, "NOT_FOUND");

      const [fornecedor] = await tx
        .select({
          id: pessoas.id,
          nome: pessoas.nome,
          tipo: pessoas.tipo,
          ativo: pessoas.ativo,
        })
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), eq(pessoas.id, input.fornecedorId)))
        .limit(1);
      if (!fornecedor || fornecedor.tipo !== "fornecedor" || fornecedor.ativo === false) {
        toTrpc(MSG_COMPRA_FORNECEDOR_INVALIDO);
      }

      const pastosUser = await tx
        .select({ id: pastos.id, fazendaId: pastos.fazendaId, userId: pastos.userId })
        .from(pastos)
        .where(eq(pastos.userId, userId));
      const pastoFazendaMap = buildPastoFazendaMap(pastosUser);

      if (input.pastoDestinoId) {
        const pasto = pastosUser.find(p => p.id === input.pastoDestinoId);
        if (!pasto || Number(pasto.fazendaId) !== input.fazendaId) {
          toTrpc(MSG_COMPRA_PASTO_OUTRA_FAZENDA);
        }
      }

      if (input.loteDestinoId) {
        const [lote] = await tx
          .select({
            id: lotes.id,
            userId: lotes.userId,
            fazendaId: lotes.fazendaId,
            pastoAtualId: lotes.pastoAtualId,
          })
          .from(lotes)
          .where(and(eq(lotes.id, input.loteDestinoId), eq(lotes.userId, userId)))
          .limit(1);
        if (!lote || resolveLoteFazendaId(lote, pastoFazendaMap) !== input.fazendaId) {
          toTrpc(MSG_COMPRA_LOTE_OUTRA_FAZENDA);
        }
      }

      const agora = new Date();
      const insertCompra = await tx.insert(compras).values({
        userId,
        fazendaId: input.fazendaId,
        fornecedorId: input.fornecedorId,
        fornecedor: fornecedor.nome.trim(),
        data: dataISO,
        referencia: input.referencia?.trim() || null,
        formaPrecificacao: calc.forma,
        precoUnitario: String(calc.precoUnitario),
        valorAnimais: String(calc.valorAnimais),
        frete: String(calc.frete),
        outrosCustos: String(calc.outrosCustos),
        custoTotal: String(calc.custoTotal),
        valorTotal: String(calc.custoTotal),
        quantidadeAnimais: calc.quantidadeTotal,
        pesoTotal: calc.pesoTotal != null ? String(calc.pesoTotal) : null,
        loteDestinoId: input.loteDestinoId || null,
        pastoDestinoId: input.pastoDestinoId || null,
        modoIdentificacao: "nao_identificados",
        observacoes: input.observacoes?.trim() || null,
        status: "concluido",
        updatedAt: agora,
      });
      const compraId = insertIdOf(insertCompra);
      if (!compraId) toTrpc("Não foi possível gravar a compra.");

      await tx.insert(compraGrupos).values(
        calc.grupos.map(grupo => ({
          userId,
          compraId,
          categoria: grupo.categoria,
          sexo: grupo.sexo,
          quantidade: grupo.quantidade,
          pesoTotal: grupo.pesoTotal != null ? String(grupo.pesoTotal) : null,
        })),
      );

      return {
        compraId,
        quantidade: calc.quantidadeTotal,
        pesoTotal: calc.pesoTotal,
        custoTotal: calc.custoTotal,
      };
    });

    return { success: true as const, ...result };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[compra.confirmarNaoIdentificados]", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível confirmar a compra.",
    });
  }
}
