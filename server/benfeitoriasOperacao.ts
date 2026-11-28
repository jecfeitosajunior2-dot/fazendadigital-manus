/**
 * Benfeitorias no MySQL, no nome do titular e na fazenda concedida.
 * O arquivo local não responde. A exclusão física fica recusada.
 * Não há chave de operação: reenviar a planilha cria outro cadastro.
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { benfeitorias, fazendas } from "../drizzle/schema";
import { isLinhaExemplo, normalizarLinha, parseValorImport } from "../shared/importacaoBenfeitorias";
import { loginPermitido, type IdentidadeUsuario } from "./_core/identidadeSessao";
import { avaliarAcessoFazenda, montarAcesso } from "./acessoFazendas";
import { toBenfeitoriaRow, toBenfeitoriaUpdateRow, type BenfeitoriaWriteInput } from "./benfeitoriasDb";
import { autorizarOperacaoPersistida } from "./cadastroAnimalAutorizado";
import { consultaEstoqueNaTransacao } from "./consultaEstoqueDb";
import { db as dbPadrao } from "./db";
import { recusarSeDeadlockEstoque } from "./estoqueConcorrencia";
import { formatImportDbError } from "./importacaoErrors";

export const MSG_BENFEITORIA_SEM_MYSQL =
  "O cadastro de benfeitorias precisa do banco. Nada foi gravado no arquivo local.";
export const MSG_BENFEITORIA_SEM_PERMISSAO = "Sem permissão para esta operação de benfeitoria.";
export const MSG_BENFEITORIA_NAO_ENCONTRADA = "Benfeitoria não encontrada.";
export const MSG_BENFEITORIA_APAGAR =
  "A benfeitoria não é apagada. A situação inativa tira o cadastro da lida e conserva o registro.";

export type SessaoBenfeitoria = {
  executorId: number;
  sessionVersionDaSessao: number | null;
};

type Banco = typeof dbPadrao;
type Tx = Parameters<Parameters<Banco["transaction"]>[0]>[0];
let bancoBenfeitorias: Banco = dbPadrao;
let ganchoTrava: (() => Promise<void>) | null = null;

export function definirBancoBenfeitorias(banco: Banco | null) {
  bancoBenfeitorias = banco ?? dbPadrao;
}

export function definirGanchoTravaBenfeitoria(gancho: (() => Promise<void>) | null) {
  ganchoTrava = gancho;
}

async function pausaTrava() {
  const gancho = ganchoTrava;
  if (!gancho) return;
  ganchoTrava = null;
  await gancho();
}

function semMysql(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BENFEITORIA_SEM_MYSQL });
}

function textoErro(erro: unknown) {
  return erro instanceof Error
    ? `${erro.message} ${String((erro as { code?: string }).code ?? "")}`
    : String(erro);
}

function recusar(motivo: string): never {
  switch (motivo) {
    case "sem_identidade":
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
    case "permissao_invalida":
      throw new TRPCError({ code: "FORBIDDEN", message: MSG_BENFEITORIA_SEM_PERMISSAO });
    case "sem_fazenda":
      throw new TRPCError({ code: "FORBIDDEN", message: "Você não tem acesso a esta Fazenda." });
    default:
      throw new TRPCError({ code: "NOT_FOUND", message: MSG_BENFEITORIA_NAO_ENCONTRADA });
  }
}

async function correr<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await bancoBenfeitorias.transaction(fn, { isolationLevel: "read committed" });
  } catch (erro) {
    if (erro instanceof TRPCError) throw erro;
    recusarSeDeadlockEstoque(erro);
    if (/ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ETIMEDOUT|ENOTFOUND|ECONNRESET|EHOSTUNREACH|Pool is closed|Access denied|Unable to acquire a connection|cannot enqueue|Connection lost/.test(textoErro(erro))) {
      semMysql();
    }
    if (/Failed query|sqlMessage|\bER_/.test(textoErro(erro))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: formatImportDbError(erro) });
    }
    throw erro;
  }
}

async function conta(tx: Tx, sessao: SessaoBenfeitoria, permissaoId: string) {
  const consulta = consultaEstoqueNaTransacao(tx);
  const usuario = await consulta.usuario(sessao.executorId);
  if (!usuario || !loginPermitido(usuario.situacao) || usuario.titularUserId == null) recusar("sem_identidade");
  if (sessao.sessionVersionDaSessao != null && sessao.sessionVersionDaSessao !== usuario.sessionVersion) {
    recusar("sem_identidade");
  }
  const identidade: IdentidadeUsuario = {
    id: usuario.id,
    openId: usuario.openId,
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    papel: usuario.papel,
    titularUserId: Number(usuario.titularUserId),
    situacao: usuario.situacao,
    sessionVersion: usuario.sessionVersion,
  };
  const permissoes = await consulta.permissoes(identidade.id, identidade.titularUserId);
  const principal = identidade.papel === "principal" && identidade.id === identidade.titularUserId;
  if (!principal && !permissoes.includes(permissaoId)) recusar("sem_permissao");
  const fazendasDoTitular = await consulta.fazendasDoTitular(identidade.titularUserId);
  const vinculos = await consulta.vinculos(identidade.id, identidade.titularUserId);
  const acesso = montarAcesso({ identidade, fazendasDoTitular, vinculos });
  if (!acesso) recusar("sem_identidade");
  const liberadas = fazendasDoTitular.filter((fazenda) => avaliarAcessoFazenda(acesso, fazenda) === "permitido");
  return { titular: identidade.titularUserId, principal, liberadas };
}

async function fazendasLiberadas(tx: Tx, atual: { titular: number; liberadas: { id: number }[] }) {
  const ids = new Set(atual.liberadas.map((fazenda) => fazenda.id));
  const linhas = await tx.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas).where(eq(fazendas.userId, atual.titular));
  return linhas.filter((fazenda) => ids.has(fazenda.id));
}

async function exigirFazenda(tx: Tx, sessao: SessaoBenfeitoria, permissaoId: string, fazendaId: number) {
  const deciso = await autorizarOperacaoPersistida(consultaEstoqueNaTransacao(tx), {
    executorId: sessao.executorId,
    sessionVersionDaSessao: sessao.sessionVersionDaSessao,
    permissaoId,
    fazendaId,
  });
  if (!deciso.ok) recusar(deciso.motivo);
  return deciso.contexto.titularUserId;
}

function linhasDaPlanilha(linhas: Record<string, string>[]) {
  return linhas
    .map((linha) => normalizarLinha(linha))
    .filter((linha) => !isLinhaExemplo(linha))
    .filter((linha) => Object.values(linha).some((valor) => (valor || "").trim() !== ""));
}

function conferirLinha(
  linha: Record<string, string>,
  numLinha: number,
  fazendaNomeParaId: Map<string, number>,
) {
  const erros: { linha: number; campo: string; mensagem: string }[] = [];
  const fazendaNome = (linha.fazendaNome || "").trim();
  if (!fazendaNome) erros.push({ linha: numLinha, campo: "Fazenda", mensagem: "Fazenda é obrigatória" });
  else if (!fazendaNomeParaId.has(fazendaNome.toLowerCase())) {
    erros.push({ linha: numLinha, campo: "Fazenda", mensagem: `Fazenda não encontrada: "${fazendaNome}"` });
  }
  if (!(linha.nome || "").trim()) erros.push({ linha: numLinha, campo: "Nome", mensagem: "Nome da benfeitoria é obrigatório" });
  if (!(linha.tipo || "").trim()) erros.push({ linha: numLinha, campo: "Tipo de Benfeitoria", mensagem: "Tipo de Benfeitoria é obrigatório" });
  if (!(linha.estado || "").trim()) erros.push({ linha: numLinha, campo: "Estado de Conservação", mensagem: "Estado de Conservação é obrigatório" });
  const anoRaw = (linha.anoConstrucao || "").trim();
  const anoAtual = new Date().getFullYear();
  if (!anoRaw) erros.push({ linha: numLinha, campo: "Ano de Construção", mensagem: "Ano de Construção é obrigatório" });
  else {
    const ano = parseInt(anoRaw.replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(ano) || ano < 1900 || ano > anoAtual + 1) {
      erros.push({ linha: numLinha, campo: "Ano de Construção", mensagem: `Ano de Construção inválido: "${anoRaw}"` });
    } else linha.anoConstrucao = String(ano);
  }
  const valorRaw = (linha.valor || "").trim();
  if (valorRaw) {
    const valorParsed = parseValorImport(valorRaw);
    if (!valorParsed) erros.push({ linha: numLinha, campo: "Valor", mensagem: `Valor inválido: "${valorRaw}"` });
    else linha.valor = valorParsed;
  }
  const vidaUtilRaw = (linha.vidaUtil || "").trim();
  if (vidaUtilRaw) {
    const vidaUtilNum = parseInt(vidaUtilRaw.replace(/[^0-9]/g, ""), 10);
    if (Number.isNaN(vidaUtilNum) || vidaUtilNum <= 0) {
      erros.push({ linha: numLinha, campo: "Vida Útil", mensagem: `Vida Útil inválida: "${vidaUtilRaw}"` });
    } else linha.vidaUtil = String(vidaUtilNum);
  }
  return erros;
}

export const benfeitoriasOperacao = {
  async listar(sessao: SessaoBenfeitoria) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "benfeitorias.visualizar");
      const linhas = await tx.select().from(benfeitorias).where(eq(benfeitorias.userId, atual.titular)).orderBy(desc(benfeitorias.createdAt));
      const ids = new Set(atual.liberadas.map((fazenda) => fazenda.id));
      return linhas.filter((linha) => {
        if (linha.fazendaId == null) return atual.principal;
        return ids.has(linha.fazendaId);
      });
    });
  },

  async obter(sessao: SessaoBenfeitoria, id: number) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "benfeitorias.visualizar");
      const [linha] = await tx.select().from(benfeitorias).where(eq(benfeitorias.id, id)).limit(1);
      if (!linha || linha.userId !== atual.titular) recusar("fazenda_inexistente");
      if (linha.fazendaId == null) {
        if (!atual.principal) recusar("sem_fazenda");
        return linha;
      }
      if (!atual.liberadas.some((fazenda) => fazenda.id === linha.fazendaId)) recusar("sem_fazenda");
      return linha;
    });
  },

  async criar(
    sessao: SessaoBenfeitoria,
    entrada: BenfeitoriaWriteInput,
    imagens: [string | null, string | null, string | null],
  ) {
    return correr(async (tx) => {
      const titular = await exigirFazenda(tx, sessao, "benfeitorias.criar", entrada.fazendaId);
      const nome = entrada.nome?.trim();
      if (!nome) throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o nome." });
      const result = await tx.insert(benfeitorias).values(toBenfeitoriaRow(titular, { ...entrada, nome }, imagens));
      const id = Number((result as unknown as [{ insertId?: number }])[0]?.insertId ?? 0);
      await pausaTrava();
      return { success: true as const, id };
    });
  },

  async atualizar(
    sessao: SessaoBenfeitoria,
    id: number,
    entrada: Partial<BenfeitoriaWriteInput>,
    imagens?: [string | null, string | null, string | null],
  ) {
    return correr(async (tx) => {
      const [atualLinha] = await tx.select().from(benfeitorias).where(eq(benfeitorias.id, id)).for("update").limit(1);
      if (!atualLinha) recusar("fazenda_inexistente");
      const titular = atualLinha.fazendaId == null
        ? (await conta(tx, sessao, "benfeitorias.editar")).titular
        : await exigirFazenda(tx, sessao, "benfeitorias.editar", atualLinha.fazendaId);
      if (atualLinha.userId !== titular) recusar("outro_titular");
      if (atualLinha.fazendaId == null) {
        const atual = await conta(tx, sessao, "benfeitorias.editar");
        if (!atual.principal) recusar("sem_fazenda");
      }
      if (entrada.fazendaId != null && entrada.fazendaId !== atualLinha.fazendaId) {
        const destino = await exigirFazenda(tx, sessao, "benfeitorias.editar", entrada.fazendaId);
        if (destino !== titular) recusar("outro_titular");
      }
      const patch = toBenfeitoriaUpdateRow(entrada, imagens) as Record<string, unknown>;
      delete patch.userId;
      await pausaTrava();
      if (Object.keys(patch).length > 0) {
        await tx.update(benfeitorias).set(patch).where(and(eq(benfeitorias.id, id), eq(benfeitorias.userId, titular)));
      }
      return { success: true as const };
    });
  },

  async recusarExclusao(sessao: SessaoBenfeitoria, id: number): Promise<never> {
    return correr(async (tx) => {
      const [linha] = await tx.select({
        id: benfeitorias.id,
        userId: benfeitorias.userId,
        fazendaId: benfeitorias.fazendaId,
      }).from(benfeitorias).where(eq(benfeitorias.id, id)).limit(1);
      if (!linha) recusar("fazenda_inexistente");
      const atual = await conta(tx, sessao, "benfeitorias.inativar");
      if (linha.userId !== atual.titular) recusar("outro_titular");
      if (linha.fazendaId != null && !atual.liberadas.some((fazenda) => fazenda.id === linha.fazendaId)) {
        recusar("sem_fazenda");
      }
      if (linha.fazendaId == null && !atual.principal) recusar("sem_fazenda");
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: MSG_BENFEITORIA_APAGAR });
    });
  },

  async nomesParaModelo(sessao: SessaoBenfeitoria) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "benfeitorias.editar");
      const liberadas = await fazendasLiberadas(tx, atual);
      const ids = liberadas.map((fazenda) => fazenda.id);
      if (ids.length === 0) return [] as string[];
      const linhas = await tx.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas).where(eq(fazendas.userId, atual.titular));
      return linhas.filter((linha) => ids.includes(linha.id)).map((linha) => linha.nome).sort((a, b) => a.localeCompare(b));
    });
  },

  async validar(sessao: SessaoBenfeitoria, recebidas: Record<string, string>[]) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "benfeitorias.editar");
      const mapa = new Map((await fazendasLiberadas(tx, atual)).map((fazenda) => [fazenda.nome.toLowerCase().trim(), fazenda.id]));
      const linhas = linhasDaPlanilha(recebidas);
      const erros: { linha: number; campo: string; mensagem: string }[] = [];
      const validos: Record<string, string>[] = [];
      linhas.forEach((linha, indice) => {
        const errosLinha = conferirLinha(linha, indice + 2, mapa);
        if (errosLinha.length > 0) erros.push(...errosLinha);
        else validos.push(linha);
      });
      return {
        total: linhas.length,
        validos: validos.length,
        invalidos: erros.length > 0 ? linhas.length - validos.length : 0,
        erros,
        fazendaNomeParaId: Object.fromEntries(mapa),
      };
    });
  },

  async importar(sessao: SessaoBenfeitoria, recebidas: Record<string, string>[]) {
    return correr(async (tx) => {
      const atual = await conta(tx, sessao, "benfeitorias.criar");
      if (!atual.principal) {
        await tx.execute(sql`SELECT id FROM users WHERE id = ${atual.titular} FOR UPDATE`);
      }
      const mapa = new Map((await fazendasLiberadas(tx, atual)).map((fazenda) => [fazenda.nome.toLowerCase().trim(), fazenda.id]));
      const linhas = linhasDaPlanilha(recebidas);
      const rejeitados: { linha: number; mensagem: string }[] = [];
      const aceitas: { fazendaId: number; nome: string; anoConstrucao: number; tipo: string; estado: string; valorEstimado?: string; vidaUtil?: string; observacoes?: string }[] = [];
      linhas.forEach((linha, indice) => {
        const numLinha = indice + 2;
        const copia = { ...linha };
        const erros = conferirLinha(copia, numLinha, mapa);
        if (erros.length > 0) {
          rejeitados.push({ linha: numLinha, mensagem: erros[0]?.mensagem ?? "Linha inválida." });
          return;
        }
        const fazendaId = mapa.get((copia.fazendaNome || "").trim().toLowerCase());
        if (!fazendaId) {
          rejeitados.push({ linha: numLinha, mensagem: "A Fazenda informada não foi encontrada." });
          return;
        }
        aceitas.push({
          fazendaId,
          nome: copia.nome.trim(),
          anoConstrucao: parseInt(copia.anoConstrucao, 10),
          tipo: copia.tipo.trim(),
          estado: copia.estado.trim(),
          valorEstimado: (copia.valor || "").trim() || undefined,
          vidaUtil: (copia.vidaUtil || "").trim() || undefined,
          observacoes: (copia.observacoes || "").trim() || undefined,
        });
      });
      const importados: number[] = [];
      for (const item of aceitas) {
        await exigirFazenda(tx, sessao, "benfeitorias.criar", item.fazendaId);
        const result = await tx.insert(benfeitorias).values(toBenfeitoriaRow(atual.titular, item, [null, null, null]));
        importados.push(Number((result as unknown as [{ insertId?: number }])[0]?.insertId ?? 0));
      }
      await pausaTrava();
      return {
        total: linhas.length,
        importados: importados.length,
        rejeitados: rejeitados.length,
        detalhesRejeitados: rejeitados,
      };
    });
  },
};
