/**
 * Cria só o modelo Drizzle num banco vazio e descartável.
 * Recusa a porta 3306, o banco da fazenda e qualquer remoção.
 */
import { aplicarModeloVazio } from "../server/esquemaDefinitivo";

function alvoDaUrl(bruta: string) {
  const url = new URL(bruta);
  return {
    host: url.hostname,
    port: Number(url.port || "3306"),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}

const bruta = process.env.DATABASE_URL ?? "";
if (!bruta) {
  console.error("DATABASE_URL ausente. Nada foi aplicado.");
  process.exit(1);
}

try {
  const resultado = await aplicarModeloVazio(alvoDaUrl(bruta));
  console.log(`Modelo criado. Comandos: ${resultado.comandos}. Avisos: ${resultado.avisos}.`);
} catch (erro) {
  const mensagem = erro instanceof Error ? erro.message : "falha";
  console.error(mensagem.split(alvoDaUrl(bruta).password).join("***"));
  process.exit(1);
}
