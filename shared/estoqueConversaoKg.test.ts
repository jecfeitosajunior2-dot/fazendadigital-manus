import { describe, expect, it } from "vitest";
import {
  custoEstoqueParaCustoKg,
  kgParaQuantidadeEstoque,
  mensagemConversaoKg,
  montarSnapshotConversaoKg,
  MSG_CONVERSAO_KG_AMBIGUA,
  MSG_CONVERSAO_KG_DIMENSAO,
  MSG_CONVERSAO_KG_INDISPONIVEL,
  MSG_CONVERSAO_KG_INVALIDA,
  quantidadeEstoqueDoSnapshot,
  quantidadeEstoqueParaKg,
  resolverConversaoParaKg,
} from "./estoqueConversaoKg";

const saco30 = [{ nome: "Saco", volume: 30, unidade: "kg" }];
const saco25 = [{ nome: "Saco", volume: 25, unidade: "kg" }];
const saco30g = [{ nome: "Saco", volume: 30000, unidade: "g" }];
const saco20L = [{ nome: "Saco", volume: 20, unidade: "L" }];
const saco500ml = [{ nome: "Saco", volume: 500, unidade: "ml" }];
const semQtd = [{ nome: "Saco", unidade: "kg" }];
const qtdZero = [{ nome: "Saco", volume: 0, unidade: "kg" }];
const duasMassas = [
  { nome: "Saco 25 kg", volume: 25, unidade: "kg" },
  { nome: "Saco 30 kg", volume: 30, unidade: "kg" },
];

describe("quantidadeEstoqueParaKg", () => {
  it("1: 10 sc × 30 kg/sc = 300 kg", () => {
    expect(quantidadeEstoqueParaKg(10, "sc", saco30)).toBe(300);
  });

  it("2: 10 sc × 25 kg/sc = 250 kg", () => {
    expect(quantidadeEstoqueParaKg(10, "sc", saco25)).toBe(250);
  });

  it("7: kg continua 1:1", () => {
    expect(quantidadeEstoqueParaKg(45, "kg")).toBe(45);
    expect(resolverConversaoParaKg("kg").ok).toBe(true);
  });

  it("8: g continua convertendo para kg", () => {
    expect(quantidadeEstoqueParaKg(1000, "g")).toBe(1);
    expect(quantidadeEstoqueParaKg(500, "Grama")).toBe(0.5);
  });

  it("4 via g: saco de 30000 g equivale a 30 kg/sc", () => {
    expect(quantidadeEstoqueParaKg(10, "sc", saco30g)).toBe(300);
  });

  it("JSON real do Sal Nitrogenado: 10 sc × 30 kg = 300 kg", () => {
    const jsonReal = '[{"nome":"Saco (sc) de 30 Quilograma (kg)","volume":30,"unidade":"kg"}]';
    expect(quantidadeEstoqueParaKg(10, "sc", jsonReal)).toBe(300);
    expect(kgParaQuantidadeEstoque(45, "sc", jsonReal)).toBe(1.5);
  });
});

describe("kgParaQuantidadeEstoque", () => {
  it("3: 45 kg / 30 kg/sc = 1,5 sc (não vira 2)", () => {
    expect(kgParaQuantidadeEstoque(45, "sc", saco30)).toBe(1.5);
  });

  it("4: 45 kg / 25 kg/sc = 1,8 sc", () => {
    expect(kgParaQuantidadeEstoque(45, "sc", saco25)).toBe(1.8);
  });

  it("16: 1,5 sc não é arredondado para 2", () => {
    const qtd = kgParaQuantidadeEstoque(45, "sc", saco30);
    expect(qtd).toBe(1.5);
    expect(Number.isInteger(qtd)).toBe(false);
  });
});

describe("custoEstoqueParaCustoKg", () => {
  it("5: R$ 90/sc / 30 = R$ 3/kg", () => {
    expect(custoEstoqueParaCustoKg(90, "sc", saco30)).toBe(3);
  });

  it("6: R$ 100/sc / 25 = R$ 4/kg", () => {
    expect(custoEstoqueParaCustoKg(100, "sc", saco25)).toBe(4);
  });

  it("não inventa custo zero quando conversão falha", () => {
    expect(custoEstoqueParaCustoKg(90, "sc")).toBeNull();
  });
});

describe("bloqueios do resolvedor", () => {
  it("9: sc sem embalagem — indisponível", () => {
    const r = resolverConversaoParaKg("sc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
    expect(quantidadeEstoqueParaKg(10, "sc")).toBeNull();
    expect(mensagemConversaoKg(r)).toBe(MSG_CONVERSAO_KG_INDISPONIVEL);
  });

  it("10: sc com embalagem sem quantidade — indisponível", () => {
    const r = resolverConversaoParaKg("sc", semQtd);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("indisponivel");
  });

  it("11: sc com quantidade zero — inválida", () => {
    const r = resolverConversaoParaKg("sc", qtdZero);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("invalida");
    expect(mensagemConversaoKg(r)).toBe(MSG_CONVERSAO_KG_INVALIDA);
  });

  it("12: sc contendo L — não converte para kg", () => {
    const r = resolverConversaoParaKg("sc", saco20L);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("dimensao");
    expect(mensagemConversaoKg(r)).toBe(MSG_CONVERSAO_KG_DIMENSAO);
  });

  it("13: sc contendo ml — não converte para kg", () => {
    const r = resolverConversaoParaKg("sc", saco500ml);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("dimensao");
  });

  it("14: kg ↔ L não converter", () => {
    expect(resolverConversaoParaKg("L").ok).toBe(false);
    expect(resolverConversaoParaKg("ml").ok).toBe(false);
    expect(quantidadeEstoqueParaKg(10, "L", [{ nome: "Galão", volume: 20, unidade: "L" }])).toBeNull();
    expect(kgParaQuantidadeEstoque(10, "L")).toBeNull();
  });

  it("15: duas embalagens de massa diferentes — ambígua", () => {
    const r = resolverConversaoParaKg("sc", duasMassas);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("ambigua");
    expect(quantidadeEstoqueParaKg(10, "sc", duasMassas)).toBeNull();
    expect(mensagemConversaoKg(r)).toBe(MSG_CONVERSAO_KG_AMBIGUA);
  });

  it("uma massa + uma volume: usa só a massa", () => {
    const r = resolverConversaoParaKg("sc", [
      { nome: "Saco", volume: 30, unidade: "kg" },
      { nome: "Galão", volume: 20, unidade: "L" },
    ]);
    expect(r).toMatchObject({ ok: true, kgPorUnidadeEstoque: 30 });
  });
});

describe("snapshot histórico", () => {
  it("congela 30 kg/sc mesmo se o cadastro depois for 25", () => {
    const snap = montarSnapshotConversaoKg({
      quantidadeEstoque: -1.5,
      unidadeEstoque: "sc",
      embalagens: saco30,
    });
    expect(snap).toMatchObject({
      unidadeEstoqueSnapshot: "sc",
      conteudoPorUnidadeSnapshot: 30,
      unidadeConteudoSnapshot: "kg",
      quantidadeFisicaSnapshot: -45,
      unidadeFisicaSnapshot: "kg",
    });

    const cadastroDepois = saco25;
    const hoje = resolverConversaoParaKg("sc", cadastroDepois);
    expect(hoje.ok && hoje.kgPorUnidadeEstoque).toBe(25);
    expect(snap?.conteudoPorUnidadeSnapshot).toBe(30);
    expect(snap?.quantidadeFisicaSnapshot).toBe(-45);
    expect(quantidadeEstoqueDoSnapshot(-1.5)).toBe(1.5);
  });
});
