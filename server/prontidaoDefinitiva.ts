/**
 * Prontidão do banco definitivo.
 * Confere o modelo e as peças das propostas 0071–0076.
 * Só lê. Não cria coluna, índice nem chave.
 */
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";
import {
  verifyDatabaseSchema,
  type SchemaIssue,
  type SchemaQuery,
} from "./verifyDatabaseSchema";

type Linha = Record<string, unknown>;

type ColunaEsperada = {
  tabela: string;
  coluna: string;
  tipo: "varchar" | "int" | "char";
  tamanho?: number;
  aceitaNulo: boolean;
  gerada?: boolean;
  colacao?: string;
};

type IndiceEsperado = {
  tabela: string;
  nome: string;
  unico: boolean;
  colunas: string[];
};

const COLUNAS: ColunaEsperada[] = [
  { tabela: "animais", coluna: "brinco_ativo_chave", tipo: "varchar", tamanho: 50, aceitaNulo: true, gerada: true, colacao: "utf8mb4_bin" },
  { tabela: "nutricao_fornecimentos", coluna: "chaveOperacao", tipo: "varchar", tamanho: 80, aceitaNulo: true },
  { tabela: "nutricao_fornecimentos", coluna: "conteudoHash", tipo: "varchar", tamanho: 64, aceitaNulo: true },
  { tabela: "nutricao_batidas", coluna: "chaveOperacao", tipo: "varchar", tamanho: 80, aceitaNulo: true },
  { tabela: "nutricao_batidas", coluna: "conteudoHash", tipo: "varchar", tamanho: 64, aceitaNulo: true },
  { tabela: "nutricao_cocho_leituras", coluna: "chaveOperacao", tipo: "varchar", tamanho: 80, aceitaNulo: true },
  { tabela: "nutricao_cocho_leituras", coluna: "conteudoHash", tipo: "varchar", tamanho: 64, aceitaNulo: true },
  { tabela: "manutencoes", coluna: "fazendaId", tipo: "int", aceitaNulo: true },
  { tabela: "abastecimentos", coluna: "chaveOperacao", tipo: "varchar", tamanho: 80, aceitaNulo: true },
  { tabela: "estoque_movimentacao_chaves", coluna: "titular_user_id", tipo: "int", aceitaNulo: false },
  { tabela: "estoque_movimentacao_chaves", coluna: "chave", tipo: "varchar", tamanho: 80, aceitaNulo: false },
  { tabela: "estoque_movimentacao_chaves", coluna: "conteudo_hash", tipo: "char", tamanho: 64, aceitaNulo: false },
];

const INDICES: IndiceEsperado[] = [
  { tabela: "animais", nome: "animais_brinco_ativo_fazenda_uq", unico: true, colunas: ["userId", "fazendaId", "brinco_ativo_chave"] },
  { tabela: "estoque_movimentacao_chaves", nome: "estoque_mov_chave_uq", unico: true, colunas: ["titular_user_id", "chave"] },
  { tabela: "nutricao_fornecimentos", nome: "nutricao_fornecimentos_user_chave_uq", unico: true, colunas: ["userId", "chaveOperacao"] },
  { tabela: "nutricao_batidas", nome: "nutricao_batidas_user_chave_uq", unico: true, colunas: ["userId", "chaveOperacao"] },
  { tabela: "nutricao_cocho_leituras", nome: "nutricao_cocho_leituras_user_chave_uq", unico: true, colunas: ["userId", "chaveOperacao"] },
  { tabela: "manutencoes", nome: "manutencoes_user_fazenda_idx", unico: false, colunas: ["userId", "fazendaId"] },
  { tabela: "abastecimentos", nome: "abastecimentos_chave_operacao_uq", unico: true, colunas: ["userId", "chaveOperacao"] },
];

const TABELAS = ["estoque_movimentacao_chaves"];

export type PecasProposta = { ok: boolean; faltas: string[] };

function linhas(result: unknown): Linha[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Linha[];
  if (Array.isArray(result)) return result as Linha[];
  return [];
}

function texto(valor: unknown): string {
  return String(valor ?? "");
}

export async function verificarPecasProposta(query: SchemaQuery): Promise<PecasProposta> {
  const faltas: string[] = [];
  const colunas = linhas(await query(`SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna,
      DATA_TYPE AS tipo, COLUMN_TYPE AS tipo_coluna, IS_NULLABLE AS nulo,
      CHARACTER_MAXIMUM_LENGTH AS tamanho, EXTRA AS extra, COLLATION_NAME AS colacao
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()`));
  const indices = linhas(await query(`SELECT TABLE_NAME AS tabela, INDEX_NAME AS nome,
      SEQ_IN_INDEX AS ordem, COLUMN_NAME AS coluna, NON_UNIQUE AS nao_unico
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`));
  const tabelas = new Set(linhas(await query(`SELECT TABLE_NAME AS tabela
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()`)).map((linha) => texto(linha.tabela)));

  for (const nome of TABELAS) {
    if (!tabelas.has(nome)) faltas.push(`Falta a tabela ${nome}.`);
  }

  for (const esperada of COLUNAS) {
    if (!tabelas.has(esperada.tabela)) {
      faltas.push(`Falta a coluna ${esperada.tabela}.${esperada.coluna}.`);
      continue;
    }
    const achada = colunas.find((linha) => texto(linha.tabela) === esperada.tabela && texto(linha.coluna) === esperada.coluna);
    if (!achada) {
      faltas.push(`Falta a coluna ${esperada.tabela}.${esperada.coluna}.`);
      continue;
    }
    const nulo = texto(achada.nulo).toUpperCase() === "YES";
    const tipo = texto(achada.tipo).toLowerCase();
    const tamanho = achada.tamanho == null ? null : Number(achada.tamanho);
    const gerada = /generated/i.test(texto(achada.extra));
    const colacao = texto(achada.colacao).toLowerCase();
    const tipoOk = tipo === esperada.tipo && (esperada.tamanho == null || tamanho === esperada.tamanho);
    const nuloOk = nulo === esperada.aceitaNulo;
    const geradaOk = !esperada.gerada || gerada;
    const colacaoOk = !esperada.colacao || colacao === esperada.colacao;
    if (!tipoOk || !nuloOk || !geradaOk || !colacaoOk) {
      faltas.push(
        `Coluna incompatível ${esperada.tabela}.${esperada.coluna}: esperado ${esperada.tipo}${esperada.tamanho ? `(${esperada.tamanho})` : ""} ${esperada.aceitaNulo ? "NULL" : "NOT NULL"}${esperada.gerada ? " gerada" : ""}${esperada.colacao ? ` ${esperada.colacao}` : ""}.`,
      );
    }
  }

  for (const esperado of INDICES) {
    const partes = indices
      .filter((linha) => texto(linha.tabela) === esperado.tabela && texto(linha.nome) === esperado.nome)
      .sort((a, b) => Number(a.ordem) - Number(b.ordem));
    if (partes.length === 0) {
      faltas.push(`Falta o índice ${esperado.tabela}.${esperado.nome} (${esperado.unico ? "único" : "não único"}: ${esperado.colunas.join(", ")}).`);
      continue;
    }
    const colunasDoIndice = partes.map((parte) => texto(parte.coluna));
    const unico = partes.every((parte) => Number(parte.nao_unico) === 0);
    if (unico !== esperado.unico || colunasDoIndice.join("\0") !== esperado.colunas.join("\0")) {
      faltas.push(
        `Índice incompatível ${esperado.tabela}.${esperado.nome}: esperado ${esperado.unico ? "único" : "não único"} (${esperado.colunas.join(", ")}), encontrado ${unico ? "único" : "não único"} (${colunasDoIndice.join(", ")}).`,
      );
    }
  }

  return { ok: faltas.length === 0, faltas };
}

export function questoesDasPecas(faltas: string[]): SchemaIssue[] {
  return faltas.map((message) => ({ kind: "index" as const, message }));
}

export async function verificarProntidaoDefinitiva(alvo: AlvoMysql & { user: string; password: string }) {
  afirmarBancoDescartavel(alvo);
  let conexao: mysql.Connection | null = null;
  try {
    conexao = await mysql.createConnection({
      host: alvo.host,
      port: alvo.port,
      user: alvo.user,
      password: alvo.password,
      database: alvo.database,
      connectTimeout: 5000,
    });
    const query: SchemaQuery = async (sql) => conexao!.query(sql);
    const modelo = await verifyDatabaseSchema(query);
    const pecas = await verificarPecasProposta(query);
    const faltas = [
      ...modelo.issues.map((issue) => issue.message),
      ...pecas.faltas,
    ];
    return {
      ok: modelo.ok && pecas.ok,
      modeloOk: modelo.ok,
      pecasOk: pecas.ok,
      schemaName: modelo.schemaName,
      faltas,
    };
  } catch {
    return {
      ok: false,
      modeloOk: false,
      pecasOk: false,
      schemaName: null,
      faltas: ["Banco inacessível."],
    };
  } finally {
    await conexao?.end().catch(() => undefined);
  }
}
