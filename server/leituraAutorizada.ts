/**
 * Leitura futura do esquema. Nesta fase a porta da fazenda continua fechada.
 * A credencial chega no pedido. Este arquivo não lê variável de ambiente.
 */
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, BANCO_OPERACIONAL, CONTAINER_OPERACIONAL, PORTA_OPERACIONAL } from "./isolamentoMysql";
import {
  SITUACAO_OPERACIONAL,
  avaliarJournal,
  compararFoto,
  consultaDoCatalogo,
  consultaEhContagem,
  vigiar0070,
  type FotoEsquema,
} from "./conferenciaEstrutural";

export const FRASE_AUTORIZACAO = "AUTORIZO_LEITURA_ESTRUTURAL_DA_FAZENDA";
export const LEITURA_OPERACIONAL_HABILITADA = false;

const USUARIOS_RECUSADOS = new Set(["root", "admin", "mysql.sys", "mysql.infoschema"]);

export type DestinoLeitura = {
  host: string;
  porta: number;
  banco: string;
  servidor: string;
};

export type PedidoLeitura = {
  autorizacao?: string;
  destino?: DestinoLeitura;
  esperado?: DestinoLeitura;
  credencial?: { usuario?: string; senha?: string; papel?: string };
  limiteConsultas?: number;
};

export type ConectorLeitura = (opcoes: {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}) => Promise<mysql.Connection>;

type Recusa = { aceito: false; motivo: string; consultasExecutadas: string[]; situacaoOperacional: typeof SITUACAO_OPERACIONAL };

const CONSULTAS_FIXAS = [
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

export function avaliarPedido(pedido: PedidoLeitura | undefined): { aceito: true } | { aceito: false; motivo: string } {
  if (!pedido?.autorizacao) return { aceito: false, motivo: "Sem autorização explícita." };
  if (pedido.autorizacao !== FRASE_AUTORIZACAO) return { aceito: false, motivo: "Autorização não reconhecida." };
  const credencial = pedido.credencial;
  if (!credencial || credencial.papel !== "leitura" || !credencial.usuario || !credencial.senha) {
    return { aceito: false, motivo: "Falta credencial exclusiva de leitura." };
  }
  if (USUARIOS_RECUSADOS.has(credencial.usuario.toLowerCase())) {
    return { aceito: false, motivo: "A credencial administrativa não serve para esta leitura." };
  }
  const destino = pedido.destino;
  const esperado = pedido.esperado;
  if (!destino || !esperado) return { aceito: false, motivo: "Destino ou confirmação ausente." };
  if (destino.host !== esperado.host || destino.porta !== esperado.porta || destino.banco !== esperado.banco || destino.servidor !== esperado.servidor) {
    return { aceito: false, motivo: "O destino não confirma a conexão esperada." };
  }
  const operacional = destino.porta === PORTA_OPERACIONAL
    || destino.banco.trim().toLowerCase() === BANCO_OPERACIONAL
    || destino.servidor === CONTAINER_OPERACIONAL
    || destino.host !== "127.0.0.1";
  if (operacional || LEITURA_OPERACIONAL_HABILITADA) {
    return { aceito: false, motivo: "Leitura operacional não está habilitada." };
  }
  if (!pedido.limiteConsultas || pedido.limiteConsultas < CONSULTAS_FIXAS.length + 1 || pedido.limiteConsultas > 40) {
    return { aceito: false, motivo: "O limite de consultas não cobre a leitura." };
  }
  return { aceito: true };
}

function semSegredo(mensagem: string, senha: string): string {
  return senha ? mensagem.split(senha).join("***") : mensagem;
}

function recusa(motivo: string): Recusa {
  return { aceito: false, motivo, consultasExecutadas: [], situacaoOperacional: SITUACAO_OPERACIONAL };
}

async function conectarPadrao(opcoes: { host: string; port: number; user: string; password: string; database: string }) {
  return mysql.createConnection({ ...opcoes, connectTimeout: 2000, multipleStatements: false });
}

async function abrir(pedido: PedidoLeitura, conectar?: ConectorLeitura) {
  const gate = avaliarPedido(pedido);
  if (!gate.aceito) return { recusa: recusa(gate.motivo) };
  const destino = pedido.destino!;
  afirmarBancoDescartavel({
    host: destino.host,
    port: destino.porta,
    database: destino.banco,
    container: destino.servidor,
  });
  try {
    const conn = await (conectar ?? conectarPadrao)({
      host: destino.host,
      port: destino.porta,
      user: pedido.credencial!.usuario!,
      password: pedido.credencial!.senha!,
      database: destino.banco,
    });
    return { conn };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "falha de conexão";
    return {
      indisponivel: {
        aceito: true as const,
        situacao: "indisponivel" as const,
        motivo: semSegredo(mensagem, pedido.credencial!.senha ?? ""),
        consultasExecutadas: [] as string[],
        situacaoOperacional: SITUACAO_OPERACIONAL,
      },
    };
  }
}

async function lerFoto(conn: mysql.Connection, limite: number, consultas: string[]): Promise<FotoEsquema> {
  const rodar = async (sql: string) => {
    if (consultas.length >= limite) throw new Error("Limite de consultas atingido.");
    if (!/^\s*select\b/i.test(sql) || /\b(insert|update|delete|alter|drop|create|truncate|for update|lock)\b/i.test(sql)) {
      throw new Error("Consulta fora da leitura.");
    }
    consultas.push(sql);
    return conn.query<mysql.RowDataPacket[]>(sql);
  };
  const [tabelas] = await rodar(CONSULTAS_FIXAS[0]);
  const [colunas] = await rodar(CONSULTAS_FIXAS[1]);
  const [indices] = await rodar(CONSULTAS_FIXAS[2]);
  const [chaves] = await rodar(CONSULTAS_FIXAS[3]);
  const [journal] = await rodar(CONSULTAS_FIXAS[4]);
  let journalEntradas: number | null = null;
  if (Number(journal[0]?.presente ?? 0) === 1) {
    const [entradas] = await rodar("SELECT COUNT(*) AS entradas FROM `__drizzle_migrations`");
    journalEntradas = Number(entradas[0]?.entradas ?? 0);
  }
  const porIndice = new Map<string, { tabela: string; nome: string; unico: boolean; colunas: { ordem: number; coluna: string }[] }>();
  for (const linha of indices) {
    const chave = `${linha.tabela}.${linha.indice}`;
    const atual = porIndice.get(chave) ?? {
      tabela: String(linha.tabela),
      nome: String(linha.indice),
      unico: Number(linha.naoUnico) === 0,
      colunas: [],
    };
    atual.colunas.push({ ordem: Number(linha.ordem), coluna: String(linha.coluna) });
    porIndice.set(chave, atual);
  }
  return {
    tabelas: tabelas.map(linha => String(linha.tabela)),
    colunas: colunas.map(linha => ({
      tabela: String(linha.tabela),
      coluna: String(linha.coluna),
      tipo: String(linha.tipo),
      nulo: String(linha.nulo).toUpperCase() === "YES",
      extra: String(linha.extra ?? ""),
    })),
    indices: [...porIndice.values()].map(indice => ({
      tabela: indice.tabela,
      nome: indice.nome,
      unico: indice.unico,
      colunas: indice.colunas.sort((a, b) => a.ordem - b.ordem).map(coluna => coluna.coluna),
    })),
    chavesEstrangeiras: chaves.map(linha => ({
      tabela: String(linha.tabela),
      nome: String(linha.chave),
      coluna: String(linha.coluna),
      referencia: String(linha.referencia),
    })),
    journalEntradas,
  };
}

export async function executarLeitura(pedido: PedidoLeitura, conectar?: ConectorLeitura) {
  const aberto = await abrir(pedido, conectar);
  if (aberto.recusa) return aberto.recusa;
  if (aberto.indisponivel) return aberto.indisponivel;
  const consultasExecutadas: string[] = [];
  try {
    const foto = await lerFoto(aberto.conn, pedido.limiteConsultas!, consultasExecutadas);
    const comparado = compararFoto(foto);
    return {
      aceito: true as const,
      situacao: "lida" as const,
      foto,
      ...comparado,
      journal: avaliarJournal(foto.journalEntradas),
      proposta0070: vigiar0070(foto),
      consultasExecutadas,
      situacaoOperacional: SITUACAO_OPERACIONAL,
    };
  } finally {
    await aberto.conn.end();
  }
}

export async function medirContagens(pedido: PedidoLeitura, ids: string[], conectar?: ConectorLeitura) {
  const aberto = await abrir(pedido, conectar);
  if (aberto.recusa) return aberto.recusa;
  if (aberto.indisponivel) return aberto.indisponivel;
  const consultasExecutadas: string[] = [];
  try {
    if (ids.some(id => !consultaDoCatalogo(id))) {
      return recusa("Consulta fora da lista autorizada.");
    }
    const foto = await lerFoto(aberto.conn, pedido.limiteConsultas!, consultasExecutadas);
    const resultados = [];
    for (const id of ids) {
      const consulta = consultaDoCatalogo(id)!;
      if (!consultaEhContagem(consulta.sql)) return recusa("A consulta deixou de ser contagem.");
      const temTabela = foto.tabelas.includes(consulta.exigeTabela);
      const temColuna = !consulta.exigeColuna || foto.colunas.some(coluna => coluna.tabela === consulta.exigeTabela && coluna.coluna === consulta.exigeColuna);
      if (!temTabela || !temColuna) {
        resultados.push({ id, executada: false, motivo: "Estrutura ausente. A contagem não rodou." });
        continue;
      }
      if (consultasExecutadas.length >= (pedido.limiteConsultas ?? 0)) {
        resultados.push({ id, executada: false, motivo: "Limite de consultas atingido." });
        continue;
      }
      consultasExecutadas.push(consulta.sql);
      const [linhas] = await aberto.conn.query<mysql.RowDataPacket[]>(consulta.sql);
      resultados.push({ id, executada: true, total: Number(linhas[0]?.total ?? 0) });
    }
    return { aceito: true as const, situacao: "lida" as const, resultados, consultasExecutadas, situacaoOperacional: SITUACAO_OPERACIONAL };
  } finally {
    await aberto.conn.end();
  }
}
