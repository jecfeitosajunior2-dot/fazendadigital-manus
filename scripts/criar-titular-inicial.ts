/**
 * Cria o primeiro titular uma única vez, num banco que não seja o arquivo antigo.
 * Exige FD_CRIAR_TITULAR_INICIAL=1 e o argumento --confirmo-banco-novo.
 * A senha entra por FD_TITULAR_SENHA e não é impressa.
 */
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { avaliarBancoDoTitular, planejarTitularInicial } from "../server/titularInicial";

function bancoDaUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

async function main() {
  if (process.env.FD_CRIAR_TITULAR_INICIAL !== "1") {
    throw new Error("Criação do titular bloqueada. Falta a autorização desta execução.");
  }
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL ausente.");
  const banco = bancoDaUrl(url);
  const alvo = avaliarBancoDoTitular({
    banco,
    confirmouBancoNovo: process.argv.includes("--confirmo-banco-novo"),
  });
  if (!alvo.ok) throw new Error(`Criação recusada: ${alvo.motivo}.`);
  const senha = process.env.FD_TITULAR_SENHA ?? "";
  const plano = planejarTitularInicial({
    jaExistePrincipal: false,
    name: process.env.FD_TITULAR_NOME ?? "",
    email: process.env.FD_TITULAR_EMAIL ?? "",
    senhaInformada: senha.length >= 8 && senha.length <= 80,
  });
  if (!plano.ok) throw new Error(`Criação recusada: ${plano.motivo}.`);

  const conexao = await mysql.createConnection(url);
  try {
    await conexao.beginTransaction();
    const [existentes] = await conexao.query<mysql.RowDataPacket[]>(
      "SELECT id FROM users WHERE papel = 'principal' LIMIT 1 FOR UPDATE",
    );
    if (existentes.length > 0) {
      await conexao.rollback();
      throw new Error("Criação recusada: titular_existente.");
    }
    const hash = await bcrypt.hash(senha, 10);
    const openId = `titular-inicial-${Date.now()}`;
    const [inserido] = await conexao.query<mysql.ResultSetHeader>(
      `INSERT INTO users (openId, name, email, loginMethod, passwordHash, role, papel, situacao, sessionVersion)
       VALUES (?, ?, ?, 'local', ?, 'admin', 'principal', 'ativo', 0)`,
      [openId, plano.name, plano.email, hash],
    );
    const id = Number(inserido.insertId);
    const [ligado] = await conexao.query<mysql.ResultSetHeader>(
      "UPDATE users SET titularUserId = id WHERE id = ? AND titularUserId IS NULL AND papel = 'principal'",
      [id],
    );
    if (ligado.affectedRows !== 1) {
      await conexao.rollback();
      throw new Error("Criação recusada: vinculo.");
    }
    await conexao.query(
      `INSERT INTO auditoria_eventos
        (executorUserId, executorNome, titularUserId, modulo, operacao, registroTipo, registroId, dadosPosteriores)
       VALUES (?, ?, ?, 'usuarios', 'titular.inicial', 'users', ?, ?)`,
      [id, plano.name, id, id, JSON.stringify({ papel: "principal", email: plano.email })],
    );
    await conexao.commit();
    console.log(`Titular inicial criado. id ${id}`);
  } catch (erro) {
    await conexao.rollback().catch(() => undefined);
    throw erro;
  } finally {
    await conexao.end();
  }
}

main().catch((erro) => {
  const texto = erro instanceof Error ? erro.message : "falha";
  console.error(texto.split(process.env.FD_TITULAR_SENHA ?? "\u0000").join("***"));
  process.exitCode = 1;
});
