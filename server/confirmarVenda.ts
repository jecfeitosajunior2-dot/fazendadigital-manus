import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { animalBaixas, animais, fazendas, lotes, pessoas, vendaItens, vendas } from "../drizzle/schema";
import { normalizarDataOperacional } from "../shared/animalBaixa";
import {
  calcularValorItem,
  isFormaPrecificacaoVenda,
  mensagemAnimaisIndisponiveis,
  parseRendimentoCarcaca,
  MSG_VENDA_ANIMAL_INDISPONIVEL,
  MSG_VENDA_ANIMAL_OUTRA_FAZENDA,
  MSG_VENDA_SEM_COMPRADOR,
  MSG_VENDA_SEM_DATA,
  MSG_VENDA_DATA_INVALIDA,
  MSG_VENDA_SEM_FAZENDA,
  MSG_VENDA_SEM_ITENS,
  MSG_VENDA_FORMA_INVALIDA,
  MSG_VENDA_ANIMAL_DUPLICADO,
  resumirItensVenda,
  type FormaPrecificacaoVenda,
} from "../shared/vendaComercial";
import { db } from "./db";
import { animalPertenceFazenda, loadLoteFazendaContextForUser } from "./animaisPorFazenda";
import { assertFazendaDoUsuario } from "./manejoContexto";

export type ConfirmarVendaItemInput = {
  animalId: number;
  pesoVenda?: number | null;
  precoUnitario: number;
};

export type ConfirmarVendaInput = {
  fazendaId: number;
  data: string;
  compradorId: number;
  formaPrecificacao: FormaPrecificacaoVenda;
  precoPadrao?: number | null;
  rendimentoCarcaca?: number | null;
  observacoes?: string | null;
  itens: ConfirmarVendaItemInput[];
  usuarioNome?: string | null;
};

function toTrpc(message: string, code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST"): never {
  throw new TRPCError({ code, message });
}

function isDuplicateKey(error: unknown): boolean {
  const item = error as { code?: string; errno?: number; message?: string };
  return (
    item?.code === "ER_DUP_ENTRY" ||
    item?.errno === 1062 ||
    String(item?.message ?? "").includes("venda_itens_venda_animal_uq") ||
    String(item?.message ?? "").includes("animal_baixas_animal_uq")
  );
}

function identificacao(animal: { brinco?: string | null; id: number }): string {
  const brinco = String(animal.brinco ?? "").trim();
  return brinco || `#${animal.id}`;
}

function insertIdOf(result: unknown): number {
  const asArray = result as { insertId?: number }[];
  const asObj = result as { insertId?: number };
  return Number(asArray?.[0]?.insertId ?? asObj?.insertId ?? 0);
}

function affectedRowsOf(result: unknown): number {
  const asArray = result as { affectedRows?: number }[];
  const asObj = result as { affectedRows?: number };
  return Number(asArray?.[0]?.affectedRows ?? asObj?.affectedRows ?? 0);
}

export async function confirmarVendaComercial(userId: number, input: ConfirmarVendaInput) {
  if (!input.fazendaId || input.fazendaId <= 0) toTrpc(MSG_VENDA_SEM_FAZENDA);
  if (!input.compradorId || input.compradorId <= 0) toTrpc(MSG_VENDA_SEM_COMPRADOR);
  if (!isFormaPrecificacaoVenda(input.formaPrecificacao)) toTrpc(MSG_VENDA_FORMA_INVALIDA);
  if (!(input.data ?? "").trim()) toTrpc(MSG_VENDA_SEM_DATA);
  const dataISO = normalizarDataOperacional(input.data);
  if (!dataISO) toTrpc(MSG_VENDA_DATA_INVALIDA);
  if (!input.itens?.length) toTrpc(MSG_VENDA_SEM_ITENS);

  const rendimentoParse = parseRendimentoCarcaca(input.rendimentoCarcaca);
  if (!rendimentoParse.ok) toTrpc(rendimentoParse.message);
  const rendimentoCarcaca = input.formaPrecificacao === "kg" ? rendimentoParse.valor : null;

  const animalIds = input.itens.map(i => i.animalId);
  const uniqueIds = new Set(animalIds);
  if (uniqueIds.size !== animalIds.length) toTrpc(MSG_VENDA_ANIMAL_DUPLICADO);

  const itensCalculados = input.itens.map(item => {
    const calc = calcularValorItem({
      forma: input.formaPrecificacao,
      pesoVenda: item.pesoVenda,
      precoUnitario: item.precoUnitario,
      rendimentoCarcaca,
    });
    if (!calc.ok) toTrpc(calc.message);
    return { ...item, valorItem: calc.valor };
  });
  const totais = resumirItensVenda(itensCalculados, { rendimentoCarcaca });

  await assertFazendaDoUsuario(userId, input.fazendaId);
  const { loteFazendaById } = await loadLoteFazendaContextForUser(userId);

  try {
    const result = await db.transaction(async tx => {
      const [fazenda] = await tx
        .select({ id: fazendas.id, nome: fazendas.nome })
        .from(fazendas)
        .where(and(eq(fazendas.userId, userId), eq(fazendas.id, input.fazendaId)))
        .limit(1);
      if (!fazenda) toTrpc(MSG_VENDA_SEM_FAZENDA, "NOT_FOUND");

      const [comprador] = await tx
        .select({ id: pessoas.id, nome: pessoas.nome, tipo: pessoas.tipo, ativo: pessoas.ativo })
        .from(pessoas)
        .where(and(eq(pessoas.userId, userId), eq(pessoas.id, input.compradorId)))
        .limit(1);
      if (!comprador || comprador.tipo !== "cliente" || comprador.ativo === false) {
        toTrpc(MSG_VENDA_SEM_COMPRADOR);
      }
      const compradorNome = comprador.nome.trim();

      const animaisRows = await tx
        .select({
          id: animais.id,
          brinco: animais.brinco,
          status: animais.status,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
        })
        .from(animais)
        .where(and(eq(animais.userId, userId), inArray(animais.id, animalIds)));

      const animalMap = new Map(animaisRows.map(a => [a.id, a]));
      const indisponiveis: string[] = [];
      const outraFazenda: string[] = [];
      for (const id of animalIds) {
        const animal = animalMap.get(id);
        if (!animal) {
          indisponiveis.push(`#${id}`);
          continue;
        }
        if (animal.status !== "ativo") indisponiveis.push(identificacao(animal));
        if (!animalPertenceFazenda(animal, input.fazendaId, loteFazendaById)) {
          outraFazenda.push(identificacao(animal));
        }
      }
      if (outraFazenda.length) {
        toTrpc(
          outraFazenda.length === 1
            ? MSG_VENDA_ANIMAL_OUTRA_FAZENDA
            : `${MSG_VENDA_ANIMAL_OUTRA_FAZENDA} (${outraFazenda.join(", ")})`,
        );
      }

      const baixas = await tx
        .select({ animalId: animalBaixas.animalId })
        .from(animalBaixas)
        .where(inArray(animalBaixas.animalId, animalIds));
      for (const baixa of baixas) {
        const animal = animalMap.get(baixa.animalId);
        indisponiveis.push(animal ? identificacao(animal) : `#${baixa.animalId}`);
      }
      if (indisponiveis.length) toTrpc(mensagemAnimaisIndisponiveis([...new Set(indisponiveis)]));

      const loteIds = [...new Set(animaisRows.map(a => a.loteId).filter((id): id is number => id != null))];
      const loteNomeMap = new Map<number, string>();
      if (loteIds.length) {
        const loteRows = await tx
          .select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(inArray(lotes.id, loteIds));
        loteRows.forEach(l => loteNomeMap.set(l.id, l.nome));
      }

      const insertVenda = await tx.insert(vendas).values({
        userId,
        fazendaId: input.fazendaId,
        compradorId: input.compradorId,
        comprador: compradorNome,
        data: dataISO,
        formaPrecificacao: input.formaPrecificacao,
        precoPadrao: input.precoPadrao != null ? String(input.precoPadrao) : null,
        rendimentoCarcaca: rendimentoCarcaca != null ? String(rendimentoCarcaca) : null,
        quantidadeAnimais: totais.quantidade,
        pesoTotal: totais.pesoTotal != null ? String(totais.pesoTotal) : null,
        valorTotal: String(totais.valorTotal),
        observacoes: input.observacoes?.trim() || null,
        status: "concluido",
      });
      const vendaId = insertIdOf(insertVenda);
      if (!vendaId) toTrpc("Não foi possível gravar a venda.");

      await tx.insert(vendaItens).values(
        itensCalculados.map(item => {
          const animal = animalMap.get(item.animalId)!;
          return {
            userId,
            vendaId,
            animalId: item.animalId,
            brincoSnapshot: animal.brinco?.trim() || null,
            loteNomeSnapshot: animal.loteId ? loteNomeMap.get(animal.loteId) ?? null : null,
            pesoVenda: item.pesoVenda != null ? String(item.pesoVenda) : null,
            formaPrecificacao: input.formaPrecificacao,
            precoUnitario: String(item.precoUnitario),
            valorItem: String(item.valorItem),
          };
        }),
      );

      await tx.insert(animalBaixas).values(
        animalIds.map(animalId => ({
          userId,
          animalId,
          fazendaId: input.fazendaId,
          tipo: "venda" as const,
          dataBaixa: dataISO,
          destino: compradorNome,
          motivo: `Venda #${vendaId}`,
          observacoes: null,
          usuarioNome: input.usuarioNome?.trim() || null,
        })),
      );

      const atualizados = await tx
        .update(animais)
        .set({ status: "vendido" })
        .where(
          and(
            eq(animais.userId, userId),
            inArray(animais.id, animalIds),
            eq(animais.status, "ativo"),
          ),
        );
      if (affectedRowsOf(atualizados) !== animalIds.length) {
        toTrpc(mensagemAnimaisIndisponiveis(animalIds.map(id => {
          const animal = animalMap.get(id);
          return animal ? identificacao(animal) : `#${id}`;
        })));
      }

      return { vendaId, quantidade: totais.quantidade, valorTotal: totais.valorTotal };
    });

    return { success: true as const, ...result };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (isDuplicateKey(error)) toTrpc(MSG_VENDA_ANIMAL_INDISPONIVEL);
    console.error("[venda.confirmar]", error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível confirmar a venda.",
    });
  }
}
