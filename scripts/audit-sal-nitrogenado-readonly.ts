/**
 * Somente leitura. Não altera catálogo, estoque nem movimentação.
 */
import { like } from "drizzle-orm";
import { db, estoque, produtosCatalogo, fazendas } from "../server/db";

async function main() {
  const catalogo = await db
    .select({
      id: produtosCatalogo.id,
      nome: produtosCatalogo.nome,
      unidade: produtosCatalogo.unidade,
      embalagens: produtosCatalogo.embalagens,
      categoria: produtosCatalogo.categoria,
    })
    .from(produtosCatalogo)
    .where(like(produtosCatalogo.nome, "%Nitrogenado%"));

  const estoques = await db
    .select({
      estoqueId: estoque.id,
      produtoId: estoque.produtoId,
      fazendaId: estoque.fazendaId,
      nome: estoque.nome,
      unidade: estoque.unidade,
      quantidade: estoque.quantidade,
      valorUnitario: estoque.valorUnitario,
      embalagens: estoque.embalagens,
      controlarSaldo: estoque.controlarSaldo,
    })
    .from(estoque)
    .where(like(estoque.nome, "%Nitrogenado%"));

  const faz = await db.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas);

  console.log(JSON.stringify({ catalogo, estoques, fazendas: faz }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
