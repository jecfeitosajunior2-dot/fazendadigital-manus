import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { abastecimentos, maquinas } from "../drizzle/schema";
import { db as dbPadrao } from "./db";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import { estornarSaidaAbastecimento, syncSaidaAbastecimento } from "./abastecimentoEstoqueSync";
import { MSG_MAQUINA_INATIVA, travarMaquinaNoTx, type SessaoOperacao } from "./maquinasOperacao";

export const MSG_ABAST_SEM_MYSQL =
  "O abastecimento precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_ABAST_SEM_PERMISSAO = "Sem permissão para esta operação de abastecimento.";
export const MSG_ABAST_FAZENDA = "Você não tem acesso a esta Fazenda.";
export const MSG_ABAST_NAO_ENCONTRADO = "Abastecimento não encontrado.";
export const MSG_ABAST_SEM_ESTRUTURA =
  "O banco ainda não guarda a chave do abastecimento. Nada foi lançado.";
export const MSG_ABAST_SEM_FAZENDA_MAQUINA =
  "A máquina não tem fazenda para lançar o abastecimento.";
export const MSG_ABAST_FAZENDA_COMBUSTIVEL =
  "O combustível precisa sair da mesma fazenda da máquina.";
export const MSG_ABAST_CHAVE =
  "Informe a chave desta operação para não lançar o abastecimento duas vezes.";
export const MSG_ABAST_CHAVE_DIVERGENTE = "Esta chave já lançou outro abastecimento.";
export const MSG_ABAST_EXCLUSAO =
  "O abastecimento não é apagado. O histórico fica guardado.";
export const MSG_ABAST_EXCLUSAO_ESTORNADO =
  "Abastecimento estornado não pode ser excluído. O histórico é preservado.";
export const MSG_ABAST_EDICAO_ESTORNADO = "Abastecimento estornado não pode ser editado.";
export const MSG_ABAST_EDICAO_ECON =
  "Quantidade, combustível, custo e fazenda deste abastecimento ficam como foram lançados.";
export const MSG_ABAST_ESTORNO_EXTERNO =
  "Estorno aplica-se apenas a abastecimentos com origem Estoque da Fazenda. Para compra externa, o histórico permanece.";
export const MSG_ABAST_QTD = "Informe uma quantidade abastecida válida.";

export type PermissaoAbastecimento =
  | "abastecimentos.visualizar"
  | "abastecimentos.criar"
  | "abastecimentos.editar"
  | "abastecimentos.inativar"
  | "abastecimentos.estornar";

export type CombustivelAbastecimento = "diesel" | "gasolina" | "etanol" | "arla";

export type CriarAbastecimento = {
  maquinaId: number;
  data: string;
  combustivel: CombustivelAbastecimento;
  litros: number;
  valorLitro?: string | null;
  valorTotal?: string | null;
  horimetro?: string | null;
  responsavel?: string | null;
  abastecidoNaFazenda: boolean;
  fazendaId?: number | null;
  fornecedor?: string | null;
  observacoes?: string | null;
  chaveOperacao: string;
  registradoPor: string;
};

type Banco = typeof dbPadrao;
let bancoAbastecimentos: Banco = dbPadrao;

export function definirBancoAbastecimentos(banco: Banco | null) {
  bancoAbastecimentos = banco ?? dbPadrao;
}

let ganchoTrava: (() => Promise<void>) | null = null;

export function definirGanchoTravaAbastecimento(gancho: (() => Promise<void>) | null) {
  ganchoTrava = gancho;
}

async function pausaTrava() {
  const gancho = ganchoTrava;
  if (!gancho) return;
  ganchoTrava = null;
  await gancho();
}

type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];

type Previa = { titular: number; principal: boolean; fazendas: number[] };

type Linha = {
  id: number;
  userId: number;
  maquinaId: number;
  fazendaId: number | null;
  data: string;
  combustivel: string;
  litros: string;
  valorLitro: string | null;
  valorTotal: string | null;
  horimetro: string | null;
  responsavel: string | null;
  abastecidoNaFazenda: boolean | number | null;
  fornecedor: string | null;
  observacoes: string | null;
  status: string | null;
  movimentacaoEstoqueId: number | null;
  chaveOperacao: string | null;
};

const COLUNAS = sql`id, userId, maquinaId, fazendaId, data, combustivel, litros, valorLitro, valorTotal,
  horimetro, responsavel, abastecidoNaFazenda, fornecedor, observacoes, status, movimentacaoEstoqueId, chaveOperacao`;

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_ABAST_SEM_MYSQL });
}

function semEstrutura(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_ABAST_SEM_ESTRUTURA });
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_ABAST_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_ABAST_FAZENDA });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_ABAST_NAO_ENCONTRADO });
  }
}

function ehDuplicidade(erro: unknown) {
  const candidato = erro as { errno?: number; code?: string };
  return candidato?.errno === 1062 || candidato?.code === "ER_DUP_ENTRY";
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoAbastecimentos.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    if (ehDuplicidade(erro)) throw erro;
    recusarSeDeadlockEstoque(erro);
    const texto = erro instanceof Error ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}` : String(erro);
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(texto)) {
      semMysql();
    }
    throw erro;
  }
}

async function linhas<T>(tx: Tx, consulta: ReturnType<typeof sql>): Promise<T[]> {
  const resultado = await tx.execute(consulta);
  const pacote = resultado as unknown as [T[], unknown] | T[];
  if (Array.isArray(pacote) && Array.isArray(pacote[0])) return pacote[0];
  return [];
}

async function colunaChave(tx: Tx) {
  const cols = await linhas<{ Field?: string }>(
    tx,
    sql`SHOW COLUMNS FROM abastecimentos LIKE 'chaveOperacao'`,
  );
  return cols.length > 0;
}

async function indiceChave(tx: Tx) {
  const idx = await linhas<{ Key_name?: string }>(
    tx,
    sql`SHOW INDEX FROM abastecimentos WHERE Key_name = 'abastecimentos_chave_operacao_uq'`,
  );
  return idx.length > 0;
}

async function exigirChave(tx: Tx) {
  if (!(await colunaChave(tx)) || !(await indiceChave(tx))) semEstrutura();
}

async function autorizar(tx: Tx, sessao: SessaoOperacao, fazendaId: number) {
  const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
    executorId: sessao.executorId,
    sessionVersionDaSessao: sessao.sessionVersionDaSessao,
    permissaoId: sessao.permissaoId,
    fazendaId,
    titularInformadoPeloCliente: null,
    papelInformadoPeloCliente: null,
    permissoesInformadasPeloCliente: null,
    fazendasInformadasPeloCliente: null,
  });
  if (!deciso.ok) recusar(deciso.motivo);
  return deciso.contexto;
}

async function identificar(tx: Tx, sessao: SessaoOperacao): Promise<Previa> {
  const consulta = consultaEstoqueNaTransacao(tx);
  const usuario = await consulta.usuario(sessao.executorId);
  if (!usuario || usuario.situacao !== "ativo") recusar("sem_identidade");
  if (
    sessao.sessionVersionDaSessao != null
    && sessao.sessionVersionDaSessao !== usuario.sessionVersion
  ) {
    recusar("sem_identidade");
  }
  const titular = Number(usuario.titularUserId);
  if (usuario.papel === "principal" && usuario.id === titular) {
    const fazendasDoTitular = await consulta.fazendasDoTitular(titular);
    return { titular, principal: true, fazendas: fazendasDoTitular.map((f) => f.id).sort((a, b) => a - b) };
  }
  const permissoes = await consulta.permissoes(usuario.id, titular);
  if (!permissoes.includes(sessao.permissaoId)) recusar("sem_permissao");
  const vinculos = await consulta.vinculos(usuario.id, titular);
  return {
    titular,
    principal: false,
    fazendas: vinculos.map((v) => v.fazendaId).sort((a, b) => a - b),
  };
}

function visivel(previa: Previa, fazendaId: number | null) {
  if (fazendaId == null) return previa.principal;
  return previa.fazendas.includes(fazendaId);
}

function interno(linha: { abastecidoNaFazenda: boolean | number | null; fazendaId: number | null }) {
  return Boolean(linha.abastecidoNaFazenda) && linha.fazendaId != null;
}

function numero(valor: string | number | null | undefined) {
  if (valor == null || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function mesmoNumero(a: string | number | null | undefined, b: string | number | null | undefined) {
  const na = numero(a);
  const nb = numero(b);
  if (na == null && nb == null) return true;
  if (na == null || nb == null) return false;
  return Math.abs(na - nb) < 0.001;
}

function texto(valor: string | null | undefined) {
  return (valor ?? "").trim();
}

function mapear(linha: Linha) {
  const fazendaId = linha.fazendaId == null ? null : Number(linha.fazendaId);
  return {
    ...linha,
    fazendaId,
    abastecidoNaFazenda: Boolean(linha.abastecidoNaFazenda),
    historicoSemFazenda: fazendaId == null,
  };
}

async function ler(tx: Tx, id: number, travar: boolean) {
  return linhas<Linha>(
    tx,
    travar
      ? sql`SELECT ${COLUNAS} FROM abastecimentos WHERE id = ${id} FOR UPDATE`
      : sql`SELECT ${COLUNAS} FROM abastecimentos WHERE id = ${id} LIMIT 1`,
  );
}

async function travarMaquinaTitular(tx: Tx, titular: number, maquinaId: number, permitirInativa: boolean) {
  const [row] = await tx
    .select({
      id: maquinas.id,
      userId: maquinas.userId,
      fazendaId: maquinas.fazendaId,
      status: maquinas.status,
      dataDesativacao: maquinas.dataDesativacao,
    })
    .from(maquinas)
    .where(and(eq(maquinas.id, maquinaId), eq(maquinas.userId, titular)))
    .for("update")
    .limit(1);
  if (!row) recusar("outro_titular");
  const inativa = row.status === "inativo" || row.dataDesativacao != null;
  if (!permitirInativa && inativa) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_INATIVA });
  }
  return row;
}

async function travarLancamento(tx: Tx, sessao: SessaoOperacao, id: number, maquinaExtra?: number, gancho = true) {
  const previa = await identificar(tx, sessao);
  const previaLinha = (await ler(tx, id, false))[0];
  if (!previaLinha || Number(previaLinha.userId) !== previa.titular) recusar("outro_titular");
  const fazendaPrevia = previaLinha.fazendaId == null ? null : Number(previaLinha.fazendaId);
  if (!visivel(previa, fazendaPrevia)) recusar("outro_titular");
  if (fazendaPrevia != null) await autorizar(tx, sessao, fazendaPrevia);
  const maquinasIds = [...new Set([Number(previaLinha.maquinaId), maquinaExtra].filter((item) => Number(item) > 0))].sort((a, b) => a - b);
  for (const maquinaId of maquinasIds) {
    await travarMaquinaTitular(tx, previa.titular, maquinaId, true);
  }
  if (gancho) await pausaTrava();
  const linha = (await ler(tx, id, true))[0];
  if (!linha || Number(linha.userId) !== previa.titular) recusar("outro_titular");
  const fazendaId = linha.fazendaId == null ? null : Number(linha.fazendaId);
  if (!visivel(previa, fazendaId)) recusar("outro_titular");
  return { ...mapear(linha), titular: previa.titular, principal: previa.principal };
}

function conteudoIgual(linha: Linha, pedido: CriarAbastecimento, fazendaId: number) {
  return Number(linha.maquinaId) === pedido.maquinaId
    && String(linha.data).slice(0, 10) === pedido.data.slice(0, 10)
    && linha.combustivel === pedido.combustivel
    && mesmoNumero(linha.litros, pedido.litros)
    && mesmoNumero(linha.valorLitro, pedido.valorLitro)
    && mesmoNumero(linha.valorTotal, pedido.valorTotal)
    && Boolean(linha.abastecidoNaFazenda) === pedido.abastecidoNaFazenda
    && Number(linha.fazendaId) === fazendaId;
}

async function resolverChave(tx: Tx, previa: Previa, chave: string, pedido: CriarAbastecimento, fazendaEsperada: number | null) {
  const ja = await linhas<Linha>(
    tx,
    sql`SELECT ${COLUNAS} FROM abastecimentos
        WHERE userId = ${previa.titular} AND chaveOperacao = ${chave}
        LIMIT 1 FOR UPDATE`,
  );
  if (!ja[0]) return null;
  const fazendaId = ja[0].fazendaId == null ? null : Number(ja[0].fazendaId);
  if (!visivel(previa, fazendaId)) recusar("sem_fazenda");
  if (fazendaEsperada != null && !conteudoIgual(ja[0], pedido, fazendaEsperada)) {
    throw new TRPCError({ code: "CONFLICT", message: MSG_ABAST_CHAVE_DIVERGENTE });
  }
  if (fazendaEsperada == null && !conteudoIgual(ja[0], pedido, Number(ja[0].fazendaId))) {
    throw new TRPCError({ code: "CONFLICT", message: MSG_ABAST_CHAVE_DIVERGENTE });
  }
  return { success: true as const, id: Number(ja[0].id), repetida: true as const, userId: previa.titular, fazendaId };
}

export const abastecimentosOperacao = {
  async listar(sessao: SessaoOperacao, filtro?: { maquinaId?: number }) {
    return correr(async (tx) => {
      const previa = await identificar(tx, { ...sessao, permissaoId: "abastecimentos.visualizar" });
      const fazendasSql = previa.fazendas.length
        ? sql.join(previa.fazendas.map((id) => sql`${id}`), sql`, `)
        : sql`NULL`;
      const temChave = await colunaChave(tx);
      const colunas = temChave
        ? COLUNAS
        : sql`id, userId, maquinaId, fazendaId, data, combustivel, litros, valorLitro, valorTotal,
            horimetro, responsavel, abastecidoNaFazenda, fornecedor, observacoes, status, movimentacaoEstoqueId, NULL AS chaveOperacao`;
      const brutas = await linhas<Linha>(
        tx,
        previa.principal
          ? sql`SELECT ${colunas} FROM abastecimentos
                WHERE userId = ${previa.titular}
                  AND (fazendaId IS NULL OR fazendaId IN (${fazendasSql}))
                ORDER BY data DESC, id DESC`
          : sql`SELECT ${colunas} FROM abastecimentos
                WHERE userId = ${previa.titular}
                  AND fazendaId IN (${fazendasSql})
                ORDER BY data DESC, id DESC`,
      );
      return brutas
        .map(mapear)
        .filter((linha) => visivel(previa, linha.fazendaId))
        .filter((linha) => filtro?.maquinaId == null || Number(linha.maquinaId) === filtro.maquinaId);
    });
  },

  async obter(sessao: SessaoOperacao, id: number) {
    return correr(async (tx) => travarLancamento(tx, { ...sessao, permissaoId: "abastecimentos.visualizar" }, id));
  },

  async pendenciasSemFazenda(sessao: SessaoOperacao) {
    const lista = await this.listar({ ...sessao, permissaoId: "abastecimentos.visualizar" });
    return lista
      .filter((linha) => linha.historicoSemFazenda)
      .map((linha) => ({
        id: Number(linha.id),
        maquinaId: Number(linha.maquinaId),
        data: linha.data,
        combustivel: linha.combustivel,
        litros: linha.litros,
        valorTotal: linha.valorTotal,
      }));
  },

  async criar(sessao: SessaoOperacao, pedido: CriarAbastecimento) {
    const chave = pedido.chaveOperacao.trim();
    if (chave.length < 8 || chave.length > 80) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_CHAVE });
    }
    if (!(pedido.litros > 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_QTD });
    }
    const gravar = async (tx: Tx) => {
      await exigirChave(tx);
      const sessaoCriar = { ...sessao, permissaoId: "abastecimentos.criar" as const };
      const previa = await identificar(tx, sessaoCriar);
      const previaChave = await linhas<{ id: number }>(
        tx,
        sql`SELECT id FROM abastecimentos WHERE userId = ${previa.titular} AND chaveOperacao = ${chave} LIMIT 1`,
      );
      if (previaChave[0]) {
        const alvo = await travarLancamento(tx, sessaoCriar, Number(previaChave[0].id), undefined, false);
        if (alvo.fazendaId == null || !conteudoIgual(alvo, pedido, alvo.fazendaId)) {
          throw new TRPCError({ code: "CONFLICT", message: MSG_ABAST_CHAVE_DIVERGENTE });
        }
        return { success: true as const, id: alvo.id, repetida: true as const, userId: previa.titular, fazendaId: alvo.fazendaId };
      }
      const maquina = await travarMaquinaNoTx(tx, sessaoCriar, pedido.maquinaId);
      const fazendaMaquina = maquina.fazendaId == null ? null : Number(maquina.fazendaId);
      if (fazendaMaquina == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_SEM_FAZENDA_MAQUINA });
      }
      if (pedido.fazendaId != null && Number(pedido.fazendaId) !== fazendaMaquina) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_FAZENDA_COMBUSTIVEL });
      }
      await pausaTrava();
      const responsavel = texto(pedido.responsavel) || texto(pedido.registradoPor) || null;
      const result = await tx.insert(abastecimentos).values({
        userId: previa.titular,
        maquinaId: pedido.maquinaId,
        data: pedido.data.slice(0, 10),
        combustivel: pedido.combustivel,
        litros: String(pedido.litros),
        valorLitro: pedido.valorLitro ?? null,
        valorTotal: pedido.valorTotal ?? null,
        horimetro: pedido.horimetro ?? null,
        responsavel,
        abastecidoNaFazenda: pedido.abastecidoNaFazenda,
        fazendaId: fazendaMaquina,
        fornecedor: pedido.abastecidoNaFazenda ? null : (texto(pedido.fornecedor) || null),
        status: "registrado",
        observacoes: pedido.observacoes ?? null,
      });
      const id = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
      if (!id) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível registrar o abastecimento. Tente novamente." });
      }
      await tx.execute(sql`UPDATE abastecimentos SET chaveOperacao = ${chave} WHERE id = ${id}`);
      if (pedido.abastecidoNaFazenda) {
        await syncSaidaAbastecimento({
          abastecimentoId: id,
          maquinaId: pedido.maquinaId,
          fazendaId: fazendaMaquina,
          combustivel: pedido.combustivel,
          litros: pedido.litros,
          dataISO: pedido.data.slice(0, 10),
          responsavel,
          valorTotal: pedido.valorTotal,
          observacoes: pedido.observacoes,
          userId: previa.titular,
        }, tx);
      }
      return { success: true as const, id, repetida: false as const, userId: previa.titular, fazendaId: fazendaMaquina };
    };
    try {
      return await correr(gravar);
    } catch (erro) {
      if (!ehDuplicidade(erro)) throw erro;
      return correr(async (tx) => {
        await exigirChave(tx);
        const previa = await identificar(tx, { ...sessao, permissaoId: "abastecimentos.criar" });
        const achada = await resolverChave(tx, previa, chave, pedido, null);
        if (achada) return achada;
        throw new TRPCError({ code: "CONFLICT", message: MSG_ABAST_CHAVE_DIVERGENTE });
      });
    }
  },

  async editar(
    sessao: SessaoOperacao,
    id: number,
    pedido: Omit<CriarAbastecimento, "chaveOperacao" | "registradoPor">,
  ) {
    return correr(async (tx) => {
      const alvo = await travarLancamento(
        tx,
        { ...sessao, permissaoId: "abastecimentos.editar" },
        id,
        pedido.maquinaId,
      );
      if (String(alvo.status ?? "registrado") === "estornado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_EDICAO_ESTORNADO });
      }
      const economico = !mesmoNumero(alvo.litros, pedido.litros)
        || alvo.combustivel !== pedido.combustivel
        || !mesmoNumero(alvo.valorLitro, pedido.valorLitro)
        || !mesmoNumero(alvo.valorTotal, pedido.valorTotal)
        || Boolean(alvo.abastecidoNaFazenda) !== Boolean(pedido.abastecidoNaFazenda)
        || (pedido.fazendaId != null && Number(pedido.fazendaId) !== Number(alvo.fazendaId))
        || (pedido.fazendaId == null && alvo.fazendaId != null);
      if (economico) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_EDICAO_ECON });
      }
      if (pedido.maquinaId !== Number(alvo.maquinaId)) {
        const maquina = await travarMaquinaTitular(tx, alvo.titular, pedido.maquinaId, false);
        if (Number(maquina.fazendaId) !== Number(alvo.fazendaId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_FAZENDA_COMBUSTIVEL });
        }
      }
      await tx.update(abastecimentos).set({
        maquinaId: pedido.maquinaId,
        data: pedido.data.slice(0, 10),
        horimetro: pedido.horimetro ?? null,
        responsavel: texto(pedido.responsavel) || null,
        fornecedor: alvo.abastecidoNaFazenda ? null : (texto(pedido.fornecedor) || null),
        observacoes: pedido.observacoes ?? null,
      }).where(eq(abastecimentos.id, id));
      return { success: true as const, id, userId: alvo.titular, fazendaId: alvo.fazendaId };
    });
  },

  async excluir(sessao: SessaoOperacao, id: number) {
    return correr(async (tx) => {
      const alvo = await travarLancamento(tx, { ...sessao, permissaoId: "abastecimentos.inativar" }, id);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: String(alvo.status ?? "") === "estornado" ? MSG_ABAST_EXCLUSAO_ESTORNADO : MSG_ABAST_EXCLUSAO,
      });
    });
  },

  async estornar(sessao: SessaoOperacao, id: number, motivo: string, registradoPor: string) {
    return correr(async (tx) => {
      const alvo = await travarLancamento(tx, { ...sessao, permissaoId: "abastecimentos.estornar" }, id);
      if (String(alvo.status ?? "registrado") === "estornado") {
        return { success: true as const, id, alreadyEstornado: true as const };
      }
      if (!alvo.abastecidoNaFazenda || alvo.fazendaId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_ABAST_ESTORNO_EXTERNO });
      }
      await estornarSaidaAbastecimento(id, {
        motivo,
        userId: alvo.titular,
        registradoPor,
      }, tx);
      await tx.update(abastecimentos).set({ status: "estornado" }).where(eq(abastecimentos.id, id));
      return { success: true as const, id, alreadyEstornado: false as const };
    });
  },
};
