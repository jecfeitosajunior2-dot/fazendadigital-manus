import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  MSG_PESSOA_REATIVAR_NAO_ENCONTRADA,
  PATCH_REATIVAR_PESSOA,
  assertPessoaReativavel,
  patchReativarPessoa,
  reativarPessoa,
} from "./reativarPessoa";

describe("pessoas.reativar", () => {
  it("altera somente ativo=false → true", async () => {
    const pessoa = {
      id: 20,
      userId: 1,
      nome: "Açougue Central",
      documento: "123.456.789-00",
      endereco: "Rua A",
      telefone: "(11) 3333-4444",
      email: "a@b.com",
      observacoes: "cliente antigo",
      propriedadeEstabelecimento: "Fazenda Boa Esperança",
      nomeContato: "João da Silva",
      cidade: "Balsas",
      uf: "MA",
      ativo: false,
    };
    const updates: Array<Record<string, unknown>> = [];

    const result = await reativarPessoa(1, 20, {
      findOwned: async () => ({ id: pessoa.id, userId: pessoa.userId }),
      updateSomenteAtivoTrue: async () => {
        const patch = patchReativarPessoa();
        updates.push(patch);
        pessoa.ativo = patch.ativo;
      },
    });

    expect(result).toEqual({ success: true });
    expect(updates).toEqual([{ ativo: true }]);
    expect(PATCH_REATIVAR_PESSOA).toEqual({ ativo: true });
    expect(pessoa).toMatchObject({
      id: 20,
      userId: 1,
      nome: "Açougue Central",
      documento: "123.456.789-00",
      endereco: "Rua A",
      telefone: "(11) 3333-4444",
      email: "a@b.com",
      observacoes: "cliente antigo",
      propriedadeEstabelecimento: "Fazenda Boa Esperança",
      nomeContato: "João da Silva",
      cidade: "Balsas",
      uf: "MA",
      ativo: true,
    });
  });

  it("usuário não pode reativar pessoa de outro usuário", async () => {
    await expect(
      reativarPessoa(1, 99, {
        findOwned: async () => undefined,
        updateSomenteAtivoTrue: async () => {
          throw new Error("não deveria atualizar cadastro de outro usuário");
        },
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: MSG_PESSOA_REATIVAR_NAO_ENCONTRADA,
    });

    expect(() => assertPessoaReativavel({ id: 99, userId: 2 }, 1)).toThrow(TRPCError);
  });

  it("não cria cadastro novo e não toca venda histórica", async () => {
    const venda = {
      id: 1,
      compradorId: 20,
      comprador: "Açougue Central",
      status: "concluido",
      valorTotal: "15000.00",
      animalIds: [801, 802],
    };
    const pessoasAntes = 1;
    let pessoasDepois = pessoasAntes;
    let updateChamado = false;

    await reativarPessoa(1, 20, {
      findOwned: async () => ({ id: 20, userId: 1 }),
      updateSomenteAtivoTrue: async () => {
        updateChamado = true;
        pessoasDepois = pessoasAntes;
      },
    });

    expect(updateChamado).toBe(true);
    expect(pessoasDepois).toBe(pessoasAntes);
    expect(patchReativarPessoa()).toEqual({ ativo: true });
    expect(venda).toEqual({
      id: 1,
      compradorId: 20,
      comprador: "Açougue Central",
      status: "concluido",
      valorTotal: "15000.00",
      animalIds: [801, 802],
    });
  });
});
