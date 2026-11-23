import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { abastecimentos, maquinas, manutencoes } from "../drizzle/schema";
import { db as dbPadrao } from "./db";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import { isDatabaseUnavailable } from "./localFallbackStore";

export const MSG_MAQUINA_SEM_MYSQL =
  "O cadastro de máquinas precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_MAQUINA_SEM_PERMISSAO = "Sem permissão para esta operação de máquinas.";
export const MSG_MAQUINA_FAZENDA = "Você não tem acesso a esta Fazenda.";
export const MSG_MAQUINA_NAO_ENCONTRADA = "Máquina não encontrada.";
export const MSG_MAQUINA_NOME =
  "Já existe uma máquina ativa com este nome de identificação na Fazenda selecionada.";
export const MSG_MAQUINA_PLACA =
  "Já existe uma máquina ativa com esta identificação na Fazenda selecionada.";
export const MSG_MAQUINA_COM_VINCULOS =
  "Esta máquina possui registros vinculados e não pode ser excluída. Inative a máquina para impedir novos lançamentos sem perder o histórico.";
export const MSG_MAQUINA_TRANSFERENCIA =
  "Esta máquina tem manutenção sem a fazenda da época. A mudança de fazenda fica bloqueada para o custo não aparecer em outra fazenda.";
export const MSG_MAQUINA_INATIVA =
  "Máquina inativa. Reative a máquina para novos lançamentos operacionais.";

export type PermissaoMaquina =
  | "maquinas.visualizar"
  | "maquinas.criar"
  | "maquinas.editar"
  | "maquinas.inativar";

export type SessaoMaquina = {
  executorId: number;
  sessionVersionDaSessao: number | null;
  permissaoId: PermissaoMaquina;
};

export type SessaoOperacao = {
  executorId: number;
  sessionVersionDaSessao: number | null;
  permissaoId: string;
};

export type LinhaImportacaoMaquina = {
  numLinha: number;
  nome: string;
  tipo: string;
  marca: string;
  modelo?: string | null;
  placa?: string | null;
  ano?: number | null;
  dataAquisicao?: string | null;
  estado?: string | null;
  valor?: string | null;
  vidaUtil?: string | null;
  tipoMedidor: string;
  horimetro?: string | null;
  observacoes?: string | null;
};

type Banco = typeof dbPadrao;
let bancoMaquinas: Banco = dbPadrao;

export function definirBancoMaquinas(banco: Banco | null) {
  bancoMaquinas = banco ?? dbPadrao;
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_MAQUINA_SEM_MYSQL });
}

let ganchoTravaMaquina: (() => Promise<void>) | null = null;

/** Ponto de espera dos testes, depois da fazenda e antes da máquina. */
export function definirGanchoTravaMaquina(gancho: (() => Promise<void>) | null) {
  ganchoTravaMaquina = gancho;
}

async function pausaTrava() {
  const gancho = ganchoTravaMaquina;
  if (!gancho) return;
  ganchoTravaMaquina = null;
  await gancho();
}

async function autorizarFazendas(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  sessao: SessaoOperacao,
  ids: Array<number | null | undefined>,
) {
  const unicas = [...new Set(ids.filter((id): id is number => Number.isInteger(id) && (id ?? 0) > 0))].sort((a, b) => a - b);
  for (const id of unicas) await autorizar(tx, sessao, id);
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_MAQUINA_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_MAQUINA_FAZENDA });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_MAQUINA_NAO_ENCONTRADA });
  }
}

function ativa(row: { status?: string | null; dataDesativacao?: unknown }) {
  if (row.dataDesativacao) return false;
  if (row.status === "inativo") return false;
  return true;
}

function placaNorm(valor: string | null | undefined) {
  const texto = String(valor ?? "").trim().replace(/\s+/g, "").toUpperCase();
  return texto || "";
}

async function correr<T>(fn: (tx: Parameters<Parameters<Banco["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  try {
    return await bancoMaquinas.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (isDatabaseUnavailable(erro)) semMysql();
    throw erro;
  }
}

async function autorizar(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  sessao: SessaoOperacao,
  fazendaId: number,
) {
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

async function identificar(tx: Parameters<Parameters<Banco["transaction"]>[0]>[0], sessao: SessaoOperacao) {
  const consulta = consultaEstoqueNaTransacao(tx);
  const usuario = await consulta.usuario(sessao.executorId);
  if (!usuario || usuario.situacao !== "ativo") recusar("sem_identidade");
  if (sessao.sessionVersionDaSessao != null && sessao.sessionVersionDaSessao !== usuario.sessionVersion) {
    recusar("sem_identidade");
  }
  const titular = Number(usuario.titularUserId);
  if (usuario.papel === "principal" && usuario.id === titular) {
    const fazendasDoTitular = await consulta.fazendasDoTitular(titular);
    return { titular, principal: true, fazendas: fazendasDoTitular.map((f) => f.id) };
  }
  const permissoes = await consulta.permissoes(usuario.id, titular);
  if (!permissoes.includes(sessao.permissaoId)) recusar("sem_permissao");
  const vinculos = await consulta.vinculos(usuario.id, titular);
  return { titular, principal: false, fazendas: vinculos.map((v) => v.fazendaId) };
}

async function travarDaFazenda(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  titular: number,
  fazendaId: number,
) {
  return tx
    .select({
      id: maquinas.id,
      nome: maquinas.nome,
      placa: maquinas.placa,
      status: maquinas.status,
      dataDesativacao: maquinas.dataDesativacao,
    })
    .from(maquinas)
    .where(and(eq(maquinas.userId, titular), eq(maquinas.fazendaId, fazendaId)))
    .for("update");
}

function recusarDuplicidade(
  rows: Array<{ id: number; nome: string | null; placa: string | null; status: string | null; dataDesativacao: unknown }>,
  nome: string,
  placa: string | null | undefined,
  excludeId?: number,
) {
  const nomeAlvo = nome.trim().toLowerCase();
  const placaAlvo = placaNorm(placa);
  for (const row of rows) {
    if (excludeId != null && row.id === excludeId) continue;
    if (!ativa(row)) continue;
    if ((row.nome ?? "").trim().toLowerCase() === nomeAlvo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_NOME });
    }
    if (placaAlvo && row.placa && placaNorm(row.placa) === placaAlvo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_PLACA });
    }
  }
}

async function lerMaquina(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  titular: number,
  id: number,
) {
  const [row] = await tx
    .select()
    .from(maquinas)
    .where(and(eq(maquinas.id, id), eq(maquinas.userId, titular)))
    .for("update")
    .limit(1);
  return row ?? null;
}

async function contarVinculos(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  id: number,
) {
  const [ab] = await tx
    .select({ id: abastecimentos.id })
    .from(abastecimentos)
    .where(eq(abastecimentos.maquinaId, id))
    .for("update")
    .limit(1);
  if (ab) return true;
  const [man] = await tx
    .select({ id: manutencoes.id })
    .from(manutencoes)
    .where(eq(manutencoes.maquinaId, id))
    .for("update")
    .limit(1);
  return Boolean(man);
}

export async function travarMaquinaNoTx(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  sessao: SessaoOperacao,
  maquinaId: number,
  opts?: { permitirInativa?: boolean; fazendaExtra?: number | null },
) {
  const previa = await identificar(tx, sessao);
  const [vista] = await tx
    .select({ fazendaId: maquinas.fazendaId })
    .from(maquinas)
    .where(and(eq(maquinas.id, maquinaId), eq(maquinas.userId, previa.titular)))
    .limit(1);
  if (!vista) recusar("outro_titular");
  if (vista.fazendaId == null && !previa.principal) recusar("outro_titular");
  await autorizarFazendas(tx, sessao, [vista.fazendaId, opts?.fazendaExtra]);
  await pausaTrava();
  const atual = await lerMaquina(tx, previa.titular, maquinaId);
  if (!atual) recusar("outro_titular");
  if (!opts?.permitirInativa && !ativa(atual)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_INATIVA });
  }
  return atual;
}

async function manutencaoImpedeTransferencia(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  id: number,
) {
  const colunas = await tx.execute(sql`SHOW COLUMNS FROM manutencoes LIKE 'fazendaId'`);
  const pacote = colunas as unknown as [{ Field?: string }[], unknown] | { Field?: string }[];
  const lista = Array.isArray(pacote) && Array.isArray(pacote[0]) ? pacote[0] : [];
  if (lista.length === 0) {
    const [man] = await tx
      .select({ id: manutencoes.id })
      .from(manutencoes)
      .where(eq(manutencoes.maquinaId, id))
      .limit(1);
    return Boolean(man);
  }
  const antigas = await tx.execute(
    sql`SELECT id FROM manutencoes WHERE maquinaId = ${id} AND fazendaId IS NULL LIMIT 1`,
  );
  const linhas = antigas as unknown as [{ id: number }[], unknown] | { id: number }[];
  const achadas = Array.isArray(linhas) && Array.isArray(linhas[0]) ? linhas[0] : [];
  return achadas.length > 0;
}

async function prepararSituacao(
  tx: Parameters<Parameters<Banco["transaction"]>[0]>[0],
  sessao: SessaoMaquina,
  id: number,
) {
  const pedido = { ...sessao, permissaoId: "maquinas.inativar" as const };
  const previa = await identificar(tx, pedido);
  const [vista] = await tx
    .select({ fazendaId: maquinas.fazendaId })
    .from(maquinas)
    .where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)))
    .limit(1);
  if (!vista) recusar("outro_titular");
  if (vista.fazendaId == null && !previa.principal) recusar("outro_titular");
  await autorizarFazendas(tx, pedido, [vista.fazendaId]);
  await pausaTrava();
  const atual = await lerMaquina(tx, previa.titular, id);
  if (!atual) recusar("outro_titular");
  if (atual.fazendaId != null && atual.fazendaId !== vista.fazendaId) {
    await autorizar(tx, pedido, atual.fazendaId);
  }
  return previa;
}

export const maquinasOperacao = {
  async listar(sessao: SessaoMaquina) {
    return correr(async (tx) => {
      const acesso = await identificar(tx, { ...sessao, permissaoId: "maquinas.visualizar" });
      const rows = await tx
        .select()
        .from(maquinas)
        .where(eq(maquinas.userId, acesso.titular))
        .orderBy(desc(maquinas.createdAt));
      if (acesso.principal) return rows;
      const concedidas = new Set(acesso.fazendas);
      return rows.filter((row) => row.fazendaId != null && concedidas.has(row.fazendaId));
    });
  },

  async ler(sessao: SessaoMaquina, id: number) {
    return correr(async (tx) => {
      const acesso = await identificar(tx, sessao);
      const [row] = await tx
        .select()
        .from(maquinas)
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, acesso.titular)))
        .limit(1);
      if (!row) return null;
      if (!acesso.principal && (row.fazendaId == null || !acesso.fazendas.includes(row.fazendaId))) return null;
      return row;
    });
  },

  async obter(sessao: SessaoMaquina, id: number) {
    return this.ler({ ...sessao, permissaoId: "maquinas.visualizar" }, id);
  },

  async criar(sessao: SessaoMaquina, row: Record<string, unknown>) {
    const fazendaId = Number(row.fazendaId);
    return correr(async (tx) => {
      const acesso = await autorizar(tx, { ...sessao, permissaoId: "maquinas.criar" }, fazendaId);
      await pausaTrava();
      const travadas = await travarDaFazenda(tx, acesso.titularUserId, fazendaId);
      recusarDuplicidade(travadas, String(row.nome ?? ""), row.placa as string | null | undefined);
      const result = await tx.insert(maquinas).values({
        ...row,
        userId: acesso.titularUserId,
        fazendaId,
        status: "ativo",
      } as typeof maquinas.$inferInsert);
      const id = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
      if (!Number.isFinite(id) || id <= 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível salvar a máquina." });
      }
      return { success: true as const, id, userId: acesso.titularUserId };
    });
  },

  async editar(
    sessao: SessaoMaquina,
    id: number,
    patch: Record<string, unknown>,
    identidade: { nome: string; placa: string | null; fazendaId: number | null },
  ) {
    return correr(async (tx) => {
      const pedido = { ...sessao, permissaoId: "maquinas.editar" as const };
      const previa = await identificar(tx, pedido);
      const [vista] = await tx
        .select({ fazendaId: maquinas.fazendaId })
        .from(maquinas)
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)))
        .limit(1);
      if (!vista) recusar("outro_titular");
      const fazendaAtual = vista.fazendaId ?? null;
      const fazendaNova = identidade.fazendaId ?? fazendaAtual;
      if (fazendaAtual == null && !previa.principal) recusar("outro_titular");
      await autorizarFazendas(tx, pedido, [fazendaAtual, fazendaNova]);
      await pausaTrava();
      const atual = await lerMaquina(tx, previa.titular, id);
      if (!atual) recusar("outro_titular");
      if (atual.fazendaId != null && atual.fazendaId !== fazendaAtual && atual.fazendaId !== fazendaNova) {
        await autorizar(tx, pedido, atual.fazendaId);
      }
      const destino = fazendaNova ?? atual.fazendaId ?? null;
      if (destino != null && atual.fazendaId != null && destino !== atual.fazendaId && await manutencaoImpedeTransferencia(tx, id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_TRANSFERENCIA });
      }
      if (destino != null) {
        const travadas = await travarDaFazenda(tx, previa.titular, destino);
        recusarDuplicidade(travadas, identidade.nome, identidade.placa, id);
      }
      await tx
        .update(maquinas)
        .set({ ...patch, userId: previa.titular, updatedAt: new Date() })
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)));
      const [row] = await tx.select().from(maquinas).where(eq(maquinas.id, id)).limit(1);
      return { success: true as const, maquina: row ?? atual };
    });
  },

  async inativar(sessao: SessaoMaquina, id: number) {
    return correr(async (tx) => {
      const previa = await prepararSituacao(tx, sessao, id);
      await tx
        .update(maquinas)
        .set({ status: "inativo", dataDesativacao: new Date() })
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)));
      return { success: true as const };
    });
  },

  async reativar(sessao: SessaoMaquina, id: number) {
    return correr(async (tx) => {
      const previa = await prepararSituacao(tx, sessao, id);
      const atual = await lerMaquina(tx, previa.titular, id);
      if (!atual) recusar("outro_titular");
      if (atual.fazendaId != null) {
        const travadas = await travarDaFazenda(tx, previa.titular, atual.fazendaId);
        recusarDuplicidade(travadas, atual.nome, atual.placa, atual.id);
      }
      await tx
        .update(maquinas)
        .set({ status: "ativo", dataDesativacao: null })
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)));
      return { success: true as const };
    });
  },

  async excluir(sessao: SessaoMaquina, id: number) {
    return correr(async (tx) => {
      const previa = await prepararSituacao(tx, sessao, id);
      if (await contarVinculos(tx, id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: MSG_MAQUINA_COM_VINCULOS });
      }
      await tx.delete(maquinas).where(and(eq(maquinas.id, id), eq(maquinas.userId, previa.titular)));
      return { success: true as const };
    });
  },

  async idsComVinculo(sessao: SessaoMaquina) {
    return correr(async (tx) => {
      const acesso = await identificar(tx, { ...sessao, permissaoId: "maquinas.visualizar" });
      const visiveis = await tx
        .select({ id: maquinas.id, fazendaId: maquinas.fazendaId })
        .from(maquinas)
        .where(eq(maquinas.userId, acesso.titular));
      const concedidas = new Set(acesso.fazendas);
      const idsVisiveis = new Set(
        visiveis
          .filter((row) => acesso.principal || (row.fazendaId != null && concedidas.has(row.fazendaId)))
          .map((row) => row.id),
      );
      if (idsVisiveis.size === 0) return [] as number[];
      const lista = [...idsVisiveis];
      const ab = await tx
        .select({ maquinaId: abastecimentos.maquinaId })
        .from(abastecimentos)
        .where(inArray(abastecimentos.maquinaId, lista));
      const man = await tx
        .select({ maquinaId: manutencoes.maquinaId })
        .from(manutencoes)
        .where(inArray(manutencoes.maquinaId, lista));
      const ids = new Set<number>();
      for (const row of [...ab, ...man]) {
        if (row.maquinaId != null && idsVisiveis.has(row.maquinaId)) ids.add(row.maquinaId);
      }
      return [...ids];
    });
  },

  async podeExcluir(sessao: SessaoMaquina, id: number) {
    return correr(async (tx) => {
      const acesso = await identificar(tx, { ...sessao, permissaoId: "maquinas.visualizar" });
      const [row] = await tx
        .select()
        .from(maquinas)
        .where(and(eq(maquinas.id, id), eq(maquinas.userId, acesso.titular)))
        .limit(1);
      if (!row) recusar("outro_titular");
      if (!acesso.principal && (row.fazendaId == null || !acesso.fazendas.includes(row.fazendaId))) {
        recusar("outro_titular");
      }
      const preso = await contarVinculos(tx, id);
      return { podeExcluir: !preso as boolean };
    });
  },

  async importarLote(sessao: SessaoMaquina, fazendaId: number, linhas: LinhaImportacaoMaquina[]) {
    if (linhas.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nenhuma linha válida para importar. Nenhuma máquina foi importada.",
      });
    }
    return correr(async (tx) => {
      const acesso = await autorizar(tx, { ...sessao, permissaoId: "maquinas.criar" }, fazendaId);
      await pausaTrava();
      const travadas = await travarDaFazenda(tx, acesso.titularUserId, fazendaId);
      const vistas = [...travadas];
      const ids: number[] = [];
      for (const linha of linhas) {
        try {
          recusarDuplicidade(vistas, linha.nome, linha.placa);
        } catch (erro) {
          const texto = erro instanceof Error ? erro.message : "Linha inválida.";
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Importação bloqueada na linha ${linha.numLinha}. ${texto} Nenhuma máquina foi importada.`,
          });
        }
        const result = await tx.insert(maquinas).values({
          userId: acesso.titularUserId,
          fazendaId,
          nome: linha.nome,
          tipo: linha.tipo,
          marca: linha.marca,
          modelo: linha.modelo ?? null,
          placa: linha.placa ? placaNorm(linha.placa) : null,
          ano: linha.ano ?? null,
          dataAquisicao: linha.dataAquisicao ?? null,
          anoAquisicao: linha.dataAquisicao ? Number(linha.dataAquisicao.slice(0, 4)) : null,
          valor: linha.valor ?? null,
          vidaUtil: linha.vidaUtil ?? null,
          estado: linha.estado ?? null,
          tipoMedidor: linha.tipoMedidor,
          horimetro: linha.horimetro ?? null,
          observacoes: linha.observacoes ?? null,
          status: "ativo",
        });
        const id = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
        if (!Number.isFinite(id) || id <= 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Importação bloqueada na linha ${linha.numLinha}. Não foi possível salvar a máquina. Nenhuma máquina foi importada.`,
          });
        }
        ids.push(id);
        vistas.push({
          id,
          nome: linha.nome,
          placa: linha.placa ?? null,
          status: "ativo",
          dataDesativacao: null,
        });
      }
      return {
        success: true as const,
        ids,
        userId: acesso.titularUserId,
        total: linhas.length,
        importados: ids.length,
        rejeitados: 0,
        detalhesRejeitados: [] as { linha: number; mensagem: string }[],
      };
    });
  },

  async afirmarOperavel(sessao: SessaoOperacao, maquinaId: number, opts?: { permitirInativa?: boolean }) {
    return correr(async (tx) => travarMaquinaNoTx(tx, sessao, maquinaId, opts));
  },

  async lancarAbastecimento(
    sessao: SessaoOperacao,
    row: { maquinaId: number; fazendaId: number | null; litros: string; data: string; combustivel: "diesel" | "gasolina" | "etanol" | "arla" },
  ) {
    return correr(async (tx) => {
      const maquina = await travarMaquinaNoTx(tx, sessao, row.maquinaId, { fazendaExtra: row.fazendaId });
      const result = await tx.insert(abastecimentos).values({
        userId: maquina.userId,
        maquinaId: maquina.id,
        data: row.data,
        combustivel: row.combustivel,
        litros: row.litros,
        fazendaId: row.fazendaId,
        status: "registrado",
      });
      const id = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
      return { id, userId: maquina.userId };
    });
  },

  async lancarManutencao(
    sessao: SessaoOperacao,
    row: { maquinaId: number; data: string; tipo: string; custo: string },
  ) {
    return correr(async (tx) => {
      const maquina = await travarMaquinaNoTx(tx, sessao, row.maquinaId);
      const result = await tx.insert(manutencoes).values({
        userId: maquina.userId,
        maquinaId: maquina.id,
        tipo: row.tipo,
        data: row.data,
        custo: row.custo,
        status: "concluida",
      });
      const id = Number((result as { insertId?: number }[])[0]?.insertId ?? (result as { insertId?: number }).insertId);
      return { id, userId: maquina.userId, fazendaId: maquina.fazendaId };
    });
  },

  async exigirFazenda(sessao: SessaoMaquina, fazendaId: number) {
    return correr(async (tx) => autorizar(tx, sessao, fazendaId));
  },

  async exigirPermissao(sessao: SessaoMaquina) {
    return correr(async (tx) => identificar(tx, sessao));
  },
};
