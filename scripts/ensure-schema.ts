/**
 * Manutenção estrutural explícita.
 * Não faz parte do boot. Não chamar de pnpm start / pnpm dev.
 */
import { ensureSchema } from "../server/ensureSchema";

await ensureSchema();
console.log("[schema] Manutenção explícita concluída.");
