import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { db } from "./db";
import {
  users, animais, lotes, saudeRegistros, reproducaoRegistros,
  maquinas, abastecimentos, manutencoes, manutencaoPecas, pesagens, batidas,
  benfeitorias, estoque, estoqueMovimentacoes, contasFinanceiras, movimentacoes,
  compras, vendas, fazendas, pastos, lotePastoMovimentacoes, animalLoteMovimentacoes,
  historicoBrincos, produtosCatalogo, pessoas
} from "../drizzle/schema";
import { eq, desc, and, sql, isNull, isNotNull, inArray, gte, lte, or, like } from "drizzle-orm";
import { createSession, clearAuthCookie, setAuthCookie } from "./_core/cookies";
import { env } from "./_core/env";
import { resolveImageSlots } from "./_core/storage";
import { formatImportDbError } from "./importacaoErrors";
import { toBenfeitoriaRow, toBenfeitoriaUpdateRow } from "./benfeitoriasDb";
import { rebanhoOverviewRouter } from "./routers/rebanhoOverview";
import {
  importarCoordenadasPastos,
  importarCoordenadasPastosLocal,
} from "./importarCoordenadasPastos";
import {
  syncSaidaAbastecimento,
  estornarSaidaAbastecimento,
  syncSaidaAbastecimentoLocal,
  estornarSaidaAbastecimentoLocal,
  MSG_MOV_VINCULADA_EDITAR,
  MSG_MOV_VINCULADA_EXCLUIR,
  MOTIVO_ESTORNO_ABASTECIMENTO,
  MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
} from "./abastecimentoEstoqueSync";
import { avaliarEstornoEstoque, isEstornoBusinessError, montarMotivoEstorno } from "./estoqueEstorno";
import {
  calcularCustoMedioPonderado,
  formatCustoMedio,
  parseCustoMedio,
} from "./custoMedioEstoque";
import { filterAnimaisPorFazenda, loadLoteFazendaContextForUser, animalCompativelComFazendaLote, buildPastoFazendaMap, resolveAnimalLocalizacaoFromLote } from "./animaisPorFazenda";
import {
  createLocalFazenda,
  createLocalPasto,
  createLocalBenfeitoria,
  createLocalMaquina,
  createLocalAbastecimento,
  createLocalManutencao,
  createLocalAnimal,
  deleteLocalFazenda,
  deleteLocalPasto,
  deleteLocalBenfeitoria,
  deleteLocalMaquina,
  deleteLocalAbastecimento,
  deleteLocalManutencao,
  deleteLocalAnimal,
  getLocalFazenda,
  getLocalBenfeitoria,
  getLocalMaquina,
  getLocalAbastecimento,
  getLocalManutencao,
  getLocalAnimal,
  isDatabaseUnavailable,
  listLocalFazendas,
  listLocalPastos,
  listLocalPastosByFazenda,
  listLocalBenfeitorias,
  listLocalMaquinas,
  listLocalAbastecimentos,
  listLocalManutencoes,
  listLocalAnimais,
  listLocalAnimaisEnriched,
  listLocalLotes,
  listLocalLotesGerenciamento,
  listLocalPesagens,
  createLocalLote,
  getLocalLote,
  moveLocalLoteToPasto,
  updateLocalLote,
  excluirLocalLote,
  incluirAnimaisLocalLote,
  movimentarAnimaisLocalLote,
  createLocalPesagem,
  deleteLocalPesagem,
  listLocalSaudeRegistros,
  createLocalSaudeRegistro,
  deleteLocalSaudeRegistro,
  listLocalReproducaoRegistros,
  createLocalReproducaoRegistro,
  updateLocalReproducaoRegistro,
  deleteLocalReproducaoRegistro,
  enrichLocalLote,
  updateLocalFazenda,
  updateLocalPasto,
  updateLocalBenfeitoria,
  updateLocalMaquina,
  updateLocalAbastecimento,
  updateLocalManutencao,
  updateLocalAnimal,
  enrichLocalAnimal,
  listLocalHistoricoBrincos,
  createLocalHistoricoBrinco,
  deleteLocalHistoricoBrinco,
  mergeHistoricoBrincosLists,
  buildLocalMapaRebanhoV2,
  buildLocalMapaRebanhoGeral,
  listLocalMapaRebanhoHistorico,
  excluirLocalLotePastoMovimentacao,
  cancelarLocalEstadiaSinteticaLote,
  listLocalHistoricoPastosAnimal,
} from "./localFallbackStore";
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from "../shared/carenciaAnimal";
import {
  isDescricaoServicoValida,
  MSG_DESCRICAO_SERVICO_OBRIGATORIA,
  normalizeDescricaoServico,
} from "@shared/manutencaoDescricao";
import {
  mensagemExclusaoLoteBloqueada,
  mensagemInativacaoLoteSucesso,
  mensagemLotePossuiHistorico,
} from "../shared/loteExclusaoBloqueada";
import { buildHistoricoSubdivisaoAnimal } from "../shared/historicoSubdivisaoAnimal";
import {
  agruparLotesPorLocalizacaoVigente,
  movimentacaoExibivelHistorico,
  resolverLocalizacaoAtualLote,
  type MovimentacaoPastoLoteRef,
} from "../shared/localizacaoAtualLote";
import {
  avaliarExclusaoLote,
  executarExclusaoLote,
  executarInativacaoLote,
} from "./loteExclusaoCheck";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import { tryDevLoginFallback } from "./_core/devLoginFallback";
import { devLocalStore } from "./devLocalStore";
import {
  configParaFazenda,
  resolverFazendaIds,
  toCatalogoInsertValues,
  toEstoqueInsertValues,
  toEstoqueSyncFromCatalogo,
} from "./estoqueDb";
import {
  assertBrincoUnicoEntreAtivos,
  assertBrincoUnicoEntreAtivosDb,
  loadActiveBrincoKeysFromDb,
  loadActiveBrincoKeysLocal,
} from "./brincoAtivoValidation";
import {
  resolveEffectiveStatus,
  validarBrincoAtivoImportacao,
} from "../shared/brincoAtivo";
import {
  assertFazendaDoUsuario,
  assertLoteNaFazenda,
  assertAnimalNaFazenda,
  assertRfidUnicoEntreAtivos,
} from "./manejoContexto";
import { normalizeBrincoKey } from "../shared/brincoAtivo";

const imageSlotInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("keep"), path: z.string() }),
  z.object({ type: z.literal("new"), data: z.string(), mimeType: z.string() }),
]);

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    try {
      const [freshUser] = await db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
      if (!freshUser) return ctx.user;
      return {
        id: freshUser.id,
        openId: freshUser.openId,
        name: freshUser.name,
        email: freshUser.email || "",
        role: freshUser.role || "user",
      };
    } catch (error) {
      if (isDatabaseUnavailable(error)) return ctx.user;
      throw error;
    }
  }),

  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
      // Support login by email OR by openId
      const { or } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(
        or(eq(users.openId, input.username), eq(users.email, input.username))
      ).limit(1);
      if (!user) throw new Error("Usuário não encontrado");
      // Check password: use passwordHash if available, otherwise fallback to admin123
      let valid = false;
      if (user.passwordHash) {
        valid = await bcrypt.compare(input.password, user.passwordHash);
      } else {
        valid = input.password === "admin123";
      }
      if (!valid) throw new Error("Senha incorreta");
      const token = await createSession({ id: user.id, openId: user.openId, name: user.name, email: user.email || "", role: user.role || "user" });
      setAuthCookie(ctx.res, token);
      return { success: true, user: { id: user.id, openId: user.openId, name: user.name, email: user.email, role: user.role } };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const fallback = await tryDevLoginFallback(input.username, input.password, ctx.res);
        if (!fallback) {
          throw new Error("Banco de dados indisponível. Tente novamente em instantes.");
        }
        return fallback;
      }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    clearAuthCookie(ctx.res);
    return { success: true };
  }),
});

// ─── ANIMAIS ROUTER ───────────────────────────────────────────────────────────
const animaisListInput = z.object({
  fazendaId: z.number().optional(),
  raca: z.string().optional(),
  search: z.string().optional(),
  sexo: z.string().optional(),
  categoria: z.string().optional(),
  loteId: z.number().optional(),
  pesoMin: z.number().optional(),
  pesoMax: z.number().optional(),
  dataNascimentoInicio: z.string().optional(),
  dataNascimentoFim: z.string().optional(),
  somenteSisbov: z.boolean().optional(),
  marcadores: z.array(z.string()).optional(),
  status: z.string().optional(),
  pastoId: z.number().optional(),
  brincoEletronico: z.string().optional(),
  rgn: z.string().optional(),
  rgd: z.string().optional(),
  idadeMesesMin: z.number().optional(),
  idadeMesesMax: z.number().optional(),
  semDataNascimento: z.boolean().optional(),
  dataEntradaDe: z.string().optional(),
  dataEntradaAte: z.string().optional(),
  apenasEmCarencia: z.boolean().optional(),
  apenasSemLote: z.boolean().optional(),
  apenasSemPesagem: z.boolean().optional(),
}).optional();

function buildAnimalInsertRow(userId: number, input: {
  brinco?: string;
  brincoEletronico?: string;
  nome?: string;
  raca?: string;
  sexo: "macho" | "femea";
  dataNascimento?: string | null;
  pesoAtual?: string;
  loteId?: number;
  categoria?: string;
  observacoes?: string;
  pelagem?: string;
  marca?: string;
  dataDesmama?: string | null;
  castrado?: boolean;
  dataEntrada?: string | null;
  pesoEntrada?: string;
  produtorOrigem?: string;
  precoKg?: string;
  frete?: string;
  sisbov?: string;
  dataRnd?: string | null;
  rgn?: string;
  rgd?: string;
  rastreadoNascimento?: boolean;
  pai?: string;
  mae?: string;
  fazendaId?: number;
  pastoId?: number;
}) {
  return {
    userId,
    brinco: input.brinco,
    brincoEletronico: input.brincoEletronico,
    nome: input.nome,
    raca: input.raca,
    sexo: input.sexo,
    dataNascimento: input.dataNascimento || undefined,
    pesoAtual: input.pesoAtual,
    loteId: input.loteId,
    categoria: input.categoria,
    observacoes: input.observacoes,
    pelagem: input.pelagem,
    marca: input.marca,
    dataDesmama: input.dataDesmama || undefined,
    castrado: input.castrado,
    dataEntrada: input.dataEntrada || undefined,
    pesoEntrada: input.pesoEntrada,
    produtorOrigem: input.produtorOrigem,
    precoKg: input.precoKg,
    frete: input.frete,
    sisbov: input.sisbov,
    dataRnd: input.dataRnd || undefined,
    rgn: input.rgn,
    rgd: input.rgd,
    rastreadoNascimento: input.rastreadoNascimento,
    pai: input.pai,
    mae: input.mae,
    fazendaId: input.fazendaId,
    pastoId: input.pastoId,
  };
}

/** Usa o espelho local quando existir — evita listas de seed antigas do MySQL no modelo/validação. */
async function loadFazendasUsuarioParaOperacao(userId: number): Promise<Array<{ id: number; nome: string }>> {
  const localFazendas = await listLocalFazendas(userId);
  if (localFazendas.length > 0) {
    return localFazendas
      .map(f => ({ id: f.id, nome: String(f.nome || "").trim() }))
      .filter(f => f.nome);
  }
  try {
    const rows = await db
      .select({ id: fazendas.id, nome: fazendas.nome })
      .from(fazendas)
      .where(eq(fazendas.userId, userId));
    return rows
      .map(f => ({ id: f.id, nome: String(f.nome || "").trim() }))
      .filter(f => f.nome);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return [];
    throw error;
  }
}

async function loadPastosUsuarioParaOperacao(
  userId: number,
): Promise<Array<{ id: number; nome: string; fazendaId: number | null }>> {
  const localFazendas = await listLocalFazendas(userId);
  const usarLocal = localFazendas.length > 0;
  if (usarLocal) {
    const localPastos = await listLocalPastos(userId);
    return localPastos
      .map(p => ({ id: p.id, nome: String(p.nome || "").trim(), fazendaId: p.fazendaId ?? null }))
      .filter(p => p.nome);
  }
  try {
    const rows = await db
      .select({ id: pastos.id, nome: pastos.nome, fazendaId: pastos.fazendaId })
      .from(pastos)
      .where(eq(pastos.userId, userId));
    return rows
      .map(p => ({ id: p.id, nome: String(p.nome || "").trim(), fazendaId: p.fazendaId ?? null }))
      .filter(p => p.nome);
  } catch (error) {
    if (isDatabaseUnavailable(error)) return [];
    throw error;
  }
}

async function loadDadosDropdownModeloAnimais(userId: number): Promise<{
  nomesFazendas: string[];
  nomesLotes: string[];
  pastosPorFazendaNome: Map<string, string[]>;
}> {
  const fazendasUsuario = await loadFazendasUsuarioParaOperacao(userId);
  const pastosUsuario = await loadPastosUsuarioParaOperacao(userId);

  const nomesFazendas = fazendasUsuario.map(f => f.nome);
  const pastosPorFazendaNome = new Map<string, string[]>();
  for (const f of fazendasUsuario) {
    pastosPorFazendaNome.set(
      f.nome,
      pastosUsuario
        .filter(p => p.fazendaId === f.id)
        .map(p => p.nome),
    );
  }

  let nomesLotes: string[] = [];
  try {
    const lotesAtivos = await db
      .select({ nome: lotes.nome })
      .from(lotes)
      .where(and(eq(lotes.userId, userId), eq(lotes.ativo, true)));
    nomesLotes = lotesAtivos.map(l => String(l.nome || "").trim()).filter(Boolean);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }

  return { nomesFazendas, nomesLotes, pastosPorFazendaNome };
}

async function loadLotesUsuarioParaOperacao(userId: number): Promise<{
  loteNomeParaId: Map<string, number>;
  loteInativoSet: Set<string>;
}> {
  try {
    const lotesUsuario = await db
      .select({ id: lotes.id, nome: lotes.nome, ativo: lotes.ativo })
      .from(lotes)
      .where(and(eq(lotes.userId, userId), eq(lotes.ativo, true)));
    const todosLotes = await db
      .select({ id: lotes.id, nome: lotes.nome, ativo: lotes.ativo })
      .from(lotes)
      .where(eq(lotes.userId, userId));

    const loteNomeParaId = new Map(
      lotesUsuario.map(l => [String(l.nome || '').toLowerCase().trim(), l.id]),
    );
    const loteInativoSet = new Set(
      todosLotes
        .filter(l => !l.ativo)
        .map(l => String(l.nome || '').toLowerCase().trim())
        .filter(Boolean),
    );
    return { loteNomeParaId, loteInativoSet };
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return { loteNomeParaId: new Map(), loteInativoSet: new Set() };
    }
    throw error;
  }
}

async function loadBrincosAtivosParaOperacao(userId: number): Promise<Set<string>> {
  const localFazendas = await listLocalFazendas(userId);
  if (localFazendas.length > 0) {
    return loadActiveBrincoKeysLocal(userId);
  }
  try {
    return await loadActiveBrincoKeysFromDb(userId);
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return loadActiveBrincoKeysLocal(userId);
    }
    throw error;
  }
}

const animaisRouter = router({
  historicoPastos: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const [animal] = await db.select({ loteId: animais.loteId })
          .from(animais)
          .where(and(eq(animais.id, input.animalId), eq(animais.userId, ctx.user.id)))
          .limit(1);
        if (!animal) return [];

        const transfers = await db.select().from(animalLoteMovimentacoes)
          .where(and(
            eq(animalLoteMovimentacoes.userId, ctx.user.id),
            eq(animalLoteMovimentacoes.animalId, input.animalId),
          ))
          .orderBy(desc(animalLoteMovimentacoes.dataMovimentacao));

        const loteIds = new Set<number>();
        if (animal.loteId) loteIds.add(animal.loteId);
        for (const transfer of transfers) {
          loteIds.add(transfer.loteOrigemId);
          loteIds.add(transfer.loteDestinoId);
        }
        if (loteIds.size === 0) return [];

        const lotePastoRows = await db.select().from(lotePastoMovimentacoes)
          .where(and(
            eq(lotePastoMovimentacoes.userId, ctx.user.id),
            inArray(lotePastoMovimentacoes.loteId, [...loteIds]),
          ));

        const pastoIds = [
          ...new Set([
            ...lotePastoRows.flatMap(r => [r.pastoOrigemId, r.pastoDestinoId].filter(Boolean) as number[]),
            ...transfers.flatMap(t => [t.pastoOrigemId, t.pastoDestinoId].filter(Boolean) as number[]),
          ]),
        ];
        const pastoMap: Record<number, string> = {};
        if (pastoIds.length) {
          const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome })
            .from(pastos)
            .where(inArray(pastos.id, pastoIds));
          pastosRows.forEach(p => { pastoMap[p.id] = p.nome; });
        }

        return buildHistoricoSubdivisaoAnimal({
          currentLoteId: animal.loteId ?? null,
          transfers: transfers.map(t => ({
            id: t.id,
            loteOrigemId: t.loteOrigemId,
            loteDestinoId: t.loteDestinoId,
            pastoOrigemId: t.pastoOrigemId,
            pastoDestinoId: t.pastoDestinoId,
            dataMovimentacao: t.dataMovimentacao,
            usuarioNome: t.usuarioNome,
          })),
          lotePastoMovs: lotePastoRows.map(r => ({
            id: r.id,
            loteId: r.loteId,
            pastoOrigemId: r.pastoOrigemId,
            pastoDestinoId: r.pastoDestinoId,
            dataEntrada: r.dataEntrada,
            dataSaida: r.dataSaida,
            observacoes: r.observacoes,
          })),
          pastoMap,
        });
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return listLocalHistoricoPastosAnimal(ctx.user.id, input.animalId);
        }
        throw error;
      }
    }),

  marcasDistintas: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.select({ marca: animais.marca })
      .from(animais)
      .where(eq(animais.userId, ctx.user.id));
    const marcas = [...new Set(rows.map(r => (r.marca || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return marcas;
  }),

  list: protectedProcedure
    .input(animaisListInput)
    .query(async ({ ctx, input }) => {
      try {
      const conditions = [eq(animais.userId, ctx.user.id)];
      if (input?.sexo && input.sexo !== '') conditions.push(eq(animais.sexo, input.sexo as any));
      if (input?.status && input.status !== '') conditions.push(eq(animais.status, input.status as any));
      if (input?.loteId) conditions.push(eq(animais.loteId, input.loteId));
      if (input?.raca && input.raca !== '') conditions.push(eq(animais.raca, input.raca));
      if (input?.categoria && input.categoria !== '') conditions.push(eq(animais.categoria, input.categoria));
      if (input?.dataNascimentoInicio) conditions.push(gte(animais.dataNascimento, input.dataNascimentoInicio));
      if (input?.dataNascimentoFim) conditions.push(lte(animais.dataNascimento, input.dataNascimentoFim));
      if (input?.somenteSisbov) {
        conditions.push(and(isNotNull(animais.sisbov), sql`${animais.sisbov} != ''`)!);
      }
      if (input?.marcadores && input.marcadores.length > 0) {
        conditions.push(inArray(animais.marca, input.marcadores));
      }
      if (input?.search?.trim()) {
        const q = `%${input.search.trim()}%`;
        conditions.push(or(
          like(animais.brinco, q),
          like(animais.brincoEletronico, q),
          like(animais.nome, q),
          like(animais.raca, q),
          like(animais.sisbov, q),
        )!);
      }
      if (input?.brincoEletronico?.trim()) {
        conditions.push(like(animais.brincoEletronico, `%${input.brincoEletronico.trim()}%`));
      }
      if (input?.rgn?.trim()) {
        conditions.push(like(animais.rgn, `%${input.rgn.trim()}%`));
      }
      if (input?.rgd?.trim()) {
        conditions.push(like(animais.rgd, `%${input.rgd.trim()}%`));
      }
      if (input?.dataEntradaDe) conditions.push(gte(animais.dataEntrada, input.dataEntradaDe));
      if (input?.dataEntradaAte) conditions.push(lte(animais.dataEntrada, input.dataEntradaAte));
      if (input?.pastoId) {
        const lotesPasto = await db.select({ id: lotes.id })
          .from(lotes)
          .where(and(eq(lotes.userId, ctx.user.id), eq(lotes.pastoAtualId, input.pastoId)));
        const loteIds = lotesPasto.map(l => l.id);
        if (loteIds.length === 0) return [];
        conditions.push(inArray(animais.loteId, loteIds));
      }

      let lista = await db.select().from(animais).where(and(...conditions)).orderBy(desc(animais.createdAt));
      if (input?.fazendaId) {
        const { loteFazendaById } = await loadLoteFazendaContextForUser(ctx.user.id);
        lista = filterAnimaisPorFazenda(lista, input.fazendaId, loteFazendaById);
      }
      if (lista.length === 0) return [];

      const animalIds = lista.map(a => a.id);

      // Busca lotes
      const lotesAll = await db.select({ id: lotes.id, nome: lotes.nome })
        .from(lotes).where(eq(lotes.userId, ctx.user.id));
      const loteMap = new Map(lotesAll.map(l => [l.id, l.nome]));

      // Busca pastos para enriquecer com pastoNome
      const pastoIdsAnimais = [...new Set(lista.map(a => a.pastoId).filter(Boolean) as number[])];
      const pastoMapAnimais = new Map<number, string>();
      if (pastoIdsAnimais.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome })
          .from(pastos).where(inArray(pastos.id, pastoIdsAnimais));
        pastosRows.forEach(p => pastoMapAnimais.set(p.id, p.nome));
      }

      // Busca TODAS as pesagens dos animais listados (para calcular GMD e ganho)
      const todasPesagens = await db.select()
        .from(pesagens)
        .where(and(eq(pesagens.userId, ctx.user.id), inArray(pesagens.animalId, animalIds)))
        .orderBy(pesagens.animalId, pesagens.data);

      // Agrupa pesagens por animalId
      const pesagensPorAnimal = new Map<number, typeof todasPesagens>();
      for (const p of todasPesagens) {
        if (!pesagensPorAnimal.has(p.animalId)) pesagensPorAnimal.set(p.animalId, []);
        pesagensPorAnimal.get(p.animalId)!.push(p);
      }

      // Busca últimos registros de saúde com carencia para cada animal
      // Usa o campo medicamento para cruzar com estoque
      const saudeAll = await db.select({
        animalId: saudeRegistros.animalId,
        medicamento: saudeRegistros.medicamento,
        dataRegistro: saudeRegistros.dataRegistro,
        proximaData: saudeRegistros.proximaData,
      })
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.userId, ctx.user.id), inArray(saudeRegistros.animalId, animalIds)))
        .orderBy(desc(saudeRegistros.dataRegistro));

      // Busca medicamentos do estoque que possuem carencia
      // Nota: tabela estoque não tem userId, filtra apenas por possuiCarencia
      const medicamentosCarencia = await db.select({
        nome: estoque.nome,
        carenciaAbateDias: estoque.carenciaAbateDias,
        possuiCarencia: estoque.possuiCarencia,
      }).from(estoque).where(eq(estoque.possuiCarencia, true));
      const medCarenciaMap = new Map(medicamentosCarencia.map(m => [m.nome.toLowerCase().trim(), m.carenciaAbateDias || 0]));

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const fimCarenciaPorAnimal = buildFimCarenciaPorAnimal(saudeAll, medCarenciaMap, hoje);

      // Monta resultado enriquecido
      const resultado = lista.map(animal => {
        const loteNome = animal.loteId ? (loteMap.get(animal.loteId) || null) : null;

        // Idade em meses
        let idadeMeses: number | null = null;
        if (animal.dataNascimento) {
          const nasc = new Date(animal.dataNascimento);
          const diffMs = hoje.getTime() - nasc.getTime();
          idadeMeses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
        }

        // Dias na fazenda
        // Regra: animal com dataNascimento nasceu na fazenda → dias desde o nascimento.
        // Animal sem dataNascimento foi comprado fora → dias desde a dataEntrada.
        let diasNaFazenda: number | null = null;
        if (animal.dataNascimento) {
          const nasc = new Date(animal.dataNascimento);
          diasNaFazenda = Math.floor((hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24));
        } else if (animal.dataEntrada) {
          const entrada = new Date(animal.dataEntrada);
          diasNaFazenda = Math.floor((hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Pesagens do animal (ordenadas por data asc)
        const pesos = pesagensPorAnimal.get(animal.id) || [];
        // ultimoPeso: pesagens > pesoAtual > pesoEntrada (fallback em cascata)
        const ultimoPeso = pesos.length > 0
          ? Number(pesos[pesos.length - 1].peso)
          : (animal.pesoAtual ? Number(animal.pesoAtual) : (animal.pesoEntrada ? Number(animal.pesoEntrada) : null));
        const primeiroPeso = pesos.length > 0 ? Number(pesos[0].peso) : (animal.pesoEntrada ? Number(animal.pesoEntrada) : null);

        // Ganho total (kg)
        let ganhoKg: number | null = null;
        if (ultimoPeso !== null && primeiroPeso !== null && ultimoPeso !== primeiroPeso) {
          ganhoKg = Math.round((ultimoPeso - primeiroPeso) * 100) / 100;
        }

        // GMD: ganho médio diário (kg/dia)
        let gmd: number | null = null;
        if (pesos.length >= 2) {
          const p1 = pesos[0];
          const p2 = pesos[pesos.length - 1];
          const d1 = new Date(p1.data);
          const d2 = new Date(p2.data);
          const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
          gmd = Math.round(((Number(p2.peso) - Number(p1.peso)) / dias) * 1000) / 1000;
        } else if (diasNaFazenda && diasNaFazenda > 0 && ganhoKg !== null) {
          gmd = Math.round((ganhoKg / diasNaFazenda) * 1000) / 1000;
        }

        const pastoNome = animal.pastoId ? (pastoMapAnimais.get(animal.pastoId) ?? null) : null;

        return {
          ...animal,
          loteNome,
          pastoNome,
          idadeMeses,
          diasNaFazenda,
          ultimoPeso,
          ganhoKg,
          gmd,
          emCarencia: fimCarenciaPorAnimal.has(animal.id),
          fimCarenciaAte: fimCarenciaPorAnimal.has(animal.id)
            ? toDateOnlyISO(fimCarenciaPorAnimal.get(animal.id)!)
            : null,
        };
      });

      let filtered = resultado;
      if (input?.apenasEmCarencia) {
        filtered = filtered.filter(animal => animal.emCarencia === true);
      }
      if (input?.apenasSemLote) {
        filtered = filtered.filter(animal => !animal.loteId);
      }
      if (input?.apenasSemPesagem) {
        const limite60d = new Date(hoje);
        limite60d.setDate(limite60d.getDate() - 60);
        const limite60dStr = limite60d.toISOString().split('T')[0];
        // Animal sem pesagem recente = sem pesagens OU última pesagem há mais de 60 dias
        filtered = filtered.filter(animal => {
          const pesos = pesagensPorAnimal.get(animal.id) || [];
          if (pesos.length === 0) return true;
          const ultimaData = pesos[pesos.length - 1].data;
          return String(ultimaData) < limite60dStr;
        });
      }
      if (input?.pesoMin !== undefined || input?.pesoMax !== undefined) {
        filtered = filtered.filter(animal => {
          const peso = animal.ultimoPeso;
          if (peso === null || peso === undefined) return false;
          if (input!.pesoMin !== undefined && peso < input!.pesoMin) return false;
          if (input!.pesoMax !== undefined && peso > input!.pesoMax) return false;
          return true;
        });
      }
      if (input?.idadeMesesMin !== undefined || input?.idadeMesesMax !== undefined) {
        filtered = filtered.filter(animal => {
          if (animal.idadeMeses === null || animal.idadeMeses === undefined) return false;
          if (input!.idadeMesesMin !== undefined && animal.idadeMeses < input!.idadeMesesMin) return false;
          if (input!.idadeMesesMax !== undefined && animal.idadeMeses > input!.idadeMesesMax) return false;
          return true;
        });
      }
      if (input?.semDataNascimento) {
        filtered = filtered.filter(animal => !animal.dataNascimento);
      }

      return filtered;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return listLocalAnimaisEnriched(ctx.user.id, input as Record<string, unknown> | undefined);
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const [animal] = await db.select().from(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id))).limit(1);
        if (animal) {
          let loteNome: string | null = null;
          if (animal.loteId) {
            const [lote] = await db.select({ nome: lotes.nome }).from(lotes).where(eq(lotes.id, animal.loteId)).limit(1);
            loteNome = lote?.nome ?? null;
          }
          const diasNaFazenda = animal.createdAt
            ? Math.floor((Date.now() - new Date(animal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          return { ...animal, loteNome, diasNaFazenda };
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }

      const animal = await getLocalAnimal(ctx.user.id, input.id);
      return animal ? await enrichLocalAnimal(ctx.user.id, animal) : null;
    }),

  create: protectedProcedure
    .input(z.object({
      brinco: z.string().optional(),
      brincoEletronico: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["macho", "femea"]),
      dataNascimento: z.string().nullable().optional(),
      pesoAtual: z.string().optional(),
      loteId: z.number().optional(),
      categoria: z.string().optional(),
      observacoes: z.string().optional(),
      // Zotécnicos
      pelagem: z.string().optional(),
      marca: z.string().optional(),
      dataDesmama: z.string().nullable().optional(),
      castrado: z.boolean().optional(),
      // Entrada / aquisição
      dataEntrada: z.string().nullable().optional(),
      pesoEntrada: z.string().optional(),
      produtorOrigem: z.string().optional(),
      precoKg: z.string().optional(),
      frete: z.string().optional(),
      // Rastreabilidade
      sisbov: z.string().optional(),
      dataRnd: z.string().nullable().optional(),
      rgn: z.string().optional(),
      rgd: z.string().optional(),
      rastreadoNascimento: z.boolean().optional(),
      // Genealogia
      pai: z.string().optional(),
      mae: z.string().optional(),
      fazendaId: z.number().optional(),
      pastoId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = buildAnimalInsertRow(ctx.user.id, input);
      try {
        await assertBrincoUnicoEntreAtivosDb(ctx.user.id, row.brinco, "ativo");
        const result = await db.insert(animais).values(row);
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await updateLocalAnimal(ctx.user.id, id, row);
          } catch (mirrorError) {
            console.warn("[animais.create] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          await assertBrincoUnicoEntreAtivos(ctx.user.id, row.brinco, "ativo", undefined, true);
          const result = await createLocalAnimal(ctx.user.id, row);
          return { success: true, id: result.id, localFallback: true };
        }
        console.error("[animais.create]", err);
        throw err;
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      brinco: z.string().nullable().optional(),
      brincoEletronico: z.string().nullable().optional(),
      nome: z.string().nullable().optional(),
      raca: z.string().nullable().optional(),
      sexo: z.enum(["macho", "femea"]).optional(),
      dataNascimento: z.string().nullable().optional(),
      pesoAtual: z.string().nullable().optional(),
      loteId: z.number().nullable().optional(),
      categoria: z.string().nullable().optional(),
      status: z.enum(["ativo", "vendido", "morto", "transferido"]).optional(),
      observacoes: z.string().nullable().optional(),
      pelagem: z.string().nullable().optional(),
      marca: z.string().nullable().optional(),
      dataDesmama: z.string().nullable().optional(),
      castrado: z.boolean().optional(),
      dataEntrada: z.string().nullable().optional(),
      pesoEntrada: z.string().nullable().optional(),
      produtorOrigem: z.string().nullable().optional(),
      precoKg: z.string().nullable().optional(),
      frete: z.string().nullable().optional(),
      sisbov: z.string().nullable().optional(),
      dataRnd: z.string().nullable().optional(),
      rgn: z.string().nullable().optional(),
      rgd: z.string().nullable().optional(),
      rastreadoNascimento: z.boolean().optional(),
      pai: z.string().nullable().optional(),
      mae: z.string().nullable().optional(),
      fazendaId: z.number().nullable().optional(),
      pastoId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const {
        id, dataNascimento, dataDesmama, dataEntrada, dataRnd,
        loteId, pastoId, pesoEntrada, pesoAtual,
        brinco, brincoEletronico, nome, raca, categoria, observacoes,
        pelagem, marca, produtorOrigem, precoKg, frete,
        sisbov, rgn, rgd, pai, mae, fazendaId,
        ...rest
      } = input;

      // null = limpar campo, undefined = não alterar, string = atualizar
      const resolveData = (v: string | null | undefined) => {
        if (v === null) return null;
        if (v === undefined) return undefined;
        return v || null; // string vazia também limpa
      };
      const resolveStr = (v: string | null | undefined) => {
        if (v === undefined) return undefined;
        return v === null || v === '' ? null : v;
      };
      const resolvePeso = (v: string | null | undefined) => {
        if (v === undefined) return undefined;
        return v === null || v === '' ? null : v;
      };

      const setData: Record<string, unknown> = {
        ...rest,
        dataNascimento: resolveData(dataNascimento),
        dataDesmama: resolveData(dataDesmama),
        dataEntrada: resolveData(dataEntrada),
        dataRnd: resolveData(dataRnd),
        pesoEntrada: resolvePeso(pesoEntrada),
        pesoAtual: resolvePeso(pesoAtual),
        brinco: resolveStr(brinco),
        brincoEletronico: resolveStr(brincoEletronico),
        nome: resolveStr(nome),
        raca: resolveStr(raca),
        categoria: resolveStr(categoria),
        observacoes: resolveStr(observacoes),
        pelagem: resolveStr(pelagem),
        marca: resolveStr(marca),
        produtorOrigem: resolveStr(produtorOrigem),
        precoKg: resolveStr(precoKg),
        frete: resolveStr(frete),
        sisbov: resolveStr(sisbov),
        rgn: resolveStr(rgn),
        rgd: resolveStr(rgd),
        pai: resolveStr(pai),
        mae: resolveStr(mae),
      };
      // Remove chaves undefined para não sobrescrever campos não enviados
      Object.keys(setData).forEach(k => setData[k] === undefined && delete setData[k]);
      if (loteId !== undefined) setData.loteId = loteId;
      if (pastoId !== undefined) setData.pastoId = pastoId;
      if (fazendaId !== undefined) setData.fazendaId = fazendaId;
      try {
        const [current] = await db
          .select({ brinco: animais.brinco, status: animais.status })
          .from(animais)
          .where(and(eq(animais.id, id), eq(animais.userId, ctx.user.id)))
          .limit(1);
        if (!current) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Animal não encontrado." });
        }

        const effectiveBrinco = brinco !== undefined ? resolveStr(brinco) : current.brinco;
        const effectiveStatus = resolveEffectiveStatus(
          (rest as { status?: string }).status,
          current.status,
        );
        await assertBrincoUnicoEntreAtivosDb(
          ctx.user.id,
          effectiveBrinco,
          effectiveStatus,
          id,
        );

        await db.update(animais).set(setData).where(and(eq(animais.id, id), eq(animais.userId, ctx.user.id)));
        try {
          await updateLocalAnimal(ctx.user.id, id, setData);
        } catch (mirrorError) {
          console.warn("[animais.update] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          const current = await getLocalAnimal(ctx.user.id, id);
          if (!current) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Animal não encontrado." });
          }
          const effectiveBrinco = brinco !== undefined ? resolveStr(brinco) : current.brinco;
          const effectiveStatus = resolveEffectiveStatus(
            (rest as { status?: string }).status,
            current.status,
          );
          await assertBrincoUnicoEntreAtivos(
            ctx.user.id,
            effectiveBrinco,
            effectiveStatus,
            id,
            true,
          );
          await updateLocalAnimal(ctx.user.id, id, setData);
          return { success: true, localFallback: true };
        }
        throw err;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await deleteLocalAnimal(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  // ── Gera planilha modelo para download ──────────────────────────────────────
  gerarModeloPlanilha: protectedProcedure
    .mutation(async ({ ctx }) => {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
      const { COLUNAS_IMPORTACAO } = await import('../shared/importacaoAnimais');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fazenda Digital';
      wb.created = new Date();

      // ─── CORES INSTITUCIONAIS ──────────────────────────────────────────────────
      const COR_HEADER_BG  = '1A3C3C'; // verde petróleo escuro
      const COR_OBRIG_BG   = 'B8860B'; // dourado — cabeçalho de campos obrigatórios
      const COR_COL_BG     = '2D5A5A'; // verde petróleo médio — cabeçalho normal
      const COR_LINHA_ALT  = 'F2F7F7'; // cinza esverdeado muito claro
      const COR_EXEMPLO_BG = 'E8F5E9'; // verde claro
      const COR_INSTRUCAO  = 'E3F2FD'; // azul claro

      const NUM_COLS = COLUNAS_IMPORTACAO.length;
      const ultimaColLetra = (n: number): string => {
        // converte índice 1-based para letra de coluna do Excel (A, B, ... Z, AA...)
        let s = '';
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
      };
      const COL_FIM = ultimaColLetra(NUM_COLS);

      // ─── ABA 1: ANIMAIS (cabeçalhos na LINHA 1 para parse correto) ─────────────
      const ws = wb.addWorksheet('Animais', {
        properties: { tabColor: { argb: COR_COL_BG } },
        views: [{ state: 'frozen', ySplit: 1 }], // congela cabeçalho
      });

      // Linha 1: cabeçalhos das colunas (parser lê esta linha)
      const headerRow = ws.getRow(1);
      headerRow.height = 26;
      COLUNAS_IMPORTACAO.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.label + (col.obrigatorio ? ' *' : '');
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrigatorio ? COR_OBRIG_BG : COR_COL_BG } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          bottom: { style: 'medium', color: { argb: COR_HEADER_BG } },
          right:  { style: 'thin',   color: { argb: 'FFFFFF' } },
        };
        ws.getColumn(idx + 1).width = col.largura;
      });

            // Linhas 2-501: área de preenchimento LIMPA (sem linha de exemplo — exemplos estão na aba Exemplos)
      for (let r = 2; r <= 501; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        COLUNAS_IMPORTACAO.forEach((col, idx) => {
          const cell = row.getCell(idx + 1);
          const isAlt = (r % 2 === 0);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrigatorio ? 'FFF8E1' : (isAlt ? COR_LINHA_ALT : 'FFFFFF') } };
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
        });
      }

      // Fazendas, lotes e pastos reais do usuário (espelho local tem prioridade)
      const { nomesFazendas, nomesLotes, pastosPorFazendaNome } =
        await loadDadosDropdownModeloAnimais(ctx.user.id);

      const fazendasFormulae = nomesFazendas.length > 0
        ? [`"${nomesFazendas.join(',')}"`]
        : ['"(Nenhuma fazenda cadastrada)"'];

      const lotesFormulae = nomesLotes.length > 0
        ? [`"${nomesLotes.join(',')}"`]
        : ['"(Nenhum lote cadastrado)"'];

      // Dropdowns de validação — Fazenda, Sexo, Categoria, Raça, Castrado, Status, Rastreado, Lote, Subdivisão
      const idxDe = (key: string) => COLUNAS_IMPORTACAO.findIndex(c => c.key === key) + 1;
      
      // Importar mapeamento Sexo → Categoria
      const { CATEGORIAS_POR_SEXO } = await import('../shared/animal-types');
      
      // Coluna Sexo: índice 1-based na planilha (para montar referência na fórmula)
      const colSexoIdx = idxDe('sexo'); // ex: 4 → coluna D
      const colSexoLetra = String.fromCharCode(64 + colSexoIdx);
      
      const dvConfig: { colIdx: number; formulae: string[] }[] = [
        { colIdx: idxDe('fazendaNome'),         formulae: fazendasFormulae },
        { colIdx: idxDe('sexo'),                formulae: ['"Fêmea,Macho"'] },
        { colIdx: idxDe('categoria'),           formulae: [`OFFSET(_ListasAnimais!$D$1,MATCH($${colSexoLetra}{r},_ListasAnimais!$C:$C,0)-1,0,COUNTIF(_ListasAnimais!$C:$C,$${colSexoLetra}{r}),1)`] },
        { colIdx: idxDe('raca'),                formulae: ['"Nelore,Nelore Mocho,Angus,Senepol,Brahman,Girolando,Gir,Holandês,Mestiço,Outro"'] },
        { colIdx: idxDe('castrado'),            formulae: ['"Sim,Não"'] },
        { colIdx: idxDe('rastreadoNascimento'), formulae: ['"Sim,Não"'] },
        { colIdx: idxDe('status'),              formulae: ['"Ativo,Vendido,Morto,Transferido"'] },
        { colIdx: idxDe('lote'),                formulae: lotesFormulae },
        // Subdivisao: usa INDIRECT para filtrar por fazenda — o Named Range é montado abaixo
        // A fórmula é adicionada por linha separadamente após este bloco
      ].filter(d => d.colIdx > 0);
      const colIdxSubdivisao = idxDe('subdivisao');
      const colFazendaLetra = ultimaColLetra(idxDe('fazendaNome'));

      for (let r = 2; r <= 501; r++) {
        dvConfig.forEach(({ colIdx, formulae }) => {
          const cell = ws.getRow(r).getCell(colIdx);
          // Substituir {r} pela linha atual na fórmula de categoria
          const formulaeFinal = formulae.map(f => f.replace(/{r}/g, String(r)));
          cell.dataValidation = {
            type: 'list', allowBlank: true, formulae: formulaeFinal,
            showErrorMessage: true, errorTitle: 'Valor inválido', error: 'Selecione um valor da lista.',
          };
        });

        // Dropdown de Subdivisão dinâmico por fazenda via INDIRECT
        if (colIdxSubdivisao > 0) {
          const cellSub = ws.getRow(r).getCell(colIdxSubdivisao);
          // Faz referência ao Named Range com o nome da fazenda selecionada na coluna Fazenda desta linha
          // Ex: se A2 = "Fazenda Junior", INDIRECT("Pasto_Fazenda_Junior") retorna os pastos dessa fazenda
          // SUBSTITUTE remove espaços e caracteres especiais do nome para formar um identificador válido
          cellSub.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`INDIRECT("Pasto_"&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($${colFazendaLetra}${r}," ","_"),"/","_"),"-","_"))`],
            showErrorMessage: false, // não bloqueia se a fazenda não tiver pastos
          };
        }
      }
      
      // ─── ABA AUXILIAR: _ListasAnimais (oculta) ──────────────────────────────────
      const wsListasAnimais = wb.addWorksheet('_ListasAnimais', {
        state: 'veryHidden',
        properties: { tabColor: { argb: '888888' } },
      });
      
      // Coluna A: Sexos únicos
      const sexosUnicos = Object.keys(CATEGORIAS_POR_SEXO);
      wsListasAnimais.getColumn(1).width = 12;
      sexosUnicos.forEach((sexo, idx) => {
        const cell = wsListasAnimais.getCell(idx + 1, 1);
        cell.value = sexo;
      });
      
      // Coluna B: (vazio, apenas para espaçamento)
      wsListasAnimais.getColumn(2).width = 2;
      
      // Coluna C: Sexo (chave para MATCH)
      // Coluna D: Categoria (valores para OFFSET)
      wsListasAnimais.getColumn(3).width = 12;
      wsListasAnimais.getColumn(4).width = 20;
      
      let rowIdx = 1;
      Object.entries(CATEGORIAS_POR_SEXO).forEach(([sexo, categorias]) => {
        categorias.forEach(categoria => {
          wsListasAnimais.getCell(rowIdx, 3).value = sexo;
          wsListasAnimais.getCell(rowIdx, 4).value = categoria;
          rowIdx++;
        });
      });

      // ─── Named Ranges por fazenda para dropdown dinâmico de Subdivisão ─────────
      // Cada fazenda recebe uma coluna na aba oculta com seus pastos.
      // O Named Range é nomeado "Pasto_" + nome_da_fazenda (espaços → _)
      // A fórmula INDIRECT na coluna Subdivisão referencia este Named Range.
      const sanitizarNomeRange = (nome: string) =>
        'Pasto_' + nome.replace(/[^A-Za-z0-9À-ÿ]/g, '_');

      let colPastosStart = 6; // Colunas E+ na aba _ListasAnimais (1=A, 2=B, 3=C, 4=D, 5=E, 6=F)
      pastosPorFazendaNome.forEach((nomesPastos, nomeFazenda) => {
        if (nomesPastos.length === 0) return;
        const colIdx = colPastosStart++;
        wsListasAnimais.getColumn(colIdx).width = 25;
        // Escreve os nomes dos pastos nesta coluna
        nomesPastos.forEach((nomePasto, i) => {
          wsListasAnimais.getCell(i + 1, colIdx).value = nomePasto;
        });
        // Cria o Named Range referenciando esta coluna
        const rangeName = sanitizarNomeRange(nomeFazenda);
        const colLetra = ultimaColLetra(colIdx);
        const rangeRef = `_ListasAnimais!$${colLetra}$1:$${colLetra}$${nomesPastos.length}`;
        wb.definedNames.add(rangeRef, rangeName);
      });

      // Serializa para base64
      const buf = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return { base64, filename: 'modelo_importacao_animais.xlsx' };
    }),

  // ── Valida linhas antes de importar ─────────────────────────────────────────
  validarImportacao: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      const {
        normalizarLinha,
        normalizarSexo,
        normalizarStatus,
        isLinhaExemplo,
        mensagemDataReferenciaLinha,
        MENSAGEM_DATA_REFERENCIA_DETALHE,
        possuiDataReferenciaImportacao,
        montarMensagemValidacaoImportacao,
      } = await import('../shared/importacaoAnimais');
      const { CATEGORIAS_POR_SEXO, isCategoriaValidaParaSexo, todasAsCategorias } = await import('../shared/animal-types');
      const SEXOS_VALIDOS = ['macho', 'femea'];
      const STATUS_VALIDOS = ['ativo', 'vendido', 'morto', 'transferido'];
      const RACAS_VALIDAS = [
        'Nelore', 'Nelore Mocho', 'Angus', 'Senepol', 'Brahman',
        'Girolando', 'Gir', 'Holandês', 'Mestiço', 'Outro',
      ];
      const CATEGORIAS_VALIDAS = todasAsCategorias(); // Boi, Novilho, Bezerro, Vaca, Novilha, Bezerra

      try {
      // Normaliza cabeçalhos PT-BR → chaves internas para TODAS as linhas
      // (a planilha do usuário usa rótulos em português como "Brinco", "Data de Nascimento")
      // e DESCARTA a linha de EXEMPLO ilustrativa (defesa redundante do backend).
      input.linhas = input.linhas
        .map(l => normalizarLinha(l))
        .filter(l => !isLinhaExemplo(l));

      // Busca fazendas e pastos do usuário (espelho local tem prioridade)
      const fazendasUsuario = await loadFazendasUsuarioParaOperacao(ctx.user.id);
      const fazendaNomeParaId = new Map(fazendasUsuario.map(f => [f.nome.toLowerCase().trim(), f.id]));

      const pastosUsuario = await loadPastosUsuarioParaOperacao(ctx.user.id);
      const pastoNomeParaId = new Map(pastosUsuario.map(p => [p.nome.toLowerCase().trim(), p.id]));

      const { loteNomeParaId, loteInativoSet } = await loadLotesUsuarioParaOperacao(ctx.user.id);

      // Brincos em uso por animais ativos (inativos podem reutilizar número)
      const brincosAtivosBancoSet = await loadBrincosAtivosParaOperacao(ctx.user.id);

      const erros: { linha: number; campo: string; mensagem: string }[] = [];
      const validos: typeof input.linhas = [];
      const brincosAtivosNaPlanilha = new Set<string>();

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = input.linhas[i];
        const numLinha = i + 2; // +2 porque linha 1 é cabeçalho
        const errosLinha: { linha: number; campo: string; mensagem: string }[] = [];

        // Fazenda obrigatória
        const fazendaNome = (linha.fazendaNome || '').trim();
        if (!fazendaNome) {
          errosLinha.push({ linha: numLinha, campo: 'Fazenda', mensagem: 'Fazenda é obrigatória' });
        } else if (!fazendaNomeParaId.has(fazendaNome.toLowerCase())) {
          errosLinha.push({ linha: numLinha, campo: 'Fazenda', mensagem: `Fazenda não encontrada: "${fazendaNome}"` });
        }

        // Brinco obrigatório (unicidade apenas entre animais ativos)
        const statusRawBrinco = (linha.status || '').trim();
        const statusNormBrinco = statusRawBrinco ? normalizarStatus(statusRawBrinco) : 'ativo';
        const statusValidoBrinco = !statusRawBrinco || STATUS_VALIDOS.includes(statusNormBrinco);

        const brinco = (linha.brinco || '').trim();
        if (!brinco) {
          errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: 'Brinco é obrigatório' });
        } else if (statusValidoBrinco) {
          const brincoErro = validarBrincoAtivoImportacao({
            brinco,
            statusEfetivo: statusNormBrinco,
            brincosAtivosBanco: brincosAtivosBancoSet,
            brincosAtivosPlanilha: brincosAtivosNaPlanilha,
          });
          if (brincoErro) {
            errosLinha.push({ linha: numLinha, campo: brincoErro.campo, mensagem: brincoErro.mensagem });
          }
        }

        // Sexo obrigatório — aceita "Fêmea"/"Macho" (PT-BR) e normaliza
        const sexoRaw = (linha.sexo || '').trim();
        const sexo = sexoRaw ? normalizarSexo(sexoRaw) : '';
        if (!sexo) {
          errosLinha.push({ linha: numLinha, campo: 'Sexo', mensagem: 'Sexo é obrigatório (Fêmea ou Macho)' });
        } else if (!SEXOS_VALIDOS.includes(sexo)) {
          errosLinha.push({ linha: numLinha, campo: 'Sexo', mensagem: `Sexo inválido: "${sexoRaw}". Use: Fêmea ou Macho` });
        } else {
          linha.sexo = sexo; // normaliza para o banco
        }

        // Categoria obrigatória E compatível com Sexo
        const categoria = (linha.categoria || '').trim();
        if (!categoria) {
          errosLinha.push({ linha: numLinha, campo: 'Categoria', mensagem: 'Categoria é obrigatória' });
        } else if (!CATEGORIAS_VALIDAS.includes(categoria)) {
          errosLinha.push({ linha: numLinha, campo: 'Categoria', mensagem: `Categoria inválida: "${categoria}"` });
        } else if (sexo && !isCategoriaValidaParaSexo(sexo === 'macho' ? 'Macho' : 'Fêmea', categoria)) {
          errosLinha.push({ linha: numLinha, campo: 'Categoria', mensagem: `A categoria selecionada não é compatível com o sexo informado.` });
        }

        // Status (opcional, mas se informado deve ser válido) — aceita "Ativo" (PT-BR)
        const statusRaw = (linha.status || '').trim();
        const status = statusRaw ? normalizarStatus(statusRaw) : '';
        if (status && !STATUS_VALIDOS.includes(status)) {
          errosLinha.push({ linha: numLinha, campo: 'Status', mensagem: `Status inválido: "${statusRaw}". Use: Ativo, Vendido, Morto ou Transferido` });
        } else if (status) {
          linha.status = status; // normaliza para o banco
        }

        // Raça (opcional, mas se informada deve ser válida)
        const raca = (linha.raca || '').trim();
        if (raca && !RACAS_VALIDAS.includes(raca)) {
          errosLinha.push({ linha: numLinha, campo: 'raca', mensagem: `Raça não cadastrada: "${raca}"` });
        }

        // Subdivisão/Pasto (opcional, mas se informado deve existir)
        const subdivisaoNome = (linha.subdivisao || '').trim();
        if (subdivisaoNome && !pastoNomeParaId.has(subdivisaoNome.toLowerCase())) {
          errosLinha.push({ linha: numLinha, campo: 'Subdivisão', mensagem: `Pasto/Subdivisão não encontrado: "${subdivisaoNome}"` });
        }

        // Datas — aceita DD/MM/AAAA, DD/MM/AA e AAAA-MM-DD
        // Converte automaticamente para YYYY-MM-DD antes de validar
        const parseDateBR = (raw: string): string | null => {
          const s = raw.trim();
          if (!s) return null;
          // Formato ISO: YYYY-MM-DD
          const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) return s; // já está no formato correto
          // Formato brasileiro: DD/MM/YYYY ou DD/MM/YY
          const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
          if (brMatch) {
            const d = brMatch[1].padStart(2, '0');
            const m = brMatch[2].padStart(2, '0');
            let y = brMatch[3];
            if (y.length === 2) {
              // Ano com 2 dígitos: 00-49 → 2000-2049, 50-99 → 1950-1999
              y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
            }
            return `${y}-${m}-${d}`;
          }
          return null; // formato não reconhecido
        };

        const camposDatas = ['dataNascimento', 'dataDesmama', 'dataEntrada', 'dataRnd'];
        for (const campo of camposDatas) {
          const rawVal = (linha[campo] || '').trim();
          if (rawVal) {
            const converted = parseDateBR(rawVal);
            if (!converted) {
              errosLinha.push({ linha: numLinha, campo, mensagem: `Data inválida em "${campo}": "${rawVal}". Use DD/MM/AAAA ou AAAA-MM-DD` });
            } else {
              // Valida datas inexistentes (ex: 30/02/2025)
              const [y, mo, d] = converted.split('-').map(Number);
              const dt = new Date(y, mo - 1, d);
              if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) {
                errosLinha.push({ linha: numLinha, campo, mensagem: `Data inexistente em "${campo}": "${rawVal}"` });
              } else {
                // Normaliza o valor na linha para YYYY-MM-DD antes de salvar
                linha[campo] = converted;
              }
            }
          }
        }

        if (!possuiDataReferenciaImportacao(linha)) {
          errosLinha.push({
            linha: numLinha,
            campo: 'dataReferencia',
            mensagem: MENSAGEM_DATA_REFERENCIA_DETALHE,
          });
        }

        // Lote (opcional, mas se informado deve ser ativo e existir)
        const loteNome = (linha.lote || '').trim();
        if (loteNome) {
          if (loteInativoSet.has(loteNome.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'lote', mensagem: `Lote "${loteNome}" está inativo` });
          } else if (!loteNomeParaId.has(loteNome.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'lote', mensagem: `Lote não encontrado: "${loteNome}"` });
          }
        }

        if (errosLinha.length > 0) {
          erros.push(...errosLinha);
        } else {
          validos.push(linha);
        }
      }

      const { mensagemPrincipal, mensagemDetalhada } = montarMensagemValidacaoImportacao(erros);

      return {
        total: input.linhas.length,
        validos: validos.length,
        invalidos: erros.length > 0 ? input.linhas.length - validos.length : 0,
        erros,
        mensagemPrincipal: erros.length > 0 ? mensagemPrincipal : undefined,
        mensagemDetalhada: erros.length > 0 ? mensagemDetalhada : undefined,
        loteNomeParaId: Object.fromEntries(loteNomeParaId),
        fazendaNomeParaId: Object.fromEntries(fazendaNomeParaId),
        pastoNomeParaId: Object.fromEntries(pastoNomeParaId),
      };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error('[animais.validarImportacao]', error);
        const { MENSAGEM_VALIDACAO_PLANILHA_GENERICA } = await import('../shared/importacaoAnimais');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: MENSAGEM_VALIDACAO_PLANILHA_GENERICA,
        });
      }
    }),

  // ── Importa animais em lote ──────────────────────────────────────────────────
  importar: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
      loteNomeParaId: z.record(z.string(), z.number()),
      fazendaNomeParaId: z.record(z.string(), z.number()).optional(),
      pastoNomeParaId: z.record(z.string(), z.number()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { normalizarLinha, normalizarSexo, normalizarStatus, normalizarBooleano, isLinhaExemplo, mensagemDataReferenciaLinha, possuiDataReferenciaImportacao } = await import('../shared/importacaoAnimais');
      const importados: number[] = [];
      const rejeitados: { linha: number; mensagem: string }[] = [];

      // Converte datas DD/MM/AAAA, DD/MM/AA ou AAAA-MM-DD para string YYYY-MM-DD (ou undefined)
      // Usa strings diretamente para evitar qualquer problema de timezone com objetos Date
      const parseData = (raw: string): string | undefined => {
        const s = (raw || '').trim();
        if (!s) return undefined;
        const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return s; // já está no formato correto
        const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (br) {
          const d = br[1].padStart(2, '0');
          const m = br[2].padStart(2, '0');
          let y = br[3];
          if (y.length === 2) y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
          return `${y}-${m}-${d}`;
        }
        return undefined;
      };

      const brincosAtivosReservados = await loadBrincosAtivosParaOperacao(ctx.user.id);

      for (let i = 0; i < input.linhas.length; i++) {
        // Normaliza cabeçalhos PT-BR → chaves internas
        const linha = normalizarLinha(input.linhas[i]);
        const numLinha = i + 2;
        // Defesa redundante: nunca importar a linha de EXEMPLO ilustrativa
        if (isLinhaExemplo(linha)) {
          continue;
        }
        try {
          const brinco = (linha.brinco || '').trim();
          const sexo = normalizarSexo(linha.sexo || '') as 'macho' | 'femea';
          const statusImport = (() => {
            const st = normalizarStatus(linha.status || '');
            return ['ativo', 'vendido', 'morto', 'transferido'].includes(st) ? st : 'ativo';
          })();

          const brincoErro = validarBrincoAtivoImportacao({
            brinco,
            statusEfetivo: statusImport,
            brincosAtivosBanco: brincosAtivosReservados,
            brincosAtivosPlanilha: brincosAtivosReservados,
          });
          if (brincoErro) {
            rejeitados.push({ linha: numLinha, mensagem: brincoErro.mensagem });
            continue;
          }

          if (!possuiDataReferenciaImportacao(linha)) {
            rejeitados.push({ linha: numLinha, mensagem: mensagemDataReferenciaLinha(numLinha) });
            continue;
          }

          // Resolve loteId
          const loteNome = (linha.lote || '').trim().toLowerCase();
          const loteId = loteNome ? input.loteNomeParaId[loteNome] : undefined;

          // Resolve fazendaId (opcional, mas se informado deve existir)
          const fazendaNomeLinha = (linha.fazendaNome || '').trim().toLowerCase();
          const fazendaId = fazendaNomeLinha && input.fazendaNomeParaId
            ? input.fazendaNomeParaId[fazendaNomeLinha]
            : undefined;

          // Resolve pastoId (subdivisão)
          const subdivisaoNomeLinha = (linha.subdivisao || '').trim().toLowerCase();
          const pastoId = subdivisaoNomeLinha && input.pastoNomeParaId
            ? input.pastoNomeParaId[subdivisaoNomeLinha]
            : undefined;

          // Converte castrado/rastreadoNascimento (aceita Sim/Não em PT-BR)
          const toBool = normalizarBooleano;

          const animalRow = {
            ...buildAnimalInsertRow(ctx.user.id, {
              brinco: brinco || undefined,
              brincoEletronico: (linha.brincoEletronico || '').trim() || undefined,
              nome: (linha.nome || '').trim() || brinco || undefined,
              raca: (linha.raca || '').trim() || undefined,
              sexo,
              dataNascimento: parseData(linha.dataNascimento) ?? null,
              pesoAtual: (linha.pesoEntrada || '').trim() || undefined,
              loteId: loteId || undefined,
              fazendaId: fazendaId || undefined,
              pastoId: pastoId || undefined,
              categoria: (linha.categoria || '').trim() || undefined,
              observacoes: (linha.observacoes || '').trim() || undefined,
              pelagem: (linha.pelagem || '').trim() || undefined,
              marca: (linha.marca || '').trim() || undefined,
              dataDesmama: parseData(linha.dataDesmama) ?? null,
              castrado: toBool(linha.castrado),
              dataEntrada: parseData(linha.dataEntrada) ?? null,
              pesoEntrada: (linha.pesoEntrada || '').trim() || undefined,
              produtorOrigem: (linha.produtorOrigem || '').trim() || undefined,
              precoKg: (linha.precoKg || '').trim() || undefined,
              frete: (linha.frete || '').trim() || undefined,
              sisbov: (linha.sisbov || '').trim() || undefined,
              dataRnd: parseData(linha.dataRnd) ?? null,
              rgn: (linha.rgn || '').trim() || undefined,
              rgd: (linha.rgd || '').trim() || undefined,
              rastreadoNascimento: toBool(linha.rastreadoNascimento),
              pai: (linha.pai || '').trim() || undefined,
              mae: (linha.mae || '').trim() || undefined,
            }),
            status: statusImport as 'ativo' | 'vendido' | 'morto' | 'transferido',
          };

          try {
            const result = await db.insert(animais).values(animalRow);
            const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
            if (Number.isFinite(id) && id > 0) {
              try {
                await updateLocalAnimal(ctx.user.id, id, animalRow);
              } catch (mirrorError) {
                console.warn("[animais.importar] Espelho local não gravado:", mirrorError);
              }
              importados.push(id);
            }
          } catch (err: any) {
            if (err instanceof TRPCError) throw err;
            if (isDatabaseUnavailable(err)) {
              await assertBrincoUnicoEntreAtivos(
                ctx.user.id,
                animalRow.brinco,
                statusImport,
                undefined,
                true,
              );
              const { id } = await createLocalAnimal(ctx.user.id, animalRow);
              importados.push(id);
            } else {
              rejeitados.push({ linha: numLinha, mensagem: formatImportDbError(err) });
            }
          }
        } catch (err: any) {
          if (err instanceof TRPCError) throw err;
          rejeitados.push({ linha: numLinha, mensagem: formatImportDbError(err) });
        }
      }

      return {
        total: input.linhas.length,
        importados: importados.length,
        rejeitados: rejeitados.length,
        detalhesRejeitados: rejeitados,
      };
    }),
});

// ─── LOTES / PASTOS HELPERS ───────────────────────────────────────────────────
function diasEntre(inicio: string | Date, fim: string | Date = new Date()): number {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function mapMovimentacoesPorLote(
  userId: number,
  loteIds: number[],
): Promise<Map<number, MovimentacaoPastoLoteRef[]>> {
  const map = new Map<number, MovimentacaoPastoLoteRef[]>();
  if (loteIds.length === 0) return map;
  const rows = await db.select({
    loteId: lotePastoMovimentacoes.loteId,
    pastoDestinoId: lotePastoMovimentacoes.pastoDestinoId,
    dataEntrada: lotePastoMovimentacoes.dataEntrada,
    dataSaida: lotePastoMovimentacoes.dataSaida,
  }).from(lotePastoMovimentacoes).where(and(
    eq(lotePastoMovimentacoes.userId, userId),
    inArray(lotePastoMovimentacoes.loteId, loteIds),
  ));
  for (const row of rows) {
    const arr = map.get(row.loteId) ?? [];
    arr.push(row);
    map.set(row.loteId, arr);
  }
  return map;
}

async function countAnimaisLote(loteId: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(animais)
    .where(and(eq(animais.loteId, loteId), eq(animais.status, "ativo")));
  return Number(row?.count ?? 0);
}

async function syncPastoStatus(pastoId: number, userId: number) {
  const [ocupacao] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(lotes)
    .where(and(eq(lotes.pastoAtualId, pastoId), eq(lotes.userId, userId)));
  const temLotes = Number(ocupacao?.count ?? 0) > 0;
  await db.update(pastos).set({ status: temLotes ? "ativo" : "descanso" })
    .where(and(eq(pastos.id, pastoId), eq(pastos.userId, userId)));
}

async function enrichLote(lote: typeof lotes.$inferSelect) {
  const qtdAnimais = await countAnimaisLote(lote.id);
  let pastoNome: string | null = null;
  let pastoCapacidade: number | null = null;
  let fazendaNome: string | null = null;
  if (lote.pastoAtualId) {
    const [pasto] = await db.select().from(pastos).where(eq(pastos.id, lote.pastoAtualId)).limit(1);
    pastoNome = pasto?.nome ?? null;
    pastoCapacidade = pasto?.capacidade ?? null;
    if (pasto?.fazendaId) {
      const [fazenda] = await db.select({ nome: fazendas.nome }).from(fazendas).where(eq(fazendas.id, pasto.fazendaId)).limit(1);
      fazendaNome = fazenda?.nome ?? null;
    }
  }
  const diasNoPasto = lote.dataEntradaPasto ? diasEntre(lote.dataEntradaPasto) : null;
  return { ...lote, qtdAnimais, pastoNome, pastoCapacidade, fazendaNome, diasNoPasto };
}

// ─── LOTES ROUTER ─────────────────────────────────────────────────────────────
const lotesRouter = router({
  gerenciamento: protectedProcedure
    .input(z.object({
      fazendaId: z.number().optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      try {
      const {
        calcularIdadeMeses,
        adicionarAnimalAoResumo,
        criarResumoSexoFaixa,
      } = await import('../shared/lote-faixas-idade');

      const lotesList = await db.select().from(lotes)
        .where(eq(lotes.userId, ctx.user.id))
        .orderBy(desc(lotes.createdAt));

      const pastoIds = [...new Set(lotesList.map(l => l.pastoAtualId).filter(Boolean) as number[])];
      const pastoFazendaMap = new Map<number, number>();
      if (pastoIds.length) {
        const pastosRows = await db.select({ id: pastos.id, fazendaId: pastos.fazendaId })
          .from(pastos)
          .where(inArray(pastos.id, pastoIds));
        pastosRows.forEach(p => {
          if (p.fazendaId) pastoFazendaMap.set(p.id, p.fazendaId);
        });
      }

      const fazendaIds = [...new Set([
        ...lotesList.map(l => l.fazendaId).filter(Boolean) as number[],
        ...pastoFazendaMap.values(),
      ])];
      const fazendaNomeMap = new Map<number, string>();
      if (fazendaIds.length) {
        const fazRows = await db.select({ id: fazendas.id, nome: fazendas.nome })
          .from(fazendas)
          .where(inArray(fazendas.id, fazendaIds));
        fazRows.forEach(f => fazendaNomeMap.set(f.id, f.nome));
      }

      const resolveFazendaId = (lote: typeof lotesList[0]) => {
        if (lote.fazendaId) return lote.fazendaId;
        if (lote.pastoAtualId) return pastoFazendaMap.get(lote.pastoAtualId) ?? null;
        return null;
      };

      const animaisAtivos = await db.select({
        loteId: animais.loteId,
        sexo: animais.sexo,
        dataNascimento: animais.dataNascimento,
      }).from(animais).where(and(
        eq(animais.userId, ctx.user.id),
        eq(animais.status, 'ativo'),
        isNotNull(animais.loteId),
      ));

      const resumoPorLote = new Map<number, ReturnType<typeof criarResumoSexoFaixa>>();
      const totalPorLote = new Map<number, number>();
      const hoje = new Date();
      for (const animal of animaisAtivos) {
        if (!animal.loteId) continue;
        const idade = calcularIdadeMeses(animal.dataNascimento, hoje);
        const atual = resumoPorLote.get(animal.loteId) ?? criarResumoSexoFaixa();
        resumoPorLote.set(animal.loteId, adicionarAnimalAoResumo(atual, animal.sexo, idade));
        totalPorLote.set(animal.loteId, (totalPorLote.get(animal.loteId) ?? 0) + 1);
      }

      let resultado = lotesList.map(lote => {
        const fazendaId = resolveFazendaId(lote);
        const resumo = resumoPorLote.get(lote.id) ?? criarResumoSexoFaixa();
        const totalAnimaisLote = totalPorLote.get(lote.id) ?? 0;
        const capacidade = lote.capacidade ?? null;
        const pctOcupacao = capacidade && capacidade > 0
          ? Math.round((totalAnimaisLote / capacidade) * 100)
          : null;
        const superlotado = capacidade !== null && capacidade > 0 && totalAnimaisLote > capacidade;
        return {
          id: lote.id,
          nome: lote.nome,
          fazendaId,
          fazendaNome: fazendaId ? (fazendaNomeMap.get(fazendaId) ?? null) : null,
          ativo: lote.ativo,
          machos: resumo.machos,
          femeas: resumo.femeas,
          machosSemIdade: resumo.machosSemIdade,
          femeasSemIdade: resumo.femeasSemIdade,
          capacidade,
          totalAnimais: totalAnimaisLote,
          pctOcupacao,
          superlotado,
        };
      });

      if (input?.fazendaId) {
        resultado = resultado.filter(l => l.fazendaId === input.fazendaId);
      }

      if (input?.search?.trim()) {
        const q = input.search.trim().toLowerCase();
        resultado = resultado.filter(l => l.nome.toLowerCase().includes(q));
      }

      return resultado;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return listLocalLotesGerenciamento(ctx.user.id, input ?? undefined);
      }
    }),

  mapaRebanho: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      pastoId: z.number().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const {
        calcularIdadeMeses,
        adicionarAnimalAoResumo,
        criarResumoSexoFaixa,
      } = await import('../shared/lote-faixas-idade');

      const [fazenda] = await db.select({ nome: fazendas.nome })
        .from(fazendas)
        .where(and(eq(fazendas.id, input.fazendaId), eq(fazendas.userId, ctx.user.id)))
        .limit(1);
      if (!fazenda) {
        return { rows: [], totalAnimaisSubdivisao: 0 };
      }

      const pastosConditions = [
        eq(pastos.userId, ctx.user.id),
        eq(pastos.fazendaId, input.fazendaId),
      ];
      if (input.pastoId) pastosConditions.push(eq(pastos.id, input.pastoId));

      const pastosList = await db.select().from(pastos).where(and(...pastosConditions));
      const pastoMap = new Map(pastosList.map(p => [p.id, p]));
      const pastoIds = pastosList.map(p => p.id);

      // Busca lotes da fazenda: com ou sem subdivisão vinculada
      const lotesConditions: Parameters<typeof and>[0][] = [
        eq(lotes.userId, ctx.user.id),
        eq(lotes.fazendaId, input.fazendaId),
      ];
      // Se filtrou por subdivisão específica, inclui apenas lotes desse pasto
      if (input.pastoId) {
        lotesConditions.push(eq(lotes.pastoAtualId, input.pastoId));
      }
      const lotesList = await db.select().from(lotes).where(and(...lotesConditions));

      if (lotesList.length === 0) {
        return { rows: [], totalAnimaisSubdivisao: 0 };
      }

      const loteIds = lotesList.map(l => l.id);
      const animaisAtivos = await db.select({
        loteId: animais.loteId,
        sexo: animais.sexo,
        dataNascimento: animais.dataNascimento,
      }).from(animais).where(and(
        eq(animais.userId, ctx.user.id),
        eq(animais.status, 'ativo'),
        inArray(animais.loteId, loteIds),
      ));

      const resumoPorLote = new Map<number, ReturnType<typeof criarResumoSexoFaixa>>();
      const totalPorLote = new Map<number, number>();
      const hoje = new Date();

      for (const animal of animaisAtivos) {
        if (!animal.loteId) continue;
        const idade = calcularIdadeMeses(animal.dataNascimento, hoje);
        const atual = resumoPorLote.get(animal.loteId) ?? criarResumoSexoFaixa();
        resumoPorLote.set(animal.loteId, adicionarAnimalAoResumo(atual, animal.sexo, idade));
        totalPorLote.set(animal.loteId, (totalPorLote.get(animal.loteId) ?? 0) + 1);
      }

      const totalPorPasto = new Map<number, number>();
      for (const lote of lotesList) {
        if (!lote.pastoAtualId) continue;
        const qtd = totalPorLote.get(lote.id) ?? 0;
        totalPorPasto.set(lote.pastoAtualId, (totalPorPasto.get(lote.pastoAtualId) ?? 0) + qtd);
      }

      let rows = lotesList.map(lote => {
        const pasto = lote.pastoAtualId ? pastoMap.get(lote.pastoAtualId) : null;
        const resumo = resumoPorLote.get(lote.id) ?? criarResumoSexoFaixa();
        const totalSubdivisao = pasto ? (totalPorPasto.get(pasto.id) ?? 0) : 0;
        const areaNum = pasto?.area != null && pasto.area !== '' ? Number(pasto.area) : null;
        const taxaLotacao = areaNum && areaNum > 0
          ? Math.round((totalSubdivisao / areaNum) * 100) / 100
          : null;

        return {
          loteId: lote.id,
          fazendaNome: fazenda.nome,
          subdivisaoNome: pasto?.nome ?? '—',
          pastoId: pasto?.id ?? null,
          loteNome: lote.nome,
          machos: resumo.machos,
          femeas: resumo.femeas,
          totalAnimaisSubdivisao: totalSubdivisao,
          areaHa: pasto?.area != null ? String(pasto.area) : null,
          taxaLotacao,
        };
      });

      if (input.search?.trim()) {
        const q = input.search.trim().toLowerCase();
        rows = rows.filter(r =>
          r.fazendaNome.toLowerCase().includes(q)
          || r.subdivisaoNome.toLowerCase().includes(q)
          || r.loteNome.toLowerCase().includes(q),
        );
      }

      rows.sort((a, b) => {
        const cmpSub = a.subdivisaoNome.localeCompare(b.subdivisaoNome, 'pt-BR');
        if (cmpSub !== 0) return cmpSub;
        return a.loteNome.localeCompare(b.loteNome, 'pt-BR');
      });

      const totalAnimaisSubdivisao = input.pastoId
        ? (totalPorPasto.get(input.pastoId) ?? 0)
        : [...totalPorPasto.values()].reduce((s, v) => s + v, 0);

      return { rows, totalAnimaisSubdivisao };
    }),

  list: protectedProcedure
    .input(z.object({ somenteAtivos: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const somenteAtivos = input?.somenteAtivos ?? false;
      try {
        const conditions = [eq(lotes.userId, ctx.user.id)];
        if (somenteAtivos) conditions.push(eq(lotes.ativo, true));
        const lotesList = await db.select().from(lotes)
          .where(and(...conditions))
          .orderBy(desc(lotes.createdAt));
        return Promise.all(lotesList.map(enrichLote));
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        let lotesList = await listLocalLotes(ctx.user.id);
        if (somenteAtivos) {
          lotesList = lotesList.filter(l => l.ativo !== false);
        }
        return Promise.all(lotesList.map(lote => enrichLocalLote(lote, ctx.user.id)));
      }
    }),

  listByPasto: protectedProcedure
    .input(z.object({ pastoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const lotesList = await db.select().from(lotes).where(
        and(eq(lotes.pastoAtualId, input.pastoId), eq(lotes.userId, ctx.user.id))
      );
      return Promise.all(lotesList.map(enrichLote));
    }),

  listMovimentacoes: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select().from(lotePastoMovimentacoes).where(
        and(eq(lotePastoMovimentacoes.loteId, input.loteId), eq(lotePastoMovimentacoes.userId, ctx.user.id))
      ).orderBy(desc(lotePastoMovimentacoes.dataEntrada));
      const pastoIds = [...new Set(rows.flatMap(r => [r.pastoOrigemId, r.pastoDestinoId].filter(Boolean) as number[]))];
      const pastoMap: Record<number, string> = {};
      if (pastoIds.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome }).from(pastos).where(inArray(pastos.id, pastoIds));
        pastosRows.forEach(p => { pastoMap[p.id] = p.nome; });
      }
      return rows.map(r => ({
        ...r,
        pastoOrigemNome: r.pastoOrigemId ? pastoMap[r.pastoOrigemId] ?? null : null,
        pastoDestinoNome: r.pastoDestinoId ? pastoMap[r.pastoDestinoId] ?? null : null,
      }));
    }),

  moveToPasto: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      pastoId: z.number().nullable(),
      observacoes: z.string().optional(),
      dataEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [lote] = await db.select().from(lotes).where(
          and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id))
        ).limit(1);
        if (!lote) throw new Error("Lote não encontrado");

        const hojeLimite = hojeISO();
        const hoje = input.dataEntrada ?? hojeLimite;
        if (hoje > hojeLimite) {
          throw new Error("A data de entrada no pasto não pode ser futura.");
        }

        const qtdAnimais = await countAnimaisLote(lote.id);
        const pastoOrigemId = lote.pastoAtualId ?? null;

        if (input.pastoId === pastoOrigemId) {
          return { success: true };
        }

        // Fecha estadia anterior
        if (pastoOrigemId) {
          const [aberta] = await db.select().from(lotePastoMovimentacoes).where(
            and(
              eq(lotePastoMovimentacoes.loteId, lote.id),
              eq(lotePastoMovimentacoes.pastoDestinoId, pastoOrigemId),
              isNull(lotePastoMovimentacoes.dataSaida),
            )
          ).limit(1);

          const dataEntrada = aberta?.dataEntrada ?? lote.dataEntradaPasto ?? hoje;
          const dias = diasEntre(dataEntrada, hoje);

          if (aberta) {
            await db.update(lotePastoMovimentacoes).set({ dataSaida: hoje, diasNoPasto: dias })
              .where(eq(lotePastoMovimentacoes.id, aberta.id));
          } else {
            await db.insert(lotePastoMovimentacoes).values({
              userId: ctx.user.id,
              loteId: lote.id,
              pastoOrigemId: null,
              pastoDestinoId: pastoOrigemId,
              dataEntrada,
              dataSaida: hoje,
              diasNoPasto: dias,
              qtdAnimais,
            });
          }
          await syncPastoStatus(pastoOrigemId, ctx.user.id);
        }

        if (input.pastoId === null) {
          await db.update(lotes).set({
            pastoAtualId: null,
            dataEntradaPasto: null,
            fazendaId: null,
          }).where(eq(lotes.id, lote.id));

          await db.update(animais)
            .set({ pastoId: null })
            .where(and(
              eq(animais.userId, ctx.user.id),
              eq(animais.loteId, lote.id),
              eq(animais.status, "ativo"),
            ));

          return { success: true };
        }

        const [pasto] = await db.select().from(pastos).where(
          and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id))
        ).limit(1);
        if (!pasto) throw new Error("Pasto não encontrado");

        await db.insert(lotePastoMovimentacoes).values({
          userId: ctx.user.id,
          loteId: lote.id,
          pastoOrigemId,
          pastoDestinoId: input.pastoId,
          dataEntrada: hoje,
          qtdAnimais,
          observacoes: input.observacoes,
        });

        await db.update(lotes).set({
          pastoAtualId: input.pastoId,
          fazendaId: pasto.fazendaId,
          dataEntradaPasto: hoje,
          localizacao: pasto.nome,
        }).where(eq(lotes.id, lote.id));

        await db.update(pastos).set({ status: "ativo" })
          .where(and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id)));

        await db.update(animais)
          .set({ pastoId: input.pastoId, fazendaId: pasto.fazendaId })
          .where(and(
            eq(animais.userId, ctx.user.id),
            eq(animais.loteId, lote.id),
            eq(animais.status, "ativo"),
          ));

        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return await moveLocalLoteToPasto(ctx.user.id, {
            loteId: input.loteId,
            pastoId: input.pastoId,
            dataEntrada: input.dataEntrada,
            observacoes: input.observacoes,
          });
        } catch (localError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: localError instanceof Error ? localError.message : "Lote ou pasto não encontrado.",
          });
        }
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const [lote] = await db.select().from(lotes)
          .where(and(eq(lotes.id, input.id), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (lote) return lote;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }

      const local = await getLocalLote(ctx.user.id, input.id);
      if (!local) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
      }
      return enrichLocalLote(local, ctx.user.id);
    }),

  create: protectedProcedure
    .input(z.object({
      nome: z.string(),
      sigla: z.string().optional(),
      dataCriacao: z.string().optional(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
      fazendaId: z.number({ required_error: "Selecione uma fazenda." }),
    }))
    .mutation(async ({ ctx, input }) => {
      const payload = {
        ...input,
        sigla: input.sigla?.trim() || undefined,
        dataCriacao: input.dataCriacao || hojeISO(),
      };
      try {
        const result = await db.insert(lotes).values({
          userId: ctx.user.id,
          ...payload,
        });
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        return { success: true, id };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          const result = await createLocalLote(ctx.user.id, payload);
          return { success: true, id: result.id, localFallback: true };
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível criar o lote. Verifique a conexão com o banco ou tente novamente.",
        });
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      sigla: z.string().optional(),
      dataCriacao: z.string().optional(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
      ativo: z.boolean().optional(),
      pastoAtualId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      // Permite salvar sigla como null quando string vazia é enviada
      const updateData = {
        ...rest,
        sigla: rest.sigla !== undefined ? (rest.sigla.trim() === '' ? null : rest.sigla.trim()) : undefined,
      };

      try {
        const [existing] = await db.select({ id: lotes.id }).from(lotes)
          .where(and(eq(lotes.id, id), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
        }

        await db.update(lotes).set(updateData).where(and(eq(lotes.id, id), eq(lotes.userId, ctx.user.id)));

        // Sincroniza pastoId e fazendaId de todos os animais do lote quando pastoAtualId é alterado
        if (rest.pastoAtualId !== undefined) {
          const animalPatch: { pastoId: number | null; fazendaId?: number } = {
            pastoId: rest.pastoAtualId,
          };
          if (rest.pastoAtualId != null) {
            const [pasto] = await db.select({ fazendaId: pastos.fazendaId })
              .from(pastos)
              .where(and(eq(pastos.id, rest.pastoAtualId), eq(pastos.userId, ctx.user.id)))
              .limit(1);
            if (pasto?.fazendaId) animalPatch.fazendaId = pasto.fazendaId;
          }
          await db.update(animais)
            .set(animalPatch)
            .where(and(
              eq(animais.userId, ctx.user.id),
              eq(animais.loteId, id),
              eq(animais.status, 'ativo'),
            ));
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          try {
            return await updateLocalLote(ctx.user.id, id, updateData);
          } catch (localError) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: localError instanceof Error ? localError.message : "Lote não encontrado.",
            });
          }
        }
        throw error;
      }
    }),

  incluirAnimais: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      animalIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [lote] = await db.select({
          id: lotes.id,
          fazendaId: lotes.fazendaId,
          pastoAtualId: lotes.pastoAtualId,
          ativo: lotes.ativo,
        })
          .from(lotes)
          .where(and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!lote) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
        }
        if (lote.ativo === false) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este Lote está inativo e não aceita novos animais.",
          });
        }
        if (!lote.fazendaId && !lote.pastoAtualId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.",
          });
        }

        const pastoFazendaMap = new Map<number, number>();
        if (lote.pastoAtualId) {
          const [pasto] = await db.select({ id: pastos.id, fazendaId: pastos.fazendaId })
            .from(pastos)
            .where(and(eq(pastos.id, lote.pastoAtualId), eq(pastos.userId, ctx.user.id)))
            .limit(1);
          if (pasto?.fazendaId) pastoFazendaMap.set(pasto.id, pasto.fazendaId);
        }
        const { fazendaId: fazendaIdLote, pastoId: pastoIdLote } = resolveAnimalLocalizacaoFromLote(lote, pastoFazendaMap);
        if (!fazendaIdLote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Este lote não possui fazenda vinculada. Defina a fazenda do lote antes de adicionar animais.",
          });
        }

        const animaisRows = await db.select({
          id: animais.id,
          fazendaId: animais.fazendaId,
          loteId: animais.loteId,
          status: animais.status,
        })
          .from(animais)
          .where(and(
            eq(animais.userId, ctx.user.id),
            inArray(animais.id, input.animalIds),
          ));

        if (animaisRows.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Nenhum animal válido foi encontrado para inclusão.",
          });
        }

        const validos: number[] = [];
        let erroAmigavel: string | null = null;
        for (const animal of animaisRows) {
          if (animal.status !== "ativo") {
            if (!erroAmigavel) erroAmigavel = "Só é possível adicionar animais ativos ao lote.";
            continue;
          }
          if (!animalCompativelComFazendaLote(animal, fazendaIdLote)) {
            if (!erroAmigavel) {
              erroAmigavel = "Este animal pertence a outra fazenda e não pode ser incluído neste lote.";
            }
            continue;
          }
          if (animal.loteId != null) {
            if (!erroAmigavel) {
              erroAmigavel = "Este animal já pertence a outro lote. Use a transferência entre lotes para movimentá-lo.";
            }
            continue;
          }
          validos.push(animal.id);
        }

        if (validos.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: erroAmigavel || "Nenhum animal válido para inclusão neste lote.",
          });
        }

        // Sincroniza fazenda, lote e subdivisão operacional do animal.
        await db.update(animais)
          .set({
            loteId: input.loteId,
            pastoId: pastoIdLote,
            fazendaId: fazendaIdLote,
          })
          .where(and(
            eq(animais.userId, ctx.user.id),
            inArray(animais.id, validos),
          ));

        return { success: true, count: validos.length };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return await incluirAnimaisLocalLote(ctx.user.id, input);
        } catch (localError) {
          const message = localError instanceof Error ? localError.message : "Não foi possível incluir os animais.";
          throw new TRPCError({
            code: message.includes("não encontrado") ? "NOT_FOUND" : "BAD_REQUEST",
            message,
          });
        }
      }
    }),

  movimentarAnimais: protectedProcedure
    .input(z.object({
      loteOrigemId: z.number(),
      loteDestinoId: z.number(),
      animalIds: z.array(z.number()).min(1),
      dataMovimentacao: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.loteOrigemId === input.loteDestinoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino deve ser diferente do lote de origem." });
      }

      const hoje = new Date();
      const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      if (input.dataMovimentacao > hojeISO) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data da movimentação não pode ser futura.",
        });
      }

      const usuarioNome = ctx.user.name || ctx.user.email || "Usuário";

      try {
        const [loteOrigem] = await db.select().from(lotes)
          .where(and(eq(lotes.id, input.loteOrigemId), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!loteOrigem) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote de origem não encontrado." });
        }

        const [loteDestino] = await db.select().from(lotes)
          .where(and(eq(lotes.id, input.loteDestinoId), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!loteDestino) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lote de destino não encontrado." });
        }
        if (loteDestino.ativo === false) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino não está ativo." });
        }
        if (
          loteOrigem.fazendaId != null
          && loteDestino.fazendaId != null
          && loteOrigem.fazendaId !== loteDestino.fazendaId
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A transferência entre lotes só é permitida dentro da mesma fazenda.",
          });
        }

        const animaisRows = await db.select({ id: animais.id })
          .from(animais)
          .where(and(
            eq(animais.userId, ctx.user.id),
            eq(animais.loteId, input.loteOrigemId),
            inArray(animais.id, input.animalIds),
          ));

        if (animaisRows.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum animal selecionado pertence ao lote de origem." });
        }

        const animalIds = animaisRows.map(a => a.id);
        const pastoFazendaMap = buildPastoFazendaMap(
          loteDestino.pastoAtualId
            ? (await db.select({ id: pastos.id, fazendaId: pastos.fazendaId })
              .from(pastos)
              .where(and(eq(pastos.id, loteDestino.pastoAtualId), eq(pastos.userId, ctx.user.id)))
              .limit(1))
            : [],
        );
        const { fazendaId: fazendaIdDestino, pastoId: pastoDestinoId } = resolveAnimalLocalizacaoFromLote(
          loteDestino,
          pastoFazendaMap,
        );
        const fazendaIdHistorico = loteOrigem.fazendaId ?? loteDestino.fazendaId ?? fazendaIdDestino ?? null;

        // Sincroniza fazenda, lote e subdivisão do destino.
        await db.update(animais)
          .set({
            loteId: input.loteDestinoId,
            pastoId: pastoDestinoId,
            ...(fazendaIdDestino != null ? { fazendaId: fazendaIdDestino } : {}),
          })
          .where(and(
            eq(animais.userId, ctx.user.id),
            eq(animais.loteId, input.loteOrigemId),
            inArray(animais.id, animalIds),
          ));

        await db.insert(animalLoteMovimentacoes).values(
          animalIds.map(animalId => ({
            userId: ctx.user.id,
            animalId,
            loteOrigemId: input.loteOrigemId,
            loteDestinoId: input.loteDestinoId,
            pastoOrigemId: loteOrigem.pastoAtualId ?? null,
            pastoDestinoId,
            fazendaId: fazendaIdHistorico,
            dataMovimentacao: input.dataMovimentacao,
            usuarioNome,
          })),
        );

        return {
          success: true,
          count: animalIds.length,
          loteDestinoNome: loteDestino.nome,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return await movimentarAnimaisLocalLote(ctx.user.id, input, usuarioNome);
        } catch (localError) {
          const message = localError instanceof Error
            ? localError.message
            : "Não foi possível transferir os animais.";
          throw new TRPCError({
            code: message.includes("não encontrado") ? "NOT_FOUND" : "BAD_REQUEST",
            message,
          });
        }
      }
    }),

  ultimaMovimentacaoPorAnimais: protectedProcedure
    .input(z.object({ animalIds: z.array(z.number()) }))
    .query(async ({ ctx, input }) => {
      if (input.animalIds.length === 0) return {} as Record<number, string>;
      const rows = await db.select({
        animalId: animalLoteMovimentacoes.animalId,
        dataMovimentacao: animalLoteMovimentacoes.dataMovimentacao,
      })
        .from(animalLoteMovimentacoes)
        .where(and(
          eq(animalLoteMovimentacoes.userId, ctx.user.id),
          inArray(animalLoteMovimentacoes.animalId, input.animalIds),
        ))
        .orderBy(desc(animalLoteMovimentacoes.dataMovimentacao), desc(animalLoteMovimentacoes.createdAt));

      const map: Record<number, string> = {};
      for (const r of rows) {
        if (!map[r.animalId]) map[r.animalId] = r.dataMovimentacao;
      }
      return map;
    }),

  transferirAnimaisAlocacao: protectedProcedure
    .input(z.object({
      animalIds: z.array(z.number()).min(1),
      loteDestinoId: z.number(),
      pastoDestinoId: z.number(),
      fazendaDestinoId: z.number(),
      dataMovimentacao: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [pasto] = await db.select().from(pastos)
        .where(and(
          eq(pastos.id, input.pastoDestinoId),
          eq(pastos.userId, ctx.user.id),
          eq(pastos.fazendaId, input.fazendaDestinoId),
        ))
        .limit(1);
      if (!pasto) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subdivisão de destino não encontrada." });
      }

      const [loteDestino] = await db.select().from(lotes)
        .where(and(
          eq(lotes.id, input.loteDestinoId),
          eq(lotes.userId, ctx.user.id),
        ))
        .limit(1);
      if (!loteDestino) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lote de destino não encontrado." });
      }
      if (loteDestino.ativo === false) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino não está ativo." });
      }
      if (loteDestino.pastoAtualId !== input.pastoDestinoId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O lote de destino não pertence à subdivisão selecionada." });
      }

      const animaisRows = await db.select({ id: animais.id, loteId: animais.loteId })
        .from(animais)
        .where(and(
          eq(animais.userId, ctx.user.id),
          inArray(animais.id, input.animalIds),
        ));

      const toMove = animaisRows.filter(a => a.loteId && a.loteId !== input.loteDestinoId);
      if (toMove.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum animal válido para transferência." });
      }

      const usuarioNome = ctx.user.name || ctx.user.email || "Usuário";
      const animalIds = toMove.map(a => a.id);

      await db.update(animais)
        .set({
          loteId: input.loteDestinoId,
          fazendaId: input.fazendaDestinoId,
          pastoId: input.pastoDestinoId,
        })
        .where(and(
          eq(animais.userId, ctx.user.id),
          inArray(animais.id, animalIds),
        ));

      await db.insert(animalLoteMovimentacoes).values(
        toMove.map(a => ({
          userId: ctx.user.id,
          animalId: a.id,
          loteOrigemId: a.loteId!,
          loteDestinoId: input.loteDestinoId,
          dataMovimentacao: input.dataMovimentacao,
          usuarioNome,
        })),
      );

      return {
        success: true,
        count: animalIds.length,
        loteDestinoNome: loteDestino.nome,
      };
    }),

  listHistoricoMovimentacoesAnimais: protectedProcedure
    .input(z.object({ animalId: z.number().optional(), loteId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(animalLoteMovimentacoes.userId, ctx.user.id)];
      if (input?.animalId) conditions.push(eq(animalLoteMovimentacoes.animalId, input.animalId));
      if (input?.loteId) {
        conditions.push(or(
          eq(animalLoteMovimentacoes.loteOrigemId, input.loteId),
          eq(animalLoteMovimentacoes.loteDestinoId, input.loteId),
        )!);
      }

      const rows = await db.select().from(animalLoteMovimentacoes)
        .where(and(...conditions))
        .orderBy(desc(animalLoteMovimentacoes.dataMovimentacao), desc(animalLoteMovimentacoes.createdAt));

      const loteIds = [...new Set(rows.flatMap(r => [r.loteOrigemId, r.loteDestinoId]))];
      const loteMap = new Map<number, string>();
      if (loteIds.length) {
        const lotesRows = await db.select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(inArray(lotes.id, loteIds));
        lotesRows.forEach(l => loteMap.set(l.id, l.nome));
      }

      return rows.map(r => ({
        ...r,
        loteOrigemNome: loteMap.get(r.loteOrigemId) ?? null,
        loteDestinoNome: loteMap.get(r.loteDestinoId) ?? null,
      }));
    }),

  removerAnimais: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      animalIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [lote] = await db.select({ id: lotes.id })
        .from(lotes)
        .where(and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id)))
        .limit(1);
      if (!lote) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
      }

      const animaisRows = await db.select({ id: animais.id })
        .from(animais)
        .where(and(
          eq(animais.userId, ctx.user.id),
          eq(animais.loteId, input.loteId),
          inArray(animais.id, input.animalIds),
        ));

      if (animaisRows.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhum animal selecionado pertence a este lote." });
      }

      await db.update(animais)
        .set({ loteId: null })
        .where(and(
          eq(animais.userId, ctx.user.id),
          eq(animais.loteId, input.loteId),
          inArray(animais.id, input.animalIds),
        ));

      return { success: true, count: animaisRows.length };
    }),

  verificarExclusao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        return await avaliarExclusaoLote(ctx.user.id, input.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível verificar o Lote.";
        throw new TRPCError({ code: "NOT_FOUND", message });
      }
    }),

  excluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executarExclusaoLote(ctx.user.id, input.id);
        return { success: true, nomeLote: result.nomeLote };
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Não foi possível excluir o Lote.";
        const isBlocked = message.includes("possui") && message.includes("animal")
          || message.includes("movimentações registradas");
        throw new TRPCError({
          code: isBlocked ? "PRECONDITION_FAILED" : "BAD_REQUEST",
          message,
        });
      }
    }),

  inativar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await executarInativacaoLote(ctx.user.id, input.id);
        return { success: true, nomeLote: result.nomeLote };
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Não foi possível inativar o Lote.";
        const isBlocked = message.includes("possui") && message.includes("animal");
        throw new TRPCError({
          code: isBlocked ? "PRECONDITION_FAILED" : "BAD_REQUEST",
          message,
        });
      }
    }),

  // ─── Mapa do Rebanho V2 (agrupado por Subdivisão) ──────────────────────────────
  mapaRebanhoV2: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      pastoId: z.number().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
      const [fazenda] = await db.select({ id: fazendas.id, nome: fazendas.nome })
        .from(fazendas)
        .where(and(eq(fazendas.id, input.fazendaId), eq(fazendas.userId, ctx.user.id)))
        .limit(1);
      if (!fazenda) return { subdivisoes: [], semSubdivisao: [] };

      const pastosList = await db.select().from(pastos)
        .where(and(eq(pastos.userId, ctx.user.id), eq(pastos.fazendaId, input.fazendaId)));
      const pastoMap = new Map(pastosList.map(p => [p.id, p]));

      const lotesConditions: Parameters<typeof and>[0][] = [
        eq(lotes.userId, ctx.user.id),
        eq(lotes.fazendaId, input.fazendaId),
      ];
      const lotesList = await db.select().from(lotes).where(and(...lotesConditions));

      // Buscar última saída de cada pasto para calcular dias em descanso
      const ultimaSaidaPorPasto = new Map<number, string>();
      if (pastosList.length > 0) {
        const pastoIds = pastosList.map(p => p.id);
        const ultimasSaidas = await db
          .select({
            pastoOrigemId: lotePastoMovimentacoes.pastoOrigemId,
            dataSaida: sql<string>`MAX(${lotePastoMovimentacoes.dataSaida})`,
          })
          .from(lotePastoMovimentacoes)
          .where(and(
            eq(lotePastoMovimentacoes.userId, ctx.user.id),
            inArray(lotePastoMovimentacoes.pastoOrigemId, pastoIds),
            isNotNull(lotePastoMovimentacoes.dataSaida),
          ))
          .groupBy(lotePastoMovimentacoes.pastoOrigemId);
        for (const row of ultimasSaidas) {
          if (row.pastoOrigemId && row.dataSaida) {
            ultimaSaidaPorPasto.set(row.pastoOrigemId, row.dataSaida);
          }
        }
      }

      if (lotesList.length === 0 && pastosList.length === 0) return { subdivisoes: [], semSubdivisao: [] };

      const loteIds = lotesList.map(l => l.id);
      const animaisRows = await db.select({ loteId: animais.loteId })
        .from(animais).where(and(
          eq(animais.userId, ctx.user.id),
          eq(animais.status, 'ativo'),
          inArray(animais.loteId, loteIds),
        ));
      const totalPorLote = new Map<number, number>();
      for (const a of animaisRows) {
        if (!a.loteId) continue;
        totalPorLote.set(a.loteId, (totalPorLote.get(a.loteId) ?? 0) + 1);
      }

      const hoje = hojeISO();
      const movsPorLote = await mapMovimentacoesPorLote(ctx.user.id, loteIds);
      const { porPasto, semSubdivisao: semSubdivisaoLotes, localizacaoPorLoteId } =
        agruparLotesPorLocalizacaoVigente(lotesList, movsPorLote, hoje);

      const q = input.search?.trim().toLowerCase() ?? '';

      const subdivisoes = [...porPasto.entries()]
        .map(([pastoId, lotesGrupo]) => {
          const pasto = pastoMap.get(pastoId)!;
          const totalAnimais = lotesGrupo.reduce((s, l) => s + (totalPorLote.get(l.id) ?? 0), 0);
          const areaNum = pasto.area != null && pasto.area !== '' ? Number(pasto.area) : null;
          const taxaLotacao = areaNum && areaNum > 0 ? Math.round((totalAnimais / areaNum) * 100) / 100 : null;
          // Status calculado dinamicamente: se há animais → ativo, senão → vazio
          const pastoStatusCalc = totalAnimais > 0 ? 'ativo' : 'vazio';
          return {
            pastoId,
            pastoNome: pasto.nome,
            pastoSigla: pasto.sigla ?? null,
            pastoStatus: pastoStatusCalc,
            areaHa: pasto.area != null ? String(pasto.area) : null,
            capacidade: pasto.capacidade ?? null,
            taxaLotacao,
            totalAnimais,
            diasVazio: null as number | null,
            lotes: lotesGrupo.map(l => ({
              loteId: l.id,
              loteNome: l.nome,
              loteSigla: l.sigla ?? null,
              dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
              totalAnimais: totalPorLote.get(l.id) ?? 0,
            })),
          };
        })
        .filter(s => !input.pastoId || s.pastoId === input.pastoId)
        .filter(s => !q || s.pastoNome.toLowerCase().includes(q) || s.lotes.some(l => l.loteNome.toLowerCase().includes(q)))
        .sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR'));

      // Pastos sem nenhum lote (vazios) — incluiímos mesmo sem animais
      const pastosComLote = new Set(porPasto.keys());
      const hojeDate = new Date();
      const pastosVazios = pastosList
        .filter(p => !pastosComLote.has(p.id))
        .filter(p => !input.pastoId || p.id === input.pastoId)
        .filter(p => !q || p.nome.toLowerCase().includes(q))
        .map(p => {
          const ultimaSaida = ultimaSaidaPorPasto.get(p.id);
          let diasVazio: number | null = null;
          if (ultimaSaida) {
            const saida = new Date(ultimaSaida);
            diasVazio = Math.floor((hojeDate.getTime() - saida.getTime()) / (1000 * 60 * 60 * 24));
          }
          return {
            pastoId: p.id,
            pastoNome: p.nome,
            pastoSigla: p.sigla ?? null,
            pastoStatus: 'vazio' as const,
            areaHa: p.area != null ? String(p.area) : null,
            capacidade: p.capacidade ?? null,
            taxaLotacao: 0,
            totalAnimais: 0,
            diasVazio,
            lotes: [],
          };
        })
        .sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR'));

      const semSubdivisao = semSubdivisaoLotes
        .filter(l => !input.pastoId)
        .filter(l => !q || l.nome.toLowerCase().includes(q))
        .map(l => ({
          loteId: l.id,
          loteNome: l.nome,
          loteSigla: l.sigla ?? null,
          dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
          totalAnimais: totalPorLote.get(l.id) ?? 0,
        }));

      return { subdivisoes: [...subdivisoes, ...pastosVazios].sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR')), semSubdivisao };
      } catch (error) {
        if (isDatabaseUnavailable(error)) return buildLocalMapaRebanhoV2(ctx.user.id, input);
        throw error;
      }
    }),

  mapaRebanhoHistorico: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      loteId: z.number().optional(),
      pastoId: z.number().optional(),
      limit: z.number().default(50),
    }))
    .query(async ({ ctx, input }) => {
      try {
      const loteNomeMap = new Map<number, string>();
      const conditions: Parameters<typeof and>[0][] = [
        eq(lotePastoMovimentacoes.userId, ctx.user.id),
      ];

      if (input.loteId) {
        const [lote] = await db.select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!lote) return [];
        loteNomeMap.set(lote.id, lote.nome);
        conditions.push(eq(lotePastoMovimentacoes.loteId, input.loteId));
      } else {
        const lotesFazenda = await db.select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(and(eq(lotes.userId, ctx.user.id), eq(lotes.fazendaId, input.fazendaId)));
        if (lotesFazenda.length === 0) return [];
        lotesFazenda.forEach(l => loteNomeMap.set(l.id, l.nome));
        conditions.push(inArray(lotePastoMovimentacoes.loteId, lotesFazenda.map(l => l.id)));
      }

      if (input.pastoId) {
        conditions.push(
          sql`(${lotePastoMovimentacoes.pastoOrigemId} = ${input.pastoId} OR ${lotePastoMovimentacoes.pastoDestinoId} = ${input.pastoId})`
        );
      }

      const rows = await db.select().from(lotePastoMovimentacoes)
        .where(and(...conditions))
        .orderBy(desc(lotePastoMovimentacoes.dataEntrada))
        .limit(input.limit * 2);

      const hoje = hojeISO();
      const rowsVigentes = rows.filter(r => movimentacaoExibivelHistorico(r, hoje));

      const pastoIds = [...new Set(rowsVigentes.flatMap(r =>
        [r.pastoOrigemId, r.pastoDestinoId].filter(Boolean) as number[]
      ))];
      const pastoNomeMap: Record<number, string> = {};
      if (pastoIds.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome })
          .from(pastos).where(inArray(pastos.id, pastoIds));
        pastosRows.forEach(p => { pastoNomeMap[p.id] = p.nome; });
      }

      // Nomes de lotes que aparecem no histórico mas não estavam no mapa inicial
      const missingLoteIds = [...new Set(rowsVigentes.map(r => r.loteId))].filter(id => !loteNomeMap.has(id));
      if (missingLoteIds.length) {
        const extraLotes = await db.select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(and(eq(lotes.userId, ctx.user.id), inArray(lotes.id, missingLoteIds)));
        extraLotes.forEach(l => loteNomeMap.set(l.id, l.nome));
      }

      const mapped = rowsVigentes.slice(0, input.limit).map(r => ({
        id: r.id,
        loteId: r.loteId,
        loteNome: loteNomeMap.get(r.loteId) ?? '—',
        pastoOrigemId: r.pastoOrigemId ?? null,
        pastoOrigemNome: r.pastoOrigemId ? (pastoNomeMap[r.pastoOrigemId] ?? '—') : null,
        pastoDestinoId: r.pastoDestinoId ?? null,
        pastoDestinoNome: r.pastoDestinoId ? (pastoNomeMap[r.pastoDestinoId] ?? '—') : null,
        dataEntrada: r.dataEntrada,
        dataSaida: r.dataSaida ?? null,
        diasNoPasto: r.diasNoPasto ?? null,
        qtdAnimais: r.qtdAnimais ?? null,
        observacoes: r.observacoes ?? null,
      }));

      if (input.loteId) {
        const [loteAtual] = await db.select({
          id: lotes.id,
          nome: lotes.nome,
          pastoAtualId: lotes.pastoAtualId,
          dataEntradaPasto: lotes.dataEntradaPasto,
        }).from(lotes).where(and(
          eq(lotes.id, input.loteId),
          eq(lotes.userId, ctx.user.id),
        )).limit(1);

        if (loteAtual) {
          const movsLote = await mapMovimentacoesPorLote(ctx.user.id, [loteAtual.id]);
          const loc = resolverLocalizacaoAtualLote(loteAtual, movsLote.get(loteAtual.id) ?? [], hoje);
          const hasOpenMov = mapped.some(m => m.loteId === input.loteId && !m.dataSaida);
          if (!hasOpenMov && loc.pastoId && loc.dataEntradaPasto) {
            const pastoDestinoId = loc.pastoId;
            if (!pastoNomeMap[pastoDestinoId]) {
              const [pastoRow] = await db.select({ id: pastos.id, nome: pastos.nome })
                .from(pastos)
                .where(eq(pastos.id, pastoDestinoId))
                .limit(1);
              if (pastoRow) pastoNomeMap[pastoRow.id] = pastoRow.nome;
            }
            const qtdAnimais = await countAnimaisLote(loteAtual.id);
            mapped.unshift({
              id: 0,
              loteId: loteAtual.id,
              loteNome: loteNomeMap.get(loteAtual.id) ?? loteAtual.nome,
              pastoOrigemId: null,
              pastoOrigemNome: null,
              pastoDestinoId,
              pastoDestinoNome: pastoNomeMap[pastoDestinoId] ?? '—',
              dataEntrada: loc.dataEntradaPasto,
              dataSaida: null,
              diasNoPasto: diasEntre(loc.dataEntradaPasto),
              qtdAnimais,
              observacoes: null,
            });
          }
        }
      }

      return mapped;
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return listLocalMapaRebanhoHistorico(ctx.user.id, input);
        }
        throw error;
      }
    }),

  // ─── Mapa do Rebanho Geral (todas as fazendas) ───────────────────────────
  mapaRebanhoGeral: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
      // Busca todas as fazendas do usuário
      const fazendasList = await db.select().from(fazendas)
        .where(eq(fazendas.userId, ctx.user.id));
      if (fazendasList.length === 0) return [];

      const fazendaIds = fazendasList.map(f => f.id);
      const fazendaMap = new Map(fazendasList.map(f => [f.id, f]));

      // Busca todos os pastos das fazendas
      const pastosList = await db.select().from(pastos)
        .where(and(eq(pastos.userId, ctx.user.id), inArray(pastos.fazendaId, fazendaIds)));
      const pastoMap = new Map(pastosList.map(p => [p.id, p]));

      // Busca todos os lotes das fazendas
      const lotesList = await db.select().from(lotes)
        .where(and(eq(lotes.userId, ctx.user.id), inArray(lotes.fazendaId, fazendaIds)));

      if (lotesList.length === 0) {
        return fazendasList.map(f => ({
          fazendaId: f.id,
          fazendaNome: f.nome,
          subdivisoes: [] as { pastoId: number; pastoNome: string; pastoSigla: string | null; pastoStatus: string | null; areaHa: string | null; taxaLotacao: number | null; totalAnimais: number; lotes: { loteId: number; loteNome: string; loteSigla: string | null; dataEntradaPasto: string | null; totalAnimais: number }[] }[],
          semSubdivisao: [] as { loteId: number; loteNome: string; loteSigla: string | null; dataEntradaPasto: string | null; totalAnimais: number }[],
          totalAnimais: 0,
        }));
      }

      const loteIds = lotesList.map(l => l.id);

      // Contagem de animais por lote
      const animaisRows = await db.select({ loteId: animais.loteId })
        .from(animais).where(and(
          eq(animais.userId, ctx.user.id),
          eq(animais.status, 'ativo'),
          inArray(animais.loteId, loteIds),
        ));
      const totalPorLote = new Map<number, number>();
      for (const a of animaisRows) {
        if (!a.loteId) continue;
        totalPorLote.set(a.loteId, (totalPorLote.get(a.loteId) ?? 0) + 1);
      }

      const q = input?.search?.trim().toLowerCase() ?? '';
      const hoje = hojeISO();
      const movsPorLote = await mapMovimentacoesPorLote(ctx.user.id, loteIds);

      // Agrupa por fazenda
      const resultadoPorFazenda = fazendasList.map(fazenda => {
        const lotesF = lotesList.filter(l => l.fazendaId === fazenda.id);
        const { porPasto, semSubdivisao: semSubdivisaoLotes, localizacaoPorLoteId } =
          agruparLotesPorLocalizacaoVigente(lotesF, movsPorLote, hoje);

        // Inclui TODOS os pastos da fazenda, mesmo os sem lotes atribuídos
        const pastosDaFazenda = pastosList.filter(p => p.fazendaId === fazenda.id);
        const subdivisoes = pastosDaFazenda
          .map(pasto => {
            const lotesGrupo = porPasto.get(pasto.id) ?? [];
            const totalAnimais = lotesGrupo.reduce((s, l) => s + (totalPorLote.get(l.id) ?? 0), 0);
            const areaNum = pasto.area != null && pasto.area !== '' ? Number(pasto.area) : null;
            const taxaLotacao = areaNum && areaNum > 0 ? Math.round((totalAnimais / areaNum) * 100) / 100 : null;
            // Status calculado dinamicamente: se há animais → ativo, senão → vazio
            const pastoStatusCalc = totalAnimais > 0 ? 'ativo' : 'vazio';
            return {
              pastoId: pasto.id,
              pastoNome: pasto.nome,
              pastoSigla: pasto.sigla ?? null,
              pastoStatus: pastoStatusCalc,
              areaHa: pasto.area != null ? String(pasto.area) : null,
              capacidade: pasto.capacidade ?? null,
              taxaLotacao,
              totalAnimais,
              lotes: lotesGrupo.map(l => ({
                loteId: l.id,
                loteNome: l.nome,
                loteSigla: l.sigla ?? null,
                dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
                totalAnimais: totalPorLote.get(l.id) ?? 0,
              })),
            };
          })
          .filter(s => !q || fazenda.nome.toLowerCase().includes(q) || s.pastoNome.toLowerCase().includes(q) || s.lotes.some(l => l.loteNome.toLowerCase().includes(q)))
          .sort((a, b) => a.pastoNome.localeCompare(b.pastoNome, 'pt-BR'));

        const semSubdivisao = semSubdivisaoLotes
          .filter(l => !q || fazenda.nome.toLowerCase().includes(q) || l.nome.toLowerCase().includes(q))
          .map(l => ({
            loteId: l.id,
            loteNome: l.nome,
            loteSigla: l.sigla ?? null,
            dataEntradaPasto: localizacaoPorLoteId.get(l.id)?.dataEntradaPasto ?? null,
            totalAnimais: totalPorLote.get(l.id) ?? 0,
          }));

        const totalAnimais = lotesF.reduce((s, l) => s + (totalPorLote.get(l.id) ?? 0), 0);

        return {
          fazendaId: fazenda.id,
          fazendaNome: fazenda.nome,
          subdivisoes,
          semSubdivisao,
          totalAnimais,
        };
      });

      // Filtra fazendas sem nada se houver busca
      return q
        ? resultadoPorFazenda.filter(f => f.subdivisoes.length > 0 || f.semSubdivisao.length > 0 || f.fazendaNome.toLowerCase().includes(q))
        : resultadoPorFazenda;
      } catch (error) {
        if (isDatabaseUnavailable(error)) return buildLocalMapaRebanhoGeral(ctx.user.id, input ?? undefined);
        throw error;
      }
    }),

  excluirMovimentacao: protectedProcedure
    .input(z.object({ movimentacaoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
      // Busca a movimentação e valida que pertence ao usuário
      const [mov] = await db.select().from(lotePastoMovimentacoes)
        .where(and(
          eq(lotePastoMovimentacoes.id, input.movimentacaoId),
          eq(lotePastoMovimentacoes.userId, ctx.user.id),
        ));
      if (!mov) throw new TRPCError({ code: 'NOT_FOUND', message: 'Movimentação não encontrada.' });
      const dataSaidaStr = mov.dataSaida ? String(mov.dataSaida).slice(0, 10) : null;
      if (!dataSaidaStr) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Não é possível excluir a movimentação atual. Use Mover Lote para corrigir a localização do Lote.',
        });
      }
      await db.delete(lotePastoMovimentacoes)
        .where(eq(lotePastoMovimentacoes.id, input.movimentacaoId));
      return { ok: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return await excluirLocalLotePastoMovimentacao(ctx.user.id, input.movimentacaoId);
        } catch (localError) {
          const msg = localError instanceof Error ? localError.message : "Movimentação não encontrada.";
          const isAtual = msg.includes("movimentação atual");
          throw new TRPCError({
            code: isAtual ? "BAD_REQUEST" : "NOT_FOUND",
            message: msg,
          });
        }
      }
    }),

  cancelarEstadiaSinteticaLote: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [lote] = await db.select({ id: lotes.id })
          .from(lotes)
          .where(and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id)))
          .limit(1);
        if (!lote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lote não encontrado.' });

        await db.update(lotes)
          .set({ pastoAtualId: null, dataEntradaPasto: null, localizacao: null })
          .where(eq(lotes.id, input.loteId));

        await db.update(animais)
          .set({ pastoId: null })
          .where(and(
            eq(animais.userId, ctx.user.id),
            eq(animais.loteId, input.loteId),
            eq(animais.status, "ativo"),
          ));

        return { ok: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return await cancelarLocalEstadiaSinteticaLote(ctx.user.id, input.loteId);
        } catch (localError) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: localError instanceof Error ? localError.message : "Lote não encontrado.",
          });
        }
      }
    }),
});
const saudeRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conditions = [eq(saudeRegistros.userId, ctx.user.id)];
        if (input?.animalId) conditions.push(eq(saudeRegistros.animalId, input.animalId));
        const rows = await db
          .select()
          .from(saudeRegistros)
          .where(and(...conditions))
          .orderBy(desc(saudeRegistros.createdAt));
        if (rows.length > 0) return rows;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      return listLocalSaudeRegistros(ctx.user.id, input?.animalId);
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      medicamento: z.string().optional(),
      dosagem: z.string().optional(),
      veterinario: z.string().optional(),
      custo: z.string().optional(),
      dataRegistro: z.string(),
      proximaData: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { dataRegistro, proximaData, ...rest } = input;
        const result = await db.insert(saudeRegistros).values({
          userId: ctx.user.id,
          ...rest,
          dataRegistro: new Date(dataRegistro),
          proximaData: proximaData ? new Date(proximaData) : undefined,
        });
        return { success: true, id: (result as any)[0]?.insertId };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const result = await createLocalSaudeRegistro(ctx.user.id, input);
        return { success: true, id: result.id, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(saudeRegistros).where(and(eq(saudeRegistros.id, input.id), eq(saudeRegistros.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        await deleteLocalSaudeRegistro(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }
    }),
});

// ─── REPRODUCAO ROUTER ────────────────────────────────────────────────────────
const reproducaoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await db
        .select()
        .from(reproducaoRegistros)
        .where(eq(reproducaoRegistros.userId, ctx.user.id))
        .orderBy(desc(reproducaoRegistros.createdAt));
      if (rows.length > 0) return rows;
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
    }
    return listLocalReproducaoRegistros(ctx.user.id);
  }),

  create: protectedProcedure
    .input(z.object({
      femeaId: z.number(),
      machoId: z.number().optional(),
      tipo: z.string(),
      dataCobertura: z.string(),
      dataPrevistoParto: z.string().optional(),
      resultado: z.string().optional(),
      reprodutorSemen: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dataCobertura, dataPrevistoParto, reprodutorSemen, responsavel, observacoes, ...rest } = input;
      const payload = {
        userId: ctx.user.id,
        ...rest,
        observacoes: packReproObservacoes(observacoes, reprodutorSemen, responsavel),
        dataCobertura: new Date(dataCobertura),
        dataPrevistoParto: dataPrevistoParto ? new Date(dataPrevistoParto) : undefined,
      };
      try {
        const result = await db.insert(reproducaoRegistros).values(payload);
        return { success: true, id: (result as any)[0]?.insertId };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const result = await createLocalReproducaoRegistro(ctx.user.id, {
          femeaId: input.femeaId,
          machoId: input.machoId,
          tipo: input.tipo,
          dataCobertura: input.dataCobertura,
          dataPrevistoParto: input.dataPrevistoParto,
          resultado: input.resultado,
          observacoes: packReproObservacoes(observacoes, reprodutorSemen, responsavel),
        });
        return { success: true, id: result.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      tipo: z.string(),
      dataCobertura: z.string(),
      dataPrevistoParto: z.string().nullable().optional(),
      resultado: z.string().optional(),
      reprodutorSemen: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        dataCobertura,
        dataPrevistoParto,
        reprodutorSemen,
        responsavel,
        observacoes,
        tipo,
        resultado,
      } = input;
      const payload = {
        tipo,
        resultado: resultado ?? null,
        observacoes: packReproObservacoes(observacoes, reprodutorSemen, responsavel) ?? null,
        dataCobertura: new Date(dataCobertura),
        dataPrevistoParto: dataPrevistoParto ? new Date(dataPrevistoParto) : null,
      };
      try {
        await db.update(reproducaoRegistros).set(payload).where(
          and(eq(reproducaoRegistros.id, id), eq(reproducaoRegistros.userId, ctx.user.id)),
        );
        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        await updateLocalReproducaoRegistro(ctx.user.id, id, {
          tipo,
          dataCobertura,
          dataPrevistoParto: dataPrevistoParto ?? null,
          resultado,
          observacoes: packReproObservacoes(observacoes, reprodutorSemen, responsavel),
        });
        return { success: true, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(reproducaoRegistros).where(and(eq(reproducaoRegistros.id, input.id), eq(reproducaoRegistros.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        await deleteLocalReproducaoRegistro(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }
    }),
});

// ─── MAQUINAS ROUTER ──────────────────────────────────────────────────────────
const TIPOS_MEDIDOR_Z = z.enum(["horimetro", "quilometragem", "sem_medidor"]);

function isMaquinaAtivaRow(m: { status?: string | null; dataDesativacao?: unknown }): boolean {
  if (m.dataDesativacao) return false;
  if (m.status === "inativo") return false;
  return true;
}

/** Compara updatedAt/createdAt de forma estável (Date, ISO string, etc.). */
function timestampMs(value: unknown): number {
  if (value == null || value === "") return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  const t = new Date(String(value)).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isBlankMaquinaField(value: unknown): boolean {
  return value == null || value === "";
}

const MAQUINA_CADASTRO_KEYS = [
  "tipo",
  "marca",
  "fazendaId",
  "tipoMedidor",
  "nome",
  "modelo",
  "placa",
  "valor",
  "horimetro",
  "estado",
  "ano",
  "anoAquisicao",
  "dataAquisicao",
  "vidaUtil",
  "status",
  "observacoes",
  "imagem1",
  "imagem2",
  "imagem3",
] as const;

function mergeMaquinaDbComLocal<T extends Record<string, any>>(
  dbRow: T,
  local: Record<string, any> | null | undefined,
): T {
  if (!local) return dbRow;
  const localMs = timestampMs(local.updatedAt ?? local.createdAt);
  const dbMs = timestampMs(dbRow.updatedAt ?? dbRow.createdAt);
  // Empate ou local mais novo: preferir local (último save com MySQL offline/parcial).
  const merged = (localMs >= dbMs ? { ...dbRow, ...local } : { ...local, ...dbRow }) as T;
  for (const key of MAQUINA_CADASTRO_KEYS) {
    const localVal = local[key];
    if (isBlankMaquinaField(localVal)) continue;
    // Local mais novo: cadastro local sempre vence (evita DB incompleto/stale).
    // Local mais antigo: só preenche se o valor final ainda estiver em branco.
    if (localMs >= dbMs || isBlankMaquinaField(merged[key])) {
      (merged as Record<string, unknown>)[key] = localVal;
    }
  }
  // Garante updatedAt mais recente para o cliente re-hidratar o formulário.
  if (localMs >= dbMs && local.updatedAt != null) {
    (merged as Record<string, unknown>).updatedAt = local.updatedAt;
  }
  return merged;
}

/** Bloqueia novos vínculos operacionais em máquinas Inativas. */
async function assertMaquinaAtivaParaOperacao(
  userId: number,
  maquinaId: number,
  opts?: { allowSameInactiveId?: number | null },
) {
  let row: { id: number; status: string | null; dataDesativacao: unknown } | null = null;
  try {
    const [found] = await db
      .select({
        id: maquinas.id,
        status: maquinas.status,
        dataDesativacao: maquinas.dataDesativacao,
      })
      .from(maquinas)
      .where(and(eq(maquinas.id, maquinaId), eq(maquinas.userId, userId)))
      .limit(1);
    row = found ?? null;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const local = await getLocalMaquina(userId, maquinaId);
    row = local
      ? {
          id: local.id,
          status: (local.status as string | null) ?? null,
          dataDesativacao: local.dataDesativacao ?? null,
        }
      : null;
  }

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
  }
  if (isMaquinaAtivaRow(row)) return;
  if (opts?.allowSameInactiveId != null && opts.allowSameInactiveId === maquinaId) return;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Máquina inativa. Reative a máquina para novos lançamentos operacionais.",
  });
}

const MSG_MAQUINA_COM_VINCULOS =
  "Esta máquina possui registros vinculados e não pode ser excluída. Inative a máquina para impedir novos lançamentos sem perder o histórico.";

/** Verifica abastecimentos, manutenções (custos/históricos) e vínculos operacionais. */
async function assertMaquinaSemVinculos(userId: number, maquinaId: number): Promise<void> {
  const [abCount] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(abastecimentos)
    .where(and(eq(abastecimentos.maquinaId, maquinaId), eq(abastecimentos.userId, userId)));
  if (Number(abCount?.c ?? 0) > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_COM_VINCULOS });
  }

  const [manCount] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(manutencoes)
    .where(and(eq(manutencoes.maquinaId, maquinaId), eq(manutencoes.userId, userId)));
  if (Number(manCount?.c ?? 0) > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_COM_VINCULOS });
  }

  // Movimentações de estoque geradas por abastecimentos desta máquina (histórico operacional).
  const [movCount] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(estoqueMovimentacoes)
    .innerJoin(abastecimentos, eq(estoqueMovimentacoes.abastecimentoId, abastecimentos.id))
    .where(and(eq(abastecimentos.maquinaId, maquinaId), eq(abastecimentos.userId, userId)));
  if (Number(movCount?.c ?? 0) > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_COM_VINCULOS });
  }
}

async function listMaquinaIdsComVinculo(userId: number): Promise<number[]> {
  const abRows = await db
    .selectDistinct({ maquinaId: abastecimentos.maquinaId })
    .from(abastecimentos)
    .where(eq(abastecimentos.userId, userId));
  const manRows = await db
    .selectDistinct({ maquinaId: manutencoes.maquinaId })
    .from(manutencoes)
    .where(eq(manutencoes.userId, userId));
  const ids = new Set<number>();
  for (const row of abRows) {
    if (row.maquinaId != null) ids.add(row.maquinaId);
  }
  for (const row of manRows) {
    if (row.maquinaId != null) ids.add(row.maquinaId);
  }
  return [...ids];
}

function normalizePlacaIdent(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

async function assertMaquinaSemDuplicidade(opts: {
  userId: number;
  fazendaId: number;
  nome: string;
  placa?: string | null;
  excludeId?: number;
}) {
  let rows: Array<{
    id: number;
    nome: string | null;
    placa: string | null;
    status: string | null;
    dataDesativacao: unknown;
    fazendaId: number | null;
  }>;

  try {
    rows = await db
      .select({
        id: maquinas.id,
        nome: maquinas.nome,
        placa: maquinas.placa,
        status: maquinas.status,
        dataDesativacao: maquinas.dataDesativacao,
        fazendaId: maquinas.fazendaId,
      })
      .from(maquinas)
      .where(and(eq(maquinas.userId, opts.userId), eq(maquinas.fazendaId, opts.fazendaId)));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const locais = await listLocalMaquinas(opts.userId);
    rows = locais
      .filter(m => Number(m.fazendaId) === opts.fazendaId)
      .map(m => ({
        id: m.id,
        nome: m.nome ?? null,
        placa: m.placa ?? null,
        status: m.status ?? null,
        dataDesativacao: m.dataDesativacao ?? null,
        fazendaId: m.fazendaId ?? null,
      }));
  }

  const nomeNorm = opts.nome.trim().toLowerCase();
  const placaNorm = opts.placa ? normalizePlacaIdent(opts.placa) : "";

  for (const row of rows) {
    if (opts.excludeId != null && row.id === opts.excludeId) continue;
    if (!isMaquinaAtivaRow(row)) continue;

    if (row.nome?.trim().toLowerCase() === nomeNorm) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Já existe uma máquina ativa com este nome de identificação na Fazenda selecionada.",
      });
    }
    if (placaNorm && row.placa && normalizePlacaIdent(row.placa) === placaNorm) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Já existe uma máquina ativa com esta identificação na Fazenda selecionada.",
      });
    }
  }
}

function parseLeituraNaoNegativa(raw: string | undefined, label: string): string | undefined {
  if (raw == null || !String(raw).trim()) return undefined;
  const n = parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(n) || n < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} não pode ser negativa.`,
    });
  }
  return String(n);
}

function parseValorNaoNegativo(raw: string | undefined): string | undefined {
  if (raw == null || !String(raw).trim() || raw === "0" || raw === "0.00") return undefined;
  const n = parseFloat(String(raw).replace(",", "."));
  if (Number.isNaN(n) || n < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Valor de aquisição não pode ser negativo.",
    });
  }
  return n.toFixed(2);
}

// Campos comuns a create e update (todos opcionais — create valida no client)
const maquinasBaseFields = {
  nome: z.string().optional(),
  tipo: z.string().min(1).optional(),
  marca: z.string().min(1).optional(),
  fazendaId: z.number().int().positive().optional(),
  ano: z.number().int().min(1900).max(2100).optional(),
  anoAquisicao: z.number().optional(),
  dataAquisicao: z.string().optional(),
  modelo: z.string().optional(),
  placa: z.string().optional(),
  valor: z.string().optional(),
  vidaUtil: z.string().optional(),
  dataDesativacao: z.string().optional(),
  estado: z.enum(["novo", "usado"]).optional(),
  horimetro: z.string().optional(),
  tipoMedidor: TIPOS_MEDIDOR_Z.optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

// Create exige nome, tipo, marca, fazendaId e tipoMedidor
const maquinasInputFields = {
  ...maquinasBaseFields,
  nome: z.string().min(1),
  fazendaId: z.number().int().positive(),
  tipo: z.string().min(1),
  marca: z.string().min(1),
  tipoMedidor: TIPOS_MEDIDOR_Z,
};

const maquinasRouter = router({
  // ── Gera planilha-modelo para importação de maquinários ──────────────────────────
  gerarModeloPlanilha: protectedProcedure
    .mutation(async () => {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
      const {
        COLUNAS_IMPORTACAO,
        TIPOS_MAQUINA: TIPOS_MAQUINA_LIST,
        CONDICOES_AQUISICAO_PLANILHA,
        TIPOS_MEDIDOR_PLANILHA,
      } = await import('../shared/importacaoMaquinarios');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fazenda Digital';
      wb.created = new Date();

      const COR_HEADER_BG  = '1A3C3C';
      const COR_OBRIG_BG   = 'B8860B';
      const COR_COL_BG     = '2D5A5A';
      const COR_LINHA_ALT  = 'F2F7F7';
      const NUM_LINHAS_DADOS = 100; // linhas 2..101

      const { MARCAS_POR_TIPO } = await import('../shared/maquina-types');
      const tiposMaquina = Object.keys(MARCAS_POR_TIPO);

      const ws = wb.addWorksheet('Maquinários', {
        properties: { tabColor: { argb: COR_COL_BG } },
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      const headerRow = ws.getRow(1);
      headerRow.height = 36;
      COLUNAS_IMPORTACAO.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.label + (col.obrigatorio ? ' *' : '');
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: col.obrigatorio ? COR_OBRIG_BG : COR_COL_BG },
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          bottom: { style: 'medium', color: { argb: COR_HEADER_BG } },
          right:  { style: 'thin',   color: { argb: 'FFFFFF' } },
        };
        cell.protection = { locked: true };
        ws.getColumn(idx + 1).width = col.largura;
      });

      const colKeysTexto = new Set(['nome', 'modelo', 'placa', 'dataAquisicao', 'observacoes', 'ano', 'vidaUtil', 'leituraInicial', 'valor']);
      for (let r = 2; r <= NUM_LINHAS_DADOS + 1; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        COLUNAS_IMPORTACAO.forEach((col, idx) => {
          const cell = row.getCell(idx + 1);
          const isAlt = (r % 2 === 0);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: col.obrigatorio ? 'FFF8E1' : (isAlt ? COR_LINHA_ALT : 'FFFFFF') },
          };
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
          cell.protection = { locked: false };
          if (colKeysTexto.has(col.key)) {
            cell.numFmt = '@';
          }
        });
      }

      // Aba auxiliar oculta: Tipos, Marcas dependentes, Condição, Tipo de medidor
      const wsListas = wb.addWorksheet('_Listas', {
        state: 'veryHidden',
        properties: { tabColor: { argb: '888888' } },
      });

      // A: Tipos | B+C: Tipo→Marca (longo) | D: Condição | E: Tipo de medidor
      tiposMaquina.forEach((tipo, i) => { wsListas.getCell(i + 1, 1).value = tipo; });
      let linhaLista = 1;
      Object.entries(MARCAS_POR_TIPO).forEach(([tipo, marcas]) => {
        marcas.forEach((marca) => {
          wsListas.getCell(linhaLista, 2).value = tipo;
          wsListas.getCell(linhaLista, 3).value = marca;
          linhaLista++;
        });
      });
      CONDICOES_AQUISICAO_PLANILHA.forEach((v, i) => { wsListas.getCell(i + 1, 4).value = v; });
      TIPOS_MEDIDOR_PLANILHA.forEach((v, i) => { wsListas.getCell(i + 1, 5).value = v; });

      const numTipos = tiposMaquina.length;
      const idxDe = (key: string) => COLUNAS_IMPORTACAO.findIndex(c => c.key === key) + 1;
      const colIdxTipo = idxDe('tipo');
      const colIdxMarca = idxDe('marca');
      const colIdxEstado = idxDe('estado');
      const colIdxMedidor = idxDe('tipoMedidor');
      const letraColTipo = String.fromCharCode(64 + colIdxTipo);

      const dvInline: { colIdx: number; formulae: string[]; error: string }[] = [
        {
          colIdx: colIdxTipo,
          formulae: [`"${TIPOS_MAQUINA_LIST.join(',')}"`],
          error: 'Selecione um Tipo de máquina da lista.',
        },
        {
          colIdx: colIdxEstado,
          formulae: [`"${CONDICOES_AQUISICAO_PLANILHA.join(',')}"`],
          error: 'Selecione Nova ou Usada.',
        },
        {
          colIdx: colIdxMedidor,
          formulae: [`"${TIPOS_MEDIDOR_PLANILHA.join(',')}"`],
          error: 'Selecione Horímetro, Quilometragem ou Sem medidor.',
        },
      ].filter(d => d.colIdx > 0);

      for (let r = 2; r <= NUM_LINHAS_DADOS + 1; r++) {
        dvInline.forEach(({ colIdx, formulae, error }) => {
          ws.getRow(r).getCell(colIdx).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae,
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error,
          };
        });
        if (colIdxMarca > 0 && colIdxTipo > 0 && numTipos > 0) {
          const marcaFormula =
            `OFFSET(_Listas!$C$1,MATCH($${letraColTipo}${r},_Listas!$B:$B,0)-1,0,COUNTIF(_Listas!$B:$B,$${letraColTipo}${r}),1)`;
          ws.getRow(r).getCell(colIdxMarca).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [marcaFormula],
            showErrorMessage: true,
            errorTitle: 'Marca inválida',
            error: 'Selecione primeiro o Tipo. A lista de Marcas depende do Tipo escolhido.',
          };
        }
      }

      try {
        await ws.protect('fazenda-digital-maquinas', {
          selectLockedCells: true,
          selectUnlockedCells: true,
          formatCells: false,
          formatColumns: false,
          formatRows: false,
          insertColumns: false,
          insertRows: false,
          insertHyperlinks: false,
          deleteColumns: false,
          deleteRows: false,
          sort: false,
          autoFilter: false,
          pivotTables: false,
        });
      } catch (protectErr) {
        console.warn('[maquinas.gerarModeloPlanilha] Proteção da planilha não aplicada:', protectErr);
      }

      const buf = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return { base64, filename: 'modelo_importacao_maquinarios.xlsx' };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const locais = await listLocalMaquinas(ctx.user.id).catch(() => [] as Awaited<ReturnType<typeof listLocalMaquinas>>);
    try {
      const rows = await db
        .select()
        .from(maquinas)
        .where(eq(maquinas.userId, ctx.user.id))
        .orderBy(desc(maquinas.createdAt));
      if (locais.length === 0) return rows;
      const localById = new Map(locais.map(m => [m.id, m]));
      const merged = rows.map(row => mergeMaquinaDbComLocal(row, localById.get(row.id)));
      const rowIds = new Set(rows.map(r => r.id));
      for (const local of locais) {
        if (!rowIds.has(local.id)) merged.push(local as (typeof rows)[number]);
      }
      return merged.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return locais;
    }
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const local = await getLocalMaquina(ctx.user.id, input.id).catch(() => null);
      try {
        const [row] = await db.select().from(maquinas).where(
          and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id))
        );
        if (!row && !local) return null;
        if (!row) return local;
        if (!local) return row;
        return mergeMaquinaDbComLocal(row, local);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return local;
      }
    }),

  create: protectedProcedure
    .input(z.object(maquinasInputFields))
    .mutation(async ({ ctx, input }) => {
      const {
        dataDesativacao: _ignoreDesativacao,
        imageSlots,
        nome,
        valor,
        horimetro,
        tipoMedidor,
        placa,
        dataAquisicao,
        vidaUtil,
        ...rest
      } = input;

      const nomeTrim = nome.trim();
      if (!nomeTrim) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o nome de identificação da máquina.",
        });
      }

      if (tipoMedidor !== "sem_medidor" && (horimetro == null || !String(horimetro).trim())) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            tipoMedidor === "quilometragem"
              ? "Informe a quilometragem inicial."
              : "Informe o horímetro inicial.",
        });
      }

      const placaNorm = placa?.trim() ? normalizePlacaIdent(placa) : undefined;
      const leitura =
        tipoMedidor === "sem_medidor"
          ? undefined
          : parseLeituraNaoNegativa(
              horimetro,
              tipoMedidor === "quilometragem" ? "Quilometragem inicial" : "Horímetro inicial",
            );

      if (vidaUtil?.trim()) {
        const vida = parseInt(vidaUtil.replace(/[^\d]/g, ""), 10);
        if (Number.isNaN(vida) || vida <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vida útil estimada deve ser um número positivo.",
          });
        }
      }

      await assertMaquinaSemDuplicidade({
        userId: ctx.user.id,
        fazendaId: input.fazendaId,
        nome: nomeTrim,
        placa: placaNorm,
      });

      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const anoFromData = dataAquisicao?.trim()
        ? parseInt(dataAquisicao.slice(0, 4), 10)
        : undefined;

      const row = {
        userId: ctx.user.id,
        ...rest,
        nome: nomeTrim,
        placa: placaNorm,
        tipoMedidor,
        horimetro: leitura,
        dataAquisicao: dataAquisicao?.trim() || undefined,
        anoAquisicao: anoFromData && !Number.isNaN(anoFromData) ? anoFromData : rest.anoAquisicao,
        valor: parseValorNaoNegativo(valor),
        vidaUtil: vidaUtil?.trim() || undefined,
        status: "ativo" as const,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      };

      try {
        const result = await db.insert(maquinas).values(row);
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await updateLocalMaquina(ctx.user.id, id, row);
          } catch (mirrorError) {
            console.warn("[maquinas.create] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          const result = await createLocalMaquina(ctx.user.id, row);
          return { success: true, id: result.id, localFallback: true };
        }
        console.error("[maquinas.create]", err);
        throw new Error("Não foi possível salvar a máquina. Verifique os dados e tente novamente.");
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...maquinasBaseFields }))
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        dataDesativacao,
        imageSlots,
        nome,
        tipo,
        marca,
        fazendaId,
        valor,
        horimetro,
        tipoMedidor,
        placa,
        dataAquisicao,
        vidaUtil,
        status: _ignoreStatus,
        ...rest
      } = input;

      let existing: Record<string, any> | null = null;
      let usingLocal = false;
      try {
        const [row] = await db
          .select()
          .from(maquinas)
          .where(and(eq(maquinas.id, id), eq(maquinas.userId, ctx.user.id)));
        existing = row ?? null;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        usingLocal = true;
      }
      if (!existing) {
        existing = await getLocalMaquina(ctx.user.id, id);
        if (existing) usingLocal = true;
      }
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
      }

      const nextFazendaId = fazendaId ?? existing.fazendaId;
      const nextNome = nome !== undefined ? nome.trim() : existing.nome;
      if (!nextNome) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o nome de identificação da máquina.",
        });
      }

      const nextTipoMedidor = tipoMedidor ?? (existing.tipoMedidor as z.infer<typeof TIPOS_MEDIDOR_Z> | null);
      const nextPlaca =
        placa !== undefined ? (placa.trim() ? normalizePlacaIdent(placa) : null) : existing.placa;

      if (
        nextTipoMedidor &&
        nextTipoMedidor !== "sem_medidor" &&
        horimetro !== undefined &&
        !String(horimetro).trim()
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            nextTipoMedidor === "quilometragem"
              ? "Informe a quilometragem inicial."
              : "Informe o horímetro inicial.",
        });
      }

      if (vidaUtil?.trim()) {
        const vida = parseInt(vidaUtil.replace(/[^\d]/g, ""), 10);
        if (Number.isNaN(vida) || vida <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Vida útil estimada deve ser um número positivo.",
          });
        }
      }

      if (nextFazendaId) {
        await assertMaquinaSemDuplicidade({
          userId: ctx.user.id,
          fazendaId: nextFazendaId,
          nome: nextNome,
          placa: nextPlaca,
          excludeId: id,
        });
      }

      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const leitura =
        horimetro !== undefined
          ? nextTipoMedidor === "sem_medidor"
            ? null
            : parseLeituraNaoNegativa(
                horimetro,
                nextTipoMedidor === "quilometragem" ? "Quilometragem inicial" : "Horímetro inicial",
              ) ?? null
          : undefined;

      const anoFromData = dataAquisicao?.trim()
        ? parseInt(dataAquisicao.slice(0, 4), 10)
        : undefined;

      const patch = {
        ...rest,
        ...(nome !== undefined ? { nome: nextNome } : {}),
        ...(tipo !== undefined ? { tipo: tipo.trim() || null } : {}),
        ...(marca !== undefined ? { marca: marca.trim() || null } : {}),
        ...(fazendaId !== undefined ? { fazendaId } : {}),
        ...(placa !== undefined ? { placa: nextPlaca } : {}),
        ...(tipoMedidor !== undefined ? { tipoMedidor: tipoMedidor || null } : {}),
        ...(leitura !== undefined ? { horimetro: leitura } : {}),
        ...(dataAquisicao !== undefined
          ? {
              dataAquisicao: dataAquisicao.trim() || null,
              ...(anoFromData && !Number.isNaN(anoFromData) ? { anoAquisicao: anoFromData } : {}),
            }
          : {}),
        ...(valor !== undefined ? { valor: parseValorNaoNegativo(valor) ?? null } : {}),
        ...(vidaUtil !== undefined ? { vidaUtil: vidaUtil.trim() || null } : {}),
        ...(dataDesativacao !== undefined
          ? { dataDesativacao: dataDesativacao ? new Date(dataDesativacao) : null }
          : {}),
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      };

      // Sempre grava no espelho local primeiro — fonte confiável com MySQL offline.
      await updateLocalMaquina(ctx.user.id, id, patch);
      const localAfter = await getLocalMaquina(ctx.user.id, id);

      if (usingLocal) {
        return {
          success: true,
          localFallback: true,
          maquina: localAfter ?? { ...existing, ...patch, id, userId: ctx.user.id },
        };
      }

      try {
        await db
          .update(maquinas)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(maquinas.id, id), eq(maquinas.userId, ctx.user.id)));
        const [row] = await db
          .select()
          .from(maquinas)
          .where(and(eq(maquinas.id, id), eq(maquinas.userId, ctx.user.id)));
        return {
          success: true,
          maquina: mergeMaquinaDbComLocal(row ?? { ...existing, ...patch, id }, localAfter),
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          return {
            success: true,
            localFallback: true,
            maquina: localAfter ?? { ...existing, ...patch, id, userId: ctx.user.id },
          };
        }
        throw err;
      }
    }),

  inativar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const patch = {
        status: "inativo" as const,
        dataDesativacao: new Date(),
      };
      try {
        const [existing] = await db
          .select({ id: maquinas.id })
          .from(maquinas)
          .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
        }
        await db
          .update(maquinas)
          .set(patch)
          .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)));
        try {
          await updateLocalMaquina(ctx.user.id, input.id, {
            status: "inativo",
            dataDesativacao: new Date().toISOString().slice(0, 10),
          });
        } catch (mirrorError) {
          console.warn("[maquinas.inativar] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          const local = await getLocalMaquina(ctx.user.id, input.id);
          if (!local) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
          }
          await updateLocalMaquina(ctx.user.id, input.id, {
            status: "inativo",
            dataDesativacao: new Date().toISOString().slice(0, 10),
          });
          return { success: true, localFallback: true };
        }
        throw err;
      }
    }),

  reativar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const patch = {
        status: "ativo" as const,
        dataDesativacao: null,
      };
      try {
        const [existing] = await db
          .select({ id: maquinas.id })
          .from(maquinas)
          .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)))
          .limit(1);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
        }
        await db
          .update(maquinas)
          .set(patch)
          .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)));
        try {
          await updateLocalMaquina(ctx.user.id, input.id, {
            status: "ativo",
            dataDesativacao: null,
          });
        } catch (mirrorError) {
          console.warn("[maquinas.reativar] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          const local = await getLocalMaquina(ctx.user.id, input.id);
          if (!local) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
          }
          await updateLocalMaquina(ctx.user.id, input.id, {
            status: "ativo",
            dataDesativacao: null,
          });
          return { success: true, localFallback: true };
        }
        throw err;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const [existing] = await db
          .select({ id: maquinas.id })
          .from(maquinas)
          .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)))
          .limit(1);
        if (!existing) {
          const local = await getLocalMaquina(ctx.user.id, input.id);
          if (!local) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
          }
        }

        // Revalida sempre no momento da exclusão (concorrência / vínculo novo).
        await assertMaquinaSemVinculos(ctx.user.id, input.id);

        if (existing) {
          await db
            .delete(maquinas)
            .where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)));
        }
        try {
          await deleteLocalMaquina(ctx.user.id, input.id);
        } catch (mirrorError) {
          console.warn("[maquinas.delete] Espelho local não removido:", mirrorError);
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          // Offline: não há espelho local de abastecimentos/manutenções.
          // Permite excluir só o cadastro local (sem apagar históricos remotos inexistentes aqui).
          const local = await getLocalMaquina(ctx.user.id, input.id);
          if (!local) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Máquina não encontrada." });
          }
          await deleteLocalMaquina(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  /** IDs de máquinas com abastecimento, manutenção ou histórico operacional. */
  idsComVinculo: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await listMaquinaIdsComVinculo(ctx.user.id);
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        // Offline: sem tabelas locais de vínculo operacional → nenhum ID bloqueado.
        return [] as number[];
      }
      throw error;
    }
  }),

  /** Checagem pontual antes de abrir o modal / confirmar exclusão. */
  podeExcluir: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        await assertMaquinaSemVinculos(ctx.user.id, input.id);
        return { podeExcluir: true as const };
      } catch (error) {
        if (error instanceof TRPCError && error.message === MSG_MAQUINA_COM_VINCULOS) {
          return { podeExcluir: false as const };
        }
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          // Offline: cadastro local pode ser excluído (sem histórico operacional local).
          return { podeExcluir: true as const };
        }
        throw error;
      }
    }),

  // ── Valida linhas antes de importar maquinários ──────────────────────────────
  validarImportacao: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
      fazendaId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const MSG_FAZENDA =
        "Selecione uma Fazenda válida antes de importar máquinas.";

      const fazendaOk = await fazendaExisteParaImportacao(ctx.user.id, input.fazendaId);
      if (!fazendaOk) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FAZENDA });
      }

      const {
        normalizarLinha,
        normalizarCondicaoAquisicao,
        normalizarTipoMedidor,
        parseDataAquisicaoImportacao,
        parseValorAquisicaoImportacao,
        isLinhaExemplo,
        isLinhaVazia,
        OBSERVACOES_MAX_CHARS,
        TIPOS_MAQUINA: TIPOS_MAQUINA_VALIDOS,
        TIPOS_MEDIDOR_PLANILHA,
        CONDICOES_AQUISICAO_PLANILHA,
        hojeISOLocal,
        labelTipoMedidor,
        leituraInicialEhVaziaParaSemMedidor,
        parseLeituraMedidorImportacao,
        formatLeituraMedidorGravacao,
      } = await import('../shared/importacaoMaquinarios');
      const { isMarcaValidaParaTipo } = await import('../shared/maquina-types');

      const TIPOS_VALIDOS = [...TIPOS_MAQUINA_VALIDOS] as string[];

      type LinhaNorm = Record<string, string> & { __numLinha?: number };
      const linhasNorm: LinhaNorm[] = [];
      for (let i = 0; i < input.linhas.length; i++) {
        const linha = normalizarLinha(input.linhas[i]);
        if (isLinhaVazia(linha) || isLinhaExemplo(linha)) continue;
        linhasNorm.push({ ...linha, __numLinha: i + 2 });
      }

      // Duplicidade na fazenda (ativas)
      let existentes: Array<{ nome: string | null; placa: string | null; status: string | null; dataDesativacao: unknown }> = [];
      try {
        existentes = await db
          .select({
            nome: maquinas.nome,
            placa: maquinas.placa,
            status: maquinas.status,
            dataDesativacao: maquinas.dataDesativacao,
          })
          .from(maquinas)
          .where(and(eq(maquinas.userId, ctx.user.id), eq(maquinas.fazendaId, input.fazendaId)));
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const locais = await listLocalMaquinas(ctx.user.id);
        existentes = locais
          .filter(m => Number(m.fazendaId) === input.fazendaId)
          .map(m => ({
            nome: m.nome ?? null,
            placa: m.placa ?? null,
            status: m.status ?? null,
            dataDesativacao: m.dataDesativacao ?? null,
          }));
      }

      const nomesBanco = new Set(
        existentes
          .filter(m => isMaquinaAtivaRow(m))
          .map(m => (m.nome || "").trim().toLowerCase())
          .filter(Boolean),
      );
      const placasBanco = new Set(
        existentes
          .filter(m => isMaquinaAtivaRow(m))
          .map(m => (m.placa ? normalizePlacaIdent(m.placa) : ""))
          .filter(Boolean),
      );

      type ErroImp = {
        linha: number;
        campo: string;
        valor?: string;
        mensagem: string;
        esperado?: string;
      };
      const erros: ErroImp[] = [];
      const validos: Record<string, string>[] = [];
      const nomesNaPlanilha = new Set<string>();
      const placasNaPlanilha = new Set<string>();
      const anoAtual = new Date().getFullYear();
      const hojeIso = hojeISOLocal();

      for (const linha of linhasNorm) {
        const numLinha = linha.__numLinha ?? 2;
        const errosLinha: ErroImp[] = [];
        const pushErr = (campo: string, valor: string, mensagem: string, esperado?: string) => {
          errosLinha.push({ linha: numLinha, campo, valor, mensagem, esperado });
        };

        // Nome de identificação *
        const nome = (linha.nome || "").trim();
        if (!nome) {
          pushErr("Nome de identificação", "", "é obrigatório", "preencha um nome (ex: Trator 01)");
        } else {
          const nomeKey = nome.toLowerCase();
          if (nomesNaPlanilha.has(nomeKey)) {
            pushErr("Nome de identificação", nome, "duplicado na planilha", "use um nome único por Fazenda");
          } else if (nomesBanco.has(nomeKey)) {
            pushErr(
              "Nome de identificação",
              nome,
              "já existe uma máquina ativa com este nome na Fazenda selecionada",
              "altere o nome ou inative a máquina existente",
            );
          } else {
            nomesNaPlanilha.add(nomeKey);
          }
        }

        // Tipo de máquina *
        const tipo = (linha.tipo || "").trim();
        if (!tipo) {
          pushErr("Tipo de máquina", "", "é obrigatório", TIPOS_VALIDOS.join(", "));
        } else if (!TIPOS_VALIDOS.includes(tipo)) {
          pushErr("Tipo de máquina", tipo, "valor inválido", TIPOS_VALIDOS.join(", "));
        }

        // Marca *
        const marca = (linha.marca || "").trim();
        if (!marca) {
          pushErr("Marca", "", "é obrigatória", "marque uma marca válida para o Tipo");
        } else if (tipo && TIPOS_VALIDOS.includes(tipo) && !isMarcaValidaParaTipo(tipo, marca)) {
          pushErr(
            "Marca",
            marca,
            `não é válida para o tipo "${tipo}"`,
            "selecione uma marca da lista do Tipo (ou Outra, quando disponível)",
          );
        }

        // Identificação (placa/série) — texto, sem conversão numérica
        const placa = (linha.placa || "").trim();
        if (placa) {
          const placaKey = normalizePlacaIdent(placa);
          if (placasNaPlanilha.has(placaKey)) {
            pushErr(
              "Identificação — placa ou número de série",
              placa,
              "duplicada na planilha",
              "use identificação única por Fazenda",
            );
          } else if (placasBanco.has(placaKey)) {
            pushErr(
              "Identificação — placa ou número de série",
              placa,
              "já existe uma máquina ativa com esta identificação na Fazenda selecionada",
              "altere a identificação",
            );
          } else {
            placasNaPlanilha.add(placaKey);
          }
        }

        // Ano de fabricação
        let anoFab: number | null = null;
        const anoRaw = (linha.ano || "").trim();
        if (anoRaw) {
          const anoDigits = anoRaw.replace(/\.0+$/, "");
          if (!/^\d{4}$/.test(anoDigits)) {
            pushErr("Ano de fabricação", anoRaw, "deve ter 4 dígitos", "ex: 2022");
          } else {
            const ano = parseInt(anoDigits, 10);
            if (ano < 1900 || ano > anoAtual) {
              pushErr(
                "Ano de fabricação",
                anoRaw,
                ano > anoAtual ? "não pode ser futuro" : "ano incompatível com a regra do sistema",
                `entre 1900 e ${anoAtual}`,
              );
            } else {
              anoFab = ano;
              linha.ano = String(ano);
            }
          }
        }

        // Data de aquisição
        const dataRaw = (linha.dataAquisicao || "").trim();
        if (dataRaw) {
          const parsed = parseDataAquisicaoImportacao(dataRaw);
          if (!parsed.ok) {
            pushErr("Data de aquisição", dataRaw, parsed.motivo, parsed.esperado);
          } else if (parsed.iso > hojeIso) {
            pushErr("Data de aquisição", dataRaw, "não pode ser futura", "data de hoje ou anterior");
          } else {
            if (anoFab != null && parseInt(parsed.iso.slice(0, 4), 10) < anoFab) {
              pushErr(
                "Data de aquisição",
                dataRaw,
                "não pode ser anterior ao Ano de fabricação",
                `ano ≥ ${anoFab}`,
              );
            } else {
              linha.dataAquisicao = parsed.iso;
            }
          }
        }

        // Condição de aquisição
        const estadoRaw = (linha.estado || "").trim();
        if (estadoRaw) {
          const estado = normalizarCondicaoAquisicao(estadoRaw);
          if (!estado) {
            pushErr(
              "Condição de aquisição",
              estadoRaw,
              "valor inválido",
              CONDICOES_AQUISICAO_PLANILHA.join(" ou "),
            );
          } else {
            linha.estado = estado;
          }
        } else {
          // Padrão do formulário
          linha.estado = "novo";
        }

        // Valor de aquisição
        const valorRaw = (linha.valor || "").trim();
        if (valorRaw) {
          const valorNum = parseValorAquisicaoImportacao(valorRaw);
          if (valorNum == null || Number.isNaN(valorNum) || valorNum < 0) {
            pushErr(
              "Valor de aquisição (R$)",
              valorRaw,
              "valor numérico inválido",
              "ex: 345000 ou 345000,00 (sem texto)",
            );
          } else {
            linha.valor = valorNum.toFixed(2);
          }
        }

        // Vida útil estimada
        const vidaRaw = (linha.vidaUtil || "").trim();
        if (vidaRaw) {
          if (!/^\d+$/.test(vidaRaw.replace(/\s/g, ""))) {
            pushErr(
              "Vida útil estimada (anos)",
              vidaRaw,
              "deve ser número inteiro positivo",
              "ex: 10 (sem unidade na célula)",
            );
          } else {
            const vida = parseInt(vidaRaw, 10);
            if (Number.isNaN(vida) || vida <= 0) {
              pushErr(
                "Vida útil estimada (anos)",
                vidaRaw,
                "deve ser número inteiro positivo",
                "ex: 10",
              );
            } else {
              linha.vidaUtil = String(vida);
            }
          }
        }

        // Tipo de medidor *
        const medidorRaw = (linha.tipoMedidor || "").trim();
        const tipoMedidor = normalizarTipoMedidor(medidorRaw);
        if (!medidorRaw) {
          pushErr(
            "Tipo de medidor",
            "",
            "é obrigatório",
            TIPOS_MEDIDOR_PLANILHA.join(", "),
          );
        } else if (!tipoMedidor) {
          pushErr(
            "Tipo de medidor",
            medidorRaw,
            "valor inválido",
            TIPOS_MEDIDOR_PLANILHA.join(", "),
          );
        } else {
          linha.tipoMedidor = tipoMedidor;
        }

        // Leitura inicial (condicional)
        const leituraRaw = (linha.leituraInicial || "").trim();
        if (tipoMedidor === "sem_medidor") {
          if (leituraRaw && !leituraInicialEhVaziaParaSemMedidor(leituraRaw)) {
            pushErr(
              "Leitura inicial",
              leituraRaw,
              "deve ficar vazia quando Tipo de medidor = Sem medidor",
              "deixe a célula vazia",
            );
          }
          linha.leituraInicial = "";
        } else if (tipoMedidor === "horimetro" || tipoMedidor === "quilometragem") {
          const labelLeitura =
            tipoMedidor === "quilometragem" ? "Quilometragem inicial" : "Horímetro inicial";
          if (!leituraRaw) {
            pushErr(
              "Leitura inicial",
              "",
              `obrigatória para ${labelTipoMedidor(tipoMedidor)}`,
              `número ≥ 0 (${labelLeitura})`,
            );
          } else {
            const n = parseLeituraMedidorImportacao(leituraRaw);
            if (n == null) {
              pushErr(
                "Leitura inicial",
                leituraRaw,
                "número inválido",
                "ex: 100.000 ou 1250,5 (sem unidade na célula)",
              );
            } else {
              linha.leituraInicial = formatLeituraMedidorGravacao(n);
            }
          }
        }

        // Observações
        const obs = (linha.observacoes || "").trim();
        if (obs.length > OBSERVACOES_MAX_CHARS) {
          pushErr(
            "Observações",
            `${obs.length} caracteres`,
            "texto excede o limite do banco de dados",
            `máximo de ${OBSERVACOES_MAX_CHARS} caracteres`,
          );
        }

        // Status / Fazenda / Data desativação nunca vêm da planilha
        linha.status = "ativo";

        if (errosLinha.length > 0) {
          erros.push(...errosLinha);
        } else {
          const { __numLinha: _n, ...rest } = linha;
          validos.push(rest);
        }
      }

      return {
        total: linhasNorm.length,
        validos: validos.length,
        invalidos: linhasNorm.length - validos.length,
        erros,
        fazendaId: input.fazendaId,
      };
    }),

  // ── Importa maquinários em lote (tudo ou nada) ───────────────────────────────
  importar: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
      fazendaId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const MSG_FAZENDA =
        "Selecione uma Fazenda válida antes de importar máquinas.";

      const fazendaOk = await fazendaExisteParaImportacao(ctx.user.id, input.fazendaId);
      if (!fazendaOk) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_FAZENDA });
      }

      // Revalida o arquivo inteiro antes de gravar — sem importação parcial
      const {
        normalizarLinha,
        normalizarCondicaoAquisicao,
        normalizarTipoMedidor,
        parseDataAquisicaoImportacao,
        parseValorAquisicaoImportacao,
        isLinhaExemplo,
        isLinhaVazia,
        OBSERVACOES_MAX_CHARS,
        TIPOS_MAQUINA: TIPOS_MAQUINA_VALIDOS,
        hojeISOLocal,
        leituraInicialEhVaziaParaSemMedidor,
        parseLeituraMedidorImportacao,
        formatLeituraMedidorGravacao,
      } = await import('../shared/importacaoMaquinarios');
      const { isMarcaValidaParaTipo } = await import('../shared/maquina-types');

      const TIPOS_VALIDOS = [...TIPOS_MAQUINA_VALIDOS] as string[];
      const anoAtual = new Date().getFullYear();
      const hojeIso = hojeISOLocal();

      type LinhaPronta = {
        numLinha: number;
        nome: string;
        tipo: string;
        marca: string;
        modelo?: string;
        placa?: string;
        ano?: number;
        dataAquisicao?: string;
        estado: "novo" | "usado";
        valor?: string;
        vidaUtil?: string;
        tipoMedidor: "horimetro" | "quilometragem" | "sem_medidor";
        horimetro?: string;
        observacoes?: string;
      };

      const prontas: LinhaPronta[] = [];
      const errosPre: { linha: number; mensagem: string }[] = [];

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = normalizarLinha(input.linhas[i]);
        const numLinha = i + 2;
        if (isLinhaVazia(linha) || isLinhaExemplo(linha)) continue;

        const nome = (linha.nome || "").trim();
        const tipo = (linha.tipo || "").trim();
        const marca = (linha.marca || "").trim();
        const tipoMedidor = normalizarTipoMedidor(linha.tipoMedidor || "");
        const leituraRaw = (linha.leituraInicial || "").trim();

        if (!nome || !tipo || !marca || !tipoMedidor) {
          errosPre.push({ linha: numLinha, mensagem: "Linha incompleta ou inválida. Valide a planilha novamente." });
          continue;
        }
        if (!TIPOS_VALIDOS.includes(tipo) || !isMarcaValidaParaTipo(tipo, marca)) {
          errosPre.push({ linha: numLinha, mensagem: "Tipo ou Marca inválidos. Valide a planilha novamente." });
          continue;
        }

        let ano: number | undefined;
        const anoRaw = (linha.ano || "").trim();
        if (anoRaw) {
          if (!/^\d{4}$/.test(anoRaw) || parseInt(anoRaw, 10) > anoAtual || parseInt(anoRaw, 10) < 1900) {
            errosPre.push({ linha: numLinha, mensagem: "Ano de fabricação inválido." });
            continue;
          }
          ano = parseInt(anoRaw, 10);
        }

        let dataAquisicao: string | undefined;
        const dataRaw = (linha.dataAquisicao || "").trim();
        if (dataRaw) {
          const parsed = parseDataAquisicaoImportacao(dataRaw);
          if (!parsed.ok || parsed.iso > hojeIso) {
            errosPre.push({ linha: numLinha, mensagem: "Data de aquisição inválida." });
            continue;
          }
          dataAquisicao = parsed.iso;
        }

        let estado = normalizarCondicaoAquisicao(linha.estado || "");
        if (linha.estado?.trim() && !estado) {
          errosPre.push({ linha: numLinha, mensagem: "Condição de aquisição inválida." });
          continue;
        }
        if (!estado) estado = "novo";

        let valor: string | undefined;
        const valorRaw = (linha.valor || "").trim();
        if (valorRaw) {
          const n = parseValorAquisicaoImportacao(valorRaw);
          if (n == null || Number.isNaN(n) || n < 0) {
            errosPre.push({ linha: numLinha, mensagem: "Valor de aquisição inválido." });
            continue;
          }
          valor = n.toFixed(2);
        }

        let vidaUtil: string | undefined;
        const vidaRaw = (linha.vidaUtil || "").trim();
        if (vidaRaw) {
          const vida = parseInt(vidaRaw.replace(/[^\d]/g, ""), 10);
          if (Number.isNaN(vida) || vida <= 0) {
            errosPre.push({ linha: numLinha, mensagem: "Vida útil inválida." });
            continue;
          }
          vidaUtil = String(vida);
        }

        let horimetro: string | undefined;
        if (tipoMedidor === "sem_medidor") {
          if (leituraRaw && !leituraInicialEhVaziaParaSemMedidor(leituraRaw)) {
            errosPre.push({ linha: numLinha, mensagem: "Leitura inicial deve ficar vazia para Sem medidor." });
            continue;
          }
        } else {
          if (!leituraRaw) {
            errosPre.push({ linha: numLinha, mensagem: "Leitura inicial obrigatória para o medidor informado." });
            continue;
          }
          const n = parseLeituraMedidorImportacao(leituraRaw);
          if (n == null) {
            errosPre.push({ linha: numLinha, mensagem: "Leitura inicial inválida." });
            continue;
          }
          horimetro = formatLeituraMedidorGravacao(n);
        }

        const obs = (linha.observacoes || "").trim();
        if (obs.length > OBSERVACOES_MAX_CHARS) {
          errosPre.push({ linha: numLinha, mensagem: "Observações excedem o limite permitido." });
          continue;
        }

        prontas.push({
          numLinha,
          nome,
          tipo,
          marca,
          modelo: (linha.modelo || "").trim() || undefined,
          placa: (linha.placa || "").trim() || undefined,
          ano,
          dataAquisicao,
          estado,
          valor,
          vidaUtil,
          tipoMedidor,
          horimetro,
          observacoes: obs || undefined,
        });
      }

      if (errosPre.length > 0 || prontas.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            errosPre.length > 0
              ? `Importação bloqueada: ${errosPre.length} linha(s) com erro. Corrija a planilha e envie novamente. Nenhuma máquina foi importada.`
              : "Nenhuma linha válida para importar.",
        });
      }

      // Segunda passada: duplicidade entre linhas da própria importação
      const nomesSet = new Set<string>();
      const placasSet = new Set<string>();
      for (const p of prontas) {
        const nk = p.nome.toLowerCase();
        if (nomesSet.has(nk)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Importação bloqueada: nome "${p.nome}" duplicado na planilha. Nenhuma máquina foi importada.`,
          });
        }
        nomesSet.add(nk);
        if (p.placa) {
          const pk = normalizePlacaIdent(p.placa);
          if (placasSet.has(pk)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Importação bloqueada: identificação "${p.placa}" duplicada na planilha. Nenhuma máquina foi importada.`,
            });
          }
          placasSet.add(pk);
        }
      }

      const importados: number[] = [];
      const rejeitados: { linha: number; mensagem: string }[] = [];

      for (const p of prontas) {
        try {
          const placaNorm = p.placa ? normalizePlacaIdent(p.placa) : undefined;
          await assertMaquinaSemDuplicidade({
            userId: ctx.user.id,
            fazendaId: input.fazendaId,
            nome: p.nome,
            placa: placaNorm,
          });

          const anoFromData = p.dataAquisicao
            ? parseInt(p.dataAquisicao.slice(0, 4), 10)
            : undefined;

          const rowPayload = {
            userId: ctx.user.id,
            fazendaId: input.fazendaId,
            nome: p.nome,
            tipo: p.tipo,
            marca: p.marca,
            modelo: p.modelo,
            placa: placaNorm,
            ano: p.ano,
            dataAquisicao: p.dataAquisicao,
            anoAquisicao: anoFromData && !Number.isNaN(anoFromData) ? anoFromData : undefined,
            valor: p.valor,
            vidaUtil: p.vidaUtil,
            estado: p.estado,
            tipoMedidor: p.tipoMedidor,
            horimetro: p.horimetro,
            status: "ativo" as const,
            observacoes: p.observacoes,
          };

          try {
            const result = await db.insert(maquinas).values(rowPayload);
            const insertId = Number((result as any)[0]?.insertId ?? (result as any).insertId);
            if (Number.isFinite(insertId) && insertId > 0) {
              importados.push(insertId);
              try {
                await updateLocalMaquina(ctx.user.id, insertId, {
                  ...rowPayload,
                  id: insertId,
                });
              } catch (mirrorError) {
                console.warn("[maquinas.importar] Espelho local não gravado:", mirrorError);
              }
            }
          } catch (dbErr) {
            if (!isDatabaseUnavailable(dbErr)) throw dbErr;
            const created = await createLocalMaquina(ctx.user.id, {
              ...rowPayload,
              nome: rowPayload.nome,
            });
            importados.push(created.id);
          }
        } catch (err: any) {
          rejeitados.push({ linha: p.numLinha, mensagem: formatImportDbError(err) });
        }
      }

      // Tudo ou nada: se alguma linha falhou na gravação, reporta (já gravadas permanecem —
      // preferência do spec é não importar nenhuma; em falha rara de DB a meio do lote,
      // sinalizamos rejeições). Para falhas de validação já bloqueamos antes.
      if (rejeitados.length > 0 && importados.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Importação bloqueada. ${rejeitados[0]?.mensagem || "Erro ao gravar."}`,
        });
      }

      return {
        total: prontas.length,
        importados: importados.length,
        rejeitados: rejeitados.length,
        detalhesRejeitados: rejeitados,
      };
    }),
});

// ─── ABASTECIMENTOS ROUTER ────────────────────────────────────────────────────
const abastecimentosBaseFields = {
  maquinaId: z.number().optional(),
  data: z.string().optional(),
  combustivel: z.enum(["diesel", "gasolina", "etanol", "arla"]).optional(),
  litros: z.string().optional(),
  valorLitro: z.string().optional(),
  valorTotal: z.string().optional(),
  horimetro: z.string().optional(),
  responsavel: z.string().optional(),
  abastecidoNaFazenda: z.boolean().optional(),
  fazendaId: z.number().int().positive().optional().nullable(),
  observacoes: z.string().optional(),
};

const abastecimentosRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conditions = [eq(abastecimentos.userId, ctx.user.id)];
        if (input?.maquinaId) conditions.push(eq(abastecimentos.maquinaId, input.maquinaId));
        return await db.select().from(abastecimentos).where(and(...conditions)).orderBy(desc(abastecimentos.data), desc(abastecimentos.createdAt));
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return listLocalAbastecimentos(ctx.user.id, { maquinaId: input?.maquinaId });
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const [row] = await db.select().from(abastecimentos).where(
          and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id))
        );
        return row ?? null;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return getLocalAbastecimento(ctx.user.id, input.id);
      }
    }),

  create: protectedProcedure
    .input(z.object({
      maquinaId: z.number(),
      data: z.string(),
      combustivel: z.enum(["diesel", "gasolina", "etanol", "arla"]),
      litros: z.string(),
      valorLitro: z.string().optional(),
      valorTotal: z.string().optional(),
      horimetro: z.string().optional(),
      responsavel: z.string().optional(),
      abastecidoNaFazenda: z.boolean().optional(),
      fazendaId: z.number().int().positive().optional().nullable(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const dataISO = input.data.slice(0, 10);
      const qtd = parseFloat(input.litros.replace(",", "."));
      if (Number.isNaN(qtd) || qtd <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Informe uma quantidade abastecida válida." });
      }

      await assertMaquinaAtivaParaOperacao(ctx.user.id, input.maquinaId);

      const total = input.valorTotal
        ?? (input.valorLitro && input.litros
          ? (qtd * parseFloat(input.valorLitro)).toFixed(2)
          : undefined);

      const interno = Boolean(input.abastecidoNaFazenda && input.fazendaId);

      const rowPayload = {
        userId: ctx.user.id,
        maquinaId: input.maquinaId,
        data: dataISO,
        combustivel: input.combustivel,
        litros: String(qtd),
        valorLitro: input.valorLitro,
        valorTotal: total,
        horimetro: input.horimetro,
        responsavel: input.responsavel,
        abastecidoNaFazenda: Boolean(input.abastecidoNaFazenda),
        fazendaId: input.fazendaId ?? null,
        status: "registrado" as const,
        observacoes: input.observacoes,
      };

      try {
        const insertId = await db.transaction(async tx => {
          const result = await tx.insert(abastecimentos).values(rowPayload);
          const id = Number((result as any)[0]?.insertId ?? 0);
          if (!id) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Não foi possível registrar o abastecimento. Tente novamente.",
            });
          }

          if (interno && input.fazendaId) {
            await syncSaidaAbastecimento(
              {
                abastecimentoId: id,
                maquinaId: input.maquinaId,
                fazendaId: input.fazendaId,
                combustivel: input.combustivel,
                litros: qtd,
                dataISO,
                responsavel: input.responsavel,
                valorTotal: total,
                observacoes: input.observacoes,
                userId: ctx.user.id,
              },
              tx,
            );
          }

          return id;
        });

        return { success: true, id: insertId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) {
          console.error("[abastecimentos.create]", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível registrar o abastecimento. Verifique os dados e tente novamente.",
          });
        }
        if (interno && input.fazendaId) {
          const created = await createLocalAbastecimento(ctx.user.id, rowPayload);
          try {
            await syncSaidaAbastecimentoLocal({
              abastecimentoId: created.id,
              maquinaId: input.maquinaId,
              fazendaId: input.fazendaId,
              combustivel: input.combustivel,
              litros: qtd,
              dataISO,
              responsavel: input.responsavel,
              valorTotal: total,
              observacoes: input.observacoes,
              userId: ctx.user.id,
            });
          } catch (syncErr) {
            await deleteLocalAbastecimento(ctx.user.id, created.id);
            if (syncErr instanceof TRPCError) throw syncErr;
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                syncErr instanceof Error
                  ? syncErr.message
                  : "Não foi possível baixar o estoque deste abastecimento.",
            });
          }
          return { success: true, id: created.id, localFallback: true };
        }
        const created = await createLocalAbastecimento(ctx.user.id, rowPayload);
        return { success: true, id: created.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...abastecimentosBaseFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, data, valorLitro, litros, fazendaId, ...rest } = input;
      const dataISO = data ? data.slice(0, 10) : undefined;

      let anterior: Awaited<ReturnType<typeof getLocalAbastecimento>> | (typeof abastecimentos.$inferSelect) | null = null;
      try {
        const [row] = await db
          .select()
          .from(abastecimentos)
          .where(and(eq(abastecimentos.id, id), eq(abastecimentos.userId, ctx.user.id)));
        anterior = row ?? null;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        anterior = await getLocalAbastecimento(ctx.user.id, id);
      }
      if (!anterior) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Abastecimento não encontrado." });
      }

      if (String(anterior.status ?? "registrado") === "estornado") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Abastecimento estornado não pode ser editado.",
        });
      }

      const maquinaDestino = rest.maquinaId ?? anterior.maquinaId;
      await assertMaquinaAtivaParaOperacao(ctx.user.id, maquinaDestino, {
        allowSameInactiveId: anterior.maquinaId,
      });

      const novosLitros = litros != null
        ? parseFloat(String(litros).replace(",", "."))
        : parseFloat(String(anterior.litros ?? 0));
      const total = input.valorTotal
        ?? (valorLitro && !Number.isNaN(novosLitros)
          ? (novosLitros * parseFloat(valorLitro)).toFixed(2)
          : undefined);

      const eraInterno = Boolean(anterior.abastecidoNaFazenda && anterior.fazendaId);
      const eAgora = Boolean(
        (input.abastecidoNaFazenda ?? anterior.abastecidoNaFazenda) &&
        (fazendaId !== undefined ? fazendaId : anterior.fazendaId),
      );
      const novoFazendaId = (fazendaId !== undefined ? fazendaId : anterior.fazendaId) as number | null;
      const novoCombustivel = (input.combustivel ?? anterior.combustivel) as string;
      const novaData = dataISO ?? String(anterior.data).slice(0, 10);
      const novoMaquinaId = input.maquinaId ?? anterior.maquinaId;
      const novoResponsavel = input.responsavel !== undefined ? input.responsavel : anterior.responsavel;
      const novasObs = input.observacoes !== undefined ? input.observacoes : anterior.observacoes;
      const valorTotalFinal = total ?? (anterior.valorTotal != null ? String(anterior.valorTotal) : undefined);

      try {
        await db.transaction(async tx => {
          await tx.update(abastecimentos).set({
            ...rest,
            ...(dataISO ? { data: dataISO } : {}),
            ...(litros !== undefined ? { litros: String(novosLitros) } : {}),
            ...(valorLitro !== undefined ? { valorLitro } : {}),
            ...(total !== undefined ? { valorTotal: total } : {}),
            ...(fazendaId !== undefined ? { fazendaId: fazendaId ?? null } : {}),
          }).where(and(eq(abastecimentos.id, id), eq(abastecimentos.userId, ctx.user.id)));

          if (eraInterno && !eAgora) {
            await estornarSaidaAbastecimento(
              id,
              {
                motivo: MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
                userId: ctx.user.id,
                registradoPor: ctx.user.name?.trim() || undefined,
              },
              tx,
            );
          } else if (eAgora && novoFazendaId) {
            await syncSaidaAbastecimento(
              {
                abastecimentoId: id,
                maquinaId: novoMaquinaId,
                fazendaId: novoFazendaId,
                combustivel: novoCombustivel,
                litros: novosLitros,
                dataISO: novaData,
                responsavel: novoResponsavel,
                valorTotal: valorTotalFinal,
                observacoes: novasObs,
                userId: ctx.user.id,
              },
              tx,
            );
          }
        });

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) {
          console.error("[abastecimentos.update]", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível atualizar o abastecimento. Verifique os dados e tente novamente.",
          });
        }
        if (eraInterno || eAgora) {
          await updateLocalAbastecimento(ctx.user.id, id, {
            ...rest,
            ...(dataISO ? { data: dataISO } : {}),
            ...(litros !== undefined ? { litros: String(novosLitros) } : {}),
            ...(valorLitro !== undefined ? { valorLitro } : {}),
            ...(total !== undefined ? { valorTotal: total } : {}),
            ...(fazendaId !== undefined ? { fazendaId: fazendaId ?? null } : {}),
            ...(input.abastecidoNaFazenda !== undefined
              ? { abastecidoNaFazenda: input.abastecidoNaFazenda }
              : {}),
          });

          try {
            if (eraInterno && !eAgora) {
              await estornarSaidaAbastecimentoLocal(id, {
                motivo: MOTIVO_ESTORNO_ORIGEM_COMBUSTIVEL_ALTERADA,
                userId: ctx.user.id,
                registradoPor: ctx.user.name?.trim() || undefined,
              });
            } else if (eAgora && novoFazendaId) {
              await syncSaidaAbastecimentoLocal({
                abastecimentoId: id,
                maquinaId: novoMaquinaId,
                fazendaId: novoFazendaId,
                combustivel: novoCombustivel,
                litros: novosLitros,
                dataISO: novaData,
                responsavel: novoResponsavel,
                valorTotal: valorTotalFinal,
                observacoes: novasObs,
                userId: ctx.user.id,
              });
            }
          } catch (syncErr) {
            if (syncErr instanceof TRPCError) throw syncErr;
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                syncErr instanceof Error
                  ? syncErr.message
                  : "Não foi possível sincronizar o estoque deste abastecimento.",
            });
          }
          return { success: true, localFallback: true };
        }
        await updateLocalAbastecimento(ctx.user.id, id, {
          ...rest,
          ...(dataISO ? { data: dataISO } : {}),
          ...(litros !== undefined ? { litros: String(novosLitros) } : {}),
          ...(valorLitro !== undefined ? { valorLitro } : {}),
          ...(total !== undefined ? { valorTotal: total } : {}),
          ...(fazendaId !== undefined ? { fazendaId: fazendaId ?? null } : {}),
        });
        return { success: true, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      let anterior: {
        id: number;
        abastecidoNaFazenda: boolean | null;
        fazendaId: number | null;
        status?: string | null;
      } | null = null;

      try {
        const [row] = await db
          .select()
          .from(abastecimentos)
          .where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));
        anterior = row ?? null;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const local = await getLocalAbastecimento(ctx.user.id, input.id);
        anterior = local
          ? {
              id: local.id,
              abastecidoNaFazenda: local.abastecidoNaFazenda ?? null,
              fazendaId: local.fazendaId ?? null,
              status: local.status ?? null,
            }
          : null;
      }

      if (!anterior) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Abastecimento não encontrado." });
      }

      if (String(anterior.status ?? "registrado") === "estornado") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Abastecimento estornado não pode ser excluído. O histórico é preservado.",
        });
      }

      // Estoque da Fazenda: exclusão direta gera inconsistência — use estorno.
      if (anterior.abastecidoNaFazenda && anterior.fazendaId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Este abastecimento está vinculado ao estoque da Fazenda. Use Estornar abastecimento para devolver a quantidade e preservar o histórico.",
        });
      }

      try {
        await db
          .delete(abastecimentos)
          .where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) {
          console.error("[abastecimentos.delete]", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível excluir o abastecimento. Tente novamente.",
          });
        }
        await deleteLocalAbastecimento(ctx.user.id, input.id);
        return { success: true };
      }
    }),

  estornar: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        motivo: z.string().trim().min(1).max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let anterior: Awaited<ReturnType<typeof getLocalAbastecimento>> | (typeof abastecimentos.$inferSelect) | null =
        null;
      try {
        const [row] = await db
          .select()
          .from(abastecimentos)
          .where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));
        anterior = row ?? null;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        anterior = await getLocalAbastecimento(ctx.user.id, input.id);
      }

      if (!anterior) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Abastecimento não encontrado." });
      }

      if (String(anterior.status ?? "registrado") === "estornado") {
        return { success: true, alreadyEstornado: true };
      }

      if (!anterior.abastecidoNaFazenda || !anterior.fazendaId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Estorno aplica-se apenas a abastecimentos com origem Estoque da Fazenda. Para compra externa, use Excluir.",
        });
      }

      const motivoExtra = input.motivo?.trim();
      const motivo = motivoExtra
        ? `${MOTIVO_ESTORNO_ABASTECIMENTO} — ${motivoExtra}`
        : MOTIVO_ESTORNO_ABASTECIMENTO;

      try {
        await db.transaction(async tx => {
          await estornarSaidaAbastecimento(
            input.id,
            {
              motivo,
              userId: ctx.user.id,
              registradoPor: ctx.user.name?.trim() || undefined,
            },
            tx,
          );
          await tx
            .update(abastecimentos)
            .set({ status: "estornado" })
            .where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));
        });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) {
          console.error("[abastecimentos.estornar]", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível estornar o abastecimento. Tente novamente.",
          });
        }
        try {
          await estornarSaidaAbastecimentoLocal(input.id, {
            motivo,
            userId: ctx.user.id,
            registradoPor: ctx.user.name?.trim() || undefined,
          });
          await updateLocalAbastecimento(ctx.user.id, input.id, { status: "estornado" });
          return { success: true, localFallback: true };
        } catch (syncErr) {
          if (syncErr instanceof TRPCError) throw syncErr;
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              syncErr instanceof Error
                ? syncErr.message
                : "Não foi possível estornar o abastecimento. Tente novamente.",
          });
        }
      }
    }),
});

// ─── MANUTENCOES ROUTER ───────────────────────────────────────────────────────
const pecaInput = z.object({
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  /** Ignorado no servidor quando há estoqueId — custo médio do estoque é a fonte oficial. */
  valorUnitario: z.number().min(0).optional(),
  estoqueId: z.number().int().positive().optional().nullable(),
});

const manutencaoBaseInput = z.object({
  maquinaId: z.number(),
  tipo: z.string(),
  descricao: z
    .string({
      required_error: MSG_DESCRICAO_SERVICO_OBRIGATORIA,
      invalid_type_error: MSG_DESCRICAO_SERVICO_OBRIGATORIA,
    })
    .transform(v => normalizeDescricaoServico(v))
    .refine(isDescricaoServicoValida, { message: MSG_DESCRICAO_SERVICO_OBRIGATORIA }),
  data: z.string(),
  horimetro: z.string().optional(),
  proximaManutencao: z.string().optional(),
  // Status não é aceito do frontend — sempre "concluida" no create; preservado no update.
  prestadorNome: z.string().optional(),
  prestadorContato: z.string().optional(),
  valorMaoObra: z.number().min(0).optional(),
  observacoes: z.string().optional(),
  pecas: z.array(pecaInput).optional(),
});

/** Calcula valor de peças, mão de obra e total geral. */
export function calcularTotaisManutencao(
  pecas: { quantidade: number; valorUnitario: number }[] | undefined,
  valorMaoObra: number | undefined
) {
  const valorPecas = (pecas ?? []).reduce(
    (s, p) => s + p.quantidade * p.valorUnitario,
    0
  );
  const maoObra = valorMaoObra ?? 0;
  return {
    valorPecas,
    valorMaoObra: maoObra,
    valorTotal: valorPecas + maoObra,
  };
}

export const MSG_MANUT_SEM_CUSTO_MEDIO =
  "Este produto não possui custo médio registrado. Registre uma entrada de estoque antes de utilizá-lo na manutenção.";

export const MSG_MANUT_SALDO_ALTERADO =
  "O saldo deste produto foi alterado por outra operação. Revise a quantidade e tente novamente.";

type PecaManutencaoResolvida = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  estoqueId: number;
};

/**
 * Valida se as peças vinculadas ao estoque não ultrapassam o saldo disponível.
 * Soma as quantidades por estoqueId e compara com a quantidade em estoque.
 * Lança TRPCError BAD_REQUEST se alguma peça exceder o saldo.
 */
export async function validarSaldoEstoquePecas(
  pecas: { nome: string; quantidade: number; estoqueId?: number | null }[] | undefined
) {
  if (!pecas || pecas.length === 0) return;
  const porEstoque = new Map<number, number>();
  for (const p of pecas) {
    if (p.estoqueId == null) continue;
    porEstoque.set(p.estoqueId, (porEstoque.get(p.estoqueId) ?? 0) + p.quantidade);
  }
  if (porEstoque.size === 0) return;
  const ids = Array.from(porEstoque.keys());
  const itens = await db
    .select({ id: estoque.id, nome: estoque.nome, quantidade: estoque.quantidade, unidade: estoque.unidade })
    .from(estoque)
    .where(inArray(estoque.id, ids));
  const mapEstoque = new Map(itens.map(i => [i.id, i]));
  for (const [estoqueId, qtdSolicitada] of porEstoque.entries()) {
    const item = mapEstoque.get(estoqueId);
    if (!item || item.quantidade == null) continue;
    const disponivel = parseFloat(String(item.quantidade));
    if (Number.isNaN(disponivel)) continue;
    if (qtdSolicitada > disponivel) {
      const unidade = item.unidade ? ` ${item.unidade}` : "";
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Estoque insuficiente para "${item.nome}". Solicitado: ${qtdSolicitada.toLocaleString("pt-BR")}${unidade}, disponível: ${disponivel.toLocaleString("pt-BR")}${unidade}.`,
      });
    }
  }
}

/**
 * Resolve peças com o custo médio vigente do estoque (ignora valorUnitario do frontend).
 * `creditoPorEstoque` devolve ao saldo as quantidades já consumidas nesta manutenção (edição).
 * `custoCongeladoPorEstoque` preserva o unitário já gravado em itens existentes (não repreça histórico).
 */
export async function resolverPecasComCustoMedioEstoque(
  pecas: { nome: string; quantidade: number; estoqueId?: number | null }[] | undefined,
  creditoPorEstoque?: Map<number, number>,
  custoCongeladoPorEstoque?: Map<number, number>,
): Promise<PecaManutencaoResolvida[]> {
  if (!pecas || pecas.length === 0) return [];

  for (const p of pecas) {
    if (p.estoqueId == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Selecione um produto do estoque da Fazenda. Peças sem vínculo de estoque não são permitidas.",
      });
    }
  }

  const ids = Array.from(new Set(pecas.map(p => p.estoqueId!)));
  type ItemEstoque = {
    id: number;
    nome: string | null;
    quantidade: string | number | null;
    unidade: string | null;
    valorUnitario: string | number | null;
  };
  const mapEstoque = new Map<number, ItemEstoque>();

  try {
    const itens = await db
      .select({
        id: estoque.id,
        nome: estoque.nome,
        quantidade: estoque.quantidade,
        unidade: estoque.unidade,
        valorUnitario: estoque.valorUnitario,
      })
      .from(estoque)
      .where(inArray(estoque.id, ids));
    for (const item of itens) mapEstoque.set(item.id, item);
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }

  for (const id of ids) {
    if (mapEstoque.has(id)) continue;
    const local = devLocalStore.getEstoque(id);
    if (!local) continue;
    mapEstoque.set(id, {
      id: local.id,
      nome: local.nome,
      quantidade: local.quantidade,
      unidade: local.unidade,
      valorUnitario: local.valorUnitario,
    });
  }

  const solicitados = new Map<number, number>();
  for (const p of pecas) {
    const id = p.estoqueId!;
    solicitados.set(id, (solicitados.get(id) ?? 0) + p.quantidade);
  }

  for (const [estoqueId, qtdSolicitada] of solicitados.entries()) {
    const item = mapEstoque.get(estoqueId);
    if (!item) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Produto de estoque não encontrado. Atualize a lista e tente novamente.",
      });
    }
    const custoCongelado = custoCongeladoPorEstoque?.get(estoqueId);
    const custo =
      custoCongelado != null && custoCongelado > 0
        ? custoCongelado
        : parseCustoMedio(item.valorUnitario);
    if (custo == null) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: MSG_MANUT_SEM_CUSTO_MEDIO,
      });
    }
    const disponivel =
      parseFloat(String(item.quantidade ?? 0)) + (creditoPorEstoque?.get(estoqueId) ?? 0);
    if (Number.isFinite(disponivel) && qtdSolicitada > disponivel + 1e-9) {
      const unidade = item.unidade ? ` ${item.unidade}` : "";
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Estoque insuficiente para "${item.nome}". Solicitado: ${qtdSolicitada.toLocaleString("pt-BR")}${unidade}, disponível: ${Math.max(0, disponivel).toLocaleString("pt-BR")}${unidade}.`,
      });
    }
  }

  return pecas.map(p => {
    const item = mapEstoque.get(p.estoqueId!)!;
    const custoCongelado = custoCongeladoPorEstoque?.get(p.estoqueId!);
    const custo =
      custoCongelado != null && custoCongelado > 0
        ? custoCongelado
        : parseCustoMedio(item.valorUnitario)!;
    return {
      nome: item.nome || p.nome,
      quantidade: p.quantidade,
      valorUnitario: custo,
      estoqueId: p.estoqueId!,
    };
  });
}

function montarDeltasBaixaEstoque(
  pecasNovas: PecaManutencaoResolvida[],
  pecasAntigas?: { estoqueId: number | null; quantidade: string | number }[],
) {
  const antigo = new Map<number, number>();
  for (const p of pecasAntigas ?? []) {
    if (p.estoqueId == null) continue;
    const q = parseFloat(String(p.quantidade));
    if (!Number.isFinite(q) || q <= 0) continue;
    antigo.set(p.estoqueId, (antigo.get(p.estoqueId) ?? 0) + q);
  }
  const novo = new Map<number, number>();
  for (const p of pecasNovas) {
    novo.set(p.estoqueId, (novo.get(p.estoqueId) ?? 0) + p.quantidade);
  }
  const deltas = new Map<number, number>();
  for (const estoqueId of new Set([...antigo.keys(), ...novo.keys()])) {
    const delta = (novo.get(estoqueId) ?? 0) - (antigo.get(estoqueId) ?? 0);
    if (Math.abs(delta) >= 1e-9) deltas.set(estoqueId, delta);
  }
  return deltas;
}

async function aplicarBaixaEstoquePecasManutencao(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  pecasNovas: PecaManutencaoResolvida[],
  pecasAntigas?: { estoqueId: number | null; quantidade: string | number }[],
) {
  const deltas = montarDeltasBaixaEstoque(pecasNovas, pecasAntigas);
  const pendenteLocal = new Map<number, number>();

  for (const [estoqueId, delta] of deltas.entries()) {
    let appliedOnDb = false;
    try {
      const rows = await tx
        .select({
          id: estoque.id,
          nome: estoque.nome,
          quantidade: estoque.quantidade,
          unidade: estoque.unidade,
        })
        .from(estoque)
        .where(eq(estoque.id, estoqueId))
        .for("update");
      const item = rows[0];
      if (item) {
        const atual = parseFloat(String(item.quantidade ?? 0));
        const saldo = atual - delta;
        if (!Number.isFinite(saldo) || saldo < -1e-9) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_MANUT_SALDO_ALTERADO,
          });
        }
        await tx
          .update(estoque)
          .set({ quantidade: String(Math.max(0, Math.round(saldo * 100) / 100)) })
          .where(eq(estoque.id, estoqueId));
        appliedOnDb = true;
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (!isDatabaseUnavailable(error)) throw error;
    }
    if (!appliedOnDb) pendenteLocal.set(estoqueId, delta);
  }

  return pendenteLocal;
}

function aplicarBaixaEstoqueLocalPendente(pendenteLocal: Map<number, number>) {
  for (const [estoqueId, delta] of pendenteLocal.entries()) {
    const result = devLocalStore.ajustarQuantidadeEstoque(estoqueId, -delta);
    if (!result.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          result.reason === "insufficient"
            ? MSG_MANUT_SALDO_ALTERADO
            : "Produto de estoque não encontrado. Atualize a lista e tente novamente.",
      });
    }
  }
}

function pecasLocaisFromResolvidas(
  pecasResolvidas: { estoqueId: number; nome: string; quantidade: number; valorUnitario: number }[],
) {
  return pecasResolvidas.map(p => ({
    estoqueId: p.estoqueId,
    nome: p.nome,
    quantidade: p.quantidade.toFixed(2),
    valorUnitario: p.valorUnitario.toFixed(2),
    valorTotal: (p.quantidade * p.valorUnitario).toFixed(2),
  }));
}

function manutencaoUpdatedAtMs(row: { updatedAt?: unknown; createdAt?: unknown }): number {
  const raw = row.updatedAt ?? row.createdAt ?? 0;
  const ms = new Date(raw as string | Date).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function mergeManutencoesDbLocal<T extends { id: number; updatedAt?: unknown; createdAt?: unknown }>(
  dbRows: T[],
  localRows: T[],
): T[] {
  const byId = new Map<number, T>();
  for (const row of dbRows) byId.set(row.id, row);
  for (const row of localRows) {
    const existing = byId.get(row.id);
    if (!existing || manutencaoUpdatedAtMs(row) >= manutencaoUpdatedAtMs(existing)) {
      byId.set(row.id, row);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const byUpdated = manutencaoUpdatedAtMs(b) - manutencaoUpdatedAtMs(a);
    if (byUpdated !== 0) return byUpdated;
    return b.id - a.id;
  });
}

const manutencoesRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      let dbRows: Awaited<ReturnType<typeof listLocalManutencoes>> = [];
      let dbOk = false;
      try {
        const conditions = [eq(manutencoes.userId, ctx.user.id)];
        if (input?.maquinaId) conditions.push(eq(manutencoes.maquinaId, input.maquinaId));
        dbRows = (await db
          .select()
          .from(manutencoes)
          .where(and(...conditions))
          .orderBy(desc(manutencoes.createdAt))) as typeof dbRows;
        dbOk = true;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const localRows = await listLocalManutencoes(ctx.user.id, { maquinaId: input?.maquinaId });
      if (!dbOk) return localRows;
      return mergeManutencoesDbLocal(dbRows, localRows);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      let dbRegistro: (typeof manutencoes.$inferSelect & { pecas: unknown[] }) | null = null;
      try {
        const [registro] = await db
          .select()
          .from(manutencoes)
          .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
        if (registro) {
          const pecas = await db
            .select()
            .from(manutencaoPecas)
            .where(eq(manutencaoPecas.manutencaoId, input.id))
            .orderBy(manutencaoPecas.id);
          dbRegistro = { ...registro, pecas };
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return getLocalManutencao(ctx.user.id, input.id);
      }

      const local = await getLocalManutencao(ctx.user.id, input.id);
      if (!dbRegistro) return local;
      if (!local) return dbRegistro;
      return manutencaoUpdatedAtMs(local) >= manutencaoUpdatedAtMs(dbRegistro)
        ? local
        : dbRegistro;
    }),

  listPecas: protectedProcedure
    .input(z.object({ manutencaoId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        return await db
          .select()
          .from(manutencaoPecas)
          .where(eq(manutencaoPecas.manutencaoId, input.manutencaoId))
          .orderBy(manutencaoPecas.id);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const local = await getLocalManutencao(ctx.user.id, input.manutencaoId);
        return local?.pecas ?? [];
      }
    }),

  create: protectedProcedure
    .input(manutencaoBaseInput)
    .mutation(async ({ ctx, input }) => {
      const { data, proximaManutencao, pecas, valorMaoObra, ...rest } = input;
      await assertMaquinaAtivaParaOperacao(ctx.user.id, rest.maquinaId);
      const pecasResolvidas = await resolverPecasComCustoMedioEstoque(pecas);
      const totais = calcularTotaisManutencao(pecasResolvidas, valorMaoObra);
      const pecasPayload = pecasLocaisFromResolvidas(pecasResolvidas);

      try {
        let pendenteLocal = new Map<number, number>();
        const manutencaoId = await db.transaction(async tx => {
          const result = await tx.insert(manutencoes).values({
            userId: ctx.user.id,
            ...rest,
            data,
            status: "concluida",
            proximaManutencao: proximaManutencao || undefined,
            valorMaoObra: totais.valorMaoObra.toFixed(2),
            valorPecas: totais.valorPecas.toFixed(2),
            valorTotal: totais.valorTotal.toFixed(2),
            custo: totais.valorTotal.toFixed(2),
          });
          const id = Number((result as any)[0]?.insertId);
          if (pecasResolvidas.length > 0) {
            await tx.insert(manutencaoPecas).values(
              pecasResolvidas.map(p => ({
                manutencaoId: id,
                estoqueId: p.estoqueId,
                nome: p.nome,
                quantidade: p.quantidade.toFixed(2),
                valorUnitario: p.valorUnitario.toFixed(2),
                valorTotal: (p.quantidade * p.valorUnitario).toFixed(2),
              })),
            );
            pendenteLocal = await aplicarBaixaEstoquePecasManutencao(tx, pecasResolvidas);
          }
          return id;
        });
        aplicarBaixaEstoqueLocalPendente(pendenteLocal);
        return { success: true, id: manutencaoId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;

        const created = await createLocalManutencao(ctx.user.id, {
          ...rest,
          data,
          status: "concluida",
          proximaManutencao: proximaManutencao || undefined,
          valorMaoObra: totais.valorMaoObra.toFixed(2),
          valorPecas: totais.valorPecas.toFixed(2),
          valorTotal: totais.valorTotal.toFixed(2),
          custo: totais.valorTotal.toFixed(2),
          pecas: pecasPayload,
        });
        try {
          aplicarBaixaEstoqueLocalPendente(montarDeltasBaixaEstoque(pecasResolvidas));
        } catch (baixaErr) {
          await deleteLocalManutencao(ctx.user.id, created.id);
          throw baixaErr;
        }
        return { success: true, id: created.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(manutencaoBaseInput.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, data, proximaManutencao, pecas, valorMaoObra, ...rest } = input;

      let anterior: { maquinaId: number } | null = null;
      let pecasAntigas: {
        estoqueId: number | null;
        quantidade: string | number;
        valorUnitario?: string | number | null;
      }[] = [];
      let fromLocal = false;

      try {
        const [row] = await db
          .select({ maquinaId: manutencoes.maquinaId })
          .from(manutencoes)
          .where(and(eq(manutencoes.id, id), eq(manutencoes.userId, ctx.user.id)))
          .limit(1);
        anterior = row ?? null;
        if (anterior) {
          pecasAntigas = await db
            .select({
              estoqueId: manutencaoPecas.estoqueId,
              quantidade: manutencaoPecas.quantidade,
              valorUnitario: manutencaoPecas.valorUnitario,
            })
            .from(manutencaoPecas)
            .where(eq(manutencaoPecas.manutencaoId, id));
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        fromLocal = true;
        const local = await getLocalManutencao(ctx.user.id, id);
        if (local) {
          anterior = { maquinaId: Number(local.maquinaId) };
          pecasAntigas = (local.pecas ?? []).map(p => ({
            estoqueId: p.estoqueId ?? null,
            quantidade: p.quantidade,
            valorUnitario: p.valorUnitario,
          }));
        }
      }

      if (!anterior) {
        const local = await getLocalManutencao(ctx.user.id, id);
        if (!local) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Manutenção não encontrada." });
        }
        fromLocal = true;
        anterior = { maquinaId: Number(local.maquinaId) };
        pecasAntigas = (local.pecas ?? []).map(p => ({
          estoqueId: p.estoqueId ?? null,
          quantidade: p.quantidade,
          valorUnitario: p.valorUnitario,
        }));
      }

      await assertMaquinaAtivaParaOperacao(ctx.user.id, rest.maquinaId, {
        allowSameInactiveId: anterior.maquinaId,
      });

      const credito = new Map<number, number>();
      const custoCongelado = new Map<number, number>();
      for (const p of pecasAntigas) {
        if (p.estoqueId == null) continue;
        const q = parseFloat(String(p.quantidade));
        if (Number.isFinite(q) && q > 0) {
          credito.set(p.estoqueId, (credito.get(p.estoqueId) ?? 0) + q);
        }
        const vu = parseCustoMedio(p.valorUnitario);
        if (vu != null && !custoCongelado.has(p.estoqueId)) {
          custoCongelado.set(p.estoqueId, vu);
        }
      }

      const pecasResolvidas = await resolverPecasComCustoMedioEstoque(
        pecas,
        credito,
        custoCongelado,
      );
      const totais = calcularTotaisManutencao(pecasResolvidas, valorMaoObra);
      const pecasPayload = pecasLocaisFromResolvidas(pecasResolvidas);
      const localPayload = {
        ...rest,
        data,
        proximaManutencao: proximaManutencao || null,
        prestadorNome: rest.prestadorNome ?? null,
        prestadorContato: rest.prestadorContato ?? null,
        descricao: rest.descricao ?? null,
        valorMaoObra: totais.valorMaoObra.toFixed(2),
        valorPecas: totais.valorPecas.toFixed(2),
        valorTotal: totais.valorTotal.toFixed(2),
        custo: totais.valorTotal.toFixed(2),
        pecas: pecasPayload,
      };

      if (fromLocal) {
        await updateLocalManutencao(ctx.user.id, id, localPayload);
        aplicarBaixaEstoqueLocalPendente(
          montarDeltasBaixaEstoque(pecasResolvidas, pecasAntigas),
        );
        return { success: true, localFallback: true };
      }

      try {
        let pendenteLocal = new Map<number, number>();
        await db.transaction(async tx => {
          await tx
            .update(manutencoes)
            .set({
              ...rest,
              data,
              proximaManutencao: proximaManutencao || null,
              prestadorNome: rest.prestadorNome ?? null,
              prestadorContato: rest.prestadorContato ?? null,
              descricao: rest.descricao ?? null,
              valorMaoObra: totais.valorMaoObra.toFixed(2),
              valorPecas: totais.valorPecas.toFixed(2),
              valorTotal: totais.valorTotal.toFixed(2),
              custo: totais.valorTotal.toFixed(2),
            })
            .where(and(eq(manutencoes.id, id), eq(manutencoes.userId, ctx.user.id)));

          await tx.delete(manutencaoPecas).where(eq(manutencaoPecas.manutencaoId, id));
          if (pecasResolvidas.length > 0) {
            await tx.insert(manutencaoPecas).values(
              pecasResolvidas.map(p => ({
                manutencaoId: id,
                estoqueId: p.estoqueId,
                nome: p.nome,
                quantidade: p.quantidade.toFixed(2),
                valorUnitario: p.valorUnitario.toFixed(2),
                valorTotal: (p.quantidade * p.valorUnitario).toFixed(2),
              })),
            );
          }
          pendenteLocal = await aplicarBaixaEstoquePecasManutencao(
            tx,
            pecasResolvidas,
            pecasAntigas,
          );
        });
        aplicarBaixaEstoqueLocalPendente(pendenteLocal);
        // Mantém espelho local em sincronia (evita edição “sumir” ao reabrir).
        const localExistente = await getLocalManutencao(ctx.user.id, id);
        if (localExistente) {
          await updateLocalManutencao(ctx.user.id, id, localPayload);
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;

        await updateLocalManutencao(ctx.user.id, id, localPayload);
        aplicarBaixaEstoqueLocalPendente(
          montarDeltasBaixaEstoque(pecasResolvidas, pecasAntigas),
        );
        return { success: true, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      let pecasAntigas: { estoqueId: number | null; quantidade: string | number }[] = [];
      let fromLocal = false;

      try {
        const [row] = await db
          .select({ id: manutencoes.id })
          .from(manutencoes)
          .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)))
          .limit(1);
        if (row) {
          pecasAntigas = await db
            .select({
              estoqueId: manutencaoPecas.estoqueId,
              quantidade: manutencaoPecas.quantidade,
            })
            .from(manutencaoPecas)
            .where(eq(manutencaoPecas.manutencaoId, input.id));
        } else {
          fromLocal = true;
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        fromLocal = true;
      }

      if (fromLocal) {
        const local = await getLocalManutencao(ctx.user.id, input.id);
        if (!local) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Manutenção não encontrada." });
        }
        pecasAntigas = (local.pecas ?? []).map(p => ({
          estoqueId: p.estoqueId ?? null,
          quantidade: p.quantidade,
        }));
        // Devolve peças ao estoque (delta negativo = estorno da baixa).
        aplicarBaixaEstoqueLocalPendente(montarDeltasBaixaEstoque([], pecasAntigas));
        await deleteLocalManutencao(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }

      try {
        let pendenteLocal = new Map<number, number>();
        await db.transaction(async tx => {
          // Devolve saldo antes de apagar o registro.
          pendenteLocal = await aplicarBaixaEstoquePecasManutencao(tx, [], pecasAntigas);
          await tx.delete(manutencaoPecas).where(eq(manutencaoPecas.manutencaoId, input.id));
          await tx
            .delete(manutencoes)
            .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
        });
        aplicarBaixaEstoqueLocalPendente(pendenteLocal);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        const local = await getLocalManutencao(ctx.user.id, input.id);
        if (local) {
          pecasAntigas = (local.pecas ?? []).map(p => ({
            estoqueId: p.estoqueId ?? null,
            quantidade: p.quantidade,
          }));
        }
        aplicarBaixaEstoqueLocalPendente(montarDeltasBaixaEstoque([], pecasAntigas));
        await deleteLocalManutencao(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }
    }),
});

// ─── PESAGENS ROUTER ──────────────────────────────────────────────────────────
const pesagensRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conditions = [eq(pesagens.userId, ctx.user.id)];
        if (input?.animalId) conditions.push(eq(pesagens.animalId, input.animalId));
        const rows = await db
          .select()
          .from(pesagens)
          .where(and(...conditions))
          .orderBy(desc(pesagens.createdAt));
        if (rows.length > 0) return rows;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      return listLocalPesagens(ctx.user.id, input?.animalId);
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      peso: z.string(),
      data: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { data, ...rest } = input;
        const result = await db.insert(pesagens).values({
          userId: ctx.user.id,
          ...rest,
          data: new Date(data),
        });
        await db.update(animais).set({ pesoAtual: input.peso }).where(and(eq(animais.id, input.animalId), eq(animais.userId, ctx.user.id)));
        return { success: true, id: (result as any)[0]?.insertId };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const result = await createLocalPesagem(ctx.user.id, input);
        return { success: true, id: result.id, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(pesagens).where(and(eq(pesagens.id, input.id), eq(pesagens.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        await deleteLocalPesagem(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }
    }),
});

// ─── NUTRICAO ROUTER ──────────────────────────────────────────────────────────
const nutricaoRouter = router({
  listBatidas: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(batidas).where(eq(batidas.userId, ctx.user.id)).orderBy(desc(batidas.createdAt));
  }),

  createBatida: protectedProcedure
    .input(z.object({
      data: z.string(),
      quantidade: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(batidas).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  deleteBatida: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(batidas).where(and(eq(batidas.id, input.id), eq(batidas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── BENFEITORIAS ROUTER ──────────────────────────────────────────────────────

async function listarFazendasParaImportacao(userId: number): Promise<{ id: number; nome: string }[]> {
  try {
    const rows = await db
      .select({ id: fazendas.id, nome: fazendas.nome })
      .from(fazendas)
      .where(eq(fazendas.userId, userId));
    const localRows = await listLocalFazendas(userId);
    const dbIds = new Set(rows.map(row => row.id));
    const localOnly = localRows
      .filter(row => !dbIds.has(row.id))
      .map(row => ({ id: row.id, nome: row.nome }));
    return [...rows, ...localOnly];
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const localRows = await listLocalFazendas(userId);
    return localRows.map(row => ({ id: row.id, nome: row.nome }));
  }
}

async function fazendaExisteParaImportacao(userId: number, fazendaId: number): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: fazendas.id })
      .from(fazendas)
      .where(and(eq(fazendas.id, fazendaId), eq(fazendas.userId, userId)));
    if (row) return true;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
  }
  return (await getLocalFazenda(userId, fazendaId)) != null;
}

/** Mesma estrutura do cadastro manual (create), sem imagens. */
async function inserirBenfeitoriaImportada(
  userId: number,
  data: {
    fazendaId: number;
    nome: string;
    anoConstrucao: number;
    tipo?: string;
    localizacao?: string;
    estado?: string;
    vidaUtil?: string;
    valorEstimado?: string;
    observacoes?: string;
  }
): Promise<number | undefined> {
  const row = toBenfeitoriaRow(userId, data, [null, null, null]);
  try {
    const result = await db.insert(benfeitorias).values(row);
    const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
    if (Number.isFinite(id) && id > 0) {
      try {
        await updateLocalBenfeitoria(userId, id, row);
      } catch (mirrorError) {
        console.warn("[benfeitorias.importar] Espelho local não gravado:", mirrorError);
      }
      return id;
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    const result = await createLocalBenfeitoria(userId, row);
    return result.id;
  }
  return undefined;
}

const benfeitoriasInputFields = {
  fazendaId: z.number(),
  nome: z.string(),
  anoConstrucao: z.number(),
  percentualAtividade: z.number().optional(),
  tipo: z.string().min(1),
  vidaUtil: z.string().optional(),
  localizacao: z.string().optional(),
  estado: z.string().min(1),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  dataInstalacao: z.string().optional(),
  valorEstimado: z.string().optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

const benfeitoriasUpdateInputFields = {
  fazendaId: z.number().optional(),
  nome: z.string().min(1).optional(),
  anoConstrucao: z.number().optional(),
  percentualAtividade: z.number().optional(),
  tipo: z.string().min(1).optional(),
  vidaUtil: z.string().optional(),
  localizacao: z.string().optional(),
  estado: z.string().min(1).optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  dataInstalacao: z.string().optional(),
  valorEstimado: z.string().optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

const benfeitoriasRouter = router({
  gerarModeloPlanilha: protectedProcedure
    .mutation(async ({ ctx }) => {
      const ExcelJSModule = await import('exceljs');
      const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
      const { COLUNAS_IMPORTACAO } = await import('../shared/importacaoBenfeitorias');
      const { TIPOS_BENFEITORIA, ESTADOS_CONSERVACAO_BENFEITORIA } = await import('../shared/benfeitoria-types');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fazenda Digital';
      wb.created = new Date();

      const COR_HEADER_BG = '1A3C3C';
      const COR_OBRIG_BG = 'B8860B';
      const COR_COL_BG = '2D5A5A';
      const COR_LINHA_ALT = 'F2F7F7';

      let nomesFazendas: string[] = [];
      try {
        const fazendasUsuario = await db
          .select({ nome: fazendas.nome })
          .from(fazendas)
          .where(eq(fazendas.userId, ctx.user.id))
          .orderBy(fazendas.nome);
        nomesFazendas = fazendasUsuario.map(f => f.nome);
      } catch (error) {
        console.warn("[benfeitorias.gerarModeloPlanilha] Banco indisponível; usando fazendas locais no modelo:", error);
        const fazendasLocais = await listLocalFazendas(ctx.user.id);
        nomesFazendas = fazendasLocais.map(f => f.nome).filter(Boolean);
      }

      const ws = wb.addWorksheet('Benfeitorias', {
        properties: { tabColor: { argb: COR_COL_BG } },
        views: [{ state: 'frozen', ySplit: 1 }],
      });

      const headerRow = ws.getRow(1);
      headerRow.height = 20;
      COLUNAS_IMPORTACAO.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.label + (col.obrigatorio ? ' *' : '');
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrigatorio ? COR_OBRIG_BG : COR_COL_BG } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        cell.border = {
          bottom: { style: 'medium', color: { argb: COR_HEADER_BG } },
          right: { style: 'thin', color: { argb: 'FFFFFF' } },
        };
        ws.getColumn(idx + 1).width = col.largura;
      });

      // Valor como TEXTO (@): permite digitar 100.000,00 sem o Excel engolir o ponto.
      // A conversão para moeda acontece na importação (parseMoedaBr).
      const colIdxValor = COLUNAS_IMPORTACAO.findIndex(c => c.key === 'valor') + 1;

      for (let r = 2; r <= 501; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        COLUNAS_IMPORTACAO.forEach((col, idx) => {
          const cell = row.getCell(idx + 1);
          const isAlt = (r % 2 === 0);
          const isValor = col.key === 'valor';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrigatorio ? 'FFF8E1' : (isAlt ? COR_LINHA_ALT : 'FFFFFF') } };
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: isValor ? 'right' : 'left', vertical: 'middle' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
          if (isValor) cell.numFmt = '@';
        });
      }

      if (colIdxValor > 0) {
        ws.getColumn(colIdxValor).numFmt = '@';
      }

      const wsListas = wb.addWorksheet('_Listas', {
        state: 'veryHidden',
        properties: { tabColor: { argb: '888888' } },
      });
      nomesFazendas.forEach((nome, i) => { wsListas.getCell(i + 1, 1).value = nome; });
      TIPOS_BENFEITORIA.forEach((tipo, i) => { wsListas.getCell(i + 1, 2).value = tipo; });
      ESTADOS_CONSERVACAO_BENFEITORIA.forEach((estado, i) => { wsListas.getCell(i + 1, 3).value = estado; });

      const numFazendas = nomesFazendas.length;
      const idxDe = (key: string) => COLUNAS_IMPORTACAO.findIndex(c => c.key === key) + 1;
      const colIdxFazenda = idxDe('fazendaNome');
      const colIdxTipo = idxDe('tipo');
      const colIdxEstado = idxDe('estado');
      const fazendaFormulae = [`_Listas!$A$1:$A$${numFazendas}`];
      const tipoFormulae = [`_Listas!$B$1:$B$${TIPOS_BENFEITORIA.length}`];
      const estadoFormulae = [`_Listas!$C$1:$C$${ESTADOS_CONSERVACAO_BENFEITORIA.length}`];

      if (colIdxFazenda > 0 && numFazendas > 0) {
        for (let r = 2; r <= 501; r++) {
          ws.getRow(r).getCell(colIdxFazenda).dataValidation = {
            type: 'list', allowBlank: false, formulae: fazendaFormulae,
            showErrorMessage: true, errorTitle: 'Fazenda inválida',
            error: 'Selecione uma fazenda da lista. Certifique-se de que a fazenda está cadastrada no sistema.',
          };
        }
      }

      [
        {
          colIdx: colIdxTipo,
          formulae: tipoFormulae,
          errorTitle: 'Tipo inválido',
          error: 'Selecione um tipo de benfeitoria da lista.',
        },
        {
          colIdx: colIdxEstado,
          formulae: estadoFormulae,
          errorTitle: 'Estado inválido',
          error: 'Selecione um estado de conservação da lista.',
        },
      ].forEach(({ colIdx, formulae, errorTitle, error }) => {
        if (colIdx <= 0) return;
        for (let r = 2; r <= 501; r++) {
          ws.getRow(r).getCell(colIdx).dataValidation = {
            type: 'list',
            allowBlank: false,
            formulae,
            showErrorMessage: true,
            errorTitle,
            error,
          };
        }
      });

      const buf = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return { base64, filename: 'Modelo Importação (Benfeitorias).xlsx' };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await db.select().from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id)).orderBy(desc(benfeitorias.createdAt));
      const localRows = await listLocalBenfeitorias(ctx.user.id);
      const dbIds = new Set(rows.map(row => row.id));
      const localOnly = localRows.filter(row => !dbIds.has(row.id));
      return [...rows, ...localOnly];
    } catch (error) {
      if (isDatabaseUnavailable(error)) return listLocalBenfeitorias(ctx.user.id);
      throw error;
    }
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const [row] = await db.select().from(benfeitorias).where(
          and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id))
        );
        if (row) return row;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      return getLocalBenfeitoria(ctx.user.id, input.id);
    }),

  create: protectedProcedure
    .input(z.object(benfeitoriasInputFields))
    .mutation(async ({ ctx, input }) => {
      const { dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const row = toBenfeitoriaRow(
        ctx.user.id,
        { ...rest, dataInstalacao, percentualAtividade },
        [img1, img2, img3],
      );
      try {
        const result = await db.insert(benfeitorias).values(row);
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await updateLocalBenfeitoria(ctx.user.id, id, row);
          } catch (mirrorError) {
            console.warn("[benfeitorias.create] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          const result = await createLocalBenfeitoria(ctx.user.id, row);
          return { success: true, id: result.id, localFallback: true };
        }
        console.error("[benfeitorias.create]", err);
        throw new Error(formatImportDbError(err));
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...benfeitoriasUpdateInputFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const row = toBenfeitoriaUpdateRow(
        { ...rest, dataInstalacao, percentualAtividade },
        [img1, img2, img3],
      );
      try {
        await db.update(benfeitorias).set(row).where(
          and(eq(benfeitorias.id, id), eq(benfeitorias.userId, ctx.user.id)),
        );
        try {
          await updateLocalBenfeitoria(ctx.user.id, id, row);
        } catch (mirrorError) {
          console.warn("[benfeitorias.update] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          await updateLocalBenfeitoria(ctx.user.id, id, row);
          return { success: true, localFallback: true };
        }
        console.error("[benfeitorias.update]", err);
        throw new Error(formatImportDbError(err));
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(benfeitorias).where(and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await deleteLocalBenfeitoria(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  validarImportacao: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      const { normalizarLinha, isLinhaExemplo, parseValorImport } = await import('../shared/importacaoBenfeitorias');

      input.linhas = input.linhas
        .map(l => normalizarLinha(l))
        .filter(l => !isLinhaExemplo(l))
        .filter(l => Object.values(l).some(v => (v || '').trim() !== ''));

      const fazendasUsuario = await listarFazendasParaImportacao(ctx.user.id);
      const fazendaNomeParaId = new Map(fazendasUsuario.map(f => [f.nome.toLowerCase().trim(), f.id]));

      const erros: { linha: number; campo: string; mensagem: string }[] = [];
      const validos: typeof input.linhas = [];
      const anoAtual = new Date().getFullYear();

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = input.linhas[i];
        const numLinha = i + 2;
        const errosLinha: { linha: number; campo: string; mensagem: string }[] = [];

        const fazendaNome = (linha.fazendaNome || '').trim();
        if (!fazendaNome) {
          errosLinha.push({ linha: numLinha, campo: 'Fazenda', mensagem: 'Fazenda é obrigatória' });
        } else if (!fazendaNomeParaId.has(fazendaNome.toLowerCase())) {
          errosLinha.push({ linha: numLinha, campo: 'Fazenda', mensagem: `Fazenda não encontrada: "${fazendaNome}"` });
        }

        const nome = (linha.nome || '').trim();
        if (!nome) {
          errosLinha.push({ linha: numLinha, campo: 'Nome', mensagem: 'Nome da benfeitoria é obrigatório' });
        }

        const tipo = (linha.tipo || '').trim();
        if (!tipo) {
          errosLinha.push({ linha: numLinha, campo: 'Tipo de Benfeitoria', mensagem: 'Tipo de Benfeitoria é obrigatório' });
        }

        const estado = (linha.estado || '').trim();
        if (!estado) {
          errosLinha.push({ linha: numLinha, campo: 'Estado de Conservação', mensagem: 'Estado de Conservação é obrigatório' });
        }

        const anoRaw = (linha.anoConstrucao || '').trim();
        if (!anoRaw) {
          errosLinha.push({ linha: numLinha, campo: 'Ano de Construção', mensagem: 'Ano de Construção é obrigatório' });
        } else {
          const ano = parseInt(anoRaw.replace(/[^0-9]/g, ''), 10);
          if (isNaN(ano) || ano < 1900 || ano > anoAtual + 1) {
            errosLinha.push({ linha: numLinha, campo: 'Ano de Construção', mensagem: `Ano de Construção inválido: "${anoRaw}"` });
          } else {
            linha.anoConstrucao = String(ano);
          }
        }

        const valorRaw = (linha.valor || '').trim();
        if (valorRaw) {
          const valorParsed = parseValorImport(valorRaw);
          if (!valorParsed) {
            errosLinha.push({ linha: numLinha, campo: 'Valor', mensagem: `Valor inválido: "${valorRaw}"` });
          } else {
            linha.valor = valorParsed;
          }
        }

        const vidaUtilRaw = (linha.vidaUtil || '').trim();
        if (vidaUtilRaw) {
          const vidaUtilNum = parseInt(vidaUtilRaw.replace(/[^0-9]/g, ''), 10);
          if (isNaN(vidaUtilNum) || vidaUtilNum <= 0) {
            errosLinha.push({ linha: numLinha, campo: 'Vida Útil', mensagem: `Vida Útil inválida: "${vidaUtilRaw}"` });
          } else {
            linha.vidaUtil = String(vidaUtilNum);
          }
        }

        if (errosLinha.length > 0) {
          erros.push(...errosLinha);
        } else {
          validos.push(linha);
        }
      }

      return {
        total: input.linhas.length,
        validos: validos.length,
        invalidos: erros.length > 0 ? input.linhas.length - validos.length : 0,
        erros,
        fazendaNomeParaId: Object.fromEntries(fazendaNomeParaId),
      };
    }),

  importar: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
      fazendaNomeParaId: z.record(z.string(), z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const { normalizarLinha, isLinhaExemplo, parseValorImport } = await import('../shared/importacaoBenfeitorias');

      const importados: number[] = [];
      const rejeitados: { linha: number; mensagem: string }[] = [];

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = normalizarLinha(input.linhas[i]);
        const numLinha = i + 2;
        if (isLinhaExemplo(linha)) continue;
        try {
          const fazendaNome = (linha.fazendaNome || '').trim().toLowerCase();
          const fazendaId = fazendaNome ? input.fazendaNomeParaId[fazendaNome] : undefined;
          if (!fazendaId) {
            rejeitados.push({ linha: numLinha, mensagem: 'A Fazenda informada não foi encontrada.' });
            continue;
          }

          const fazendaValida = await fazendaExisteParaImportacao(ctx.user.id, fazendaId);
          if (!fazendaValida) {
            rejeitados.push({ linha: numLinha, mensagem: 'A Fazenda informada não foi encontrada.' });
            continue;
          }

          const nome = (linha.nome || '').trim();
          if (!nome) {
            rejeitados.push({ linha: numLinha, mensagem: 'O campo Nome é obrigatório.' });
            continue;
          }

          const tipo = (linha.tipo || '').trim();
          if (!tipo) {
            rejeitados.push({ linha: numLinha, mensagem: 'O campo Tipo de Benfeitoria é obrigatório.' });
            continue;
          }

          const estado = (linha.estado || '').trim();
          if (!estado) {
            rejeitados.push({ linha: numLinha, mensagem: 'O campo Estado de Conservação é obrigatório.' });
            continue;
          }

          const anoNum = parseInt(String(linha.anoConstrucao || '').replace(/[^0-9]/g, ''), 10);
          if (isNaN(anoNum)) {
            rejeitados.push({ linha: numLinha, mensagem: 'O campo Ano de Construção deve conter um número válido.' });
            continue;
          }

          const valorRaw = (linha.valor || '').trim();
          const valorNum = valorRaw ? parseValorImport(valorRaw) : undefined;
          if (valorRaw && !valorNum) {
            rejeitados.push({ linha: numLinha, mensagem: 'O campo Valor possui um formato inválido.' });
            continue;
          }

          const insertId = await inserirBenfeitoriaImportada(ctx.user.id, {
            fazendaId,
            nome,
            anoConstrucao: anoNum,
            tipo,
            estado,
            valorEstimado: valorNum,
            vidaUtil: (linha.vidaUtil || '').trim() || undefined,
            observacoes: (linha.observacoes || '').trim() || undefined,
          });
          if (insertId) importados.push(insertId);
        } catch (err: unknown) {
          rejeitados.push({ linha: numLinha, mensagem: formatImportDbError(err) });
        }
      }

      return {
        total: input.linhas.length,
        importados: importados.length,
        rejeitados: rejeitados.length,
        detalhesRejeitados: rejeitados,
      };
    }),
});

// ─── ESTOQUE ROUTER ───────────────────────────────────────────────────────────

/** Une DB + local; evita fantasma de produto duplicado na mesma fazenda. */
function mergeEstoqueListPreferLocal<T extends {
  id: number;
  produtoId?: number | null;
  fazendaId?: number | null;
  nome?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}>(dbRows: T[], localRows: T[]): T[] {
  const ts = (r: T) => {
    const raw = r.updatedAt ?? r.createdAt;
    if (!raw) return 0;
    return raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  };
  const keyOf = (r: T) => {
    const pid = r.produtoId != null && Number(r.produtoId) > 0 ? Number(r.produtoId) : null;
    const fid = r.fazendaId != null && Number(r.fazendaId) > 0 ? Number(r.fazendaId) : null;
    if (pid && fid) return `p:${pid}|f:${fid}`;
    const nome = String(r.nome ?? "").trim().toLowerCase();
    if (nome && fid) return `n:${nome}|f:${fid}`;
    return `e:${r.id}`;
  };

  const localById = new Map(localRows.map(r => [r.id, r]));
  const byKey = new Map<string, T>();

  const consider = (row: T) => {
    const key = keyOf(row);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      return;
    }
    if (ts(row) >= ts(prev)) byKey.set(key, row);
  };

  for (const row of dbRows) {
    consider(localById.get(row.id) ?? row);
  }
  for (const row of localRows) {
    consider(row);
  }

  return [...byKey.values()].sort((a, b) => ts(b) - ts(a));
}

const estoqueInputFields = {
  fazendaId: z.number().optional(),
  fazendaIds: z.array(z.number()).optional(),
  estoquesConfig: z
    .array(
      z.object({
        fazendaId: z.number(),
        produzidoNaFazenda: z.boolean().optional(),
        monitorarEstoque: z.boolean().optional(),
        quantidadeMinima: z.string().nullish(),
        quantidadeMaxima: z.string().nullish(),
      })
    )
    .optional(),
  produtoId: z.number().optional(),
  nome: z.string(),
  categoria: z.string(),
  subcategoria: z.string(),
  unidade: z.string(),
  quantidadeMinima: z.string().optional(),
  quantidadeMaxima: z.string().optional(),
  fabricante: z.string().optional(),
  identificadorUnico: z.string().optional(),
  produzidoNaFazenda: z.boolean().optional(),
  monitorarEstoque: z.boolean().optional(),
  situacao: z.enum(["ativo", "inativo"]).optional(),
  embalagens: z.array(z.object({
    nome: z.string(),
    volume: z.number().optional(),
    unidade: z.string().optional(),
  })).optional(),
  possuiCarencia: z.boolean().optional(),
  carenciaAbateDias: z.number().nullish(),
  carenciaAbateUnidade: z.enum(["d", "h"]).nullish(),
  carenciaLeiteDias: z.number().nullish(),
  observacoesCarencia: z.string().nullish(),
  quantidade: z.string().optional(),
  valorUnitario: z.string().optional(),
  localizacao: z.string().optional(),
  observacoes: z.string().optional(),
};

const estoqueRouter = router({
  list: protectedProcedure.query(async () => {
    try {
      const rows = await db.select().from(estoque).orderBy(desc(estoque.createdAt));
      const localRows = devLocalStore.listEstoque();
      if (localRows.length === 0) return rows;
      return mergeEstoqueListPreferLocal(rows, localRows);
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return devLocalStore.listEstoque();
    }
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ input }) => {
      try {
        const rows = await db
          .select()
          .from(estoque)
          .where(eq(estoque.fazendaId, input.fazendaId))
          .orderBy(desc(estoque.createdAt));
        const localRows = devLocalStore
          .listEstoque()
          .filter(r => Number(r.fazendaId) === input.fazendaId);
        if (localRows.length === 0) return rows;
        return mergeEstoqueListPreferLocal(rows, localRows);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.listEstoque().filter(r => Number(r.fazendaId) === input.fazendaId);
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const mergeVinculos = (
        base: {
          fazendaId: number;
          estoqueId: number;
          produzidoNaFazenda: boolean;
          monitorarEstoque: boolean;
          quantidadeMinima: string | null;
          quantidadeMaxima: string | null;
          quantidade: string | null;
        }[],
        extras: typeof base
      ) => {
        const byFarm = new Map<number, (typeof base)[number]>();
        for (const v of base) {
          const fid = Number(v.fazendaId);
          if (Number.isFinite(fid) && fid > 0) byFarm.set(fid, { ...v, fazendaId: fid });
        }
        // Vínculos locais sobrescrevem / completam por fazenda
        for (const v of extras) {
          const fid = Number(v.fazendaId);
          if (Number.isFinite(fid) && fid > 0) byFarm.set(fid, { ...v, fazendaId: fid });
        }
        return [...byFarm.values()];
      };

      try {
        const [row] = await db.select().from(estoque).where(eq(estoque.id, input.id));
        if (row) {
          let estoquesVinculados: {
            fazendaId: number;
            estoqueId: number;
            produzidoNaFazenda: boolean;
            monitorarEstoque: boolean;
            quantidadeMinima: string | null;
            quantidadeMaxima: string | null;
            quantidade: string | null;
          }[] = [];
          if (row.produtoId) {
            const linked = await db
              .select({
                id: estoque.id,
                fazendaId: estoque.fazendaId,
                produzidoNaFazenda: estoque.produzidoNaFazenda,
                monitorarEstoque: estoque.monitorarEstoque,
                quantidadeMinima: estoque.quantidadeMinima,
                quantidadeMaxima: estoque.quantidadeMaxima,
                quantidade: estoque.quantidade,
              })
              .from(estoque)
              .where(eq(estoque.produtoId, row.produtoId));
            estoquesVinculados = linked
              .filter((l): l is typeof l & { fazendaId: number } => l.fazendaId != null && l.fazendaId > 0)
              .map(l => ({
                fazendaId: l.fazendaId,
                estoqueId: l.id,
                produzidoNaFazenda: !!l.produzidoNaFazenda,
                monitorarEstoque: !!l.monitorarEstoque,
                quantidadeMinima: l.quantidadeMinima != null ? String(l.quantidadeMinima) : null,
                quantidadeMaxima: l.quantidadeMaxima != null ? String(l.quantidadeMaxima) : null,
                quantidade: l.quantidade != null ? String(l.quantidade) : null,
              }));
          } else if (row.fazendaId) {
            estoquesVinculados = [
              {
                fazendaId: row.fazendaId,
                estoqueId: row.id,
                produzidoNaFazenda: !!row.produzidoNaFazenda,
                monitorarEstoque: !!row.monitorarEstoque,
                quantidadeMinima: row.quantidadeMinima != null ? String(row.quantidadeMinima) : null,
                quantidadeMaxima: row.quantidadeMaxima != null ? String(row.quantidadeMaxima) : null,
                quantidade: row.quantidade != null ? String(row.quantidade) : null,
              },
            ];
          }

          const localRow = devLocalStore.getEstoque(input.id);
          const localProdutoId = localRow?.produtoId ?? row.produtoId ?? null;
          const localVinculos = devLocalStore.listEstoquesVinculados(localProdutoId, localRow ?? row);
          estoquesVinculados = mergeVinculos(estoquesVinculados, localVinculos);

          const base = localRow ? { ...row, ...localRow, id: row.id } : row;
          const fazendaIds = [...new Set(estoquesVinculados.map(e => e.fazendaId))];
          return { ...base, fazendaIds, estoquesVinculados };
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const local = devLocalStore.getEstoque(input.id);
      if (!local) return null;
      const estoquesVinculados = devLocalStore.listEstoquesVinculados(
        local.produtoId ?? null,
        local
      );
      return {
        ...local,
        fazendaIds: estoquesVinculados.map(e => e.fazendaId),
        estoquesVinculados,
      };
    }),

  create: protectedProcedure
    .input(z.object(estoqueInputFields))
    .mutation(async ({ input }) => {
      const fazendaIds = resolverFazendaIds(input);
      if (fazendaIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione pelo menos uma fazenda para usar este produto.",
        });
      }
      const catalogoValues = toCatalogoInsertValues(input);

      try {
        const catalogoResult = await db.insert(produtosCatalogo).values(catalogoValues);
        const produtoId = Number((catalogoResult as any)[0]?.insertId);
        if (!produtoId) throw new Error("Falha ao criar produto no catálogo.");

        let firstEstoqueId: number | null = null;
        for (const fazendaId of fazendaIds) {
          const cfg = configParaFazenda(input, fazendaId);
          const values = toEstoqueInsertValues({
            ...input,
            produtoId,
            fazendaId,
            produzidoNaFazenda: cfg.produzidoNaFazenda,
            monitorarEstoque: cfg.monitorarEstoque,
            quantidadeMinima: cfg.quantidadeMinima ?? undefined,
            quantidadeMaxima: cfg.quantidadeMaxima ?? undefined,
            quantidade: fazendaId === fazendaIds[0] ? input.quantidade ?? "0" : "0",
          });
          const result = await db.insert(estoque).values(values);
          const estoqueId = Number((result as any)[0]?.insertId);
          if (!firstEstoqueId && estoqueId) firstEstoqueId = estoqueId;
        }
        return { success: true, id: firstEstoqueId ?? produtoId, produtoId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.createProdutoComEstoques({
          ...input,
          embalagens: input.embalagens,
          fazendaIds,
        });
        return {
          success: true,
          id: result.id,
          produtoId: result.produtoId,
          localFallback: true,
        };
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...estoqueInputFields }))
    .mutation(async ({ input }) => {
      const { id, ...fields } = input;
      const fazendaIds = resolverFazendaIds(fields);
      if (fazendaIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione pelo menos uma fazenda para usar este produto.",
        });
      }
      const catalogoValues = toCatalogoInsertValues(fields);
      const syncValues = toEstoqueSyncFromCatalogo(catalogoValues);
      const localPayload = { id, ...fields, embalagens: fields.embalagens };

      try {
        const [existing] = await db.select().from(estoque).where(eq(estoque.id, id));

        if (existing) {
          let produtoId = existing.produtoId;
          if (produtoId) {
            await db
              .update(produtosCatalogo)
              .set(catalogoValues)
              .where(eq(produtosCatalogo.id, produtoId));
            await db
              .update(estoque)
              .set({
                ...syncValues,
                valorUnitario: fields.valorUnitario ?? existing.valorUnitario,
                localizacao: fields.localizacao ?? existing.localizacao,
              })
              .where(eq(estoque.produtoId, produtoId));

            // Situação operacional (ativo/inativo) é por fazenda — não cascatear a do catálogo

            const linked = await db
              .select()
              .from(estoque)
              .where(eq(estoque.produtoId, produtoId));
            const linkedFazendas = new Set(
              linked
                .map(l => Number(l.fazendaId))
                .filter((f): f is number => Number.isFinite(f) && f > 0)
            );
            const desired = new Set(fazendaIds.map(Number).filter(f => Number.isFinite(f) && f > 0));

            for (const item of linked) {
              const itemFarm = Number(item.fazendaId);
              if (!Number.isFinite(itemFarm) || itemFarm <= 0 || desired.has(itemFarm)) continue;
              const qty = Number(item.quantidade ?? 0);
              const [mov] = await db
                .select({ id: estoqueMovimentacoes.id })
                .from(estoqueMovimentacoes)
                .where(eq(estoqueMovimentacoes.estoqueId, item.id))
                .limit(1);
              if (mov || (!Number.isNaN(qty) && qty !== 0)) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "Este produto possui movimentações ou estoque nesta Fazenda. Não é possível desvincular diretamente. Inative o produto para esta Fazenda ou ajuste o estoque antes.",
                });
              }
              await db.delete(estoque).where(eq(estoque.id, item.id));
            }

            for (const item of linked) {
              const itemFarm = Number(item.fazendaId);
              if (!Number.isFinite(itemFarm) || itemFarm <= 0 || !desired.has(itemFarm)) continue;
              const cfg = configParaFazenda(fields, itemFarm, {
                produzidoNaFazenda: !!item.produzidoNaFazenda,
                monitorarEstoque: !!item.monitorarEstoque,
                quantidadeMinima: item.quantidadeMinima != null ? String(item.quantidadeMinima) : null,
                quantidadeMaxima: item.quantidadeMaxima != null ? String(item.quantidadeMaxima) : null,
              });
              await db
                .update(estoque)
                .set({
                  produzidoNaFazenda: cfg.produzidoNaFazenda,
                  monitorarEstoque: cfg.monitorarEstoque,
                  quantidadeMinima: cfg.quantidadeMinima ?? "0",
                  quantidadeMaxima: cfg.quantidadeMaxima,
                })
                .where(eq(estoque.id, item.id));
            }

            for (const fazendaId of fazendaIds) {
              if (linkedFazendas.has(fazendaId)) continue;
              const cfg = configParaFazenda(fields, fazendaId);
              await db.insert(estoque).values(
                toEstoqueInsertValues({
                  ...fields,
                  produtoId,
                  fazendaId,
                  produzidoNaFazenda: cfg.produzidoNaFazenda,
                  monitorarEstoque: cfg.monitorarEstoque,
                  quantidadeMinima: cfg.quantidadeMinima ?? undefined,
                  quantidadeMaxima: cfg.quantidadeMaxima ?? undefined,
                  quantidade: "0",
                })
              );
            }
          } else {
            const catalogoResult = await db.insert(produtosCatalogo).values(catalogoValues);
            produtoId = Number(
              (catalogoResult as any)[0]?.insertId ?? (catalogoResult as any).insertId
            );
            const cfg = configParaFazenda(fields, existing.fazendaId ?? 0, {
              produzidoNaFazenda: !!existing.produzidoNaFazenda,
              monitorarEstoque: !!existing.monitorarEstoque,
            });
            await db
              .update(estoque)
              .set({
                ...toEstoqueInsertValues({
                  ...fields,
                  produtoId: produtoId ?? undefined,
                  fazendaId: existing.fazendaId ?? undefined,
                  produzidoNaFazenda: cfg.produzidoNaFazenda,
                  monitorarEstoque: cfg.monitorarEstoque,
                  quantidadeMinima: cfg.quantidadeMinima ?? undefined,
                  quantidadeMaxima: cfg.quantidadeMaxima ?? undefined,
                }),
                quantidade: existing.quantidade,
              })
              .where(eq(estoque.id, id));

            if (produtoId && fazendaIds.length > 0) {
              for (const fazendaId of fazendaIds) {
                if (fazendaId === existing.fazendaId) continue;
                const farmCfg = configParaFazenda(fields, fazendaId);
                await db.insert(estoque).values(
                  toEstoqueInsertValues({
                    ...fields,
                    produtoId,
                    fazendaId,
                    produzidoNaFazenda: farmCfg.produzidoNaFazenda,
                    monitorarEstoque: farmCfg.monitorarEstoque,
                    quantidadeMinima: farmCfg.quantidadeMinima ?? undefined,
                    quantidadeMaxima: farmCfg.quantidadeMaxima ?? undefined,
                    quantidade: "0",
                  })
                );
              }
            }
          }

          if (devLocalStore.getEstoque(id)) {
            devLocalStore.updateProdutoComEstoques(localPayload);
          } else if (produtoId) {
            // Espelha no local mesmo se o id editado só existir no MySQL
            const localAny = devLocalStore.listEstoque().find(e => e.produtoId === produtoId);
            if (localAny) {
              devLocalStore.updateProdutoComEstoques({ ...localPayload, id: localAny.id });
            }
          }
          return { success: true, produtoId: produtoId ?? undefined };
        }

        const local = devLocalStore.getEstoque(id);
        if (local) {
          devLocalStore.updateProdutoComEstoques(localPayload);
          return { success: true, localFallback: true };
        }

        throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        devLocalStore.updateProdutoComEstoques(localPayload);
        return { success: true, localFallback: true };
      }
    }),

  vincularFazenda: protectedProcedure
    .input(z.object({
      produtoId: z.number(),
      fazendaId: z.number(),
      produzidoNaFazenda: z.boolean().optional(),
      monitorarEstoque: z.boolean().optional(),
      quantidadeMinima: z.string().optional(),
      quantidadeMaxima: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const [catalogo] = await db
          .select()
          .from(produtosCatalogo)
          .where(eq(produtosCatalogo.id, input.produtoId));
        if (!catalogo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produto do catálogo não encontrado." });
        }
        const [existing] = await db
          .select({ id: estoque.id })
          .from(estoque)
          .where(
            and(eq(estoque.produtoId, input.produtoId), eq(estoque.fazendaId, input.fazendaId))
          )
          .limit(1);
        if (existing) {
          const patch: Record<string, unknown> = {};
          if (input.produzidoNaFazenda != null) patch.produzidoNaFazenda = input.produzidoNaFazenda;
          if (input.monitorarEstoque != null) patch.monitorarEstoque = input.monitorarEstoque;
          if (input.quantidadeMinima !== undefined) patch.quantidadeMinima = input.quantidadeMinima;
          if (input.quantidadeMaxima !== undefined) patch.quantidadeMaxima = input.quantidadeMaxima;
          if (Object.keys(patch).length > 0) {
            await db.update(estoque).set(patch).where(eq(estoque.id, existing.id));
          }
          return { success: true, id: existing.id, alreadyLinked: true };
        }
        const values = toEstoqueInsertValues({
          produtoId: input.produtoId,
          fazendaId: input.fazendaId,
          nome: catalogo.nome,
          categoria: catalogo.categoria ?? "",
          subcategoria: catalogo.subcategoria ?? "",
          unidade: catalogo.unidade ?? "",
          monitorarEstoque: input.monitorarEstoque ?? false,
          situacao: (catalogo.situacao as "ativo" | "inativo" | undefined) ?? "ativo",
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
        });
        const result = await db.insert(estoque).values(values);
        return { success: true, id: Number((result as any)[0]?.insertId) };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.vincularFazenda(input);
        return { success: true, id: result.id, localFallback: true, alreadyLinked: result.alreadyLinked };
      }
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      /** fazenda = desvincular só desta fazenda; catalogo = apagar produto inteiro */
      escopo: z.enum(["fazenda", "catalogo"]).default("fazenda"),
    }))
    .mutation(async ({ input }) => {
      const deleteLocal = () => {
        try {
          return devLocalStore.deleteEstoque(input.id, input.escopo);
        } catch (err) {
          if (err instanceof Error && err.message.includes("desvincular")) throw err;
          return { success: true, escopo: input.escopo };
        }
      };

      try {
        const [row] = await db.select().from(estoque).where(eq(estoque.id, input.id));
        if (!row) {
          const local = deleteLocal();
          return { success: true, localFallback: true, escopo: input.escopo, ...local };
        }

        if (input.escopo === "fazenda") {
          const qty = Number(row.quantidade ?? 0);
          const [mov] = await db
            .select({ id: estoqueMovimentacoes.id })
            .from(estoqueMovimentacoes)
            .where(eq(estoqueMovimentacoes.estoqueId, row.id))
            .limit(1);
          if (mov || (!Number.isNaN(qty) && qty !== 0)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Este produto possui movimentações ou estoque nesta Fazenda. Não é possível desvincular diretamente. Inative o produto para esta Fazenda ou ajuste o estoque antes.",
            });
          }

          await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.estoqueId, row.id));
          await db.delete(estoque).where(eq(estoque.id, row.id));

          if (row.produtoId) {
            const restantes = await db
              .select({ id: estoque.id })
              .from(estoque)
              .where(eq(estoque.produtoId, row.produtoId))
              .limit(1);
            if (restantes.length === 0) {
              await db.delete(produtosCatalogo).where(eq(produtosCatalogo.id, row.produtoId));
            }
          }

          try {
            deleteLocal();
          } catch { /* ignore */ }
          return { success: true, escopo: "fazenda" as const };
        }

        // Catálogo: remove todas as fazendas + ficha
        const produtoId = row.produtoId;
        let estoqueIds = [row.id];
        if (produtoId) {
          const linked = await db
            .select({ id: estoque.id })
            .from(estoque)
            .where(eq(estoque.produtoId, produtoId));
          estoqueIds = linked.map(l => l.id);
        }

        if (estoqueIds.length > 0) {
          await db
            .delete(estoqueMovimentacoes)
            .where(inArray(estoqueMovimentacoes.estoqueId, estoqueIds));
          await db.delete(estoque).where(inArray(estoque.id, estoqueIds));
        }
        if (produtoId) {
          await db.delete(produtosCatalogo).where(eq(produtosCatalogo.id, produtoId));
        }

        try {
          deleteLocal();
        } catch { /* ignore */ }
        return { success: true, escopo: "catalogo" as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          const local = deleteLocal();
          return { success: true, localFallback: true, escopo: input.escopo, ...local };
        } catch (localErr) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: localErr instanceof Error ? localErr.message : "Não foi possível desvincular o produto.",
          });
        }
      }
    }),

  inativarProdutos: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      /** fazenda = só os estoques informados; catalogo = produto inteiro + todas as fazendas */
      escopo: z.enum(["fazenda", "catalogo"]).default("fazenda"),
    }))
    .mutation(async ({ input }) => {
      const aplicar = async () => {
        if (input.escopo === "fazenda") {
          await db
            .update(estoque)
            .set({ situacao: "inativo" })
            .where(inArray(estoque.id, input.ids));
          return { success: true, count: input.ids.length, escopo: input.escopo as const };
        }

        // Catálogo: resolve todos os estoques vinculados e a ficha mestra
        const rows = await db.select().from(estoque).where(inArray(estoque.id, input.ids));
        const produtoIds = new Set<number>();
        const estoqueIds = new Set<number>(input.ids);
        for (const row of rows) {
          if (row.produtoId) produtoIds.add(row.produtoId);
        }
        if (produtoIds.size > 0) {
          const linked = await db
            .select({ id: estoque.id, produtoId: estoque.produtoId })
            .from(estoque)
            .where(inArray(estoque.produtoId, [...produtoIds]));
          for (const l of linked) estoqueIds.add(l.id);
          await db
            .update(produtosCatalogo)
            .set({ situacao: "inativo" })
            .where(inArray(produtosCatalogo.id, [...produtoIds]));
        }
        const ids = [...estoqueIds];
        if (ids.length > 0) {
          await db.update(estoque).set({ situacao: "inativo" }).where(inArray(estoque.id, ids));
        }
        return { success: true, count: ids.length, escopo: input.escopo as const };
      };

      try {
        const result = await aplicar();
        try {
          devLocalStore.inativarProdutos(input.ids, input.escopo);
        } catch { /* ignore */ }
        return result;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.inativarProdutos(input.ids, input.escopo);
        return { ...result, localFallback: true };
      }
    }),

  ativarProdutos: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      escopo: z.enum(["fazenda", "catalogo"]).default("fazenda"),
    }))
    .mutation(async ({ input }) => {
      const aplicar = async () => {
        if (input.escopo === "fazenda") {
          await db
            .update(estoque)
            .set({ situacao: "ativo" })
            .where(inArray(estoque.id, input.ids));
          return { success: true, count: input.ids.length, escopo: input.escopo as const };
        }

        const rows = await db.select().from(estoque).where(inArray(estoque.id, input.ids));
        const produtoIds = new Set<number>();
        const estoqueIds = new Set<number>(input.ids);
        for (const row of rows) {
          if (row.produtoId) produtoIds.add(row.produtoId);
        }
        if (produtoIds.size > 0) {
          const linked = await db
            .select({ id: estoque.id, produtoId: estoque.produtoId })
            .from(estoque)
            .where(inArray(estoque.produtoId, [...produtoIds]));
          for (const l of linked) estoqueIds.add(l.id);
          await db
            .update(produtosCatalogo)
            .set({ situacao: "ativo" })
            .where(inArray(produtosCatalogo.id, [...produtoIds]));
        }
        const ids = [...estoqueIds];
        if (ids.length > 0) {
          await db.update(estoque).set({ situacao: "ativo" }).where(inArray(estoque.id, ids));
        }
        return { success: true, count: ids.length, escopo: input.escopo as const };
      };

      try {
        const result = await aplicar();
        try {
          devLocalStore.ativarProdutos(input.ids, input.escopo);
        } catch { /* ignore */ }
        return result;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.ativarProdutos(input.ids, input.escopo);
        return { ...result, localFallback: true };
      }
    }),

  resumo: protectedProcedure.query(async () => {
    try {
      const itens = await db.select().from(estoque);
      const monitorados = itens.filter(i => i.monitorarEstoque);
      const abaixoLimite = monitorados.filter(i => {
        const q = Number(i.quantidade ?? 0);
        const min = Number(i.quantidadeMinima ?? 0);
        return min > 0 && q <= min;
      });
      return {
        totalMonitorados: monitorados.length,
        totalAbaixoLimite: abaixoLimite.length,
      };
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      const itens = devLocalStore.listEstoque();
      const monitorados = itens.filter(i => i.monitorarEstoque);
      const abaixoLimite = monitorados.filter(i => {
        const q = Number(i.quantidade ?? 0);
        const min = Number(i.quantidadeMinima ?? 0);
        return min > 0 && q <= min;
      });
      return {
        totalMonitorados: monitorados.length,
        totalAbaixoLimite: abaixoLimite.length,
      };
    }
  }),

  listMovimentacoes: protectedProcedure.query(async () => {
    try {
      const rows = await db
        .select({
          id: estoqueMovimentacoes.id,
          grupoId: estoqueMovimentacoes.grupoId,
          estoqueId: estoqueMovimentacoes.estoqueId,
          abastecimentoId: estoqueMovimentacoes.abastecimentoId,
          fazendaId: estoqueMovimentacoes.fazendaId,
          produtoFazendaId: estoque.fazendaId,
          userId: estoqueMovimentacoes.userId,
          registradoPor: estoqueMovimentacoes.registradoPor,
          tipo: estoqueMovimentacoes.tipo,
          dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
          quantidade: estoqueMovimentacoes.quantidade,
          dataValidade: estoqueMovimentacoes.dataValidade,
          destino: estoqueMovimentacoes.destino,
          manejo: estoqueMovimentacoes.manejo,
          notaFiscal: estoqueMovimentacoes.notaFiscal,
          frete: estoqueMovimentacoes.frete,
          fornecedor: estoqueMovimentacoes.fornecedor,
          valor: estoqueMovimentacoes.valor,
          observacoes: estoqueMovimentacoes.observacoes,
          status: estoqueMovimentacoes.status,
          originalGrupoId: estoqueMovimentacoes.originalGrupoId,
          motivoEstorno: estoqueMovimentacoes.motivoEstorno,
          createdAt: estoqueMovimentacoes.createdAt,
          updatedAt: estoqueMovimentacoes.updatedAt,
          updatedByUserId: estoqueMovimentacoes.updatedByUserId,
          updatedByNome: estoqueMovimentacoes.updatedByNome,
          nome: estoque.nome,
          categoria: estoque.categoria,
          subcategoria: estoque.subcategoria,
          fabricante: estoque.fabricante,
          identificadorUnico: estoque.identificadorUnico,
          unidade: estoque.unidade,
          situacao: estoque.situacao,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
        .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
      const localRows = devLocalStore.listMovimentacoes();
      if (localRows.length === 0) return rows;
      const ids = new Set(rows.map(r => r.id));
      const extras = localRows.filter(r => !ids.has(r.id));
      return [...rows, ...extras];
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return devLocalStore.listMovimentacoes();
    }
  }),

  getMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      try {
        const [row] = await db
          .select({
            id: estoqueMovimentacoes.id,
            grupoId: estoqueMovimentacoes.grupoId,
            estoqueId: estoqueMovimentacoes.estoqueId,
            abastecimentoId: estoqueMovimentacoes.abastecimentoId,
            fazendaId: estoqueMovimentacoes.fazendaId,
            produtoFazendaId: estoque.fazendaId,
            userId: estoqueMovimentacoes.userId,
            registradoPor: estoqueMovimentacoes.registradoPor,
            tipo: estoqueMovimentacoes.tipo,
            dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
            quantidade: estoqueMovimentacoes.quantidade,
            dataValidade: estoqueMovimentacoes.dataValidade,
            destino: estoqueMovimentacoes.destino,
            manejo: estoqueMovimentacoes.manejo,
            notaFiscal: estoqueMovimentacoes.notaFiscal,
            frete: estoqueMovimentacoes.frete,
            fornecedor: estoqueMovimentacoes.fornecedor,
            valor: estoqueMovimentacoes.valor,
            observacoes: estoqueMovimentacoes.observacoes,
            status: estoqueMovimentacoes.status,
            originalGrupoId: estoqueMovimentacoes.originalGrupoId,
            motivoEstorno: estoqueMovimentacoes.motivoEstorno,
            createdAt: estoqueMovimentacoes.createdAt,
            updatedAt: estoqueMovimentacoes.updatedAt,
            updatedByUserId: estoqueMovimentacoes.updatedByUserId,
            updatedByNome: estoqueMovimentacoes.updatedByNome,
            nome: estoque.nome,
            categoria: estoque.categoria,
            subcategoria: estoque.subcategoria,
            fabricante: estoque.fabricante,
            unidade: estoque.unidade,
            embalagens: estoque.embalagens,
            situacao: estoque.situacao,
          })
          .from(estoqueMovimentacoes)
          .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
          .where(eq(estoqueMovimentacoes.id, input.id));
        if (row) return row;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      // Itens criados no store local (dev) aparecem na listagem, mas podem não existir no banco.
      return devLocalStore.getMovimentacao(input.id);
    }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      estoqueId: z.number(),
      fazendaId: z.number({ required_error: "Informe a fazenda da movimentação." }),
      grupoId: z.string().min(1).max(40).optional(),
      tipo: z.string().optional(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      destino: z.string().optional(),
      manejo: z.string().optional(),
      notaFiscal: z.string().optional(),
      frete: z.string().optional(),
      fornecedor: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }
      if (!input.fazendaId) {
        throw new Error("Informe a fazenda da movimentação.");
      }

      const userId = ctx.user.id;
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "";
      if (!userId || !registradoPor) {
        throw new Error("Usuário autenticado inválido para registrar movimentação.");
      }

      const localInput = {
        ...input,
        userId,
        registradoPor,
        status: "ativa" as const,
      };

      try {
        const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!item) {
          const result = devLocalStore.createMovimentacao(localInput);
          return { success: true, id: result.id, grupoId: input.grupoId ?? null, localFallback: true };
        }

        const atual = Number(item.quantidade ?? 0);
        const novo = atual + qty;
        if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");

        let observacoes = input.observacoes;
        if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
          observacoes = JSON.stringify({
            modo: input.modo,
            sinal: input.sinal,
            unidades: input.quantidadeUnidades,
            porUnidade: input.quantidadePorUnidade,
            unidade: input.unidadeLancamento,
            total: qty,
          });
        }

        const result = await db.insert(estoqueMovimentacoes).values({
          grupoId: input.grupoId || undefined,
          estoqueId: input.estoqueId,
          fazendaId: input.fazendaId ?? item.fazendaId ?? undefined,
          userId,
          registradoPor,
          tipo: input.tipo || undefined,
          dataMovimentacao: input.dataMovimentacao,
          quantidade: String(qty),
          dataValidade: input.dataValidade || undefined,
          destino: input.destino || undefined,
          manejo: input.manejo || undefined,
          notaFiscal: input.notaFiscal || undefined,
          frete: input.frete || undefined,
          fornecedor: input.fornecedor || undefined,
          valor: input.valor || undefined,
          observacoes,
          status: "ativa",
        });

        // Entrada com valor → custo médio ponderado. Saída → só saldo.
        const patch: { quantidade: string; valorUnitario?: string } = { quantidade: String(novo) };
        if (qty > 0) {
          const valorTotalEntrada = parseFloat(String(input.valor ?? "").replace(",", "."));
          if (Number.isFinite(valorTotalEntrada) && valorTotalEntrada > 0) {
            const medio = calcularCustoMedioPonderado({
              quantidadeAnterior: atual,
              custoMedioAnterior: parseCustoMedio(item.valorUnitario),
              quantidadeEntrada: qty,
              valorTotalEntrada,
            });
            if (medio != null) patch.valorUnitario = formatCustoMedio(medio);
          }
        }
        await db.update(estoque).set(patch).where(eq(estoque.id, input.estoqueId));

        return {
          success: true,
          id: (result as any)[0]?.insertId,
          grupoId: input.grupoId ?? null,
        };
      } catch (error) {
        if (error instanceof Error && /estoque insuficiente|quantidade válida|usuário autenticado/i.test(error.message)) {
          throw error;
        }
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.createMovimentacao(localInput);
        return { success: true, id: result.id, grupoId: input.grupoId ?? null, localFallback: true };
      }
    }),

  updateMovimentacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      estoqueId: z.number(),
      fazendaId: z.number().optional(),
      tipo: z.string().optional(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      destino: z.string().optional(),
      manejo: z.string().optional(),
      notaFiscal: z.string().optional(),
      frete: z.string().optional(),
      fornecedor: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }

      const updatedByNome = ctx.user.name?.trim() || ctx.user.email?.trim() || "";
      if (!ctx.user.id || !updatedByNome) {
        throw new Error("Usuário autenticado inválido para editar movimentação.");
      }

      try {
        const [mov] = await db
          .select()
          .from(estoqueMovimentacoes)
          .where(eq(estoqueMovimentacoes.id, input.id));
        if (!mov) {
          // Pode existir só no store local (mesmo padrão de listMovimentacoes).
          return devLocalStore.updateMovimentacao({
            ...input,
            updatedByUserId: ctx.user.id,
            updatedByNome,
          });
        }

        const status = mov.status || "ativa";
        if (status === "estornada" || status === "estorno") {
          throw new Error("Movimentação estornada não pode ser editada.");
        }
        if (mov.abastecimentoId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_MOV_VINCULADA_EDITAR,
          });
        }

        const oldQty = Number(mov.quantidade);
        const oldEstoqueId = mov.estoqueId;

        if (oldEstoqueId === input.estoqueId) {
          const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
          if (!item) throw new Error("Produto não encontrado.");
          const base = Number(item.quantidade ?? 0) - oldQty;
          const novo = base + qty;
          if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
          await db.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, input.estoqueId));
        } else {
          const [oldItem] = await db.select().from(estoque).where(eq(estoque.id, oldEstoqueId));
          const [newItem] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
          if (!oldItem || !newItem) throw new Error("Produto não encontrado.");
          const oldStock = Number(oldItem.quantidade ?? 0) - oldQty;
          const newStock = Number(newItem.quantidade ?? 0) + qty;
          if (newStock < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
          await db.update(estoque).set({ quantidade: String(oldStock) }).where(eq(estoque.id, oldEstoqueId));
          await db.update(estoque).set({ quantidade: String(newStock) }).where(eq(estoque.id, input.estoqueId));
        }

        let observacoes = input.observacoes;
        if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
          observacoes = JSON.stringify({
            modo: input.modo,
            sinal: input.sinal,
            unidades: input.quantidadeUnidades,
            porUnidade: input.quantidadePorUnidade,
            unidade: input.unidadeLancamento,
            total: qty,
          });
        }

        await db.update(estoqueMovimentacoes).set({
          estoqueId: input.estoqueId,
          fazendaId: input.fazendaId ?? null,
          tipo: input.tipo || null,
          dataMovimentacao: input.dataMovimentacao.slice(0, 10),
          quantidade: String(qty),
          dataValidade: input.dataValidade ? input.dataValidade.slice(0, 10) : null,
          destino: input.destino || null,
          manejo: input.manejo || null,
          notaFiscal: input.notaFiscal || null,
          frete: input.frete || null,
          fornecedor: input.fornecedor || null,
          valor: input.valor || null,
          observacoes: observacoes ?? null,
          updatedAt: new Date(),
          updatedByUserId: ctx.user.id,
          updatedByNome,
        }).where(eq(estoqueMovimentacoes.id, input.id));

        return { success: true };
      } catch (error) {
        if (
          error instanceof Error &&
          /insuficiente|quantidade válida|estornada|usuário autenticado|produto não encontrado/i.test(error.message)
        ) {
          throw error;
        }
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.updateMovimentacao({
          ...input,
          updatedByUserId: ctx.user.id,
          updatedByNome,
        });
      }
    }),

  validarEstorno: protectedProcedure
    .input(z.object({ itemIds: z.array(z.number()).min(1) }))
    .query(async ({ input }) => {
      try {
        const seeds = await db
          .select({
            id: estoqueMovimentacoes.id,
            grupoId: estoqueMovimentacoes.grupoId,
            estoqueId: estoqueMovimentacoes.estoqueId,
            quantidade: estoqueMovimentacoes.quantidade,
            status: estoqueMovimentacoes.status,
            nome: estoque.nome,
            unidade: estoque.unidade,
            saldo: estoque.quantidade,
          })
          .from(estoqueMovimentacoes)
          .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
          .where(inArray(estoqueMovimentacoes.id, input.itemIds));

        if (!seeds.length) {
          const local = devLocalStore.validarEstorno(input.itemIds);
          return local;
        }

        const grupoId = seeds[0]!.grupoId?.trim() || null;
        const originais = grupoId
          ? await db
              .select({
                id: estoqueMovimentacoes.id,
                estoqueId: estoqueMovimentacoes.estoqueId,
                quantidade: estoqueMovimentacoes.quantidade,
                status: estoqueMovimentacoes.status,
                nome: estoque.nome,
                unidade: estoque.unidade,
                saldo: estoque.quantidade,
              })
              .from(estoqueMovimentacoes)
              .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
              .where(eq(estoqueMovimentacoes.grupoId, grupoId))
          : seeds;

        for (const mov of originais) {
          const st = mov.status || "ativa";
          if (st === "estornada") {
            return {
              podeEstornar: false,
              jaEstornada: true,
              insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
              mensagem: "Esta movimentação já foi estornada.",
            };
          }
          if (st === "estorno") {
            return {
              podeEstornar: false,
              jaEstornada: true,
              insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
              mensagem: "Não é possível estornar um lançamento de estorno.",
            };
          }
        }

        const saldos = new Map(
          originais.map(o => [
            o.estoqueId,
            {
              quantidade: Number(o.saldo ?? 0),
              nome: o.nome ?? `Produto #${o.estoqueId}`,
              unidade: o.unidade,
            },
          ]),
        );
        const insuficientes = avaliarEstornoEstoque(
          originais.map(o => ({
            estoqueId: o.estoqueId,
            quantidade: o.quantidade,
            nome: o.nome,
            unidade: o.unidade,
          })),
          saldos,
        );

        return {
          podeEstornar: insuficientes.length === 0,
          jaEstornada: false,
          insuficientes,
          mensagem:
            insuficientes.length > 0
              ? "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão."
              : null,
        };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.validarEstorno(input.itemIds);
      }
    }),

  estornarMovimentacao: protectedProcedure
    .input(z.object({
      itemIds: z.array(z.number()).min(1),
      motivo: z.string().min(1, "Informe o motivo do estorno.").max(255),
      observacao: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "";
      if (!ctx.user.id || !registradoPor) {
        throw new Error("Usuário autenticado inválido para registrar o estorno.");
      }
      const motivo = montarMotivoEstorno(input.motivo, input.observacao);
      if (!motivo) throw new Error("Informe o motivo do estorno.");

      const localPayload = {
        itemIds: input.itemIds,
        motivo,
        userId: ctx.user.id,
        registradoPor,
      };

      try {
        const seeds = await db
          .select()
          .from(estoqueMovimentacoes)
          .where(inArray(estoqueMovimentacoes.id, input.itemIds));
        if (!seeds.length) {
          // Itens podem existir só no store local (dev / fallback).
          return devLocalStore.estornarMovimentacaoGrupo(localPayload);
        }

        if (seeds.some(s => s.abastecimentoId != null)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_MOV_VINCULADA_EXCLUIR,
          });
        }

        const grupoId = seeds[0]!.grupoId?.trim() || null;
        const originais = grupoId
          ? await db.select().from(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.grupoId, grupoId))
          : seeds;

        for (const mov of originais) {
          const st = mov.status || "ativa";
          if (st === "estornada") throw new Error("Esta movimentação já foi estornada.");
          if (st === "estorno") throw new Error("Não é possível estornar um lançamento de estorno.");
        }

        const estoqueIds = [...new Set(originais.map(m => m.estoqueId))];
        const produtos = await db.select().from(estoque).where(inArray(estoque.id, estoqueIds));
        const saldos = new Map(
          produtos.map(p => [
            p.id,
            {
              quantidade: Number(p.quantidade ?? 0),
              nome: p.nome ?? `Produto #${p.id}`,
              unidade: p.unidade,
            },
          ]),
        );
        const nomePorId = new Map(produtos.map(p => [p.id, p.nome]));
        const insuficientes = avaliarEstornoEstoque(
          originais.map(o => ({
            estoqueId: o.estoqueId,
            quantidade: o.quantidade,
            nome: nomePorId.get(o.estoqueId),
          })),
          saldos,
        );
        if (insuficientes.length > 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão.",
            cause: { insuficientes },
          });
        }

        let originalGrupoId = grupoId;
        if (!originalGrupoId) {
          originalGrupoId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        }

        const estornoGrupoId = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const hoje = new Date().toISOString().slice(0, 10);
        const idsCriados: number[] = [];

        await db.transaction(async tx => {
          if (!grupoId) {
            for (const mov of originais) {
              await tx.update(estoqueMovimentacoes)
                .set({ grupoId: originalGrupoId })
                .where(eq(estoqueMovimentacoes.id, mov.id));
              mov.grupoId = originalGrupoId;
            }
          }

          for (const mov of originais) {
            const qty = Number(mov.quantidade);
            const qtyInversa = -qty;
            const [item] = await tx.select().from(estoque).where(eq(estoque.id, mov.estoqueId));
            if (!item) throw new Error("Produto não encontrado.");
            const atual = Number(item.quantidade ?? 0);
            const novo = atual + qtyInversa;
            if (novo < 0) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "Não é possível estornar esta movimentação porque o estoque atual de um ou mais produtos é insuficiente para realizar a reversão.",
              });
            }
            await tx.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, mov.estoqueId));

            const insertResult = await tx.insert(estoqueMovimentacoes).values({
              grupoId: estornoGrupoId,
              estoqueId: mov.estoqueId,
              fazendaId: mov.fazendaId ?? undefined,
              userId: ctx.user.id,
              registradoPor,
              tipo: mov.tipo || undefined,
              dataMovimentacao: hoje,
              quantidade: String(qtyInversa),
              dataValidade: mov.dataValidade || undefined,
              destino: mov.destino || undefined,
              manejo: mov.manejo || undefined,
              notaFiscal: mov.notaFiscal || undefined,
              frete: mov.frete != null ? String(mov.frete) : undefined,
              fornecedor: mov.fornecedor || undefined,
              valor: mov.valor != null ? String(mov.valor) : undefined,
              observacoes: mov.observacoes || undefined,
              status: "estorno",
              originalGrupoId,
              motivoEstorno: motivo,
            });
            idsCriados.push((insertResult as any)[0]?.insertId);

            await tx.update(estoqueMovimentacoes).set({
              status: "estornada",
              motivoEstorno: motivo,
              updatedAt: new Date(),
              updatedByUserId: ctx.user.id,
              updatedByNome: registradoPor,
            }).where(eq(estoqueMovimentacoes.id, mov.id));
          }
        });

        return {
          success: true,
          originalGrupoId,
          estornoGrupoId,
          ids: idsCriados,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        // Não usar /estorno/ solto: mensagens SQL com coluna motivo_estorno batem no regex.
        if (isEstornoBusinessError(error)) throw error;
        if (!isDatabaseUnavailable(error)) {
          throw new Error(
            "Não foi possível concluir o estorno. Nenhuma alteração foi realizada no estoque. Tente novamente.",
          );
        }
        return devLocalStore.estornarMovimentacaoGrupo(localPayload);
      }
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      try {
        const [mov] = await db
          .select()
          .from(estoqueMovimentacoes)
          .where(eq(estoqueMovimentacoes.id, input.id));
        if (!mov) {
          return devLocalStore.deleteMovimentacao(input.id);
        }

        const status = mov.status || "ativa";
        if (status === "estornada" || status === "estorno") {
          throw new Error("Movimentação estornada não pode ser excluída. Use o histórico para consulta.");
        }
        if (mov.abastecimentoId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_MOV_VINCULADA_EXCLUIR,
          });
        }

        const [item] = await db.select().from(estoque).where(eq(estoque.id, mov.estoqueId));
        if (item) {
          const atual = Number(item.quantidade ?? 0);
          const qtyMov = Number(mov.quantidade);
          const revertido = atual - qtyMov;
          // Entrada (qtd > 0): remover o item exige retirar do estoque — não permite negativo.
          if (qtyMov > 0 && revertido < 0) {
            throw new Error(
              `Não é possível remover este item: o estoque atual de "${item.nome ?? "produto"}" é insuficiente para reverter a entrada (necessário ${qtyMov}, saldo ${atual}). Estorne a movimentação ou ajuste o estoque antes.`,
            );
          }
          await db.update(estoque).set({ quantidade: String(revertido) }).where(eq(estoque.id, mov.estoqueId));
        }

        await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.id, input.id));
        return { success: true };
      } catch (error) {
        if (
          error instanceof Error &&
          /não encontrada|estornada|insuficiente|não é possível remover/i.test(error.message)
        ) {
          throw error;
        }
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.deleteMovimentacao(input.id);
      }
    }),

  listMovimentacoesByProduto: protectedProcedure
    .input(z.object({ estoqueId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: estoqueMovimentacoes.id,
          estoqueId: estoqueMovimentacoes.estoqueId,
          tipo: estoqueMovimentacoes.tipo,
          dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
          quantidade: estoqueMovimentacoes.quantidade,
          dataValidade: estoqueMovimentacoes.dataValidade,
          manejo: estoqueMovimentacoes.manejo,
          observacoes: estoqueMovimentacoes.observacoes,
          nome: estoque.nome,
          categoria: estoque.categoria,
          unidade: estoque.unidade,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
        .where(eq(estoqueMovimentacoes.estoqueId, input.estoqueId))
        .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
      return rows;
    }),

  deleteAllMovimentacoesByProduto: protectedProcedure
    .input(z.object({ estoqueId: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .delete(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.estoqueId, input.estoqueId));
      await db
        .update(estoque)
        .set({ quantidade: "0" })
        .where(eq(estoque.id, input.estoqueId));
      return { success: true };
    }),

  listByCategories: protectedProcedure
    .input(z.object({ categorias: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      const sortByNome = <T extends { nome?: string | null }>(rows: T[]) =>
        [...rows].sort((a, b) =>
          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"),
        );

      try {
        const rows = await db
          .select({
            id: estoque.id,
            produtoId: estoque.produtoId,
            fazendaId: estoque.fazendaId,
            nome: estoque.nome,
            categoria: estoque.categoria,
            subcategoria: estoque.subcategoria,
            unidade: estoque.unidade,
            quantidade: estoque.quantidade,
            valorUnitario: estoque.valorUnitario,
            fabricante: estoque.fabricante,
            situacao: estoque.situacao,
            identificadorUnico: estoque.identificadorUnico,
            observacoes: estoque.observacoes,
            createdAt: estoque.createdAt,
            updatedAt: estoque.updatedAt,
          })
          .from(estoque)
          .where(inArray(estoque.categoria, input.categorias))
          .orderBy(estoque.nome);
        const localRows = devLocalStore.listByCategories(input.categorias);
        if (localRows.length === 0) return rows;
        return sortByNome(mergeEstoqueListPreferLocal(rows, localRows));
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return sortByNome(devLocalStore.listByCategories(input.categorias));
      }
    }),
});

// ─── FINANCEIRO ROUTER ────────────────────────────────────────────────────────
const financeiroRouter = router({
  listContas: protectedProcedure.query(async () => {
    return db.select().from(contasFinanceiras).orderBy(desc(contasFinanceiras.createdAt));
  }),

  createConta: protectedProcedure
    .input(z.object({
      nome: z.string(),
      tipo: z.string().optional(),
      banco: z.string().optional(),
      saldoInicial: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.insert(contasFinanceiras).values({
        nome: input.nome,
        tipo: input.tipo,
        banco: input.banco,
        saldoInicial: input.saldoInicial || "0",
        saldoAtual: input.saldoInicial || "0",
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  listMovimentacoes: protectedProcedure.query(async () => {
    return db.select().from(movimentacoes).orderBy(desc(movimentacoes.createdAt));
  }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      contaId: z.number().optional(),
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string(),
      valor: z.string(),
      data: z.string(),
      status: z.enum(["pendente", "confirmado", "cancelado"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(movimentacoes).values({
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(movimentacoes).where(eq(movimentacoes.id, input.id));
      return { success: true };
    }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));
    const totalReceitas = parseFloat(receitas?.total || "0");
    const totalDespesas = parseFloat(despesas?.total || "0");
    return {
      totalReceitas,
      totalDespesas,
      saldoTotal: totalReceitas - totalDespesas,
    };
  }),
});

// ─── DASHBOARD ROUTER ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalAnimaisResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(animais).where(eq(animais.userId, ctx.user.id));
    const [totalLotesResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(lotes).where(eq(lotes.userId, ctx.user.id));
    const [totalMaquinasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(maquinas).where(eq(maquinas.userId, ctx.user.id));
    const [totalBenfeitoriasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id));

    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));

    return {
      totalAnimais: Number(totalAnimaisResult?.count || 0),
      totalLotes: Number(totalLotesResult?.count || 0),
      totalMaquinas: Number(totalMaquinasResult?.count || 0),
      totalBenfeitorias: Number(totalBenfeitoriasResult?.count || 0),
      totalReceitas: parseFloat(receitas?.total || "0"),
      totalDespesas: parseFloat(despesas?.total || "0"),
      saldoTotal: parseFloat(receitas?.total || "0") - parseFloat(despesas?.total || "0"),
    };
  }),
});

// ─── COMPRAS ROUTER ─────────────────────────────────────────────────────────
const comprasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(compras).where(eq(compras.userId, ctx.user.id)).orderBy(desc(compras.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      fornecedor: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(compras).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(compras).where(and(eq(compras.id, input.id), eq(compras.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── VENDAS ROUTER ───────────────────────────────────────────────────────────
const vendasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(vendas).where(eq(vendas.userId, ctx.user.id)).orderBy(desc(vendas.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      comprador: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(vendas).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(vendas).where(and(eq(vendas.id, input.id), eq(vendas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── FAZENDAS ROUTER ────────────────────────────────────────────────────────
const fazendaFields = {
  sigla: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  unidadeArea: z.string().optional(),
  area: z.string().optional(),
  areaReserva: z.string().optional(),
  areaLiquida: z.string().optional(),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  telefone: z.string().optional(),
  responsavel: z.string().optional(),
  atividadePrincipal: z.string().optional(),
  atividadeCria: z.boolean().optional(),
  atividadeRecria: z.boolean().optional(),
  atividadeEngorda: z.boolean().optional(),
  atividadeConfinamento: z.boolean().optional(),
  atividadeLeite: z.boolean().optional(),
  atividadeAgricultura: z.boolean().optional(),
  atividadeOutros: z.boolean().optional(),
  quantidadeAnimais: z.number().int().nonnegative().optional(),
  cpfCnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  registroIncra: z.string().optional(),
  nirf: z.string().optional(),
  numeroCar: z.string().optional(),
  matriculaImovel: z.string().optional(),
  matriculasImovel: z.string().optional(),
  tipoPosse: z.string().optional(),
  possuiSisbov: z.boolean().optional(),
  razaoSocial: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  distanciaMunicipio: z.string().optional(),
  valorHectare: z.string().optional(),
  fonteEnergia: z.string().optional(),
  fonteAgua: z.string().optional(),
  responsavelOperacionalNome: z.string().optional(),
  responsavelOperacionalTelefone: z.string().optional(),
  responsavelOperacionalFuncao: z.string().optional(),
  melhoramentoGenetico: z.string().optional(),
  observacoes: z.string().optional(),
};

function preferValue<T>(primary: T | null | undefined, fallback: T | null | undefined) {
  return primary !== undefined && primary !== null && primary !== "" ? primary : fallback;
}

function mergeFazendaData<T extends Record<string, any>>(row: T, localRow?: Record<string, any> | null): T {
  if (!localRow) return row;
  return {
    ...localRow,
    ...row,
    estado: preferValue(row.estado, localRow.estado) ?? "",
    cidade: preferValue(row.cidade, localRow.cidade) ?? "",
    atividadePrincipal: preferValue(row.atividadePrincipal, localRow.atividadePrincipal) ?? "",
    endereco: preferValue(row.endereco, localRow.endereco) ?? "",
    valorHectare: preferValue(row.valorHectare, localRow.valorHectare) ?? "",
    responsavel: preferValue(row.responsavel, localRow.responsavel) ?? "",
    sigla: preferValue(row.sigla, localRow.sigla) ?? "",
  };
}

const fazendasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await db.select().from(fazendas).where(eq(fazendas.userId, ctx.user.id)).orderBy(desc(fazendas.createdAt));
      const localRows = await listLocalFazendas(ctx.user.id);
      const localMap = new Map(localRows.map(row => [row.id, row]));
      const dbIds = new Set(rows.map(row => row.id));
      const mergedDb = rows.map(row => mergeFazendaData(row, localMap.get(row.id)));
      const localOnly = localRows.filter(row => !dbIds.has(row.id));
      return [...mergedDb, ...localOnly];
    } catch (error) {
      if (isDatabaseUnavailable(error)) return listLocalFazendas(ctx.user.id);
      throw error;
    }
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const localRow = await getLocalFazenda(ctx.user.id, input.id);
        const [row] = await db.select().from(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
        if (!row) return localRow;
        return mergeFazendaData(row, localRow);
      } catch (error) {
        if (isDatabaseUnavailable(error)) return getLocalFazenda(ctx.user.id, input.id);
        throw error;
      }
    }),

  create: protectedProcedure
    .input(z.object({ nome: z.string(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await db.insert(fazendas).values({ userId: ctx.user.id, ...input });
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await updateLocalFazenda(ctx.user.id, id, input);
          } catch (mirrorError) {
            console.warn("[fazendas.create] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          const result = await createLocalFazenda(ctx.user.id, input);
          return { success: true, id: result.id, localFallback: true };
        }
        throw error;
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().optional(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      try {
        await db.update(fazendas).set(rest).where(and(eq(fazendas.id, id), eq(fazendas.userId, ctx.user.id)));
        try {
          await updateLocalFazenda(ctx.user.id, id, rest);
        } catch (mirrorError) {
          console.warn("[fazendas.update] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await updateLocalFazenda(ctx.user.id, id, rest);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  deleteCheck: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        return await getFazendaDeleteCheck(ctx.user.id, input.id);
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return getFazendaDeleteCheck(ctx.user.id, input.id, true);
        }
        throw error;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await assertFazendaCanDelete(ctx.user.id, input.id);
        await db.delete(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await assertFazendaCanDelete(ctx.user.id, input.id, true);
          await deleteLocalFazenda(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),
});

// ─── PASTOS ROUTER ──────────────────────────────────────────────────────────
const pastosRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const rows = await db.select().from(pastos).where(eq(pastos.userId, ctx.user.id)).orderBy(desc(pastos.createdAt));
      const localRows = await listLocalPastos(ctx.user.id);
      const dbIds = new Set(rows.map(row => row.id));
      const localOnly = localRows.filter(row => !dbIds.has(row.id));
      return [...rows, ...localOnly];
    } catch (error) {
      if (isDatabaseUnavailable(error)) return listLocalPastos(ctx.user.id);
      throw error;
    }
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const rows = await db.select().from(pastos).where(
          and(eq(pastos.fazendaId, input.fazendaId), eq(pastos.userId, ctx.user.id))
        ).orderBy(desc(pastos.createdAt));
        const localRows = await listLocalPastosByFazenda(ctx.user.id, input.fazendaId);
        const dbIds = new Set(rows.map(row => row.id));
        const localOnly = localRows.filter(row => !dbIds.has(row.id));
        return [...rows, ...localOnly];
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return listLocalPastosByFazenda(ctx.user.id, input.fazendaId);
        }
        throw error;
      }
    }),

  create: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      nome: z.string(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio", "reforma", "interditado", "reserva", "sem_uso"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const result = await db.insert(pastos).values({ userId: ctx.user.id, ...input });
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await updateLocalPasto(ctx.user.id, id, { ...input, userId: ctx.user.id });
          } catch (mirrorError) {
            console.warn("[pastos.create] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          const result = await createLocalPasto(ctx.user.id, input);
          return { success: true, id: result.id, localFallback: true };
        }
        throw error;
      }
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio", "reforma", "interditado", "reserva", "sem_uso"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      try {
        await db.update(pastos).set(rest).where(and(eq(pastos.id, id), eq(pastos.userId, ctx.user.id)));
        try {
          await updateLocalPasto(ctx.user.id, id, rest);
        } catch (mirrorError) {
          console.warn("[pastos.update] Espelho local não gravado:", mirrorError);
        }
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await updateLocalPasto(ctx.user.id, id, rest);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.delete(pastos).where(and(eq(pastos.id, input.id), eq(pastos.userId, ctx.user.id)));
        try {
          await deleteLocalPasto(ctx.user.id, input.id);
        } catch (mirrorError) {
          console.warn("[pastos.delete] Espelho local não removido:", mirrorError);
        }
        return { success: true };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          await deleteLocalPasto(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw error;
      }
    }),

  importarCoordenadas: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      kmlContent: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await importarCoordenadasPastos(ctx.user.id, input);
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          return await importarCoordenadasPastosLocal(ctx.user.id, input);
        }
        throw error;
      }
    }),

  listWithDetails: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(pastos.userId, ctx.user.id)];
      if (input?.fazendaId) conditions.push(eq(pastos.fazendaId, input.fazendaId));

      const pastosList = await db.select().from(pastos).where(and(...conditions)).orderBy(desc(pastos.createdAt));
      const fazendaIds = [...new Set(pastosList.map(p => p.fazendaId))];
      const fazendaMap: Record<number, string> = {};
      if (fazendaIds.length) {
        const fazRows = await db.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas).where(inArray(fazendas.id, fazendaIds));
        fazRows.forEach(f => { fazendaMap[f.id] = f.nome; });
      }

      return Promise.all(pastosList.map(async (pasto) => {
        const lotesNoPasto = await db.select().from(lotes).where(
          and(eq(lotes.pastoAtualId, pasto.id), eq(lotes.userId, ctx.user.id))
        );
        const lotesEnriched = await Promise.all(lotesNoPasto.map(enrichLote));
        const qtdAnimais = lotesEnriched.reduce((s, l) => s + (l.qtdAnimais ?? 0), 0);
        const capacidade = pasto.capacidade ?? 0;
        const pctOcupacao = capacidade > 0 ? Math.min(100, Math.round((qtdAnimais / capacidade) * 100)) : null;

        const [ultimaSaida] = await db.select().from(lotePastoMovimentacoes).where(
          and(eq(lotePastoMovimentacoes.pastoOrigemId, pasto.id), eq(lotePastoMovimentacoes.userId, ctx.user.id))
        ).orderBy(desc(lotePastoMovimentacoes.dataSaida)).limit(1);

        const diasDescanso = !lotesNoPasto.length && ultimaSaida?.dataSaida
          ? diasEntre(ultimaSaida.dataSaida)
          : null;

        const diasPastejo = lotesEnriched.length
          ? Math.max(...lotesEnriched.map(l => l.diasNoPasto ?? 0))
          : null;

        return {
          ...pasto,
          fazendaNome: fazendaMap[pasto.fazendaId] ?? null,
          qtdAnimais,
          qtdLotes: lotesNoPasto.length,
          pctOcupacao,
          diasPastejo,
          diasDescanso,
          lotes: lotesEnriched,
        };
      }));
    }),
});

// ─── BRINCOS ROUTER ──────────────────────────────────────────────────────────
const brincosRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(async ({ ctx, input }) => {
      try {
        const dbRows = await db
          .select()
          .from(historicoBrincos)
          .where(
            and(
              eq(historicoBrincos.animalId, input.animalId),
              eq(historicoBrincos.userId, ctx.user.id)
            )
          )
          .orderBy(desc(historicoBrincos.createdAt));
        const localRows = await listLocalHistoricoBrincos(ctx.user.id, input.animalId);
        return mergeHistoricoBrincosLists(dbRows, localRows);
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          return listLocalHistoricoBrincos(ctx.user.id, input.animalId);
        }
        throw err;
      }
    }),

  registrar: protectedProcedure
    .input(
      z.object({
        animalId: z.number(),
        brincoAnterior: z.string().nullable().optional(),
        brincoNovo: z.string().min(1),
        motivo: z.enum(["perda", "danificado", "reidentificacao", "erro_cadastro", "outro"]),
        observacoes: z.string().nullable().optional(),
        dataAlteracao: z.string(), // YYYY-MM-DD
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = {
        userId: ctx.user.id,
        animalId: input.animalId,
        brincoAnterior: input.brincoAnterior ?? null,
        brincoNovo: input.brincoNovo,
        motivo: input.motivo,
        observacoes: input.observacoes ?? null,
        dataAlteracao: input.dataAlteracao,
        usuarioNome: ctx.user.name ?? null,
      };
      try {
        const result = await db.insert(historicoBrincos).values(row);
        const id = Number((result as any)[0]?.insertId ?? (result as any).insertId);
        if (Number.isFinite(id) && id > 0) {
          try {
            await createLocalHistoricoBrinco(ctx.user.id, { id, ...row });
          } catch (mirrorError) {
            console.warn("[brincos.registrar] Espelho local não gravado:", mirrorError);
          }
        }
        return { success: true, id };
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          const result = await createLocalHistoricoBrinco(ctx.user.id, row);
          return { success: true, id: result.id, localFallback: true };
        }
        console.error("[brincos.registrar]", err);
        throw err;
      }
    }),

  deletar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db
          .delete(historicoBrincos)
          .where(
            and(
              eq(historicoBrincos.id, input.id),
              eq(historicoBrincos.userId, ctx.user.id)
            )
          );
        return { success: true };
      } catch (err) {
        if (isDatabaseUnavailable(err)) {
          await deleteLocalHistoricoBrinco(ctx.user.id, input.id);
          return { success: true, localFallback: true };
        }
        throw err;
      }
    }),
});

// ─── PESSOAS (fornecedores, clientes, funcionários) ───────────────────────────
const pessoaTipoSchema = z.enum(["fornecedor", "cliente", "funcionario"]);

const pessoaFieldsSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  tipo: pessoaTipoSchema,
  funcao: z.string().optional(),
  documento: z.string().optional(),
  endereco: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  observacoes: z.string().optional(),
});

const pessoasRouter = router({
  list: protectedProcedure
    .input(z.object({ tipo: pessoaTipoSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      try {
        const conditions = [eq(pessoas.userId, ctx.user.id), eq(pessoas.ativo, true)];
        if (input?.tipo) conditions.push(eq(pessoas.tipo, input.tipo));
        return await db
          .select()
          .from(pessoas)
          .where(and(...conditions))
          .orderBy(pessoas.nome);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.listPessoas(ctx.user.id, input?.tipo);
      }
    }),

  create: protectedProcedure
    .input(pessoaFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const documento = input.documento?.trim();
      if (!documento) throw new Error("Informe o CPF/CNPJ.");

      try {
        const result = await db.insert(pessoas).values({
          userId: ctx.user.id,
          nome: input.nome.trim(),
          tipo: input.tipo,
          funcao: input.funcao?.trim() || null,
          documento,
          endereco: input.endereco?.trim() || null,
          telefone: input.telefone?.trim() || null,
          email: input.email?.trim() || null,
          observacoes: input.observacoes?.trim() || null,
          ativo: true,
        });
        const id = Number((result as [{ insertId?: number }])[0]?.insertId ?? 0);
        return { success: true, id };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        const row = devLocalStore.createPessoa(ctx.user.id, {
          nome: input.nome,
          tipo: input.tipo,
          funcao: input.funcao ?? null,
          documento,
          endereco: input.endereco ?? null,
          telefone: input.telefone ?? null,
          email: input.email ?? null,
          observacoes: input.observacoes ?? null,
        });
        return { success: true, id: row.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(pessoaFieldsSchema.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      try {
        const patch: Record<string, unknown> = {};
        if (rest.nome !== undefined) patch.nome = rest.nome.trim();
        if (rest.tipo !== undefined) patch.tipo = rest.tipo;
        if (rest.funcao !== undefined) patch.funcao = rest.funcao?.trim() || null;
        if (rest.documento !== undefined) {
          const documento = rest.documento.trim();
          if (!documento) throw new Error("Informe o CPF/CNPJ.");
          patch.documento = documento;
        }
        if (rest.endereco !== undefined) patch.endereco = rest.endereco?.trim() || null;
        if (rest.telefone !== undefined) patch.telefone = rest.telefone?.trim() || null;
        if (rest.email !== undefined) patch.email = rest.email?.trim() || null;
        if (rest.observacoes !== undefined) patch.observacoes = rest.observacoes?.trim() || null;

        await db
          .update(pessoas)
          .set(patch)
          .where(and(eq(pessoas.id, id), eq(pessoas.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (error instanceof Error && /CPF\/CNPJ|Informe o nome/i.test(error.message)) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        devLocalStore.updatePessoa(ctx.user.id, id, {
          nome: rest.nome,
          tipo: rest.tipo,
          funcao: rest.funcao,
          documento: rest.documento,
          endereco: rest.endereco,
          telefone: rest.telefone,
          email: rest.email,
          observacoes: rest.observacoes,
        });
        return { success: true, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db
          .update(pessoas)
          .set({ ativo: false })
          .where(and(eq(pessoas.id, input.id), eq(pessoas.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return { ...devLocalStore.deletePessoa(ctx.user.id, input.id), localFallback: true };
      }
    }),
});

// ─── MANEJO ROUTER ───────────────────────────────────────────────────────────
const motivoTrocaBrincoSchema = z.enum([
  "perda",
  "danificado",
  "reidentificacao",
  "erro_cadastro",
  "outro",
]);

const operacaoBrincoSchema = z.enum(["rfid", "brinco", "ambos"]);

const manejoRouter = router({
  /**
   * Registro pontual de Brinco Eletrônico.
   * Responsável = usuário autenticado. Atualiza animal + histórico na mesma operação.
   */
  registrarPontualBrinco: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        loteId: z.number().int().positive().nullable().optional(),
        animalId: z.number().int().positive(),
        operacao: operacaoBrincoSchema,
        novoRfid: z.string().max(80).optional(),
        novoBrinco: z.string().max(50).optional(),
        motivo: motivoTrocaBrincoSchema.optional(),
        observacoes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertFazendaDoUsuario(ctx.user.id, input.fazendaId);
      await assertLoteNaFazenda(ctx.user.id, input.fazendaId, input.loteId ?? null);
      const animal = await assertAnimalNaFazenda(ctx.user.id, input.animalId, input.fazendaId);

      const brincoAtual = (animal.brinco ?? "").trim() || null;
      const rfidAtual = (animal.brincoEletronico ?? "").trim() || null;
      const novoRfid = (input.novoRfid ?? "").trim() || null;
      const novoBrinco = (input.novoBrinco ?? "").trim() || null;
      const obsUser = (input.observacoes ?? "").trim() || null;
      const alteraRfid = input.operacao === "rfid" || input.operacao === "ambos";
      const alteraBrinco = input.operacao === "brinco" || input.operacao === "ambos";

      if (alteraRfid) {
        if (!novoRfid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o novo RFID." });
        }
        if (normalizeBrincoKey(novoRfid) === normalizeBrincoKey(rfidAtual)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O novo RFID é igual ao RFID atual. Não há alteração.",
          });
        }
      }
      if (alteraBrinco) {
        if (!novoBrinco) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o novo brinco." });
        }
        if (normalizeBrincoKey(novoBrinco) === normalizeBrincoKey(brincoAtual)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "O novo brinco é igual ao brinco atual. Não há alteração.",
          });
        }
      }

      const exigeMotivo =
        alteraBrinco || (alteraRfid && Boolean(rfidAtual));
      if (exigeMotivo && !input.motivo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o motivo da troca de identificação.",
        });
      }
      const motivo = input.motivo ?? "reidentificacao";

      const operacaoLabel =
        input.operacao === "rfid"
          ? "Vincular / atualizar RFID"
          : input.operacao === "brinco"
            ? "Troca de brinco visual"
            : "Atualizar ambos";

      const assertBrincoOuMensagemAmigavel = async (useLocal: boolean) => {
        if (!alteraBrinco || !novoBrinco) return;
        try {
          await assertBrincoUnicoEntreAtivos(
            ctx.user.id,
            novoBrinco,
            animal.status ?? "ativo",
            input.animalId,
            useLocal,
          );
        } catch (err) {
          if (
            err instanceof TRPCError &&
            err.message.toLowerCase().includes("já está sendo usado")
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Este brinco já está vinculado a outro animal.",
            });
          }
          throw err;
        }
      };

      const montarPartesObs = () => {
        const partesObs: string[] = [operacaoLabel];
        if (alteraRfid) {
          partesObs.push(`RFID: ${rfidAtual || "Não vinculado"} → ${novoRfid}`);
        }
        if (alteraBrinco) {
          partesObs.push(
            `Brinco visual: ${brincoAtual || "Não vinculado"} → ${novoBrinco}`,
          );
        }
        if (obsUser) partesObs.push(obsUser);
        return partesObs;
      };

      const montarHistoricoRow = () => {
        const partesObs = montarPartesObs();
        // brincoNovo é varchar(50): o detalhe do RFID fica nas observações
        let brincoNovoHist = alteraBrinco
          ? (novoBrinco as string)
          : brincoAtual || novoRfid || "—";
        if (!brincoNovoHist) brincoNovoHist = novoRfid || "—";

        return {
          userId: ctx.user.id,
          animalId: input.animalId,
          brincoAnterior: brincoAtual ? brincoAtual.slice(0, 50) : null,
          brincoNovo: brincoNovoHist.slice(0, 50),
          motivo,
          observacoes: partesObs.join(" · ") || null,
          dataAlteracao: input.data,
          usuarioNome: ctx.user.name?.trim() || null,
        };
      };

      const runLocal = async () => {
        await assertBrincoOuMensagemAmigavel(true);
        if (alteraRfid) {
          await assertRfidUnicoEntreAtivos(ctx.user.id, novoRfid, input.animalId, true);
        }

        const setData: Record<string, unknown> = {};
        if (alteraBrinco) setData.brinco = novoBrinco;
        if (alteraRfid) setData.brincoEletronico = novoRfid;

        const historicoRow = montarHistoricoRow();

        await updateLocalAnimal(ctx.user.id, input.animalId, setData);
        try {
          await createLocalHistoricoBrinco(ctx.user.id, historicoRow);
        } catch (histErr) {
          await updateLocalAnimal(ctx.user.id, input.animalId, {
            brinco: brincoAtual,
            brincoEletronico: rfidAtual,
          });
          throw histErr;
        }
        return { success: true as const, localFallback: true as const };
      };

      try {
        await assertBrincoOuMensagemAmigavel(false);
        if (alteraRfid) {
          await assertRfidUnicoEntreAtivos(ctx.user.id, novoRfid, input.animalId);
        }

        const setData: Record<string, unknown> = {};
        if (alteraBrinco) setData.brinco = novoBrinco;
        if (alteraRfid) setData.brincoEletronico = novoRfid;

        const historicoRow = montarHistoricoRow();

        await db.transaction(async tx => {
          await tx
            .update(animais)
            .set(setData)
            .where(and(eq(animais.id, input.animalId), eq(animais.userId, ctx.user.id)));
          await tx.insert(historicoBrincos).values(historicoRow);
        });

        try {
          await updateLocalAnimal(ctx.user.id, input.animalId, setData);
          await createLocalHistoricoBrinco(ctx.user.id, historicoRow);
        } catch (mirrorError) {
          console.warn("[manejo.registrarPontualBrinco] Espelho local:", mirrorError);
        }

        return {
          success: true as const,
          tipo: "brinco-eletronico" as const,
          animalId: input.animalId,
          responsavelId: ctx.user.id,
          responsavelNome: ctx.user.name?.trim() || null,
        };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          return runLocal();
        }
        throw err;
      }
    }),
});

// ─── APP ROUTER ───────────────────────────────────────────────────────────────
export const appRouter = router({
  auth: authRouter,
  animais: animaisRouter,
  lotes: lotesRouter,
  saude: saudeRouter,
  reproducao: reproducaoRouter,
  maquinas: maquinasRouter,
  abastecimentos: abastecimentosRouter,
  manutencoes: manutencoesRouter,
  pesagens: pesagensRouter,
  nutricao: nutricaoRouter,
  benfeitorias: benfeitoriasRouter,
  estoque: estoqueRouter,
  financeiro: financeiroRouter,
  dashboard: dashboardRouter,
  compras: comprasRouter,
  vendas: vendasRouter,
  fazendas: fazendasRouter,
    pastos: pastosRouter,
  rebanho: rebanhoOverviewRouter,
  brincos: brincosRouter,
  pessoas: pessoasRouter,
  manejo: manejoRouter,
});
export type AppRouter = typeof appRouter;
