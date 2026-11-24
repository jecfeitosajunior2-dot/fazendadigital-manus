/**
 * Leitura operacional desta auditoria.
 * A trava geral de server/leituraAutorizada.ts continua fechada.
 * Esta função só aceita a conta fd_auditoria_ro, no banco e no container da fazenda,
 * com a frase desta sessão. Ela não lê variável de ambiente e não altera dados.
 */
import fs from "node:fs";
import mysql from "mysql2/promise";
import {
  CONSULTAS_DUPLICIDADE,
  CONSULTAS_HISTORICO,
  SITUACAO_OPERACIONAL,
  avaliarJournal,
  compararFoto,
  consultaDoCatalogo,
  consultaEhContagem,
  vigiar0070,
  type FotoEsquema,
} from "./conferenciaEstrutural";

export const FRASE_AUDITORIA_OPERACIONAL = "AUTORIZO_AUDITORIA_OPERACIONAL_SOMENTE_LEITURA";
export const CONTA_AUDITORIA = "fd_auditoria_ro";
export const LIMITE_CONSULTAS_AUDITORIA = 40;
export const PRAZO_MS = 90_000;
export const CONSULTA_MS = 15_000;

const DESTINO = {
  host: "127.0.0.1",
  porta: 3306,
  banco: "fazenda_digital",
  servidor: "fazenda-digital-mysql",
} as const;

const CONSULTA_GRANTS = "SHOW GRANTS FOR CURRENT_USER()";
const CONSULTA_IDENTIDADE = `SELECT VERSION() AS versao, DATABASE() AS banco, CURRENT_USER() AS usuario, @@hostname AS servidor, @@port AS porta`;
const CONSULTA_ORIGEM = `SELECT SUBSTRING_INDEX(HOST, ':', 1) AS origem FROM information_schema.processlist WHERE ID = CONNECTION_ID()`;
const CONSULTAS_ESQUEMA = [
  `SELECT TABLE_NAME AS tabela FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
  `SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, IFNULL(EXTRA, '') AS extra
   FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
  `SELECT TABLE_NAME AS tabela, INDEX_NAME AS indice, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem, COLUMN_NAME AS coluna
   FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()`,
  `SELECT TABLE_NAME AS tabela, CONSTRAINT_NAME AS chave, COLUMN_NAME AS coluna, REFERENCED_TABLE_NAME AS referencia
   FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
  `SELECT COUNT(*) AS presente FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '__drizzle_migrations'`,
] as const;
const CONSULTA_JOURNAL = "SELECT COUNT(*) AS entradas FROM `__drizzle_migrations`";

export type DestinoAuditoria = { host: string; porta: number; banco: string; servidor: string };
export type PedidoAuditoria = {
  autorizacao?: string;
  destino?: DestinoAuditoria;
  esperado?: DestinoAuditoria;
  credencial?: { usuario?: string; senha?: string; papel?: string };
};
export type ConectorAuditoria = (opcoes: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}) => Promise<mysql.Connection>;

export function tabelasDoModelo(): string[] {
  const texto = fs.readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
  return [...texto.matchAll(/mysqlTable\(\s*"([^"]+)"/g)].map(achado => achado[1]);
}

export function origemDeConexaoSegura(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1") return true;
  const partes = ip.split(".").map(numero => Number(numero));
  if (partes.length !== 4 || partes.some(numero => !Number.isInteger(numero) || numero < 0 || numero > 255)) return false;
  if (partes[0] === 10) return true;
  if (partes[0] === 172 && partes[1] >= 16 && partes[1] <= 31) return true;
  return partes[0] === 192 && partes[1] === 168;
}

export function grantsSaoSomenteSelect(linhas: string[]): { ok: boolean; motivo: string; textos: string[] } {
  const textos = linhas.map(linha => linha.replace(/\s+identified\s+by\s+.*/i, "").trim()).filter(Boolean);
  const nucleo = textos.map(linha => linha.replace(/\s+to\s+.*/i, "").trim().toLowerCase());
  const uso = nucleo.filter(linha => linha === "grant usage on *.*");
  const leitura = nucleo.filter(linha => linha === "grant select on `fazenda_digital`.*" || linha === "grant select on fazenda_digital.*");
  if (uso.length !== 1 || leitura.length !== 1 || nucleo.length !== 2) {
    return { ok: false, motivo: "A conta não está limitada a SELECT em fazenda_digital.", textos };
  }
  return { ok: true, motivo: "SELECT somente em fazenda_digital.", textos };
}

export function avaliarAuditoria(pedido: PedidoAuditoria | undefined): { aceito: true } | { aceito: false; motivo: string } {
  if (pedido?.autorizacao !== FRASE_AUDITORIA_OPERACIONAL) return { aceito: false, motivo: "Sem a autorização desta sessão de auditoria." };
  const credencial = pedido.credencial;
  if (!credencial || credencial.papel !== "leitura" || credencial.usuario !== CONTA_AUDITORIA || !credencial.senha) {
    return { aceito: false, motivo: "A auditoria só aceita a conta exclusiva de leitura." };
  }
  const destino = pedido.destino;
  const esperado = pedido.esperado;
  if (!destino || !esperado) return { aceito: false, motivo: "Destino ou confirmação ausente." };
  const igual = destino.host === esperado.host && destino.porta === esperado.porta && destino.banco === esperado.banco && destino.servidor === esperado.servidor;
  if (!igual) return { aceito: false, motivo: "O destino não confirma a conexão esperada." };
  const exato = destino.host === DESTINO.host && destino.porta === DESTINO.porta && destino.banco === DESTINO.banco && destino.servidor === DESTINO.servidor;
  if (!exato) return { aceito: false, motivo: "O destino não é o banco operacional autorizado." };
  return { aceito: true };
}

function semSegredo(mensagem: string, senha: string): string {
  return senha ? mensagem.split(senha).join("***") : mensagem;
}

async function conectarPadrao(opcoes: { host: string; port: number; user: string; password: string; database: string }) {
  return mysql.createConnection({ ...opcoes, connectTimeout: 5000, multipleStatements: false });
}

type Marcador = { consultas: string[]; prazo: number; senha: string };

async function rodar(conn: mysql.Connection, sql: string, marca: Marcador) {
  if (Date.now() > marca.prazo) throw new Error("Prazo da auditoria esgotado.");
  if (marca.consultas.length >= LIMITE_CONSULTAS_AUDITORIA) throw new Error("Limite de consultas atingido.");
  const permitida = sql === CONSULTA_GRANTS || sql === CONSULTA_IDENTIDADE || sql === CONSULTA_ORIGEM
    || (CONSULTAS_ESQUEMA as readonly string[]).includes(sql) || sql === CONSULTA_JOURNAL || consultaEhContagem(sql);
  if (!permitida) throw new Error("Consulta fora da lista da auditoria.");
  marca.consultas.push(sql);
  return conn.query<mysql.RowDataPacket[]>({ sql, timeout: CONSULTA_MS });
}

function montarFoto(tabelas: mysql.RowDataPacket[], colunas: mysql.RowDataPacket[], indices: mysql.RowDataPacket[], chaves: mysql.RowDataPacket[], journalEntradas: number | null): FotoEsquema {
  const porIndice = new Map<string, { tabela: string; nome: string; unico: boolean; colunas: { ordem: number; coluna: string }[] }>();
  for (const linha of indices) {
    const chave = `${linha.tabela}.${linha.indice}`;
    const atual = porIndice.get(chave) ?? { tabela: String(linha.tabela), nome: String(linha.indice), unico: Number(linha.naoUnico) === 0, colunas: [] };
    atual.colunas.push({ ordem: Number(linha.ordem), coluna: String(linha.coluna) });
    porIndice.set(chave, atual);
  }
  return {
    tabelas: tabelas.map(linha => String(linha.tabela)),
    colunas: colunas.map(linha => ({
      tabela: String(linha.tabela), coluna: String(linha.coluna), tipo: String(linha.tipo),
      nulo: String(linha.nulo).toUpperCase() === "YES", extra: String(linha.extra ?? ""),
    })),
    indices: [...porIndice.values()].map(indice => ({
      tabela: indice.tabela, nome: indice.nome, unico: indice.unico,
      colunas: indice.colunas.sort((a, b) => a.ordem - b.ordem).map(coluna => coluna.coluna),
    })),
    chavesEstrangeiras: chaves.map(linha => ({
      tabela: String(linha.tabela), nome: String(linha.chave), coluna: String(linha.coluna), referencia: String(linha.referencia),
    })),
    journalEntradas,
  };
}

async function contar(conn: mysql.Connection, foto: FotoEsquema, ids: readonly { id: string }[], marca: Marcador) {
  const saida = [];
  for (const item of ids) {
    const consulta = consultaDoCatalogo(item.id);
    if (!consulta || !consultaEhContagem(consulta.sql)) {
      saida.push({ id: item.id, executada: false, motivo: "Consulta fora da lista." });
      continue;
    }
    const temTabela = foto.tabelas.includes(consulta.exigeTabela);
    const temColuna = !consulta.exigeColuna || foto.colunas.some(coluna => coluna.tabela === consulta.exigeTabela && coluna.coluna === consulta.exigeColuna);
    if (!temTabela || !temColuna) {
      saida.push({ id: item.id, executada: false, motivo: "Estrutura ausente. A contagem não rodou." });
      continue;
    }
    try {
      const [linhas] = await rodar(conn, consulta.sql, marca);
      saida.push({ id: item.id, executada: true, total: Number(linhas[0]?.total ?? 0) });
    } catch (erro) {
      const mensagem = semSegredo(erro instanceof Error ? erro.message : "falha", marca.senha);
      saida.push({ id: item.id, executada: false, motivo: `NÃO VERIFICADO. ${mensagem}` });
    }
  }
  return saida;
}

export async function executarAuditoriaOperacional(pedido: PedidoAuditoria, conectar?: ConectorAuditoria) {
  const gate = avaliarAuditoria(pedido);
  if (!gate.aceito) return { aceito: false as const, motivo: gate.motivo, consultasExecutadas: [] as string[], situacaoOperacional: SITUACAO_OPERACIONAL };
  const senha = pedido.credencial!.senha!;
  let conn: mysql.Connection;
  try {
    conn = await (conectar ?? conectarPadrao)({
      host: DESTINO.host, port: DESTINO.porta, user: CONTA_AUDITORIA, password: senha, database: DESTINO.banco,
    });
  } catch (erro) {
    return {
      aceito: true as const, situacao: "indisponivel" as const,
      motivo: semSegredo(erro instanceof Error ? erro.message : "falha de conexão", senha),
      consultasExecutadas: [] as string[], situacaoOperacional: SITUACAO_OPERACIONAL,
    };
  }
  const marca: Marcador = { consultas: [], prazo: Date.now() + PRAZO_MS, senha };
  try {
    const [grantsBrutos] = await rodar(conn, CONSULTA_GRANTS, marca);
    const linhas = grantsBrutos.map(linha => String(Object.values(linha)[0] ?? ""));
    const grants = grantsSaoSomenteSelect(linhas);
    if (!grants.ok) {
      return { aceito: true as const, situacao: "privilegio_incompativel" as const, motivo: grants.motivo, grants: grants.textos, consultasExecutadas: marca.consultas, situacaoOperacional: SITUACAO_OPERACIONAL };
    }
    const [identidade] = await rodar(conn, CONSULTA_IDENTIDADE, marca);
    const [origem] = await rodar(conn, CONSULTA_ORIGEM, marca);
    const banco = String(identidade[0]?.banco ?? "");
    const usuario = String(identidade[0]?.usuario ?? "");
    if (banco !== DESTINO.banco || !usuario.startsWith(`${CONTA_AUDITORIA}@`)) {
      return { aceito: true as const, situacao: "destino_incorreto" as const, motivo: "A conexão não confirmou o banco ou a conta esperados.", consultasExecutadas: marca.consultas, situacaoOperacional: SITUACAO_OPERACIONAL };
    }
    const [tabelas] = await rodar(conn, CONSULTAS_ESQUEMA[0], marca);
    const [colunas] = await rodar(conn, CONSULTAS_ESQUEMA[1], marca);
    const [indices] = await rodar(conn, CONSULTAS_ESQUEMA[2], marca);
    const [chaves] = await rodar(conn, CONSULTAS_ESQUEMA[3], marca);
    const [journal] = await rodar(conn, CONSULTAS_ESQUEMA[4], marca);
    let journalEntradas: number | null = null;
    if (Number(journal[0]?.presente ?? 0) === 1) {
      const [entradas] = await rodar(conn, CONSULTA_JOURNAL, marca);
      journalEntradas = Number(entradas[0]?.entradas ?? 0);
    }
    const foto = montarFoto(tabelas, colunas, indices, chaves, journalEntradas);
    const comparado = compararFoto(foto);
    const modelo = tabelasDoModelo();
    const observadas = new Set(foto.tabelas);
    const esperadas = new Set(modelo);
    const duplicidades = await contar(conn, foto, CONSULTAS_DUPLICIDADE, marca);
    const historico = await contar(conn, foto, CONSULTAS_HISTORICO, marca);
    return {
      aceito: true as const,
      situacao: "lida" as const,
      grants: grants.textos,
      identidade: {
        versao: String(identidade[0]?.versao ?? ""),
        banco,
        usuario,
        servidor: String(identidade[0]?.servidor ?? ""),
        porta: Number(identidade[0]?.porta ?? 0),
        origem: String(origem[0]?.origem ?? ""),
      },
      quantidadeTabelas: foto.tabelas.length,
      modelo: {
        quantidade: modelo.length,
        soNoModelo: modelo.filter(tabela => !observadas.has(tabela)).sort(),
        soNoBanco: foto.tabelas.filter(tabela => !esperadas.has(tabela)).sort(),
      },
      chavesEstrangeiras: foto.chavesEstrangeiras,
      ...comparado,
      journal: avaliarJournal(foto.journalEntradas),
      proposta0070: vigiar0070(foto),
      duplicidades,
      historico,
      consultasExecutadas: marca.consultas,
      situacaoOperacional: "OBSERVADO NO OPERACIONAL" as const,
    };
  } finally {
    await conn.end();
  }
}
