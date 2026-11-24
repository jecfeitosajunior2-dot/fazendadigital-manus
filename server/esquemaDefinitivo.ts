/**
 * Monta o esquema definitivo só num MySQL vazio e descartável.
 * 1. O modelo Drizzle cria as tabelas.
 * 2. O complemento acrescenta as restrições que o arranque já exige.
 * 3. As propostas 0071–0076 entram depois, por outro caminho.
 * Não usa a cadeia 0000. Não remove estrutura.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import mysql from "mysql2/promise";
import type { AlvoEnsaio } from "./executorNovePropostas";
import { avaliarPush } from "./pushDrizzleSeguro";

export const COMPLEMENTO_BOOT = "drizzle/complemento-restricoes-boot.sql";

export function hashArquivo(caminho: string): string {
  return createHash("sha256").update(fs.readFileSync(caminho)).digest("hex");
}

export function comandosDoComplemento(caminho = COMPLEMENTO_BOOT): string[] {
  const texto = fs.readFileSync(caminho, "utf8");
  const semComentario = texto
    .split(/\r?\n/)
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n");
  return semComentario.split(";").map((parte) => parte.trim()).filter(Boolean);
}

function nomeDoComando(comando: string): string {
  const acerto = comando.match(/(?:CONSTRAINT|INDEX)\s+`([^`]+)`/i);
  return acerto?.[1] ?? "comando";
}

async function contarTabelas(alvo: AlvoEnsaio): Promise<number> {
  const conexao = await mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    database: alvo.database,
    multipleStatements: false,
  });
  try {
    const [contagem] = await conexao.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS n
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
    );
    return Number(contagem[0]?.n ?? 0);
  } finally {
    await conexao.end();
  }
}

export async function aplicarModeloVazio(alvo: AlvoEnsaio) {
  const recusa = avaliarPush(alvo, [], 0);
  if (!recusa.aplicar && recusa.motivo.startsWith("Conexão recusada")) {
    throw new Error(recusa.motivo);
  }
  const tabelasExistentes = await contarTabelas(alvo);
  const plano = avaliarPush(alvo, [], tabelasExistentes);
  if (!plano.aplicar) throw new Error(plano.motivo);

  const url = `mysql://${encodeURIComponent(alvo.user)}:${encodeURIComponent(alvo.password)}@${alvo.host}:${alvo.port}/${alvo.database}`;
  const ambiente: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(process.env)) {
    if (typeof valor === "string") ambiente[chave] = valor;
  }
  ambiente.DATABASE_URL = url;
  const saida = await new Promise<string>((resolve, reject) => {
    const filho = spawn(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--verbose"], {
      cwd: process.cwd(),
      env: ambiente,
      shell: false,
    });
    let texto = "";
    const encerrar = (erro?: Error) => {
      if (filho.exitCode == null) filho.kill();
      if (erro) reject(erro);
    };
    filho.stdout.on("data", (bloco) => {
      texto += bloco.toString();
      if (/data loss|do you still want/i.test(texto)) {
        encerrar(new Error("O push pediu confirmação de perda. Nada foi confirmado."));
      }
    });
    filho.stderr.on("data", (bloco) => { texto += bloco.toString(); });
    filho.on("close", (code) => {
      const limpo = texto.split(alvo.password).join("***").split(encodeURIComponent(alvo.password)).join("***");
      if (/data loss|do you still want/i.test(limpo)) {
        reject(new Error("O push pediu confirmação de perda. Nada foi confirmado."));
        return;
      }
      if (code !== 0 || !/Changes applied/i.test(limpo)) {
        reject(new Error(`O modelo não foi criado. ${limpo.slice(-400)}`));
        return;
      }
      resolve(limpo);
    });
  });
  if (/\bdrop\s+(table|column|index|database)\b/i.test(saida)) {
    throw new Error("O push emitiu remoção. A criação foi interrompida na conferência.");
  }
  return { comandos: (saida.match(/CREATE /gi) ?? []).length, avisos: 0 };
}

export async function aplicarComplementoBoot(alvo: AlvoEnsaio, caminho = COMPLEMENTO_BOOT) {
  const recusa = avaliarPush(alvo, [], 0);
  if (!recusa.aplicar && recusa.motivo.startsWith("Conexão recusada")) {
    throw new Error(recusa.motivo);
  }
  const comandos = comandosDoComplemento(caminho);
  const conexao = await mysql.createConnection({
    host: alvo.host,
    port: alvo.port,
    user: alvo.user,
    password: alvo.password,
    database: alvo.database,
    multipleStatements: false,
  });
  const aplicados: string[] = [];
  const jaExistiam: string[] = [];
  try {
    for (const comando of comandos) {
      const nome = nomeDoComando(comando);
      const [chaves] = await conexao.query<mysql.RowDataPacket[]>(
        `SELECT CONSTRAINT_NAME AS nome
         FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?
         UNION
         SELECT INDEX_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
        [nome, nome],
      );
      if (chaves.length > 0) {
        jaExistiam.push(nome);
        continue;
      }
      try {
        await conexao.query(comando);
      } catch (erro) {
        const mensagem = erro instanceof Error ? erro.message : "falha";
        throw new Error(`Complemento interrompido em ${nome}: ${mensagem}`);
      }
      aplicados.push(nome);
    }
    return { aplicados, jaExistiam, hash: hashArquivo(caminho) };
  } finally {
    await conexao.end();
  }
}
