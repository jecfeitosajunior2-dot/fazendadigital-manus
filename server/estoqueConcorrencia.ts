import { TRPCError } from "@trpc/server";

export const MSG_ESTOQUE_DISPUTADO =
  "O saldo deste produto foi disputado por outra operação. Nada foi gravado. Tente novamente.";

function cadeias(erro: unknown): unknown[] {
  const vistos = new Set<unknown>();
  const fila = [erro];
  const saida: unknown[] = [];
  while (fila.length > 0) {
    const atual = fila.shift();
    if (atual == null || typeof atual !== "object" || vistos.has(atual)) continue;
    vistos.add(atual);
    saida.push(atual);
    const causa = (atual as { cause?: unknown }).cause;
    if (causa) fila.push(causa);
  }
  return saida;
}

export function ehDeadlockEstoque(erro: unknown): boolean {
  return cadeias(erro).some((item) => {
    const obj = item as { errno?: number; code?: string; message?: string };
    return obj.errno === 1213
      || obj.code === "ER_LOCK_DEADLOCK"
      || /deadlock found when trying to get lock/i.test(String(obj.message ?? ""));
  });
}

/** O MySQL já desfez a transação. Não tenta de novo sozinho. */
export function recusarSeDeadlockEstoque(erro: unknown): void {
  if (!ehDeadlockEstoque(erro)) return;
  throw new TRPCError({ code: "CONFLICT", message: MSG_ESTOQUE_DISPUTADO });
}
