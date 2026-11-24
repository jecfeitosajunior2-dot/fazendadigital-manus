/**
 * Recuperação administrativa de acesso.
 * Roda no computador da instalação. A senha vem do ambiente, nunca da linha de comando.
 *
 * O banco fazenda_digital e a porta 3306 são recusados aqui de propósito:
 * esta ferramenta não é executada contra o banco da fazenda durante a homologação.
 * No dia da implantação, o operador aponta DATABASE_URL para o banco novo.
 */
import mysql from "mysql2/promise";
import { criarSenhaContaDb } from "../server/senhaContaDb";

function falhar(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

function ocultar(texto: string, segredo: string): string {
  if (!segredo) return texto;
  return texto.split(segredo).join("[oculto]");
}

const urlBruta = process.env.DATABASE_URL ?? "";
const senha = process.env.FD_RECUPERAR_SENHA ?? "";
const email = process.env.FD_RECUPERAR_EMAIL ?? "";
const linha = process.argv.slice(2);

if (senha && linha.some((arg) => arg.includes(senha))) {
  falhar("A senha não pode ir na linha de comando.");
}

let endereco: URL;
try {
  endereco = new URL(urlBruta);
} catch {
  falhar("DATABASE_URL ausente ou inválida.");
}

const porta = endereco.port ? Number(endereco.port) : 3306;
const banco = decodeURIComponent(endereco.pathname.replace(/^\//, ""));
const acesso = process.env.FD_RECUPERAR_ACESSO === "1";
const confirmou = linha.includes("--confirmo-recuperacao");
const titularAutorizou = process.env.FD_RECUPERAR_AUTORIZACAO_TITULAR === "1";

if (!acesso || !confirmou || !titularAutorizou) {
  falhar("Recuperação recusada: falta a autorização administrativa do titular.");
}

if (!banco || banco.toLowerCase() === "fazenda_digital") {
  falhar("Recuperação recusada: o banco da fazenda não entra neste comando.");
}

if (porta === 3306 && process.env.FD_RECUPERAR_BANCO_NOVO !== "1") {
  falhar("Recuperação recusada: a porta 3306 só vale com a confirmação de banco novo.");
}

if (endereco.hostname !== "127.0.0.1" && endereco.hostname !== "localhost") {
  falhar("Recuperação recusada: o host não é o da instalação local.");
}

const pool = mysql.createPool({
  host: endereco.hostname === "localhost" ? "127.0.0.1" : endereco.hostname,
  port: porta,
  user: decodeURIComponent(endereco.username),
  password: decodeURIComponent(endereco.password),
  database: banco,
  connectionLimit: 2,
});

try {
  const servico = criarSenhaContaDb(pool, {
    host: "127.0.0.1",
    port: porta,
    database: banco,
  }, "operador");
  const resultado = await servico.recuperarAcesso({
    email,
    senha,
    acessoAdministrativo: true,
    confirmouProcedimento: true,
    titularAutorizou: true,
  });
  if (!resultado.ok) falhar(`Recuperação recusada: ${resultado.motivo}.`);
  console.log("Credencial atualizada. O titular entra e troca a senha em Minha conta.");
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  falhar(ocultar(mensagem, senha));
} finally {
  await pool.end().catch(() => undefined);
}
