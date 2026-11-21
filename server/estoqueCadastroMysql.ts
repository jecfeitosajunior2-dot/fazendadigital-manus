import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { isMysqlDuplicateKey } from "../shared/compraInsumos";
import { produtoControlaSaldo } from "../shared/estoqueControle";
import { estoque, estoqueMovimentacoes, fazendas, produtosCatalogo } from "../drizzle/schema";
import { db } from "./db";
import {
  MSG_SEM_FAZENDA_ESTOQUE,
  MSG_SEM_PERMISSAO_EDITAR_ESTOQUE,
  MSG_SEM_PERMISSAO_INATIVAR_ESTOQUE,
  MSG_SEM_PERMISSAO_MOVIMENTO_ESTOQUE,
  PERMISSAO_EDITAR_ESTOQUE,
  PERMISSAO_INATIVAR_ESTOQUE,
  PERMISSAO_MOVIMENTAR_ESTOQUE,
  autorizarEstoqueNaFazenda,
  erroEstoque,
  recusarEstoqueSemMysql,
} from "./consultaEstoqueAutorizada";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import {
  INDICE_CHAVE_MOVIMENTO,
  conferirChaveReenviada,
  hashSaldoInicial,
  indiceChaveConfiavel,
  linhaChave,
  recusarSemTabelaChave,
} from "./estoqueChaveMovimento";
import {
  configParaFazenda,
  resolverFazendaIds,
  toCatalogoInsertValues,
  toEstoqueInsertValues,
  toEstoqueSyncFromCatalogo,
  type EstoqueMutationInput,
} from "./estoqueDb";
import { criarMovimentacaoEstoqueNoTx, type MovimentacaoEstoqueInsert } from "./estoqueMovimentacaoTx";
import { isDatabaseUnavailable } from "./localFallbackStore";
import { sql } from "drizzle-orm";

type Sessao = {
  id: number;
  sessionVersion?: number | null;
  name?: string | null;
  email?: string | null;
};

function ioDaTransacao(tx: Parameters<typeof consultaEstoqueNaTransacao>[0]) {
  return {
    emTransacao: (fn: (consulta: ReturnType<typeof consultaEstoqueNaTransacao>) => Promise<unknown>) =>
      fn(consultaEstoqueNaTransacao(tx)),
  };
}

async function autorizarFazendas(
  tx: Parameters<typeof consultaEstoqueNaTransacao>[0],
  usuario: Sessao,
  fazendaIds: number[],
  permissaoId: string,
  semPermissao: string,
) {
  let titular = 0;
  for (const fazendaId of [...new Set(fazendaIds)].sort((a, b) => a - b)) {
    const acesso = await autorizarEstoqueNaFazenda(ioDaTransacao(tx) as never, {
      executorId: usuario.id,
      sessionVersionDaSessao: usuario.sessionVersion ?? null,
      fazendaId,
      permissaoId,
    }, semPermissao);
    if (!acesso.ok) throw erroEstoque(acesso, semPermissao);
    if (!titular) titular = acesso.titularUserId;
    else if (titular !== acesso.titularUserId) throw erroEstoque({ ok: false, motivo: "sem_fazenda" });
  }
  return titular;
}

async function fazendaDoTitular(
  tx: Parameters<typeof consultaEstoqueNaTransacao>[0],
  fazendaId: number,
  titularUserId: number,
) {
  const [fazenda] = await tx.select({ id: fazendas.id, userId: fazendas.userId }).from(fazendas)
    .where(eq(fazendas.id, fazendaId)).limit(1);
  if (!fazenda || fazenda.userId !== titularUserId) {
    throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_ESTOQUE });
  }
}

function executorMovimento(tx: Parameters<typeof consultaEstoqueNaTransacao>[0]) {
  return {
    async findEstoque(id: number) {
      const [item] = await tx.select().from(estoque).where(eq(estoque.id, id)).for("update");
      if (!item) return null;
      return {
        id: item.id,
        fazendaId: item.fazendaId ?? null,
        quantidade: item.quantidade,
        controlarSaldo: item.controlarSaldo ?? null,
        valorUnitario: item.valorUnitario,
        valorTotalEstoque: item.valorTotalEstoque,
        capitalInicializadoEm: item.capitalInicializadoEm,
        nome: item.nome,
        situacao: item.situacao,
      };
    },
    async insertMovimentacao(values: MovimentacaoEstoqueInsert) {
      const inserido = await tx.insert(estoqueMovimentacoes).values(values as typeof estoqueMovimentacoes.$inferInsert);
      return Number((inserido as { insertId?: number }[])[0]?.insertId ?? 0);
    },
    async updateEstoque(id: number, patch: { quantidade: string; valorUnitario?: string; valorTotalEstoque?: string }) {
      await tx.update(estoque).set(patch).where(eq(estoque.id, id));
    },
  };
}

export async function cadastrarProdutoEstoque(usuario: Sessao, input: EstoqueMutationInput & { chave?: string }) {
  const fazendaIds = resolverFazendaIds(input).sort((a, b) => a - b);
  if (fazendaIds.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione pelo menos uma fazenda para usar este produto." });
  }
  const qtdInicial = Number(String(input.quantidade ?? "0").replace(",", "."));
  const temSaldoInicial = Number.isFinite(qtdInicial) && qtdInicial > 0;
  if (temSaldoInicial && (!input.chave || input.chave.length < 8)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe a chave da operação para gravar o saldo inicial." });
  }
  const registradoPor = usuario.name?.trim() || usuario.email?.trim() || "";
  if (!usuario.id || !registradoPor) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }

  try {
    return await db.transaction(async (tx) => {
      const titular = await autorizarFazendas(tx, usuario, fazendaIds, PERMISSAO_MOVIMENTAR_ESTOQUE, MSG_SEM_PERMISSAO_MOVIMENTO_ESTOQUE);
      const hash = temSaldoInicial
        ? hashSaldoInicial({
          titularUserId: titular,
          fazendaId: fazendaIds[0]!,
          nome: input.nome,
          quantidade: String(qtdInicial),
          valor: input.valorUnitario ?? "",
        })
        : "";
      if (temSaldoInicial && input.chave) {
        const indice = await tx.execute(sql`
          SELECT COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'estoque_movimentacao_chaves'
            AND INDEX_NAME = ${INDICE_CHAVE_MOVIMENTO}
          ORDER BY SEQ_IN_INDEX
        `);
        if (!indiceChaveConfiavel(indice)) recusarSemTabelaChave();
        const achada = linhaChave(await tx.execute(sql`
          SELECT conteudo_hash AS conteudoHash, movimentacao_id AS movimentacaoId,
                 estoque_id AS estoqueId, grupo_id AS grupoId
          FROM estoque_movimentacao_chaves
          WHERE titular_user_id = ${titular} AND chave = ${input.chave}
          FOR UPDATE
        `));
        if (achada) {
          conferirChaveReenviada(achada, hash);
          const [produto] = await tx.select({ produtoId: estoque.produtoId }).from(estoque).where(eq(estoque.id, achada.estoqueId)).limit(1);
          return { success: true as const, id: achada.estoqueId, produtoId: produto?.produtoId ?? achada.estoqueId, idempotente: true as const };
        }
      }

      const catalogoResult = await tx.insert(produtosCatalogo).values(toCatalogoInsertValues(input));
      const produtoId = Number((catalogoResult as { insertId?: number }[])[0]?.insertId);
      if (!produtoId) throw new Error("Falha ao criar produto no catálogo.");

      let firstEstoqueId: number | null = null;
      for (const fazendaId of fazendaIds) {
        const cfg = configParaFazenda(input, fazendaId);
        const controla = produtoControlaSaldo(cfg.controlarSaldo);
        const quantidadeLinha = fazendaId === fazendaIds[0] && temSaldoInicial && controla
          ? "0"
          : (fazendaId === fazendaIds[0] ? input.quantidade ?? "0" : "0");
        const result = await tx.insert(estoque).values(toEstoqueInsertValues({
          ...input,
          produtoId,
          fazendaId,
          produzidoNaFazenda: cfg.produzidoNaFazenda,
          controlarSaldo: cfg.controlarSaldo,
          monitorarEstoque: cfg.monitorarEstoque,
          quantidadeMinima: cfg.quantidadeMinima ?? undefined,
          quantidadeMaxima: cfg.quantidadeMaxima ?? undefined,
          quantidade: quantidadeLinha,
        }));
        const estoqueId = Number((result as { insertId?: number }[])[0]?.insertId);
        if (!firstEstoqueId && estoqueId) firstEstoqueId = estoqueId;
        if (fazendaId === fazendaIds[0] && temSaldoInicial && estoqueId) {
          const criado = await criarMovimentacaoEstoqueNoTx(executorMovimento(tx), {
            estoqueId,
            fazendaId,
            tipo: "entrada",
            dataMovimentacao: new Date().toISOString().slice(0, 10),
            quantidade: String(qtdInicial),
            valor: input.valorUnitario,
            manejo: "saldo_inicial",
            observacoes: input.observacoes || "Saldo inicial do cadastro",
            userId: usuario.id,
            registradoPor,
          });
          await tx.execute(sql`
            INSERT INTO estoque_movimentacao_chaves
              (titular_user_id, chave, conteudo_hash, estoque_id, fazenda_id, tipo, quantidade, movimentacao_id, grupo_id)
            VALUES
              (${titular}, ${input.chave}, ${hash}, ${estoqueId}, ${fazendaId}, 'saldo_inicial', ${qtdInicial}, ${criado.id}, ${criado.grupoId})
          `);
        }
      }
      return { success: true as const, id: firstEstoqueId ?? produtoId, produtoId };
    });
  } catch (error) {
    if (!(error instanceof TRPCError) && isMysqlDuplicateKey(error) && input.chave && temSaldoInicial) {
      const bruto = await db.execute(sql`
        SELECT c.conteudo_hash AS conteudoHash, c.movimentacao_id AS movimentacaoId,
               c.estoque_id AS estoqueId, c.grupo_id AS grupoId, c.titular_user_id AS titular,
               e.produto_id AS produtoId
        FROM estoque_movimentacao_chaves c
        INNER JOIN users u ON u.titularUserId = c.titular_user_id
        LEFT JOIN estoque e ON e.id = c.estoque_id
        WHERE u.id = ${usuario.id} AND c.chave = ${input.chave}
        LIMIT 1
      `);
      const pacote = Array.isArray(bruto) && Array.isArray(bruto[0]) ? bruto[0] : bruto;
      const linha = Array.isArray(pacote) ? pacote[0] as Record<string, unknown> | undefined : undefined;
      const achada = linhaChave(bruto);
      if (achada && linha) {
        conferirChaveReenviada(achada, hashSaldoInicial({
          titularUserId: Number(linha.titular),
          fazendaId: fazendaIds[0]!,
          nome: input.nome,
          quantidade: String(qtdInicial),
          valor: input.valorUnitario ?? "",
        }));
        return {
          success: true as const,
          id: achada.estoqueId,
          produtoId: Number(linha.produtoId ?? achada.estoqueId),
          idempotente: true as const,
        };
      }
    }
    if (error instanceof TRPCError) throw error;
    recusarSeDeadlockEstoque(error);
    if (isDatabaseUnavailable(error)) recusarEstoqueSemMysql();
    throw error;
  }
}

export async function editarProdutoEstoque(usuario: Sessao, input: EstoqueMutationInput & { id: number }) {
  try {
    return await db.transaction(async (tx) => {
      const [previo] = await tx.select().from(estoque).where(eq(estoque.id, input.id)).limit(1);
      if (!previo?.fazendaId) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
      const titular = await autorizarFazendas(tx, usuario, [previo.fazendaId], PERMISSAO_EDITAR_ESTOQUE, MSG_SEM_PERMISSAO_EDITAR_ESTOQUE);
      await fazendaDoTitular(tx, previo.fazendaId, titular);
      const irmaos = previo.produtoId
        ? await tx.select().from(estoque).where(eq(estoque.produtoId, previo.produtoId))
        : [previo];
      const fazendasIrmaos: number[] = [];
      for (const irmao of irmaos) {
        if (!irmao.fazendaId) continue;
        const [fazenda] = await tx.select({ userId: fazendas.userId }).from(fazendas).where(eq(fazendas.id, irmao.fazendaId)).limit(1);
        if (!fazenda || fazenda.userId !== titular) {
          throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_ESTOQUE });
        }
        fazendasIrmaos.push(irmao.fazendaId);
      }
      await autorizarFazendas(tx, usuario, fazendasIrmaos, PERMISSAO_EDITAR_ESTOQUE, MSG_SEM_PERMISSAO_EDITAR_ESTOQUE);
      const ids = [...new Set(irmaos.map((item) => item.id))].sort((a, b) => a - b);
      for (const id of ids) {
        await tx.select({ id: estoque.id }).from(estoque).where(eq(estoque.id, id)).for("update");
      }
      const [catalogoAtual] = previo.produtoId
        ? await tx.select().from(produtosCatalogo).where(eq(produtosCatalogo.id, previo.produtoId)).for("update").limit(1)
        : [];
      const catalogoValues = toCatalogoInsertValues(input);
      if (previo.produtoId) {
        await tx.update(produtosCatalogo).set({
          ...catalogoValues,
          situacao: catalogoAtual?.situacao ?? catalogoValues.situacao,
        }).where(eq(produtosCatalogo.id, previo.produtoId));
      }
      const sync = toEstoqueSyncFromCatalogo({
        ...catalogoValues,
        situacao: catalogoAtual?.situacao ?? "ativo",
      });
      for (const irmao of irmaos) {
        const cfg = configParaFazenda(input, irmao.fazendaId ?? 0, {
          produzidoNaFazenda: !!irmao.produzidoNaFazenda,
          controlarSaldo: irmao.controlarSaldo ?? true,
          monitorarEstoque: !!irmao.monitorarEstoque,
          quantidadeMinima: irmao.quantidadeMinima != null ? String(irmao.quantidadeMinima) : null,
          quantidadeMaxima: irmao.quantidadeMaxima != null ? String(irmao.quantidadeMaxima) : null,
        });
        await tx.update(estoque).set({
          ...sync,
          produzidoNaFazenda: irmao.id === input.id ? cfg.produzidoNaFazenda : irmao.produzidoNaFazenda,
          controlarSaldo: irmao.id === input.id ? cfg.controlarSaldo : irmao.controlarSaldo,
          monitorarEstoque: irmao.id === input.id ? cfg.monitorarEstoque : irmao.monitorarEstoque,
          quantidadeMinima: irmao.id === input.id ? (cfg.quantidadeMinima ?? "0") : irmao.quantidadeMinima,
          quantidadeMaxima: irmao.id === input.id ? cfg.quantidadeMaxima : irmao.quantidadeMaxima,
          localizacao: irmao.id === input.id ? (input.localizacao ?? irmao.localizacao) : irmao.localizacao,
        }).where(eq(estoque.id, irmao.id));
      }
      return { success: true as const, produtoId: previo.produtoId ?? undefined };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    recusarSeDeadlockEstoque(error);
    if (isDatabaseUnavailable(error)) recusarEstoqueSemMysql();
    throw error;
  }
}

export async function vincularProdutoNaFazenda(usuario: Sessao, input: {
  produtoId: number;
  fazendaId: number;
  produzidoNaFazenda?: boolean;
  controlarSaldo?: boolean;
  monitorarEstoque?: boolean;
  quantidadeMinima?: string;
  quantidadeMaxima?: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const titular = await autorizarFazendas(tx, usuario, [input.fazendaId], PERMISSAO_EDITAR_ESTOQUE, MSG_SEM_PERMISSAO_EDITAR_ESTOQUE);
      await fazendaDoTitular(tx, input.fazendaId, titular);
      const [catalogo] = await tx.select().from(produtosCatalogo).where(eq(produtosCatalogo.id, input.produtoId)).limit(1);
      if (!catalogo) throw new TRPCError({ code: "NOT_FOUND", message: "Produto do catálogo não encontrado." });
      const irmaos = await tx.select({
        id: estoque.id,
        fazendaId: estoque.fazendaId,
        dono: fazendas.userId,
      }).from(estoque).innerJoin(fazendas, eq(fazendas.id, estoque.fazendaId)).where(eq(estoque.produtoId, input.produtoId));
      if (irmaos.length === 0 || irmaos.some((item) => item.dono !== titular)) {
        throw new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_ESTOQUE });
      }
      const [existente] = await tx.select().from(estoque).where(and(
        eq(estoque.produtoId, input.produtoId),
        eq(estoque.fazendaId, input.fazendaId),
      )).for("update").limit(1);
      if (existente) {
        await tx.update(estoque).set({
          produzidoNaFazenda: input.produzidoNaFazenda ?? existente.produzidoNaFazenda,
          controlarSaldo: input.controlarSaldo ?? existente.controlarSaldo,
          monitorarEstoque: input.monitorarEstoque ?? existente.monitorarEstoque,
          quantidadeMinima: input.quantidadeMinima ?? existente.quantidadeMinima,
          quantidadeMaxima: input.quantidadeMaxima ?? existente.quantidadeMaxima,
        }).where(eq(estoque.id, existente.id));
        return { success: true as const, id: existente.id, alreadyLinked: true as const };
      }
      const base = irmaos.map((item) => item.id).sort((a, b) => a - b)[0]!;
      const [origem] = await tx.select().from(estoque).where(eq(estoque.id, base)).limit(1);
      const result = await tx.insert(estoque).values(toEstoqueInsertValues({
        produtoId: input.produtoId,
        fazendaId: input.fazendaId,
        nome: origem?.nome ?? catalogo.nome,
        categoria: catalogo.categoria ?? "",
        subcategoria: catalogo.subcategoria ?? "",
        unidade: catalogo.unidade ?? "",
        monitorarEstoque: input.monitorarEstoque ?? false,
        controlarSaldo: input.controlarSaldo,
        situacao: (origem?.situacao as "ativo" | "inativo" | undefined) ?? "ativo",
        quantidadeMinima: input.quantidadeMinima,
        quantidadeMaxima: input.quantidadeMaxima,
        fabricante: catalogo.fabricante ?? undefined,
        identificadorUnico: catalogo.identificadorUnico ?? undefined,
        produzidoNaFazenda: input.produzidoNaFazenda ?? false,
        possuiCarencia: catalogo.possuiCarencia ?? false,
        carenciaAbateDias: catalogo.carenciaAbateDias,
        carenciaAbateUnidade: (catalogo.carenciaAbateUnidade as "d" | "h" | null) ?? "d",
        carenciaLeiteDias: catalogo.carenciaLeiteDias,
        observacoesCarencia: catalogo.observacoesCarencia,
        observacoes: catalogo.observacoes ?? undefined,
        quantidade: "0",
      }));
      return { success: true as const, id: Number((result as { insertId?: number }[])[0]?.insertId), alreadyLinked: false as const };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    recusarSeDeadlockEstoque(error);
    if (isDatabaseUnavailable(error)) recusarEstoqueSemMysql();
    throw error;
  }
}

export async function mudarSituacaoProdutos(
  usuario: Sessao,
  input: { ids: number[]; escopo: "fazenda" | "catalogo" },
  situacao: "ativo" | "inativo",
) {
  try {
    return await db.transaction(async (tx) => {
      const idsPedidos = [...new Set(input.ids)].sort((a, b) => a - b);
      const previos = [];
      for (const id of idsPedidos) {
        const [row] = await tx.select().from(estoque).where(eq(estoque.id, id)).limit(1);
        if (!row?.fazendaId) throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado." });
        previos.push(row);
      }
      const titular = await autorizarFazendas(
        tx,
        usuario,
        previos.map((row) => row.fazendaId!),
        PERMISSAO_INATIVAR_ESTOQUE,
        MSG_SEM_PERMISSAO_INATIVAR_ESTOQUE,
      );
      let alvos = previos;
      if (input.escopo === "catalogo") {
        const produtoIds = [...new Set(previos.map((row) => row.produtoId).filter((id): id is number => !!id))].sort((a, b) => a - b);
        const extras = produtoIds.length
          ? await tx.select().from(estoque).where(inArray(estoque.produtoId, produtoIds))
          : [];
        for (const extra of extras) {
          if (!extra.fazendaId) continue;
          await fazendaDoTitular(tx, extra.fazendaId, titular);
        }
        await autorizarFazendas(
          tx,
          usuario,
          extras.map((row) => row.fazendaId!).filter((id) => id > 0),
          PERMISSAO_INATIVAR_ESTOQUE,
          MSG_SEM_PERMISSAO_INATIVAR_ESTOQUE,
        );
        alvos = extras.length ? extras : previos;
        if (produtoIds.length) {
          await tx.update(produtosCatalogo).set({ situacao }).where(inArray(produtosCatalogo.id, produtoIds));
        }
      }
      const ids = [...new Set(alvos.map((row) => row.id))].sort((a, b) => a - b);
      for (const id of ids) {
        await tx.select({ id: estoque.id }).from(estoque).where(eq(estoque.id, id)).for("update");
      }
      await tx.update(estoque).set({ situacao }).where(inArray(estoque.id, ids));
      return { success: true as const, count: ids.length, escopo: input.escopo };
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    recusarSeDeadlockEstoque(error);
    if (isDatabaseUnavailable(error)) recusarEstoqueSemMysql();
    throw error;
  }
}
