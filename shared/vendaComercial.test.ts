import { describe, expect, it } from "vitest";
import {
  aplicarPadraoEmLinhas,
  arredondarMoeda,
  avaliarInclusaoAnimalVenda,
  calcularArrobas,
  calcularPesoCarcacaKg,
  calcularPesoCarne,
  calcularValorItem,
  escolherAlvoPesoBalanca,
  pesoBalancaVendaNaIdentificacao,
  estadoAnimalAtualVenda,
  mensagemAnimaisIndisponiveis,
  anexarItensVendaNaOrdemDaLida,
  ordenarItensVendaPorBrinco,
  MSG_VENDA_ANIMAL_DUPLICADO,
  MSG_VENDA_PESO_OBRIGATORIO,
  MSG_VENDA_RFID_NAO_ENCONTRADO,
  MSG_VENDA_RFID_SEM_FAZENDA,
  MSG_VENDA_RENDIMENTO_INVALIDO,
  MSG_VENDA_RENDIMENTO_OBRIGATORIO,
  parsePesoVenda,
  parseRendimentoCarcaca,
  resumirItensVenda,
} from "./vendaComercial";

describe("vendaComercial", () => {
  it("visor 7.5 entra no cálculo como 7,5 kg — não vira 8", () => {
    expect(parsePesoVenda("7.5")).toBe(7.5);
    expect(parsePesoVenda("7,50")).toBe(7.5);
    const item = calcularValorItem({ forma: "kg", pesoVenda: "7.5", precoUnitario: 10.25 });
    expect(item).toMatchObject({ ok: true, valor: 76.88, pesoVivo: 7.5 });
    expect(resumirItensVenda([{ pesoVenda: 7.5, valorItem: 76.88 }]).pesoTotal).toBe(7.5);
  });

  it("calcula R$/kg com arredondamento monetário (teste E: 391 × 20,50 = 8.015,50)", () => {
    expect(calcularValorItem({ forma: "kg", pesoVenda: 391, precoUnitario: 20.5 })).toMatchObject({
      ok: true,
      valor: 8015.5,
      pesoCobrado: 391,
      pesoVivo: 391,
    });
  });

  it("calcula R$/cabeça ignorando peso (teste F)", () => {
    expect(calcularValorItem({ forma: "cabeca", pesoVenda: 400, precoUnitario: 3000 })).toMatchObject({
      ok: true,
      valor: 3000,
      pesoCobrado: 400,
      pesoVivo: 400,
    });
  });

  it("exige peso em R$/kg", () => {
    expect(calcularValorItem({ forma: "kg", pesoVenda: null, precoUnitario: 20 })).toEqual({
      ok: false,
      message: MSG_VENDA_PESO_OBRIGATORIO,
    });
  });

  it("soma quantidade, peso e valor dos itens (teste G)", () => {
    const resumo = resumirItensVenda([
      { pesoVenda: 391, valorItem: 8015.5 },
      { pesoVenda: 300, valorItem: 3000 },
    ]);
    expect(resumo.quantidade).toBe(2);
    expect(resumo.pesoTotal).toBe(691);
    expect(resumo.valorTotal).toBe(11015.5);
    expect(resumo.precoMedioKg).toBe(arredondarMoeda(11015.5 / 691));
  });

  it("não inventa peso quando nenhum item tem peso", () => {
    expect(resumirItensVenda([{ valorItem: 3000 }]).pesoTotal).toBeNull();
  });

  it("expõe mensagem de duplicidade para a UI", () => {
    expect(MSG_VENDA_ANIMAL_DUPLICADO).toBe("Este animal já está incluído nesta Venda.");
  });

  it("R$/kg vivo ignora rendimento — peso × preço/kg", () => {
    expect(parseRendimentoCarcaca("")).toEqual({ ok: true, valor: null });
    expect(parseRendimentoCarcaca("52")).toEqual({ ok: true, valor: 52 });
    expect(parseRendimentoCarcaca("0")).toEqual({ ok: false, message: MSG_VENDA_RENDIMENTO_INVALIDO });
    expect(calcularPesoCarne(100, null)).toBe(100);
    expect(calcularPesoCarne(100, 52)).toBe(52);
    expect(calcularValorItem({
      forma: "kg",
      pesoVenda: 100,
      precoUnitario: 20.5,
      rendimentoCarcaca: 52,
    })).toMatchObject({ ok: true, valor: 2050, pesoCobrado: 100, pesoVivo: 100 });
  });

  it("lista brincos na concorrência", () => {
    expect(mensagemAnimaisIndisponiveis(["10", "28"])).toBe(
      "Os animais 10, 28 não estão mais disponíveis para Venda.",
    );
  });

  it("RFID exige Fazenda antes de localizar o animal", () => {
    expect(avaliarInclusaoAnimalVenda({ animal: null, fazendaId: 0, idsNaVenda: [] })).toEqual({
      ok: false,
      message: MSG_VENDA_RFID_SEM_FAZENDA,
    });
  });

  it("RFID desconhecido não entra na Venda", () => {
    expect(avaliarInclusaoAnimalVenda({ animal: null, fazendaId: 1, idsNaVenda: [] })).toEqual({
      ok: false,
      message: MSG_VENDA_RFID_NAO_ENCONTRADO,
    });
  });

  it("RFID de outra Fazenda é bloqueado", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 2, fazendaNome: "Fazenda B", status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({
      ok: false,
      message: "O animal 255 pertence à Fazenda B.",
    });
  });

  it("RFID de animal inativo é bloqueado com o status", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "vendido" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({
      ok: false,
      message: "O animal 255 não está disponível para Venda.",
      detalhe: "Status atual: Vendido.",
    });
  });

  it("RFID duplicado na mesma Venda é bloqueado", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [9],
    })).toEqual({
      ok: false,
      message: "O animal 255 já está incluído nesta Venda.",
    });
  });

  it("leituras contínuas: A e B entram; B de novo, inexistente e bloqueado não entram", () => {
    const ids: number[] = [];
    const incluir = (animal: Parameters<typeof avaliarInclusaoAnimalVenda>[0]["animal"]) =>
      avaliarInclusaoAnimalVenda({ animal, fazendaId: 1, idsNaVenda: ids });

    const a = incluir({ id: 1, brinco: "A", fazendaId: 1, status: "ativo" });
    expect(a).toEqual({ ok: true, brinco: "A" });
    ids.push(1);

    const b = incluir({ id: 2, brinco: "B", fazendaId: 1, status: "ativo" });
    expect(b).toEqual({ ok: true, brinco: "B" });
    ids.push(2);

    expect(incluir({ id: 2, brinco: "B", fazendaId: 1, status: "ativo" }).ok).toBe(false);
    expect(incluir(null).ok).toBe(false);
    expect(
      incluir({ id: 3, brinco: "C", fazendaId: 1, status: "vendido" }),
    ).toMatchObject({ ok: false, detalhe: "Status atual: Vendido." });
  });

  it("RFID válido da mesma Fazenda é aceito", () => {
    expect(avaliarInclusaoAnimalVenda({
      animal: { id: 9, brinco: "255", fazendaId: 1, status: "ativo" },
      fazendaId: 1,
      idsNaVenda: [],
    })).toEqual({ ok: true, brinco: "255" });
  });
});

describe("vendaComercial — modalidades e exceções", () => {
  it("cenário A — R$/kg vivo, 2 animais, mesmo preço, pesos diferentes", () => {
    const a = calcularValorItem({ forma: "kg", pesoVenda: 350, precoUnitario: 10.25 });
    const b = calcularValorItem({ forma: "kg", pesoVenda: 400, precoUnitario: 10.25 });
    expect(a).toMatchObject({ ok: true, valor: 3587.5 });
    expect(b).toMatchObject({ ok: true, valor: 4100 });
    const resumo = resumirItensVenda(
      [
        { pesoVenda: 350, valorItem: 3587.5 },
        { pesoVenda: 400, valorItem: 4100 },
      ],
      { forma: "kg" },
    );
    expect(resumo.pesoTotal).toBe(750);
    expect(resumo.valorTotal).toBe(7687.5);
    expect(resumo.precoMedioKg).toBe(10.25);
  });

  it("cenário B — R$/kg vivo com preço individual", () => {
    const padrao = calcularValorItem({ forma: "kg", pesoVenda: 350, precoUnitario: 10.25 });
    const individual = calcularValorItem({ forma: "kg", pesoVenda: 350, precoUnitario: 9.8 });
    expect(padrao).toMatchObject({ ok: true, valor: 3587.5 });
    expect(individual).toMatchObject({ ok: true, valor: 3430 });
  });

  it("cenário C — R$/cabeça com valor padrão", () => {
    expect(calcularValorItem({ forma: "cabeca", pesoVenda: 350, precoUnitario: 3500 })).toMatchObject({
      ok: true,
      valor: 3500,
    });
  });

  it("cenário D — R$/cabeça com valor individual", () => {
    expect(calcularValorItem({ forma: "cabeca", precoUnitario: 3200 })).toMatchObject({
      ok: true,
      valor: 3200,
    });
  });

  it("média/@ usa as arrobas de cada animal, não um rendimento único", () => {
    const a = calcularValorItem({
      forma: "arroba",
      pesoVenda: 350,
      precoUnitario: 311.16,
      rendimentoCarcaca: 50,
    });
    const b = calcularValorItem({
      forma: "arroba",
      pesoVenda: 350,
      precoUnitario: 311.16,
      rendimentoCarcaca: 48,
    });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const resumo = resumirItensVenda(
      [
        { pesoVenda: 350, valorItem: a.valor, arrobas: a.arrobas },
        { pesoVenda: 350, valorItem: b.valor, arrobas: b.arrobas },
      ],
      { forma: "arroba", rendimentoCarcaca: 50 },
    );
    expect(resumo.precoMedioArroba).toBe(311.16);
  });

  it("cenário E — R$/@ carcaça 350 kg a 48%", () => {
    expect(calcularPesoCarcacaKg(350, 48)).toBe(168);
    expect(calcularArrobas(168)).toBe(11.2);
    expect(
      calcularValorItem({
        forma: "arroba",
        pesoVenda: 350,
        precoUnitario: 311.16,
        rendimentoCarcaca: 48,
      }),
    ).toMatchObject({ ok: true, valor: 3484.99, pesoCarcaca: 168, arrobas: 11.2 });
  });

  it("cenário F — rendimento padrão não sobrescreve exceção", () => {
    const itens = [
      { id: 55, rendimento: "50", rendimentoManual: false },
      { id: 102, rendimento: "48", rendimentoManual: true },
    ];
    const atualizados = aplicarPadraoEmLinhas(
      itens,
      i => i.rendimentoManual,
      i => ({ ...i, rendimento: "52" }),
    );
    expect(atualizados.find(i => i.id === 55)?.rendimento).toBe("52");
    expect(atualizados.find(i => i.id === 102)?.rendimento).toBe("48");
  });

  it("cenário G — preço padrão não sobrescreve individual", () => {
    const itens = [
      { id: 55, preco: "10,25", precoManual: false },
      { id: 102, preco: "9,80", precoManual: true },
    ];
    const atualizados = aplicarPadraoEmLinhas(
      itens,
      i => i.precoManual,
      i => ({ ...i, preco: "11,00" }),
    );
    expect(atualizados.find(i => i.id === 55)?.preco).toBe("11,00");
    expect(atualizados.find(i => i.id === 102)?.preco).toBe("9,80");
  });

  it("cenário H — peso manual é o valor digitado, não o histórico", () => {
    const calc = calcularValorItem({ forma: "kg", pesoVenda: 412, precoUnitario: 10 });
    expect(calc).toMatchObject({ ok: true, valor: 4120, pesoVivo: 412 });
  });

  it("listagem/PDF ordena brinco crescente; a lida mantém a fila", () => {
    expect(
      ordenarItensVendaPorBrinco([
        { animalId: 1, brinco: "17" },
        { animalId: 2, brinco: "12" },
        { animalId: 3, brinco: "04" },
      ]).map(i => i.brinco),
    ).toEqual(["04", "12", "17"]);
    expect(
      anexarItensVendaNaOrdemDaLida(
        [
          { animalId: 27, brinco: "27" },
          { animalId: 800, brinco: "800" },
        ],
        [{ animalId: 97, brinco: "97" }],
      ).map(i => i.brinco),
    ).toEqual(["27", "800", "97"]);
  });

  it("Animal atual: RFID 802, inclusão, aguarda peso só com balança, depois mostra o kg", () => {
    const itens = [{ animalId: 802, brinco: "802", pesoVenda: "" }];
    const semBalanca = estadoAnimalAtualVenda({
      animalAtualId: 802,
      itens,
      balancaConectada: false,
    });
    expect(semBalanca).toMatchObject({
      brinco: "802",
      pesoKg: null,
      recebeProximoPeso: true,
      aguardandoPesoBalanca: false,
    });
    expect(
      estadoAnimalAtualVenda({ animalAtualId: 802, itens, balancaConectada: true }),
    ).toMatchObject({ aguardandoPesoBalanca: true });
    expect(
      estadoAnimalAtualVenda({
        animalAtualId: 802,
        itens: [{ animalId: 802, brinco: "802", pesoVenda: "400,0" }],
        balancaConectada: true,
      }),
    ).toMatchObject({ pesoKg: 400, aguardandoPesoBalanca: false });
    expect(
      estadoAnimalAtualVenda({
        animalAtualId: 900,
        itens: [
          { animalId: 802, brinco: "802", pesoVenda: "400" },
          { animalId: 900, brinco: "900", pesoVenda: "" },
        ],
        balancaConectada: true,
      }),
    ).toMatchObject({ brinco: "900", aguardandoPesoBalanca: true });
    expect(
      estadoAnimalAtualVenda({
        animalAtualId: 27,
        itens: [
          { animalId: 27, brinco: "27", pesoVenda: "10.0" },
          { animalId: 800, brinco: "800", pesoVenda: "" },
        ],
        balancaConectada: true,
      }),
    ).toMatchObject({ brinco: "27", recebeProximoPeso: false, aguardandoPesoBalanca: false });
  });

  it("visor da S3 no próximo animal não herda o peso travado do anterior", () => {
    expect(
      pesoBalancaVendaNaIdentificacao({
        kg: 75,
        alvoId: 27,
        ultimoBalanca: null,
      }),
    ).toBe(75);
    expect(
      pesoBalancaVendaNaIdentificacao({
        kg: 350,
        alvoId: 12,
        ultimoBalanca: { animalId: 27, kg: 350 },
      }),
    ).toBeNull();
    expect(
      pesoBalancaVendaNaIdentificacao({
        kg: 360,
        alvoId: 12,
        ultimoBalanca: { animalId: 27, kg: 350 },
      }),
    ).toBe(360);
  });

  it("cenário I — peso da balança preenche o alvo sem confirmar venda", () => {
    expect(
      escolherAlvoPesoBalanca(
        [
          { animalId: 1, pesoVenda: "350" },
          { animalId: 2, pesoVenda: "" },
        ],
        null,
      ),
    ).toBe(2);
    expect(
      escolherAlvoPesoBalanca(
        [
          { animalId: 27, pesoVenda: "10.0" },
          { animalId: 800, pesoVenda: "" },
        ],
        27,
      ),
    ).toBe(800);
    expect(
      escolherAlvoPesoBalanca(
        [
          { animalId: 1, pesoVenda: "350" },
          { animalId: 2, pesoVenda: "400" },
        ],
        1,
      ),
    ).toBe(1);
  });

  it("cenário J/K — busca/RFID só inclui animal ativo da Fazenda", () => {
    expect(
      avaliarInclusaoAnimalVenda({
        animal: { id: 12, brinco: "12", fazendaId: 1, status: "ativo" },
        fazendaId: 1,
        idsNaVenda: [],
      }),
    ).toEqual({ ok: true, brinco: "12" });
  });

  it("cenário O — mesmo animal não entra duas vezes", () => {
    expect(
      avaliarInclusaoAnimalVenda({
        animal: { id: 12, brinco: "12", fazendaId: 1, status: "ativo" },
        fazendaId: 1,
        idsNaVenda: [12],
      }).ok,
    ).toBe(false);
  });

  it("arroba exige rendimento", () => {
    expect(
      calcularValorItem({ forma: "arroba", pesoVenda: 350, precoUnitario: 300 }),
    ).toEqual({ ok: false, message: MSG_VENDA_RENDIMENTO_OBRIGATORIO });
  });
});
