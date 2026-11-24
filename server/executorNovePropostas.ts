/**
 * Executor das nove alterações, só no MySQL descartável.
 * Não há caminho de escrita no banco da fazenda.
 * A 0060 fica dispensada, a 0070 rejeitada e a 0077 fora do mínimo.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, CONTAINER_OPERACIONAL, type AlvoMysql } from "./isolamentoMysql";
import { comandosEstruturais, diagnosticar0073, garantirLivro } from "./propostaNutricao0073";

export type AlvoEnsaio = AlvoMysql & { user: string; password: string };

export type Decisao = "aplicar" | "ja_completa" | "interromper";

export type DiagnosticoProposta = {
  codigo: string;
  decisao: Decisao;
  motivo: string;
  duplicidades: number;
};

type Peca = { nome: string; compativel: boolean; ausente: boolean };

const FORA = {
  "0060": "A 0060 já está compatível na leitura da fazenda. Não reaplicar.",
  "0070": "A 0070 permanece rejeitada.",
  "0077": "A 0077 é opcional e fica fora do conjunto mínimo.",
} as const;

export const CONJUNTO_MINIMO = [
  { codigo: "0067", arquivo: "drizzle/migrations/0067_reproducao_operacoes.sql", depende: "Nenhuma tabela anterior. Não altera reprodução antiga.", modo: "sentencas" as const },
  { codigo: "0068", arquivo: "drizzle/migrations/0068_semen_entrada_operacoes.sql", depende: "Não depende da 0067 nem do índice da partida.", modo: "sentencas" as const },
  { codigo: "0069", arquivo: "drizzle/migrations/0069_semen_partidas_indice_unico.sql", depende: "Tabela semen_partidas e identidade sem nulo. Não depende da 0068.", modo: "arquivo" as const },
  { codigo: "0072", arquivo: "drizzle/propostas/0072_estoque_movimentacao_chaves.sql", depende: "Nenhuma tabela anterior.", modo: "arquivo" as const },
  { codigo: "0071", arquivo: "drizzle/propostas/0071_animais_brinco_ativo_fazenda_uq.sql", depende: "Animais com userId, fazendaId, brinco e status. Recusa a 0070.", modo: "arquivo" as const },
  { codigo: "0073", arquivo: "drizzle/propostas/0073_nutricao_idempotencia.sql", depende: "Tabelas de fornecimento e batida. Não altera leitura de cocho.", modo: "sentencas" as const },
  { codigo: "0074", arquivo: "drizzle/propostas/0074_nutricao_leitura_idempotencia.sql", depende: "Tabela de leitura de cocho. Não depende da 0073.", modo: "sentencas" as const },
  { codigo: "0075", arquivo: "drizzle/propostas/0075_manutencao_fazenda.sql", depende: "Tabela manutencoes. Não copia a fazenda da máquina.", modo: "sentencas" as const },
  { codigo: "0076", arquivo: "drizzle/propostas/0076_abastecimento_chave_operacao.sql", depende: "Tabela abastecimentos. Não preenche fazenda nem chave antiga.", modo: "sentencas" as const },
];

function conferir(alvo: AlvoEnsaio): void {
  afirmarBancoDescartavel(alvo);
  if (alvo.user.toLowerCase() === "fd_auditoria_ro") {
    throw new Error("A conta de auditoria não escreve.");
  }
  if (!alvo.container || alvo.container === CONTAINER_OPERACIONAL) {
    throw new Error("O executor só aceita o container descartável.");
  }
}

async function abrir(alvo: AlvoEnsaio) {
  conferir(alvo);
  return mysql.createConnection({
    host: alvo.host, port: alvo.port, user: alvo.user, password: alvo.password, database: alvo.database, multipleStatements: false,
  });
}

function tipoConfere(observado: string, esperado: string): boolean {
  const atual = observado.toLowerCase().replace(/\s+/g, "");
  if (esperado === "int") return /^int(\(|$)/.test(atual);
  if (esperado.startsWith("varchar(")) return atual.startsWith(esperado) && !/^\d/.test(atual.slice(esperado.length));
  return atual === esperado;
}

function decidir(pecas: Peca[], duplicidades: number, extra = ""): Pick<DiagnosticoProposta, "decisao" | "motivo"> {
  if (duplicidades > 0 || pecas.some(peca => !peca.ausente && !peca.compativel)) {
    return { decisao: "interromper", motivo: `${extra}Há duplicidade ou definição diferente. Nenhum comando estrutural rodou.`.trim() };
  }
  if (pecas.every(peca => peca.ausente)) return { decisao: "aplicar", motivo: "As peças novas estão ausentes. A base exigida foi encontrada." };
  if (pecas.every(peca => peca.compativel)) return { decisao: "ja_completa", motivo: "A estrutura já confere. O arquivo não será reaplicado." };
  return { decisao: "interromper", motivo: "Aplicação parcial. Não continuar do meio. Restaurar a cópia conferida." };
}

async function colunas(conn: mysql.Connection, banco: string, tabela: string, nomes: string[]) {
  const [linhas] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS nome, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, IFNULL(EXTRA, '') AS extra
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN (${nomes.map(() => "?").join(",")})`,
    [banco, tabela, ...nomes],
  );
  return new Map(linhas.map(linha => [String(linha.nome), linha]));
}

async function indice(conn: mysql.Connection, banco: string, tabela: string, nome: string) {
  const [linhas] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [banco, tabela, nome],
  );
  const ordenadas = [...linhas].sort((a, b) => Number(a.ordem) - Number(b.ordem)).map(linha => String(linha.coluna));
  return { existe: linhas.length > 0, unico: linhas.length > 0 && Number(linhas[0].naoUnico) === 0, colunas: ordenadas };
}

async function grupos(conn: mysql.Connection, sql: string) {
  const [linhas] = await conn.query<mysql.RowDataPacket[]>(sql);
  return Number(linhas[0]?.total ?? 0);
}

export async function diagnosticarProposta(alvo: AlvoEnsaio, codigo: string): Promise<DiagnosticoProposta> {
  if (codigo in FORA) {
    return { codigo, decisao: "interromper", motivo: FORA[codigo as keyof typeof FORA], duplicidades: 0 };
  }
  const conn = await abrir(alvo);
  try {
    if (codigo === "0067" || codigo === "0068") {
      const tabela = codigo === "0067" ? "reproducao_operacoes" : "semen_entrada_operacoes";
      const nome = `${tabela}_titular_chave_uq`;
      const [existe] = await conn.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
        [alvo.database, tabela],
      );
      if (Number(existe[0]?.total ?? 0) === 0) return { codigo, decisao: "aplicar", motivo: "Tabela ausente.", duplicidades: 0 };
      const idx = await indice(conn, alvo.database, tabela, nome);
      if (idx.existe && idx.unico && idx.colunas.join(",") === "userId,chave") {
        return { codigo, decisao: "ja_completa", motivo: "A tabela e o índice único já conferem.", duplicidades: 0 };
      }
      return { codigo, decisao: "interromper", motivo: "A tabela existe sem o índice esperado. O arquivo não foi reaplicado.", duplicidades: 0 };
    }
    if (codigo === "0069") {
      const cols = await colunas(conn, alvo.database, "semen_partidas", ["user_id", "fazenda_id", "reprodutor_key", "partida"]);
      if (cols.size !== 4) return { codigo, decisao: "interromper", motivo: "A tabela ou a identidade da partida não está como a leitura mostrou.", duplicidades: 0 };
      if ([...cols.values()].some(coluna => String(coluna.nulo) === "YES")) {
        return { codigo, decisao: "interromper", motivo: "A identidade da partida admite nulo.", duplicidades: 0 };
      }
      const duplicidades = await grupos(conn, `SELECT COUNT(*) AS total FROM (
        SELECT 1 FROM semen_partidas GROUP BY user_id, fazenda_id, reprodutor_key, partida HAVING COUNT(*) > 1) grupos`);
      const idx = await indice(conn, alvo.database, "semen_partidas", "semen_partidas_uq");
      const peca = { nome: "semen_partidas_uq", ausente: !idx.existe, compativel: idx.unico && idx.colunas.join(",") === "user_id,fazenda_id,reprodutor_key,partida" };
      return { codigo, duplicidades, ...decidir([peca], duplicidades) };
    }
    if (codigo === "0072") {
      const idx = await indice(conn, alvo.database, "estoque_movimentacao_chaves", "estoque_mov_chave_uq");
      const [existe] = await conn.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'estoque_movimentacao_chaves'",
        [alvo.database],
      );
      if (Number(existe[0]?.total ?? 0) === 0) return { codigo, decisao: "aplicar", motivo: "Tabela ausente.", duplicidades: 0 };
      if (idx.unico && idx.colunas.join(",") === "titular_user_id,chave") {
        return { codigo, decisao: "ja_completa", motivo: "A tabela de chave do estoque já confere.", duplicidades: 0 };
      }
      return { codigo, decisao: "interromper", motivo: "A tabela de estoque existe com índice diferente. Nenhum comando rodou.", duplicidades: 0 };
    }
    if (codigo === "0071") {
      const cols = await colunas(conn, alvo.database, "animais", ["userId", "fazendaId", "brinco", "status", "brinco_ativo_chave"]);
      if (!["userId", "fazendaId", "brinco", "status"].every(nome => cols.has(nome))) {
        return { codigo, decisao: "interromper", motivo: "Falta coluna da identidade do animal.", duplicidades: 0 };
      }
      const antiga = await indice(conn, alvo.database, "animais", "animais_user_brinco_ativo_uq");
      if (antiga.existe) return { codigo, decisao: "interromper", motivo: "O índice da 0070 está presente.", duplicidades: 0 };
      const duplicidades = await grupos(conn, `SELECT COUNT(*) AS total FROM (
        SELECT 1 FROM animais WHERE status = 'ativo' AND fazendaId IS NOT NULL AND brinco IS NOT NULL AND CHAR_LENGTH(TRIM(brinco)) > 0
        GROUP BY userId, fazendaId, LOWER(TRIM(brinco)) HAVING COUNT(*) > 1) grupos`);
      const chave = cols.get("brinco_ativo_chave");
      const idx = await indice(conn, alvo.database, "animais", "animais_brinco_ativo_fazenda_uq");
      const colunaPeca = chave
        ? { nome: "brinco_ativo_chave", ausente: false, compativel: tipoConfere(String(chave.tipo), "varchar(50)") && String(chave.extra).toLowerCase().includes("generated") }
        : { nome: "brinco_ativo_chave", ausente: true, compativel: false };
      const indicePeca = { nome: "animais_brinco_ativo_fazenda_uq", ausente: !idx.existe, compativel: idx.unico && idx.colunas.join(",") === "userId,fazendaId,brinco_ativo_chave" };
      return { codigo, duplicidades, ...decidir([colunaPeca, indicePeca], duplicidades) };
    }
    if (codigo === "0073") {
      const diag = await diagnosticar0073(alvo);
      return { codigo, decisao: diag.decisao, motivo: diag.motivo, duplicidades: diag.duplicidades };
    }
    if (codigo === "0074" || codigo === "0076" || codigo === "0075") {
      return await diagnosticarSimples(conn, alvo.database, codigo);
    }
    return { codigo, decisao: "interromper", motivo: "Arquivo fora do conjunto mínimo.", duplicidades: 0 };
  } finally {
    await conn.end();
  }
}

async function diagnosticarSimples(conn: mysql.Connection, banco: string, codigo: string): Promise<DiagnosticoProposta> {
  if (codigo === "0074") {
    const tabela = "nutricao_cocho_leituras";
    const cols = await colunas(conn, banco, tabela, ["chaveOperacao", "conteudoHash"]);
    const idx = await indice(conn, banco, tabela, "nutricao_cocho_leituras_user_chave_uq");
    const pecas = ["chaveOperacao", "conteudoHash"].map(nome => {
      const linha = cols.get(nome);
      const tipo = nome === "chaveOperacao" ? "varchar(80)" : "varchar(64)";
      return linha
        ? { nome, ausente: false, compativel: tipoConfere(String(linha.tipo), tipo) && String(linha.nulo) === "YES" }
        : { nome, ausente: true, compativel: false };
    });
    pecas.push({ nome: "indice", ausente: !idx.existe, compativel: idx.unico && idx.colunas.join(",") === "userId,chaveOperacao" });
    return { codigo, duplicidades: 0, ...decidir(pecas) };
  }
  if (codigo === "0075") {
    const cols = await colunas(conn, banco, "manutencoes", ["fazendaId"]);
    const linha = cols.get("fazendaId");
    const idx = await indice(conn, banco, "manutencoes", "manutencoes_user_fazenda_idx");
    const pecas = [
      linha ? { nome: "fazendaId", ausente: false, compativel: tipoConfere(String(linha.tipo), "int") && String(linha.nulo) === "YES" } : { nome: "fazendaId", ausente: true, compativel: false },
      { nome: "indice", ausente: !idx.existe, compativel: !idx.unico && idx.colunas.join(",") === "userId,fazendaId" },
    ];
    return { codigo, duplicidades: 0, ...decidir(pecas) };
  }
  const cols = await colunas(conn, banco, "abastecimentos", ["chaveOperacao"]);
  const linha = cols.get("chaveOperacao");
  const idx = await indice(conn, banco, "abastecimentos", "abastecimentos_chave_operacao_uq");
  const pecas = [
    linha ? { nome: "chaveOperacao", ausente: false, compativel: tipoConfere(String(linha.tipo), "varchar(80)") && String(linha.nulo) === "YES" } : { nome: "chaveOperacao", ausente: true, compativel: false },
    { nome: "indice", ausente: !idx.existe, compativel: idx.unico && idx.colunas.join(",") === "userId,chaveOperacao" },
  ];
  return { codigo: "0076", duplicidades: 0, ...decidir(pecas) };
}

function hashDo(caminho: string) {
  return createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

function semSenha(mensagem: string, senha: string) {
  return senha ? mensagem.split(senha).join("***") : mensagem;
}

export async function aplicarProposta(alvo: AlvoEnsaio, codigo: string, caminho: string) {
  conferir(alvo);
  if (codigo in FORA) return { codigo, situacao: "recusada" as const, motivo: FORA[codigo as keyof typeof FORA], hash: "" };
  const item = CONJUNTO_MINIMO.find(atual => atual.codigo === codigo);
  if (!item || !caminho.endsWith(item.arquivo)) {
    throw new Error("Este executor só aplica o conjunto mínimo no descartável.");
  }
  const hash = hashDo(caminho);
  await garantirLivro(alvo);
  const diag = await diagnosticarProposta(alvo, codigo);
  const conn = await abrir(alvo);
  try {
    const [anteriores] = await conn.query<mysql.RowDataPacket[]>(
      "SELECT id FROM fd_livro_propostas WHERE arquivo = ? AND hash_conteudo = ? AND estado = 'concluida' LIMIT 1",
      [item.arquivo, hash],
    );
    if (anteriores.length > 0) {
      return { codigo, situacao: "repetida" as const, motivo: "O livro já registra este arquivo como concluído. O SQL não rodou de novo.", hash };
    }
    if (diag.decisao === "ja_completa") {
      await conn.query(
        `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, concluido_em, estado_posterior)
         VALUES (?, ?, ?, 'concluida', ?, CURRENT_TIMESTAMP, ?)`,
        [item.arquivo, hash, item.depende, diag.motivo, diag.motivo],
      );
      return { codigo, situacao: "concluida" as const, motivo: diag.motivo, hash };
    }
    if (diag.decisao !== "aplicar") {
      await conn.query(
        `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, erro, iniciado_em)
         VALUES (?, ?, ?, 'interrompida', ?, ?, CURRENT_TIMESTAMP)`,
        [item.arquivo, hash, item.depende, diag.motivo, diag.motivo],
      );
      return { codigo, situacao: "interrompida" as const, motivo: diag.motivo, hash };
    }
    const [livro] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, iniciado_em)
       VALUES (?, ?, ?, 'em_andamento', ?, CURRENT_TIMESTAMP)`,
      [item.arquivo, hash, item.depende, diag.motivo],
    );
    try {
      if (item.modo === "arquivo") {
        const script = fs.readFileSync(caminho, "utf8").replace(/\r\n/g, "\n");
        execFileSync("docker", ["exec", "-i", "-e", `MYSQL_PWD=${alvo.password}`, alvo.container!, "mysql", "--user=root", "--default-character-set=utf8mb4", `--database=${alvo.database}`], {
          input: script,
        });
        await conn.query("UPDATE fd_livro_propostas SET ultimo_comando = ? WHERE id = ?", ["arquivo conferido pelo cliente mysql", livro.insertId]);
      } else {
        const comandos = comandosEstruturais(fs.readFileSync(caminho, "utf8"));
        for (const comando of comandos) {
          await conn.query(comando);
          await conn.query("UPDATE fd_livro_propostas SET ultimo_comando = ? WHERE id = ?", [comando.slice(0, 120), livro.insertId]);
        }
      }
    } catch (erro) {
      const mensagem = semSenha(erro instanceof Error ? erro.message : "falha", alvo.password);
      await conn.query("UPDATE fd_livro_propostas SET estado = 'interrompida', erro = ? WHERE id = ?", [mensagem, livro.insertId]);
      return { codigo, situacao: "interrompida" as const, motivo: mensagem, hash };
    }
    const depois = await diagnosticarProposta(alvo, codigo);
    if (depois.decisao !== "ja_completa") {
      await conn.query("UPDATE fd_livro_propostas SET estado = 'interrompida', erro = ? WHERE id = ?", [depois.motivo, livro.insertId]);
      return { codigo, situacao: "interrompida" as const, motivo: depois.motivo, hash };
    }
    await conn.query(
      "UPDATE fd_livro_propostas SET estado = 'concluida', concluido_em = CURRENT_TIMESTAMP, estado_posterior = ? WHERE id = ?",
      [depois.motivo, livro.insertId],
    );
    return { codigo, situacao: "concluida" as const, motivo: depois.motivo, hash };
  } finally {
    await conn.end();
  }
}

export async function aplicarConjuntoMinimo(alvo: AlvoEnsaio, raiz = ".") {
  const resultados = [];
  for (const item of CONJUNTO_MINIMO) {
    const resultado = await aplicarProposta(alvo, item.codigo, `${raiz}/${item.arquivo}`);
    resultados.push(resultado);
    if (resultado.situacao !== "concluida" && resultado.situacao !== "repetida") break;
  }
  return resultados;
}
