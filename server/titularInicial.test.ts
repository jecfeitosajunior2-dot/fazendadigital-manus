import { describe, expect, it } from "vitest";
import { avaliarBancoDoTitular, planejarTitularInicial } from "./titularInicial";

describe("primeiro titular", () => {
  it("recusa o banco antigo e a falta de confirmação", () => {
    expect(avaliarBancoDoTitular({ banco: "fazenda_digital", confirmouBancoNovo: true })).toEqual({
      ok: false,
      motivo: "banco_operacional",
    });
    expect(avaliarBancoDoTitular({ banco: "fd_novo", confirmouBancoNovo: false })).toEqual({
      ok: false,
      motivo: "confirmacao_ausente",
    });
    expect(avaliarBancoDoTitular({ banco: "fd_novo", confirmouBancoNovo: true })).toEqual({ ok: true });
  });

  it("cria um principal só quando ainda não existe e não devolve senha", () => {
    const senha = "segredo-que-nao-pode-aparecer";
    const plano = planejarTitularInicial({
      jaExistePrincipal: false,
      name: " Titular Ensaio ",
      email: "Titular.Ensaio@exemplo.invalid",
      senhaInformada: senha.length >= 8,
    });
    expect(plano).toEqual({
      ok: true,
      name: "Titular Ensaio",
      email: "titular.ensaio@exemplo.invalid",
      papel: "principal",
    });
    expect(JSON.stringify(plano)).not.toContain(senha);
    expect(planejarTitularInicial({
      jaExistePrincipal: true,
      name: "Outro",
      email: "outro@exemplo.invalid",
      senhaInformada: true,
    })).toEqual({ ok: false, motivo: "titular_existente" });
  });
});
