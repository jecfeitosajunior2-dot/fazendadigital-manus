import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { animais, compraGrupos, compraRecebimentos, compras, lotes, pastos } from "../drizzle/schema";
import {
  montarItemListaRecebimentoCompra,
  unificarAnimaisRecebidosCompra,
  type RecebimentoCompraListaItem,
} from "../shared/compraRecebimentosListagem";
import { compraVisivelNoEscopo, type EscopoConsultaCompra } from "./consultaCompraAutorizada";
import { db } from "./db";

export async function listarRecebimentosCompra(
  userId: number,
  compraId: number,
  escopo?: EscopoConsultaCompra,
): Promise<RecebimentoCompraListaItem[]> {
  if (!Number.isInteger(compraId) || compraId <= 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
  }

  const dono = escopo?.titularUserId ?? userId;
  const [compra] = await db
    .select({ id: compras.id, userId: compras.userId, fazendaId: compras.fazendaId })
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.userId, dono)))
    .limit(1);
  if (!compra || (escopo && !compraVisivelNoEscopo(compra.fazendaId, escopo))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
  }

  const rows = await db
    .select({
      id: compraRecebimentos.id,
      userId: compraRecebimentos.userId,
      compraId: compraRecebimentos.compraId,
      compraGrupoId: compraRecebimentos.compraGrupoId,
      animalId: compraRecebimentos.animalId,
      brincoVisual: compraRecebimentos.brincoVisual,
      rfid: compraRecebimentos.rfid,
      sexo: compraRecebimentos.sexo,
      categoria: compraRecebimentos.categoria,
      pesoRecebimento: compraRecebimentos.pesoRecebimento,
      loteDestinoId: compraRecebimentos.loteDestinoId,
      pastoDestinoId: compraRecebimentos.pastoDestinoId,
      status: compraRecebimentos.status,
      recebidoEm: compraRecebimentos.recebidoEm,
    })
    .from(compraRecebimentos)
    .where(and(eq(compraRecebimentos.userId, dono), eq(compraRecebimentos.compraId, compra.id)));

  const loteIds = [...new Set(rows.map(r => r.loteDestinoId).filter((id): id is number => id != null && id > 0))];
  const pastoIds = [...new Set(rows.map(r => r.pastoDestinoId).filter((id): id is number => id != null && id > 0))];

  const loteNomePorId = new Map<number, string>();
  if (loteIds.length) {
    const loteRows = await db
      .select({ id: lotes.id, nome: lotes.nome })
      .from(lotes)
      .where(and(eq(lotes.userId, dono), inArray(lotes.id, loteIds)));
    for (const lote of loteRows) loteNomePorId.set(lote.id, lote.nome);
  }

  const pastoNomePorId = new Map<number, string>();
  if (pastoIds.length) {
    const pastoRows = await db
      .select({ id: pastos.id, nome: pastos.nome })
      .from(pastos)
      .where(and(eq(pastos.userId, dono), inArray(pastos.id, pastoIds)));
    for (const pasto of pastoRows) pastoNomePorId.set(pasto.id, pasto.nome);
  }

  const recebimentos = rows.map(row =>
    montarItemListaRecebimentoCompra(row, {
      loteNome: row.loteDestinoId != null ? loteNomePorId.get(row.loteDestinoId) ?? null : null,
      pastoNome: row.pastoDestinoId != null ? pastoNomePorId.get(row.pastoDestinoId) ?? null : null,
    }),
  );

  const vinculos = await db
    .select({
      id: animais.id,
      brinco: animais.brinco,
      brincoEletronico: animais.brincoEletronico,
      sexo: animais.sexo,
      categoria: animais.categoria,
      compraGrupoId: animais.compraGrupoId,
      dataEntrada: animais.dataEntrada,
    })
    .from(animais)
    .where(and(eq(animais.userId, dono), eq(animais.compraId, compra.id)));

  const grupos = await db
    .select({
      id: compraGrupos.id,
      categoria: compraGrupos.categoria,
      sexo: compraGrupos.sexo,
    })
    .from(compraGrupos)
    .where(and(eq(compraGrupos.compraId, compra.id), eq(compraGrupos.userId, dono)));

  return unificarAnimaisRecebidosCompra({
    compraId: compra.id,
    recebimentos,
    animais: vinculos,
    grupos,
  });
}
