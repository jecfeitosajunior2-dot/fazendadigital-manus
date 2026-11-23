import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { manutencaoPecas, manutencoes, pessoas } from "../drizzle/schema";
import { MSG_MANUT_EXCLUSAO_BLOQUEADA, recusarExclusaoManutencao } from "../shared/manutencaoAcoes";
import { MSG_MANUT_EDICAO_ESTORNADA } from "../shared/manutencaoPecasOrigem";
import {
  MSG_MANUT_NAO_ENCONTRADA,
  manutencaoEstaEstornada,
} from "../shared/manutencaoEstoque";
import {
  lerPrestadorPessoaId,
  validarPrestadorPessoaParaOs,
} from "../shared/manutencaoIdentificacaoOperacional";
import type { PecaOficinaNormalizada } from "../shared/manutencaoPecasOrigem";
import { db as dbPadrao } from "./db";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import { criarEdicaoOficinaCtx } from "./manutencaoOficinaEdicaoMysql";
import { editarPecasOficinaNoTx } from "./manutencaoOficinaEdicao";
import {
  estornarManutencaoCompletaNoTx,
  persistirManutencaoCompletaNoTx,
  type PersistirManutencaoCompletaInput,
} from "./manutencaoCompleta";
import { criarPersistenciaCompletaCtx } from "./manutencaoCompletaMysql";
import { criarManutencaoEstoqueTx } from "./manutencaoEstoqueMysql";
import { ManutencaoEstoqueError, type ManutencaoPecaResolvida } from "./manutencaoEstoque";
import { MSG_MAQUINA_INATIVA, travarMaquinaNoTx, type SessaoOperacao } from "./maquinasOperacao";
import { estoque, maquinas } from "../drizzle/schema";
import { capitalEstaInicializado } from "../shared/estoqueCapital";

export const MSG_MANUT_SEM_MYSQL =
  "A manutenção precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_MANUT_SEM_PERMISSAO = "Sem permissão para esta operação de manutenção.";
export const MSG_MANUT_FAZENDA = "Você não tem acesso a esta Fazenda.";
export const MSG_MANUT_SEM_ESTRUTURA =
  "O banco ainda não guarda a fazenda da manutenção. Nada foi lançado.";
export const MSG_MANUT_SEM_FAZENDA_MAQUINA =
  "A máquina não tem fazenda para lançar a manutenção.";
export const MSG_MANUT_MAQUINA_FAZENDA =
  "A máquina não está na fazenda desta manutenção.";
export const MSG_MANUT_CHAVE =
  "Informe a chave desta operação para não lançar a manutenção duas vezes.";
export const MSG_MANUT_CHAVE_DIVERGENTE = "Esta chave já lançou outra manutenção.";

export type PermissaoManutencao =
  | "manutencoes.visualizar"
  | "manutencoes.criar"
  | "manutencoes.editar"
  | "manutencoes.inativar"
  | "manutencoes.estornar";

type Banco = typeof dbPadrao;
let bancoManutencoes: Banco = dbPadrao;

export function definirBancoManutencoes(banco: Banco | null) {
  bancoManutencoes = banco ?? dbPadrao;
}

let ganchoTrava: (() => Promise<void>) | null = null;

export function definirGanchoTravaManutencao(gancho: (() => Promise<void>) | null) {
  ganchoTrava = gancho;
}

async function pausaTrava() {
  const gancho = ganchoTrava;
  if (!gancho) return;
  ganchoTrava = null;
  await gancho();
}

type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];

type LinhaOs = {
  id: number;
  userId: number;
  maquinaId: number;
  fazendaId: number | null;
  status: string | null;
  tipo: string;
  descricao: string | null;
  data: string;
  horimetro: string | null;
  custo: string | null;
  valorPecas: string | null;
  valorMaoObra: string | null;
  valorTotal: string | null;
  valorPecasOficina: string | null;
  valorCobradoOficina: string | null;
  tipoExecucao: string | null;
  prestadorNome: string | null;
  prestadorContato: string | null;
  observacoes: string | null;
  chaveOperacao: string | null;
  historicoSemFazenda: boolean;
};

export type CriarManutencao = {
  maquinaId: number;
  tipo: string;
  descricao?: string | null;
  data: string;
  horimetro?: string | null;
  proximaManutencao?: string | null;
  prestadorNome?: string | null;
  prestadorContato?: string | null;
  prestadorPessoaId?: number | null;
  tipoExecucao?: string | null;
  valorMaoObra: number;
  observacoes?: string | null;
  pecas: ManutencaoPecaResolvida[];
  pecasOficina: PecaOficinaNormalizada[];
  chaveOperacao: string;
  registradoPor: string;
};

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_SEM_MYSQL });
}

function semEstrutura(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MANUT_SEM_ESTRUTURA });
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_MANUT_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_MANUT_FAZENDA });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_MANUT_NAO_ENCONTRADA });
  }
}

function ehDuplicidade(erro: unknown) {
  const candidato = erro as { errno?: number; code?: string };
  return candidato?.errno === 1062 || candidato?.code === "ER_DUP_ENTRY";
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoManutencoes.transaction(fn, { isolationLevel: "read committed" });
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

async function colunaFazenda(tx: Tx) {
  const cols = await linhas<{ Field?: string }>(
    tx,
    sql`SHOW COLUMNS FROM manutencoes LIKE 'fazendaId'`,
  );
  return cols.length > 0;
}

async function indiceChave(tx: Tx) {
  const idx = await linhas<{ Key_name?: string }>(
    tx,
    sql`SHOW INDEX FROM manutencoes WHERE Key_name = 'manutencoes_chave_operacao_uq'`,
  );
  return idx.length > 0;
}

async function exigirFazendaColuna(tx: Tx) {
  if (!(await colunaFazenda(tx))) semEstrutura();
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

async function identificar(tx: Tx, sessao: SessaoOperacao) {
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

function visivel(
  previa: { principal: boolean; fazendas: number[] },
  fazendaId: number | null,
) {
  if (fazendaId == null) return previa.principal;
  return previa.fazendas.includes(fazendaId);
}

const COLUNAS_OS = sql`id, userId, maquinaId, fazendaId, status, tipo, descricao, data, horimetro,
  custo, valorPecas, valorMaoObra, valorTotal, valorPecasOficina, valorCobradoOficina,
  tipoExecucao, prestadorNome, prestadorContato, observacoes, chaveOperacao`;

async function lerOs(tx: Tx, id: number, travar: boolean) {
  return linhas<LinhaOs>(
    tx,
    travar
      ? sql`SELECT ${COLUNAS_OS} FROM manutencoes WHERE id = ${id} FOR UPDATE`
      : sql`SELECT ${COLUNAS_OS} FROM manutencoes WHERE id = ${id} LIMIT 1`,
  );
}

async function travarOs(tx: Tx, sessao: SessaoOperacao, id: number, maquinaExtra?: number) {
  await exigirFazendaColuna(tx);
  const previa = await identificar(tx, sessao);
  const previaLinha = (await lerOs(tx, id, false))[0];
  if (!previaLinha || Number(previaLinha.userId) !== previa.titular) recusar("outro_titular");
  const fazendaPrevia = previaLinha.fazendaId == null ? null : Number(previaLinha.fazendaId);
  if (!visivel(previa, fazendaPrevia)) recusar("outro_titular");
  if (fazendaPrevia != null) await autorizar(tx, sessao, fazendaPrevia);
  const maquinasIds = [...new Set([Number(previaLinha.maquinaId), maquinaExtra].filter((item) => Number(item) > 0))].sort((a, b) => a - b);
  for (const maquinaId of maquinasIds) {
    await travarMaquinaNoTx(tx, sessao, maquinaId, { permitirInativa: true });
  }
  await pausaTrava();
  const linha = (await lerOs(tx, id, true))[0];
  if (!linha || Number(linha.userId) !== previa.titular) recusar("outro_titular");
  const fazendaId = linha.fazendaId == null ? null : Number(linha.fazendaId);
  if (!visivel(previa, fazendaId)) recusar("outro_titular");
  return { ...linha, fazendaId, titular: previa.titular, principal: previa.principal };
}

function mapear(linha: LinhaOs) {
  const fazendaId = linha.fazendaId == null ? null : Number(linha.fazendaId);
  return { ...linha, fazendaId, historicoSemFazenda: fazendaId == null };
}

async function consumiu(tx: Tx, ids: number[]) {
  const marcas = new Map<number, boolean>();
  if (!ids.length) return marcas;
  const pecas = await tx
    .select({
      manutencaoId: manutencaoPecas.manutencaoId,
      estoqueId: manutencaoPecas.estoqueId,
      quantidade: manutencaoPecas.quantidade,
    })
    .from(manutencaoPecas)
    .where(inArray(manutencaoPecas.manutencaoId, ids));
  for (const peca of pecas) {
    const q = parseFloat(String(peca.quantidade));
    if (peca.estoqueId != null && Number.isFinite(q) && q > 0) marcas.set(peca.manutencaoId, true);
  }
  return marcas;
}

async function prestadorDoTitular(
  tx: Tx,
  titular: number,
  tipoExecucao: string | null | undefined,
  prestadorPessoaId: number | null | undefined,
) {
  const pessoaId = lerPrestadorPessoaId(prestadorPessoaId);
  let pessoa: { id: number; userId: number; tipo: string; ativo: boolean | null } | null = null;
  if (pessoaId != null) {
    const [row] = await tx
      .select({
        id: pessoas.id,
        userId: pessoas.userId,
        tipo: pessoas.tipo,
        ativo: pessoas.ativo,
      })
      .from(pessoas)
      .where(eq(pessoas.id, pessoaId))
      .limit(1);
    pessoa = row ? { ...row, ativo: row.ativo ?? null } : null;
  }
  const validado = validarPrestadorPessoaParaOs({
    userId: titular,
    tipoExecucao,
    prestadorPessoaId: pessoaId,
    pessoa,
  });
  if (!validado.ok) {
    throw new TRPCError({ code: "BAD_REQUEST", message: validado.message });
  }
  return validado.prestadorPessoaId;
}

function textoChave(valor: string | null | undefined) {
  return (valor ?? "").trim();
}

function assinaturaPecas(pecas: { estoqueId: number | null; quantidade: string | number; origem?: string | null }[]) {
  return pecas
    .filter((peca) => peca.origem !== "oficina")
    .map((peca) => `${Number(peca.estoqueId)}:${Number(peca.quantidade).toFixed(2)}`)
    .sort()
    .join("|");
}

function assinaturaOficina(pecas: { nome?: string | null; quantidade: string | number; valorUnitario?: string | number | null; origem?: string | null }[]) {
  return pecas
    .filter((peca) => peca.origem === "oficina")
    .map((peca) => `${textoChave(peca.nome)}:${Number(peca.quantidade).toFixed(2)}:${Number(peca.valorUnitario ?? 0).toFixed(2)}`)
    .sort()
    .join("|");
}

async function pedidoConfere(tx: Tx, id: number, pedido: CriarManutencao) {
  const cab = await linhas<{
    data: string;
    tipo: string;
    descricao: string | null;
    horimetro: string | null;
    valorMaoObra: string | null;
    tipoExecucao: string | null;
  }>(tx, sql`SELECT data, tipo, descricao, horimetro, valorMaoObra, tipoExecucao
             FROM manutencoes WHERE id = ${id} LIMIT 1`);
  const os = cab[0];
  if (!os) return false;
  if (String(os.data).slice(0, 10) !== pedido.data.slice(0, 10)) return false;
  if (textoChave(os.tipo) !== textoChave(pedido.tipo)) return false;
  if (textoChave(os.descricao) !== textoChave(pedido.descricao)) return false;
  if (textoChave(os.horimetro) !== textoChave(pedido.horimetro)) return false;
  if (textoChave(os.tipoExecucao) !== textoChave(pedido.tipoExecucao)) return false;
  if (Math.abs(Number(os.valorMaoObra ?? 0) - Number(pedido.valorMaoObra ?? 0)) > 0.001) return false;
  const pecas = await linhas<{ estoqueId: number | null; quantidade: string; origem: string | null; nome: string; valorUnitario: string }>(
    tx,
    sql`SELECT estoqueId, quantidade, origem, nome, valorUnitario FROM manutencao_pecas WHERE manutencaoId = ${id}`,
  );
  const pedidas = pedido.pecas.map((peca) => ({
    estoqueId: peca.estoqueId,
    quantidade: peca.quantidade,
    origem: "estoque" as const,
  }));
  if (assinaturaPecas(pecas) !== assinaturaPecas(pedidas)) return false;
  const oficinaPedida = (pedido.pecasOficina ?? []).map((peca) => ({
    nome: peca.nome,
    quantidade: peca.quantidade,
    valorUnitario: peca.valorUnitario,
    origem: "oficina" as const,
  }));
  return assinaturaOficina(pecas) === assinaturaOficina(oficinaPedida);
}

async function resolverChave(
  tx: Tx,
  previa: { titular: number; principal: boolean; fazendas: number[] },
  chave: string,
  pedido: CriarManutencao,
) {
  const ja = await linhas<{ id: number; maquinaId: number; fazendaId: number | null }>(
    tx,
    sql`SELECT id, maquinaId, fazendaId FROM manutencoes
        WHERE userId = ${previa.titular} AND chaveOperacao = ${chave}
        LIMIT 1 FOR UPDATE`,
  );
  if (!ja[0]) return null;
  if (Number(ja[0].maquinaId) !== pedido.maquinaId || !(await pedidoConfere(tx, Number(ja[0].id), pedido))) {
    throw new TRPCError({ code: "CONFLICT", message: MSG_MANUT_CHAVE_DIVERGENTE });
  }
  const fazendaId = ja[0].fazendaId == null ? null : Number(ja[0].fazendaId);
  if (!visivel(previa, fazendaId)) recusar("sem_fazenda");
  return { success: true as const, id: Number(ja[0].id), repetida: true as const };
}

async function gravar(tx: Tx, titular: number, fazendaId: number, pedido: CriarManutencao) {
  const pecasOrdenadas = [...pedido.pecas].sort((a, b) => a.estoqueId - b.estoqueId);
  for (const peca of pecasOrdenadas) {
    const [presa] = await tx
      .select({ id: estoque.id, fazendaId: estoque.fazendaId })
      .from(estoque)
      .where(eq(estoque.id, peca.estoqueId))
      .for("update")
      .limit(1);
    if (!presa) throw new ManutencaoEstoqueError("Peça não encontrada no estoque.");
    if (Number(presa.fazendaId) !== fazendaId) {
      throw new ManutencaoEstoqueError("O produto não pertence à fazenda da máquina.");
    }
  }
  const entrada: PersistirManutencaoCompletaInput = {
    userId: titular,
    registradoPor: pedido.registradoPor,
    maquinaId: pedido.maquinaId,
    fazendaId,
    tipo: pedido.tipo,
    descricao: pedido.descricao,
    data: pedido.data,
    horimetro: pedido.horimetro,
    proximaManutencao: pedido.proximaManutencao,
    prestadorNome: pedido.prestadorNome,
    prestadorContato: pedido.prestadorContato,
    prestadorPessoaId: pedido.prestadorPessoaId,
    tipoExecucao: pedido.tipoExecucao,
    valorMaoObra: pedido.valorMaoObra,
    observacoes: pedido.observacoes,
    pecas: pecasOrdenadas,
    pecasOficina: pedido.pecasOficina,
    chaveOperacao: pedido.chaveOperacao,
  };
  const gravado = await persistirManutencaoCompletaNoTx(criarPersistenciaCompletaCtx(tx), entrada);
  await tx.execute(sql`UPDATE manutencoes SET fazendaId = ${fazendaId} WHERE id = ${gravado.id}`);
  return gravado;
}

export const manutencoesOperacao = {
  async listar(sessao: SessaoOperacao, filtro?: { maquinaId?: number }) {
    return correr(async (tx) => {
      await exigirFazendaColuna(tx);
      const previa = await identificar(tx, { ...sessao, permissaoId: "manutencoes.visualizar" });
      const fazendasSql = previa.fazendas.length
        ? sql.join(previa.fazendas.map((id) => sql`${id}`), sql`, `)
        : sql`NULL`;
      const brutas = await linhas<LinhaOs>(
        tx,
        previa.principal
          ? sql`SELECT id, userId, maquinaId, fazendaId, status, tipo, descricao, data, horimetro,
                       custo, valorPecas, valorMaoObra, valorTotal, valorPecasOficina, valorCobradoOficina,
                       tipoExecucao, prestadorNome, prestadorContato, observacoes, chaveOperacao
                FROM manutencoes
                WHERE userId = ${previa.titular}
                  AND (fazendaId IS NULL OR fazendaId IN (${fazendasSql}))
                ORDER BY id DESC`
          : sql`SELECT id, userId, maquinaId, fazendaId, status, tipo, descricao, data, horimetro,
                       custo, valorPecas, valorMaoObra, valorTotal, valorPecasOficina, valorCobradoOficina,
                       tipoExecucao, prestadorNome, prestadorContato, observacoes, chaveOperacao
                FROM manutencoes
                WHERE userId = ${previa.titular}
                  AND fazendaId IN (${fazendasSql})
                ORDER BY id DESC`,
      );
      const linhasVisiveis = brutas
        .map(mapear)
        .filter((linha) => visivel(previa, linha.fazendaId))
        .filter((linha) => filtro?.maquinaId == null || Number(linha.maquinaId) === filtro.maquinaId);
      const marcas = await consumiu(tx, linhasVisiveis.map((linha) => Number(linha.id)));
      return linhasVisiveis.map((linha) => ({
        ...linha,
        consumiuEstoque: marcas.get(Number(linha.id)) ?? false,
      }));
    });
  },

  async obter(sessao: SessaoOperacao, id: number) {
    return correr(async (tx) => {
      const linha = await travarOs(tx, { ...sessao, permissaoId: "manutencoes.visualizar" }, id);
      const pecas = await tx
        .select()
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, id))
        .orderBy(manutencaoPecas.id);
      const marcas = await consumiu(tx, [id]);
      return {
        ...mapear(linha),
        pecas,
        consumiuEstoque: marcas.get(id) ?? false,
      };
    });
  },

  async listarPecas(sessao: SessaoOperacao, manutencaoId: number) {
    const detalhe = await this.obter(sessao, manutencaoId);
    return detalhe.pecas;
  },

  async pendenciasSemFazenda(sessao: SessaoOperacao) {
    const lista = await this.listar({ ...sessao, permissaoId: "manutencoes.visualizar" });
    return lista
      .filter((linha) => linha.historicoSemFazenda)
      .map((linha) => ({
        id: Number(linha.id),
        maquinaId: Number(linha.maquinaId),
        data: linha.data,
        tipo: linha.tipo,
        custo: linha.custo,
      }));
  },

  async criar(sessao: SessaoOperacao, pedido: CriarManutencao) {
    const chave = pedido.chaveOperacao.trim();
    if (chave.length < 8 || chave.length > 80) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_CHAVE });
    }
    try {
      return await correr(async (tx) => {
        await exigirFazendaColuna(tx);
        if (!(await indiceChave(tx))) semEstrutura();
        const sessaoCriar = { ...sessao, permissaoId: "manutencoes.criar" };
        const previa = await identificar(tx, sessaoCriar);
        const ja = await resolverChave(tx, previa, chave, pedido);
        if (ja) return ja;
        const maquina = await travarMaquinaNoTx(tx, sessaoCriar, pedido.maquinaId);
        const fazendaId = maquina.fazendaId == null ? null : Number(maquina.fazendaId);
        if (fazendaId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_SEM_FAZENDA_MAQUINA });
        }
        await pausaTrava();
        const prestador = await prestadorDoTitular(
          tx,
          previa.titular,
          pedido.tipoExecucao,
          pedido.prestadorPessoaId,
        );
        const gravado = await gravar(tx, previa.titular, fazendaId, {
          ...pedido,
          chaveOperacao: chave,
          prestadorPessoaId: prestador,
        });
        return { success: true as const, id: gravado.id, repetida: false as const, userId: previa.titular, fazendaId };
      });
    } catch (erro) {
      if (!ehDuplicidade(erro)) throw erro;
      return correr(async (tx) => {
        await exigirFazendaColuna(tx);
        const previa = await identificar(tx, { ...sessao, permissaoId: "manutencoes.criar" });
        const achada = await resolverChave(tx, previa, chave, pedido);
        if (achada) return achada;
        throw new TRPCError({ code: "CONFLICT", message: MSG_MANUT_CHAVE_DIVERGENTE });
      });
    }
  },

  async editar(
    sessao: SessaoOperacao,
    id: number,
    pedido: Omit<CriarManutencao, "chaveOperacao" | "registradoPor">,
  ) {
    return correr(async (tx) => {
      const alvo = await travarOs(
        tx,
        { ...sessao, permissaoId: "manutencoes.editar" },
        id,
        pedido.maquinaId,
      );
      if (manutencaoEstaEstornada(alvo.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_EDICAO_ESTORNADA });
      }
      if (pedido.maquinaId !== Number(alvo.maquinaId)) {
        if (alvo.fazendaId == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_MAQUINA_FAZENDA });
        }
        const [maquina] = await tx
          .select({ fazendaId: maquinas.fazendaId })
          .from(maquinas)
          .where(eq(maquinas.id, pedido.maquinaId))
          .limit(1);
        if (Number(maquina?.fazendaId) !== Number(alvo.fazendaId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MANUT_MAQUINA_FAZENDA });
        }
      }
      const prestador = await prestadorDoTitular(
        tx,
        alvo.titular,
        pedido.tipoExecucao,
        pedido.prestadorPessoaId,
      );
      await editarPecasOficinaNoTx(criarEdicaoOficinaCtx(tx, alvo.titular, id), {
        userId: alvo.titular,
        id,
        tipoExecucao: pedido.tipoExecucao,
        valorMaoObra: pedido.valorMaoObra,
        pecasOficina: pedido.pecasOficina,
        pecasEstoqueInput: pedido.pecas.map((peca) => ({
          estoqueId: peca.estoqueId,
          quantidade: peca.quantidade,
          origem: "estoque" as const,
        })),
        cabecalho: {
          maquinaId: pedido.maquinaId,
          tipo: pedido.tipo,
          descricao: pedido.descricao ?? null,
          data: pedido.data,
          horimetro: pedido.horimetro ?? null,
          proximaManutencao: pedido.proximaManutencao ?? null,
          prestadorNome: pedido.prestadorNome ?? null,
          prestadorContato: pedido.prestadorContato ?? null,
          prestadorPessoaId: prestador,
          observacoes: pedido.observacoes ?? null,
          tipoExecucao: pedido.tipoExecucao ?? null,
        },
      });
      return { success: true as const, id, userId: alvo.titular, fazendaId: alvo.fazendaId };
    });
  },

  async excluir(sessao: SessaoOperacao, id: number) {
    return correr(async (tx) => {
      const alvo = await travarOs(tx, { ...sessao, permissaoId: "manutencoes.inativar" }, id);
      const exclusao = recusarExclusaoManutencao(alvo.status);
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: exclusao.recusar ? exclusao.message : MSG_MANUT_EXCLUSAO_BLOQUEADA,
      });
    });
  },

  async estornar(sessao: SessaoOperacao, id: number, motivo: string, hojeISO: string, registradoPor: string) {
    return correr(async (tx) => {
      const alvo = await travarOs(tx, { ...sessao, permissaoId: "manutencoes.estornar" }, id);
      const pecas = await tx
        .select({ estoqueId: manutencaoPecas.estoqueId })
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, id))
        .for("update");
      const ids = [...new Set(pecas.map((peca) => Number(peca.estoqueId)).filter((item) => item > 0))].sort((a, b) => a - b);
      let algumEstoqueComCapital = false;
      if (ids.length) {
        const rows = await tx
          .select({ capitalInicializadoEm: estoque.capitalInicializadoEm })
          .from(estoque)
          .where(inArray(estoque.id, ids));
        algumEstoqueComCapital = rows.some((row) => capitalEstaInicializado(row));
      }
      const resultado = await estornarManutencaoCompletaNoTx(criarManutencaoEstoqueTx(tx), {
        userId: alvo.titular,
        registradoPor,
        id,
        motivo,
        hojeISO,
        algumEstoqueComCapital,
      });
      if (!resultado.handled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Esta manutenção antiga não tem o vínculo para devolver o estoque com segurança.",
        });
      }
      return {
        success: true as const,
        id: resultado.id,
        alreadyEstornado: Boolean(resultado.alreadyEstornado),
      };
    });
  },
};

export { MSG_MAQUINA_INATIVA };
