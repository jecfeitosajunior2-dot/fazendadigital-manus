import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const raiz = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(raiz, "../drizzle/schema.ts"), "utf8");
const migration = readFileSync(join(raiz, "../drizzle/migrations/0061_vendas_idempotency.sql"), "utf8");
const journal = readFileSync(join(raiz, "../drizzle/migrations/meta/_journal.json"), "utf8");
const ensure = readFileSync(join(raiz, "../server/ensureSchema.ts"), "utf8");
const confirmar = readFileSync(join(raiz, "../server/confirmarVenda.ts"), "utf8");
const router = readFileSync(join(raiz, "../server/routers.ts"), "utf8");
const confirmarTrpc = router.slice(
  router.indexOf("confirmar: protectedProcedure"),
  router.indexOf("cancelar: protectedProcedure"),
);

function blocoVendasSchema(): string {
  const inicio = schema.indexOf("export const vendas = mysqlTable");
  const fim = schema.indexOf("export const vendaItens");
  return schema.slice(inicio, fim);
}

describe("schema de idempotência da venda — preparação estática", () => {
  it("A — coluna idempotency_key varchar(80) aceita NULL", () => {
    const vendas = blocoVendasSchema();
    expect(vendas).toContain('idempotencyKey: varchar("idempotency_key", { length: 80 })');
    expect(vendas).not.toMatch(/idempotencyKey: varchar\("idempotency_key", \{ length: 80 \}\)\.notNull\(\)/);
    expect(migration).toContain("`idempotency_key` varchar(80) NULL");
  });

  it("B — vendas antigas com NULL cabem no UNIQUE composto", () => {
    expect(migration).toMatch(/MySQL permite vários NULL/i);
    expect(migration).toContain("(`user_id`, `idempotency_key`)");
  });

  it("C e D — UNIQUE é (user_id, idempotency_key); usuários diferentes podem repetir a chave", () => {
    const vendas = blocoVendasSchema();
    expect(vendas).toContain('uniqueIndex("vendas_idem_uq").on(table.userId, table.idempotencyKey)');
    expect(migration).toContain("CREATE UNIQUE INDEX `vendas_idem_uq`");
    expect(migration).toContain("ON `vendas` (`user_id`, `idempotency_key`)");
  });

  it("E e F — campos e índices anteriores da venda permanecem", () => {
    const vendas = blocoVendasSchema();
    expect(vendas).toContain("compradorId");
    expect(vendas).toContain("formaPrecificacao");
    expect(vendas).toContain("motivoCancelamento");
    expect(vendas).toContain('index("vendas_fazenda_idx").on(table.fazendaId)');
    expect(vendas).toContain('index("vendas_comprador_idx").on(table.compradorId)');
  });

  it("não aplica sozinho: journal ainda só 0000; ensureSchema e tRPC atuais não exigem a chave", () => {
    expect(journal).toContain("0000_omniscient_jigsaw");
    expect(journal).not.toContain("0061_vendas_idempotency");
    expect(ensure).not.toContain("idempotency_key");
    expect(confirmar).not.toContain("idempotencyKey");
    expect(confirmarTrpc).not.toContain("idempotencyKey");
    expect(migration).toMatch(/NÃO EXECUTAR/i);
    expect(migration).toContain("db:push");
  });
});
