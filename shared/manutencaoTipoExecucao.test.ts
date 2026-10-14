import { describe, expect, it } from "vitest";
import {
  lerTipoExecucaoManutencao,
  MSG_MANUT_INTERNA_SEM_MAO_OBRA,
  resolverValorMaoObraManutencao,
} from "./manutencaoTipoExecucao";

describe("tipo de execução da manutenção", () => {
  it("não infere interna/externa pelo nome do prestador ou pela mão de obra", () => {
    expect(lerTipoExecucaoManutencao(null)).toBeNull();
    expect(lerTipoExecucaoManutencao(undefined)).toBeNull();
    expect(lerTipoExecucaoManutencao("")).toBeNull();
    expect(lerTipoExecucaoManutencao("Joao")).toBeNull();
    expect(lerTipoExecucaoManutencao("oficina central")).toBeNull();
  });

  it("lê só o valor persistido", () => {
    expect(lerTipoExecucaoManutencao("interna")).toBe("interna");
    expect(lerTipoExecucaoManutencao("externa")).toBe("externa");
    expect(lerTipoExecucaoManutencao("INTERNA")).toBe("interna");
  });

  it("manutenção interna zera a mão de obra", () => {
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: "interna", valorMaoObra: 0 }),
    ).toEqual({ ok: true, valorMaoObra: 0 });
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: "interna", valorMaoObra: undefined }),
    ).toEqual({ ok: true, valorMaoObra: 0 });
  });

  it("rejeita mão de obra positiva em manutenção interna", () => {
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: "interna", valorMaoObra: 250 }),
    ).toEqual({ ok: false, message: MSG_MANUT_INTERNA_SEM_MAO_OBRA });
  });

  it("manutenção terceirizada preserva a mão de obra", () => {
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: "externa", valorMaoObra: 250 }),
    ).toEqual({ ok: true, valorMaoObra: 250 });
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: "externa", valorMaoObra: 0 }),
    ).toEqual({ ok: true, valorMaoObra: 0 });
  });

  it("registro antigo sem tipo persistido continua aceitando mão de obra", () => {
    expect(
      resolverValorMaoObraManutencao({ tipoExecucao: null, valorMaoObra: 180 }),
    ).toEqual({ ok: true, valorMaoObra: 180 });
    expect(
      resolverValorMaoObraManutencao({ valorMaoObra: 180 }),
    ).toEqual({ ok: true, valorMaoObra: 180 });
  });
});
