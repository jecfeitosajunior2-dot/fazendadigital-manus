import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validarChaveIdempotenciaVenda, type IntencaoConfirmacaoVendaFinanceiro } from "@shared/vendaFinanceiro";
import {
  INTEGRACAO_CONFIRMACAO_VENDA_ATIVA,
  MSG_VENDA_PENDENCIA_TRAVADA,
  MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO,
  PREFIXO_PENDENCIA_VENDA,
  PREFIXO_PENDENCIA_VENDA_V1,
  ROTULO_VERIFICAR_CONFIRMACAO,
  abaTokenPendenciaVenda,
  chaveArmazenamentoPendenciaVenda,
  chaveArmazenamentoPendenciaVendaTentativa,
  chaveArmazenamentoPendenciaVendaV1,
  criarArmazenamentoPendenciaVendaMemoria,
  criarCoordenacaoPendenciaVendaMemoria,
  criarCoordenacaoPendenciaVendaWebLocks,
  decidirChaveConfirmacaoVenda,
  gravarTentativaPendenciaVenda,
  listarTentativasPendenciaVenda,
  marcarConfirmacaoVendaConcluida,
  marcarErroDefinitivoConfirmacaoVenda,
  marcarTimeoutConfirmacaoVenda,
  migrarPendenciaVendaV1ParaV2,
  montarTentativaConfirmacaoVenda,
  nomeLockMigracaoPendenciaVenda,
  nomeLockPendenciaVenda,
  normalizarPendenciaVendaAposRecarregar,
  novaChaveIdempotenciaVenda,
  payloadDaTentativaVenda,
  prepararRetryConfirmacaoVenda,
  prepararVerificacaoConfirmacaoVenda,
  rascunhoCompativelComPendenciaVenda,
  tentarCoordenacaoPendenciaVenda,
  tentativasComResultadoDesconhecido,
  vendaRecusaDefinitiva,
  vendaResultadoDesconhecido,
  type TentativaConfirmacaoVenda,
} from "./novaVendaPendencia";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/NovaVendaPage.tsx"), "utf8");

function intencao(extra: Partial<IntencaoConfirmacaoVendaFinanceiro> = {}): IntencaoConfirmacaoVendaFinanceiro {
  return {
    fazendaId: 7,
    data: "2026-10-21",
    compradorId: 4,
    formaPrecificacao: "kg",
    precoPadrao: 20,
    observacoes: "Lote de desmama",
    itens: [
      { animalId: 11, pesoVenda: 300, precoUnitario: 20 },
      { animalId: 12, pesoVenda: 250, precoUnitario: 20 },
    ],
    condicao: "a_vista",
    ...extra,
  };
}

async function gravar(userId: number, storage: ReturnType<typeof criarArmazenamentoPendenciaVendaMemoria>, extra: Partial<IntencaoConfirmacaoVendaFinanceiro> = {}, estado = "pronto" as const, chave?: string) {
  const montada = montarTentativaConfirmacaoVenda({
    userId,
    idempotencyKey: chave ?? novaChaveIdempotenciaVenda(() => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"),
    intencao: intencao(extra),
    estado,
    abaToken: "aba-1",
    criadoEm: "2026-10-21T12:00:00.000Z",
  });
  expect(montada.ok).toBe(true);
  if (!montada.ok) throw new Error("tentativa inválida");
  const gravada = await gravarTentativaPendenciaVenda({ tentativa: montada.tentativa, storage });
  expect(gravada.ok).toBe(true);
  return montada.tentativa;
}

function criarWebLocksFake() {
  const ocupadas = new Set<string>();
  return {
    request: async (
      nome: string,
      opcoes: { ifAvailable: boolean; mode: "exclusive" },
      callback: (lock: { name: string } | null) => Promise<unknown> | unknown,
    ) => {
      if (ocupadas.has(nome)) {
        if (opcoes.ifAvailable) return callback(null);
      }
      ocupadas.add(nome);
      try {
        return await callback({ name: nome });
      } finally {
        ocupadas.delete(nome);
      }
    },
    ocupadas,
  };
}

describe("Nova Venda — pendência de confirmação", async () => {
  it("gera chave ven- com UUID, válida e estável na mesma intenção", async () => {
    const chave = novaChaveIdempotenciaVenda(() => "11111111-2222-3333-4444-555555555555");
    expect(chave).toBe("ven-11111111222233334444555555555555");
    expect(validarChaveIdempotenciaVenda(chave)).toEqual({ ok: true, key: chave });
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const primeira = decidirChaveConfirmacaoVenda({
      userId: 10,
      intencao: intencao(),
      gerarUuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      storage,
    });
    expect(primeira.ok).toBe(true);
    if (!primeira.ok) return;
    await gravar(10, storage, {}, "enviando", primeira.chave);
    const retry = decidirChaveConfirmacaoVenda({
      userId: 10,
      intencao: intencao(),
      chaveAtual: primeira.chave,
      gerarUuid: () => "ffffffffffffffffffffffffffffffff",
      storage,
    });
    expect(retry).toEqual({ ok: true, chave: primeira.chave, reutilizada: true });
  });

  it("persiste a intenção completa e reconstrói o mesmo payload no retry", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, { condicao: "definir_depois", parcelas: [] }, "desconhecido");
    expect(chaveArmazenamentoPendenciaVenda(10)).toBe(`${PREFIXO_PENDENCIA_VENDA_V1}:10`);
    expect(chaveArmazenamentoPendenciaVendaTentativa(10, tentativa.idempotencyKey))
      .toBe(`${PREFIXO_PENDENCIA_VENDA}:10:${tentativa.idempotencyKey}`);
    const lidas = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(lidas).toHaveLength(1);
    expect(lidas[0]?.intencao).toEqual(tentativa.intencao);
    expect(lidas[0]?.assinatura).toBe(tentativa.assinatura);
    const retry = prepararRetryConfirmacaoVenda({ tentativa, intencaoAtual: intencao({ condicao: "definir_depois", parcelas: [] }) });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.payload.idempotencyKey).toBe(tentativa.idempotencyKey);
    expect(retry.payload.compradorId).toBe(4);
    expect(retry.payload.itens).toEqual(tentativa.intencao.itens);
    expect(retry.payload.condicao).toBe("definir_depois");
  });

  it("bloqueia payload diferente na mesma chave com resultado desconhecido", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, {}, "desconhecido");
    const outra = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: tentativa.idempotencyKey,
      intencao: intencao({ compradorId: 9 }),
      estado: "desconhecido",
      abaToken: "aba-1",
    });
    expect(outra.ok).toBe(true);
    if (!outra.ok) return;
    expect(await gravarTentativaPendenciaVenda({ tentativa: outra.tentativa, storage })).toEqual({ ok: false, motivo: "travada" });
    expect(decidirChaveConfirmacaoVenda({
      userId: 10,
      intencao: intencao({ compradorId: 9 }),
      chaveAtual: tentativa.idempotencyKey,
      storage,
    })).toEqual({ ok: false, motivo: "travada" });
    expect(prepararRetryConfirmacaoVenda({
      tentativa,
      intencaoAtual: intencao({ itens: [{ animalId: 99, pesoVenda: 300, precoUnitario: 20 }] }),
    })).toEqual({ ok: false, motivo: "travada" });
    expect(MSG_VENDA_PENDENCIA_TRAVADA).toContain("travada");
  });

  it("preserva chave e payload no timeout e após recarregar", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, {}, "enviando");
    expect(vendaResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    expect(vendaResultadoDesconhecido({ codigo: "BAD_REQUEST" })).toBe(false);
    const aposTimeout = await marcarTimeoutConfirmacaoVenda({
      userId: 10,
      idempotencyKey: tentativa.idempotencyKey,
      storage,
    });
    expect(aposTimeout?.estado).toBe("desconhecido");
    expect(aposTimeout?.idempotencyKey).toBe(tentativa.idempotencyKey);
    expect(aposTimeout?.intencao).toEqual(tentativa.intencao);
    await gravar(10, storage, { observacoes: "segunda" }, "enviando", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    const aposReload = await normalizarPendenciaVendaAposRecarregar({ userId: 10, storage });
    expect(aposReload.every(t => t.estado !== "enviando")).toBe(true);
    expect(aposReload.map(t => t.idempotencyKey)).toContain(tentativa.idempotencyKey);
  });

  it("guarda duas tentativas distintas sem substituir a anterior", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const b = await gravar(10, storage, { compradorId: 8 }, "pronto", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    const lista = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(lista).toHaveLength(2);
    expect(lista.map(t => t.idempotencyKey).sort()).toEqual([a.idempotencyKey, b.idempotencyKey].sort());
  });

  it("isola tentativas por usuário e por aba", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    await gravar(10, storage, {}, "desconhecido");
    expect(listarTentativasPendenciaVenda({ userId: 11, storage })).toEqual([]);
    const sessaoA = criarArmazenamentoPendenciaVendaMemoria();
    const sessaoB = criarArmazenamentoPendenciaVendaMemoria();
    expect(abaTokenPendenciaVenda(sessaoA, () => "aba-a")).toBe("aba-a");
    expect(abaTokenPendenciaVenda(sessaoA, () => "aba-outra")).toBe("aba-a");
    expect(abaTokenPendenciaVenda(sessaoB, () => "aba-b")).toBe("aba-b");
    expect(chaveArmazenamentoPendenciaVenda(10)).not.toBe(chaveArmazenamentoPendenciaVenda(11));
  });

  it("limpa só a tentativa confirmada e preserva a desconhecida", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const ok = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const pendente = await gravar(10, storage, { compradorId: 8 }, "desconhecido", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: ok.idempotencyKey,
      vendaId: 0,
      tituloId: 3,
      storage,
    })).toEqual({ ok: false, motivo: "ids" });
    const limpa = await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: ok.idempotencyKey,
      vendaId: 88,
      tituloId: 3,
      storage,
    });
    expect(limpa.ok).toBe(true);
    if (!limpa.ok) return;
    expect(limpa.tentativas.map(t => t.idempotencyKey)).toEqual([pendente.idempotencyKey]);
    expect(rascunhoCompativelComPendenciaVenda(true)).toBe(true);
  });

  it("preserva tentativa após erro desconhecido e marca recusa definitiva à parte", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, {}, "enviando");
    expect(vendaResultadoDesconhecido({})).toBe(true);
    await marcarTimeoutConfirmacaoVenda({ userId: 10, idempotencyKey: tentativa.idempotencyKey, storage });
    expect(tentativasComResultadoDesconhecido(listarTentativasPendenciaVenda({ userId: 10, storage }))).toHaveLength(1);
    expect(vendaRecusaDefinitiva("BAD_REQUEST")).toBe(true);
    expect(vendaRecusaDefinitiva("CONFLICT")).toBe(true);
    expect(vendaResultadoDesconhecido({ codigo: "CONFLICT" })).toBe(false);
    expect((await marcarErroDefinitivoConfirmacaoVenda({
      userId: 10,
      idempotencyKey: tentativa.idempotencyKey,
      storage,
    }))?.estado).toBe("erro_definitivo");
  });

  it("prepara Verificar confirmação sem ativar a rota integrada", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, {}, "desconhecido");
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
    const verificacao = prepararVerificacaoConfirmacaoVenda({ tentativa });
    expect(verificacao.ok).toBe(false);
    expect(verificacao.motivo).toBe("integracao_desligada");
    expect(verificacao.rotulo).toBe(ROTULO_VERIFICAR_CONFIRMACAO);
    expect(verificacao.mensagem).toBe(MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO);
    expect(verificacao.payload).toEqual(payloadDaTentativaVenda(tentativa));
  });
});

describe("Nova Venda — isolamento da recuperação na tela", async () => {
  it("não chama a rota integrada e não faz retry da rota comercial antiga", async () => {
    expect(page).toContain("ROTULO_VERIFICAR_CONFIRMACAO");
    expect(page).toContain("PREFIXO_PENDENCIA_VENDA");
    expect(page).toContain("trpc.vendas.confirmar");
    expect(page).toContain("trpc.vendas.integracaoConfirmacaoAtiva");
    expect(page).not.toContain("confirmarVendaFinanceiro");
    expect(page).not.toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");
    const confirmar = page.slice(page.indexOf("const confirmar = async"), page.indexOf("const colSpan"));
    expect(confirmar).toContain("executarConfirmacaoNovaVenda");
    expect(confirmar).toContain("flag: flagConfirmacao");
    expect(confirmar).not.toContain("confirmarVendaFinanceiro");
  });
});

describe("Nova Venda — segurança da recuperação 3E.8C", async () => {
  const RASCUNHO = "fd_vendas_form_draft";

  function documentoV1(tentativas: TentativaConfirmacaoVenda[]): string {
    return JSON.stringify({
      versao: 1,
      userId: 10,
      tentativas,
    });
  }

  it("A — duas tentativas distintas usam chaves independentes", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const b = await gravar(10, storage, { compradorId: 8 }, "pronto", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(chaveArmazenamentoPendenciaVendaTentativa(10, a.idempotencyKey))
      .not.toBe(chaveArmazenamentoPendenciaVendaTentativa(10, b.idempotencyKey));
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, a.idempotencyKey))).toContain(a.idempotencyKey);
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, b.idempotencyKey))).toContain(b.idempotencyKey);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(2);
  });

  it("B — duas abas diferentes não apagam a tentativa uma da outra", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const sessaoA = criarArmazenamentoPendenciaVendaMemoria();
    const sessaoB = criarArmazenamentoPendenciaVendaMemoria();
    const abaA = abaTokenPendenciaVenda(sessaoA, () => "aba-a");
    const abaB = abaTokenPendenciaVenda(sessaoB, () => "aba-b");
    const tA = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      intencao: intencao(),
      estado: "desconhecido",
      abaToken: abaA,
    });
    const tB = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      intencao: intencao({ compradorId: 8 }),
      estado: "desconhecido",
      abaToken: abaB,
    });
    expect(tA.ok && tB.ok).toBe(true);
    if (!tA.ok || !tB.ok) return;
    expect((await gravarTentativaPendenciaVenda({ tentativa: tA.tentativa, storage })).ok).toBe(true);
    expect((await gravarTentativaPendenciaVenda({ tentativa: tB.tentativa, storage })).ok).toBe(true);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(2);
  });

  it("C — mesma tentativa em duas abas preserva chave, payload e estado desconhecido", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "desconhecido");
    const nome = nomeLockPendenciaVenda(10, original.idempotencyKey);
    const ocupadas = new Set([nome]);
    const coordB = criarCoordenacaoPendenciaVendaMemoria(ocupadas);
    const segundaAba = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: original.intencao,
      estado: "enviando",
      abaToken: "aba-2",
    });
    expect(segundaAba.ok).toBe(true);
    if (!segundaAba.ok) return;
    const gravada = await gravarTentativaPendenciaVenda({
      tentativa: segundaAba.tentativa,
      storage,
      coordenacao: coordB,
    });
    expect(gravada).toEqual({ ok: false, motivo: "outra_aba" });
    const lida = listarTentativasPendenciaVenda({ userId: 10, storage })[0]!;
    expect(lida.idempotencyKey).toBe(original.idempotencyKey);
    expect(lida.intencao).toEqual(original.intencao);
    expect(lida.assinatura).toBe(original.assinatura);
    expect(lida.estado).toBe("desconhecido");
    expect(lida.abaToken).toBe("aba-1");
  });

  it("D — limpeza seletiva remove só a tentativa confirmada", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const ok = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const pendente = await gravar(10, storage, { compradorId: 8 }, "desconhecido", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, ok.idempotencyKey))).toBeTruthy();
    const limpa = await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: ok.idempotencyKey,
      vendaId: 88,
      tituloId: 3,
      storage,
    });
    expect(limpa.ok).toBe(true);
    if (!limpa.ok) return;
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, ok.idempotencyKey))).toBeNull();
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, pendente.idempotencyKey))).toBeTruthy();
    expect(limpa.tentativas.map(t => t.idempotencyKey)).toEqual([pendente.idempotencyKey]);
  });

  it("E — isolamento por usuário", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    await gravar(10, storage, {}, "desconhecido");
    expect(listarTentativasPendenciaVenda({ userId: 11, storage })).toEqual([]);
    expect(chaveArmazenamentoPendenciaVendaTentativa(10, "ven-aa")).not.toBe(chaveArmazenamentoPendenciaVendaTentativa(11, "ven-aa"));
  });

  it("F — migração v1 → v2 preserva tentativas, chaves e assinatura", async () => {
    const a = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      intencao: intencao(),
      estado: "desconhecido",
      abaToken: "aba-1",
      criadoEm: "2026-10-21T12:00:00.000Z",
    });
    const b = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      intencao: intencao({ compradorId: 8 }),
      estado: "enviando",
      abaToken: "aba-1",
      criadoEm: "2026-10-21T12:01:00.000Z",
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const storage = criarArmazenamentoPendenciaVendaMemoria({
      [chaveArmazenamentoPendenciaVendaV1(10)]: documentoV1([a.tentativa, b.tentativa]),
    });
    const assinaturaA = a.tentativa.assinatura;
    const migracao = await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    expect(migracao.migradas).toBe(2);
    expect(migracao.v1Removido).toBe(true);
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaV1(10))).toBeNull();
    const lista = listarTentativasPendenciaVenda({ userId: 10, storage });
    expect(lista).toHaveLength(2);
    expect(lista.map(t => t.idempotencyKey).sort()).toEqual([a.tentativa.idempotencyKey, b.tentativa.idempotencyKey].sort());
    expect(lista.find(t => t.idempotencyKey === a.tentativa.idempotencyKey)?.assinatura).toBe(assinaturaA);
    expect(lista.find(t => t.idempotencyKey === a.tentativa.idempotencyKey)?.intencao).toEqual(a.tentativa.intencao);
    expect(lista.find(t => t.idempotencyKey === b.tentativa.idempotencyKey)?.estado).toBe("enviando");
  });

  it("G — migração repetida é idempotente e não gera nova chave ven-", async () => {
    const montada = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      intencao: intencao(),
      estado: "desconhecido",
      abaToken: "aba-1",
      criadoEm: "2026-10-21T12:00:00.000Z",
    });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    const storage = criarArmazenamentoPendenciaVendaMemoria({
      [chaveArmazenamentoPendenciaVendaV1(10)]: documentoV1([montada.tentativa]),
    });
    const primeira = await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    const segunda = await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    expect(primeira.migradas).toBe(1);
    expect(segunda.migradas).toBe(0);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(1);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.idempotencyKey).toBe(montada.tentativa.idempotencyKey);
  });

  it("H — conflito v1 × v2 não sobrescreve tentativa v2 desconhecida", async () => {
    const chave = novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const v2 = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: chave,
      intencao: intencao(),
      estado: "desconhecido",
      abaToken: "aba-v2",
      criadoEm: "2026-10-22T12:00:00.000Z",
    });
    const v1 = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: chave,
      intencao: intencao({ compradorId: 9 }),
      estado: "pronto",
      abaToken: "aba-v1",
      criadoEm: "2026-10-21T12:00:00.000Z",
    });
    expect(v1.ok && v2.ok).toBe(true);
    if (!v1.ok || !v2.ok) return;
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    storage.setItem(chaveArmazenamentoPendenciaVendaTentativa(10, chave), JSON.stringify({
      versao: 2,
      ...v2.tentativa,
    }));
    storage.setItem(chaveArmazenamentoPendenciaVendaV1(10), documentoV1([v1.tentativa]));
    const migracao = await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    expect(migracao.preservadas).toBe(1);
    expect(migracao.v1Removido).toBe(true);
    const lida = listarTentativasPendenciaVenda({ userId: 10, storage })[0]!;
    expect(lida.estado).toBe("desconhecido");
    expect(lida.abaToken).toBe("aba-v2");
    expect(lida.intencao).toEqual(v2.tentativa.intencao);
    expect(lida.assinatura).toBe(v2.tentativa.assinatura);
  });

  it("I — timeout marca desconhecido sem apagar outras tentativas", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "enviando", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const b = await gravar(10, storage, { compradorId: 8 }, "desconhecido", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(vendaResultadoDesconhecido({ codigo: "TIMEOUT" })).toBe(true);
    const apos = await marcarTimeoutConfirmacaoVenda({ userId: 10, idempotencyKey: a.idempotencyKey, storage });
    expect(apos?.estado).toBe("desconhecido");
    expect(apos?.idempotencyKey).toBe(a.idempotencyKey);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage }).map(t => t.idempotencyKey).sort())
      .toEqual([a.idempotencyKey, b.idempotencyKey].sort());
  });

  it("J — recarregar converte enviando em desconhecido e preserva o restante", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "enviando", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    await gravar(10, storage, { compradorId: 8 }, "pronto", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    const apos = await normalizarPendenciaVendaAposRecarregar({ userId: 10, storage });
    expect(apos.find(t => t.idempotencyKey === a.idempotencyKey)?.estado).toBe("desconhecido");
    expect(apos.every(t => t.estado !== "enviando")).toBe(true);
    expect(apos).toHaveLength(2);
  });

  it("K — resultado desconhecido permanece listável e não é apagado na limpeza de outra chave", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const desconhecida = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const outra = await gravar(10, storage, { compradorId: 8 }, "pronto", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: outra.idempotencyKey,
      vendaId: 7,
      tituloId: 9,
      storage,
    });
    expect(tentativasComResultadoDesconhecido(listarTentativasPendenciaVenda({ userId: 10, storage })).map(t => t.idempotencyKey))
      .toEqual([desconhecida.idempotencyKey]);
  });

  it("L — payload diferente na mesma chave com resultado desconhecido continua travado", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const tentativa = await gravar(10, storage, {}, "desconhecido");
    const outra = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: tentativa.idempotencyKey,
      intencao: intencao({ compradorId: 9 }),
      estado: "desconhecido",
      abaToken: "aba-2",
    });
    expect(outra.ok).toBe(true);
    if (!outra.ok) return;
    expect(await gravarTentativaPendenciaVenda({ tentativa: outra.tentativa, storage })).toEqual({ ok: false, motivo: "travada" });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.intencao).toEqual(tentativa.intencao);
  });

  it("M — assinatura canônica sobrevive à migração e à gravação v2", async () => {
    const montada = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      intencao: intencao({ condicao: "definir_depois", parcelas: [] }),
      estado: "desconhecido",
      abaToken: "aba-1",
      criadoEm: "2026-10-21T12:00:00.000Z",
    });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    const assinatura = montada.tentativa.assinatura;
    const storage = criarArmazenamentoPendenciaVendaMemoria({
      [chaveArmazenamentoPendenciaVendaV1(10)]: documentoV1([montada.tentativa]),
    });
    await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    const lida = listarTentativasPendenciaVenda({ userId: 10, storage })[0]!;
    expect(lida.assinatura).toBe(assinatura);
    expect(lida.intencao.condicao).toBe("definir_depois");
  });

  it("N — rascunho comercial fd_vendas_form_draft permanece intacto", async () => {
    const rascunho = JSON.stringify({ fazendaId: "7", observacoes: "não mexer" });
    const storage = criarArmazenamentoPendenciaVendaMemoria({ [RASCUNHO]: rascunho });
    await gravar(10, storage, {}, "desconhecido");
    await normalizarPendenciaVendaAposRecarregar({ userId: 10, storage });
    await marcarTimeoutConfirmacaoVenda({
      userId: 10,
      idempotencyKey: listarTentativasPendenciaVenda({ userId: 10, storage })[0]!.idempotencyKey,
      storage,
    });
    expect(storage.getItem(RASCUNHO)).toBe(rascunho);
    expect(rascunhoCompativelComPendenciaVenda(true)).toBe(true);
    expect(page).toContain(RASCUNHO);
  });

  it("O — nenhuma chamada à rota integrada", async () => {
    const lib = readFileSync(resolve(here, "./novaVendaPendencia.ts"), "utf8");
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
    expect(lib).not.toContain("confirmarVendaFinanceiro");
    expect(lib).not.toContain("trpc.vendas.confirmar");
    expect(lib).not.toContain("vendas.cancelar");
    expect(page).not.toContain("confirmarVendaFinanceiro");
    expect(page).toContain("trpc.vendas.confirmar");
    expect(page).toContain("trpc.vendas.integracaoConfirmacaoAtiva");
    expect(page).not.toContain("INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = true");
  });
});

describe("Nova Venda — Web Locks 3E.8I", () => {
  it("A — duas abas criam tentativas distintas", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const coord = criarCoordenacaoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "pronto", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const b = await gravar(10, storage, { compradorId: 8 }, "pronto", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })).toHaveLength(2);
    expect(nomeLockPendenciaVenda(10, a.idempotencyKey)).not.toBe(nomeLockPendenciaVenda(10, b.idempotencyKey));
    expect(coord).toBeTruthy();
  });

  it("B — duas abas atualizando a mesma tentativa: a segunda não escreve", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "desconhecido");
    const ocupadas = new Set<string>();
    const coord = criarCoordenacaoPendenciaVendaMemoria(ocupadas);
    let liberar!: () => void;
    const hold = new Promise<void>(resolve => { liberar = resolve; });
    const primeira = coord.executarExclusivo(nomeLockPendenciaVenda(10, original.idempotencyKey), () => hold);
    const segunda = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: original.intencao,
      estado: "enviando",
      abaToken: "aba-2",
    });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) return;
    const gravada = await gravarTentativaPendenciaVenda({
      tentativa: segunda.tentativa,
      storage,
      coordenacao: coord,
    });
    expect(gravada).toEqual({ ok: false, motivo: "outra_aba" });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.estado).toBe("desconhecido");
    liberar();
    await primeira;
  });

  it("C — duas abas tentando remover a mesma tentativa", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "desconhecido");
    const ocupadas = new Set([nomeLockPendenciaVenda(10, original.idempotencyKey)]);
    const coord = criarCoordenacaoPendenciaVendaMemoria(ocupadas);
    const recusada = await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      vendaId: 88,
      tituloId: 3,
      storage,
      coordenacao: coord,
    });
    expect(recusada).toEqual({ ok: false, motivo: "outra_aba" });
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(10, original.idempotencyKey))).toBeTruthy();
  });

  it("D — aba com estado desconhecido não perde payload", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "desconhecido");
    const outra = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: intencao({ compradorId: 9 }),
      estado: "enviando",
      abaToken: "aba-2",
    });
    expect(outra.ok).toBe(true);
    if (!outra.ok) return;
    expect(await gravarTentativaPendenciaVenda({ tentativa: outra.tentativa, storage }))
      .toEqual({ ok: false, motivo: "travada" });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.intencao).toEqual(original.intencao);
  });

  it("E — operação em andamento recusa a segunda escrita", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "enviando");
    const ocupadas = new Set<string>();
    const coord = criarCoordenacaoPendenciaVendaMemoria(ocupadas);
    let liberar!: () => void;
    const hold = new Promise<void>(resolve => { liberar = resolve; });
    const emAndamento = coord.executarExclusivo(nomeLockPendenciaVenda(10, original.idempotencyKey), () => hold);
    const timeout = await marcarTimeoutConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      storage,
      coordenacao: coord,
    });
    expect(timeout).toBeNull();
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.estado).toBe("enviando");
    liberar();
    await emAndamento;
  });

  it("F — lock indisponível não realiza escrita insegura", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "pronto");
    const locks = criarWebLocksFake();
    locks.ocupadas.add(nomeLockPendenciaVenda(10, original.idempotencyKey));
    const coord = criarCoordenacaoPendenciaVendaWebLocks(locks);
    const proxima = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: original.intencao,
      estado: "enviando",
      abaToken: "aba-2",
    });
    expect(proxima.ok).toBe(true);
    if (!proxima.ok) return;
    expect(await gravarTentativaPendenciaVenda({
      tentativa: proxima.tentativa,
      storage,
      coordenacao: coord,
    })).toEqual({ ok: false, motivo: "outra_aba" });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.estado).toBe("pronto");
  });

  it("G — falha durante a escrita libera o lock e não marca sucesso", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const original = await gravar(10, storage, {}, "pronto");
    const quebra = {
      ...storage,
      setItem(chave: string, valor: string) {
        if (chave.includes(original.idempotencyKey) && valor.includes("enviando")) {
          throw new Error("falha forçada na escrita");
        }
        storage.setItem(chave, valor);
      },
    };
    const proxima = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: original.intencao,
      estado: "enviando",
      abaToken: "aba-1",
    });
    expect(proxima.ok).toBe(true);
    if (!proxima.ok) return;
    await expect(gravarTentativaPendenciaVenda({ tentativa: proxima.tentativa, storage: quebra }))
      .rejects.toThrow("falha forçada na escrita");
    const depois = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: original.idempotencyKey,
      intencao: original.intencao,
      estado: "desconhecido",
      abaToken: "aba-1",
    });
    expect(depois.ok).toBe(true);
    if (!depois.ok) return;
    expect((await gravarTentativaPendenciaVenda({ tentativa: depois.tentativa, storage })).ok).toBe(true);
  });

  it("H — recarregamento converte enviando sob lock", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const a = await gravar(10, storage, {}, "enviando", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const apos = await normalizarPendenciaVendaAposRecarregar({ userId: 10, storage });
    expect(apos.find(t => t.idempotencyKey === a.idempotencyKey)?.estado).toBe("desconhecido");
  });

  it("I — migração v1 → v2 sob lock de migração", async () => {
    const montada = montarTentativaConfirmacaoVenda({
      userId: 10,
      idempotencyKey: novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      intencao: intencao(),
      estado: "desconhecido",
      abaToken: "aba-1",
      criadoEm: "2026-10-21T12:00:00.000Z",
    });
    expect(montada.ok).toBe(true);
    if (!montada.ok) return;
    const storage = criarArmazenamentoPendenciaVendaMemoria({
      [chaveArmazenamentoPendenciaVendaV1(10)]: JSON.stringify({
        versao: 1,
        userId: 10,
        tentativas: [montada.tentativa],
      }),
    });
    const ocupadas = new Set([nomeLockMigracaoPendenciaVenda(10)]);
    const recusada = await migrarPendenciaVendaV1ParaV2({
      userId: 10,
      storage,
      coordenacao: criarCoordenacaoPendenciaVendaMemoria(ocupadas),
    });
    expect(recusada.recusada).toBe(true);
    expect(storage.getItem(chaveArmazenamentoPendenciaVendaV1(10))).toBeTruthy();
    const ok = await migrarPendenciaVendaV1ParaV2({ userId: 10, storage });
    expect(ok.migradas).toBe(1);
    expect(ok.v1Removido).toBe(true);
  });

  it("J — limpeza seletiva", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const ok = await gravar(10, storage, {}, "desconhecido", novaChaveIdempotenciaVenda(() => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    const pendente = await gravar(10, storage, { compradorId: 8 }, "desconhecido", novaChaveIdempotenciaVenda(() => "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
    await marcarConfirmacaoVendaConcluida({
      userId: 10,
      idempotencyKey: ok.idempotencyKey,
      vendaId: 1,
      tituloId: 2,
      storage,
    });
    expect(listarTentativasPendenciaVenda({ userId: 10, storage }).map(t => t.idempotencyKey))
      .toEqual([pendente.idempotencyKey]);
  });

  it("K — isolamento por usuário no nome do lock", async () => {
    expect(nomeLockPendenciaVenda(10, "ven-aa")).not.toBe(nomeLockPendenciaVenda(11, "ven-aa"));
    expect(nomeLockMigracaoPendenciaVenda(10)).not.toBe(nomeLockMigracaoPendenciaVenda(11));
  });

  it("L — preserva chave ven-", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const t = await gravar(10, storage, {}, "desconhecido");
    expect(t.idempotencyKey.startsWith("ven-")).toBe(true);
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.idempotencyKey).toBe(t.idempotencyKey);
  });

  it("M — preserva payload", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const t = await gravar(10, storage, { observacoes: "lote especial" }, "desconhecido");
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.intencao.observacoes).toBe("lote especial");
    expect(t.intencao.observacoes).toBe("lote especial");
  });

  it("N — preserva assinatura", async () => {
    const storage = criarArmazenamentoPendenciaVendaMemoria();
    const t = await gravar(10, storage, {}, "desconhecido");
    expect(listarTentativasPendenciaVenda({ userId: 10, storage })[0]?.assinatura).toBe(t.assinatura);
  });

  it("O — nenhuma chamada à rota integrada e Web Locks sem void", async () => {
    const lib = readFileSync(resolve(here, "./novaVendaPendencia.ts"), "utf8");
    expect(INTEGRACAO_CONFIRMACAO_VENDA_ATIVA).toBe(false);
    expect(lib).not.toContain("void webLocks");
    expect(lib).not.toContain("confirmarVendaFinanceiro");
    expect(page).toContain("await normalizarPendenciaVendaAposRecarregar");
    expect(page).toContain("trpc.vendas.confirmar");
  });

  it("limitação — não há infraestrutura de duas abas Chromium reais neste repositório", async () => {
    const pkg = readFileSync(resolve(here, "../../../package.json"), "utf8");
    expect(pkg).not.toContain("playwright");
    expect(pkg).not.toContain("puppeteer");
    expect(criarWebLocksFake().request).toBeTypeOf("function");
  });
});

