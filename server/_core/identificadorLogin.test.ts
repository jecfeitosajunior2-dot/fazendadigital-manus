import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { identificadorDeLogin } from "./identificadorLogin";
import { senhaConfereComHash } from "./loginSenha";

const here = dirname(fileURLToPath(import.meta.url));

const EMAIL = "pessoa.ficticia@exemplo.test";
const OPEN_ID = `local:${EMAIL}`;
const NOME = "Dono Ficticio da Fazenda";
const SENHA = "senha-ficticia-correta";
const SENHA_COM_ESPACOS = "  segredo ficticio  ";

type Pessoa = { email: string; openId: string; name: string; passwordHash: string };

function localizar(pessoa: Pessoa, informado: string) {
  const identificador = identificadorDeLogin(informado);
  if (!identificador) return null;
  if (pessoa.email === identificador || pessoa.openId === identificador) return pessoa;
  return null;
}

async function autenticar(pessoa: Pessoa, informado: string, senha: string) {
  const achada = localizar(pessoa, informado);
  if (!achada) return false;
  return senhaConfereComHash(achada.passwordHash, senha);
}

describe("identificador do login", () => {
  const pessoa: Pessoa = {
    email: EMAIL,
    openId: OPEN_ID,
    name: NOME,
    passwordHash: "",
  };

  it("encontra o e-mail certo sem espaços e com espaços só nas pontas", async () => {
    pessoa.passwordHash = await bcrypt.hash(SENHA, 4);
    for (const informado of [EMAIL, ` ${EMAIL}`, `${EMAIL} `, `  ${EMAIL}  `]) {
      expect(localizar(pessoa, informado)?.email).toBe(EMAIL);
      await expect(autenticar(pessoa, informado, SENHA)).resolves.toBe(true);
    }
  });

  it("não entra com e-mail errado, com o nome, nem com identificador vazio", async () => {
    pessoa.passwordHash = await bcrypt.hash(SENHA, 4);
    await expect(autenticar(pessoa, "outra.pessoa@exemplo.test", SENHA)).resolves.toBe(false);
    await expect(autenticar(pessoa, NOME, SENHA)).resolves.toBe(false);
    await expect(autenticar(pessoa, "   ", SENHA)).resolves.toBe(false);
    expect(identificadorDeLogin("   ")).toBe("");
  });

  it("rejeita senha errada e preserva espaços que fazem parte da senha", async () => {
    pessoa.passwordHash = await bcrypt.hash(SENHA, 4);
    await expect(autenticar(pessoa, ` ${EMAIL} `, "senha-ficticia-errada")).resolves.toBe(false);

    pessoa.passwordHash = await bcrypt.hash(SENHA_COM_ESPACOS, 4);
    await expect(autenticar(pessoa, EMAIL, SENHA_COM_ESPACOS)).resolves.toBe(true);
    await expect(autenticar(pessoa, EMAIL, SENHA_COM_ESPACOS.trim())).resolves.toBe(false);
  });

  it("o servidor apara só o identificador e compara a senha como chegou", () => {
    const routers = readFileSync(resolve(here, "../routers.ts"), "utf8");
    const login = routers.slice(routers.indexOf("login: publicProcedure"), routers.indexOf("logout: publicProcedure"));
    expect(login).toContain("identificadorDeLogin(input.username)");
    expect(login).toContain("senhaConfereComHash(user?.passwordHash, input.password)");
    expect(login).not.toContain("input.password.trim()");
    expect(login).not.toContain("users.name");
  });
});
