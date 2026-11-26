import { describe, expect, it } from "vitest";
import { createFinanceiroNucleoService } from "./financeiroNucleo";
import { criarStore } from "./financeiroNucleoMemoria";

async function familia() {
  const store = criarStore();
  const svc = createFinanceiroNucleoService(store);
  const pai = await svc.criarCategoria(10, { nome: "Vendas de Animais", tipo: "entrada" });
  const filho = await svc.criarCategoria(10, {
    nome: "Bezerros",
    tipo: "entrada",
    categoriaPaiId: pai.id,
  });
  return { store, svc, pai, filho };
}

describe("subcategoria financeira", () => {
  it("renomeia a subcategoria e recusa o pai", async () => {
    const { svc, pai, filho } = await familia();
    await svc.renomearSubcategoria(10, filho.id, "Bezerras");
    const lista = await svc.listarCategorias(10);
    expect(lista.find((item) => item.id === filho.id)?.nome).toBe("Bezerras");
    await expect(svc.renomearSubcategoria(10, pai.id, "Outro")).rejects.toMatchObject({
      message: "Esta ação vale para a subcategoria.",
    });
  });

  it("exclui sem lançamento e segura quando a subcategoria já foi usada", async () => {
    const { store, svc, pai, filho } = await familia();
    expect(await svc.conferirExclusaoSubcategoria(10, filho.id)).toMatchObject({ nome: "Bezerros", canDelete: true });
    await svc.excluirSubcategoria(10, filho.id);
    expect((await svc.listarCategorias(10)).some((item) => item.id === filho.id)).toBe(false);

    const deNovo = await svc.criarCategoria(10, { nome: "Bezerros", tipo: "entrada", categoriaPaiId: pai.id });
    store.apropriacoes.push({
      id: 1,
      userId: 10,
      tituloId: 1,
      fazendaId: null,
      categoriaId: deNovo.id,
      centroCustoId: null,
      valor: "10.00",
      origemDetalheTipo: null,
      origemDetalheId: null,
      observacoes: null,
    });
    expect(await svc.conferirExclusaoSubcategoria(10, deNovo.id)).toMatchObject({ canDelete: false });
    await expect(svc.excluirSubcategoria(10, deNovo.id)).rejects.toMatchObject({
      message: 'Não é possível excluir a subcategoria "Bezerros".',
    });
    expect((await svc.listarCategorias(10)).some((item) => item.id === deNovo.id)).toBe(true);
    expect(await svc.conferirExclusaoSubcategoria(10, pai.id)).toMatchObject({
      nome: "Vendas de Animais",
      canDelete: false,
      filha: false,
    });
    await expect(svc.excluirSubcategoria(10, pai.id)).rejects.toMatchObject({
      message: 'Não é possível excluir a categoria "Vendas de Animais".',
    });
  });

  it("exclui a categoria pai quando ela não tem subcategoria nem lançamento", async () => {
    const { svc } = await familia();
    const solta = await svc.criarCategoria(10, { nome: "3", tipo: "saida" });
    expect(await svc.conferirExclusaoSubcategoria(10, solta.id)).toMatchObject({
      nome: "3",
      canDelete: true,
      filha: false,
    });
    await svc.excluirSubcategoria(10, solta.id);
    expect((await svc.listarCategorias(10)).some((item) => item.id === solta.id)).toBe(false);
  });
});
