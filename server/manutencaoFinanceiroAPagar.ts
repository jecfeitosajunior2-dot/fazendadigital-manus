/**
 * Orquestrador interno Manutenção + Financeiro V2 (A pagar).
 * Reutiliza persistirManutencaoCompletaNoTx e criarTituloNoTx na mesma transação.
 * Não abre COMMIT próprio. Não é procedure pública.
 */
import { TRPCError } from "@trpc/server";
import { MSG_FIN_ORIGEM_DUPLICADA } from "../shared/financeiroNucleo";
import {
  amarrarOrigemTituloManutencao,
  assinarOperacaoManutencao,
  avaliarElegibilidadeAPagarManutencao,
  chaveOrigemTituloManutencao,
  decidirEdicaoManutencaoComMotorV2Atual,
  decidirEstornoFinanceiroManutencao,
  decidirIdempotenciaTituloManutencao,
  decidirReusoChaveOperacaoManutencao,
  isDuplicateChaveOperacaoManutencao,
  MANUT_A_PAGAR_OPERACIONAL,
  MSG_MANUT_FIN_CONFLITO_IDEMPOTENCIA,
  MSG_MANUT_FIN_CONSISTENCIA,
  MSG_MANUT_FIN_RECUPERACAO_FALHOU,
  MSG_MANUT_FIN_TITULO_CANCELADO,
  prepararPlanoTituloAPagarManutencao,
  recusarAtivacaoOperacionalAPagar,
  validarConsistenciaTituloManutencaoEmitido,
  validarIdempotencyOperacaoManutencao,
  validarUsuarioManutencaoAPagar,
  valorFinanceiroOficialDaOs,
  type TituloManutencaoSnapshot,
} from "../shared/manutencaoFinanceiroAPagar";
import type {
  FazendaSnapshot,
  MaquinaFazendaSnapshot,
  PessoaPrestadorSnapshot,
} from "../shared/manutencaoIdentificacaoOperacional";
import {
  estornarManutencaoCompletaNoTx,
  persistirManutencaoCompletaNoTx,
  type OsChaveOperacaoSnapshot,
  type PersistenciaCompletaCtx,
  type PersistirManutencaoCompletaInput,
} from "./manutencaoCompleta";
import {
  apropriarNoTx,
  cancelarTituloNoTx,
  criarTituloNoTx,
  listarTitulosPorOrigemNoTx,
  tituloTemLiquidacaoEfetiva,
  type FinanceiroNucleoTx,
  type FinTituloRow,
} from "./financeiroNucleo";
import type { EstornarManutencaoInput, ManutencaoEstoqueTx } from "./manutencaoEstoque";

export class ManutencaoFinanceiroAPagarError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ManutencaoFinanceiroAPagarError";
  }
}

/** 1062 da unique da operação. A transação perdedora deve dar ROLLBACK antes de ler a vencedora. */
export class ConflitoIdempotenciaChaveOperacaoError extends ManutencaoFinanceiroAPagarError {
  readonly userId: number;
  readonly chaveOperacao: string;

  constructor(userId: number, chaveOperacao: string, causa?: unknown) {
    super(MSG_MANUT_FIN_CONFLITO_IDEMPOTENCIA, causa !== undefined ? { cause: causa } : undefined);
    this.name = "ConflitoIdempotenciaChaveOperacaoError";
    this.userId = userId;
    this.chaveOperacao = chaveOperacao;
  }
}

function falha(message: string): never {
  throw new ManutencaoFinanceiroAPagarError(message);
}

function mensagemDe(error: unknown): string {
  if (error instanceof TRPCError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

function isOrigemDuplicadaPeloNucleo(error: unknown): boolean {
  return mensagemDe(error).includes(MSG_FIN_ORIGEM_DUPLICADA);
}

export type PortasManutencaoAPagar = {
  persistencia: PersistenciaCompletaCtx;
  fin: FinanceiroNucleoTx;
  motorEstoque: ManutencaoEstoqueTx;
};

export type EmitirManutencaoAPagarInput = {
  userId: number;
  idempotencyKey: string;
  os: PersistirManutencaoCompletaInput;
  pessoa?: PessoaPrestadorSnapshot | null;
  maquina?: MaquinaFazendaSnapshot | null;
  fazenda?: FazendaSnapshot | null;
  dataVencimento?: string | null;
  valorInformado?: number | string | null;
};

export type EmitirManutencaoAPagarResultado =
  | {
      ok: true;
      idempotente: boolean;
      osId: number;
      tituloId: null;
      motivo: string;
    }
  | {
      ok: true;
      idempotente: boolean;
      osId: number;
      tituloId: number;
      valorOriginal: number;
    };

export type EdicaoManutencaoAPagarInput = {
  userId: number;
  osId: number;
  valorCobradoOficinaNovo?: number | string;
  pecasOficina?: Array<{ quantidade?: number; valorUnitario?: number; valorTotal?: number }>;
  valorMaoObraNovo?: number;
  prestadorAtual?: number | null;
  prestadorNovo?: number | null;
  fazendaAtual?: number | null;
  fazendaNova?: number | null;
};

async function tituloParaRegra(
  fin: FinanceiroNucleoTx,
  userId: number,
  titulo: FinTituloRow,
): Promise<TituloManutencaoSnapshot> {
  const temLiquidacaoEfetiva = await tituloTemLiquidacaoEfetiva(fin, userId, titulo.id);
  return {
    id: titulo.id,
    estado: titulo.estado,
    origemTipo: titulo.origemTipo,
    origemId: titulo.origemId,
    origemItemChave: titulo.origemItemChave,
    situacao: temLiquidacaoEfetiva ? "parcial" : "em_aberto",
    temLiquidacaoEfetiva,
  };
}

function assinaturaDoInput(input: EmitirManutencaoAPagarInput) {
  return assinarOperacaoManutencao({
    maquinaId: input.os.maquinaId,
    fazendaId: input.fazenda?.id ?? input.maquina?.fazendaId ?? input.os.fazendaId,
    prestadorPessoaId: input.os.prestadorPessoaId,
    tipoExecucao: input.os.tipoExecucao,
    data: input.os.data,
    valorMaoObra: input.os.valorMaoObra,
    pecasEstoque: input.os.pecas,
    pecasOficina: input.os.pecasOficina,
  });
}

function assinaturaDoSnapshot(
  os: OsChaveOperacaoSnapshot,
  fazendaId?: number | null,
) {
  return assinarOperacaoManutencao({
    maquinaId: os.maquinaId,
    fazendaId,
    prestadorPessoaId: os.prestadorPessoaId,
    tipoExecucao: os.tipoExecucao,
    data: os.data,
    valorMaoObra: os.valorMaoObra,
    pecas: os.pecas,
    pecasOficina: os.pecas.filter(p => String(p.origem ?? "").toLowerCase() === "oficina"),
    pecasEstoque: os.pecas.filter(p => Number(p.estoqueId) > 0),
  });
}

async function resultadoReuso(
  portas: PortasManutencaoAPagar,
  userId: number,
  osId: number,
  proposta: ReturnType<typeof assinaturaDoInput>,
): Promise<EmitirManutencaoAPagarResultado> {
  if (!Number.isInteger(osId) || osId <= 0) falha(MSG_MANUT_FIN_CONSISTENCIA);
  const titulo = await tituloOficinaDaOs(portas.fin, userId, osId);
  if (titulo) {
    if (proposta.prestadorPessoaId == null || proposta.fazendaId == null) {
      falha(MSG_MANUT_FIN_CONSISTENCIA);
    }
    await validarTituloEmitido(portas.fin, userId, osId, titulo.id, {
      valorOriginal: Number(proposta.valorCobradoOficina),
      prestadorPessoaId: proposta.prestadorPessoaId,
      fazendaId: proposta.fazendaId,
    });
    return {
      ok: true,
      idempotente: true,
      osId,
      tituloId: titulo.id,
      valorOriginal: Number(proposta.valorCobradoOficina),
    };
  }
  return {
    ok: true,
    idempotente: true,
    osId,
    tituloId: null,
    motivo: "operacao_ja_confirmada",
  };
}

async function tituloOficinaDaOs(
  fin: FinanceiroNucleoTx,
  userId: number,
  osId: number,
): Promise<FinTituloRow | null> {
  const origem = chaveOrigemTituloManutencao(osId);
  const lista = await listarTitulosPorOrigemNoTx(fin, userId, origem.origemTipo, origem.origemId);
  return lista.find(t => (t.origemItemChave ?? origem.origemItemChave) === origem.origemItemChave) ?? null;
}

async function emitirTituloOficinaNoTx(
  fin: FinanceiroNucleoTx,
  userId: number,
  planoAmarrado: {
    pessoaId: number;
    fazendaOrigemId: number;
    dataCompetencia: string;
    dataVencimento: string;
    valorOriginal: number;
    origemTipo: string;
    origemId: number;
    origemItemChave: string;
    descricao: string;
  },
): Promise<{ id: number }> {
  const existentes = await listarTitulosPorOrigemNoTx(
    fin,
    userId,
    planoAmarrado.origemTipo,
    planoAmarrado.origemId,
  );
  const idem = decidirIdempotenciaTituloManutencao(existentes.map(t => ({
    id: t.id,
    estado: t.estado,
    origemTipo: t.origemTipo,
    origemId: t.origemId,
    origemItemChave: t.origemItemChave,
  })));
  if (idem.acao === "bloquear") falha(idem.message);
  if (idem.acao === "reutilizar") return { id: idem.tituloId };

  try {
    return await criarTituloNoTx(fin, userId, {
      tipo: "pagar",
      pessoaId: planoAmarrado.pessoaId,
      descricao: planoAmarrado.descricao,
      dataCompetencia: planoAmarrado.dataCompetencia,
      valorOriginal: planoAmarrado.valorOriginal,
      fazendaOrigemId: planoAmarrado.fazendaOrigemId,
      origemTipo: planoAmarrado.origemTipo,
      origemId: planoAmarrado.origemId,
      origemItemChave: planoAmarrado.origemItemChave,
      documentoReferencia: `OS-${planoAmarrado.origemId}`,
      parcelas: [{
        numero: 1,
        vencimento: planoAmarrado.dataVencimento,
        valorOriginal: planoAmarrado.valorOriginal,
      }],
    });
  } catch (error) {
    if (!isOrigemDuplicadaPeloNucleo(error)) throw error;
    const dup = await fin.findTituloPorOrigem(
      userId,
      planoAmarrado.origemTipo,
      planoAmarrado.origemId,
      planoAmarrado.origemItemChave,
    );
    if (!dup) throw error;
    if (dup.estado === "cancelado") falha(MSG_MANUT_FIN_TITULO_CANCELADO);
    return { id: dup.id };
  }
}

async function validarTituloEmitido(
  fin: FinanceiroNucleoTx,
  userId: number,
  osId: number,
  tituloId: number,
  esperado: { valorOriginal: number; prestadorPessoaId: number; fazendaId: number },
): Promise<void> {
  const titulo = await fin.findTitulo(userId, tituloId);
  if (!titulo) falha(MSG_MANUT_FIN_CONSISTENCIA);
  const parcelas = await fin.listParcelasTitulo(userId, tituloId);
  const apropriacoes = await fin.listApropriacoes(userId, tituloId);
  const ok = validarConsistenciaTituloManutencaoEmitido({
    osId,
    valorCobradoOficina: esperado.valorOriginal,
    prestadorPessoaId: esperado.prestadorPessoaId,
    fazendaId: esperado.fazendaId,
    titulo,
    parcelas,
    apropriacoes,
  });
  if (!ok.ok) falha(ok.message);
}

/**
 * Grava a OS e, se elegível, o título A pagar — na transação já aberta pelo chamador.
 * Não chama persistirManutencaoCompletaMysql nem o serviço financeiro com COMMIT próprio.
 */
export async function persistirManutencaoComFinanceiroAPagarNoTx(
  portas: PortasManutencaoAPagar,
  input: EmitirManutencaoAPagarInput,
): Promise<EmitirManutencaoAPagarResultado> {
  const usuario = validarUsuarioManutencaoAPagar(input.userId);
  if (!usuario.ok) falha(usuario.message);
  const idemKey = validarIdempotencyOperacaoManutencao(input.idempotencyKey);
  if (!idemKey.ok) falha(idemKey.message);

  const proposta = assinaturaDoInput(input);
  const jaFeita = portas.persistencia.findOsPorChaveOperacao
    ? await portas.persistencia.findOsPorChaveOperacao(usuario.userId, idemKey.key)
    : null;
  if (jaFeita) {
    const reuso = decidirReusoChaveOperacaoManutencao({
      existente: {
        userId: jaFeita.userId,
        osId: jaFeita.id,
        assinatura: assinaturaDoSnapshot(jaFeita, proposta.fazendaId),
      },
      userId: usuario.userId,
      proposta,
    });
    if (reuso.acao === "bloquear") falha(reuso.message);
    if (reuso.acao === "reutilizar") {
      return resultadoReuso(portas, usuario.userId, reuso.osId, proposta);
    }
  }

  const baseEleg = {
    userId: usuario.userId,
    tipoExecucao: input.os.tipoExecucao,
    prestadorPessoaId: input.os.prestadorPessoaId,
    prestadorNome: input.os.prestadorNome,
    pessoa: input.pessoa,
    maquina: input.maquina,
    fazenda: input.fazenda,
    valorCobradoOficina: valorFinanceiroOficialDaOs({
      pecasEstoque: input.os.pecas,
      pecasOficina: input.os.pecasOficina,
      valorMaoObra: input.os.valorMaoObra,
    }),
    valorInformado: input.valorInformado,
    dataCompetencia: input.os.data,
    dataVencimento: input.dataVencimento,
    pecasEstoque: input.os.pecas,
    pecasOficina: input.os.pecasOficina,
    valorMaoObra: input.os.valorMaoObra,
  };
  const eleg = avaliarElegibilidadeAPagarManutencao(baseEleg);
  if (!eleg.ok) falha(eleg.message);

  let persistido: Awaited<ReturnType<typeof persistirManutencaoCompletaNoTx>>;
  try {
    persistido = await persistirManutencaoCompletaNoTx(portas.persistencia, {
      ...input.os,
      userId: usuario.userId,
      chaveOperacao: idemKey.key,
    });
  } catch (error) {
    if (!isDuplicateChaveOperacaoManutencao(error)) throw error;
    throw new ConflitoIdempotenciaChaveOperacaoError(usuario.userId, idemKey.key, error);
  }

  if (!eleg.elegivel) {
    return {
      ok: true,
      idempotente: false,
      osId: persistido.id,
      tituloId: null,
      motivo: eleg.message,
    };
  }

  const planoPrep = prepararPlanoTituloAPagarManutencao(baseEleg);
  if (!planoPrep.ok) falha(planoPrep.message);

  const amarrado = amarrarOrigemTituloManutencao(planoPrep.plano, persistido.id);
  if (!amarrado.ok) falha(amarrado.message);

  const titulo = await emitirTituloOficinaNoTx(portas.fin, usuario.userId, {
    ...amarrado.plano,
    origemId: amarrado.plano.origemId!,
  });

  await apropriarNoTx(portas.fin, usuario.userId, titulo.id, [{
    valor: amarrado.plano.valorOriginal,
    fazendaId: amarrado.plano.fazendaOrigemId,
  }]);

  await validarTituloEmitido(portas.fin, usuario.userId, persistido.id, titulo.id, {
    valorOriginal: amarrado.plano.valorOriginal,
    prestadorPessoaId: amarrado.plano.pessoaId,
    fazendaId: amarrado.plano.fazendaOrigemId,
  });

  return {
    ok: true,
    idempotente: false,
    osId: persistido.id,
    tituloId: titulo.id,
    valorOriginal: amarrado.plano.valorOriginal,
  };
}

/**
 * Leitura após ROLLBACK da perdedora. Não grava OS, estoque nem título.
 * Tem de rodar em transação/conexão nova — nunca no snapshot REPEATABLE READ da perdedora.
 */
export async function recuperarManutencaoAposConflitoIdempotenciaNoTx(
  portas: PortasManutencaoAPagar,
  input: EmitirManutencaoAPagarInput,
): Promise<EmitirManutencaoAPagarResultado> {
  const usuario = validarUsuarioManutencaoAPagar(input.userId);
  if (!usuario.ok) falha(usuario.message);
  const idemKey = validarIdempotencyOperacaoManutencao(input.idempotencyKey);
  if (!idemKey.ok) falha(idemKey.message);

  const proposta = assinaturaDoInput(input);
  const existente = portas.persistencia.findOsPorChaveOperacao
    ? await portas.persistencia.findOsPorChaveOperacao(usuario.userId, idemKey.key)
    : null;
  if (!existente) falha(MSG_MANUT_FIN_RECUPERACAO_FALHOU);

  const reuso = decidirReusoChaveOperacaoManutencao({
    existente: {
      userId: existente.userId,
      osId: existente.id,
      assinatura: assinaturaDoSnapshot(existente, proposta.fazendaId),
    },
    userId: usuario.userId,
    proposta,
  });
  if (reuso.acao === "bloquear") falha(reuso.message);
  if (reuso.acao !== "reutilizar") falha(MSG_MANUT_FIN_RECUPERACAO_FALHOU);
  return resultadoReuso(portas, usuario.userId, reuso.osId, proposta);
}

export type AbrirTransacaoManutencaoAPagar = <T>(
  fn: (portas: PortasManutencaoAPagar) => Promise<T>,
) => Promise<T>;

/**
 * Grava na transação única. Se a unique da operação disparar, a transação
 * perdedora reverte e a vencedora é lida numa transação seguinte.
 */
export async function persistirManutencaoComFinanceiroAPagarAtomico(
  abrirTransacao: AbrirTransacaoManutencaoAPagar,
  input: EmitirManutencaoAPagarInput,
): Promise<EmitirManutencaoAPagarResultado> {
  try {
    return await abrirTransacao(portas => persistirManutencaoComFinanceiroAPagarNoTx(portas, input));
  } catch (error) {
    if (!(error instanceof ConflitoIdempotenciaChaveOperacaoError)) throw error;
    return abrirTransacao(portas => recuperarManutencaoAposConflitoIdempotenciaNoTx(portas, input));
  }
}

/** Só lê e decide. Não altera título. Sem API oficial de valor no V2. */
export async function protegerEdicaoManutencaoFinanceiroAPagarNoTx(
  portas: Pick<PortasManutencaoAPagar, "fin">,
  input: EdicaoManutencaoAPagarInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const usuario = validarUsuarioManutencaoAPagar(input.userId);
  if (!usuario.ok) return { ok: false, message: usuario.message };
  const titulo = await tituloOficinaDaOs(portas.fin, usuario.userId, input.osId);
  if (!titulo) return { ok: true };
  const regra = await tituloParaRegra(portas.fin, usuario.userId, titulo);
  const valorNovo = input.valorCobradoOficinaNovo ?? valorFinanceiroOficialDaOs({
    pecasOficina: input.pecasOficina,
    valorMaoObra: input.valorMaoObraNovo,
  });
  return decidirEdicaoManutencaoComMotorV2Atual({
    titulo: regra,
    valorCobradoOficinaNovo: valorNovo,
    valorTituloAtual: titulo.valorOriginal,
    prestadorAtual: input.prestadorAtual,
    prestadorNovo: input.prestadorNovo,
    fazendaAtual: input.fazendaAtual,
    fazendaNova: input.fazendaNova,
  });
}

export async function estornarManutencaoComFinanceiroAPagarNoTx(
  portas: Pick<PortasManutencaoAPagar, "fin" | "motorEstoque">,
  input: EstornarManutencaoInput,
) {
  const usuario = validarUsuarioManutencaoAPagar(input.userId);
  if (!usuario.ok) falha(usuario.message);

  const titulo = await tituloOficinaDaOs(portas.fin, usuario.userId, input.id);
  if (titulo) {
    const regra = await tituloParaRegra(portas.fin, usuario.userId, titulo);
    const decisao = decidirEstornoFinanceiroManutencao(regra);
    if (!decisao.ok) falha(decisao.message);
    if (decisao.acao === "cancelar_titulo") {
      await cancelarTituloNoTx(
        portas.fin,
        usuario.userId,
        decisao.tituloId,
        input.motivo?.trim() || "Estorno da manutenção terceirizada",
      );
    }
  }

  return estornarManutencaoCompletaNoTx(portas.motorEstoque, input);
}

/** Travas para o dia em que a interface for ligada. Não usar no router agora. */
export function recusarProcedurePublicaAPagar(): never {
  void MANUT_A_PAGAR_OPERACIONAL;
  falha(recusarAtivacaoOperacionalAPagar().message);
}
