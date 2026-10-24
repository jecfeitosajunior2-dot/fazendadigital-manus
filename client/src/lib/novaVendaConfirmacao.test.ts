import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_VENDA_CONFIRMACAO_JA_CANCELADA, MSG_VENDA_CONFLITO_IDEMPOTENCIA } from "@shared/vendaFinanceiro";
import { INTEGRACAO_CONFIRMACAO_VENDA_ATIVA } from "@shared/vendaIntegracao";
import {
  MSG_VENDA_CONFIRMACAO_FLAG_INDISPONIVEL,
  MSG_VENDA_CONFIRMACAO_FLAG_PENDENTE,
  MSG_VENDA_CONFIRMACAO_MANUTENCAO,
  MSG_VENDA_CONFIRMACAO_SEM_FALLBACK,
  MSG_VENDA_CONFIRMACAO_TIMEOUT,
  decidirFluxoConfirmacaoNovaVenda,
  estadoConsultaFlagConfirmacaoVenda,
  executarConfirmacaoNovaVenda,
  executarVerificacaoConfirmacaoNovaVenda,
  montarIntencaoNovaVenda,
} from "./novaVendaConfirmacao";
import {
  MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO,
  criarArmazenamentoPendenciaVendaMemoria,
  criarCoordenacaoPendenciaVendaMemoria,
  listarTentativasPendenciaVenda,
  montarTentativaConfirmacaoVenda,
  nomeLockPendenciaVenda,
  novaChaveIdempotenciaVenda,
} from "./novaVendaPendencia";
import {
  aplicarCondicaoNovaVenda,
  aplicarQuantidadeParcelasNovaVenda,
  rascunhoInicialCondicaoNovaVenda,
  type RascunhoCondicaoNovaVenda,
} from "./novaVendaCondicao";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaVendaPage.tsx"), "utf8");
const router = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");

const comercialKg = {
  fazendaId: 7,
  data: "2026-10-21",
  compradorId: 4,
  formaPrecificacao: "kg" as const,
  precoPadrao: 20,
  observacoes: "lote",
  itens: [
    { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
    { animalId: 12, pesoVenda: 250, precoUnitario: 20 },
  ],
};

function rascunhoVista(): RascunhoCondicaoNovaVenda {
  return aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_vista", {
    dataVenda: comercialKg.data,
    valorTotal: 11000,
  });
}

describe("Nova Venda — confirmação 3E.9C", () => {
  it("A — flag false usa só o fluxo comercial, sem ven- e sem condição", async () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
    expect(decidirFluxoConfirmacaoNovaVenda(false)).toBe("comercial");
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    let integrada = 0;
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: false,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      confirmarComercial: async payload => {
        expect(payload).not.toHaveProperty("idempotencyKey");
        expect(payload).not.toHaveProperty("condicao");
        return { vendaId: 91 };
      },
      confirmarIntegrada: async () => {
        integrada += 1;
        return { vendaId: 1, tituloId: 1 };
      },
    });
    expect(result).toEqual({ ok: true, fluxo: "comercial", vendaId: 91 });
    expect(integrada).toBe(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(0);
  });

  it("B — flag true persiste intenção, chama integrada e limpa a pendência", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    let comercial = 0;
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 0 };
      },
      confirmarIntegrada: async payload => {
        expect(payload.idempotencyKey.startsWith("ven-")).toBe(true);
        expect(payload.condicao).toBe("a_vista");
        expect(payload.parcelas).toHaveLength(1);
        expect(payload.parcelas?.[0]?.vencimento).toBe("2026-10-21");
        return { vendaId: 44, tituloId: 55, idempotente: false };
      },
    });
    expect(result).toEqual({ ok: true, fluxo: "integrado", vendaId: 44, tituloId: 55, idempotente: false });
    expect(comercial).toBe(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(0);
  });

  it("C — à vista: uma parcela na data da venda, sem recebimento automático", () => {
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho: rascunhoVista() });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.condicao).toBe("a_vista");
    expect(montada.intencao.parcelas).toEqual([{ numero: 1, vencimento: "2026-10-21", valorOriginal: 11000 }]);
  });

  it("D — a prazo: vencimento igual ou posterior", () => {
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_prazo", {
      dataVenda: "2026-10-21",
      valorTotal: 11000,
    });
    rascunho.linhas[0]!.vencimento = "2026-11-21";
    rascunho.vencimentoPrazo = "2026-11-21";
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.condicao).toBe("a_prazo");
    expect(montada.intencao.parcelas?.[0]?.vencimento).toBe("2026-11-21");
  });

  it("E — parcelado: duas parcelas com soma exata", () => {
    const rascunho = aplicarQuantidadeParcelasNovaVenda(
      { ...rascunhoInicialCondicaoNovaVenda(), condicao: "parcelado" },
      2,
      11000,
    );
    rascunho.linhas[0]!.vencimento = "2026-11-21";
    rascunho.linhas[1]!.vencimento = "2026-12-21";
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.condicao).toBe("parcelado");
    expect(montada.intencao.parcelas).toHaveLength(2);
    expect(montada.intencao.parcelas?.reduce((s, p) => s + p.valorOriginal, 0)).toBe(11000);
  });

  it("F — definir depois: título pendente sem parcelas", () => {
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "definir_depois", {
      dataVenda: "2026-10-21",
      valorTotal: 11000,
    });
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.condicao).toBe("definir_depois");
    expect(montada.intencao.parcelas).toEqual([]);
  });

  it("G — venda por cabeça", () => {
    const comercial = {
      ...comercialKg,
      formaPrecificacao: "cabeca" as const,
      precoPadrao: 1500,
      itens: [{ animalId: 11, precoUnitario: 1500 }],
    };
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_vista", {
      dataVenda: comercial.data,
      valorTotal: 1500,
    });
    const montada = montarIntencaoNovaVenda({ ...comercial, rascunho });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.formaPrecificacao).toBe("cabeca");
    expect(montada.intencao.itens[0]).not.toHaveProperty("rfid");
  });

  it("H — venda por kg usa peso informado na venda", () => {
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho: rascunhoVista() });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.itens.map(i => i.pesoVenda)).toEqual([300, 250]);
  });

  it("I — preço individual", () => {
    const comercial = {
      ...comercialKg,
      itens: [
        { animalId: 11, pesoVenda: 300, precoUnitario: 22 },
        { animalId: 12, pesoVenda: 250, precoUnitario: 18 },
      ],
    };
    const rascunho = aplicarCondicaoNovaVenda(rascunhoInicialCondicaoNovaVenda(), "a_vista", {
      dataVenda: comercial.data,
      valorTotal: 300 * 22 + 250 * 18,
    });
    const montada = montarIntencaoNovaVenda({ ...comercial, rascunho });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(montada.intencao.itens.map(i => i.precoUnitario)).toEqual([22, 18]);
  });

  it("J/K — RFID não entra no payload; venda sem RFID segue igual", () => {
    const montada = montarIntencaoNovaVenda({ ...comercialKg, rascunho: rascunhoVista() });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    expect(JSON.stringify(montada.intencao)).not.toContain("rfid");
    expect(JSON.stringify(montada.intencao)).not.toContain("arroba");
  });

  it("L — timeout preserva chave e payload", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("timeout"), { data: { code: "TIMEOUT" } });
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.motivo).toBe("desconhecido");
    expect(result.message).toBe(MSG_VENDA_CONFIRMACAO_TIMEOUT);
    const tentativas = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(tentativas).toHaveLength(1);
    expect(tentativas[0]?.estado).toBe("desconhecido");
    expect(tentativas[0]?.idempotencyKey).toBe("ven-aaaaaaaabbbbccccddddeeeeeeeeeeee");
    expect(tentativas[0]?.intencao.observacoes).toBe("lote");
  });

  it("M/N — resposta perdida e retry idempotente com a mesma chave", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("rede"), { data: { code: "CLIENT_CLOSED_REQUEST" } });
      },
    });
    const tentativa = listarTentativasPendenciaVenda({ userId: 10, storage })[0]!;
    const retry = await executarVerificacaoConfirmacaoNovaVenda({
      integracaoAtiva: true,
      tentativa,
      intencaoAtual: tentativa.intencao,
      storage,
      confirmarIntegrada: async payload => {
        expect(payload.idempotencyKey).toBe(tentativa.idempotencyKey);
        return { vendaId: 44, tituloId: 55, idempotente: true };
      },
    });
    expect(retry).toMatchObject({ ok: true, fluxo: "integrado", vendaId: 44, tituloId: 55, idempotente: true });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(0);
  });

  it("O — payload alterado não gera chave nova nem chama o backend", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const chave = novaChaveIdempotenciaVenda(() => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const intencao = montarIntencaoNovaVenda({ ...comercialKg, rascunho: rascunhoVista() });
    expect(intencao.ok).toBe(true);
    if (!intencao.ok) return;
    const montada = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: chave,
      intencao: intencao.intencao,
      estado: "desconhecido",
      abaToken: "aba-1",
    });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    const { gravarTentativaPendenciaVenda } = await import("./novaVendaPendencia");
    await gravarTentativaPendenciaVenda({ tentativa: montada.tentativa, storage });
    let chamada = 0;
    const result = await executarVerificacaoConfirmacaoNovaVenda({
      integracaoAtiva: true,
      tentativa: montada.tentativa,
      intencaoAtual: { ...montada.tentativa.intencao, compradorId: 99 },
      storage,
      confirmarIntegrada: async () => {
        chamada += 1;
        return { vendaId: 1, tituloId: 1 };
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.motivo).toBe("travada");
    expect(chamada).toBe(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.idempotencyKey).toBe(chave);
  });

  it("P — duas abas: a segunda não sobrescreve", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const gerarUuid = () => "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const chave = novaChaveIdempotenciaVenda(gerarUuid);
    const ocupado = criarCoordenacaoPendenciaVendaMemoria(new Set([nomeLockPendenciaVenda(10, chave)]));
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-2",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      coordenacao: ocupado,
      gerarUuid,
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => ({ vendaId: 1, tituloId: 1 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.motivo).toBe("outra_aba");
  });

  it("Q/R — recarregamento e limpeza seletiva", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("rede"), { data: { code: "TIMEOUT" } });
      },
    });
    const outra = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: { ...comercialKg, compradorId: 8 },
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => ({ vendaId: 70, tituloId: 71 }),
    });
    expect(outra.ok).toBe(true);
    const restam = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(restam).toHaveLength(1);
    expect(restam[0]?.idempotencyKey).toContain("aaaaaaaa");
  });

  it("S — isolamento por usuário", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("rede"), { data: { code: "TIMEOUT" } });
      },
    });
    expect(listarTentativasPendenciaVenda({ userId: 11, storage })).toHaveLength(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(1);
  });

  it("T — erro de negócio não cai no comercial", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    let comercial = 0;
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 9 };
      },
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("Animal indisponível."), { data: { code: "BAD_REQUEST" } });
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.motivo).toBe("negocio");
    expect(comercial).toBe(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.estado).toBe("erro_definitivo");
  });

  it("U — falha de infraestrutura preserva tentativa", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const result = await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error("500"), { data: { code: "INTERNAL_SERVER_ERROR" } });
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.motivo).toBe("desconhecido");
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(1);
  });

  it("V — nenhuma venda duplicada no retry com a mesma chave", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const ids: string[] = [];
    await executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      confirmarComercial: async () => ({ vendaId: 1 }),
      confirmarIntegrada: async payload => {
        ids.push(payload.idempotencyKey);
        throw Object.assign(new Error("rede"), { data: { code: "TIMEOUT" } });
      },
    });
    const tentativa = listarTentativasPendenciaVenda({ userId: 10, storage })[0]!;
    await executarVerificacaoConfirmacaoNovaVenda({
      integracaoAtiva: true,
      tentativa,
      intencaoAtual: tentativa.intencao,
      storage,
      confirmarIntegrada: async payload => {
        ids.push(payload.idempotencyKey);
        return { vendaId: 44, tituloId: 55, idempotente: true };
      },
    });
    expect(ids).toEqual([ids[0], ids[0]]);
    expect(MSG_VENDA_CONFIRMACAO_SEM_FALLBACK).toContain("não é usada como alternativa");
  });

  it("verificar com flag false não chama a rota integrada", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const chave = novaChaveIdempotenciaVenda(() => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const intencao = montarIntencaoNovaVenda({ ...comercialKg, rascunho: rascunhoVista() });
    expect(intencao.ok).toBe(true);
    if (!intencao.ok) return;
    const montada = montarTentativaConfirmacaoVenda({
      userId: 10, idempotencyKey: chave, intencao: intencao.intencao, estado: "desconhecido", abaToken: "aba-1",
    });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    let chamada = 0;
    const result = await executarVerificacaoConfirmacaoNovaVenda({
      integracaoAtiva: false,
      tentativa: montada.tentativa,
      intencaoAtual: intencao.intencao,
      storage,
      confirmarIntegrada: async () => {
        chamada += 1;
        return { vendaId: 1, tituloId: 1 };
      },
    });
    expect(result).toMatchObject({ ok: false, motivo: "flag", message: MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO });
    expect(chamada).toBe(0);
  });

  it("venda já cancelada não vira sucesso nem gera outra chave", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const uuids = ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"];
    let nUuid = 0;
    const confirmar = async () => executarConfirmacaoNovaVenda({
      integracaoAtiva: true,
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => uuids[nUuid++] ?? uuids[0]!,
      confirmarComercial: async () => ({ vendaId: 99 }),
      confirmarIntegrada: async () => {
        throw Object.assign(new Error(MSG_VENDA_CONFIRMACAO_JA_CANCELADA), { data: { code: "BAD_REQUEST" } });
      },
    });
    const first = await confirmar();
    expect(first).toMatchObject({ ok: false, motivo: "negocio", message: MSG_VENDA_CONFIRMACAO_JA_CANCELADA });
    const depois = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(depois).toHaveLength(1);
    expect(depois[0]?.estado).toBe("erro_definitivo");
    expect(depois[0]?.idempotencyKey).toBe("ven-aaaaaaaabbbbccccddddeeeeeeeeeeee");
    const second = await confirmar();
    expect(second).toMatchObject({ ok: false, motivo: "negocio", message: MSG_VENDA_CONFIRMACAO_JA_CANCELADA });
    const final = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(final).toHaveLength(1);
    expect(final[0]?.idempotencyKey).toBe(depois[0]?.idempotencyKey);
    expect(page).toContain("toast.error(resultado.message)");
    expect(page).not.toContain("confirmarVendaComercial");
  });

  it("página pergunta a flag ao servidor e não ativa sozinha", () => {
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
    expect(page).toContain("trpc.vendas.integracaoConfirmacaoAtiva");
    expect(page).toContain("trpc.vendas.estadoConfirmacaoVenda");
    expect(page).toContain("estadoConsultaFlagConfirmacaoVenda");
    expect(page).not.toContain("integracaoAtiva = false");
    expect(page).toContain("trpc.vendas.confirmar");
    expect(page).toContain("trpc.vendas.confirmarIntegrada");
    expect(page).toContain("executarConfirmacaoNovaVenda");
    expect(page).not.toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");
    expect(page).not.toContain("confirmarVendaFinanceiro");
    expect(router).toContain("confirmarVendaComercialSePermitida");
    expect(router).toContain("confirmarVendaIntegradaSeAtiva");
    expect(router).toContain("estadoConfirmacaoVenda");
  });

  it("G — consulta da flag pendente não chama comercial nem integrada", async () => {
    expect(estadoConsultaFlagConfirmacaoVenda({ isPending: true })).toEqual({ estado: "pendente" });
    let comercial = 0;
    let integrada = 0;
    const result = await executarConfirmacaoNovaVenda({
      flag: { estado: "pendente" },
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 1 };
      },
      confirmarIntegrada: async () => {
        integrada += 1;
        return { vendaId: 1, tituloId: 1 };
      },
    });
    expect(result).toMatchObject({ ok: false, motivo: "flag", message: MSG_VENDA_CONFIRMACAO_FLAG_PENDENTE });
    expect(comercial).toBe(0);
    expect(integrada).toBe(0);
  });

  it("H — falha na consulta da flag bloqueia até o servidor responder", async () => {
    expect(estadoConsultaFlagConfirmacaoVenda({ isError: true, data: false })).toEqual({ estado: "falha" });
    let comercial = 0;
    const result = await executarConfirmacaoNovaVenda({
      flag: { estado: "falha" },
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 1 };
      },
      confirmarIntegrada: async () => ({ vendaId: 1, tituloId: 1 }),
    });
    expect(result).toMatchObject({ ok: false, motivo: "flag", message: MSG_VENDA_CONFIRMACAO_FLAG_INDISPONIVEL });
    expect(comercial).toBe(0);
  });

  it("I — consulta concluída escolhe só o caminho autorizado", () => {
    expect(estadoConsultaFlagConfirmacaoVenda({ isSuccess: true, data: false })).toEqual({
      estado: "pronta",
      modo: "comercial",
      integracaoAtiva: false,
    });
    expect(estadoConsultaFlagConfirmacaoVenda({ isSuccess: true, data: true })).toEqual({
      estado: "pronta",
      modo: "integrado",
      integracaoAtiva: true,
    });
    expect(estadoConsultaFlagConfirmacaoVenda({ isSuccess: true, data: "manutencao" })).toEqual({
      estado: "pronta",
      modo: "manutencao",
      integracaoAtiva: false,
    });
    expect(estadoConsultaFlagConfirmacaoVenda({ isSuccess: true, data: "desconhecido" })).toEqual({
      estado: "pendente",
    });
    expect(decidirFluxoConfirmacaoNovaVenda(false)).toBe("comercial");
    expect(decidirFluxoConfirmacaoNovaVenda(true)).toBe("integrado");
  });

  it("C — manutenção não chama comercial nem integrada", async () => {
    let comercial = 0;
    let integrada = 0;
    const result = await executarConfirmacaoNovaVenda({
      flag: { estado: "pronta", integracaoAtiva: false, modo: "manutencao" },
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 1 };
      },
      confirmarIntegrada: async () => {
        integrada += 1;
        return { vendaId: 1, tituloId: 1 };
      },
    });
    expect(result).toMatchObject({ ok: false, motivo: "flag", message: MSG_VENDA_CONFIRMACAO_MANUTENCAO });
    expect(comercial).toBe(0);
    expect(integrada).toBe(0);
  });

  it("J — CONFLICT de idempotência é definitivo, preserva chave e não cai no comercial", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    let comercial = 0;
    const uuids = ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "bbbbbbbb-cccc-dddd-eeee-ffffffffffff"];
    let nUuid = 0;
    const confirmar = () => executarConfirmacaoNovaVenda({
      flag: { estado: "pronta", integracaoAtiva: true },
      userId: 10,
      abaToken: "aba-1",
      comercial: comercialKg,
      rascunho: rascunhoVista(),
      storage,
      gerarUuid: () => uuids[nUuid++] ?? uuids[0]!,
      confirmarComercial: async () => {
        comercial += 1;
        return { vendaId: 99 };
      },
      confirmarIntegrada: async () => {
        throw Object.assign(new Error(MSG_VENDA_CONFLITO_IDEMPOTENCIA), { data: { code: "CONFLICT" } });
      },
    });
    const first = await confirmar();
    expect(first).toMatchObject({ ok: false, motivo: "negocio", message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    const depois = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(depois).toHaveLength(1);
    expect(depois[0]?.estado).toBe("erro_definitivo");
    expect(depois[0]?.idempotencyKey).toBe("ven-aaaaaaaabbbbccccddddeeeeeeeeeeee");
    const second = await confirmar();
    expect(second).toMatchObject({ ok: false, motivo: "negocio", message: MSG_VENDA_CONFLITO_IDEMPOTENCIA });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.idempotencyKey).toBe(depois[0]?.idempotencyKey);
    expect(comercial).toBe(0);
  });
});
