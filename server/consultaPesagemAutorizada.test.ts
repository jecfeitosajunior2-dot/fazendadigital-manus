import { describe, expect, it } from "vitest";
import {
  fazendasDaPesagem,
  filtrarPesagensVisiveis,
  vinculoDaPesagem,
} from "./consultaPesagemAutorizada";

const animal = { id: 50, userId: 1, fazendaId: 20 };

describe("fazenda do dia da pesagem", () => {
  it("sem transferência usa a fazenda atual", () => {
    expect(fazendasDaPesagem({ data: "2026-11-01", fazendaAtualId: 10, movimentos: [] })).toEqual([10]);
  });

  it("pesagem anterior à transferência fica na fazenda de origem", () => {
    expect(fazendasDaPesagem({
      data: "2026-10-01",
      fazendaAtualId: 20,
      movimentos: [{ data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 }],
    })).toEqual([10]);
  });

  it("pesagem depois da transferência fica na fazenda de destino", () => {
    expect(fazendasDaPesagem({
      data: "2026-12-01",
      fazendaAtualId: 20,
      movimentos: [{ data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 }],
    })).toEqual([20]);
  });

  it("no mesmo dia exige as duas fazendas, porque não há hora", () => {
    expect(fazendasDaPesagem({
      data: "2026-11-01",
      fazendaAtualId: 20,
      movimentos: [{ data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 }],
    }).sort()).toEqual([10, 20]);
  });
});

describe("quem pode ver a pesagem", () => {
  const pesagens = [
    { id: 1, animalId: 50, data: "2026-10-01", peso: "200.00" },
    { id: 2, animalId: 50, data: "2026-12-01", peso: "240.00" },
  ];
  const movimentos = [{ animalId: 50, data: "2026-11-01", fazendaOrigemId: 10, fazendaDestinoId: 20 }];

  it("o principal vê o antes e o depois", () => {
    const visiveis = filtrarPesagensVisiveis({
      pesagens,
      animais: [animal],
      movimentos,
      titularUserId: 1,
      principal: true,
      fazendasAutorizadas: [],
    });
    expect(visiveis.map((item) => item.id)).toEqual([1, 2]);
  });

  it("funcionário da fazenda nova não vê a pesagem da fazenda antiga", () => {
    const visiveis = filtrarPesagensVisiveis({
      pesagens,
      animais: [animal],
      movimentos,
      titularUserId: 1,
      principal: false,
      fazendasAutorizadas: [20],
    });
    expect(visiveis.map((item) => item.id)).toEqual([2]);
  });

  it("funcionário da fazenda antiga não vê a pesagem de depois da mudança", () => {
    const visiveis = filtrarPesagensVisiveis({
      pesagens,
      animais: [animal],
      movimentos,
      titularUserId: 1,
      principal: false,
      fazendasAutorizadas: [10],
    });
    expect(visiveis.map((item) => item.id)).toEqual([1]);
  });

  it("animal de outro titular não entra para o funcionário", () => {
    const visiveis = filtrarPesagensVisiveis({
      pesagens: [{ id: 9, animalId: 54, data: "2026-11-01", peso: "10.00" }],
      animais: [{ id: 54, userId: 4, fazendaId: 40 }],
      movimentos: [],
      titularUserId: 1,
      principal: false,
      fazendasAutorizadas: [40],
    });
    expect(visiveis).toEqual([]);
  });
});

describe("vínculo da pesagem", () => {
  it("separa comum, desmama, nascimento e compra", () => {
    expect(vinculoDaPesagem({ observacoes: "balança", compraRecebimentoId: null })).toBe("comum");
    expect(vinculoDaPesagem({ observacoes: "Desmama", compraRecebimentoId: null })).toBe("desmama");
    expect(vinculoDaPesagem({ observacoes: "Peso ao nascimento", compraRecebimentoId: null })).toBe("nascimento");
    expect(vinculoDaPesagem({ observacoes: "recebido", compraRecebimentoId: 7 })).toBe("compra");
  });
});
