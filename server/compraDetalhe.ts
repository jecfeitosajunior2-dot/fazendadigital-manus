import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { animais, compraGrupos, compras, fazendas, lotes, pastos } from "../drizzle/schema";
import { FORMA_PRECIFICACAO_COMPRA_LABEL } from "../shared/compraComercial";
import {
  MSG_COMPRA_IDENTIFICACAO_ENCERRADA,
  podeCancelarCompraComercial,
} from "../shared/compraCancelamento";
import {
  compraAcessivelAoUsuario,
  labelStatusComercialCompra,
  resumirIdentificacaoCompra,
  valoresOficiaisDaCompra,
  type VinculoAnimalCompra,
} from "../shared/compraIdentificacao";
import { compraDocumentosService } from "./compraDocumentosDb";
import { db } from "./db";

function num(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function montarDetalheCompra(input: {
  userId: number;
  compra: {
    id: number;
    userId: number;
    fazendaId?: number | null;
    fornecedor?: string | null;
    fornecedorId?: number | null;
    data: string;
    quantidadeAnimais?: number | null;
    formaPrecificacao?: string | null;
    precoUnitario?: unknown;
    valorAnimais?: unknown;
    frete?: unknown;
    outrosCustos?: unknown;
    custoTotal?: unknown;
    valorTotal?: unknown;
    pesoTotal?: unknown;
    loteDestinoId?: number | null;
    pastoDestinoId?: number | null;
    modoIdentificacao?: string | null;
    status?: string | null;
    referencia?: string | null;
    observacoes?: string | null;
    canceladoEm?: Date | string | null;
    canceladoPorUserId?: number | null;
    canceladoPorNome?: string | null;
    motivoCancelamento?: string | null;
  };
  grupos: Array<{
    id: number;
    categoria: string;
    sexo: string;
    quantidade: number;
    pesoTotal?: unknown;
  }>;
  vinculos: VinculoAnimalCompra[];
  fazendaNome: string | null;
  loteNome: string | null;
  pastoNome: string | null;
}) {
  if (!compraAcessivelAoUsuario(input.compra.userId, input.userId)) return null;

  const grupos = input.grupos.map(g => ({
    id: g.id,
    categoria: g.categoria,
    sexo: g.sexo,
    quantidade: Number(g.quantidade) || 0,
    pesoTotal: num(g.pesoTotal),
  }));

  const identificacao = resumirIdentificacaoCompra({
    compraId: input.compra.id,
    userId: input.userId,
    quantidadeAnimaisLegado: input.compra.quantidadeAnimais,
    pesoTotalPersistido: num(input.compra.pesoTotal),
    grupos,
    vinculos: input.vinculos,
  });

  const custoTotal = num(input.compra.custoTotal) ?? num(input.compra.valorTotal);
  const valores = valoresOficiaisDaCompra({
    formaPrecificacao: input.compra.formaPrecificacao,
    precoUnitario: num(input.compra.precoUnitario),
    valorAnimais: num(input.compra.valorAnimais),
    frete: num(input.compra.frete),
    outrosCustos: num(input.compra.outrosCustos),
    custoTotal,
    quantidade: identificacao.comprados,
    pesoTotal: identificacao.pesoAdquirido,
  });

  const forma = valores.forma;
  const cancelada = input.compra.status === "cancelado";
  return {
    id: input.compra.id,
    status: input.compra.status ?? null,
    statusComercialLabel: labelStatusComercialCompra(input.compra.status),
    fornecedor: input.compra.fornecedor ?? "—",
    fornecedorId: input.compra.fornecedorId ?? null,
    fazendaId: input.compra.fazendaId ?? null,
    fazendaNome: input.fazendaNome,
    data: input.compra.data,
    formaPrecificacao: forma,
    formaLabel: forma ? FORMA_PRECIFICACAO_COMPRA_LABEL[forma] : "—",
    modoIdentificacao: input.compra.modoIdentificacao ?? null,
    referencia: input.compra.referencia ?? null,
    observacoes: input.compra.observacoes ?? null,
    loteDestinoId: input.compra.loteDestinoId ?? null,
    pastoDestinoId: input.compra.pastoDestinoId ?? null,
    loteNome: input.loteNome,
    pastoNome: input.pastoNome,
    canceladoEm: input.compra.canceladoEm ?? null,
    canceladoPorUserId: input.compra.canceladoPorUserId ?? null,
    canceladoPorNome: input.compra.canceladoPorNome ?? null,
    motivoCancelamento: input.compra.motivoCancelamento ?? null,
    podeCancelar: podeCancelarCompraComercial({
      status: input.compra.status,
      identificados: identificacao.identificados,
    }),
    identificacao: {
      ...identificacao,
      situacaoLabel: cancelada ? MSG_COMPRA_IDENTIFICACAO_ENCERRADA : identificacao.situacaoLabel,
      operacionalEncerrada: cancelada,
    },
    valores,
  };
}

export async function getCompraDetalhe(userId: number, compraId: number) {
  const [compra] = await db
    .select()
    .from(compras)
    .where(and(eq(compras.id, compraId), eq(compras.userId, userId)))
    .limit(1);
  if (!compra) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
  }

  const grupos = await db
    .select()
    .from(compraGrupos)
    .where(and(eq(compraGrupos.compraId, compra.id), eq(compraGrupos.userId, userId)));

  const vinculos = await db
    .select({
      id: animais.id,
      userId: animais.userId,
      compraId: animais.compraId,
      compraGrupoId: animais.compraGrupoId,
    })
    .from(animais)
    .where(and(eq(animais.userId, userId), eq(animais.compraId, compra.id)));

  let fazendaNome: string | null = null;
  if (compra.fazendaId != null) {
    const [fazenda] = await db
      .select({ nome: fazendas.nome })
      .from(fazendas)
      .where(and(eq(fazendas.id, compra.fazendaId), eq(fazendas.userId, userId)))
      .limit(1);
    fazendaNome = fazenda?.nome ?? null;
  }

  let loteNome: string | null = null;
  if (compra.loteDestinoId != null) {
    const [lote] = await db
      .select({ nome: lotes.nome })
      .from(lotes)
      .where(and(eq(lotes.id, compra.loteDestinoId), eq(lotes.userId, userId)))
      .limit(1);
    loteNome = lote?.nome ?? null;
  }

  let pastoNome: string | null = null;
  if (compra.pastoDestinoId != null) {
    const [pasto] = await db
      .select({ nome: pastos.nome })
      .from(pastos)
      .where(and(eq(pastos.id, compra.pastoDestinoId), eq(pastos.userId, userId)))
      .limit(1);
    pastoNome = pasto?.nome ?? null;
  }

  const detalhe = montarDetalheCompra({
    userId,
    compra,
    grupos,
    vinculos,
    fazendaNome,
    loteNome,
    pastoNome,
  });
  if (!detalhe) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Compra não encontrada." });
  }
  const documentos = await compraDocumentosService.listarPublicos(userId, compra.id);
  return { ...detalhe, documentos };
}
