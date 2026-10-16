import {
  dinheiroIgual,
  dinheiroPositivo,
  FINANCEIRO_ORIGEM_MANUTENCAO,
  MSG_FIN_ORIGEM_DUPLICADA,
  persistirValor,
  validarOrigemTitulo,
  validarSomaParcelas,
} from "./financeiroNucleo";
import {
  confirmarFazendaDoUsuario,
  identificarFazendaMaquina,
  lerPrestadorPessoaId,
  validarPrestadorPessoaParaOs,
  type FazendaSnapshot,
  type MaquinaFazendaSnapshot,
  type PessoaPrestadorSnapshot,
} from "./manutencaoIdentificacaoOperacional";
import { persistirCapital, persistirQuantidadeEstoque } from "./estoqueCapital";
import { calcularCustosManutencaoCompletos } from "./manutencaoPecasOrigem";
import { lerTipoExecucaoManutencao } from "./manutencaoTipoExecucao";

export { FINANCEIRO_ORIGEM_MANUTENCAO };

export const MANUT_FINANCEIRO_CHAVE_OFICINA = "oficina";

export const MSG_MANUT_FIN_INTERNA =
  "Manutenção interna não gera conta a pagar.";
export const MSG_MANUT_FIN_VALOR_ZERO =
  "Não há valor cobrado pela oficina para gerar conta a pagar.";
export const MSG_MANUT_FIN_VALOR_TOTAL =
  "O Financeiro usa só o valor cobrado pela oficina, nunca o custo total da manutenção.";
export const MSG_MANUT_FIN_VALOR_DIVERGENTE =
  "O valor financeiro precisa ser exatamente o valor cobrado pela oficina.";
export const MSG_MANUT_FIN_PRESTADOR =
  "Selecione o fornecedor cadastrado em Pessoas para gerar a conta a pagar.";
export const MSG_MANUT_FIN_VENCIMENTO =
  "Informe um vencimento válido para a conta a pagar.";
export const MSG_MANUT_FIN_OS_ID =
  "O título financeiro só pode ser amarrado depois que a manutenção tiver um identificador real.";
export const MSG_MANUT_FIN_TITULO_CANCELADO =
  "Já existe um título cancelado para esta manutenção. Não é permitido criar outro nem reaproveitar o cancelado.";
export const MSG_MANUT_FIN_TITULO_EXISTENTE =
  "Esta manutenção já possui conta a pagar.";
export const MSG_MANUT_FIN_COM_PAGAMENTO =
  "Esta manutenção possui pagamento financeiro registrado. Regularize o pagamento antes de estornar ou alterar o valor.";
export const MSG_MANUT_FIN_EDICAO_ATOMICA =
  "A correção do valor da oficina precisa atualizar o título e as parcelas na mesma operação. Se isso não for possível, a edição inteira fica bloqueada.";
export const MSG_MANUT_FIN_OS_HISTORICA =
  "Manutenção antiga sem fornecedor oficial não recebe título automaticamente.";

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export type MotivoNaoElegivelAPagar =
  | "interna"
  | "valor_zero"
  | "os_historica"
  | "prestador_invalido"
  | "fazenda_invalida"
  | "vencimento_invalido"
  | "valor_divergente";

export type TituloManutencaoSnapshot = {
  id: number;
  estado: "ativo" | "cancelado" | string;
  origemTipo?: string | null;
  origemId?: number | null;
  origemItemChave?: string | null;
  situacao?: "em_aberto" | "parcial" | "liquidado" | "vencido" | string;
  temLiquidacaoEfetiva?: boolean;
};

export type PlanoTituloAPagarManutencao = {
  userId: number;
  tipo: "pagar";
  pessoaId: number;
  fazendaOrigemId: number;
  dataCompetencia: string;
  dataVencimento: string;
  valorOriginal: number;
  origemTipo: typeof FINANCEIRO_ORIGEM_MANUTENCAO;
  origemItemChave: typeof MANUT_FINANCEIRO_CHAVE_OFICINA;
  origemId: number | null;
  descricao: string;
};

export function dataCivilValida(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  const m = DATA_ISO.exec(v);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano
    || d.getUTCMonth() !== mes - 1
    || d.getUTCDate() !== dia
  ) {
    return null;
  }
  return v;
}

/** Só o valor cobrado pela oficina. Nunca o custo total. */
export function valorFinanceiroOficialDaOs(input: {
  valorCobradoOficina?: number | string | null;
  valorTotal?: number | string | null;
  pecasEstoque?: Array<{ quantidade: number; valorUnitario: number }>;
  pecasOficina?: Array<{ valorTotal?: number; quantidade?: number; valorUnitario?: number }>;
  valorMaoObra?: number;
}): number {
  if (input.valorCobradoOficina != null && String(input.valorCobradoOficina).trim() !== "") {
    const n = Number(persistirValor(input.valorCobradoOficina));
    return Number.isFinite(n) ? n : 0;
  }
  return calcularCustosManutencaoCompletos({
    pecasEstoque: input.pecasEstoque,
    pecasOficina: input.pecasOficina,
    valorMaoObra: input.valorMaoObra,
  }).valorCobradoOficina;
}

export function validarValorFinanceiroManutencao(input: {
  valorCobradoOficina: number | string;
  valorInformado?: number | string | null;
  valorTotal?: number | string | null;
}): { ok: true; valorOriginal: number } | { ok: false; message: string } {
  const oficial = Number(persistirValor(input.valorCobradoOficina));
  if (!dinheiroPositivo(oficial)) {
    return { ok: false, message: MSG_MANUT_FIN_VALOR_ZERO };
  }
  if (input.valorInformado != null && String(input.valorInformado).trim() !== "") {
    if (!dinheiroIgual(input.valorInformado, oficial)) {
      return { ok: false, message: MSG_MANUT_FIN_VALOR_DIVERGENTE };
    }
  }
  if (
    input.valorTotal != null
    && String(input.valorTotal).trim() !== ""
    && dinheiroIgual(input.valorTotal, oficial) === false
    && input.valorInformado != null
    && dinheiroIgual(input.valorInformado, input.valorTotal)
  ) {
    return { ok: false, message: MSG_MANUT_FIN_VALOR_TOTAL };
  }
  return { ok: true, valorOriginal: oficial };
}

export function avaliarElegibilidadeAPagarManutencao(input: {
  userId: number;
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  pessoa?: PessoaPrestadorSnapshot | null;
  maquina?: MaquinaFazendaSnapshot | null;
  fazenda?: FazendaSnapshot | null;
  valorCobradoOficina?: number | string | null;
  valorTotal?: number | string | null;
  valorInformado?: number | string | null;
  dataCompetencia?: string | null;
  dataVencimento?: string | null;
  pecasEstoque?: Array<{ quantidade: number; valorUnitario: number }>;
  pecasOficina?: Array<{ valorTotal?: number; quantidade?: number; valorUnitario?: number }>;
  valorMaoObra?: number;
}):
  | { ok: true; elegivel: false; motivo: MotivoNaoElegivelAPagar; message: string }
  | { ok: true; elegivel: true; valorOriginal: number; pessoaId: number; fazendaOrigemId: number; dataCompetencia: string; dataVencimento: string }
  | { ok: false; motivo: MotivoNaoElegivelAPagar; message: string } {
  const tipo = lerTipoExecucaoManutencao(input.tipoExecucao);
  if (tipo !== "externa") {
    if (tipo === "interna") {
      return { ok: true, elegivel: false, motivo: "interna", message: MSG_MANUT_FIN_INTERNA };
    }
    return {
      ok: true,
      elegivel: false,
      motivo: "os_historica",
      message: MSG_MANUT_FIN_OS_HISTORICA,
    };
  }

  const valorOficial = valorFinanceiroOficialDaOs(input);
  if (!dinheiroPositivo(valorOficial)) {
    return { ok: true, elegivel: false, motivo: "valor_zero", message: MSG_MANUT_FIN_VALOR_ZERO };
  }

  const prestadorId = lerPrestadorPessoaId(input.prestadorPessoaId);
  if (prestadorId == null) {
    return {
      ok: true,
      elegivel: false,
      motivo: "os_historica",
      message: MSG_MANUT_FIN_OS_HISTORICA,
    };
  }

  const prestador = validarPrestadorPessoaParaOs({
    userId: input.userId,
    tipoExecucao: "externa",
    prestadorPessoaId: prestadorId,
    pessoa: input.pessoa,
  });
  if (!prestador.ok || prestador.prestadorPessoaId == null) {
    return {
      ok: false,
      motivo: "prestador_invalido",
      message: prestador.ok ? MSG_MANUT_FIN_PRESTADOR : prestador.message,
    };
  }

  const maquina = identificarFazendaMaquina({ userId: input.userId, maquina: input.maquina });
  if (!maquina.ok) {
    return { ok: false, motivo: "fazenda_invalida", message: maquina.message };
  }
  const fazenda = confirmarFazendaDoUsuario({
    userId: input.userId,
    fazendaId: maquina.fazendaId,
    fazenda: input.fazenda,
  });
  if (!fazenda.ok) {
    return { ok: false, motivo: "fazenda_invalida", message: fazenda.message };
  }

  const valor = validarValorFinanceiroManutencao({
    valorCobradoOficina: valorOficial,
    valorInformado: input.valorInformado,
    valorTotal: input.valorTotal,
  });
  if (!valor.ok) {
    return { ok: false, motivo: "valor_divergente", message: valor.message };
  }

  const competencia = dataCivilValida(input.dataCompetencia);
  const vencimento = dataCivilValida(input.dataVencimento);
  if (!competencia || !vencimento) {
    return { ok: false, motivo: "vencimento_invalido", message: MSG_MANUT_FIN_VENCIMENTO };
  }

  return {
    ok: true,
    elegivel: true,
    valorOriginal: valor.valorOriginal,
    pessoaId: prestador.prestadorPessoaId,
    fazendaOrigemId: fazenda.fazendaId,
    dataCompetencia: competencia,
    dataVencimento: vencimento,
  };
}

export function prepararPlanoTituloAPagarManutencao(input: {
  userId: number;
  tipoExecucao?: string | null;
  prestadorPessoaId?: number | null;
  prestadorNome?: string | null;
  pessoa?: PessoaPrestadorSnapshot | null;
  maquina?: MaquinaFazendaSnapshot | null;
  fazenda?: FazendaSnapshot | null;
  valorCobradoOficina?: number | string | null;
  valorTotal?: number | string | null;
  valorInformado?: number | string | null;
  dataCompetencia?: string | null;
  dataVencimento?: string | null;
  pecasEstoque?: Array<{ quantidade: number; valorUnitario: number }>;
  pecasOficina?: Array<{ valorTotal?: number; quantidade?: number; valorUnitario?: number }>;
  valorMaoObra?: number;
}): { ok: true; plano: PlanoTituloAPagarManutencao } | { ok: false; message: string } {
  const eleg = avaliarElegibilidadeAPagarManutencao(input);
  if (!eleg.ok) return { ok: false, message: eleg.message };
  if (!eleg.elegivel) return { ok: false, message: eleg.message };

  const nome = String(input.prestadorNome ?? "").trim() || "oficina";
  return {
    ok: true,
    plano: {
      userId: input.userId,
      tipo: "pagar",
      pessoaId: eleg.pessoaId,
      fazendaOrigemId: eleg.fazendaOrigemId,
      dataCompetencia: eleg.dataCompetencia,
      dataVencimento: eleg.dataVencimento,
      valorOriginal: eleg.valorOriginal,
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      origemItemChave: MANUT_FINANCEIRO_CHAVE_OFICINA,
      origemId: null,
      descricao: `Manutenção terceirizada — ${nome}`,
    },
  };
}

/** Só depois da OS ter id real. Não inventa identificador. */
export function amarrarOrigemTituloManutencao(
  plano: PlanoTituloAPagarManutencao,
  osId: number | null | undefined,
): { ok: true; plano: PlanoTituloAPagarManutencao } | { ok: false; message: string } {
  const id = Number(osId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: MSG_MANUT_FIN_OS_ID };
  }
  const origem = validarOrigemTitulo({
    origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
    origemId: id,
    origemItemChave: MANUT_FINANCEIRO_CHAVE_OFICINA,
  });
  if (!origem.ok) return { ok: false, message: origem.message };
  return {
    ok: true,
    plano: {
      ...plano,
      origemId: origem.origemId,
      origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
      origemItemChave: MANUT_FINANCEIRO_CHAVE_OFICINA,
    },
  };
}

export function chaveOrigemTituloManutencao(osId: number): {
  origemTipo: typeof FINANCEIRO_ORIGEM_MANUTENCAO;
  origemId: number;
  origemItemChave: typeof MANUT_FINANCEIRO_CHAVE_OFICINA;
} {
  return {
    origemTipo: FINANCEIRO_ORIGEM_MANUTENCAO,
    origemId: osId,
    origemItemChave: MANUT_FINANCEIRO_CHAVE_OFICINA,
  };
}

function tituloTemPagamento(titulo: TituloManutencaoSnapshot): boolean {
  if (titulo.temLiquidacaoEfetiva === true) return true;
  return titulo.situacao === "parcial" || titulo.situacao === "liquidado";
}

/**
 * Título ativo da mesma origem: reaproveita (idempotente).
 * Título cancelado: não reaproveita e não cria outro.
 */
export function decidirIdempotenciaTituloManutencao(existentes: TituloManutencaoSnapshot[]):
  | { acao: "criar" }
  | { acao: "reutilizar"; tituloId: number }
  | { acao: "bloquear"; message: string } {
  const daOrigem = existentes.filter(t =>
    (t.origemTipo ?? FINANCEIRO_ORIGEM_MANUTENCAO) === FINANCEIRO_ORIGEM_MANUTENCAO
    && (t.origemItemChave ?? MANUT_FINANCEIRO_CHAVE_OFICINA) === MANUT_FINANCEIRO_CHAVE_OFICINA,
  );
  if (!daOrigem.length) return { acao: "criar" };

  const cancelados = daOrigem.filter(t => t.estado === "cancelado");
  if (cancelados.length) {
    return { acao: "bloquear", message: MSG_MANUT_FIN_TITULO_CANCELADO };
  }

  const ativos = daOrigem.filter(t => t.estado === "ativo");
  if (ativos.length === 1) {
    return { acao: "reutilizar", tituloId: ativos[0]!.id };
  }
  if (ativos.length > 1) {
    return { acao: "bloquear", message: MSG_FIN_ORIGEM_DUPLICADA };
  }
  return { acao: "bloquear", message: MSG_MANUT_FIN_TITULO_EXISTENTE };
}

export function tituloManutencaoImpedeEstornoOuValor(titulo: TituloManutencaoSnapshot | null | undefined): boolean {
  if (!titulo || titulo.estado === "cancelado") return false;
  return tituloTemPagamento(titulo);
}

export function decidirEstornoFinanceiroManutencao(titulo: TituloManutencaoSnapshot | null | undefined):
  | { ok: true; acao: "nenhuma" }
  | { ok: true; acao: "cancelar_titulo"; tituloId: number }
  | { ok: false; message: string } {
  if (!titulo) return { ok: true, acao: "nenhuma" };
  if (titulo.estado === "cancelado") return { ok: true, acao: "nenhuma" };
  if (tituloTemPagamento(titulo)) {
    return { ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO };
  }
  return { ok: true, acao: "cancelar_titulo", tituloId: titulo.id };
}

export function decidirEdicaoValorFinanceiroManutencao(input: {
  titulo?: TituloManutencaoSnapshot | null;
  valorCobradoOficinaNovo: number | string;
  valorTituloAtual?: number | string | null;
}):
  | { ok: true; acao: "nenhuma" }
  | { ok: true; acao: "atualizar_titulo_e_parcelas"; exigeTransacaoUnica: true }
  | { ok: false; message: string } {
  const titulo = input.titulo;
  if (!titulo || titulo.estado === "cancelado") return { ok: true, acao: "nenhuma" };
  if (tituloTemPagamento(titulo)) {
    return { ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO };
  }
  if (
    input.valorTituloAtual != null
    && dinheiroIgual(input.valorTituloAtual, input.valorCobradoOficinaNovo)
  ) {
    return { ok: true, acao: "nenhuma" };
  }
  return {
    ok: true,
    acao: "atualizar_titulo_e_parcelas",
    exigeTransacaoUnica: true,
  };
}

export const ETAPAS_TX_MANUT_A_PAGAR = [
  "persistir_os",
  "amarrar_origem",
  "emitir_titulo",
  "apropriar",
  "definir_parcela",
] as const;

export type EtapaTxManutAPagar = (typeof ETAPAS_TX_MANUT_A_PAGAR)[number];

/** Proposta: tudo na mesma transação MySQL. Qualquer falha reverte a OS e o título. */
export function planejarTransacaoUnicaManutencaoAPagar(): {
  etapas: EtapaTxManutAPagar[];
  atomica: true;
  origemIdSomenteAposOs: true;
} {
  return {
    etapas: [...ETAPAS_TX_MANUT_A_PAGAR],
    atomica: true,
    origemIdSomenteAposOs: true,
  };
}

export function resultadoTransacaoUnicaSimulada(
  etapas: Array<{ nome: EtapaTxManutAPagar; ok: boolean }>,
): { ok: true; commit: true } | { ok: false; reverter: true; falhouEm: EtapaTxManutAPagar } {
  for (const etapa of etapas) {
    if (!etapa.ok) {
      return { ok: false, reverter: true, falhouEm: etapa.nome };
    }
  }
  return { ok: true, commit: true };
}

export function edicaoFinanceiraSemTransacaoUnicaDeveBloquear(): { ok: false; message: string } {
  return { ok: false, message: MSG_MANUT_FIN_EDICAO_ATOMICA };
}

/** Travada no fluxo operacional. Só funções internas de homologação usam o orquestrador. */
export const MANUT_A_PAGAR_OPERACIONAL = false;

/** O núcleo V2 não expõe atualização oficial de valorOriginal do título. */
export const MOTOR_V2_PERMITE_ATUALIZAR_VALOR_TITULO = false;

export const MSG_MANUT_FIN_NAO_ATIVA =
  "A integração da manutenção com o Financeiro V2 ainda não está disponível nas operações do dia a dia.";
export const MSG_MANUT_FIN_IDEMPOTENCY =
  "Informe a chave de confirmação da manutenção.";
export const MSG_MANUT_FIN_USUARIO =
  "Usuário inválido para gravar a manutenção.";
export const MSG_MANUT_FIN_EDICAO_SEM_API_V2 =
  "O Financeiro V2 não altera o valor de um título já emitido. Enquanto houver conta a pagar ativa, o valor cobrado pela oficina não pode ser editado.";
export const MSG_MANUT_FIN_IDENTIDADE =
  "Não é permitido alterar fornecedor, fazenda ou máquina de uma manutenção que já tem conta a pagar.";
export const MSG_MANUT_FIN_CONSISTENCIA =
  "A manutenção e o título financeiro ficaram inconsistentes. A operação foi revertida.";
export const MSG_MANUT_FIN_CHAVE_DIVERGENTE =
  "Esta chave de confirmação já foi usada em outra manutenção.";
export const MSG_MANUT_FIN_CHAVE_ALHEIA =
  "Esta chave de confirmação não pertence ao seu cadastro.";
export const MSG_MANUT_FIN_ESTORNO_TX =
  "O estorno desta manutenção precisa cancelar a conta a pagar na mesma operação. Essa etapa ainda não está liberada.";
export const MSG_MANUT_FIN_CONFLITO_IDEMPOTENCIA =
  "Outra confirmação da mesma manutenção está em andamento.";
export const MSG_MANUT_FIN_RECUPERACAO_FALHOU =
  "Não foi possível confirmar a manutenção já gravada. Tente de novo em instantes.";

/** Nome real do UNIQUE no MySQL. Só este 1062 vale como repetição da operação. */
export const MANUTENCOES_CHAVE_OPERACAO_UQ = "manutencoes_chave_operacao_uq";

type MysqlErroNo = {
  errno?: number;
  code?: string;
  sqlMessage?: string;
  message?: string;
  cause?: unknown;
};

function* cadeiaErroMysql(error: unknown, vistos = new Set<unknown>()): Generator<MysqlErroNo> {
  if (error == null || typeof error !== "object") return;
  if (vistos.has(error)) return;
  vistos.add(error);
  yield error as MysqlErroNo;
  yield* cadeiaErroMysql((error as MysqlErroNo).cause, vistos);
}

function nomeDaUniqueNoTexto(texto: string): string | null {
  const m = texto.match(/for key ['`]([^'`]+)['`]/i);
  if (!m?.[1]) return null;
  const partes = m[1].split(".");
  return partes[partes.length - 1] ?? m[1];
}

/**
 * 1062 da unique da operação. Não aceita outro índice nem texto genérico "duplicate".
 * Percorre `cause` no formato do mysql2/Drizzle.
 */
export function isDuplicateChaveOperacaoManutencao(error: unknown): boolean {
  for (const no of cadeiaErroMysql(error)) {
    const eh1062 = no.errno === 1062 || no.code === "ER_DUP_ENTRY";
    if (!eh1062) continue;
    for (const texto of [no.sqlMessage, no.message]) {
      if (!texto) continue;
      if (nomeDaUniqueNoTexto(texto) === MANUTENCOES_CHAVE_OPERACAO_UQ) return true;
    }
  }
  return false;
}

export function recusarAtivacaoOperacionalAPagar(): { ok: false; message: string } {
  return { ok: false, message: MSG_MANUT_FIN_NAO_ATIVA };
}

export function validarUsuarioManutencaoAPagar(userId: unknown):
  | { ok: true; userId: number }
  | { ok: false; message: string } {
  const n = Number(userId);
  if (!Number.isInteger(n) || n <= 0) {
    return { ok: false, message: MSG_MANUT_FIN_USUARIO };
  }
  return { ok: true, userId: n };
}

/** Mesma faixa da compra de insumos: 8 a 80 caracteres. */
export function validarIdempotencyOperacaoManutencao(raw: unknown):
  | { ok: true; key: string }
  | { ok: false; message: string } {
  const key = String(raw ?? "").trim();
  if (key.length < 8 || key.length > 80) {
    return { ok: false, message: MSG_MANUT_FIN_IDEMPOTENCY };
  }
  return { ok: true, key };
}

export function chaveIdempotenciaOperacaoManutencao(userId: number, key: string): string {
  return `${userId}:${key}`;
}

export type AssinaturaOperacaoManutencao = {
  maquinaId: number;
  fazendaId: number | null;
  prestadorPessoaId: number | null;
  tipoExecucao: string | null;
  data: string;
  valorMaoObra: string;
  valorCobradoOficina: string;
  pecasEstoque: Array<{ estoqueId: number; quantidade: string }>;
  pecasOficina: Array<{ nome: string; quantidade: string; valorUnitario: string }>;
};

function pecaOficinaDaAssinatura(peca: {
  nome?: string | null;
  quantidade?: number | string | null;
  valorUnitario?: number | string | null;
  valorTotal?: number | string | null;
  origem?: string | null;
  estoqueId?: number | null;
}): boolean {
  if (String(peca.origem ?? "").trim().toLowerCase() === "oficina") return true;
  const estoqueId = Number(peca.estoqueId);
  return !Number.isInteger(estoqueId) || estoqueId <= 0;
}

export function assinarOperacaoManutencao(input: {
  maquinaId: number;
  fazendaId?: number | null;
  prestadorPessoaId?: number | null;
  tipoExecucao?: string | null;
  data: string;
  valorMaoObra?: number | string | null;
  pecasEstoque?: Array<{ estoqueId?: number | null; quantidade?: number | string | null }>;
  pecasOficina?: Array<{
    nome?: string | null;
    quantidade?: number | string | null;
    valorUnitario?: number | string | null;
    valorTotal?: number | string | null;
    origem?: string | null;
    estoqueId?: number | null;
  }>;
  pecas?: Array<{
    estoqueId?: number | null;
    nome?: string | null;
    quantidade?: number | string | null;
    valorUnitario?: number | string | null;
    origem?: string | null;
  }>;
}): AssinaturaOperacaoManutencao {
  const pecasEstoque = (input.pecasEstoque ?? [])
    .map(p => ({
      estoqueId: Number(p.estoqueId),
      quantidade: persistirQuantidadeEstoque(p.quantidade ?? 0),
    }))
    .filter(p => Number.isInteger(p.estoqueId) && p.estoqueId > 0)
    .sort((a, b) => a.estoqueId - b.estoqueId || a.quantidade.localeCompare(b.quantidade));

  const pecasOficinaFonte = input.pecasOficina?.length
    ? input.pecasOficina
    : (input.pecas ?? []).filter(pecaOficinaDaAssinatura);

  const pecasOficina = pecasOficinaFonte
    .map(p => ({
      nome: String(p.nome ?? "").trim().toLowerCase(),
      quantidade: persistirQuantidadeEstoque(p.quantidade ?? 0),
      valorUnitario: persistirCapital(p.valorUnitario ?? 0),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome) || a.quantidade.localeCompare(b.quantidade));

  const valorCobradoOficina = persistirCapital(valorFinanceiroOficialDaOs({
    pecasEstoque: pecasEstoque.map(p => ({ quantidade: Number(p.quantidade), valorUnitario: 0 })),
    pecasOficina: pecasOficinaFonte,
    valorMaoObra: Number(input.valorMaoObra ?? 0),
  }));

  return {
    maquinaId: Number(input.maquinaId),
    fazendaId: Number.isInteger(Number(input.fazendaId)) && Number(input.fazendaId) > 0
      ? Number(input.fazendaId)
      : null,
    prestadorPessoaId: Number.isInteger(Number(input.prestadorPessoaId)) && Number(input.prestadorPessoaId) > 0
      ? Number(input.prestadorPessoaId)
      : null,
    tipoExecucao: lerTipoExecucaoManutencao(input.tipoExecucao),
    data: String(input.data ?? "").trim(),
    valorMaoObra: persistirCapital(input.valorMaoObra ?? 0),
    valorCobradoOficina,
    pecasEstoque,
    pecasOficina,
  };
}

export function assinaturasOperacaoIguais(
  a: AssinaturaOperacaoManutencao,
  b: AssinaturaOperacaoManutencao,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Protege a operação inteira (OS + título), não só o título da mesma OS.
 * A unique MySQL (userId, chaveOperacao) é a trava real.
 */
export function decidirReusoChaveOperacaoManutencao(input: {
  existente: { userId: number; osId: number; tituloId?: number | null; assinatura: AssinaturaOperacaoManutencao } | null;
  userId: number;
  proposta: AssinaturaOperacaoManutencao;
}):
  | { acao: "executar" }
  | { acao: "reutilizar"; osId: number; tituloId: number | null }
  | { acao: "bloquear"; message: string } {
  if (!input.existente) return { acao: "executar" };
  if (input.existente.userId !== input.userId) {
    return { acao: "bloquear", message: MSG_MANUT_FIN_CHAVE_ALHEIA };
  }
  if (!assinaturasOperacaoIguais(input.existente.assinatura, input.proposta)) {
    return { acao: "bloquear", message: MSG_MANUT_FIN_CHAVE_DIVERGENTE };
  }
  const tituloId = Number(input.existente.tituloId);
  return {
    acao: "reutilizar",
    osId: input.existente.osId,
    tituloId: Number.isInteger(tituloId) && tituloId > 0 ? tituloId : null,
  };
}

/**
 * Protege a operação inteira (OS + título), não só o título da mesma OS.
 * Sem chave persistida, um duplo clique ainda pode abrir duas OS.
 */
export function decidirIdempotenciaOperacaoCompleta(
  existente: { osId: number; tituloId?: number | null } | null | undefined,
):
  | { acao: "executar" }
  | { acao: "reutilizar"; osId: number; tituloId: number | null } {
  if (!existente || !Number.isInteger(existente.osId) || existente.osId <= 0) {
    return { acao: "executar" };
  }
  const tituloId = Number(existente.tituloId);
  return {
    acao: "reutilizar",
    osId: existente.osId,
    tituloId: Number.isInteger(tituloId) && tituloId > 0 ? tituloId : null,
  };
}

export function validarConsistenciaTituloManutencaoEmitido(input: {
  osId: number;
  valorCobradoOficina: number | string;
  prestadorPessoaId: number;
  fazendaId: number;
  titulo: {
    tipo: string;
    estado: string;
    pessoaId: number;
    fazendaOrigemId?: number | null;
    origemTipo?: string | null;
    origemId?: number | null;
    origemItemChave?: string | null;
    valorOriginal: number | string;
  };
  parcelas: Array<{ valorOriginal: number | string }>;
  apropriacoes: Array<{ fazendaId?: number | null; valor: number | string }>;
}): { ok: true } | { ok: false; message: string } {
  const origem = chaveOrigemTituloManutencao(input.osId);
  if (input.titulo.tipo !== "pagar" || input.titulo.estado !== "ativo") {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (
    input.titulo.origemTipo !== origem.origemTipo
    || Number(input.titulo.origemId) !== origem.origemId
    || input.titulo.origemItemChave !== origem.origemItemChave
  ) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (input.titulo.pessoaId !== input.prestadorPessoaId) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (Number(input.titulo.fazendaOrigemId) !== input.fazendaId) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (!dinheiroIgual(input.titulo.valorOriginal, input.valorCobradoOficina)) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (!input.parcelas.length || !validarSomaParcelas(input.titulo.valorOriginal, input.parcelas)) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (!input.apropriacoes.length || !validarSomaParcelas(input.titulo.valorOriginal, input.apropriacoes.map(a => ({
    valorOriginal: a.valor,
  })))) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  if (input.apropriacoes.some(a => Number(a.fazendaId) !== input.fazendaId)) {
    return { ok: false, message: MSG_MANUT_FIN_CONSISTENCIA };
  }
  return { ok: true };
}

function identidadeMudou(atual: number | null | undefined, novo: number | null | undefined): boolean {
  const a = Number(atual);
  const b = Number(novo);
  const aOk = Number.isInteger(a) && a > 0 ? a : null;
  const bOk = Number.isInteger(b) && b > 0 ? b : null;
  if (bOk == null) return false;
  return aOk !== bOk;
}

/**
 * Identidade financeira da OS não pode divergir do título ativo.
 * Sem API oficial de troca de pessoa/fazenda no V2.
 */
export function decidirEdicaoIdentidadeFinanceiraManutencao(input: {
  titulo?: TituloManutencaoSnapshot | null;
  prestadorAtual?: number | null;
  prestadorNovo?: number | null;
  fazendaAtual?: number | null;
  fazendaNova?: number | null;
}): { ok: true } | { ok: false; message: string } {
  const titulo = input.titulo;
  if (!titulo || titulo.estado === "cancelado") return { ok: true };
  if (tituloTemPagamento(titulo)) {
    return { ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO };
  }
  if (
    identidadeMudou(input.prestadorAtual, input.prestadorNovo)
    || identidadeMudou(input.fazendaAtual, input.fazendaNova)
  ) {
    return { ok: false, message: MSG_MANUT_FIN_IDENTIDADE };
  }
  return { ok: true };
}

/**
 * O que o motor V2 atual realmente permite na edição.
 * A regra desejada (atualizar valor sem pagamento) existe, mas não há API oficial de valor.
 */
export function decidirEdicaoManutencaoComMotorV2Atual(input: {
  titulo?: TituloManutencaoSnapshot | null;
  valorCobradoOficinaNovo: number | string;
  valorTituloAtual?: number | string | null;
  prestadorAtual?: number | null;
  prestadorNovo?: number | null;
  fazendaAtual?: number | null;
  fazendaNova?: number | null;
}):
  | { ok: true; acao: "nenhuma" }
  | { ok: false; message: string; motivo: "pagamento" | "sem_api_oficial" | "identidade" } {
  const titulo = input.titulo;
  if (!titulo || titulo.estado === "cancelado") return { ok: true, acao: "nenhuma" };

  if (tituloTemPagamento(titulo)) {
    return { ok: false, message: MSG_MANUT_FIN_COM_PAGAMENTO, motivo: "pagamento" };
  }

  const identidade = decidirEdicaoIdentidadeFinanceiraManutencao(input);
  if (!identidade.ok) {
    return { ok: false, message: identidade.message, motivo: "identidade" };
  }

  const valor = decidirEdicaoValorFinanceiroManutencao({
    titulo,
    valorCobradoOficinaNovo: input.valorCobradoOficinaNovo,
    valorTituloAtual: input.valorTituloAtual,
  });
  if (!valor.ok) {
    return { ok: false, message: valor.message, motivo: "pagamento" };
  }
  if (valor.acao === "atualizar_titulo_e_parcelas") {
    if (!MOTOR_V2_PERMITE_ATUALIZAR_VALOR_TITULO) {
      return { ok: false, message: MSG_MANUT_FIN_EDICAO_SEM_API_V2, motivo: "sem_api_oficial" };
    }
  }
  return { ok: true, acao: "nenhuma" };
}
