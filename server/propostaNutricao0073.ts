import { createHash } from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import { afirmarBancoDescartavel, type AlvoMysql } from "./isolamentoMysql";

export type Peca0073 = {
  tabela: "nutricao_fornecimentos" | "nutricao_batidas";
  peca: "chaveOperacao" | "conteudoHash" | "indice";
  situacao: "ausente" | "compativel" | "incompativel";
  detalhe: string;
};

export type Diagnostico0073 = {
  pecas: Peca0073[];
  duplicidades: number;
  decisao: "aplicar" | "ja_completa" | "interromper";
  motivo: string;
};

type Alvo = AlvoMysql & { user: string; password: string };

const TABELAS = ["nutricao_fornecimentos", "nutricao_batidas"] as const;

export function comandosEstruturais(sql: string): string[] {
  return sql
    .split(";")
    .map(parte => parte
      .split("\n")
      .filter(linha => !linha.trim().startsWith("--"))
      .join("\n")
      .trim())
    .filter(Boolean);
}

export function hashArquivo(caminho: string): string {
  return createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

function conferirAlvo(alvo: Alvo): void {
  afirmarBancoDescartavel(alvo);
}

async function conectar(alvo: Alvo) {
  conferirAlvo(alvo);
  return mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    database: alvo.database,
    multipleStatements: false,
  });
}

export async function diagnosticar0073(alvo: Alvo): Promise<Diagnostico0073> {
  const conn = await conectar(alvo);
  try {
    const pecas: Peca0073[] = [];
    let duplicidades = 0;
    for (const tabela of TABELAS) {
      const [colunas] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME AS nome, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN ('chaveOperacao', 'conteudoHash')`,
        [alvo.database, tabela],
      );
      const porNome = new Map(colunas.map(linha => [String(linha.nome), linha]));
      for (const nome of ["chaveOperacao", "conteudoHash"] as const) {
        const esperado = nome === "chaveOperacao" ? "varchar(80)" : "varchar(64)";
        const linha = porNome.get(nome);
        if (!linha) {
          pecas.push({ tabela, peca: nome, situacao: "ausente", detalhe: "coluna ausente" });
          continue;
        }
        const compativel = String(linha.tipo) === esperado && String(linha.nulo) === "YES";
        pecas.push({
          tabela,
          peca: nome,
          situacao: compativel ? "compativel" : "incompativel",
          detalhe: `${linha.tipo} nulo=${linha.nulo}`,
        });
      }
      const [indice] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT COLUMN_NAME AS coluna, NON_UNIQUE AS naoUnico, SEQ_IN_INDEX AS ordem
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?
         ORDER BY SEQ_IN_INDEX`,
        [alvo.database, tabela, `${tabela}_user_chave_uq`],
      );
      if (indice.length === 0) {
        pecas.push({ tabela, peca: "indice", situacao: "ausente", detalhe: "índice ausente" });
      } else {
        const colunasIndice = indice.map(linha => String(linha.coluna)).join(",");
        const unico = indice.every(linha => Number(linha.naoUnico) === 0);
        const compativel = unico && colunasIndice === "userId,chaveOperacao";
        pecas.push({
          tabela,
          peca: "indice",
          situacao: compativel ? "compativel" : "incompativel",
          detalhe: colunasIndice,
        });
      }
      if (porNome.has("chaveOperacao")) {
        const [dups] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS n FROM (
             SELECT userId, chaveOperacao FROM \`${tabela}\`
             WHERE chaveOperacao IS NOT NULL
             GROUP BY userId, chaveOperacao
             HAVING COUNT(*) > 1
           ) d`,
        );
        duplicidades += Number(dups[0]?.n ?? 0);
      }
    }
    if (pecas.some(peca => peca.situacao === "incompativel") || duplicidades > 0) {
      return {
        pecas,
        duplicidades,
        decisao: "interromper",
        motivo: duplicidades > 0
          ? "Há chave repetida. Nenhum registro foi escolhido nem apagado."
          : "Há coluna ou índice diferente do esperado.",
      };
    }
    if (pecas.every(peca => peca.situacao === "compativel")) {
      return { pecas, duplicidades, decisao: "ja_completa", motivo: "A estrutura da 0073 já está completa." };
    }
    if (pecas.every(peca => peca.situacao === "ausente")) {
      return { pecas, duplicidades, decisao: "aplicar", motivo: "Nenhuma peça da 0073 existe." };
    }
    return {
      pecas,
      duplicidades,
      decisao: "interromper",
      motivo: "Aplicação parcial. Não continuar do meio. Restaurar a cópia conferida.",
    };
  } finally {
    await conn.end();
  }
}

export async function garantirLivro(alvo: Alvo): Promise<void> {
  const conn = await conectar(alvo);
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS fd_livro_propostas (
        id INT NOT NULL AUTO_INCREMENT,
        arquivo VARCHAR(180) NOT NULL,
        hash_conteudo CHAR(64) NOT NULL,
        dependencias VARCHAR(255) NULL,
        estado VARCHAR(40) NOT NULL,
        pre_verificacao TEXT NULL,
        iniciado_em TIMESTAMP NULL,
        concluido_em TIMESTAMP NULL,
        erro TEXT NULL,
        estado_posterior TEXT NULL,
        ultimo_comando VARCHAR(120) NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
  } finally {
    await conn.end();
  }
}

export async function aplicar0073(alvo: Alvo, caminhoArquivo: string): Promise<{
  situacao: "concluida" | "repetida" | "interrompida";
  motivo: string;
}> {
  conferirAlvo(alvo);
  if (!caminhoArquivo.endsWith("0073_nutricao_idempotencia.sql")) {
    throw new Error("Este executor só aplica a proposta 0073 no descartável.");
  }
  const hash = hashArquivo(caminhoArquivo);
  await garantirLivro(alvo);
  const conn = await conectar(alvo);
  try {
    const [anteriores] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT id, estado FROM fd_livro_propostas WHERE arquivo = ? AND hash_conteudo = ? AND estado = 'concluida' LIMIT 1`,
      ["0073_nutricao_idempotencia.sql", hash],
    );
    if (anteriores.length > 0) {
      return { situacao: "repetida", motivo: "O livro já registra esta proposta como concluída. O SQL não rodou de novo." };
    }
    const diagnostico = await diagnosticar0073(alvo);
    if (diagnostico.decisao === "ja_completa") {
      await conn.query(
        `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, concluido_em, estado_posterior)
         VALUES (?, ?, 'nutricao_fornecimentos,nutricao_batidas', 'concluida', ?, CURRENT_TIMESTAMP, ?)`,
        ["0073_nutricao_idempotencia.sql", hash, diagnostico.motivo, diagnostico.motivo],
      );
      return { situacao: "concluida", motivo: diagnostico.motivo };
    }
    if (diagnostico.decisao !== "aplicar") {
      await conn.query(
        `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, erro, iniciado_em)
         VALUES (?, ?, 'nutricao_fornecimentos,nutricao_batidas', 'interrompida', ?, ?, CURRENT_TIMESTAMP)`,
        ["0073_nutricao_idempotencia.sql", hash, diagnostico.motivo, diagnostico.motivo],
      );
      return { situacao: "interrompida", motivo: diagnostico.motivo };
    }
    const comandos = comandosEstruturais(fs.readFileSync(caminhoArquivo, "utf8"));
    if (comandos.length !== 4) {
      throw new Error("A 0073 não tem os quatro comandos esperados.");
    }
    const [livro] = await conn.query<mysql.ResultSetHeader>(
      `INSERT INTO fd_livro_propostas (arquivo, hash_conteudo, dependencias, estado, pre_verificacao, iniciado_em)
       VALUES (?, ?, 'nutricao_fornecimentos,nutricao_batidas', 'em_andamento', ?, CURRENT_TIMESTAMP)`,
      ["0073_nutricao_idempotencia.sql", hash, diagnostico.motivo],
    );
    const livroId = livro.insertId;
    try {
      for (const comando of comandos) {
        await conn.query(comando);
        await conn.query(
          "UPDATE fd_livro_propostas SET ultimo_comando = ? WHERE id = ?",
          [comando.slice(0, 120), livroId],
        );
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "falha";
      await conn.query(
        "UPDATE fd_livro_propostas SET estado = 'interrompida', erro = ? WHERE id = ?",
        [mensagem, livroId],
      );
      return { situacao: "interrompida", motivo: mensagem };
    }
    const depois = await diagnosticar0073(alvo);
    if (depois.decisao !== "ja_completa") {
      await conn.query(
        "UPDATE fd_livro_propostas SET estado = 'interrompida', erro = ? WHERE id = ?",
        [depois.motivo, livroId],
      );
      return { situacao: "interrompida", motivo: depois.motivo };
    }
    await conn.query(
      "UPDATE fd_livro_propostas SET estado = 'concluida', concluido_em = CURRENT_TIMESTAMP, estado_posterior = ? WHERE id = ?",
      [depois.motivo, livroId],
    );
    return { situacao: "concluida", motivo: depois.motivo };
  } finally {
    await conn.end();
  }
}
