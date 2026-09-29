import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  COMPRA_VENDA_COMPRADORES_LEGADO_PATH,
  CONSULTA_PESSOAS_ADMIN,
  FINANCEIRO_PESSOAS_PATH,
  acoesPessoaListagem,
  filtrarPessoasPorStatus,
  pessoaEstaAtiva,
  rotuloPapelPessoa,
  tituloInativarPessoa,
  tituloReativarPessoa,
} from "./pessoasListagem";

const here = dirname(fileURLToPath(import.meta.url));
const pessoasPage = readFileSync(resolve(here, "../pages/FinancialPeoplePage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const modulePages = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const vendasPage = modulePages.slice(modulePages.indexOf("export function SalesPage"));

const ativo = { id: 1, nome: "Frigorífico", tipo: "cliente", ativo: true };
const inativo = { id: 2, nome: "Agro X", tipo: "fornecedor", ativo: false };

describe("pessoasListagem — cadastro central no lugar de Gerenciar Compradores", () => {
  it("consulta administrativa pede inativos; Nova Venda continua só com ativos", () => {
    expect(CONSULTA_PESSOAS_ADMIN).toEqual({ incluirInativos: true });
    expect(pessoasPage).toContain("CONSULTA_PESSOAS_ADMIN");
    expect(pessoasPage).toContain("pessoas.reativar");
    expect(pessoasPage).toContain("Inativar");
    expect(pessoasPage).toContain("Reativar");
  });

  it("ativo oferece Inativar e inativo oferece Reativar", () => {
    expect(pessoaEstaAtiva(ativo)).toBe(true);
    expect(pessoaEstaAtiva(inativo)).toBe(false);
    expect(acoesPessoaListagem(true)).toEqual({ editar: true, inativar: true, reativar: false });
    expect(acoesPessoaListagem(false)).toEqual({ editar: true, inativar: false, reativar: true });
    expect(filtrarPessoasPorStatus([ativo, inativo], "todos").map(p => p.id)).toEqual([1, 2]);
    expect(filtrarPessoasPorStatus([ativo, inativo], "ativos").map(p => p.id)).toEqual([1]);
    expect(filtrarPessoasPorStatus([ativo, inativo], "inativos").map(p => p.id)).toEqual([2]);
  });

  it("rótulos de inativar/reativar usam o papel da ficha", () => {
    expect(rotuloPapelPessoa("cliente")).toBe("comprador");
    expect(rotuloPapelPessoa("fornecedor")).toBe("fornecedor");
    expect(tituloInativarPessoa("cliente")).toBe("Inativar comprador?");
    expect(tituloReativarPessoa("fornecedor")).toBe("Reativar fornecedor");
  });

  it("Vendas não tem mais Gerenciar Compradores; a rota antiga vai para Pessoas", () => {
    expect(FINANCEIRO_PESSOAS_PATH).toBe("/financeiro/pessoas");
    expect(COMPRA_VENDA_COMPRADORES_LEGADO_PATH).toBe("/compra-venda/vendas/compradores");
    expect(vendasPage).not.toContain("Gerenciar Compradores");
    expect(vendasPage).not.toContain("COMPRA_VENDA_COMPRADORES");
    expect(app).not.toContain("VendasCompradoresPage");
    expect(app).toContain("COMPRA_VENDA_COMPRADORES_LEGADO_PATH");
    expect(app).toContain("FINANCEIRO_PESSOAS_PATH");
    expect(app).toContain("RedirectTo to={FINANCEIRO_PESSOAS_PATH}");
  });
});
