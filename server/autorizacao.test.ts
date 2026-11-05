import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import { montarAcesso, type FazendaConhecida } from "./acessoFazendas";
import { CATALOGO_PERMISSOES, permissaoExigeFazenda, permissaoPorId } from "./catalogoPermissoes";
import {
  podeAlterarPapel,
  podeConcederFazenda,
  podeConcederPermissao,
  podeCriarUsuario,
  podeDelegarPermissao,
  podeExecutarOperacao,
  type PedidoAutorizacao,
} from "./autorizacao";

const FAZENDA_J: FazendaConhecida = { id: 10, userId: 1 };
const FAZENDA_B: FazendaConhecida = { id: 20, userId: 1 };
const FAZENDA_ALHEIA: FazendaConhecida = { id: 30, userId: 9 };
const FAZENDAS = [FAZENDA_J, FAZENDA_B];

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel">): IdentidadeUsuario {
  return {
    openId: `pessoa-${parcial.id}`,
    name: `Pessoa ${parcial.id}`,
    email: `pessoa-${parcial.id}@isolado.local`,
    role: parcial.papel === "comum" ? "user" : "admin",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    ...parcial,
  };
}

function pedido(
  identidade: IdentidadeUsuario | null,
  permissoes: string[] = [],
  vinculos: Array<{ userId: number; fazendaId: number }> = [],
): PedidoAutorizacao {
  return {
    acesso: montarAcesso({ identidade, fazendasDoTitular: FAZENDAS, vinculos }),
    permissoes,
    permissoesInformadasPeloCliente: CATALOGO_PERMISSOES.map((item) => item.id),
    papelInformadoPeloCliente: "principal",
  };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1 });
const secundario = pessoa({ id: 3, papel: "secundario", role: "user" });
const comum = pessoa({ id: 2, papel: "comum" });
const alvoComum = { id: 4, titularUserId: 1, papel: "comum" as const, situacao: "ativo" as const };
const alvoPrincipal = { id: 1, titularUserId: 1, papel: "principal" as const, situacao: "ativo" as const };

const here = dirname(fileURLToPath(import.meta.url));

describe("catálogo e hierarquia de permissões", () => {
  it("o principal opera na própria conta sem lista individual", () => {
    const ids = CATALOGO_PERMISSOES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("vendas.estornar");
    expect(ids).toContain("vendas.cancelar");
    const base = pedido(principal);
    expect(podeExecutarOperacao(base, "animais.visualizar", FAZENDA_J)).toBe("permitido");
    expect(podeExecutarOperacao(base, "vendas.confirmar", FAZENDA_B)).toBe("permitido");
    expect(podeExecutarOperacao(base, "usuarios.alterar_papel")).toBe("permitido");
    expect(base.permissoes).toEqual([]);
  });

  it("o principal não alcança outro titular", () => {
    const base = pedido(principal);
    expect(podeExecutarOperacao(base, "animais.visualizar", FAZENDA_ALHEIA)).toBe("outro_titular");
    expect(podeConcederFazenda(base, { ...alvoComum, titularUserId: 9 }, FAZENDA_J)).toBe("outro_titular");
  });

  it("o secundário executa só a operação concedida e na fazenda autorizada", () => {
    const base = pedido(secundario, ["animais.visualizar"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeExecutarOperacao(base, "animais.visualizar", FAZENDA_J)).toBe("permitido");
    expect(podeExecutarOperacao(base, "animais.editar", FAZENDA_J)).toBe("sem_permissao");
    expect(podeExecutarOperacao(base, "animais.visualizar", FAZENDA_B)).toBe("sem_fazenda");
  });

  it("o secundário não concede permissão nem fazenda fora do próprio teto", () => {
    const base = pedido(secundario, ["usuarios.gerenciar_permissoes", "animais.visualizar"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeConcederPermissao(base, alvoComum, "animais.editar")).toBe("acima_do_teto");
    const comAcesso = pedido(secundario, ["usuarios.gerenciar_acessos"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeConcederFazenda(comAcesso, alvoComum, FAZENDA_B)).toBe("sem_fazenda");
    expect(podeConcederFazenda(comAcesso, alvoComum, FAZENDA_J)).toBe("permitido");
  });

  it("criar usuário não entrega as outras chaves administrativas", () => {
    const soCriar = pedido(secundario, ["usuarios.criar"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeCriarUsuario(soCriar, "comum")).toBe("permitido");
    expect(podeConcederPermissao(soCriar, alvoComum, "animais.visualizar")).toBe("sem_permissao");
    expect(podeConcederFazenda(soCriar, alvoComum, FAZENDA_J)).toBe("sem_permissao");
    const soAcesso = pedido(secundario, ["usuarios.gerenciar_acessos"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeConcederPermissao(soAcesso, alvoComum, "animais.visualizar")).toBe("sem_permissao");
  });

  it("o secundário não mexe em hierarquia, em si nem no principal", () => {
    const base = pedido(secundario, ["usuarios.criar", "usuarios.gerenciar_permissoes", "usuarios.alterar_papel"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeCriarUsuario(base, "secundario")).toBe("reservado_ao_principal");
    expect(podeCriarUsuario(base, "principal")).toBe("hierarquia_recusada");
    expect(podeAlterarPapel(base, alvoComum, "secundario")).toBe("reservado_ao_principal");
    expect(podeConcederPermissao(base, { id: 3, titularUserId: 1, papel: "secundario", situacao: "ativo" }, "animais.visualizar")).toBe("auto_modificacao");
    expect(podeConcederPermissao(base, alvoPrincipal, "animais.visualizar")).toBe("alvo_protegido");
  });

  it("o usuário comum não administra e operação sensível pede concessão própria", () => {
    const base = pedido(comum, ["usuarios.criar", "animais.visualizar"], [{ userId: 2, fazendaId: 10 }]);
    expect(podeCriarUsuario(base, "comum")).toBe("sem_permissao");
    expect(podeConcederPermissao(base, alvoComum, "animais.visualizar")).toBe("sem_permissao");
    expect(podeExecutarOperacao(base, "vendas.confirmar", FAZENDA_J)).toBe("sem_permissao");
    expect(podeExecutarOperacao(base, "financeiro.estornar", FAZENDA_J)).toBe("sem_permissao");
    const comVenda = pedido(secundario, ["vendas.confirmar"], [{ userId: 3, fazendaId: 10 }]);
    expect(podeExecutarOperacao(comVenda, "vendas.confirmar", FAZENDA_J)).toBe("permitido");
    expect(permissaoPorId("vendas.confirmar")?.sensivel).toBe(true);
    expect(permissaoPorId("usuarios.alterar_papel")?.exclusivaDoPrincipal).toBe(true);
    const leitura = permissaoPorId("auditoria.visualizar");
    expect(leitura?.modulo).toBe("auditoria");
    expect(leitura?.sensivel).toBe(true);
    expect(leitura?.exclusivaDoPrincipal).toBe(false);
    expect(leitura ? permissaoExigeFazenda(leitura) : true).toBe(false);
    expect(podeExecutarOperacao(pedido(principal), "auditoria.visualizar")).toBe("permitido");
    expect(podeExecutarOperacao(pedido(comum, ["auditoria.visualizar"]), "auditoria.visualizar")).toBe("sem_permissao");
    expect(podeDelegarPermissao(pedido(principal), "auditoria.visualizar")).toBe("permitido");
    expect(podeConcederPermissao(pedido(principal), alvoComum, "auditoria.visualizar")).toBe("permitido");
  });

  it("nega ausência, identificador inválido, inativo e identidade ausente", () => {
    const base = pedido(secundario, [], [{ userId: 3, fazendaId: 10 }]);
    expect(podeExecutarOperacao(base, "estoque.visualizar", FAZENDA_J)).toBe("sem_permissao");
    expect(podeExecutarOperacao(base, "vendas.estornar", FAZENDA_J)).toBe("permissao_invalida");
    expect(podeCriarUsuario(base, "visitante")).toBe("alvo_invalido");
    expect(podeConcederFazenda(base, { id: 0, titularUserId: 1, papel: "comum", situacao: "ativo" }, FAZENDA_J)).toBe("alvo_invalido");
    const inativo = pedido(pessoa({ id: 2, papel: "comum", situacao: "inativo" }), ["animais.visualizar"], [{ userId: 2, fazendaId: 10 }]);
    expect(inativo.acesso).toBeNull();
    expect(podeExecutarOperacao(inativo, "animais.visualizar", FAZENDA_J)).toBe("sem_identidade");
    expect(podeExecutarOperacao(pedido(null, ["animais.visualizar"]), "animais.visualizar", FAZENDA_J)).toBe("sem_identidade");
  });

  it("ainda não entra nos módulos operacionais nem nas rotas", () => {
    const roteador = readFileSync(resolve(here, "routers.ts"), "utf8");
    const manejo = readFileSync(resolve(here, "manejoContexto.ts"), "utf8");
    expect(roteador.includes("catalogoPermissoes")).toBe(false);
    expect(roteador.includes("podeExecutarOperacao")).toBe(false);
    expect(manejo.includes("autorizacao")).toBe(false);
  });
});
