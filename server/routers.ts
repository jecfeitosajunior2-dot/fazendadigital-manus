import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { db } from "./db";
import {
  users, animais, animalBaixas, lotes, saudeRegistros, reproducaoRegistros,
  maquinas, abastecimentos, manutencoes, manutencaoPecas, pesagens, batidas,
  benfeitorias, estoque, estoqueMovimentacoes, estoqueOperacoes,
  compras, compraGrupos, vendas, vendaItens, fazendas, pastos, lotePastoMovimentacoes, animalLoteMovimentacoes,
  historicoBrincos, produtosCatalogo, pessoas, usuarioFazendas, usuarioPermissoes,
} from "../drizzle/schema";
import { eq, desc, and, sql, isNull, isNotNull, inArray, gte, lte, or, like, ne } from "drizzle-orm";
import { createSession, clearAuthCookie, setAuthCookie } from "./_core/cookies";
import { env } from "./_core/env";
import { resolveImageSlots } from "./_core/storage";
import { formatImportDbError } from "./importacaoErrors";
import { toBenfeitoriaRow, toBenfeitoriaUpdateRow } from "./benfeitoriasDb";
import { rebanhoOverviewRouter } from "./routers/rebanhoOverview";
import { carregarPainelControle } from "./painelControle";
import { MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA } from "../shared/financeiroLegadoBloqueio";
import {
  extrairCoordenadasKml,
  mapaCoordenadasPorNome,
  normalizarNomeSubdivisao,
} from "../shared/parseKmlCoordenadas";
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
import { produtoControlaSaldo } from "../shared/estoqueControle";
import {
  capitalEstaInicializado,
  custoMedioFonteTecnica,
  EstoqueCapitalError,
  MSG_ESTOQUE_EDICAO_CAPITAL,
  MSG_ESTOQUE_EXCLUSAO_CAPITAL,
  MSG_ESTOQUE_VALOR_UNITARIO_DERIVADO,
  MSG_ESTOQUE_ZERAR_CAPITAL,
  MSG_MANUT_CAPITAL_REVERSAO,
} from "../shared/estoqueCapital";
import { resolverLeituraEstoqueList } from "../shared/estoqueListFonte";
import { criarMovimentacaoEstoqueNoTx } from "./estoqueMovimentacaoTx";
import { aplicarPatchSaldoNoTx, executorPatchDrizzle } from "./estoqueSaldoTx";
import { SaudeEstoqueError } from "./saudeEstoque";
import { recusarEstornoGenericoSeSanitario, listarVinculosSaudePorMovimentacaoIds } from "./saudeEstoqueMysql";
import {
  ConflitoSanidadeEstoque,
  erroEstornoSanidade,
  erroLancamentoSanidade,
  estornarSanidadeAutorizado,
  lancarSanidadeEEspelhar,
} from "./sanidadeEstoqueAutorizado";
import { ioSanidadeDrizzle } from "./sanidadeEstoqueDb";
import { deveBloquearEstornoGenericoSanitario, MSG_ESTORNO_GENERICO_SANITARIO } from "../shared/saudeEstoque";
import { ManutencaoEstoqueError } from "./manutencaoEstoque";
import { recusarEstornoGenericoSeManutencao, listarVinculosManutencaoPorMovimentacaoIds } from "./manutencaoEstoqueMysql";
import { estornarManutencaoCompletaMysql, persistirManutencaoCompletaMysql } from "./manutencaoCompletaMysql";
import { colunasManutencaoSemChaveOperacao } from "./manutencaoColunas";
import { editarPecasOficinaMysql } from "./manutencaoOficinaEdicaoMysql";
import { recusarExclusaoManutencao } from "../shared/manutencaoAcoes";
import {
  deveBloquearEstornoGenericoManutencao,
  MOTIVO_ESTORNO_MANUT_PADRAO,
  MSG_ESTORNO_GENERICO_MANUTENCAO,
  MSG_MANUT_ESTOQUE_AUSENTE_MYSQL,
  MSG_MANUT_ESTORNO_LEGADO,
  MSG_MANUT_MYSQL_OBRIGATORIO,
  pecaManutencaoTemVinculo,
} from "../shared/manutencaoEstoque";
import { resolverValorMaoObraManutencao } from "../shared/manutencaoTipoExecucao";
import {
  confirmarFazendaDoUsuario,
  decidirFazendaPersistenciaOs,
  identificarFazendaMaquina,
  lerPrestadorPessoaId,
  validarPrestadorPessoaParaOs,
} from "../shared/manutencaoIdentificacaoOperacional";
import {
  calcularCustosManutencaoCompletos,
  classificarPecasManutencao,
  MANUT_PECA_ORIGEM_ESTOQUE,
  MANUT_PECA_ORIGEM_OFICINA,
  MSG_MANUT_PECA_ESTOQUE_OBRIGATORIA,
  validarPecaOficina,
  validarPecasOficinaNaExecucao,
  type PecaOficinaNormalizada,
} from "../shared/manutencaoPecasOrigem";
import { anexarIdentificacaoAnimalSaude } from "../shared/saudeListaDisplay";
import { MSG_COMPRA_EDITAR_INTEGRADA, MSG_COMPRA_LINHA_ISOLADA } from "../shared/compraInsumos";
import { isOperacaoTransferenciaInsumos } from "../shared/estoqueTransferencia";
import { compraInsumosService } from "./compraInsumosMysql";
import { transferenciaInsumosService } from "./transferenciaInsumosMysql";
import { animalPertenceFazenda, buildLoteFazendaContext, loadLoteFazendaContextForUser } from "./animaisPorFazenda";
import {
  createLocalFazenda,
  createLocalBenfeitoria,
  createLocalMaquina,
  createLocalAbastecimento,
  createLocalManutencao,
  createLocalAnimal,
  deleteLocalFazenda,
  deleteLocalBenfeitoria,
  deleteLocalMaquina,
  deleteLocalAbastecimento,
  deleteLocalManutencao,
  registrarLocalAnimalBaixa,
  getLocalFazenda,
  getLocalBenfeitoria,
  getLocalMaquina,
  getLocalAbastecimento,
  getLocalManutencao,
  getLocalAnimal,
  isDatabaseUnavailable,
  listLocalFazendas,
  listLocalPastos,
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
  registrarLocalEntradaInicialLote,
  registrarLocalTransferenciaInterna,
  movimentarAnimaisLocalLote,
  espelharRetiradaAnimaisLocal,
  createLocalPesagem,
  deleteLocalPesagem,
  updateLocalPesagemObservacoes,
  listLocalSaudeRegistros,
  createLocalSaudeRegistro,
  deleteLocalSaudeRegistro,
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
import {
  alocarEEspelharAnimais,
  DeadlockMovimentacaoAnimais,
  erroAnimaisLote,
  incluirEEspelharAnimais,
  movimentarEEspelharAnimais,
  retirarEEspelharAnimais,
} from "./movimentarAnimaisLoteAutorizado";
import { ioAnimaisLoteDrizzle } from "./movimentarAnimaisLoteDb";
import { hojeISODateLocal } from "../shared/transferirAnimaisEntreLotes";
import {
  buildEntradaInicialLoteMovimentacao,
  loteIdEfetivoParaHistorico,
} from "../shared/animalLoteMovimentacaoEntrada";
import { buildAnimalInsertRow } from "./animalInsertRow";
import { cadastrarEEspelhar, erroCadastroAnimal } from "./cadastroAnimalAutorizado";
import { ioCadastroDrizzle } from "./cadastroAnimalDb";
import { cadastrarEEspelharLote, erroCadastroLote } from "./cadastroLoteAutorizado";
import { ioCadastroLoteDrizzle } from "./cadastroLoteDb";
import { editarEEspelharLote, erroEdicaoLote } from "./editarLoteAutorizado";
import { ioEditarLoteDrizzle } from "./editarLoteDb";
import { erroMovimentacaoLote, LoteMudouDuranteMovimentacao, movimentarEEspelharLote } from "./movimentarLotePastoAutorizado";
import { ioMovimentarLotePastoDrizzle } from "./movimentarLotePastoDb";
import { editarEEspelharAnimal, erroEdicaoAnimal } from "./editarAnimalAutorizado";
import { ioEditarAnimalDrizzle } from "./editarAnimalDb";
import {
  ConflitoManejoAnimal,
  castrarEEspelharAnimal,
  erroCastracao,
  erroReproducaoSimples,
  registrarReproducaoSimplesEEspelhar,
} from "./registrarManejoAutorizado";
import { ioManejoDrizzle } from "./registrarManejoDb";
import { ConflitoInseminacaoSemen, erroInseminacaoSemen, lancarInseminacaoSemenEEspelhar } from "./inseminacaoSemenAutorizado";
import { ioInseminacaoSemenDrizzle } from "./inseminacaoSemenDb";
import { assertAlteracaoSexoAnimal } from "./assertAlteracaoSexoAnimal";
import {
  ConflitoPesagemAnimal,
  desmamarEEspelharAnimal,
  erroDesmama,
  erroPesagem,
  pesarEEspelharAnimal,
} from "./pesarAnimalAutorizado";
import { ioPesagemDrizzle } from "./pesarAnimalDb";
import {
  assertManejoPermitidoNaData,
  getBaixaAnimal,
} from "./animalBaixa";
import {
  baixarEEspelharAnimal,
  ConflitoBaixaAnimal,
  erroBaixaAnimal,
} from "./baixarAnimalAutorizado";
import { recusarExclusaoFisicaAnimal } from "./exclusaoFisicaAnimal";
import { ioBaixaDrizzle } from "./baixarAnimalDb";
import {
  erroTransferenciaFazenda,
  transferirEEspelharAnimalFazenda,
} from "./transferirAnimalFazendaAutorizado";
import {
  confirmarVendaComercialSePermitida,
  confirmarVendaIntegradaSeAtiva,
  estadoConfirmacaoVenda,
  integracaoConfirmacaoVendaAtiva,
} from "./vendaConfirmacaoIntegrada";
import { cancelarVendaAutorizada, confirmarVendaAutorizada } from "./vendaOperacaoAutorizado";
import { ioVendaOperacaoDrizzle } from "./vendaOperacaoAutorizadoDb";
import {
  editarReproducaoAutorizada,
  erroEditarReproducao,
  excluirReproducaoAutorizada,
} from "./editarReproducaoAutorizado";
import { ioEditarReproducaoDrizzle } from "./editarReproducaoAutorizadoDb";
import { confirmarCompraNaoIdentificados } from "./confirmarCompra";
import { getCompraDetalhe } from "./compraDetalhe";
import { cancelarCompraComercial } from "./cancelarCompra";
import { excluirCompraLegada } from "./excluirCompra";
import { listarComprasDoUsuario } from "./comprasListagem";
import { comprasListInputSchema } from "./comprasListFiltro";
import { createCancelarVendaFinanceiroService, vendaTemRecebimentoEfetivo } from "./cancelarVendaFinanceiro";
import { createCancelarVendaFinanceiroMysqlStore } from "./cancelarVendaFinanceiroMysql";
import { financeiroNucleoMysqlStore } from "./financeiroNucleo";
import { createConfirmarVendaFinanceiroMysqlStore } from "./confirmarVendaFinanceiroMysql";
import { statusWhereVendasList, vendasListInputSchema } from "./vendasListFiltro";
import { deveRestringirPessoasListAosAtivos } from "./pessoasListFiltro";
import { MSG_PESSOA_REATIVAR_NAO_ENCONTRADA, reativarPessoa } from "./reativarPessoa";
import { normalizeUfBrasil } from "../shared/ufsBrasil";
import {
  MSG_COMPRADOR_DOC_INVALIDO,
  avaliarDocumentoClienteCreate,
  avaliarDocumentoClienteUpdate,
} from "../shared/pessoaDocumentoCliente";
import { vendaDocumentosService } from "./vendaDocumentosDb";
import { compraDocumentosService } from "./compraDocumentosDb";
import { receberAnimalCompra } from "./receberAnimalCompraDb";
import { erroEstornoRecebimento, recusarEstornoRecebimentoAutorizado } from "./estornoRecebimentoBloqueado";
import { ioEstornoRecebimentoDrizzle } from "./estornoRecebimentoBloqueadoDb";
import { listarRecebimentosCompra } from "./listarRecebimentosCompra";
import { MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA } from "../shared/compraRecebimentoEstorno";
import { resumirItensVenda } from "../shared/vendaComercial";
import { MSG_STATUS_ALTERACAO_DIRETA } from "../shared/animalBaixa";
import { buildFimCarenciaPorAnimal, toDateOnlyISO } from "../shared/carenciaAnimal";
import {
  isDescricaoServicoValida,
  MSG_DESCRICAO_SERVICO_OBRIGATORIA,
  normalizeDescricaoServico,
} from "@shared/manutencaoDescricao";
import { dataCivilParaColunaDate } from "@shared/dataCivil";
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
import { collectAnimalIdsComHistoricoDb } from "./animalExclusaoCheck";
import {
  animalStatusNaoAtivo,
  isAnimalExclusaoBloqueada,
} from "../shared/animalExclusao";
import { shouldConsumirEstoqueSemenNaInseminacao } from "../shared/semenUtilizado";
import { resolveReproducaoAnimalId } from "./reproducaoCreateInput";
import { registrarPartoComCriasInputSchema } from "./registrarPartoComCrias";
import { erroRegistrarParto, registrarPartoAutorizado } from "./registrarPartoAutorizado";
import { ioRegistrarPartoDrizzle } from "./registrarPartoAutorizadoDb";
import { erroReproducaoColetiva, registrarReproducaoColetivaAutorizada } from "./registrarReproducaoColetivaAutorizado";
import { ioRegistrarReproducaoColetivaDrizzle } from "./registrarReproducaoColetivaAutorizadoDb";
import {
  erroConsultaReproducao,
  gravarPipelineAutorizado,
  lerPipelineAutorizado,
  listarReproducaoAutorizada,
} from "./consultaReproducaoAutorizada";
import { ioConsultaReproducaoDrizzle } from "./consultaReproducaoAutorizadaDb";
import { enrichReproducaoListPartoCriasDb } from "./enrichReproducaoListPartoCrias";
import {
  enrichAnimalGenealogiaDisplayDb,
  enrichAnimalGenealogiaDisplayLocal,
} from "./enrichAnimalGenealogiaDisplay";
import {
  enrichAnimalDescendentesDb,
  enrichAnimalDescendentesLocal,
} from "./enrichAnimalDescendentes";
import { assertFazendaCanDelete, getFazendaDeleteCheck } from "./fazendaDeleteCheck";
import { carregarIdentidade } from "./_core/carregarIdentidade";
import { identificadorDeLogin } from "./_core/identificadorLogin";
import { MSG_LOGIN_INVALIDO, senhaConfereComHash } from "./_core/loginSenha";
import { autorizarOperacao } from "./contextoOperacional";
import { loginPermitido, type IdentidadeUsuario, type PapelConta, type SituacaoUsuario } from "./_core/identidadeSessao";
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
  assertRfidNaoReutilizavel,
} from "./manejoContexto";
import { normalizeBrincoKey } from "../shared/brincoAtivo";
import { escolherAnimalPorRfid, normalizeRfidKey } from "../shared/rfidUnicidade";
import { buildObservacoesHistoricoIdentificacao } from "../shared/historicoIdentificacao";
import {
  MSG_PESO_ENTRADA_INVALIDO,
  computeIndicadoresPeso,
  isPesoEntradaInformadoInvalido,
} from "../shared/pesoEntrada";
import { idsFazendasDoUsuarioParaEstoque } from "./estoqueIsolamentoLeitura";
import {
  assertFazendasEstoqueDoUsuario,
  assertMovimentacaoEstoqueDoUsuario,
  assertProdutoEstoqueDoUsuario,
  assertProdutosEstoqueDoUsuario,
  fazendasAutorizadasEstoque,
  recusarEscritaEstoque,
} from "./estoqueIsolamentoEscrita";
import {
  filtrarMovimentacoesEstoque,
  filtrarProdutosEstoque,
  podeEscreverProdutoEstoque,
  produtoEstoqueNaFazenda,
  produtoEstoqueVisivel,
  movimentacaoEstoqueVisivel,
  setFazendasDoUsuario,
} from "../shared/estoqueIsolamento";

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
      const registro = await carregarIdentidade(ctx.user.id);
      if (!registro || registro.sessionVersion !== ctx.user.sessionVersion) return null;
      return {
        id: registro.id,
        openId: registro.openId,
        name: registro.name,
        email: registro.email || "",
        role: registro.role,
        papel: registro.papel,
        situacao: registro.situacao,
        titularUserId: registro.titularUserId,
      };
    } catch {
      return null;
    }
  }),

  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const { or } = await import("drizzle-orm");
        const identificador = identificadorDeLogin(input.username);
        const [user] = await db.select().from(users).where(
          or(eq(users.openId, identificador), eq(users.email, identificador))
        ).limit(1);
        const senhaOk = await senhaConfereComHash(user?.passwordHash, input.password);
        if (!user || !senhaOk || !loginPermitido(user.situacao) || user.titularUserId == null || !user.papel) {
          throw new Error(MSG_LOGIN_INVALIDO);
        }
        const token = await createSession({
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email || "",
          role: user.role || "user",
          papel: user.papel,
          titularUserId: user.titularUserId,
          situacao: user.situacao,
          sessionVersion: user.sessionVersion,
        });
        setAuthCookie(ctx.res, token);
        return {
          success: true,
          user: {
            id: user.id,
            openId: user.openId,
            name: user.name,
            email: user.email,
            role: user.role,
            papel: user.papel,
          },
        };
      } catch (error) {
        if (isDatabaseUnavailable(error)) {
          throw new Error("Banco de dados indisponível. Tente novamente em instantes.");
        }
        throw error;
      }
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    clearAuthCookie(ctx.res);
    return { success: true };
  }),

  ensureLocalPreviewSession: publicProcedure
    .input(z.object({ email: z.string() }))
    .mutation(async () => {
      return { success: false as const };
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
  /** Em manejos, inclui baixados apenas quando o evento é retroativo (data <= baixa). */
  dataManejo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).optional();

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

type AnimalListaMinimo = {
  id: number;
  userId: number;
  fazendaId?: number | null;
  loteId?: number | null;
  brinco?: string | null;
  brincoEletronico?: string | null;
  nome?: string | null;
  raca?: string | null;
  sisbov?: string | null;
};

export type ResultadoListaAnimais<T> =
  | { ok: true; animais: T[]; fazendasAutorizadas: number[] }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" };

function textoContem(valor: unknown, termo: string): boolean {
  return String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termo);
}

/**
 * Escolhe quais animais da conta entram na lista.
 * Consulta concluída não acrescenta animal que só existe no espelho.
 */
export function filtrarAnimaisDaLista<T extends AnimalListaMinimo>(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number }[];
  lotesDoTitular: readonly { id: number; userId: number; fazendaId?: number | null; pastoAtualId?: number | null }[];
  pastosDoTitular: readonly { id: number; userId: number; fazendaId?: number | null }[];
  animais: readonly T[];
  locais?: readonly T[];
  consultaMysqlConcluida?: boolean;
  filtroFazendaId?: number | null;
  filtroLoteId?: number | null;
  filtroPastoId?: number | null;
  busca?: string | null;
  filtroBrinco?: string | null;
  filtroRfid?: string | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
}): ResultadoListaAnimais<T> {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };
  if (identidade.papel !== "principal" && !entrada.permissoes.includes("animais.visualizar")) {
    return { ok: false, motivo: "sem_permissao" };
  }

  const fazendasConta = entrada.fazendasDoTitular.filter((fazenda) => fazenda.userId === identidade.titularUserId);
  const lotesConta = entrada.lotesDoTitular.filter((lote) => lote.userId === identidade.titularUserId);
  const pastosConta = entrada.pastosDoTitular.filter((pasto) => pasto.userId === identidade.titularUserId);
  const { loteFazendaById } = buildLoteFazendaContext(lotesConta, pastosConta);
  const lotePorId = new Map(lotesConta.map((lote) => [lote.id, lote]));
  const extras = {
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
  };
  const fazendasAutorizadas: number[] = [];
  for (const fazenda of fazendasConta) {
    const deciso = autorizarOperacao({
      identidade,
      permissoes: entrada.permissoes,
      permissaoId: "animais.visualizar",
      fazendasDoTitular: fazendasConta,
      vinculos: entrada.vinculos,
      fazendaId: fazenda.id,
      fazenda,
      ...extras,
    });
    if (deciso.ok) fazendasAutorizadas.push(fazenda.id);
  }
  const autorizadas = new Set(fazendasAutorizadas);

  const visivel = (animal: T): boolean => {
    if (animal.userId !== identidade.titularUserId) return false;
    if (identidade.papel === "principal") return true;
    const lote = animal.loteId != null ? lotePorId.get(animal.loteId) : undefined;
    if (animal.loteId != null && !lote) return false;
    const fazendaDireta = animal.fazendaId != null ? Number(animal.fazendaId) : null;
    const fazendaLote = lote ? loteFazendaById.get(lote.id) ?? null : null;
    if (fazendaDireta != null && fazendaLote != null && fazendaDireta !== fazendaLote) return false;
    if (fazendaDireta != null && lote && fazendaLote == null) return false;
    const efetiva = fazendaDireta ?? fazendaLote;
    return efetiva != null && autorizadas.has(efetiva);
  };

  let animais = entrada.animais.filter(visivel);
  if (entrada.consultaMysqlConcluida === false && identidade.papel === "principal") {
    const ids = new Set(animais.map((animal) => animal.id));
    for (const local of entrada.locais ?? []) {
      if (ids.has(local.id) || !visivel(local)) continue;
      animais.push(local);
    }
  }

  if (entrada.filtroFazendaId != null) {
    if (identidade.papel !== "principal" && !autorizadas.has(entrada.filtroFazendaId)) {
      return { ok: true, animais: [], fazendasAutorizadas };
    }
    animais = animais.filter((animal) => animalPertenceFazenda(animal, entrada.filtroFazendaId!, loteFazendaById));
  }
  if (entrada.filtroLoteId != null) {
    const lote = lotePorId.get(entrada.filtroLoteId);
    const fazendaLote = lote ? loteFazendaById.get(lote.id) ?? null : null;
    if (identidade.papel !== "principal" && (!lote || fazendaLote == null || !autorizadas.has(fazendaLote))) {
      return { ok: true, animais: [], fazendasAutorizadas };
    }
    animais = animais.filter((animal) => animal.loteId === entrada.filtroLoteId);
  }
  if (entrada.filtroPastoId != null) {
    const pasto = pastosConta.find((item) => item.id === entrada.filtroPastoId);
    if (identidade.papel !== "principal" && (pasto?.fazendaId == null || !autorizadas.has(Number(pasto.fazendaId)))) {
      return { ok: true, animais: [], fazendasAutorizadas };
    }
    const loteIds = new Set(lotesConta.filter((lote) => lote.pastoAtualId === entrada.filtroPastoId).map((lote) => lote.id));
    animais = animais.filter((animal) => animal.loteId != null && loteIds.has(animal.loteId));
  }
  const busca = entrada.busca?.trim().toLocaleLowerCase("pt-BR");
  if (busca) {
    animais = animais.filter((animal) =>
      textoContem(animal.brinco, busca)
      || textoContem(animal.brincoEletronico, busca)
      || textoContem(animal.nome, busca)
      || textoContem(animal.raca, busca)
      || textoContem(animal.sisbov, busca));
  }
  const brinco = entrada.filtroBrinco?.trim().toLocaleLowerCase("pt-BR");
  if (brinco) animais = animais.filter((animal) => textoContem(animal.brinco, brinco));
  const rfid = entrada.filtroRfid?.trim().toLocaleLowerCase("pt-BR");
  if (rfid) animais = animais.filter((animal) => textoContem(animal.brincoEletronico, rfid));

  return { ok: true, animais, fazendasAutorizadas };
}

/** Consulta de um animal. Sem permissão geral recusa. Sem acesso ao id, responde como inexistente. */
export function resolverConsultaAnimal<T extends AnimalListaMinimo>(
  entrada: Parameters<typeof filtrarAnimaisDaLista<T>>[0],
): { ok: true; animal: T } | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "nao_encontrado" } {
  const lista = filtrarAnimaisDaLista(entrada);
  if (!lista.ok) return lista;
  const animal = lista.animais.find((item) => item.id === (entrada.animais[0]?.id ?? entrada.locais?.[0]?.id));
  if (!animal) return { ok: false, motivo: "nao_encontrado" };
  return { ok: true, animal };
}

/** Mesma ficha de antes: o animal inteiro, mais lote, dias, baixa, genealogia e descendentes. */
export function montarFichaAnimal<T extends { createdAt?: string | Date | null }>(
  animal: T,
  apoio: {
    loteNome: string | null;
    baixa: unknown;
    genealogiaDisplay: unknown;
    descendentes: unknown;
    agora?: number;
  },
) {
  const agora = apoio.agora ?? Date.now();
  const diasNaFazenda = animal.createdAt
    ? Math.floor((agora - new Date(animal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  return {
    ...animal,
    loteNome: apoio.loteNome,
    diasNaFazenda,
    baixa: apoio.baixa,
    genealogiaDisplay: apoio.genealogiaDisplay,
    descendentes: apoio.descendentes,
  };
}

export type ProdutoCarenciaLista = {
  id: number;
  nome: string;
  fazendaId?: number | null;
  carenciaAbateDias?: number | string | null;
  possuiCarencia?: boolean | number | null;
};

export type RegistroCarenciaLista = {
  animalId: number;
  medicamento?: string | null;
  dataRegistro?: string | Date | null;
  proximaData?: string | Date | null;
  estoqueId?: number | null;
};

/** Fazenda do animal: a dele, ou a do lote quando ele não tem fazenda própria. */
export function fazendaDoAnimalParaCarencia(
  animal: { fazendaId?: number | null; loteId?: number | null },
  loteFazendaById: ReadonlyMap<number, number | null>,
): number | null {
  if (animal.fazendaId != null && Number(animal.fazendaId) > 0) return Number(animal.fazendaId);
  if (animal.loteId == null) return null;
  const fazenda = loteFazendaById.get(Number(animal.loteId));
  return fazenda != null && Number(fazenda) > 0 ? Number(fazenda) : null;
}

function nomeMedicamentoCarencia(valor: string | null | undefined): string {
  return (valor ?? "").toLowerCase().trim();
}

function diasCarenciaPositivos(valor: number | string | null | undefined): number | null {
  if (valor == null || valor === "") return null;
  const dias = Number(valor);
  if (!Number.isFinite(dias) || dias <= 0) return null;
  return dias;
}

/**
 * Data final de carência usando só produto da fazenda do animal e do titular.
 * Produto sem fazenda fica de fora. Nome repetido com dias diferentes não escolhe um vencedor,
 * salvo quando o registro sanitário aponta o estoqueId desse produto.
 * A fórmula em shared/carenciaAnimal.ts não muda.
 */
export function calcularFimCarenciaNoEscopo(entrada: {
  animais: readonly { id: number; fazendaId?: number | null }[];
  registros: readonly RegistroCarenciaLista[];
  produtos: readonly ProdutoCarenciaLista[];
  fazendasDoTitular: readonly number[];
  hoje?: Date;
}): Map<number, Date> {
  const hoje = entrada.hoje ?? new Date();
  const fazendas = new Set(entrada.fazendasDoTitular.filter((id) => Number.isFinite(id) && id > 0));
  const fim = new Map<number, Date>();
  const registrosOrdenados = [...entrada.registros].sort((a, b) => {
    const dataA = a.dataRegistro ? new Date(a.dataRegistro).getTime() : 0;
    const dataB = b.dataRegistro ? new Date(b.dataRegistro).getTime() : 0;
    if (dataA === dataB) return 0;
    return dataB - dataA;
  });

  for (const animal of entrada.animais) {
    const fazendaId = animal.fazendaId != null ? Number(animal.fazendaId) : null;
    const produtosDaFazenda = fazendaId != null && fazendas.has(fazendaId)
      ? entrada.produtos.filter((produto) => (
        produto.possuiCarencia !== false
        && produto.possuiCarencia !== 0
        && produtoEstoqueNaFazenda(produto, fazendaId)
      ))
      : [];
    const porId = new Map(produtosDaFazenda.map((produto) => [produto.id, produto]));
    const diasDistintosPorNome = new Map<string, Set<number>>();
    for (const produto of produtosDaFazenda) {
      const nome = nomeMedicamentoCarencia(produto.nome);
      const dias = diasCarenciaPositivos(produto.carenciaAbateDias);
      if (!nome || dias == null) continue;
      const conjunto = diasDistintosPorNome.get(nome) ?? new Set<number>();
      conjunto.add(dias);
      diasDistintosPorNome.set(nome, conjunto);
    }
    const diasPorNome = new Map<string, number | null>();
    for (const [nome, conjunto] of diasDistintosPorNome) {
      diasPorNome.set(nome, conjunto.size === 1 ? [...conjunto][0] : null);
    }

    const doAnimal = registrosOrdenados.filter((registro) => registro.animalId === animal.id);
    const mapa = new Map<string, number>();
    const nomesResolvidos = new Set<string>();
    for (const registro of doAnimal) {
      const nome = nomeMedicamentoCarencia(registro.medicamento);
      if (!nome || nomesResolvidos.has(nome)) continue;
      nomesResolvidos.add(nome);
      const vinculado = registro.estoqueId != null ? porId.get(Number(registro.estoqueId)) : undefined;
      if (vinculado) {
        const diasVinculo = diasCarenciaPositivos(vinculado.carenciaAbateDias);
        if (diasVinculo != null) mapa.set(nome, diasVinculo);
        continue;
      }
      const porNome = diasPorNome.get(nome);
      if (typeof porNome === "number") mapa.set(nome, porNome);
    }
    for (const [id, data] of buildFimCarenciaPorAnimal(doAnimal, mapa, hoje)) fim.set(id, data);
  }
  return fim;
}

export function enriquecerAnimalParaLista<T extends {
  dataNascimento?: string | Date | null;
  dataEntrada?: string | Date | null;
  pesoEntrada?: unknown;
  status?: string | null;
}>(animal: T, apoio: {
  loteNome: string | null;
  pastoNome: string | null;
  pesos: Parameters<typeof computeIndicadoresPeso>[0];
  fimCarencia: Date | null;
  temHistoricoOperacional: boolean;
  hoje: Date;
}) {
  let idadeMeses: number | null = null;
  if (animal.dataNascimento) {
    const nasc = new Date(animal.dataNascimento);
    idadeMeses = Math.floor((apoio.hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  }
  let diasNaFazenda: number | null = null;
  if (animal.dataNascimento) {
    const nasc = new Date(animal.dataNascimento);
    diasNaFazenda = Math.floor((apoio.hoje.getTime() - nasc.getTime()) / (1000 * 60 * 60 * 24));
  } else if (animal.dataEntrada) {
    const entrada = new Date(animal.dataEntrada);
    diasNaFazenda = Math.floor((apoio.hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
  }
  const indicadoresPeso = computeIndicadoresPeso(apoio.pesos, {
    pesoEntrada: animal.pesoEntrada,
    dataEntrada: animal.dataEntrada,
  });
  return {
    ...animal,
    loteNome: apoio.loteNome,
    pastoNome: apoio.pastoNome,
    idadeMeses,
    diasNaFazenda,
    ultimoPeso: indicadoresPeso.ultimoPeso,
    origemUltimoPeso: indicadoresPeso.origemUltimoPeso,
    ganhoKg: indicadoresPeso.ganhoKg,
    gmd: indicadoresPeso.gmd,
    emCarencia: apoio.fimCarencia != null,
    fimCarenciaAte: apoio.fimCarencia ? toDateOnlyISO(apoio.fimCarencia) : null,
    exclusaoBloqueada: isAnimalExclusaoBloqueada({
      statusNaoAtivo: animalStatusNaoAtivo(animal.status),
      temHistoricoOperacional: apoio.temHistoricoOperacional,
    }),
  };
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
          if (transfer.loteOrigemId) loteIds.add(transfer.loteOrigemId);
          loteIds.add(transfer.loteDestinoId);
        }
        if (loteIds.size === 0 && transfers.length === 0) return [];

        const lotePastoRows = loteIds.size
          ? await db.select().from(lotePastoMovimentacoes)
            .where(and(
              eq(lotePastoMovimentacoes.userId, ctx.user.id),
              inArray(lotePastoMovimentacoes.loteId, [...loteIds]),
            ))
          : [];

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

        const loteNomeMap: Record<number, string> = {};
        if (loteIds.size) {
          const lotesRows = await db.select({ id: lotes.id, nome: lotes.nome })
            .from(lotes)
            .where(inArray(lotes.id, [...loteIds]));
          lotesRows.forEach(l => { loteNomeMap[l.id] = l.nome; });
        }

        const fazendaIds = [
          ...new Set(
            transfers.flatMap(t => [t.fazendaOrigemId, t.fazendaId].filter((id): id is number => id != null)),
          ),
        ];
        const fazendaNomeMap: Record<number, string> = {};
        if (fazendaIds.length) {
          const fazendasRows = await db
            .select({ id: fazendas.id, nome: fazendas.nome })
            .from(fazendas)
            .where(inArray(fazendas.id, fazendaIds));
          fazendasRows.forEach(f => { fazendaNomeMap[f.id] = f.nome; });
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
            observacoes: t.observacoes,
            fazendaOrigemId: t.fazendaOrigemId,
            fazendaDestinoId: t.fazendaId,
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
          loteNomeMap,
          fazendaNomeMap,
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
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      try {
      const permissoes = identidade.papel === "principal"
        ? []
        : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
          eq(usuarioPermissoes.userId, identidade.id),
          eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
        ))).map((row) => row.permissao);
      const vinculos = identidade.papel === "principal"
        ? []
        : await db.select({
          userId: usuarioFazendas.userId,
          fazendaId: usuarioFazendas.fazendaId,
        }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
      const fazendasConta = await db.select({ id: fazendas.id, userId: fazendas.userId })
        .from(fazendas).where(eq(fazendas.userId, identidade.titularUserId));
      const lotesConta = await db.select({
        id: lotes.id,
        userId: lotes.userId,
        nome: lotes.nome,
        fazendaId: lotes.fazendaId,
        pastoAtualId: lotes.pastoAtualId,
      }).from(lotes).where(eq(lotes.userId, identidade.titularUserId));
      const pastosConta = await db.select({
        id: pastos.id,
        userId: pastos.userId,
        fazendaId: pastos.fazendaId,
      }).from(pastos).where(eq(pastos.userId, identidade.titularUserId));
      const previa = filtrarAnimaisDaLista({
        identidade,
        permissoes,
        vinculos,
        fazendasDoTitular: fazendasConta,
        lotesDoTitular: lotesConta,
        pastosDoTitular: pastosConta,
        animais: [],
        consultaMysqlConcluida: true,
      });
      if (!previa.ok) {
        throw new TRPCError({
          code: previa.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
          message: previa.motivo === "sem_identidade"
            ? "Sessão inválida."
            : "Sem permissão para consultar os animais.",
        });
      }
      if (identidade.papel !== "principal" && previa.fazendasAutorizadas.length === 0) return [];
      if (identidade.papel !== "principal" && input?.fazendaId && !previa.fazendasAutorizadas.includes(input.fazendaId)) {
        return [];
      }
      if (identidade.papel !== "principal" && input?.loteId) {
        const lotePedido = lotesConta.find((lote) => lote.id === input.loteId);
        const fazendaDoLote = lotePedido?.fazendaId
          ?? pastosConta.find((pasto) => pasto.id === lotePedido?.pastoAtualId)?.fazendaId
          ?? null;
        if (fazendaDoLote == null || !previa.fazendasAutorizadas.includes(Number(fazendaDoLote))) return [];
      }
      if (identidade.papel !== "principal" && input?.pastoId) {
        const pastoPedido = pastosConta.find((pasto) => pasto.id === input.pastoId);
        if (pastoPedido?.fazendaId == null || !previa.fazendasAutorizadas.includes(pastoPedido.fazendaId)) return [];
      }

      const conditions = [eq(animais.userId, identidade.titularUserId)];
      if (input?.sexo && input.sexo !== '') conditions.push(eq(animais.sexo, input.sexo as any));
      if (input?.status && input.status !== '' && input.status !== 'todos') {
        if (input.status === 'inativo') {
          // Qualquer status diferente de ativo (vendido, morto, transferido).
          conditions.push(ne(animais.status, 'ativo'));
        } else if (input.status === 'ativo' && input.dataManejo) {
          conditions.push(
            or(
              eq(animais.status, 'ativo'),
              sql`EXISTS (
                SELECT 1
                FROM ${animalBaixas}
                WHERE ${animalBaixas.userId} = ${identidade.titularUserId}
                  AND ${animalBaixas.animalId} = ${animais.id}
                  AND ${animalBaixas.dataBaixa} >= ${input.dataManejo}
              )`,
            )!,
          );
        } else {
          conditions.push(eq(animais.status, input.status as any));
        }
      }
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
      if (identidade.papel !== "principal") {
        const loteIdsAutorizados = lotesConta
          .filter((lote) => {
            const fazendaId = lote.fazendaId
              ?? pastosConta.find((pasto) => pasto.id === lote.pastoAtualId)?.fazendaId
              ?? null;
            return fazendaId != null && previa.fazendasAutorizadas.includes(Number(fazendaId));
          })
          .map((lote) => lote.id);
        const naFazenda = inArray(animais.fazendaId, previa.fazendasAutorizadas);
        conditions.push(loteIdsAutorizados.length
          ? or(naFazenda, and(isNull(animais.fazendaId), inArray(animais.loteId, loteIdsAutorizados)))!
          : naFazenda);
      }
      if (input?.pastoId) {
        const loteIds = lotesConta.filter((lote) => lote.pastoAtualId === input.pastoId).map((lote) => lote.id);
        if (loteIds.length === 0) return [];
        conditions.push(inArray(animais.loteId, loteIds));
      }

      let lista = await db.select().from(animais).where(and(...conditions)).orderBy(desc(animais.createdAt));
      const visiveis = filtrarAnimaisDaLista({
        identidade,
        permissoes,
        vinculos,
        fazendasDoTitular: fazendasConta,
        lotesDoTitular: lotesConta,
        pastosDoTitular: pastosConta,
        animais: lista,
        consultaMysqlConcluida: true,
        filtroFazendaId: input?.fazendaId,
        filtroLoteId: input?.loteId,
        filtroPastoId: input?.pastoId,
      });
      if (!visiveis.ok) {
        throw new TRPCError({
          code: visiveis.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
          message: visiveis.motivo === "sem_identidade"
            ? "Sessão inválida."
            : "Sem permissão para consultar os animais.",
        });
      }
      lista = visiveis.animais;
      if (lista.length === 0) return [];

      const animalIds = lista.map(a => a.id);

      const loteMap = new Map(lotesConta.map(l => [l.id, l.nome]));

      // Busca pastos para enriquecer com pastoNome
      const pastoIdsAnimais = [...new Set(lista.map(a => a.pastoId).filter(Boolean) as number[])];
      const pastoMapAnimais = new Map<number, string>();
      if (pastoIdsAnimais.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome })
          .from(pastos).where(and(inArray(pastos.id, pastoIdsAnimais), eq(pastos.userId, identidade.titularUserId)));
        pastosRows.forEach(p => pastoMapAnimais.set(p.id, p.nome));
      }

      // Busca TODAS as pesagens dos animais listados (para calcular GMD e ganho)
      const todasPesagens = await db.select()
        .from(pesagens)
        .where(and(eq(pesagens.userId, identidade.titularUserId), inArray(pesagens.animalId, animalIds)))
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
        estoqueId: saudeRegistros.estoqueId,
      })
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.userId, identidade.titularUserId), inArray(saudeRegistros.animalId, animalIds)))
        .orderBy(desc(saudeRegistros.dataRegistro));

      const contextoLotes = buildLoteFazendaContext(lotesConta, pastosConta);
      const fazendaPorAnimal = new Map(lista.map((animal) => [
        animal.id,
        fazendaDoAnimalParaCarencia(animal, contextoLotes.loteFazendaById),
      ]));
      const fazendasParaCarencia = [...new Set(
        [...fazendaPorAnimal.values()].filter((id): id is number => (
          id != null && previa.fazendasAutorizadas.includes(id)
        )),
      )];
      const produtosCarencia = fazendasParaCarencia.length === 0 ? [] : await db.select({
        id: estoque.id,
        nome: estoque.nome,
        fazendaId: estoque.fazendaId,
        carenciaAbateDias: estoque.carenciaAbateDias,
        possuiCarencia: estoque.possuiCarencia,
      }).from(estoque).innerJoin(fazendas, eq(fazendas.id, estoque.fazendaId)).where(and(
        eq(estoque.possuiCarencia, true),
        eq(fazendas.userId, identidade.titularUserId),
        inArray(estoque.fazendaId, fazendasParaCarencia),
      ));

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const fimCarenciaPorAnimal = calcularFimCarenciaNoEscopo({
        animais: lista.map((animal) => ({ id: animal.id, fazendaId: fazendaPorAnimal.get(animal.id) ?? null })),
        registros: saudeAll,
        produtos: produtosCarencia,
        fazendasDoTitular: fazendasConta.map((fazenda) => fazenda.id),
        hoje,
      });
      const idsComHistorico = await collectAnimalIdsComHistoricoDb(identidade.titularUserId, animalIds);

      // Monta resultado enriquecido
      const resultado = lista.map(animal => enriquecerAnimalParaLista(animal, {
        loteNome: animal.loteId ? (loteMap.get(animal.loteId) || null) : null,
        pastoNome: animal.pastoId ? (pastoMapAnimais.get(animal.pastoId) ?? null) : null,
        pesos: pesagensPorAnimal.get(animal.id) || [],
        fimCarencia: fimCarenciaPorAnimal.get(animal.id) ?? null,
        temHistoricoOperacional: idsComHistorico.has(animal.id),
        hoje,
      }));

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
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error;
        const locais = await listLocalAnimaisEnriched(identidade.titularUserId, input as Record<string, unknown> | undefined);
        return locais.filter((row) => Number(row.userId) === identidade.titularUserId);
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      const recusar = (motivo: "sem_identidade" | "sem_permissao") => {
        throw new TRPCError({
          code: motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
          message: motivo === "sem_identidade"
            ? "Sessão inválida."
            : "Sem permissão para consultar o animal.",
        });
      };
      try {
        const [animal] = await db.select().from(animais)
          .where(and(eq(animais.id, input.id), eq(animais.userId, identidade.titularUserId)))
          .limit(1);
        const permissoes = identidade.papel === "principal"
          ? []
          : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
            eq(usuarioPermissoes.userId, identidade.id),
            eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
          ))).map((row) => row.permissao);
        const vinculos = identidade.papel === "principal"
          ? []
          : await db.select({
            userId: usuarioFazendas.userId,
            fazendaId: usuarioFazendas.fazendaId,
          }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
        const fazendasConta = await db.select({ id: fazendas.id, userId: fazendas.userId })
          .from(fazendas).where(eq(fazendas.userId, identidade.titularUserId));
        const lotesConta = await db.select({
          id: lotes.id,
          userId: lotes.userId,
          nome: lotes.nome,
          fazendaId: lotes.fazendaId,
          pastoAtualId: lotes.pastoAtualId,
        }).from(lotes).where(eq(lotes.userId, identidade.titularUserId));
        const pastosConta = await db.select({
          id: pastos.id,
          userId: pastos.userId,
          fazendaId: pastos.fazendaId,
        }).from(pastos).where(eq(pastos.userId, identidade.titularUserId));
        const resolvido = resolverConsultaAnimal({
          identidade,
          permissoes,
          vinculos,
          fazendasDoTitular: fazendasConta,
          lotesDoTitular: lotesConta,
          pastosDoTitular: pastosConta,
          animais: animal ? [animal] : [],
          consultaMysqlConcluida: true,
        });
        if (!resolvido.ok) {
          if (resolvido.motivo === "nao_encontrado") return null;
          recusar(resolvido.motivo);
        }
        const loteNome = resolvido.animal.loteId != null
          ? (lotesConta.find((lote) => lote.id === resolvido.animal.loteId)?.nome ?? null)
          : null;
        const baixa = await getBaixaAnimal(identidade.titularUserId, resolvido.animal.id);
        const genealogiaDisplay = await enrichAnimalGenealogiaDisplayDb(identidade.titularUserId, resolvido.animal);
        const descendentes = await enrichAnimalDescendentesDb(identidade.titularUserId, resolvido.animal.id);
        return montarFichaAnimal(resolvido.animal, { loteNome, baixa, genealogiaDisplay, descendentes });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error;
        const local = await getLocalAnimal(identidade.titularUserId, input.id);
        if (!local || Number(local.userId) !== identidade.titularUserId) return null;
        const resolvido = resolverConsultaAnimal({
          identidade,
          permissoes: [],
          vinculos: [],
          fazendasDoTitular: [],
          lotesDoTitular: [],
          pastosDoTitular: [],
          animais: [],
          locais: [local],
          consultaMysqlConcluida: false,
        });
        if (!resolvido.ok) return null;
        const enriched = await enrichLocalAnimal(identidade.titularUserId, resolvido.animal);
        const baixa = await getBaixaAnimal(identidade.titularUserId, resolvido.animal.id);
        const genealogiaDisplay = await enrichAnimalGenealogiaDisplayLocal(identidade.titularUserId, resolvido.animal);
        const descendentes = await enrichAnimalDescendentesLocal(identidade.titularUserId, resolvido.animal.id);
        return { ...enriched, baixa, genealogiaDisplay, descendentes };
      }
    }),

  registrarBaixa: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      animalId: z.number().int().positive(),
      dataBaixa: z.string().min(1).max(10),
      tipo: z.enum(["venda", "morte", "transferencia"]),
      destino: z.string().max(255).nullable().optional(),
      motivo: z.string().max(255).nullable().optional(),
      observacoes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const executorNome = ctx.user.name?.trim() || ctx.user.email || "Usuário";
      try {
        const resultado = await baixarEEspelharAnimal(ioBaixaDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input,
        }, {
          async baixar(userId, dados) {
            await registrarLocalAnimalBaixa(userId, dados);
          },
        });
        if (!resultado.ok) throw erroBaixaAnimal(resultado);
        return { success: true as const, id: resultado.id, status: resultado.status };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoBaixaAnimal) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
        }
        throw error;
      }
    }),

  transferirEntreFazendas: protectedProcedure
    .input(z.object({
      fazendaOrigemId: z.number().int().positive(),
      fazendaDestinoId: z.number().int().positive(),
      animalId: z.number().int().positive(),
      loteDestinoId: z.number().int().positive(),
      pastoDestinoId: z.number().int().positive().nullable().optional(),
      dataTransferencia: z.string().min(1).max(10),
      observacoes: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const executorNome = ctx.user.name?.trim() || ctx.user.email || "Usuário";
      try {
        const resultado = await transferirEEspelharAnimalFazenda(ioAnimaisLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input: {
            fazendaOrigemId: input.fazendaOrigemId,
            fazendaDestinoId: input.fazendaDestinoId,
            animalId: input.animalId,
            loteDestinoId: input.loteDestinoId,
            pastoDestinoId: input.pastoDestinoId ?? null,
            dataTransferencia: input.dataTransferencia,
            observacoes: input.observacoes ?? null,
          },
        }, {
          async transferir(userId, dados) {
            await registrarLocalTransferenciaInterna(userId, dados);
          },
        });
        if (!resultado.ok) throw erroTransferenciaFazenda(resultado);
        return {
          success: true as const,
          status: resultado.status,
          fazendaId: resultado.fazendaId,
          loteId: resultado.loteId,
          loteDestinoNome: resultado.loteDestinoNome,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DeadlockMovimentacaoAnimais) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
        }
        throw error;
      }
    }),

  /**
   * POC AT05 — busca animal por brinco eletrônico com igualdade exata (string).
   * Não usa LIKE. Não converte RFID para Number.
   * Se o chip já foi reaproveitado, devolve o animal ativo.
   * Somente leitura — sem gravação.
   */
  getByBrincoEletronicoExact: protectedProcedure
    .input(z.object({ brincoEletronico: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rfid = input.brincoEletronico.trim();
      if (!rfid) return null;

      try {
        const [animal] = await db
          .select()
          .from(animais)
          .where(
            and(
              eq(animais.userId, ctx.user.id),
              sql`TRIM(${animais.brincoEletronico}) = ${rfid}`,
            ),
          )
          .orderBy(sql`CASE WHEN LOWER(TRIM(${animais.status})) = 'ativo' THEN 0 ELSE 1 END`)
          .limit(1);

        if (!animal) return null;

        let loteNome: string | null = null;
        if (animal.loteId) {
          const [lote] = await db
            .select({ nome: lotes.nome })
            .from(lotes)
            .where(eq(lotes.id, animal.loteId))
            .limit(1);
          loteNome = lote?.nome ?? null;
        }

        // Mesma regra do Rebanho: fazenda do animal OU do lote (lote.fazendaId / pasto).
        let fazendaIdResolvido: number | null =
          animal.fazendaId != null ? Number(animal.fazendaId) : null;
        if (fazendaIdResolvido == null && animal.loteId != null) {
          const { loteFazendaById } = await loadLoteFazendaContextForUser(ctx.user.id);
          const fromLote = loteFazendaById.get(Number(animal.loteId));
          fazendaIdResolvido = fromLote != null ? Number(fromLote) : null;
        }

        let fazendaNome: string | null = null;
        if (fazendaIdResolvido != null) {
          const [fazenda] = await db
            .select({ nome: fazendas.nome })
            .from(fazendas)
            .where(eq(fazendas.id, fazendaIdResolvido))
            .limit(1);
          fazendaNome = fazenda?.nome ?? null;
        }

        return {
          id: animal.id,
          brinco: animal.brinco,
          brincoEletronico: animal.brincoEletronico,
          sexo: animal.sexo,
          categoria: animal.categoria,
          status: animal.status,
          loteId: animal.loteId,
          loteNome,
          fazendaId: fazendaIdResolvido,
          fazendaNome,
        };
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }

      const lista = await listLocalAnimais(ctx.user.id);
      const local = escolherAnimalPorRfid(lista, rfid);
      if (!local) return null;
      const enriched = await enrichLocalAnimal(ctx.user.id, local);

      let fazendaIdLocal: number | null =
        enriched.fazendaId != null ? Number(enriched.fazendaId) : null;
      let fazendaNomeLocal: string | null = null;
      if (fazendaIdLocal == null && enriched.loteId != null) {
        const lotesLocais = await listLocalLotes(ctx.user.id);
        const lote = lotesLocais.find(l => l.id === Number(enriched.loteId));
        if (lote?.fazendaId != null) {
          fazendaIdLocal = Number(lote.fazendaId);
        }
      }
      if (fazendaIdLocal != null) {
        const fazendasLocais = await listLocalFazendas(ctx.user.id);
        fazendaNomeLocal =
          fazendasLocais.find(f => f.id === fazendaIdLocal)?.nome ?? null;
      }

      return {
        id: enriched.id,
        brinco: enriched.brinco ?? null,
        brincoEletronico: enriched.brincoEletronico ?? null,
        sexo: enriched.sexo,
        categoria: enriched.categoria ?? null,
        status: enriched.status ?? null,
        loteId: enriched.loteId ?? null,
        loteNome: (enriched as { loteNome?: string | null }).loteNome ?? null,
        fazendaId: fazendaIdLocal,
        fazendaNome: fazendaNomeLocal,
      };
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
      castrado: z.boolean().nullable().optional(),
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
      maeId: z.number().nullable().optional(),
      paiId: z.number().nullable().optional(),
      pai: z.string().optional(),
      mae: z.string().optional(),
      fazendaId: z.number().optional(),
      pastoId: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await cadastrarEEspelhar(ioCadastroDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async atualizar(userId, id, row) {
            await updateLocalAnimal(userId, id, row);
          },
          async historico(entrada) {
            await registrarLocalEntradaInicialLote(entrada);
          },
        });
        if (!resultado.ok) throw erroCadastroAnimal(resultado);
        return { success: true as const, id: resultado.id };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
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
      castrado: z.boolean().nullable().optional(),
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
      maeId: z.number().nullable().optional(),
      paiId: z.number().nullable().optional(),
      pai: z.string().nullable().optional(),
      mae: z.string().nullable().optional(),
      fazendaId: z.number().nullable().optional(),
      pastoId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await editarEEspelharAnimal(ioEditarAnimalDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async atualizar(userId, id, patch) {
            await updateLocalAnimal(userId, id, patch);
          },
        });
        if (!resultado.ok) throw erroEdicaoAnimal(resultado);
        return { success: true as const };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isDatabaseUnavailable(err)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
        }
        console.error("[animais.update]", err);
        throw err;
      }
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async () => {
      recusarExclusaoFisicaAnimal();
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

      // Dropdowns de validação — Fazenda, Sexo, Categoria, Raça, Castrado, Rastreado, Lote, Subdivisão
      const idxDe = (key: string) => COLUNAS_IMPORTACAO.findIndex(c => c.key === key) + 1;
      
      // Importar mapeamento Sexo → Categoria
      const { CATEGORIAS_POR_SEXO } = await import('../shared/animal-types');
      
      // Coluna Sexo: índice 1-based na planilha (para montar referência na fórmula)
      const colSexoIdx = idxDe('sexo'); // ex: 4 → coluna D
      const colSexoLetra = String.fromCharCode(64 + colSexoIdx);
      
      const colIdxCastrado = idxDe('castrado');
      const dvConfig: { colIdx: number; formulae: string[]; error?: string }[] = [
        { colIdx: idxDe('fazendaNome'),         formulae: fazendasFormulae },
        { colIdx: idxDe('sexo'),                formulae: ['"Fêmea,Macho"'] },
        { colIdx: idxDe('categoria'),           formulae: [`OFFSET(_ListasAnimais!$D$1,MATCH($${colSexoLetra}{r},_ListasAnimais!$C:$C,0)-1,0,COUNTIF(_ListasAnimais!$C:$C,$${colSexoLetra}{r}),1)`] },
        { colIdx: idxDe('raca'),                formulae: ['"Nelore,Nelore Mocho,Angus,Senepol,Brahman,Girolando,Gir,Holandês,Mestiço,Outro"'] },
        { colIdx: idxDe('rastreadoNascimento'), formulae: ['"Sim,Não"'] },
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

        if (colIdxCastrado > 0) {
          const cellCastrado = ws.getRow(r).getCell(colIdxCastrado);
          cellCastrado.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`IF($${colSexoLetra}${r}="Macho",Castrado_Macho,"")`],
            showErrorMessage: true,
            errorTitle: 'Castrado',
            error: 'Castrado só se aplica a machos. Para fêmeas, deixe em branco.',
            showInputMessage: true,
            promptTitle: 'Castrado',
            prompt: 'Preencha somente se o sexo for Macho.',
          };
        }

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

      // Coluna E/F: Castrado só aparece para Macho (Fêmea fica em branco).
      wsListasAnimais.getColumn(5).width = 12;
      wsListasAnimais.getColumn(6).width = 12;
      wsListasAnimais.getCell(1, 5).value = "Macho";
      wsListasAnimais.getCell(2, 5).value = "Macho";
      wsListasAnimais.getCell(1, 6).value = "Sim";
      wsListasAnimais.getCell(2, 6).value = "Não";
      wb.definedNames.add("_ListasAnimais!$F$1:$F$2", "Castrado_Macho");

      // ─── Named Ranges por fazenda para dropdown dinâmico de Subdivisão ─────────
      // Cada fazenda recebe uma coluna na aba oculta com seus pastos.
      // O Named Range é nomeado "Pasto_" + nome_da_fazenda (espaços → _)
      // A fórmula INDIRECT na coluna Subdivisão referencia este Named Range.
      const sanitizarNomeRange = (nome: string) =>
        'Pasto_' + nome.replace(/[^A-Za-z0-9À-ÿ]/g, '_');

      let colPastosStart = 8; // A=1 … D=categorias, E/F=castrado, G=espaço, H+=pastos
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
        resolverCastradoImportacao,
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

        const castradoImport = resolverCastradoImportacao({
          sexo,
          castrado: linha.castrado,
        });
        if (!castradoImport.ok) {
          errosLinha.push({ linha: numLinha, campo: 'Castrado', mensagem: castradoImport.message });
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
      const { normalizarLinha, normalizarSexo, normalizarStatus, normalizarBooleano, isLinhaExemplo, mensagemDataReferenciaLinha, possuiDataReferenciaImportacao, resolverCastradoImportacao } = await import('../shared/importacaoAnimais');
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

          // Converte rastreadoNascimento (aceita Sim/Não em PT-BR).
          // Castrado: só macho; fêmea nunca persiste este campo.
          const toBool = normalizarBooleano;
          const castradoImport = resolverCastradoImportacao({
            sexo,
            castrado: linha.castrado,
          });
          if (!castradoImport.ok) {
            rejeitados.push({ linha: i + 2, mensagem: castradoImport.message });
            continue;
          }

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
              castrado: castradoImport.castrado,
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
                animalRow.fazendaId,
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

  registrarDesmama: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      animalId: z.number().int().positive(),
      dataDesmama: z.string().min(1).max(10),
      pesoKg: z.string().max(20).optional(),
      observacoes: z.string().max(2000).optional(),
      idadeMeses: z.number().int().min(0).max(600).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await desmamarEEspelharAnimal(ioPesagemDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async desmamar(userId, dados) {
            await updateLocalAnimal(userId, dados.animalId, {
              dataDesmama: dados.dataDesmama,
              ...(dados.dataNascimento ? { dataNascimento: dados.dataNascimento } : {}),
              ...(dados.pesoAtual ? { pesoAtual: dados.pesoAtual } : {}),
            });
            if (dados.novaPesagem) await createLocalPesagem(userId, dados.novaPesagem);
            else if (dados.pesagemObservacao) {
              await updateLocalPesagemObservacoes(
                userId,
                dados.pesagemObservacao.id,
                dados.pesagemObservacao.observacoes,
              );
            }
          },
        });
        if (!resultado.ok) throw erroDesmama(resultado);
        return {
          success: true as const,
          pesagemCriada: resultado.pesagemCriada,
          pesagemReutilizada: resultado.pesagemReutilizada,
          pesagemVinculada: resultado.pesagemVinculada,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoPesagemAnimal) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
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

type LoteListaMinimo = {
  id: number;
  userId: number;
  fazendaId?: number | null;
  pastoAtualId?: number | null;
  ativo?: boolean | null;
  dataEntradaPasto?: string | Date | null;
  nome?: string | null;
};

type LoteEnriquecido<T> = T & {
  qtdAnimais: number;
  pastoNome: string | null;
  pastoCapacidade: number | null;
  fazendaNome: string | null;
  diasNoPasto: number | null;
};

export type ResultadoListaLotes<T> =
  | { ok: true; lotes: LoteEnriquecido<T>[]; fazendasAutorizadas: number[] }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" };

/**
 * Escolhe os lotes da conta e completa a ficha com fazenda, pasto e contagem da própria conta.
 * A consulta concluída não devolve lote que só existe no espelho.
 */
export function comporListaLotes<T extends LoteListaMinimo>(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number; nome?: string | null }[];
  pastosDoTitular: readonly { id: number; userId: number; fazendaId?: number | null; nome?: string | null; capacidade?: number | null }[];
  lotes: readonly T[];
  locais?: readonly T[];
  contagemPorLote?: readonly { loteId: number; quantidade: number }[];
  consultaMysqlConcluida?: boolean;
  somenteAtivos?: boolean;
  filtroFazendaId?: number | null;
  hoje?: string | Date;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
}): ResultadoListaLotes<T> {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };
  if (identidade.papel !== "principal" && !entrada.permissoes.includes("lotes.visualizar")) {
    return { ok: false, motivo: "sem_permissao" };
  }

  const fazendasConta = entrada.fazendasDoTitular.filter((fazenda) => fazenda.userId === identidade.titularUserId);
  const pastosConta = entrada.pastosDoTitular.filter((pasto) => pasto.userId === identidade.titularUserId);
  const extras = {
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
  };
  const fazendasAutorizadas: number[] = [];
  for (const fazenda of fazendasConta) {
    const deciso = autorizarOperacao({
      identidade,
      permissoes: entrada.permissoes,
      permissaoId: "lotes.visualizar",
      fazendasDoTitular: fazendasConta,
      vinculos: entrada.vinculos,
      fazendaId: fazenda.id,
      fazenda,
      ...extras,
    });
    if (deciso.ok) fazendasAutorizadas.push(fazenda.id);
  }
  const autorizadas = new Set(fazendasAutorizadas);
  const fazendaPorId = new Map(fazendasConta.map((fazenda) => [fazenda.id, fazenda]));
  const pastoPorId = new Map(pastosConta.map((pasto) => [pasto.id, pasto]));
  const contagem = new Map((entrada.contagemPorLote ?? []).map((item) => [item.loteId, item.quantidade]));

  const visivel = (lote: T): boolean => {
    if (lote.userId !== identidade.titularUserId) return false;
    if (identidade.papel === "principal") return true;
    const fazendaId = lote.fazendaId != null ? Number(lote.fazendaId) : null;
    return fazendaId != null && autorizadas.has(fazendaId);
  };

  let lista = entrada.lotes.filter(visivel);
  if (entrada.consultaMysqlConcluida === false && identidade.papel === "principal") {
    const ids = new Set(lista.map((lote) => lote.id));
    for (const local of entrada.locais ?? []) {
      if (ids.has(local.id) || !visivel(local)) continue;
      lista.push(local);
    }
  }
  if (entrada.somenteAtivos) lista = lista.filter((lote) => lote.ativo === true);
  if (entrada.filtroFazendaId != null) {
    if (identidade.papel !== "principal" && !autorizadas.has(entrada.filtroFazendaId)) {
      return { ok: true, lotes: [], fazendasAutorizadas };
    }
    lista = lista.filter((lote) => Number(lote.fazendaId) === entrada.filtroFazendaId);
  }

  const hoje = entrada.hoje ?? new Date();
  const lotes = lista.map((lote) => {
    const pasto = lote.pastoAtualId != null ? pastoPorId.get(Number(lote.pastoAtualId)) : undefined;
    const fazendaDoLote = lote.fazendaId != null ? fazendaPorId.get(Number(lote.fazendaId)) : undefined;
    const pastoConsistente = !!pasto && (
      lote.fazendaId == null
        ? identidade.papel === "principal" && fazendaPorId.has(Number(pasto.fazendaId))
        : !!fazendaDoLote && Number(pasto.fazendaId) === Number(lote.fazendaId)
    );
    const fazendaDoPasto = pastoConsistente && pasto?.fazendaId != null
      ? fazendaPorId.get(Number(pasto.fazendaId))
      : undefined;
    return {
      ...lote,
      qtdAnimais: contagem.get(lote.id) ?? 0,
      pastoNome: pastoConsistente ? (pasto?.nome ?? null) : null,
      pastoCapacidade: pastoConsistente ? (pasto?.capacidade ?? null) : null,
      fazendaNome: fazendaDoPasto?.nome ?? null,
      diasNoPasto: lote.dataEntradaPasto ? diasEntre(lote.dataEntradaPasto, hoje) : null,
    };
  });
  return { ok: true, lotes, fazendasAutorizadas };
}

/** Consulta de um lote. Sem permissão geral recusa. Sem acesso ao id, responde como inexistente. */
export function resolverConsultaLote<T extends LoteListaMinimo>(
  entrada: Parameters<typeof comporListaLotes<T>>[0],
): { ok: true; lote: T; ficha: LoteEnriquecido<T> } | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "nao_encontrado" } {
  const lista = comporListaLotes(entrada);
  if (!lista.ok) return lista;
  const pedido = entrada.lotes[0]?.id ?? entrada.locais?.[0]?.id;
  const ficha = lista.lotes.find((item) => item.id === pedido);
  if (!ficha) return { ok: false, motivo: "nao_encontrado" };
  const lote = entrada.lotes.find((item) => item.id === pedido)
    ?? entrada.locais?.find((item) => item.id === pedido)
    ?? ficha;
  return { ok: true, lote, ficha };
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
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      const somenteAtivos = input?.somenteAtivos ?? false;
      try {
        const permissoes = identidade.papel === "principal"
          ? []
          : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
            eq(usuarioPermissoes.userId, identidade.id),
            eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
          ))).map((row) => row.permissao);
        const vinculos = identidade.papel === "principal"
          ? []
          : await db.select({
            userId: usuarioFazendas.userId,
            fazendaId: usuarioFazendas.fazendaId,
          }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
        const fazendasConta = await db.select({ id: fazendas.id, userId: fazendas.userId, nome: fazendas.nome })
          .from(fazendas).where(eq(fazendas.userId, identidade.titularUserId));
        const pastosConta = await db.select({
          id: pastos.id,
          userId: pastos.userId,
          fazendaId: pastos.fazendaId,
          nome: pastos.nome,
          capacidade: pastos.capacidade,
        }).from(pastos).where(eq(pastos.userId, identidade.titularUserId));
        const previa = comporListaLotes({
          identidade,
          permissoes,
          vinculos,
          fazendasDoTitular: fazendasConta,
          pastosDoTitular: pastosConta,
          lotes: [],
          consultaMysqlConcluida: true,
          somenteAtivos,
        });
        if (!previa.ok) {
          throw new TRPCError({
            code: previa.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
            message: previa.motivo === "sem_identidade"
              ? "Sessão inválida."
              : "Sem permissão para consultar os lotes.",
          });
        }
        if (identidade.papel !== "principal" && previa.fazendasAutorizadas.length === 0) return [];
        const conditions = [eq(lotes.userId, identidade.titularUserId)];
        if (somenteAtivos) conditions.push(eq(lotes.ativo, true));
        if (identidade.papel !== "principal") {
          conditions.push(inArray(lotes.fazendaId, previa.fazendasAutorizadas));
        }
        const lotesList = await db.select().from(lotes)
          .where(and(...conditions))
          .orderBy(desc(lotes.createdAt));
        const ids = lotesList.map((lote) => lote.id);
        const contagemPorLote = ids.length === 0 ? [] : (await db.select({
          loteId: animais.loteId,
          quantidade: sql<number>`COUNT(*)`,
        }).from(animais).where(and(
          eq(animais.userId, identidade.titularUserId),
          eq(animais.status, "ativo"),
          inArray(animais.loteId, ids),
        )).groupBy(animais.loteId)).flatMap((row) => (
          row.loteId == null ? [] : [{ loteId: Number(row.loteId), quantidade: Number(row.quantidade) }]
        ));
        const resultado = comporListaLotes({
          identidade,
          permissoes,
          vinculos,
          fazendasDoTitular: fazendasConta,
          pastosDoTitular: pastosConta,
          lotes: lotesList,
          contagemPorLote,
          consultaMysqlConcluida: true,
          somenteAtivos,
        });
        if (!resultado.ok) {
          throw new TRPCError({
            code: resultado.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
            message: resultado.motivo === "sem_identidade"
              ? "Sessão inválida."
              : "Sem permissão para consultar os lotes.",
          });
        }
        return resultado.lotes;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error;
        const locais = (await listLocalLotes(identidade.titularUserId))
          .filter((lote) => Number(lote.userId) === identidade.titularUserId);
        const fazendasLocais = (await listLocalFazendas(identidade.titularUserId))
          .filter((fazenda) => Number(fazenda.userId) === identidade.titularUserId);
        const pastosLocais = (await listLocalPastos(identidade.titularUserId))
          .filter((pasto) => Number(pasto.userId) === identidade.titularUserId);
        const animaisLocais = (await listLocalAnimais(identidade.titularUserId))
          .filter((animal) => Number(animal.userId) === identidade.titularUserId && animal.status === "ativo" && animal.loteId != null);
        const contagem = new Map<number, number>();
        for (const animal of animaisLocais) {
          const loteId = Number(animal.loteId);
          contagem.set(loteId, (contagem.get(loteId) ?? 0) + 1);
        }
        const resultado = comporListaLotes({
          identidade,
          permissoes: [],
          vinculos: [],
          fazendasDoTitular: fazendasLocais,
          pastosDoTitular: pastosLocais,
          lotes: [],
          locais,
          contagemPorLote: [...contagem.entries()].map(([loteId, quantidade]) => ({ loteId, quantidade })),
          consultaMysqlConcluida: false,
          somenteAtivos,
        });
        if (!resultado.ok) return [];
        return resultado.lotes;
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
        const resultado = await movimentarEEspelharLote(ioMovimentarLotePastoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async mover(userId, dados) {
            await moveLocalLoteToPasto(userId, dados);
          },
        });
        if (!resultado.ok) throw erroMovimentacaoLote(resultado);
        return { success: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof LoteMudouDuranteMovimentacao) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
        }
        throw error;
      }
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      const ausente = () => {
        throw new TRPCError({ code: "NOT_FOUND", message: "Lote não encontrado." });
      };
      try {
        const [candidato] = await db.select().from(lotes)
          .where(and(eq(lotes.id, input.id), eq(lotes.userId, identidade.titularUserId)))
          .limit(1);
        const permissoes = identidade.papel === "principal"
          ? []
          : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
            eq(usuarioPermissoes.userId, identidade.id),
            eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
          ))).map((row) => row.permissao);
        const vinculos = identidade.papel === "principal"
          ? []
          : await db.select({
            userId: usuarioFazendas.userId,
            fazendaId: usuarioFazendas.fazendaId,
          }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
        const fazendasConta = await db.select({ id: fazendas.id, userId: fazendas.userId, nome: fazendas.nome })
          .from(fazendas).where(eq(fazendas.userId, identidade.titularUserId));
        const pastosConta = await db.select({
          id: pastos.id,
          userId: pastos.userId,
          fazendaId: pastos.fazendaId,
          nome: pastos.nome,
          capacidade: pastos.capacidade,
        }).from(pastos).where(eq(pastos.userId, identidade.titularUserId));
        const resolvido = resolverConsultaLote({
          identidade,
          permissoes,
          vinculos,
          fazendasDoTitular: fazendasConta,
          pastosDoTitular: pastosConta,
          lotes: candidato ? [candidato] : [],
          consultaMysqlConcluida: true,
        });
        if (!resolvido.ok) {
          if (resolvido.motivo === "nao_encontrado") ausente();
          throw new TRPCError({
            code: resolvido.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
            message: resolvido.motivo === "sem_identidade"
              ? "Sessão inválida."
              : "Sem permissão para consultar os lotes.",
          });
        }
        return resolvido.lote;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error;
        const local = await getLocalLote(identidade.titularUserId, input.id);
        if (!local || Number(local.userId) !== identidade.titularUserId) ausente();
        const fazendasLocais = (await listLocalFazendas(identidade.titularUserId))
          .filter((fazenda) => Number(fazenda.userId) === identidade.titularUserId);
        const pastosLocais = (await listLocalPastos(identidade.titularUserId))
          .filter((pasto) => Number(pasto.userId) === identidade.titularUserId);
        const animaisLocais = (await listLocalAnimais(identidade.titularUserId))
          .filter((animal) => Number(animal.userId) === identidade.titularUserId && animal.status === "ativo" && animal.loteId === local.id);
        const resolvido = resolverConsultaLote({
          identidade,
          permissoes: [],
          vinculos: [],
          fazendasDoTitular: fazendasLocais,
          pastosDoTitular: pastosLocais,
          lotes: [],
          locais: [local],
          contagemPorLote: [{ loteId: local.id, quantidade: animaisLocais.length }],
          consultaMysqlConcluida: false,
        });
        if (!resolvido.ok) ausente();
        return resolvido.ficha;
      }
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
      pastoAtualId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await cadastrarEEspelharLote(ioCadastroLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async criar(userId, row) {
            await createLocalLote(userId, row);
          },
        });
        if (!resultado.ok) throw erroCadastroLote(resultado);
        return { success: true as const, id: resultado.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
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
      dataEntradaPasto: z.string().nullable().optional(),
      fazendaId: z.number().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await editarEEspelharLote(ioEditarLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input,
        }, {
          async atualizar(userId, id, patch) {
            await updateLocalLote(userId, id, {
              ...(typeof patch.nome === "string" ? { nome: patch.nome } : {}),
              ...(patch.sigla === null || typeof patch.sigla === "string" ? { sigla: patch.sigla } : {}),
              ...(typeof patch.dataCriacao === "string" ? { dataCriacao: patch.dataCriacao } : {}),
              ...(typeof patch.descricao === "string" ? { descricao: patch.descricao } : {}),
              ...(typeof patch.localizacao === "string" ? { localizacao: patch.localizacao } : {}),
              ...(typeof patch.capacidade === "number" ? { capacidade: patch.capacidade } : {}),
            });
          },
        });
        if (!resultado.ok) throw erroEdicaoLote(resultado);
        return { success: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Banco de dados indisponível.",
          });
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
      const executorNome = ctx.user.name || ctx.user.email || "Usuário";
      try {
        const resultado = await incluirEEspelharAnimais(ioAnimaisLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input,
        }, {
          async incluir(userId, dados) {
            await incluirAnimaisLocalLote(userId, { loteId: dados.loteId, animalIds: dados.animalIds }, {
              usuarioNome: dados.usuarioNome,
              dataMovimentacao: dados.dataMovimentacao,
            });
          },
        });
        if (!resultado.ok) throw erroAnimaisLote(resultado);
        return { success: true as const, count: resultado.count };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DeadlockMovimentacaoAnimais) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  movimentarAnimais: protectedProcedure
    .input(z.object({
      /** Obrigatório no Editar Lote; omitido no Manejo Pontual (origem vem do animal). */
      loteOrigemId: z.number().optional(),
      loteDestinoId: z.number(),
      animalIds: z.array(z.number()).min(1),
      dataMovimentacao: z.string(),
      responsavel: z.string().max(200).optional(),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const executorNome = ctx.user.name || ctx.user.email || "Usuário";
      try {
        const resultado = await movimentarEEspelharAnimais(ioAnimaisLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input,
        }, {
          async mover(userId, dados) {
            await movimentarAnimaisLocalLote(userId, {
              loteOrigemId: dados.loteOrigemId,
              loteDestinoId: dados.loteDestinoId,
              animalIds: dados.animalIds,
              dataMovimentacao: dados.dataMovimentacao,
              responsavel: dados.responsavel,
              observacoes: dados.observacoes,
            }, dados.usuarioNome);
          },
        });
        if (!resultado.ok) throw erroAnimaisLote(resultado);
        return { success: true as const, count: resultado.count, loteDestinoNome: resultado.loteDestinoNome };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DeadlockMovimentacaoAnimais) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
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
      const executorNome = ctx.user.name || ctx.user.email || "Usuário";
      try {
        const resultado = await alocarEEspelharAnimais(ioAnimaisLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input,
        }, {
          async mover(userId, dados) {
            await movimentarAnimaisLocalLote(userId, {
              loteDestinoId: dados.loteDestinoId,
              animalIds: dados.animalIds,
              dataMovimentacao: dados.dataMovimentacao,
            }, dados.usuarioNome);
          },
        });
        if (!resultado.ok) throw erroAnimaisLote(resultado);
        return { success: true as const, count: resultado.count, loteDestinoNome: resultado.loteDestinoNome };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DeadlockMovimentacaoAnimais) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
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

      const loteIds = [...new Set(rows.flatMap(r => [r.loteOrigemId, r.loteDestinoId].filter((id): id is number => id != null && id > 0)))];
      const loteMap = new Map<number, string>();
      if (loteIds.length) {
        const lotesRows = await db.select({ id: lotes.id, nome: lotes.nome })
          .from(lotes)
          .where(inArray(lotes.id, loteIds));
        lotesRows.forEach(l => loteMap.set(l.id, l.nome));
      }

      return rows.map(r => ({
        ...r,
        loteOrigemNome: r.loteOrigemId != null ? (loteMap.get(r.loteOrigemId) ?? null) : "Sem lote",
        loteDestinoNome: loteMap.get(r.loteDestinoId) ?? null,
      }));
    }),

  removerAnimais: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      animalIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const executorNome = ctx.user.name || ctx.user.email || "Usuário";
      try {
        const resultado = await retirarEEspelharAnimais(ioAnimaisLoteDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome,
          input,
        }, {
          async retirar(userId, animalIds) {
            await espelharRetiradaAnimaisLocal(userId, animalIds);
          },
        });
        if (!resultado.ok) throw erroAnimaisLote(resultado);
        return { success: true as const, count: resultado.count };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof DeadlockMovimentacaoAnimais) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
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
          .select({
            registro: saudeRegistros,
            brincoVisual: animais.brinco,
            rfid: animais.brincoEletronico,
          })
          .from(saudeRegistros)
          .leftJoin(
            animais,
            and(eq(animais.id, saudeRegistros.animalId), eq(animais.userId, ctx.user.id)),
          )
          .where(and(...conditions))
          .orderBy(desc(saudeRegistros.createdAt));
        if (rows.length > 0) {
          return rows.map((row) => ({
            ...row.registro,
            brincoVisual: String(row.brincoVisual ?? "").trim() || null,
            rfid: String(row.rfid ?? "").trim() || null,
          }));
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const [locais, animaisLocais] = await Promise.all([
        listLocalSaudeRegistros(ctx.user.id, input?.animalId),
        listLocalAnimais(ctx.user.id),
      ]);
      return anexarIdentificacaoAnimalSaude(locais, animaisLocais);
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      fazendaId: z.number().int().positive(),
      tipo: z.string().min(1).max(50),
      descricao: z.string().max(2000).optional(),
      /** Snapshot do nome; preenchido no servidor a partir do estoque quando há estoqueId. */
      medicamento: z.string().max(200).optional(),
      dosagem: z.string().max(100).optional(),
      doseValor: z.string().max(40).optional(),
      doseUnidade: z.string().max(20).optional(),
      viaAplicacao: z.string().max(80).optional(),
      estoqueId: z.number().int().positive().optional(),
      veterinario: z.string().optional(),
      dataRegistro: z.string(),
      proximaData: z.string().optional(),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await lancarSanidadeEEspelhar(ioSanidadeDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome: ctx.user.name,
          input,
        }, {
          async lancar(userId, dados) {
            await createLocalSaudeRegistro(userId, dados as {
              animalId: number;
              tipo: string;
              dataRegistro: string;
            });
          },
        });
        if (!resultado.ok) throw erroLancamentoSanidade(resultado);
        return { success: true as const, id: resultado.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoSanidadeEstoque) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      motivo: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await estornarSanidadeAutorizado(ioSanidadeDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome: ctx.user.name,
          hojeISO: hojeISODateLocal(),
          input,
        });
        if (!resultado.ok) throw erroEstornoSanidade(resultado);
        return { success: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoSanidadeEstoque) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  registrarCastracao: protectedProcedure
    .input(z.object({
      fazendaId: z.number().int().positive(),
      animalId: z.number().int().positive(),
      dataCastracao: z.string().min(1).max(10),
      metodo: z.enum(["cirurgica", "burdizzo", "elastrador", "outro"]),
      descricaoMetodo: z.string().max(2000).optional(),
      observacoes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await castrarEEspelharAnimal(ioManejoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          executorNome: ctx.user.name,
          input,
        }, {
          async castrar(userId, dados) {
            await createLocalSaudeRegistro(userId, dados);
            await updateLocalAnimal(userId, dados.animalId, { castrado: true });
          },
        });
        if (!resultado.ok) throw erroCastracao(resultado);
        return { success: true as const, id: resultado.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoManejoAnimal) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),
});

// ─── REPRODUCAO ROUTER ────────────────────────────────────────────────────────
const reproPipelineConfigInputSchema = z.object({
  maxTentativasIatfAntesMonta: z.number().int().min(1).max(10).optional(),
  diasParaDgAposInseminacao: z.number().int().min(15).max(120).optional(),
  diasParaDgAposMonta: z.number().int().min(30).max(180).optional(),
  sugerirDescarteAposMontaVazia: z.boolean().optional(),
});

const reproducaoRouter = router({
  getPipelineConfig: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const resultado = await lerPipelineAutorizado(ioConsultaReproducaoDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        fazendaId: input.fazendaId,
      });
      if (!resultado.ok) throw erroConsultaReproducao(resultado);
      return resultado.config;
    }),

  updatePipelineConfig: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        config: reproPipelineConfigInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resultado = await gravarPipelineAutorizado(ioConsultaReproducaoDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        fazendaId: input.fazendaId,
        config: input.config,
      });
      if (!resultado.ok) throw erroConsultaReproducao(resultado);
      try {
        await updateLocalFazenda(resultado.titularUserId, input.fazendaId, {
          configReproPipeline: resultado.serializado,
        });
      } catch (mirrorError) {
        console.warn("[repro.updatePipelineConfig] Espelho local não gravado:", mirrorError);
      }
      return { success: true as const, config: resultado.config };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const resultado = await listarReproducaoAutorizada(ioConsultaReproducaoDrizzle(), {
      executorId: ctx.user.id,
      sessionVersionDaSessao: ctx.user.sessionVersion,
    });
    if (!resultado.ok) throw erroConsultaReproducao(resultado);
    return enrichReproducaoListPartoCriasDb(resultado.titularUserId, resultado.registros);
  }),

  create: protectedProcedure
    .input(z.object({
      /** Animal principal do registro (preferencial). */
      animalId: z.number().optional(),
      /** @deprecated Use `animalId`. Mantido para compatibilidade; persiste na coluna `femeaId`. */
      femeaId: z.number().optional(),
      /** Reprodutor em eventos femininos; omitir quando o principal já é o macho. */
      machoId: z.number().optional(),
      tipo: z.string(),
      dataCobertura: z.string(),
      dataPrevistoParto: z.string().optional(),
      resultado: z.string().optional(),
      reprodutorSemen: z.string().optional(),
      descricaoResultadoOutro: z.string().optional(),
      responsavel: z.string().optional(),
      partidaSemen: z.string().max(200).optional(),
      semenPartidaId: z.number().int().positive().optional(),
      custoDoseSemen: z.number().finite().optional(),
      centralOrigem: z.string().max(150).optional(),
      inseminador: z.string().max(200).optional(),
      ecc: z.number().min(1).max(5).optional(),
      observacoes: z.string().optional(),
      /** UUID da operação. Obrigatório na estação, na cobertura em grupo e na inseminação que consome dose. */
      operacaoId: z.string().max(64).optional(),
      fazendaId: z.number().optional(),
      coberturaSelecaoModo: z.enum(["individual", "lote"]).optional(),
      coberturaMatrizIds: z.array(z.number()).optional(),
      coberturaLoteId: z.number().optional(),
      /** Matrizes cujo espelho ativo será anulado antes de criar o substituto (curral). */
      substituirEspelhosMatrizIds: z.array(z.number().int().positive()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const animalId = resolveReproducaoAnimalId(input);
      if (!animalId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o animal do registro reprodutivo (animalId).",
        });
      }

      const caminhoSemen =
        shouldConsumirEstoqueSemenNaInseminacao(input.semenPartidaId) &&
        input.tipo.trim() === "Inseminação" &&
        !(input.coberturaMatrizIds?.length) &&
        input.coberturaLoteId == null &&
        !(input.substituirEspelhosMatrizIds?.length);
      if (caminhoSemen) {
        try {
          const resultado = await lancarInseminacaoSemenEEspelhar(ioInseminacaoSemenDrizzle(), {
            executorId: ctx.user.id,
            sessionVersionDaSessao: ctx.user.sessionVersion,
            executorNome: ctx.user.name,
            input: { ...input, animalId, semenPartidaId: input.semenPartidaId! },
          }, {
            async inseminar(userId, dados) {
              await createLocalReproducaoRegistro(userId, dados);
            },
          });
          if (!resultado.ok) throw erroInseminacaoSemen(resultado);
          return {
            success: true as const,
            id: resultado.id,
            movimentacaoId: resultado.movimentacaoId,
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          if (error instanceof ConflitoInseminacaoSemen) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          if (isDatabaseUnavailable(error)) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
          }
          throw error;
        }
      }

      const caminhoProtegido =
        !shouldConsumirEstoqueSemenNaInseminacao(input.semenPartidaId) &&
        !(input.coberturaMatrizIds?.length) &&
        input.coberturaLoteId == null &&
        !(input.substituirEspelhosMatrizIds?.length) &&
        input.tipo.trim() !== "Estação de monta";
      if (caminhoProtegido) {
        try {
          const resultado = await registrarReproducaoSimplesEEspelhar(ioManejoDrizzle(), {
            executorId: ctx.user.id,
            sessionVersionDaSessao: ctx.user.sessionVersion,
            executorNome: ctx.user.name,
            input: { ...input, animalId },
          }, {
            async reproduzir(userId, dados) {
              await createLocalReproducaoRegistro(userId, dados);
            },
          });
          if (!(resultado.ok === false && resultado.motivo === "caminho_matriz")) {
            if (!resultado.ok) throw erroReproducaoSimples(resultado);
            return {
              success: true as const,
              id: resultado.id,
              espelhosMatriz: 0,
              matrizesIgnoradas: 0,
            };
          }
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          if (error instanceof ConflitoManejoAnimal) {
            throw new TRPCError({ code: "CONFLICT", message: error.message });
          }
          if (isDatabaseUnavailable(error)) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
          }
          throw error;
        }
      }

      const coletivo = await registrarReproducaoColetivaAutorizada(ioRegistrarReproducaoColetivaDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        input: { ...input, animalId },
      });
      if (!coletivo.ok) throw erroReproducaoColetiva(coletivo);
      if (!coletivo.repetida) {
        try {
          await createLocalReproducaoRegistro(coletivo.titularUserId, coletivo.principal);
          for (const copia of coletivo.copias) {
            await createLocalReproducaoRegistro(coletivo.titularUserId, copia);
          }
        } catch (error) {
          console.warn("[reproducao.create] espelho fora do MySQL", error);
        }
      }
      return {
        success: true as const,
        id: coletivo.id,
        espelhosMatriz: coletivo.espelhosMatriz,
        matrizesIgnoradas: coletivo.matrizesIgnoradas,
        repetida: coletivo.repetida,
      };

    }),

  registrarPartoComCrias: protectedProcedure
    .input(registrarPartoComCriasInputSchema)
    .mutation(async ({ ctx, input }) => {
      const resultado = await registrarPartoAutorizado(ioRegistrarPartoDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        input,
      });
      if (!resultado.ok) throw erroRegistrarParto(resultado);
      for (const cria of resultado.crias) {
        try {
          await updateLocalAnimal(resultado.titularUserId, cria.animalId, {
            brinco: cria.brinco,
            fazendaId: cria.fazendaId,
            loteId: cria.loteDestinoId,
            pastoId: cria.pastoId,
            maeId: input.femeaId,
            paiId: resultado.paiId,
            status: "ativo",
          });
          if (cria.loteDestinoId != null) {
            await registrarLocalEntradaInicialLote({
              userId: resultado.titularUserId,
              animalId: cria.animalId,
              loteDestinoId: cria.loteDestinoId,
              pastoOrigemId: null,
              pastoDestinoId: cria.pastoId,
              fazendaId: cria.fazendaId,
              dataMovimentacao: input.dataParto.slice(0, 10),
              usuarioNome: input.responsavel?.trim() || "Usuário",
            });
          }
        } catch (error) {
          console.warn("[reproducao.registrarPartoComCrias] espelho fora do MySQL", error);
        }
      }
      return {
        success: true as const,
        partoRegistroId: resultado.partoRegistroId,
        crias: resultado.crias.map((cria) => ({
          animalId: cria.animalId,
          ordem: cria.ordem,
          pesagemId: cria.pesagemId,
        })),
        isNatimorto: resultado.isNatimorto,
      };
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
      const resultado = await editarReproducaoAutorizada(ioEditarReproducaoDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        registroId: input.id,
        tipo: input.tipo,
        dataCobertura: input.dataCobertura,
        dataPrevistoParto: input.dataPrevistoParto,
        resultado: input.resultado,
        reprodutorSemen: input.reprodutorSemen,
        responsavel: input.responsavel,
        observacoes: input.observacoes,
      });
      if (!resultado.ok) throw erroEditarReproducao(resultado);
      try {
        await updateLocalReproducaoRegistro(resultado.titularUserId, input.id, resultado.espelho);
      } catch (error) {
        console.warn("[reproducao.update] espelho fora do MySQL", error);
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const resultado = await excluirReproducaoAutorizada(ioEditarReproducaoDrizzle(), {
        executorId: ctx.user.id,
        sessionVersionDaSessao: ctx.user.sessionVersion,
        registroId: input.id,
      });
      if (!resultado.ok) throw erroEditarReproducao(resultado);
      try {
        await deleteLocalReproducaoRegistro(resultado.titularUserId, input.id);
      } catch (error) {
        console.warn("[reproducao.delete] espelho fora do MySQL", error);
      }
      return { success: true };
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
  fornecedor: z.string().max(200).optional().nullable(),
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
      fornecedor: z.string().max(200).optional().nullable(),
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
        fornecedor:
          !interno && input.fornecedor?.trim() ? input.fornecedor.trim() : null,
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
  origem: z.enum(["estoque", "oficina"]).optional().nullable(),
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
  prestadorPessoaId: z.number().int().positive().optional().nullable(),
  tipoExecucao: z.enum(["interna", "externa"]).optional().nullable(),
  valorMaoObra: z.number().min(0).optional(),
  observacoes: z.string().optional(),
  pecas: z.array(pecaInput).optional(),
});

/** Calcula valor de peças, mão de obra e total geral. */
function prepararPecasManutencaoDoInput(
  pecas: Array<{
    nome: string;
    quantidade: number;
    valorUnitario?: number;
    estoqueId?: number | null;
    origem?: string | null;
  }> | undefined,
  tipoExecucao: string | null | undefined,
): {
  pecasEstoqueInput: Array<{
    nome: string;
    quantidade: number;
    valorUnitario?: number;
    estoqueId?: number | null;
  }>;
  pecasOficina: PecaOficinaNormalizada[];
} {
  const classificadas = classificarPecasManutencao(pecas);
  if (classificadas.semOrigemSemEstoque.length > 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_PECA_ESTOQUE_OBRIGATORIA });
  }
  const oficinaNaExecucao = validarPecasOficinaNaExecucao(tipoExecucao, classificadas.oficina);
  if (!oficinaNaExecucao.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: oficinaNaExecucao.message });
  }
  const pecasOficina: PecaOficinaNormalizada[] = [];
  for (const peca of classificadas.oficina) {
    const normalizada = validarPecaOficina(peca);
    if (!normalizada.ok) {
      throw new TRPCError({ code: "BAD_REQUEST", message: normalizada.message });
    }
    pecasOficina.push(normalizada.peca);
  }
  return { pecasEstoqueInput: classificadas.estoque, pecasOficina };
}

function valoresOsDosCustos(custos: ReturnType<typeof calcularCustosManutencaoCompletos>) {
  return {
    valorMaoObra: custos.valorMaoObra.toFixed(2),
    valorPecas: custos.valorPecas.toFixed(2),
    valorPecasOficina: custos.valorPecasOficina.toFixed(2),
    valorCobradoOficina: custos.valorCobradoOficina.toFixed(2),
    valorTotal: custos.valorTotal.toFixed(2),
    custo: custos.valorTotal.toFixed(2),
  };
}

function valorMaoObraOficialDaOs(
  tipoExecucao: string | null | undefined,
  valorMaoObra: number | undefined,
): number {
  const decisao = resolverValorMaoObraManutencao({ tipoExecucao, valorMaoObra });
  if (!decisao.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: decisao.message });
  }
  return decisao.valorMaoObra;
}

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

export const MSG_MANUT_USO_IMEDIATO =
  "Este produto é de uso imediato e não pode ser consumido na manutenção. Cadastre-o como estocável em Insumos.";

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
    valorTotalEstoque?: string | number | null;
    capitalInicializadoEm?: Date | string | null;
    controlarSaldo: boolean | null;
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
        valorTotalEstoque: estoque.valorTotalEstoque,
        capitalInicializadoEm: estoque.capitalInicializadoEm,
        controlarSaldo: estoque.controlarSaldo,
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
      controlarSaldo: local.controlarSaldo,
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
    if (!produtoControlaSaldo(item.controlarSaldo)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: MSG_MANUT_USO_IMEDIATO,
      });
    }
    const custoCongelado = custoCongeladoPorEstoque?.get(estoqueId);
    const custo =
      custoCongelado != null && custoCongelado > 0
        ? custoCongelado
        : (custoMedioFonteTecnica(item) ?? parseCustoMedio(item.valorUnitario));
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
        : (custoMedioFonteTecnica(item) ?? parseCustoMedio(item.valorUnitario))!;
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

async function assertPecasSemCapitalInicializado(estoqueIds: number[]) {
  const ids = [...new Set(estoqueIds.filter(id => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return;
  const rows = await db
    .select({ capitalInicializadoEm: estoque.capitalInicializadoEm })
    .from(estoque)
    .where(inArray(estoque.id, ids));
  if (rows.some(r => capitalEstaInicializado(r))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_CAPITAL_REVERSAO });
  }
}

async function aplicarBaixaEstoquePecasManutencao(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  pecasNovas: PecaManutencaoResolvida[],
  pecasAntigas?: { estoqueId: number | null; quantidade: string | number }[],
): Promise<{ pendenteLocal: Map<number, number>; snapshots: Map<number, string | null> }> {
  const deltas = montarDeltasBaixaEstoque(pecasNovas, pecasAntigas);
  const pendenteLocal = new Map<number, number>();
  const snapshots = new Map<number, string | null>();

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
        const op = delta > 0
          ? { tipoOp: "saida" as const, quantidade: delta }
          : { tipoOp: "entrada" as const, quantidade: Math.abs(delta), valorInformado: 0, tipoMov: "Ajuste de entrada" };
        const patch = await aplicarPatchSaldoNoTx(executorPatchDrizzle(tx), estoqueId, op);
        snapshots.set(estoqueId, patch.valorEstoqueMovimentado);
        appliedOnDb = true;
      }
    } catch (error) {
      if (error instanceof EstoqueCapitalError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      if (error instanceof TRPCError) throw error;
      if (!isDatabaseUnavailable(error)) throw error;
    }
    if (!appliedOnDb) pendenteLocal.set(estoqueId, delta);
  }

  return { pendenteLocal, snapshots };
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

function manutencaoEstornada(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "estornado";
}

function manutencaoTemConsumoEstoque(
  pecas: { estoqueId?: number | null; quantidade?: string | number | null }[],
): boolean {
  return pecas.some(p => {
    if (p.estoqueId == null || Number(p.estoqueId) <= 0) return false;
    const q = parseFloat(String(p.quantidade ?? 0));
    return Number.isFinite(q) && q > 0;
  });
}

function throwSeErroManutencaoEstoque(error: unknown): never {
  if (error instanceof ManutencaoEstoqueError || error instanceof EstoqueCapitalError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  if (error instanceof TRPCError) throw error;
  if (isDatabaseUnavailable(error)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
  }
  throw error;
}

async function identificarFazendaMaquinaDoUsuario(
  userId: number,
  maquinaId: number,
) {
  const [maq] = await db
    .select({
      id: maquinas.id,
      userId: maquinas.userId,
      fazendaId: maquinas.fazendaId,
    })
    .from(maquinas)
    .where(eq(maquinas.id, maquinaId))
    .limit(1);
  const identificacao = identificarFazendaMaquina({
    userId,
    maquina: maq ?? null,
  });
  if (!identificacao.ok) return identificacao;
  const [fazenda] = await db
    .select({ id: fazendas.id, userId: fazendas.userId })
    .from(fazendas)
    .where(eq(fazendas.id, identificacao.fazendaId))
    .limit(1);
  return confirmarFazendaDoUsuario({
    userId,
    fazendaId: identificacao.fazendaId,
    fazenda: fazenda ?? null,
  });
}

async function resolverFazendaPersistenciaOs(
  userId: number,
  maquinaId: number,
  temPecasEstoque: boolean,
) {
  const identificacao = await identificarFazendaMaquinaDoUsuario(userId, maquinaId);
  if (
    !identificacao.ok
    && (identificacao.motivo === "maquina_ausente" || identificacao.motivo === "maquina_outro_usuario")
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: identificacao.message });
  }
  const persistencia = decidirFazendaPersistenciaOs({ temPecasEstoque, identificacao });
  if (!persistencia.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: persistencia.message });
  }
  return persistencia;
}

async function resolverPrestadorPessoaOs(
  userId: number,
  tipoExecucao: string | null | undefined,
  prestadorPessoaId: number | null | undefined,
) {
  const pessoaId = lerPrestadorPessoaId(prestadorPessoaId);
  let pessoa: {
    id: number;
    userId: number;
    tipo: string;
    ativo: boolean | null;
  } | null = null;
  if (pessoaId != null) {
    const [row] = await db
      .select({
        id: pessoas.id,
        userId: pessoas.userId,
        tipo: pessoas.tipo,
        ativo: pessoas.ativo,
      })
      .from(pessoas)
      .where(eq(pessoas.id, pessoaId))
      .limit(1);
    pessoa = row
      ? { ...row, ativo: row.ativo ?? null }
      : null;
  }
  const validado = validarPrestadorPessoaParaOs({
    userId,
    tipoExecucao,
    prestadorPessoaId: pessoaId,
    pessoa,
  });
  if (!validado.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: validado.message });
  }
  return validado.prestadorPessoaId;
}

async function estoquesTemCapitalInicializado(estoqueIds: number[]): Promise<boolean> {
  const ids = [...new Set(estoqueIds.filter(id => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return false;
  const rows = await db
    .select({ capitalInicializadoEm: estoque.capitalInicializadoEm })
    .from(estoque)
    .where(inArray(estoque.id, ids));
  return rows.some(r => capitalEstaInicializado(r));
}

async function mapConsumiuEstoquePorManutencao(
  userId: number,
  rows: { id: number; pecas?: { estoqueId?: number | null; quantidade?: string | number | null }[] }[],
): Promise<Map<number, boolean>> {
  const result = new Map<number, boolean>();
  if (!rows.length) return result;

  const pecasMap = new Map<
    number,
    { estoqueId?: number | null; quantidade?: string | number | null }[]
  >();
  for (const row of rows) {
    if (Array.isArray(row.pecas) && row.pecas.length > 0) {
      pecasMap.set(row.id, row.pecas);
    }
  }

  const missing = rows.map(r => r.id).filter(id => !pecasMap.has(id));
  if (missing.length > 0) {
    try {
      const dbPecas = await db
        .select({
          manutencaoId: manutencaoPecas.manutencaoId,
          estoqueId: manutencaoPecas.estoqueId,
          quantidade: manutencaoPecas.quantidade,
        })
        .from(manutencaoPecas)
        .where(inArray(manutencaoPecas.manutencaoId, missing));
      for (const p of dbPecas) {
        const arr = pecasMap.get(p.manutencaoId) ?? [];
        arr.push({ estoqueId: p.estoqueId, quantidade: p.quantidade });
        pecasMap.set(p.manutencaoId, arr);
      }
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      for (const id of missing) {
        const local = await getLocalManutencao(userId, id);
        if (local?.pecas?.length) pecasMap.set(id, local.pecas);
      }
    }
  }

  for (const row of rows) {
    result.set(row.id, manutencaoTemConsumoEstoque(pecasMap.get(row.id) ?? []));
  }
  return result;
}

async function enriquecerManutencoesListagem<T extends { id: number; pecas?: unknown[] }>(
  userId: number,
  rows: T[],
): Promise<(T & { consumiuEstoque: boolean })[]> {
  const flags = await mapConsumiuEstoquePorManutencao(userId, rows);
  return rows.map(r => ({ ...r, consumiuEstoque: flags.get(r.id) ?? false }));
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
          .select(colunasManutencaoSemChaveOperacao())
          .from(manutencoes)
          .where(and(...conditions))
          .orderBy(desc(manutencoes.createdAt))) as typeof dbRows;
        dbOk = true;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const localRows = await listLocalManutencoes(ctx.user.id, { maquinaId: input?.maquinaId });
      if (!dbOk) {
        return localRows.map(r => ({
          ...r,
          consumiuEstoque: manutencaoTemConsumoEstoque(r.pecas ?? []),
        }));
      }
      const merged = mergeManutencoesDbLocal(dbRows, localRows);
      return enriquecerManutencoesListagem(ctx.user.id, merged);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      let dbRegistro: (typeof manutencoes.$inferSelect & { pecas: unknown[] }) | null = null;
      try {
        const [registro] = await db
          .select(colunasManutencaoSemChaveOperacao())
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
      const valorMaoObraOficial = valorMaoObraOficialDaOs(rest.tipoExecucao, valorMaoObra);
      const { pecasEstoqueInput, pecasOficina } = prepararPecasManutencaoDoInput(
        pecas,
        rest.tipoExecucao,
      );
      const pecasResolvidas = await resolverPecasComCustoMedioEstoque(pecasEstoqueInput);
      const custos = calcularCustosManutencaoCompletos({
        pecasEstoque: pecasResolvidas,
        pecasOficina,
        valorMaoObra: valorMaoObraOficial,
      });
      const totaisOs = valoresOsDosCustos(custos);
      const pecasPayload = [
        ...pecasLocaisFromResolvidas(pecasResolvidas).map(p => ({
          ...p,
          origem: MANUT_PECA_ORIGEM_ESTOQUE,
        })),
        ...pecasOficina.map(p => ({
          estoqueId: null,
          nome: p.nome,
          quantidade: p.quantidade.toFixed(2),
          valorUnitario: p.valorUnitario.toFixed(2),
          valorTotal: p.valorTotal.toFixed(2),
          origem: MANUT_PECA_ORIGEM_OFICINA,
        })),
      ];

      try {
        const prestadorPessoaId = await resolverPrestadorPessoaOs(
          ctx.user.id,
          rest.tipoExecucao,
          rest.prestadorPessoaId,
        );
        const persistencia = await resolverFazendaPersistenciaOs(
          ctx.user.id,
          rest.maquinaId,
          pecasResolvidas.length > 0,
        );
        const persistido = await persistirManutencaoCompletaMysql({
          userId: ctx.user.id,
          registradoPor: ctx.user.name?.trim() || `user-${ctx.user.id}`,
          maquinaId: rest.maquinaId,
          fazendaId: persistencia.fazendaId,
          tipo: rest.tipo,
          descricao: rest.descricao,
          data,
          horimetro: rest.horimetro,
          proximaManutencao: proximaManutencao || undefined,
          prestadorNome: rest.prestadorNome,
          prestadorContato: rest.prestadorContato,
          prestadorPessoaId,
          valorMaoObra: custos.valorMaoObra,
          observacoes: rest.observacoes,
          pecas: pecasResolvidas,
          pecasOficina,
          tipoExecucao: rest.tipoExecucao,
        });
        return { success: true, id: persistido.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ManutencaoEstoqueError || error instanceof EstoqueCapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (!isDatabaseUnavailable(error)) throw error;
        if (pecasResolvidas.length > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
        }
        const created = await createLocalManutencao(ctx.user.id, {
          ...rest,
          data,
          status: "concluida",
          proximaManutencao: proximaManutencao || undefined,
          prestadorPessoaId:
            lerPrestadorPessoaId(rest.tipoExecucao === "externa" ? rest.prestadorPessoaId : null),
          ...totaisOs,
          pecas: pecasPayload,
        });
        return { success: true, id: created.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(manutencaoBaseInput.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, data, proximaManutencao, pecas, valorMaoObra, ...rest } = input;
      const valorMaoObraOficial = valorMaoObraOficialDaOs(rest.tipoExecucao, valorMaoObra);

      let anterior: {
        maquinaId: number;
        status?: string | null;
        valorPecas?: string | number | null;
        valorPecasOficina?: string | number | null;
      } | null = null;
      let pecasAntigas: {
        estoqueId: number | null;
        quantidade: string | number;
        valorUnitario?: string | number | null;
        estoqueMovimentacaoId?: number | null;
        origem?: string | null;
      }[] = [];
      let fromLocal = false;

      try {
        const [row] = await db
          .select({
            maquinaId: manutencoes.maquinaId,
            status: manutencoes.status,
            valorPecas: manutencoes.valorPecas,
            valorPecasOficina: manutencoes.valorPecasOficina,
          })
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
              estoqueMovimentacaoId: manutencaoPecas.estoqueMovimentacaoId,
              origem: manutencaoPecas.origem,
            })
            .from(manutencaoPecas)
            .where(eq(manutencaoPecas.manutencaoId, id));
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        if (manutencaoTemConsumoEstoque(pecas ?? []) || (pecas ?? []).some(p => p.estoqueId != null)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
        }
        fromLocal = true;
        const local = await getLocalManutencao(ctx.user.id, id);
        if (local) {
          anterior = { maquinaId: Number(local.maquinaId), status: local.status ?? null };
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
        if (manutencaoTemConsumoEstoque(local.pecas ?? []) || manutencaoTemConsumoEstoque(pecas ?? [])) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
        }
        fromLocal = true;
        anterior = { maquinaId: Number(local.maquinaId), status: local.status ?? null };
        pecasAntigas = (local.pecas ?? []).map(p => ({
          estoqueId: p.estoqueId ?? null,
          quantidade: p.quantidade,
          valorUnitario: p.valorUnitario,
        }));
      }

      if (manutencaoEstornada(anterior.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Manutenção estornada não pode ser editada.",
        });
      }

      await assertMaquinaAtivaParaOperacao(ctx.user.id, rest.maquinaId, {
        allowSameInactiveId: anterior.maquinaId,
      });

      const { pecasEstoqueInput, pecasOficina } = prepararPecasManutencaoDoInput(
        pecas,
        rest.tipoExecucao,
      );

      const temEstoqueAntigo = manutencaoTemConsumoEstoque(pecasAntigas);
      const patrimonializada = pecasAntigas.some(pecaManutencaoTemVinculo);
      if (patrimonializada || !temEstoqueAntigo) {
        if (fromLocal) {
          if (temEstoqueAntigo) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
          }
          const custosLocal = calcularCustosManutencaoCompletos({
            pecasEstoque: [],
            pecasOficina,
            valorMaoObra: valorMaoObraOficial,
          });
          await updateLocalManutencao(ctx.user.id, id, {
            ...rest,
            data,
            proximaManutencao: proximaManutencao || null,
            prestadorNome: rest.prestadorNome ?? null,
            prestadorContato: rest.prestadorContato ?? null,
            prestadorPessoaId: rest.prestadorPessoaId ?? null,
            descricao: rest.descricao ?? null,
            ...valoresOsDosCustos(custosLocal),
            pecas: pecasOficina.map(p => ({
              estoqueId: null as number | null,
              nome: p.nome,
              quantidade: p.quantidade.toFixed(2),
              valorUnitario: p.valorUnitario.toFixed(2),
              valorTotal: p.valorTotal.toFixed(2),
              origem: MANUT_PECA_ORIGEM_OFICINA,
            })),
          });
          return { success: true, localFallback: true };
        }
        try {
          const prestadorPessoaId = await resolverPrestadorPessoaOs(
            ctx.user.id,
            rest.tipoExecucao,
            rest.prestadorPessoaId,
          );
          await editarPecasOficinaMysql({
            userId: ctx.user.id,
            id,
            tipoExecucao: rest.tipoExecucao,
            valorMaoObra: valorMaoObraOficial,
            pecasOficina,
            pecasEstoqueInput,
            cabecalho: {
              maquinaId: rest.maquinaId,
              tipo: rest.tipo,
              descricao: rest.descricao ?? null,
              data,
              horimetro: rest.horimetro ?? null,
              proximaManutencao: proximaManutencao || null,
              prestadorNome: rest.prestadorNome ?? null,
              prestadorContato: rest.prestadorContato ?? null,
              prestadorPessoaId,
              observacoes: rest.observacoes ?? null,
              tipoExecucao: rest.tipoExecucao ?? null,
            },
          });
          return { success: true };
        } catch (error) {
          throwSeErroManutencaoEstoque(error);
        }
      }

      await assertPecasSemCapitalInicializado([
        ...pecasAntigas.map(p => Number(p.estoqueId)),
        ...pecasEstoqueInput.map(p => Number(p.estoqueId)),
      ]);

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
        pecasEstoqueInput,
        credito,
        custoCongelado,
      );
      const custos = calcularCustosManutencaoCompletos({
        pecasEstoque: pecasResolvidas,
        pecasOficina,
        valorMaoObra: valorMaoObraOficial,
      });
      const totaisOs = valoresOsDosCustos(custos);
      const pecasPayload = [
        ...pecasLocaisFromResolvidas(pecasResolvidas).map(p => ({
          ...p,
          origem: MANUT_PECA_ORIGEM_ESTOQUE,
        })),
        ...pecasOficina.map(p => ({
          estoqueId: null as number | null,
          nome: p.nome,
          quantidade: p.quantidade.toFixed(2),
          valorUnitario: p.valorUnitario.toFixed(2),
          valorTotal: p.valorTotal.toFixed(2),
          origem: MANUT_PECA_ORIGEM_OFICINA,
        })),
      ];
      const localPayload = {
        ...rest,
        data,
        proximaManutencao: proximaManutencao || null,
        prestadorNome: rest.prestadorNome ?? null,
        prestadorContato: rest.prestadorContato ?? null,
        prestadorPessoaId: rest.prestadorPessoaId ?? null,
        descricao: rest.descricao ?? null,
        ...totaisOs,
        pecas: pecasPayload,
      };

      if (fromLocal) {
        if (manutencaoTemConsumoEstoque(pecasAntigas) || pecasResolvidas.length > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
        }
        await updateLocalManutencao(ctx.user.id, id, localPayload);
        return { success: true, localFallback: true };
      }

      try {
        await db.transaction(async tx => {
          await tx
            .update(manutencoes)
            .set({
              ...rest,
              data,
              proximaManutencao: proximaManutencao || null,
              prestadorNome: rest.prestadorNome ?? null,
              prestadorContato: rest.prestadorContato ?? null,
              prestadorPessoaId: rest.prestadorPessoaId ?? null,
              descricao: rest.descricao ?? null,
              ...totaisOs,
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
                origem: MANUT_PECA_ORIGEM_ESTOQUE,
              })),
            );
          }
          if (pecasOficina.length > 0) {
            await tx.insert(manutencaoPecas).values(
              pecasOficina.map(p => ({
                manutencaoId: id,
                estoqueId: null,
                nome: p.nome,
                quantidade: p.quantidade.toFixed(2),
                valorUnitario: p.valorUnitario.toFixed(2),
                valorTotal: p.valorTotal.toFixed(2),
                origem: MANUT_PECA_ORIGEM_OFICINA,
              })),
            );
          }
          const baixa = await aplicarBaixaEstoquePecasManutencao(
            tx,
            pecasResolvidas,
            pecasAntigas,
          );
          if (baixa.pendenteLocal.size > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: MSG_MANUT_ESTOQUE_AUSENTE_MYSQL,
            });
          }
        });
        const localExistente = await getLocalManutencao(ctx.user.id, id);
        if (localExistente) {
          await updateLocalManutencao(ctx.user.id, id, localPayload);
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof EstoqueCapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (!isDatabaseUnavailable(error)) throw error;
        if (manutencaoTemConsumoEstoque(pecasAntigas) || pecasResolvidas.length > 0) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
        }
        await updateLocalManutencao(ctx.user.id, id, localPayload);
        return { success: true, localFallback: true };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      let pecasAntigas: { estoqueId: number | null; quantidade: string | number }[] = [];
      let status: string | null = null;
      let fromLocal = false;

      try {
        const [row] = await db
          .select({ id: manutencoes.id, status: manutencoes.status })
          .from(manutencoes)
          .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)))
          .limit(1);
        if (row) {
          status = row.status ?? null;
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
        status = local.status ?? null;
        pecasAntigas = (local.pecas ?? []).map(p => ({
          estoqueId: p.estoqueId ?? null,
          quantidade: p.quantidade,
        }));
      }

      const exclusao = recusarExclusaoManutencao(status);
      if (exclusao.recusar) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: exclusao.message,
        });
      }

      if (manutencaoTemConsumoEstoque(pecasAntigas)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Esta manutenção consumiu peças do estoque. Use Estornar manutenção para devolver as peças e preservar o histórico.",
        });
      }

      if (fromLocal) {
        await deleteLocalManutencao(ctx.user.id, input.id);
        return { success: true, localFallback: true };
      }

      try {
        await db.transaction(async tx => {
          await tx.delete(manutencaoPecas).where(eq(manutencaoPecas.manutencaoId, input.id));
          await tx
            .delete(manutencoes)
            .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
        });
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        await deleteLocalManutencao(ctx.user.id, input.id);
        return { success: true, localFallback: true };
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
      const motivo = (input.motivo ?? "").trim() || MOTIVO_ESTORNO_MANUT_PADRAO;
      let pecasAntigas: {
        estoqueId: number | null;
        quantidade: string | number;
        estoqueMovimentacaoId?: number | null;
      }[] = [];

      try {
        const [row] = await db
          .select({ id: manutencoes.id, status: manutencoes.status })
          .from(manutencoes)
          .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)))
          .limit(1);
        if (!row) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Manutenção não encontrada." });
        }
        pecasAntigas = await db
          .select({
            estoqueId: manutencaoPecas.estoqueId,
            quantidade: manutencaoPecas.quantidade,
            estoqueMovimentacaoId: manutencaoPecas.estoqueMovimentacaoId,
          })
          .from(manutencaoPecas)
          .where(eq(manutencaoPecas.manutencaoId, input.id));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throwSeErroManutencaoEstoque(error);
      }

      const algumEstoqueComCapital = await estoquesTemCapitalInicializado(
        pecasAntigas.map(p => Number(p.estoqueId)),
      );

      try {
        const resultado = await estornarManutencaoCompletaMysql({
          userId: ctx.user.id,
          registradoPor: ctx.user.name?.trim() || `user-${ctx.user.id}`,
          id: input.id,
          motivo,
          hojeISO: hojeISODateLocal(),
          algumEstoqueComCapital,
        });
        if (resultado.handled) {
          return { success: true, alreadyEstornado: resultado.alreadyEstornado };
        }
      } catch (error) {
        throwSeErroManutencaoEstoque(error);
      }

      await assertPecasSemCapitalInicializado(pecasAntigas.map(p => Number(p.estoqueId)));

      try {
        await db.transaction(async tx => {
          const baixa = await aplicarBaixaEstoquePecasManutencao(tx, [], pecasAntigas);
          if (baixa.pendenteLocal.size > 0) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: MSG_MANUT_ESTOQUE_AUSENTE_MYSQL,
            });
          }
          await tx
            .update(manutencoes)
            .set({
              status: "estornado",
              motivoEstorno: motivo,
              estornadoEm: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
        });
        const localExistente = await getLocalManutencao(ctx.user.id, input.id);
        if (localExistente) {
          await updateLocalManutencao(ctx.user.id, input.id, { status: "estornado" });
        }
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof EstoqueCapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (!isDatabaseUnavailable(error)) {
          console.error("[manutencoes.estornar]", error);
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Não foi possível estornar a manutenção. Tente novamente.",
          });
        }
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_MYSQL_OBRIGATORIO });
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
      // Comparação por data civil (YYYY-MM-DD), sem horário/timezone.
      const hoje = new Date();
      const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const dataISO = String(input.data).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data da pesagem inválida." });
      }
      if (dataISO > hojeISO) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data da pesagem não pode ser futura.",
        });
      }
      try {
        const resultado = await pesarEEspelharAnimal(ioPesagemDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          input: { ...input, data: dataISO },
        }, {
          async pesar(userId, dados) {
            await createLocalPesagem(userId, dados);
          },
        });
        if (!resultado.ok) throw erroPesagem(resultado);
        return { success: true as const, id: resultado.id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (error instanceof ConflitoPesagemAnimal) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
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
        controlarSaldo: z.boolean().optional(),
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
  controlarSaldo: z.boolean().optional(),
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
  list: protectedProcedure.query(async ({ ctx }) => {
    const fazendaIds = await idsFazendasDoUsuarioParaEstoque(ctx.user.id);
    const listarLocal = () => filtrarProdutosEstoque(devLocalStore.listEstoque(), fazendaIds);
    if (fazendaIds.length === 0) return [];
    try {
      const rows = await db
        .select()
        .from(estoque)
        .where(inArray(estoque.fazendaId, fazendaIds))
        .orderBy(desc(estoque.createdAt));
      return resolverLeituraEstoqueList({ ok: true, rows }, listarLocal, isDatabaseUnavailable);
    } catch (error) {
      return resolverLeituraEstoqueList(
        { ok: false, error },
        listarLocal,
        isDatabaseUnavailable,
      );
    }
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ ctx, input }) => {
      await assertFazendaDoUsuario(ctx.user.id, input.fazendaId);
      try {
        const rows = await db
          .select()
          .from(estoque)
          .where(eq(estoque.fazendaId, input.fazendaId))
          .orderBy(desc(estoque.createdAt));
        const localRows = filtrarProdutosEstoque(devLocalStore.listEstoque(), [input.fazendaId]);
        if (localRows.length === 0) return rows;
        return mergeEstoqueListPreferLocal(rows, localRows);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return filtrarProdutosEstoque(devLocalStore.listEstoque(), [input.fazendaId]);
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const autorizadas = setFazendasDoUsuario(await idsFazendasDoUsuarioParaEstoque(ctx.user.id));
      const mergeVinculos = (
        base: {
          fazendaId: number;
          estoqueId: number;
          produzidoNaFazenda: boolean;
          controlarSaldo: boolean;
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
        if (row && produtoEstoqueVisivel(row, autorizadas)) {
          let estoquesVinculados: {
            fazendaId: number;
            estoqueId: number;
            produzidoNaFazenda: boolean;
            controlarSaldo: boolean;
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
                controlarSaldo: estoque.controlarSaldo,
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
                controlarSaldo: produtoControlaSaldo(l.controlarSaldo),
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
                controlarSaldo: produtoControlaSaldo(row.controlarSaldo),
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
          estoquesVinculados = mergeVinculos(estoquesVinculados, localVinculos)
            .filter(v => produtoEstoqueVisivel(v, autorizadas));

          const base = localRow ? { ...row, ...localRow, id: row.id } : row;
          const fazendaIds = [...new Set(estoquesVinculados.map(e => e.fazendaId))];
          return { ...base, fazendaIds, estoquesVinculados };
        }
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const local = devLocalStore.getEstoque(input.id);
      if (!local || !produtoEstoqueVisivel(local, autorizadas)) return null;
      const estoquesVinculados = devLocalStore.listEstoquesVinculados(
        local.produtoId ?? null,
        local
      ).filter(v => produtoEstoqueVisivel(v, autorizadas));
      return {
        ...local,
        fazendaIds: estoquesVinculados.map(e => e.fazendaId),
        estoquesVinculados,
      };
    }),

  create: protectedProcedure
    .input(z.object(estoqueInputFields))
    .mutation(async ({ ctx, input }) => {
      const fazendaIds = resolverFazendaIds(input);
      if (fazendaIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione pelo menos uma fazenda para usar este produto.",
        });
      }
      await assertFazendasEstoqueDoUsuario(ctx.user.id, fazendaIds);
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
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const fazendaIds = resolverFazendaIds(fields);
      if (fazendaIds.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selecione pelo menos uma fazenda para usar este produto.",
        });
      }
      await assertFazendasEstoqueDoUsuario(ctx.user.id, fazendaIds);
      const { set: autorizadas, ids: fazendasUsuario } = await fazendasAutorizadasEstoque(ctx.user.id);
      const catalogoValues = toCatalogoInsertValues(fields);
      const syncValues = toEstoqueSyncFromCatalogo(catalogoValues);
      const localPayload = { id, ...fields, embalagens: fields.embalagens };

      try {
        const [existing] = await db.select().from(estoque).where(eq(estoque.id, id));

        if (existing) {
          if (!podeEscreverProdutoEstoque(existing, autorizadas)) recusarEscritaEstoque();
          if (
            capitalEstaInicializado({ capitalInicializadoEm: existing.capitalInicializadoEm }) &&
            fields.valorUnitario != null &&
            String(fields.valorUnitario) !== String(existing.valorUnitario ?? "")
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: MSG_ESTOQUE_VALOR_UNITARIO_DERIVADO,
            });
          }
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
                valorUnitario: capitalEstaInicializado({ capitalInicializadoEm: existing.capitalInicializadoEm })
                  ? existing.valorUnitario
                  : fields.valorUnitario ?? existing.valorUnitario,
                localizacao: fields.localizacao ?? existing.localizacao,
              })
              .where(and(eq(estoque.produtoId, produtoId), inArray(estoque.fazendaId, fazendasUsuario)));

            // Situação operacional (ativo/inativo) é por fazenda — não cascatear a do catálogo

            const linkedAll = await db
              .select()
              .from(estoque)
              .where(eq(estoque.produtoId, produtoId));
            const linked = linkedAll.filter(l => podeEscreverProdutoEstoque(l, autorizadas));
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
                valorUnitario: capitalEstaInicializado({ capitalInicializadoEm: existing.capitalInicializadoEm })
                  ? existing.valorUnitario
                  : fields.valorUnitario ?? existing.valorUnitario,
                valorTotalEstoque: existing.valorTotalEstoque,
                capitalInicializadoEm: existing.capitalInicializadoEm,
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
          if (!podeEscreverProdutoEstoque(local, autorizadas)) recusarEscritaEstoque();
          devLocalStore.updateProdutoComEstoques(localPayload);
          return { success: true, localFallback: true };
        }

        throw new TRPCError({ code: "NOT_FOUND", message: "Produto não encontrado" });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        const localDown = devLocalStore.getEstoque(id);
        if (localDown && !podeEscreverProdutoEstoque(localDown, autorizadas)) recusarEscritaEstoque();
        if (localDown) devLocalStore.updateProdutoComEstoques(localPayload);
        else recusarEscritaEstoque();
        return { success: true, localFallback: true };
      }
    }),

  vincularFazenda: protectedProcedure
    .input(z.object({
      produtoId: z.number(),
      fazendaId: z.number(),
      produzidoNaFazenda: z.boolean().optional(),
      controlarSaldo: z.boolean().optional(),
      monitorarEstoque: z.boolean().optional(),
      quantidadeMinima: z.string().optional(),
      quantidadeMaxima: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertFazendaDoUsuario(ctx.user.id, input.fazendaId);
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
          if (input.controlarSaldo != null) patch.controlarSaldo = input.controlarSaldo;
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
    .mutation(async ({ ctx, input }) => {
      const { set: autorizadas } = await fazendasAutorizadasEstoque(ctx.user.id);
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
          const localRow = devLocalStore.getEstoque(input.id);
          if (localRow && !podeEscreverProdutoEstoque(localRow, autorizadas)) recusarEscritaEstoque();
          const local = deleteLocal();
          return { success: true, localFallback: true, escopo: input.escopo, ...local };
        }
        if (!podeEscreverProdutoEstoque(row, autorizadas)) recusarEscritaEstoque();

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
            .select()
            .from(estoque)
            .where(eq(estoque.produtoId, produtoId));
          if (linked.some(l => !podeEscreverProdutoEstoque(l, autorizadas))) recusarEscritaEstoque();
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
    .mutation(async ({ ctx, input }) => {
      await assertProdutosEstoqueDoUsuario(ctx.user.id, input.ids);
      const { set: autorizadas, ids: fazendasUsuario } = await fazendasAutorizadasEstoque(ctx.user.id);
      const aplicar = async () => {
        if (input.escopo === "fazenda") {
          await db
            .update(estoque)
            .set({ situacao: "inativo" })
            .where(and(inArray(estoque.id, input.ids), inArray(estoque.fazendaId, fazendasUsuario)));
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
            .select()
            .from(estoque)
            .where(inArray(estoque.produtoId, [...produtoIds]));
          if (linked.some(l => !podeEscreverProdutoEstoque(l, autorizadas))) recusarEscritaEstoque();
          for (const l of linked) estoqueIds.add(l.id);
          await db
            .update(produtosCatalogo)
            .set({ situacao: "inativo" })
            .where(inArray(produtosCatalogo.id, [...produtoIds]));
        }
        const ids = [...estoqueIds];
        if (ids.length > 0) {
          await db.update(estoque).set({ situacao: "inativo" }).where(and(inArray(estoque.id, ids), inArray(estoque.fazendaId, fazendasUsuario)));
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
    .mutation(async ({ ctx, input }) => {
      await assertProdutosEstoqueDoUsuario(ctx.user.id, input.ids);
      const { set: autorizadas, ids: fazendasUsuario } = await fazendasAutorizadasEstoque(ctx.user.id);
      const aplicar = async () => {
        if (input.escopo === "fazenda") {
          await db
            .update(estoque)
            .set({ situacao: "ativo" })
            .where(and(inArray(estoque.id, input.ids), inArray(estoque.fazendaId, fazendasUsuario)));
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
            .select()
            .from(estoque)
            .where(inArray(estoque.produtoId, [...produtoIds]));
          if (linked.some(l => !podeEscreverProdutoEstoque(l, autorizadas))) recusarEscritaEstoque();
          for (const l of linked) estoqueIds.add(l.id);
          await db
            .update(produtosCatalogo)
            .set({ situacao: "ativo" })
            .where(inArray(produtosCatalogo.id, [...produtoIds]));
        }
        const ids = [...estoqueIds];
        if (ids.length > 0) {
          await db.update(estoque).set({ situacao: "ativo" }).where(and(inArray(estoque.id, ids), inArray(estoque.fazendaId, fazendasUsuario)));
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

  resumo: protectedProcedure.query(async ({ ctx }) => {
    const fazendaIds = await idsFazendasDoUsuarioParaEstoque(ctx.user.id);
    try {
      const itens = fazendaIds.length === 0
        ? []
        : await db.select().from(estoque).where(inArray(estoque.fazendaId, fazendaIds));
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
      const itens = filtrarProdutosEstoque(devLocalStore.listEstoque(), fazendaIds);
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

  listMovimentacoes: protectedProcedure.query(async ({ ctx }) => {
    const fazendaIds = await idsFazendasDoUsuarioParaEstoque(ctx.user.id);
    if (fazendaIds.length === 0) return [];
    try {
      const rows = await db
        .select({
          id: estoqueMovimentacoes.id,
          grupoId: estoqueMovimentacoes.grupoId,
          operacaoId: estoqueMovimentacoes.operacaoId,
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
          createdAtCivil: sql<string>`CAST(${estoqueMovimentacoes.createdAt} AS CHAR)`,
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
        .where(and(
          inArray(estoque.fazendaId, fazendaIds),
          or(isNull(estoqueMovimentacoes.fazendaId), inArray(estoqueMovimentacoes.fazendaId, fazendaIds)),
        ))
        .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
      const localRows = filtrarMovimentacoesEstoque(devLocalStore.listMovimentacoes(), fazendaIds);
      if (localRows.length === 0) return rows;
      const ids = new Set(rows.map(r => r.id));
      const extras = localRows.filter(r => !ids.has(r.id));
      return [...rows, ...extras];
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      return filtrarMovimentacoesEstoque(devLocalStore.listMovimentacoes(), fazendaIds);
    }
  }),

  getMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const autorizadas = setFazendasDoUsuario(await idsFazendasDoUsuarioParaEstoque(ctx.user.id));
      try {
        const [row] = await db
          .select({
            id: estoqueMovimentacoes.id,
            grupoId: estoqueMovimentacoes.grupoId,
            operacaoId: estoqueMovimentacoes.operacaoId,
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
            createdAtCivil: sql<string>`CAST(${estoqueMovimentacoes.createdAt} AS CHAR)`,
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
        if (row && movimentacaoEstoqueVisivel(row, autorizadas)) return row;
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
      }
      const local = devLocalStore.getMovimentacao(input.id);
      if (!local || !movimentacaoEstoqueVisivel(local, autorizadas)) return null;
      return local;
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
      await assertFazendaDoUsuario(userId, input.fazendaId);
      await assertProdutoEstoqueDoUsuario(userId, input.estoqueId);

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

        const criado = await criarMovimentacaoEstoqueNoTx({
          async findEstoque(id) {
            const [row] = await db.select().from(estoque).where(eq(estoque.id, id));
            return row
              ? {
                  id: row.id,
                  fazendaId: row.fazendaId ?? null,
                  quantidade: row.quantidade,
                  controlarSaldo: row.controlarSaldo ?? null,
                  valorUnitario: row.valorUnitario,
                  valorTotalEstoque: row.valorTotalEstoque,
                  capitalInicializadoEm: row.capitalInicializadoEm,
                  nome: row.nome,
                }
              : null;
          },
          async insertMovimentacao(values) {
            const result = await db.insert(estoqueMovimentacoes).values(values as typeof estoqueMovimentacoes.$inferInsert);
            return Number((result as { insertId?: number }[])[0]?.insertId ?? 0);
          },
          async updateEstoque(id, patch) {
            await db.update(estoque).set(patch).where(eq(estoque.id, id));
          },
        }, {
          ...input,
          userId,
          registradoPor,
        });

        return {
          success: true,
          id: criado.id,
          grupoId: criado.grupoId,
        };
      } catch (error) {
        if (error instanceof EstoqueCapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        if (error instanceof Error && /estoque insuficiente|quantidade válida|usuário autenticado/i.test(error.message)) {
          throw error;
        }
        if (!isDatabaseUnavailable(error)) throw error;
        const result = devLocalStore.createMovimentacao(localInput);
        return { success: true, id: result.id, grupoId: input.grupoId ?? null, localFallback: true };
      }
    }),

  confirmarCompraInsumos: protectedProcedure
    .input(z.object({
      idempotencyKey: z.string().min(8).max(80),
      fazendaId: z.number(),
      dataOperacao: z.string(),
      fornecedorId: z.number(),
      numeroNf: z.string().max(60).optional().nullable(),
      referencia: z.string().max(120).optional().nullable(),
      valorFrete: z.number().nonnegative(),
      freteCredorId: z.number().int().positive().optional().nullable(),
      itens: z.array(z.object({
        estoqueId: z.number(),
        quantidade: z.string(),
        valorMercadoria: z.number().nonnegative(),
        dataValidade: z.string().optional().nullable(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "";
      if (!ctx.user.id || !registradoPor) {
        throw new Error("Usuário autenticado inválido para registrar movimentação.");
      }
      return compraInsumosService.confirmarCompraInsumos(ctx.user.id, registradoPor, input);
    }),

  confirmarTransferenciaInsumos: protectedProcedure
    .input(z.object({
      idempotencyKey: z.string().min(8).max(80),
      fazendaOrigemId: z.number(),
      fazendaDestinoId: z.number(),
      dataOperacao: z.string(),
      itens: z.array(z.object({
        estoqueOrigemId: z.number(),
        quantidade: z.string(),
      })).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const registradoPor = ctx.user.name?.trim() || ctx.user.email?.trim() || "";
      if (!ctx.user.id || !registradoPor) {
        throw new Error("Usuário autenticado inválido para registrar movimentação.");
      }
      return transferenciaInsumosService.confirmar(ctx.user.id, registradoPor, input);
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
      await assertMovimentacaoEstoqueDoUsuario(ctx.user.id, input.id);
      await assertProdutoEstoqueDoUsuario(ctx.user.id, input.estoqueId);
      if (input.fazendaId) await assertFazendaDoUsuario(ctx.user.id, input.fazendaId);

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
        if (mov.operacaoId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_COMPRA_EDITAR_INTEGRADA,
          });
        }

        const oldQty = Number(mov.quantidade);
        const oldEstoqueId = mov.estoqueId;
        const execPatch = executorPatchDrizzle(db);

        const [itemAlvo] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!itemAlvo) throw new Error("Produto não encontrado.");
        if (capitalEstaInicializado({ capitalInicializadoEm: itemAlvo.capitalInicializadoEm })) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTOQUE_EDICAO_CAPITAL });
        }
        if (oldEstoqueId !== input.estoqueId) {
          const [oldItem] = await db.select().from(estoque).where(eq(estoque.id, oldEstoqueId));
          if (oldItem && capitalEstaInicializado({ capitalInicializadoEm: oldItem.capitalInicializadoEm })) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTOQUE_EDICAO_CAPITAL });
          }
        }

        if (oldEstoqueId === input.estoqueId) {
          await aplicarPatchSaldoNoTx(execPatch, input.estoqueId, {
            tipoOp: "estorno",
            quantidadeOriginal: oldQty,
          });
          await aplicarPatchSaldoNoTx(execPatch, input.estoqueId, qty > 0
            ? { tipoOp: "entrada", quantidade: qty, valorInformado: input.valor, tipoMov: input.tipo }
            : { tipoOp: "saida", quantidade: Math.abs(qty) });
        } else {
          await aplicarPatchSaldoNoTx(execPatch, oldEstoqueId, {
            tipoOp: "estorno",
            quantidadeOriginal: oldQty,
          });
          await aplicarPatchSaldoNoTx(execPatch, input.estoqueId, qty > 0
            ? { tipoOp: "entrada", quantidade: qty, valorInformado: input.valor, tipoMov: input.tipo }
            : { tipoOp: "saida", quantidade: Math.abs(qty) });
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
        if (error instanceof EstoqueCapitalError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
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
    .query(async ({ ctx, input }) => {
      for (const id of input.itemIds) {
        await assertMovimentacaoEstoqueDoUsuario(ctx.user.id, id);
      }
      try {
        const seeds = await db
          .select({
            id: estoqueMovimentacoes.id,
            grupoId: estoqueMovimentacoes.grupoId,
            operacaoId: estoqueMovimentacoes.operacaoId,
            manejo: estoqueMovimentacoes.manejo,
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

        const vinculosSaude = await listarVinculosSaudePorMovimentacaoIds(seeds.map(s => s.id));
        if (deveBloquearEstornoGenericoSanitario({
          movimentacoes: seeds,
          movimentacaoIdsComVinculoSaude: vinculosSaude,
        })) {
          return {
            podeEstornar: false,
            jaEstornada: false,
            insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
            mensagem: MSG_ESTORNO_GENERICO_SANITARIO,
          };
        }
        const vinculosManut = await listarVinculosManutencaoPorMovimentacaoIds(seeds.map(s => s.id));
        if (deveBloquearEstornoGenericoManutencao({
          movimentacoes: seeds,
          movimentacaoIdsComVinculoManutencao: vinculosManut,
        })) {
          return {
            podeEstornar: false,
            jaEstornada: false,
            insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
            mensagem: MSG_ESTORNO_GENERICO_MANUTENCAO,
          };
        }

        const operacaoId = seeds.map(s => s.operacaoId).find(id => id != null);
        if (operacaoId) {
          const ids = [...new Set(seeds.map(s => s.operacaoId).filter((id): id is number => id != null))];
          if (ids.length > 1) {
            return {
              podeEstornar: false,
              jaEstornada: false,
              insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
              mensagem: MSG_COMPRA_LINHA_ISOLADA,
            };
          }
          const [opHead] = await db.select({
            tipo: estoqueOperacoes.tipo,
            motivo: estoqueOperacoes.motivo,
            status: estoqueOperacoes.status,
          }).from(estoqueOperacoes).where(eq(estoqueOperacoes.id, operacaoId)).limit(1);
          if (opHead && isOperacaoTransferenciaInsumos(opHead)) {
            const ja = opHead.status === "estornada";
            return {
              podeEstornar: !ja,
              jaEstornada: ja,
              insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
              mensagem: ja ? "Esta transferência já foi estornada." : null,
            };
          }
          const v = await compraInsumosService.validarEstornoOperacao(ctx.user.id, operacaoId);
          return {
            podeEstornar: v.podeEstornar,
            jaEstornada: Boolean(v.jaEstornada),
            insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
            mensagem: v.mensagem,
          };
        }

        const grupoId = seeds[0]!.grupoId?.trim() || null;
        const originais = grupoId
          ? await db
              .select({
                id: estoqueMovimentacoes.id,
                grupoId: estoqueMovimentacoes.grupoId,
                manejo: estoqueMovimentacoes.manejo,
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

        const vinculosOriginais = await listarVinculosSaudePorMovimentacaoIds(originais.map(o => o.id));
        if (deveBloquearEstornoGenericoSanitario({
          movimentacoes: originais,
          movimentacaoIdsComVinculoSaude: vinculosOriginais,
        })) {
          return {
            podeEstornar: false,
            jaEstornada: false,
            insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
            mensagem: MSG_ESTORNO_GENERICO_SANITARIO,
          };
        }
        const vinculosManutOriginais = await listarVinculosManutencaoPorMovimentacaoIds(originais.map(o => o.id));
        if (deveBloquearEstornoGenericoManutencao({
          movimentacoes: originais,
          movimentacaoIdsComVinculoManutencao: vinculosManutOriginais,
        })) {
          return {
            podeEstornar: false,
            jaEstornada: false,
            insuficientes: [] as ReturnType<typeof avaliarEstornoEstoque>,
            mensagem: MSG_ESTORNO_GENERICO_MANUTENCAO,
          };
        }

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
      for (const id of input.itemIds) {
        await assertMovimentacaoEstoqueDoUsuario(ctx.user.id, id);
      }

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

        await recusarEstornoGenericoSeSanitario(seeds);
        await recusarEstornoGenericoSeManutencao(seeds);

        if (seeds.some(s => s.abastecimentoId != null)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_MOV_VINCULADA_EXCLUIR,
          });
        }

        const operacaoIds = [...new Set(seeds.map(s => s.operacaoId).filter((id): id is number => id != null))];
        if (operacaoIds.length > 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_COMPRA_LINHA_ISOLADA });
        }
        if (operacaoIds.length === 1) {
          if (seeds.some(s => s.operacaoId == null)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MSG_COMPRA_LINHA_ISOLADA });
          }
          if (isOperacaoTransferenciaInsumos({ tipo: seeds[0]?.tipo, motivo: seeds[0]?.tipo })) {
            return transferenciaInsumosService.estornar(ctx.user.id, registradoPor, operacaoIds[0]!, motivo);
          }
          const [opHead] = await db.select({
            tipo: estoqueOperacoes.tipo,
            motivo: estoqueOperacoes.motivo,
          }).from(estoqueOperacoes).where(eq(estoqueOperacoes.id, operacaoIds[0]!)).limit(1);
          if (opHead && isOperacaoTransferenciaInsumos(opHead)) {
            return transferenciaInsumosService.estornar(ctx.user.id, registradoPor, operacaoIds[0]!, motivo);
          }
          return compraInsumosService.estornarOperacao(ctx.user.id, operacaoIds[0]!, motivo, registradoPor);
        }

        const grupoId = seeds[0]!.grupoId?.trim() || null;
        const originais = grupoId
          ? await db.select().from(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.grupoId, grupoId))
          : seeds;

        await recusarEstornoGenericoSeSanitario(originais);
        await recusarEstornoGenericoSeManutencao(originais);

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
            const patchEstorno = await aplicarPatchSaldoNoTx(executorPatchDrizzle(tx), mov.estoqueId, {
              tipoOp: "estorno",
              quantidadeOriginal: qty,
              valorSnapshot: mov.valorEstoqueMovimentado,
            });

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
              valorEstoqueMovimentado: patchEstorno.valorEstoqueMovimentado ?? undefined,
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
        if (
          error instanceof SaudeEstoqueError
          || error instanceof ManutencaoEstoqueError
          || error instanceof EstoqueCapitalError
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
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
    .mutation(async ({ ctx, input }) => {
      await assertMovimentacaoEstoqueDoUsuario(ctx.user.id, input.id);
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
        if (mov.operacaoId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: MSG_COMPRA_LINHA_ISOLADA,
          });
        }

        const [item] = await db.select().from(estoque).where(eq(estoque.id, mov.estoqueId));
        if (item) {
          if (capitalEstaInicializado({ capitalInicializadoEm: item.capitalInicializadoEm })) {
            throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTOQUE_EXCLUSAO_CAPITAL });
          }
          const qtyMov = Number(mov.quantidade);
          await aplicarPatchSaldoNoTx(executorPatchDrizzle(db), mov.estoqueId, {
            tipoOp: "estorno",
            quantidadeOriginal: qtyMov,
          });
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
    .query(async ({ ctx, input }) => {
      const fazendaIds = await idsFazendasDoUsuarioParaEstoque(ctx.user.id);
      const autorizadas = setFazendasDoUsuario(fazendaIds);
      const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
      if (!item || !produtoEstoqueVisivel(item, autorizadas)) return [];
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
    .mutation(async ({ ctx, input }) => {
      await assertProdutoEstoqueDoUsuario(ctx.user.id, input.estoqueId);
      const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
      if (item && capitalEstaInicializado({ capitalInicializadoEm: item.capitalInicializadoEm })) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ESTOQUE_ZERAR_CAPITAL });
      }
      await db
        .delete(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.estoqueId, input.estoqueId));
      if (item) {
        const qtd = Number(item.quantidade ?? 0);
        if (qtd > 0) {
          await aplicarPatchSaldoNoTx(executorPatchDrizzle(db), input.estoqueId, {
            tipoOp: "saida",
            quantidade: qtd,
          });
        }
      }
      return { success: true };
    }),

  listByCategories: protectedProcedure
    .input(z.object({ categorias: z.array(z.string()).min(1) }))
    .query(async ({ ctx, input }) => {
      const fazendaIds = await idsFazendasDoUsuarioParaEstoque(ctx.user.id);
      const sortByNome = <T extends { nome?: string | null }>(rows: T[]) =>
        [...rows].sort((a, b) =>
          String(a.nome ?? "").localeCompare(String(b.nome ?? ""), "pt-BR"),
        );
      const listarLocal = () => filtrarProdutosEstoque(devLocalStore.listByCategories(input.categorias), fazendaIds);
      if (fazendaIds.length === 0) return [];

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
            valorTotalEstoque: estoque.valorTotalEstoque,
            capitalInicializadoEm: estoque.capitalInicializadoEm,
            embalagens: estoque.embalagens,
            fabricante: estoque.fabricante,
            situacao: estoque.situacao,
            controlarSaldo: estoque.controlarSaldo,
            identificadorUnico: estoque.identificadorUnico,
            observacoes: estoque.observacoes,
            createdAt: estoque.createdAt,
            updatedAt: estoque.updatedAt,
          })
          .from(estoque)
          .where(and(
            inArray(estoque.categoria, input.categorias),
            inArray(estoque.fazendaId, fazendaIds),
          ))
          .orderBy(estoque.nome);
        return sortByNome(resolverLeituraEstoqueList(
          { ok: true, rows },
          listarLocal,
          isDatabaseUnavailable,
        ));
      } catch (error) {
        return sortByNome(resolverLeituraEstoqueList(
          { ok: false, error },
          listarLocal,
          isDatabaseUnavailable,
        ));
      }
    }),
});

// ─── FINANCEIRO ROUTER ────────────────────────────────────────────────────────
const financeiroRouter = router({
  listContas: protectedProcedure.query(() => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
    });
  }),

  createConta: protectedProcedure
    .input(z.object({
      nome: z.string(),
      tipo: z.string().optional(),
      banco: z.string().optional(),
      saldoInicial: z.string().optional(),
    }))
    .mutation(async () => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
      });
    }),

  listMovimentacoes: protectedProcedure.query(() => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
    });
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
    .mutation(async () => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
      });
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async () => {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
      });
    }),

  summary: protectedProcedure.query(() => {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: MSG_FINANCEIRO_LEGADO_ESCRITA_BLOQUEADA,
    });
  }),
});

// ─── DASHBOARD ROUTER ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  overview: protectedProcedure
    .input(z.object({ fazendaId: z.number().int().positive().optional() }).optional())
    .query(({ ctx, input }) => carregarPainelControle(ctx.user.id, input?.fazendaId)),
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalAnimaisResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(animais).where(eq(animais.userId, ctx.user.id));
    const [totalLotesResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(lotes).where(eq(lotes.userId, ctx.user.id));
    const [totalMaquinasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(maquinas).where(eq(maquinas.userId, ctx.user.id));
    const [totalBenfeitoriasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id));

    return {
      totalAnimais: Number(totalAnimaisResult?.count || 0),
      totalLotes: Number(totalLotesResult?.count || 0),
      totalMaquinas: Number(totalMaquinasResult?.count || 0),
      totalBenfeitorias: Number(totalBenfeitoriasResult?.count || 0),
      totalReceitas: null,
      totalDespesas: null,
      saldoTotal: null,
    };
  }),
});

// ─── COMPRAS ROUTER ─────────────────────────────────────────────────────────
const comprasRouter = router({
  list: protectedProcedure
    .input(comprasListInputSchema)
    .query(({ ctx, input }) => listarComprasDoUsuario(ctx.user.id, input)),
  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => getCompraDetalhe(ctx.user.id, input.id)),
  listarRecebimentos: protectedProcedure
    .input(z.object({ compraId: z.number().int().positive() }))
    .query(({ ctx, input }) => listarRecebimentosCompra(ctx.user.id, input.compraId)),
  cancelar: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      motivo: z.string(),
    }))
    .mutation(async ({ ctx, input }) =>
      cancelarCompraComercial(ctx.user.id, {
        compraId: input.id,
        motivo: input.motivo,
        canceladoPorUserId: ctx.user.id,
        canceladoPorNome: ctx.user.name,
      }),
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
  confirmarNaoIdentificados: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      data: z.string(),
      fornecedorId: z.number(),
      referencia: z.string().optional(),
      formaPrecificacao: z.enum(["kg", "cabeca"]),
      precoUnitario: z.number(),
      frete: z.number().nullable().optional(),
      outrosCustos: z.number().nullable().optional(),
      loteDestinoId: z.number().nullable().optional(),
      pastoDestinoId: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      modoIdentificacao: z.literal("nao_identificados").optional(),
      grupos: z.array(z.object({
        categoria: z.string(),
        sexo: z.string(),
        quantidade: z.number(),
        pesoTotal: z.number().nullable().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => confirmarCompraNaoIdentificados(ctx.user.id, input)),
  documentosAnexar: protectedProcedure
    .input(
      z.object({
        compraId: z.number().int().positive(),
        tipo: z.enum(["gta", "nota_fiscal"]),
        data: z.string().min(1),
        nomeOriginal: z.string().min(1).max(255),
        mimeType: z.string().optional(),
        substituir: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      compraDocumentosService.anexar(ctx.user.id, {
        compraId: input.compraId,
        tipo: input.tipo,
        data: Buffer.from(input.data, "base64"),
        nomeOriginal: input.nomeOriginal,
        mimeType: input.mimeType,
        substituir: input.substituir,
        uploadedByUserId: ctx.user.id,
        uploadedByNome: ctx.user.name,
      }),
    ),
  documentosExcluir: protectedProcedure
    .input(
      z.object({
        compraId: z.number().int().positive(),
        documentoId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      compraDocumentosService.excluir(ctx.user.id, {
        compraId: input.compraId,
        documentoId: input.documentoId,
      }),
    ),
  receberAnimal: protectedProcedure
    .input(
      z.object({
        compraId: z.number().int().positive(),
        compraGrupoId: z.number().int().positive(),
        brincoVisual: z.string(),
        rfid: z.string().optional().nullable(),
        pesoEntrada: z.string().optional().nullable(),
        loteId: z.number().int().positive().optional().nullable(),
        pastoId: z.number().int().positive().optional().nullable(),
        raca: z.string().optional().nullable(),
        observacoes: z.string().optional().nullable(),
        dataRecebimento: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      receberAnimalCompra(ctx.user.id, input, { usuarioNome: ctx.user.name }),
    ),
  desfazerRecebimento: protectedProcedure
    .input(
      z.object({
        recebimentoId: z.number().int().positive(),
        motivo: z.enum(MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA),
        observacao: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const resultado = await recusarEstornoRecebimentoAutorizado(ioEstornoRecebimentoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          recebimentoId: input.recebimentoId,
          motivo: input.motivo,
          observacao: input.observacao,
        });
        throw erroEstornoRecebimento(resultado);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => excluirCompraLegada(ctx.user.id, input.id)),
});

// ─── VENDAS ROUTER ───────────────────────────────────────────────────────────
const vendasRouter = router({
  list: protectedProcedure
    .input(vendasListInputSchema)
    .query(async ({ ctx, input }) => {
    const conditions = [eq(vendas.userId, ctx.user.id)];
    if (input?.fazendaId) conditions.push(eq(vendas.fazendaId, input.fazendaId));
    const statusFiltro = statusWhereVendasList(input?.status);
    if (statusFiltro) conditions.push(eq(vendas.status, statusFiltro));
    const rows = await db
      .select()
      .from(vendas)
      .where(and(...conditions))
      .orderBy(desc(vendas.createdAt));
    if (!rows.length) return [];

    const ids = rows.map(v => v.id);
    const itens = await db
      .select()
      .from(vendaItens)
      .where(and(eq(vendaItens.userId, ctx.user.id), inArray(vendaItens.vendaId, ids)));
    const itensPorVenda = new Map<number, typeof itens>();
    for (const item of itens) {
      const list = itensPorVenda.get(item.vendaId) ?? [];
      list.push(item);
      itensPorVenda.set(item.vendaId, list);
    }

    const fazendaIds = [...new Set(rows.map(v => v.fazendaId).filter((id): id is number => id != null))];
    const fazendaNomeMap = new Map<number, string>();
    if (fazendaIds.length) {
      const fazendaRows = await db
        .select({ id: fazendas.id, nome: fazendas.nome })
        .from(fazendas)
        .where(inArray(fazendas.id, fazendaIds));
      fazendaRows.forEach(f => fazendaNomeMap.set(f.id, f.nome));
    }

    return rows.map(v => {
      const daVenda = itensPorVenda.get(v.id) ?? [];
      const temItens = daVenda.length > 0;
      const totais = temItens
        ? resumirItensVenda(
            daVenda.map(i => ({
              pesoVenda: i.pesoVenda != null ? Number(i.pesoVenda) : null,
              valorItem: Number(i.valorItem) || 0,
            })),
            {
              forma: v.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
              rendimentoCarcaca: v.rendimentoCarcaca != null ? Number(v.rendimentoCarcaca) : null,
            },
          )
        : null;
      return {
        ...v,
        fazendaNome: v.fazendaId != null ? fazendaNomeMap.get(v.fazendaId) ?? null : null,
        temItens,
        quantidade: temItens ? totais!.quantidade : v.quantidadeAnimais ?? 0,
        pesoTotal: temItens ? totais!.pesoTotal : null,
        valorTotalNumero: temItens ? totais!.valorTotal : Number(v.valorTotal) || 0,
      };
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [venda] = await db
        .select()
        .from(vendas)
        .where(and(eq(vendas.id, input.id), eq(vendas.userId, ctx.user.id)))
        .limit(1);
      if (!venda) throw new TRPCError({ code: "NOT_FOUND", message: "Venda não encontrada." });
      const itens = await db
        .select()
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, ctx.user.id), eq(vendaItens.vendaId, venda.id)));
      let fazendaNome: string | null = null;
      if (venda.fazendaId != null) {
        const [fazenda] = await db
          .select({ nome: fazendas.nome })
          .from(fazendas)
          .where(eq(fazendas.id, venda.fazendaId))
          .limit(1);
        fazendaNome = fazenda?.nome ?? null;
      }
      const totais = itens.length
        ? resumirItensVenda(
            itens.map(i => ({
              pesoVenda: i.pesoVenda != null ? Number(i.pesoVenda) : null,
              valorItem: Number(i.valorItem) || 0,
            })),
            {
              forma: venda.formaPrecificacao === "cabeca" ? "cabeca" : "kg",
              rendimentoCarcaca: venda.rendimentoCarcaca != null ? Number(venda.rendimentoCarcaca) : null,
            },
          )
        : {
            quantidade: venda.quantidadeAnimais ?? 0,
            pesoTotal: null as number | null,
            valorTotal: Number(venda.valorTotal) || 0,
            precoMedioKg: null as number | null,
            precoMedioCabeca: null as number | null,
            precoMedioArroba: null as number | null,
          };
      const documentos = await vendaDocumentosService.listarPublicos(ctx.user.id, venda.id);
      const temRecebimentoEfetivo = await financeiroNucleoMysqlStore.transaction(tx =>
        vendaTemRecebimentoEfetivo(tx, ctx.user.id, venda.id),
      );
      return { ...venda, fazendaNome, itens, totais, temItens: itens.length > 0, documentos, temRecebimentoEfetivo };
    }),

  porAnimal: protectedProcedure
    .input(z.object({ animalId: z.number() }))
    .query(async ({ ctx, input }) => {
      const [item] = await db
        .select()
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, ctx.user.id), eq(vendaItens.animalId, input.animalId)))
        .limit(1);
      if (!item) return null;
      const [venda] = await db
        .select()
        .from(vendas)
        .where(and(eq(vendas.id, item.vendaId), eq(vendas.userId, ctx.user.id)))
        .limit(1);
      if (!venda) return null;
      return { venda, item };
    }),

  confirmar: protectedProcedure
    .input(
      z.object({
        fazendaId: z.number().int().positive(),
        data: z.string(),
        compradorId: z.number().int().positive(),
        formaPrecificacao: z.enum(["kg", "cabeca", "arroba"]),
        precoPadrao: z.number().positive().nullable().optional(),
        rendimentoCarcaca: z.number().positive().max(100).nullable().optional(),
        observacoes: z.string().optional(),
        itens: z
          .array(
            z.object({
              animalId: z.number().int().positive(),
              pesoVenda: z.number().positive().nullable().optional(),
              precoUnitario: z.number().positive(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmarVendaAutorizada(ioVendaOperacaoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          fazendaId: input.fazendaId,
        }, (titularUserId) => confirmarVendaComercialSePermitida(titularUserId, {
          ...input,
          usuarioNome: ctx.user.name,
        }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  cancelar: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        motivo: z.string().trim().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelarVendaAutorizada(ioVendaOperacaoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          vendaId: input.id,
          motivo: input.motivo,
        }, (titularUserId) =>
          createCancelarVendaFinanceiroService(createCancelarVendaFinanceiroMysqlStore(db)).cancelar(titularUserId, {
            vendaId: input.id,
            motivo: input.motivo,
            canceladoPorUserId: ctx.user.id,
            canceladoPorNome: ctx.user.name,
          }));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  integracaoConfirmacaoAtiva: protectedProcedure.query(() => integracaoConfirmacaoVendaAtiva()),

  estadoConfirmacaoVenda: protectedProcedure.query(() => estadoConfirmacaoVenda()),

  confirmarIntegrada: protectedProcedure
    .input(
      z.object({
        idempotencyKey: z.string().min(8).max(80),
        fazendaId: z.number().int().positive(),
        data: z.string(),
        compradorId: z.number().int().positive(),
        formaPrecificacao: z.enum(["kg", "cabeca"]),
        precoPadrao: z.number().positive().nullable().optional(),
        observacoes: z.string().nullable().optional(),
        itens: z
          .array(
            z.object({
              animalId: z.number().int().positive(),
              pesoVenda: z.number().positive().nullable().optional(),
              precoUnitario: z.number().positive(),
            }),
          )
          .min(1),
        condicao: z.enum(["a_vista", "a_prazo", "parcelado", "definir_depois"]),
        parcelas: z
          .array(
            z.object({
              numero: z.number().int().positive(),
              vencimento: z.string(),
              valorOriginal: z.number().positive(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await confirmarVendaAutorizada(ioVendaOperacaoDrizzle(), {
          executorId: ctx.user.id,
          sessionVersionDaSessao: ctx.user.sessionVersion,
          fazendaId: input.fazendaId,
        }, (titularUserId) => confirmarVendaIntegradaSeAtiva(
          createConfirmarVendaFinanceiroMysqlStore(db),
          titularUserId,
          { ...input, usuarioNome: ctx.user.name },
        ));
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (isDatabaseUnavailable(error)) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco de dados indisponível." });
        }
        throw error;
      }
    }),

  documentosAnexar: protectedProcedure
    .input(
      z.object({
        vendaId: z.number().int().positive(),
        tipo: z.enum(["gta", "nota_fiscal"]),
        data: z.string().min(1),
        nomeOriginal: z.string().min(1).max(255),
        mimeType: z.string().optional(),
        substituir: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      vendaDocumentosService.anexar(ctx.user.id, {
        vendaId: input.vendaId,
        tipo: input.tipo,
        data: Buffer.from(input.data, "base64"),
        nomeOriginal: input.nomeOriginal,
        mimeType: input.mimeType,
        substituir: input.substituir,
        uploadedByUserId: ctx.user.id,
        uploadedByNome: ctx.user.name,
      }),
    ),

  documentosExcluir: protectedProcedure
    .input(
      z.object({
        vendaId: z.number().int().positive(),
        documentoId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      vendaDocumentosService.excluir(ctx.user.id, {
        vendaId: input.vendaId,
        documentoId: input.documentoId,
      }),
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
      const [item] = await db
        .select({ id: vendaItens.id })
        .from(vendaItens)
        .where(and(eq(vendaItens.userId, ctx.user.id), eq(vendaItens.vendaId, input.id)))
        .limit(1);
      if (item) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vendas com animais vinculados não podem ser excluídas nesta etapa.",
        });
      }
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
  configReproPipeline: z.string().optional(),
  observacoes: z.string().optional(),
};

function preferValue<T>(primary: T | null | undefined, fallback: T | null | undefined) {
  return primary !== undefined && primary !== null && primary !== "" ? primary : fallback;
}

type LinhaFazendaLista = Record<string, any> & { id: number; userId: number };

export type ResultadoListaFazendas<T> =
  | { ok: true; fazendas: T[] }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" };

function identidadeDaLista(user: {
  id: number;
  openId?: string;
  name?: string | null;
  email?: string | null;
  role?: "admin" | "user";
  papel?: PapelConta;
  titularUserId?: number;
  situacao?: SituacaoUsuario;
  sessionVersion?: number;
} | null): IdentidadeUsuario | null {
  if (!user?.papel || !user.titularUserId || !user.situacao) return null;
  if (!loginPermitido(user.situacao)) return null;
  return {
    id: user.id,
    openId: user.openId ?? "",
    name: user.name ?? null,
    email: user.email ?? null,
    role: user.role === "admin" ? "admin" : "user",
    papel: user.papel,
    titularUserId: user.titularUserId,
    situacao: user.situacao,
    sessionVersion: user.sessionVersion ?? 0,
  };
}

/** Banco indisponível só cai no espelho do Principal. Os demais não recebem lista vazia no lugar do erro. */
export function deveUsarEspelhoQuandoBancoCai(identidade: IdentidadeUsuario | null): boolean {
  return !!identidade && identidade.papel === "principal" && identidade.situacao === "ativo";
}

/**
 * Filtra a ficha completa. Não troca o array por { id, nome }.
 * Com a consulta concluída, o espelho só completa fazenda que o banco devolveu.
 * consultaMysqlConcluida false é o fallback do Principal, depois da identidade válida.
 */
export function comporListaFazendas<T extends LinhaFazendaLista>(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  registros: readonly T[];
  locais: readonly T[];
  /** Ausente ou true: a consulta respondeu, mesmo vazia. Não acrescenta id só do espelho. */
  consultaMysqlConcluida?: boolean;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
}): ResultadoListaFazendas<T> {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };

  const daConta = entrada.registros.filter((row) => row.userId === identidade.titularUserId);
  const locaisDaConta = entrada.locais.filter((row) => row.userId === identidade.titularUserId);
  const fazendasDoTitular = daConta.map((row) => ({ id: row.id, userId: row.userId }));
  const extras = {
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
  };

  const autorizada = (row: T) => autorizarOperacao({
    identidade,
    permissoes: entrada.permissoes,
    permissaoId: "fazendas.visualizar",
    fazendasDoTitular,
    vinculos: entrada.vinculos,
    fazendaId: row.id,
    fazenda: { id: row.id, userId: row.userId },
    ...extras,
  });

  if (identidade.papel !== "principal" && !entrada.permissoes.includes("fazendas.visualizar")) {
    return { ok: false, motivo: "sem_permissao" };
  }

  const locaisPorId = new Map(locaisDaConta.map((row) => [row.id, row]));
  const idsDoBanco = new Set<number>();
  const fazendas: T[] = [];
  for (const row of daConta) {
    if (!autorizada(row).ok) continue;
    idsDoBanco.add(row.id);
    const local = locaisPorId.get(row.id);
    fazendas.push(local && local.userId === identidade.titularUserId ? mergeFazendaData(row, local) : row);
  }
  if (entrada.consultaMysqlConcluida === false) {
    for (const local of locaisDaConta) {
      if (idsDoBanco.has(local.id)) continue;
      if (!autorizada(local).ok) continue;
      fazendas.push(local);
    }
  }
  return { ok: true, fazendas };
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
    const identidade = identidadeDaLista(ctx.user);
    if (!identidade) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    }
    const montar = (
      registros: Array<Record<string, any> & { id: number; userId: number }>,
      locais: Array<Record<string, any> & { id: number; userId: number }>,
      permissoes: string[],
      vinculos: Array<{ userId: number; fazendaId: number }>,
      consultaMysqlConcluida: boolean,
    ) => {
      const resultado = comporListaFazendas({
        identidade, permissoes, vinculos, registros, locais, consultaMysqlConcluida,
      });
      if (!resultado.ok) {
        throw new TRPCError({
          code: resultado.motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
          message: resultado.motivo === "sem_identidade"
            ? "Sessão inválida."
            : "Sem permissão para consultar as fazendas.",
        });
      }
      return resultado.fazendas;
    };
    try {
      const rows = await db.select().from(fazendas)
        .where(eq(fazendas.userId, identidade.titularUserId))
        .orderBy(desc(fazendas.createdAt));
      const permissoes = identidade.papel === "principal"
        ? []
        : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
          eq(usuarioPermissoes.userId, identidade.id),
          eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
        ))).map((row) => row.permissao);
      const vinculos = identidade.papel === "principal"
        ? []
        : await db.select({
          userId: usuarioFazendas.userId,
          fazendaId: usuarioFazendas.fazendaId,
        }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
      const locais = (await listLocalFazendas(identidade.titularUserId))
        .filter((row) => row.userId === identidade.titularUserId);
      return montar(rows, locais, permissoes, vinculos, true);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (!isDatabaseUnavailable(error)) throw error;
      if (!deveUsarEspelhoQuandoBancoCai(identidade)) throw error;
      const locais = (await listLocalFazendas(identidade.titularUserId))
        .filter((row) => row.userId === identidade.titularUserId);
      return montar([], locais, [], [], false);
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
          return await getFazendaDeleteCheck(ctx.user.id, input.id, true);
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

function recusarPastoSemMysql(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "O banco de dados está indisponível. Nenhum pasto foi consultado ou alterado.",
  });
}

/** O arquivo local só é tocado depois que a transação já confirmou. Falha do espelho não desfaz o banco. */
export async function espelharPastoDepoisDoCommit(gravar: () => Promise<void>): Promise<void> {
  try {
    await gravar();
  } catch (erro) {
    console.warn("[pastos] Espelho local não gravado:", erro);
  }
}

// ─── PASTOS ROUTER ──────────────────────────────────────────────────────────
const pastosRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const identidade = identidadeDaLista(ctx.user);
    if (!identidade) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    }
    try {
      return await consultarPastosAutorizados(identidade);
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      if (!isDatabaseUnavailable(error)) throw error;
      recusarPastoSemMysql();
    }
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ ctx, input }) => {
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      try {
        return await consultarPastosAutorizados(identidade, input.fazendaId);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        recusarPastoSemMysql();
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
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      try {
        const id = await db.transaction(async (tx) => (
          criarPastoNaTransacao(identidade, input, adaptadorCriacaoPasto(tx))
        ));
        await espelharPastoDepoisDoCommit(() => updateLocalPasto(
          identidade.titularUserId,
          id,
          valoresNovoPasto(identidade.titularUserId, input),
        ));
        return { success: true as const, id };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        recusarPastoSemMysql();
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
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      try {
        await db.transaction(async (tx) => {
          await editarPastoNaTransacao(identidade, input, adaptadorEdicaoPasto(tx));
        });
        await espelharPastoDepoisDoCommit(() => updateLocalPasto(
          identidade.titularUserId,
          input.id,
          valoresEdicaoPasto(input),
        ));
        return { success: true as const };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        recusarPastoSemMysql();
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async () => {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "A exclusão de pastos está temporariamente indisponível para preservar os vínculos com lotes, animais e históricos.",
      });
    }),

  importarCoordenadas: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      kmlContent: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      try {
        const espelho: { id: number; coordenadas: string }[] = [];
        const resultado = await db.transaction(async (tx) => (
          importarCoordenadasNaTransacao(
            identidade,
            input,
            adaptadorImportacaoCoordenadas(tx),
            new Date().toISOString(),
            espelho,
          )
        ));
        await espelharPastoDepoisDoCommit(async () => {
          for (const item of espelho) {
            await updateLocalPasto(identidade.titularUserId, item.id, { coordenadas: item.coordenadas });
          }
        });
        return resultado;
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        recusarPastoSemMysql();
      }
    }),

  listWithDetails: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const identidade = identidadeDaLista(ctx.user);
      if (!identidade) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
      }
      const filtro = input?.fazendaId ? input.fazendaId : undefined;
      const pastosAutorizados = await consultarPastosAutorizados(identidade, filtro);
      return enriquecerPainelPastos(identidade, pastosAutorizados);
    }),
});

type PastoListaMinimo = {
  id: number;
  userId: number;
  fazendaId?: number | null;
};

export type ResultadoListaPastos<T> =
  | { ok: true; pastos: T[]; fazendasAutorizadas: number[] }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" };

/**
 * Escolhe os pastos da conta. O arquivo local não completa a lista, nem quando a consulta não concluiu.
 * Pasto cuja fazenda não está na conta fica de fora: não há fazenda comprovada.
 */
export function comporListaPastos<T extends PastoListaMinimo>(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number }[];
  pastos: readonly T[];
  locais?: readonly T[];
  consultaMysqlConcluida?: boolean;
  filtroFazendaId?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
}): ResultadoListaPastos<T> {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };
  if (identidade.papel !== "principal" && !entrada.permissoes.includes("pastos.visualizar")) {
    return { ok: false, motivo: "sem_permissao" };
  }

  const fazendasConta = entrada.fazendasDoTitular.filter((fazenda) => fazenda.userId === identidade.titularUserId);
  const extras = {
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
  };
  const fazendasAutorizadas: number[] = [];
  for (const fazenda of fazendasConta) {
    const deciso = autorizarOperacao({
      identidade,
      permissoes: entrada.permissoes,
      permissaoId: "pastos.visualizar",
      fazendasDoTitular: fazendasConta,
      vinculos: entrada.vinculos,
      fazendaId: fazenda.id,
      fazenda,
      ...extras,
    });
    if (deciso.ok) fazendasAutorizadas.push(fazenda.id);
  }
  const autorizadas = new Set(fazendasAutorizadas);
  const visivel = (pasto: T): boolean => {
    if (pasto.userId !== identidade.titularUserId) return false;
    const fazendaId = pasto.fazendaId != null ? Number(pasto.fazendaId) : null;
    return fazendaId != null && autorizadas.has(fazendaId);
  };

  let pastos = entrada.pastos.filter(visivel);
  if (entrada.filtroFazendaId != null) {
    if (!autorizadas.has(entrada.filtroFazendaId)) return { ok: true, pastos: [], fazendasAutorizadas };
    pastos = pastos.filter((pasto) => Number(pasto.fazendaId) === entrada.filtroFazendaId);
  }
  return { ok: true, pastos, fazendasAutorizadas };
}

function recusarListaPastos(motivo: "sem_identidade" | "sem_permissao"): never {
  throw new TRPCError({
    code: motivo === "sem_identidade" ? "UNAUTHORIZED" : "FORBIDDEN",
    message: motivo === "sem_identidade"
      ? "Sessão inválida."
      : "Sem permissão para consultar os pastos.",
  });
}

async function consultarPastosAutorizados(identidade: IdentidadeUsuario, filtroFazendaId?: number) {
  const permissoes = identidade.papel === "principal"
    ? []
    : (await db.select({ permissao: usuarioPermissoes.permissao }).from(usuarioPermissoes).where(and(
      eq(usuarioPermissoes.userId, identidade.id),
      eq(usuarioPermissoes.titularUserId, identidade.titularUserId),
    ))).map((row) => row.permissao);
  const vinculos = identidade.papel === "principal"
    ? []
    : await db.select({
      userId: usuarioFazendas.userId,
      fazendaId: usuarioFazendas.fazendaId,
    }).from(usuarioFazendas).where(eq(usuarioFazendas.userId, identidade.id));
  const fazendasConta = await db.select({ id: fazendas.id, userId: fazendas.userId })
    .from(fazendas).where(eq(fazendas.userId, identidade.titularUserId));
  const previa = comporListaPastos({
    identidade,
    permissoes,
    vinculos,
    fazendasDoTitular: fazendasConta,
    pastos: [],
    consultaMysqlConcluida: true,
    filtroFazendaId,
  });
  if (!previa.ok) recusarListaPastos(previa.motivo);
  if (previa.fazendasAutorizadas.length === 0) return [];
  if (filtroFazendaId != null && !previa.fazendasAutorizadas.includes(filtroFazendaId)) return [];
  const conditions = [
    eq(pastos.userId, identidade.titularUserId),
    inArray(pastos.fazendaId, previa.fazendasAutorizadas),
  ];
  if (filtroFazendaId != null) conditions.push(eq(pastos.fazendaId, filtroFazendaId));
  const rows = await db.select().from(pastos).where(and(...conditions)).orderBy(desc(pastos.createdAt));
  const resultado = comporListaPastos({
    identidade,
    permissoes,
    vinculos,
    fazendasDoTitular: fazendasConta,
    pastos: rows,
    consultaMysqlConcluida: true,
    filtroFazendaId,
  });
  if (!resultado.ok) recusarListaPastos(resultado.motivo);
  return resultado.pastos;
}

type LotePainelMinimo = {
  id: number;
  userId: number;
  fazendaId?: number | null;
  pastoAtualId?: number | null;
  dataEntradaPasto?: string | Date | null;
};

type ContagemLotePainel = { loteId: number; quantidade: number; userId?: number | null };

/**
 * Completa o painel só com fazenda, lote, animal e saída da própria conta.
 * O pasto já chegou autorizado. O lote só entra se for do titular, estiver nesse pasto
 * e tiver a mesma fazenda do pasto. O registro divergente permanece no banco.
 */
export function montarPainelPastos<
  TPasto extends PastoListaMinimo & { nome?: string | null; capacidade?: number | null },
  TLote extends LotePainelMinimo,
>(entrada: {
  identidade: IdentidadeUsuario;
  pastosAutorizados: readonly TPasto[];
  lotes: readonly TLote[];
  contagemPorLote?: readonly ContagemLotePainel[];
  fazendas: readonly { id: number; userId: number; nome?: string | null }[];
  movimentacoes?: readonly { userId: number; pastoOrigemId?: number | null; dataSaida?: string | Date | null }[];
  hoje?: string | Date;
}) {
  const titular = entrada.identidade.titularUserId;
  const nomes = new Map<number, string>();
  for (const fazenda of entrada.fazendas) {
    if (fazenda.userId !== titular || fazenda.nome == null) continue;
    nomes.set(fazenda.id, fazenda.nome);
  }
  const contagem = new Map<number, number>();
  for (const item of entrada.contagemPorLote ?? []) {
    if (item.userId != null && item.userId !== titular) continue;
    contagem.set(item.loteId, Number(item.quantidade) || 0);
  }
  const pastoPorId = new Map(entrada.pastosAutorizados.map((pasto) => [pasto.id, pasto]));
  const lotesPorPasto = new Map<number, TLote[]>();
  for (const lote of entrada.lotes) {
    if (lote.userId !== titular || lote.pastoAtualId == null) continue;
    const pasto = pastoPorId.get(lote.pastoAtualId);
    const fazendaPasto = pasto?.fazendaId != null ? Number(pasto.fazendaId) : null;
    const fazendaLote = lote.fazendaId != null ? Number(lote.fazendaId) : null;
    if (fazendaPasto == null || fazendaLote == null || fazendaLote !== fazendaPasto) continue;
    const lista = lotesPorPasto.get(lote.pastoAtualId) ?? [];
    lista.push(lote);
    lotesPorPasto.set(lote.pastoAtualId, lista);
  }
  const saidaPorPasto = new Map<number, { dataSaida?: string | Date | null }>();
  const marcoSaida = (valor: string | Date | null | undefined) => {
    if (valor == null || valor === "") return null;
    const tempo = new Date(valor).getTime();
    return Number.isNaN(tempo) ? null : tempo;
  };
  const saidas = [...(entrada.movimentacoes ?? [])]
    .filter((mov) => mov.userId === titular && mov.pastoOrigemId != null)
    .sort((a, b) => {
      const marcoA = marcoSaida(a.dataSaida);
      const marcoB = marcoSaida(b.dataSaida);
      if (marcoA == null && marcoB == null) return 0;
      if (marcoA == null) return -1;
      if (marcoB == null) return 1;
      return marcoB - marcoA;
    });
  for (const mov of saidas) {
    const pastoId = Number(mov.pastoOrigemId);
    if (!saidaPorPasto.has(pastoId)) saidaPorPasto.set(pastoId, mov);
  }
  const hoje = entrada.hoje ?? new Date();

  return entrada.pastosAutorizados.map((pasto) => {
    const fazendaId = pasto.fazendaId != null ? Number(pasto.fazendaId) : null;
    const fazendaNome = fazendaId != null ? nomes.get(fazendaId) ?? null : null;
    const lotesNoPasto = lotesPorPasto.get(pasto.id) ?? [];
    const lotesEnriquecidos = lotesNoPasto.map((lote) => {
      const diasNoPasto = lote.dataEntradaPasto ? diasEntre(lote.dataEntradaPasto, hoje) : null;
      return {
        ...lote,
        qtdAnimais: contagem.get(lote.id) ?? 0,
        pastoNome: pasto.nome ?? null,
        pastoCapacidade: pasto.capacidade ?? null,
        fazendaNome,
        diasNoPasto,
      };
    });
    const qtdAnimais = lotesEnriquecidos.reduce((soma, lote) => soma + lote.qtdAnimais, 0);
    const capacidade = pasto.capacidade ?? 0;
    const pctOcupacao = capacidade > 0 ? Math.min(100, Math.round((qtdAnimais / capacidade) * 100)) : null;
    const ultimaSaida = saidaPorPasto.get(pasto.id);
    const diasDescanso = !lotesNoPasto.length && ultimaSaida?.dataSaida
      ? diasEntre(ultimaSaida.dataSaida, hoje)
      : null;
    const diasPastejo = lotesEnriquecidos.length
      ? Math.max(...lotesEnriquecidos.map((lote) => lote.diasNoPasto ?? 0))
      : null;
    return {
      ...pasto,
      fazendaNome,
      qtdAnimais,
      qtdLotes: lotesNoPasto.length,
      pctOcupacao,
      diasPastejo,
      diasDescanso,
      lotes: lotesEnriquecidos,
    };
  });
}

export function comporPainelPastos<
  TPasto extends PastoListaMinimo & { nome?: string | null; capacidade?: number | null },
  TLote extends LotePainelMinimo,
>(entrada: Parameters<typeof comporListaPastos<TPasto>>[0] & {
  lotesDoTitular?: readonly TLote[];
  contagemPorLote?: readonly ContagemLotePainel[];
  nomesFazendas?: readonly { id: number; userId: number; nome?: string | null }[];
  movimentacoes?: readonly { userId: number; pastoOrigemId?: number | null; dataSaida?: string | Date | null }[];
  hoje?: string | Date;
}) {
  const lista = comporListaPastos(entrada);
  if (!lista.ok || !entrada.identidade) return lista;
  return {
    ok: true as const,
    fazendasAutorizadas: lista.fazendasAutorizadas,
    pastos: montarPainelPastos({
      identidade: entrada.identidade,
      pastosAutorizados: lista.pastos,
      lotes: entrada.lotesDoTitular ?? [],
      contagemPorLote: entrada.contagemPorLote,
      fazendas: entrada.nomesFazendas ?? entrada.fazendasDoTitular,
      movimentacoes: entrada.movimentacoes,
      hoje: entrada.hoje,
    }),
  };
}

async function enriquecerPainelPastos(
  identidade: IdentidadeUsuario,
  pastosAutorizados: Awaited<ReturnType<typeof consultarPastosAutorizados>>,
) {
  if (pastosAutorizados.length === 0) return [];
  const pastoIds = pastosAutorizados.map((pasto) => pasto.id);
  const fazendaIds = [...new Set(pastosAutorizados.map((pasto) => pasto.fazendaId))];
  const fazendasConta = fazendaIds.length === 0 ? [] : await db.select({ id: fazendas.id, userId: fazendas.userId, nome: fazendas.nome })
    .from(fazendas)
    .where(and(eq(fazendas.userId, identidade.titularUserId), inArray(fazendas.id, fazendaIds)));
  const lotesConta = (await db.select({ lote: lotes }).from(lotes).innerJoin(pastos, and(
    eq(pastos.id, lotes.pastoAtualId),
    eq(pastos.userId, identidade.titularUserId),
    eq(lotes.fazendaId, pastos.fazendaId),
  )).where(and(
    eq(lotes.userId, identidade.titularUserId),
    inArray(lotes.pastoAtualId, pastoIds),
  )).orderBy(lotes.id)).map((row) => row.lote);
  const loteIds = lotesConta.map((lote) => lote.id);
  const contagens = loteIds.length === 0 ? [] : await db.select({
    loteId: animais.loteId,
    quantidade: sql<number>`COUNT(*)`,
  }).from(animais).where(and(
    eq(animais.userId, identidade.titularUserId),
    eq(animais.status, "ativo"),
    inArray(animais.loteId, loteIds),
  )).groupBy(animais.loteId);
  const saidas = await db.select({
    userId: lotePastoMovimentacoes.userId,
    pastoOrigemId: lotePastoMovimentacoes.pastoOrigemId,
    dataSaida: lotePastoMovimentacoes.dataSaida,
  }).from(lotePastoMovimentacoes).where(and(
    eq(lotePastoMovimentacoes.userId, identidade.titularUserId),
    inArray(lotePastoMovimentacoes.pastoOrigemId, pastoIds),
  )).orderBy(desc(lotePastoMovimentacoes.dataSaida));
  return montarPainelPastos({
    identidade,
    pastosAutorizados,
    lotes: lotesConta,
    contagemPorLote: contagens.map((row) => ({
      loteId: Number(row.loteId),
      quantidade: Number(row.quantidade),
      userId: identidade.titularUserId,
    })),
    fazendas: fazendasConta,
    movimentacoes: saidas,
  });
}

type StatusNovoPasto = "ativo" | "descanso" | "vazio" | "reforma" | "interditado" | "reserva" | "sem_uso";

type EntradaCriarPasto = {
  fazendaId: number;
  nome: string;
  sigla?: string;
  tipo?: string;
  tipoPastagem?: string;
  area?: string;
  incluirArea?: boolean;
  capacidade?: number;
  status?: StatusNovoPasto;
  observacoes?: string;
  userId?: number;
};

export type ValoresNovoPasto = {
  userId: number;
  fazendaId: number;
  nome: string;
  sigla?: string;
  tipo?: string;
  tipoPastagem?: string;
  area?: string;
  incluirArea?: boolean;
  capacidade?: number;
  status?: StatusNovoPasto;
  observacoes?: string;
};

export type ResultadoCriacaoPasto =
  | { ok: true; valores: ValoresNovoPasto }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "fazenda_recusada" };

function valoresNovoPasto(titularUserId: number, input: EntradaCriarPasto): ValoresNovoPasto {
  const valores: ValoresNovoPasto = {
    userId: titularUserId,
    fazendaId: input.fazendaId,
    nome: input.nome,
  };
  if (input.sigla !== undefined) valores.sigla = input.sigla;
  if (input.tipo !== undefined) valores.tipo = input.tipo;
  if (input.tipoPastagem !== undefined) valores.tipoPastagem = input.tipoPastagem;
  if (input.area !== undefined) valores.area = input.area;
  if (input.incluirArea !== undefined) valores.incluirArea = input.incluirArea;
  if (input.capacidade !== undefined) valores.capacidade = input.capacidade;
  if (input.status !== undefined) valores.status = input.status;
  if (input.observacoes !== undefined) valores.observacoes = input.observacoes;
  return valores;
}

/** O userId enviado pelo navegador não escolhe o dono. A fazenda alheia e a inexistente recebem a mesma recusa. */
export function decidirCriacaoPasto(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number }[];
  fazenda: { id: number; userId: number } | null;
  campos: EntradaCriarPasto;
  sessionVersionDaSessao?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
}): ResultadoCriacaoPasto {
  const deciso = autorizarOperacao({
    identidade: entrada.identidade,
    permissoes: entrada.permissoes,
    permissaoId: "pastos.criar",
    fazendasDoTitular: entrada.fazendasDoTitular,
    vinculos: entrada.vinculos,
    fazendaId: entrada.campos.fazendaId,
    fazenda: entrada.fazenda,
    sessionVersionDaSessao: entrada.sessionVersionDaSessao,
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: entrada.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) {
    return { ok: false, motivo: deciso.motivo === "sem_identidade" || deciso.motivo === "sem_permissao" ? deciso.motivo : "fazenda_recusada" };
  }
  return { ok: true, valores: valoresNovoPasto(deciso.contexto.titularUserId, entrada.campos) };
}

function recusarCriacaoPasto(motivo: "sem_identidade" | "sem_permissao" | "fazenda_recusada"): never {
  if (motivo === "sem_identidade") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  if (motivo === "sem_permissao") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para cadastrar pastos." });
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "Fazenda não encontrada." });
}

export function fazendaLocalDoTitular(
  fazendas: readonly { id: number; userId: number }[],
  titularUserId: number,
  fazendaId: number,
) {
  return fazendas.find((fazenda) => fazenda.userId === titularUserId && fazenda.id === fazendaId) ?? null;
}

type UsuarioTravado = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string | null;
  papel: string;
  titularUserId: number;
  situacao: string;
  sessionVersion: number;
};

export type TransacaoCriacaoPasto = {
  travarUsuario(id: number): Promise<UsuarioTravado | null>;
  travarPermissoes(userId: number, titularUserId: number): Promise<string[]>;
  travarVinculos(userId: number): Promise<{ userId: number; fazendaId: number }[]>;
  travarFazenda(id: number): Promise<{ id: number; userId: number } | null>;
  inserirPasto(valores: ValoresNovoPasto): Promise<number>;
};

function identidadeTravada(row: UsuarioTravado): IdentidadeUsuario | null {
  if (row.papel !== "principal" && row.papel !== "secundario" && row.papel !== "comum") return null;
  if (row.situacao !== "ativo" && row.situacao !== "inativo" && row.situacao !== "convidado") return null;
  if (!Number.isInteger(row.titularUserId) || row.titularUserId <= 0) return null;
  return {
    id: row.id,
    openId: row.openId,
    name: row.name,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    papel: row.papel,
    titularUserId: row.titularUserId,
    situacao: row.situacao,
    sessionVersion: row.sessionVersion,
  };
}

/**
 * Trava o usuário, a permissão, o vínculo e a fazenda antes de inserir.
 * O bloqueio vale até o fim da transação. Quem revoga espera ou é visto na releitura.
 * Não cobre uma revogação que use outras linhas, nem o intervalo vazio do READ COMMITTED.
 */
export async function criarPastoNaTransacao(
  identidade: IdentidadeUsuario,
  input: EntradaCriarPasto,
  tx: TransacaoCriacaoPasto,
): Promise<number> {
  const usuario = await tx.travarUsuario(identidade.id);
  const fresca = usuario ? identidadeTravada(usuario) : null;
  if (!fresca || fresca.sessionVersion !== identidade.sessionVersion) recusarCriacaoPasto("sem_identidade");
  const permissoes = await tx.travarPermissoes(fresca.id, fresca.titularUserId);
  const vinculos = await tx.travarVinculos(fresca.id);
  const fazenda = await tx.travarFazenda(input.fazendaId);
  const decisao = decidirCriacaoPasto({
    identidade: fresca,
    permissoes,
    vinculos,
    fazendasDoTitular: fazenda && fazenda.userId === fresca.titularUserId ? [fazenda] : [],
    fazenda,
    campos: input,
    sessionVersionDaSessao: identidade.sessionVersion,
  });
  if (!decisao.ok) recusarCriacaoPasto(decisao.motivo);
  return tx.inserirPasto(decisao.valores);
}

function linhasMysql(result: unknown): Record<string, unknown>[] {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  const raw = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
}

function adaptadorCriacaoPasto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): TransacaoCriacaoPasto {
  return {
    async travarUsuario(id) {
      const result = await tx.execute(sql`
        SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
        FROM users WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        openId: String(row.openId ?? ""),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
        role: row.role == null ? null : String(row.role),
        papel: String(row.papel),
        titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao),
        sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async travarPermissoes(userId, titularUserId) {
      const result = await tx.execute(sql`
        SELECT permissao FROM usuario_permissoes
        WHERE userId = ${userId} AND titularUserId = ${titularUserId}
        FOR UPDATE
      `);
      return linhasMysql(result).map((row) => String(row.permissao));
    },
    async travarVinculos(userId) {
      const result = await tx.execute(sql`
        SELECT userId, fazendaId FROM usuario_fazendas
        WHERE userId = ${userId} FOR UPDATE
      `);
      return linhasMysql(result).map((row) => ({
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
      }));
    },
    async travarFazenda(id) {
      const result = await tx.execute(sql`
        SELECT id, userId FROM fazendas WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return { id: Number(row.id), userId: Number(row.userId) };
    },
    async inserirPasto(valores) {
      const result = await tx.insert(pastos).values(valores);
      const id = Number((result as { insertId?: number }[])?.[0]?.insertId ?? (result as { insertId?: number }).insertId);
      if (!Number.isFinite(id) || id <= 0) throw new Error("Pasto sem identificador.");
      return id;
    },
  };
}

type CamposEdicaoPasto = {
  nome?: string;
  sigla?: string;
  tipo?: string;
  tipoPastagem?: string;
  area?: string;
  incluirArea?: boolean;
  capacidade?: number;
  status?: StatusNovoPasto;
  observacoes?: string;
};

type EntradaEditarPasto = CamposEdicaoPasto & {
  id: number;
  userId?: number;
  fazendaId?: number;
};

export type ResultadoEdicaoPasto =
  | { ok: true; valores: CamposEdicaoPasto }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "nao_encontrado" };

function valoresEdicaoPasto(input: EntradaEditarPasto): CamposEdicaoPasto {
  const valores: CamposEdicaoPasto = {};
  if (input.nome !== undefined) valores.nome = input.nome;
  if (input.sigla !== undefined) valores.sigla = input.sigla;
  if (input.tipo !== undefined) valores.tipo = input.tipo;
  if (input.tipoPastagem !== undefined) valores.tipoPastagem = input.tipoPastagem;
  if (input.area !== undefined) valores.area = input.area;
  if (input.incluirArea !== undefined) valores.incluirArea = input.incluirArea;
  if (input.capacidade !== undefined) valores.capacidade = input.capacidade;
  if (input.status !== undefined) valores.status = input.status;
  if (input.observacoes !== undefined) valores.observacoes = input.observacoes;
  return valores;
}

/** Sem a permissão, a recusa vem antes de dizer se o pasto existe. Fazenda alheia e pasto ausente usam a mesma resposta. */
export function avaliarEdicaoPasto(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number }[];
  pasto: { id: number; userId: number; fazendaId: number } | null;
  fazenda: { id: number; userId: number } | null;
  campos: EntradaEditarPasto;
  sessionVersionDaSessao?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
}): ResultadoEdicaoPasto {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };
  if (entrada.sessionVersionDaSessao != null && entrada.sessionVersionDaSessao !== identidade.sessionVersion) {
    return { ok: false, motivo: "sem_identidade" };
  }
  if (identidade.papel !== "principal" && !entrada.permissoes.includes("pastos.editar")) {
    return { ok: false, motivo: "sem_permissao" };
  }
  const pasto = entrada.pasto;
  if (!pasto || pasto.userId !== identidade.titularUserId || pasto.id !== entrada.campos.id) {
    return { ok: false, motivo: "nao_encontrado" };
  }
  const fazenda = entrada.fazenda;
  if (!fazenda || fazenda.id !== pasto.fazendaId || fazenda.userId !== identidade.titularUserId) {
    return { ok: false, motivo: "nao_encontrado" };
  }
  const deciso = autorizarOperacao({
    identidade,
    permissoes: entrada.permissoes,
    permissaoId: "pastos.editar",
    fazendasDoTitular: entrada.fazendasDoTitular,
    vinculos: entrada.vinculos,
    fazendaId: pasto.fazendaId,
    fazenda,
    sessionVersionDaSessao: entrada.sessionVersionDaSessao,
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: entrada.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) {
    return {
      ok: false,
      motivo: deciso.motivo === "sem_identidade" || deciso.motivo === "sem_permissao" ? deciso.motivo : "nao_encontrado",
    };
  }
  return { ok: true, valores: valoresEdicaoPasto(entrada.campos) };
}

function recusarEdicaoPasto(motivo: "sem_identidade" | "sem_permissao" | "nao_encontrado"): never {
  if (motivo === "sem_identidade") {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
  }
  if (motivo === "sem_permissao") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para editar pastos." });
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "Pasto não encontrado." });
}

export function pastoLocalDoTitular(
  pastos: readonly { id: number; userId: number; fazendaId?: number | null }[],
  titularUserId: number,
  id: number,
) {
  return pastos.find((pasto) => pasto.userId === titularUserId && pasto.id === id) ?? null;
}

export type TransacaoEdicaoPasto = {
  travarUsuario(id: number): Promise<UsuarioTravado | null>;
  travarPermissoes(userId: number, titularUserId: number): Promise<string[]>;
  travarVinculos(userId: number): Promise<{ userId: number; fazendaId: number }[]>;
  travarPasto(id: number, titularUserId: number): Promise<{ id: number; userId: number; fazendaId: number } | null>;
  travarFazenda(id: number): Promise<{ id: number; userId: number } | null>;
  atualizarPasto(id: number, titularUserId: number, valores: CamposEdicaoPasto): Promise<void>;
  relerPasto(id: number, titularUserId: number): Promise<{ id: number; userId: number; fazendaId: number } | null>;
};

/**
 * Trava o usuário, a permissão e o vínculo antes do pasto.
 * O pasto vem antes da fazenda porque o número da fazenda sai do registro, não do navegador.
 * A trava vale até o fim da transação. Não cobre revogação em outras linhas nem o intervalo vazio do READ COMMITTED.
 */
export async function editarPastoNaTransacao(
  identidade: IdentidadeUsuario,
  input: EntradaEditarPasto,
  tx: TransacaoEdicaoPasto,
): Promise<void> {
  const usuario = await tx.travarUsuario(identidade.id);
  const fresca = usuario ? identidadeTravada(usuario) : null;
  if (!fresca || fresca.sessionVersion !== identidade.sessionVersion || !loginPermitido(fresca.situacao)) {
    recusarEdicaoPasto("sem_identidade");
  }
  const permissoes = await tx.travarPermissoes(fresca.id, fresca.titularUserId);
  const vinculos = await tx.travarVinculos(fresca.id);
  if (fresca.papel !== "principal" && !permissoes.includes("pastos.editar")) recusarEdicaoPasto("sem_permissao");
  const pasto = await tx.travarPasto(input.id, fresca.titularUserId);
  const fazenda = pasto ? await tx.travarFazenda(pasto.fazendaId) : null;
  const decisao = avaliarEdicaoPasto({
    identidade: fresca,
    permissoes,
    vinculos,
    fazendasDoTitular: fazenda && fazenda.userId === fresca.titularUserId ? [fazenda] : [],
    pasto,
    fazenda,
    campos: input,
    sessionVersionDaSessao: identidade.sessionVersion,
  });
  if (!decisao.ok) recusarEdicaoPasto(decisao.motivo);
  await tx.atualizarPasto(input.id, fresca.titularUserId, decisao.valores);
  const confirmado = await tx.relerPasto(input.id, fresca.titularUserId);
  if (!confirmado || confirmado.userId !== fresca.titularUserId || confirmado.fazendaId !== pasto?.fazendaId) {
    recusarEdicaoPasto("nao_encontrado");
  }
}

function adaptadorEdicaoPasto(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): TransacaoEdicaoPasto {
  const lerPasto = async (id: number, titularUserId: number, travar: boolean) => {
    const result = await tx.execute(travar
      ? sql`SELECT id, userId, fazendaId FROM pastos WHERE id = ${id} AND userId = ${titularUserId} FOR UPDATE`
      : sql`SELECT id, userId, fazendaId FROM pastos WHERE id = ${id} AND userId = ${titularUserId}`);
    const row = linhasMysql(result)[0];
    if (!row) return null;
    return { id: Number(row.id), userId: Number(row.userId), fazendaId: Number(row.fazendaId) };
  };
  return {
    async travarUsuario(id) {
      const result = await tx.execute(sql`
        SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
        FROM users WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        openId: String(row.openId ?? ""),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
        role: row.role == null ? null : String(row.role),
        papel: String(row.papel),
        titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao),
        sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async travarPermissoes(userId, titularUserId) {
      const result = await tx.execute(sql`
        SELECT permissao FROM usuario_permissoes
        WHERE userId = ${userId} AND titularUserId = ${titularUserId}
        FOR UPDATE
      `);
      return linhasMysql(result).map((row) => String(row.permissao));
    },
    async travarVinculos(userId) {
      const result = await tx.execute(sql`
        SELECT userId, fazendaId FROM usuario_fazendas
        WHERE userId = ${userId} FOR UPDATE
      `);
      return linhasMysql(result).map((row) => ({
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
      }));
    },
    travarPasto: (id, titularUserId) => lerPasto(id, titularUserId, true),
    async travarFazenda(id) {
      const result = await tx.execute(sql`
        SELECT id, userId FROM fazendas WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return { id: Number(row.id), userId: Number(row.userId) };
    },
    async atualizarPasto(id, titularUserId, valores) {
      if (Object.keys(valores).length === 0) return;
      await tx.update(pastos).set(valores).where(and(eq(pastos.id, id), eq(pastos.userId, titularUserId)));
    },
    relerPasto: (id, titularUserId) => lerPasto(id, titularUserId, false),
  };
}

type PastoImportavel = {
  id: number;
  userId: number;
  fazendaId: number;
  nome: string;
  sigla?: string | null;
};

export type PlanoImportacaoCoordenadas =
  | {
      ok: true;
      importados: number;
      ignorados: string[];
      totalNoArquivo: number;
      atualizacoes: { id: number; coordenadas: string }[];
    }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "nao_encontrado" | "kml_vazio" | "sem_subdivisao" };

/** O texto do KML entra como veio, dentro de { coordinates, importadoEm }. Não mexe em número nem em ordem. */
export function montarPayloadCoordenadas(coordinates: string, importadoEm: string) {
  return JSON.stringify({ coordinates, importadoEm });
}

export function planejarImportacaoCoordenadas(entrada: {
  identidade: IdentidadeUsuario | null;
  permissoes: readonly string[];
  vinculos: readonly { userId: number; fazendaId: number }[];
  fazendasDoTitular: readonly { id: number; userId: number }[];
  fazenda: { id: number; userId: number } | null;
  pastos: readonly PastoImportavel[];
  fazendaId: number;
  kmlContent: string;
  importadoEm: string;
  sessionVersionDaSessao?: number | null;
  titularInformadoPeloCliente?: number | null;
  papelInformadoPeloCliente?: string | null;
  permissoesInformadasPeloCliente?: readonly string[] | null;
  fazendasInformadasPeloCliente?: readonly number[] | null;
}): PlanoImportacaoCoordenadas {
  const identidade = entrada.identidade;
  if (!identidade || !loginPermitido(identidade.situacao)) return { ok: false, motivo: "sem_identidade" };
  if (entrada.sessionVersionDaSessao != null && entrada.sessionVersionDaSessao !== identidade.sessionVersion) {
    return { ok: false, motivo: "sem_identidade" };
  }
  if (identidade.papel !== "principal" && !entrada.permissoes.includes("pastos.editar")) {
    return { ok: false, motivo: "sem_permissao" };
  }
  const fazenda = entrada.fazenda;
  if (!fazenda || fazenda.id !== entrada.fazendaId || fazenda.userId !== identidade.titularUserId) {
    return { ok: false, motivo: "nao_encontrado" };
  }
  const deciso = autorizarOperacao({
    identidade,
    permissoes: entrada.permissoes,
    permissaoId: "pastos.editar",
    fazendasDoTitular: entrada.fazendasDoTitular,
    vinculos: entrada.vinculos,
    fazendaId: entrada.fazendaId,
    fazenda,
    sessionVersionDaSessao: entrada.sessionVersionDaSessao,
    titularInformadoPeloCliente: entrada.titularInformadoPeloCliente,
    papelInformadoPeloCliente: entrada.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: entrada.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: entrada.fazendasInformadasPeloCliente,
  });
  if (!deciso.ok) {
    return {
      ok: false,
      motivo: deciso.motivo === "sem_identidade" || deciso.motivo === "sem_permissao" ? deciso.motivo : "nao_encontrado",
    };
  }
  const placemarks = extrairCoordenadasKml(entrada.kmlContent);
  if (placemarks.length === 0) return { ok: false, motivo: "kml_vazio" };
  const pastos = entrada.pastos.filter((pasto) => (
    pasto.userId === identidade.titularUserId && pasto.fazendaId === entrada.fazendaId
  ));
  if (pastos.length === 0) return { ok: false, motivo: "sem_subdivisao" };
  const coordenadasPorNome = mapaCoordenadasPorNome(placemarks);
  const lookup = new Map<string, number>();
  for (const pasto of pastos) {
    lookup.set(normalizarNomeSubdivisao(pasto.nome), pasto.id);
    if (pasto.sigla?.trim()) lookup.set(normalizarNomeSubdivisao(pasto.sigla), pasto.id);
  }
  const atualizados = new Set<number>();
  const ignorados: string[] = [];
  const atualizacoes: { id: number; coordenadas: string }[] = [];
  for (const [nomeNorm, coordinates] of coordenadasPorNome) {
    const pastoId = lookup.get(nomeNorm);
    if (!pastoId) {
      const original = placemarks.find((item) => normalizarNomeSubdivisao(item.nome) === nomeNorm);
      ignorados.push(original?.nome ?? nomeNorm);
      continue;
    }
    const payload = montarPayloadCoordenadas(coordinates, entrada.importadoEm);
    const indice = atualizacoes.findIndex((item) => item.id === pastoId);
    if (indice >= 0) atualizacoes[indice] = { id: pastoId, coordenadas: payload };
    else atualizacoes.push({ id: pastoId, coordenadas: payload });
    atualizados.add(pastoId);
  }
  return {
    ok: true,
    importados: atualizados.size,
    ignorados: [...new Set(ignorados)],
    totalNoArquivo: coordenadasPorNome.size,
    atualizacoes,
  };
}

function recusarPlanoImportacao(plano: PlanoImportacaoCoordenadas): never {
  if (plano.ok) throw new Error("Plano válido.");
  if (plano.motivo === "kml_vazio") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma coordenada encontrada no arquivo KML/KMZ" });
  }
  if (plano.motivo === "sem_subdivisao") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cadastre subdivisões antes de importar coordenadas" });
  }
  recusarEdicaoPasto(plano.motivo);
}

export type TransacaoImportacaoCoordenadas = {
  travarUsuario(id: number): Promise<UsuarioTravado | null>;
  travarPermissoes(userId: number, titularUserId: number): Promise<string[]>;
  travarVinculos(userId: number): Promise<{ userId: number; fazendaId: number }[]>;
  travarPastosDaFazenda(titularUserId: number, fazendaId: number): Promise<PastoImportavel[]>;
  travarFazenda(id: number): Promise<{ id: number; userId: number } | null>;
  gravarCoordenadas(id: number, titularUserId: number, coordenadas: string): Promise<void>;
  relerPasto(id: number, titularUserId: number): Promise<{ id: number; userId: number; fazendaId: number; coordenadas: string | null } | null>;
};

/**
 * Trava o usuário, a permissão e o vínculo, depois os pastos da fazenda e a fazenda.
 * Os pastos vêm antes da fazenda, na mesma ordem da edição, para as duas gravações não se cruzarem.
 */
export async function importarCoordenadasNaTransacao(
  identidade: IdentidadeUsuario,
  input: { fazendaId: number; kmlContent: string },
  tx: TransacaoImportacaoCoordenadas,
  importadoEm: string,
  espelho?: { id: number; coordenadas: string }[],
) {
  const usuario = await tx.travarUsuario(identidade.id);
  const fresca = usuario ? identidadeTravada(usuario) : null;
  if (!fresca || fresca.sessionVersion !== identidade.sessionVersion || !loginPermitido(fresca.situacao)) {
    recusarEdicaoPasto("sem_identidade");
  }
  const permissoes = await tx.travarPermissoes(fresca.id, fresca.titularUserId);
  const vinculos = await tx.travarVinculos(fresca.id);
  if (fresca.papel !== "principal" && !permissoes.includes("pastos.editar")) recusarEdicaoPasto("sem_permissao");
  const pastos = await tx.travarPastosDaFazenda(fresca.titularUserId, input.fazendaId);
  const fazenda = await tx.travarFazenda(input.fazendaId);
  const plano = planejarImportacaoCoordenadas({
    identidade: fresca,
    permissoes,
    vinculos,
    fazendasDoTitular: fazenda && fazenda.userId === fresca.titularUserId ? [fazenda] : [],
    fazenda,
    pastos,
    fazendaId: input.fazendaId,
    kmlContent: input.kmlContent,
    importadoEm,
    sessionVersionDaSessao: identidade.sessionVersion,
  });
  if (!plano.ok) recusarPlanoImportacao(plano);
  for (const item of plano.atualizacoes) {
    await tx.gravarCoordenadas(item.id, fresca.titularUserId, item.coordenadas);
    const confirmado = await tx.relerPasto(item.id, fresca.titularUserId);
    if (!confirmado || confirmado.userId !== fresca.titularUserId || confirmado.fazendaId !== input.fazendaId) {
      recusarEdicaoPasto("nao_encontrado");
    }
    if (confirmado.coordenadas !== item.coordenadas) throw new Error("Coordenadas não confirmadas.");
  }
  if (espelho) espelho.push(...plano.atualizacoes);
  return { importados: plano.importados, ignorados: plano.ignorados, totalNoArquivo: plano.totalNoArquivo };
}

function adaptadorImportacaoCoordenadas(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): TransacaoImportacaoCoordenadas {
  return {
    async travarUsuario(id) {
      const result = await tx.execute(sql`
        SELECT id, openId, name, email, role, papel, titularUserId, situacao, sessionVersion
        FROM users WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        openId: String(row.openId ?? ""),
        name: row.name == null ? null : String(row.name),
        email: row.email == null ? null : String(row.email),
        role: row.role == null ? null : String(row.role),
        papel: String(row.papel),
        titularUserId: Number(row.titularUserId),
        situacao: String(row.situacao),
        sessionVersion: Number(row.sessionVersion ?? 0),
      };
    },
    async travarPermissoes(userId, titularUserId) {
      const result = await tx.execute(sql`
        SELECT permissao FROM usuario_permissoes
        WHERE userId = ${userId} AND titularUserId = ${titularUserId}
        FOR UPDATE
      `);
      return linhasMysql(result).map((row) => String(row.permissao));
    },
    async travarVinculos(userId) {
      const result = await tx.execute(sql`
        SELECT userId, fazendaId FROM usuario_fazendas
        WHERE userId = ${userId} FOR UPDATE
      `);
      return linhasMysql(result).map((row) => ({
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
      }));
    },
    async travarPastosDaFazenda(titularUserId, fazendaId) {
      const result = await tx.execute(sql`
        SELECT id, userId, fazendaId, nome, sigla FROM pastos
        WHERE userId = ${titularUserId} AND fazendaId = ${fazendaId}
        ORDER BY id
        FOR UPDATE
      `);
      return linhasMysql(result).map((row) => ({
        id: Number(row.id),
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
        nome: String(row.nome),
        sigla: row.sigla == null ? null : String(row.sigla),
      }));
    },
    async travarFazenda(id) {
      const result = await tx.execute(sql`
        SELECT id, userId FROM fazendas WHERE id = ${id} FOR UPDATE
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return { id: Number(row.id), userId: Number(row.userId) };
    },
    async gravarCoordenadas(id, titularUserId, coordenadas) {
      await tx.update(pastos).set({ coordenadas }).where(and(eq(pastos.id, id), eq(pastos.userId, titularUserId)));
    },
    async relerPasto(id, titularUserId) {
      const result = await tx.execute(sql`
        SELECT id, userId, fazendaId, coordenadas FROM pastos
        WHERE id = ${id} AND userId = ${titularUserId}
      `);
      const row = linhasMysql(result)[0];
      if (!row) return null;
      return {
        id: Number(row.id),
        userId: Number(row.userId),
        fazendaId: Number(row.fazendaId),
        coordenadas: row.coordenadas == null ? null : String(row.coordenadas),
      };
    },
  };
}

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
  propriedadeEstabelecimento: z.string().optional(),
  nomeContato: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
});

function throwSeDocumentoClienteInvalido(result: { ok: true } | { ok: false; message: string }) {
  if (result.ok) return;
  throw new TRPCError({
    code: result.message === MSG_COMPRADOR_DOC_INVALIDO ? "BAD_REQUEST" : "CONFLICT",
    message: result.message,
  });
}

async function clientesDocumentoDoUsuario(userId: number) {
  try {
    return await db
      .select({
        id: pessoas.id,
        userId: pessoas.userId,
        tipo: pessoas.tipo,
        documento: pessoas.documento,
        ativo: pessoas.ativo,
      })
      .from(pessoas)
      .where(and(eq(pessoas.userId, userId), eq(pessoas.tipo, "cliente")));
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return devLocalStore.listPessoas(userId, "cliente", true);
  }
}

async function pessoaDoUsuario(userId: number, id: number) {
  try {
    const [row] = await db
      .select({
        id: pessoas.id,
        userId: pessoas.userId,
        tipo: pessoas.tipo,
        documento: pessoas.documento,
      })
      .from(pessoas)
      .where(and(eq(pessoas.id, id), eq(pessoas.userId, userId)))
      .limit(1);
    return row;
  } catch (error) {
    if (!isDatabaseUnavailable(error)) throw error;
    return devLocalStore.listPessoas(userId, undefined, true).find(p => p.id === id);
  }
}

const pessoasRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          tipo: pessoaTipoSchema.optional(),
          incluirInativos: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        const conditions = [eq(pessoas.userId, ctx.user.id)];
        if (deveRestringirPessoasListAosAtivos(input?.incluirInativos)) {
          conditions.push(eq(pessoas.ativo, true));
        }
        if (input?.tipo) conditions.push(eq(pessoas.tipo, input.tipo));
        return await db
          .select()
          .from(pessoas)
          .where(and(...conditions))
          .orderBy(pessoas.nome);
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        return devLocalStore.listPessoas(ctx.user.id, input?.tipo, Boolean(input?.incluirInativos));
      }
    }),

  create: protectedProcedure
    .input(pessoaFieldsSchema)
    .mutation(async ({ ctx, input }) => {
      const documento = input.documento?.trim() || null;
      throwSeDocumentoClienteInvalido(
        avaliarDocumentoClienteCreate({
          userId: ctx.user.id,
          tipo: input.tipo,
          documento,
          existentes: await clientesDocumentoDoUsuario(ctx.user.id),
        }),
      );

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
          propriedadeEstabelecimento: input.propriedadeEstabelecimento?.trim() || null,
          nomeContato: input.nomeContato?.trim() || null,
          cidade: input.cidade?.trim() || null,
          uf: normalizeUfBrasil(input.uf),
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
          propriedadeEstabelecimento: input.propriedadeEstabelecimento ?? null,
          nomeContato: input.nomeContato ?? null,
          cidade: input.cidade ?? null,
          uf: normalizeUfBrasil(input.uf),
        });
        return { success: true, id: row.id, localFallback: true };
      }
    }),

  update: protectedProcedure
    .input(pessoaFieldsSchema.partial().extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const atual = await pessoaDoUsuario(ctx.user.id, id);
      if (atual) {
        throwSeDocumentoClienteInvalido(
          avaliarDocumentoClienteUpdate({
            userId: ctx.user.id,
            id,
            tipoAtual: atual.tipo,
            tipoNovo: rest.tipo,
            documentoAtual: atual.documento,
            documentoNovo: rest.documento,
            documentoInformado: rest.documento !== undefined,
            existentes: await clientesDocumentoDoUsuario(ctx.user.id),
          }),
        );
      }
      try {
        const patch: Record<string, unknown> = {};
        if (rest.nome !== undefined) patch.nome = rest.nome.trim();
        if (rest.tipo !== undefined) patch.tipo = rest.tipo;
        if (rest.funcao !== undefined) patch.funcao = rest.funcao?.trim() || null;
        if (rest.documento !== undefined) {
          patch.documento = rest.documento.trim() || null;
        }
        if (rest.endereco !== undefined) patch.endereco = rest.endereco?.trim() || null;
        if (rest.telefone !== undefined) patch.telefone = rest.telefone?.trim() || null;
        if (rest.email !== undefined) patch.email = rest.email?.trim() || null;
        if (rest.observacoes !== undefined) patch.observacoes = rest.observacoes?.trim() || null;
        if (rest.propriedadeEstabelecimento !== undefined) {
          patch.propriedadeEstabelecimento = rest.propriedadeEstabelecimento?.trim() || null;
        }
        if (rest.nomeContato !== undefined) patch.nomeContato = rest.nomeContato?.trim() || null;
        if (rest.cidade !== undefined) patch.cidade = rest.cidade?.trim() || null;
        if (rest.uf !== undefined) patch.uf = normalizeUfBrasil(rest.uf);

        await db
          .update(pessoas)
          .set(patch)
          .where(and(eq(pessoas.id, id), eq(pessoas.userId, ctx.user.id)));
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
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
          propriedadeEstabelecimento: rest.propriedadeEstabelecimento,
          nomeContato: rest.nomeContato,
          cidade: rest.cidade,
          uf: rest.uf !== undefined ? normalizeUfBrasil(rest.uf) : undefined,
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

  reativar: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await reativarPessoa(ctx.user.id, input.id);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        if (!isDatabaseUnavailable(error)) throw error;
        try {
          return { ...devLocalStore.reativarPessoa(ctx.user.id, input.id), localFallback: true };
        } catch {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: MSG_PESSOA_REATIVAR_NAO_ENCONTRADA,
          });
        }
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
        /** Complemento obrigatório quando motivo = "outro". Persistido nas observações do histórico. */
        motivoDetalhe: z.string().max(500).optional(),
        observacoes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Comparação por data civil (YYYY-MM-DD), mesma estratégia da Pesagem — sem horário/timezone.
      const hoje = new Date();
      const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const dataISO = String(input.data).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Data da identificação inválida." });
      }
      if (dataISO > hojeISO) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data da identificação não pode ser futura.",
        });
      }

      await assertFazendaDoUsuario(ctx.user.id, input.fazendaId);
      await assertLoteNaFazenda(ctx.user.id, input.fazendaId, input.loteId ?? null);
      const animal = await assertAnimalNaFazenda(ctx.user.id, input.animalId, input.fazendaId);
      await assertManejoPermitidoNaData(ctx.user.id, input.animalId, dataISO);

      const brincoAtual = (animal.brinco ?? "").trim() || null;
      const rfidAtual = (animal.brincoEletronico ?? "").trim() || null;
      const novoRfid = (input.novoRfid ?? "").trim() || null;
      const novoBrinco = (input.novoBrinco ?? "").trim() || null;
      const obsUser = (input.observacoes ?? "").trim() || null;
      const motivoDetalhe = (input.motivoDetalhe ?? "").trim() || null;
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

      // Motivo obrigatório também em Vincular RFID (sem RFID atual).
      const exigeMotivo = alteraBrinco || alteraRfid;
      if (exigeMotivo && !input.motivo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o motivo da troca de identificação.",
        });
      }
      if (exigeMotivo && input.motivo === "outro" && !motivoDetalhe) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Informe o motivo da alteração.",
        });
      }
      const motivo = input.motivo ?? "reidentificacao";

      const assertBrincoOuMensagemAmigavel = async (useLocal: boolean) => {
        if (!alteraBrinco || !novoBrinco) return;
        await assertBrincoUnicoEntreAtivos(
          ctx.user.id,
          novoBrinco,
          animal.status ?? "ativo",
          input.animalId,
          useLocal,
          input.fazendaId,
        );
      };

      const assertRfidOuMensagem = async (useLocal: boolean) => {
        if (!alteraRfid || !novoRfid) return;
        await assertRfidNaoReutilizavel(
          ctx.user.id,
          novoRfid,
          input.animalId,
          useLocal,
        );
      };

      const montarHistoricoRow = () => {
        // brincoNovo é NOT NULL / varchar(50): o detalhe do RFID fica nas observações
        let brincoNovoHist = alteraBrinco
          ? (novoBrinco as string)
          : brincoAtual || "—";
        if (!brincoNovoHist) brincoNovoHist = "—";

        return {
          userId: ctx.user.id,
          animalId: input.animalId,
          brincoAnterior: brincoAtual ? brincoAtual.slice(0, 50) : null,
          brincoNovo: brincoNovoHist.slice(0, 50),
          motivo,
          observacoes: buildObservacoesHistoricoIdentificacao({
            operacao: input.operacao,
            tinhaRfid: Boolean(rfidAtual),
            rfidAnterior: rfidAtual,
            rfidNovo: novoRfid,
            brincoAnterior: brincoAtual,
            brincoNovo: novoBrinco,
            motivo,
            motivoDetalhe,
            observacoesUsuario: obsUser,
          }),
          dataAlteracao: input.data,
          usuarioNome: ctx.user.name?.trim() || null,
        };
      };

      const runLocal = async () => {
        // Valida os dois antes de gravar (atomicidade: tudo ou nada).
        await assertBrincoOuMensagemAmigavel(true);
        await assertRfidOuMensagem(true);

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
        // Valida brinco + RFID antes de qualquer gravação (operação conjunta atômica).
        await assertBrincoOuMensagemAmigavel(false);
        await assertRfidOuMensagem(false);

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

import { semenRouter } from "./semenRouter";
import { nutricaoDietasRouter } from "./nutricaoDietasRouter";
import { nutricaoPlanejamentoRouter } from "./nutricaoPlanejamentoRouter";
import { nutricaoFornecimentosRouter } from "./nutricaoFornecimentosRouter";
import { nutricaoCochosRouter } from "./nutricaoCochosRouter";
import { nutricaoBatidasRouter } from "./nutricaoBatidasRouter";
import { nutricaoCochoLeiturasRouter } from "./nutricaoCochoLeiturasRouter";
import { nutricaoVisaoGeralRouter } from "./nutricaoVisaoGeralRouter";
import { financeiroV2Router } from "./financeiroV2Router";
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
  nutricaoDietas: nutricaoDietasRouter,
  nutricaoPlanejamento: nutricaoPlanejamentoRouter,
  nutricaoFornecimentos: nutricaoFornecimentosRouter,
  nutricaoCochos: nutricaoCochosRouter,
  nutricaoBatidas: nutricaoBatidasRouter,
  nutricaoCochoLeituras: nutricaoCochoLeiturasRouter,
  nutricaoVisaoGeral: nutricaoVisaoGeralRouter,
  benfeitorias: benfeitoriasRouter,
  estoque: estoqueRouter,
  financeiro: financeiroRouter,
  financeiroV2: financeiroV2Router,
  dashboard: dashboardRouter,
  compras: comprasRouter,
  vendas: vendasRouter,
  fazendas: fazendasRouter,
    pastos: pastosRouter,
  rebanho: rebanhoOverviewRouter,
  brincos: brincosRouter,
  pessoas: pessoasRouter,
  manejo: manejoRouter,
  semen: semenRouter,
});
export type AppRouter = typeof appRouter;
