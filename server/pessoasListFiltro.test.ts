import { describe, expect, it } from "vitest";
import { deveRestringirPessoasListAosAtivos, pessoaVisivelNaListagem } from "./pessoasListFiltro";

describe("pessoas.list — ativos vs inativos", () => {
  it("Nova Venda / default exclui inativos (sem incluirInativos)", () => {
    expect(deveRestringirPessoasListAosAtivos(undefined)).toBe(true);
    expect(deveRestringirPessoasListAosAtivos(false)).toBe(true);
    expect(pessoaVisivelNaListagem(true)).toBe(true);
    expect(pessoaVisivelNaListagem(false)).toBe(false);
    expect(pessoaVisivelNaListagem(false, false)).toBe(false);
  });

  it("listagem administrativa com incluirInativos=true recebe ativos e inativos", () => {
    expect(deveRestringirPessoasListAosAtivos(true)).toBe(false);
    expect(pessoaVisivelNaListagem(true, true)).toBe(true);
    expect(pessoaVisivelNaListagem(false, true)).toBe(true);
  });
});
