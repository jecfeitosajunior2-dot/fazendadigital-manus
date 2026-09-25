import { describe, expect, it } from "vitest";
import {
  MSG_RECEBIMENTO_BRINCO,
  MSG_RECEBIMENTO_DATA,
  MSG_RECEBIMENTO_PESO,
  MSG_RECEBIMENTO_RACA,
  formatarPesoEntradaExibicao,
  localizarPesagemRecebimentoCompra,
  normalizarRecebimentoAnimalInput,
  observacaoRecebimentoCompra,
  pesoEntradaNoUpdateAnimal,
  resolverExibicaoPesoEntrada,
  textoAuxiliarPesoEntrada,
} from "./compraRecebimento";

const base = {
  compraId: 9001,
  compraGrupoId: 9101,
  brincoVisual: "805",
  dataRecebimento: "2026-09-24",
};

describe("normalizarRecebimentoAnimalInput", () => {
  it("exige brinco visual", () => {
    expect(normalizarRecebimentoAnimalInput({ ...base, brincoVisual: "  " })).toMatchObject({
      message: MSG_RECEBIMENTO_BRINCO,
    });
  });

  it("exige data válida e não inventa peso", () => {
    expect(normalizarRecebimentoAnimalInput({ ...base, dataRecebimento: "" })).toMatchObject({
      message: MSG_RECEBIMENTO_DATA,
    });
    const ok = normalizarRecebimentoAnimalInput(base);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.pesoKg).toBeNull();
  });

  it("aceita peso com vírgula e rejeita zero", () => {
    const ok = normalizarRecebimentoAnimalInput({ ...base, pesoEntrada: "218,5" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.pesoKg).toBe(218.5);
    expect(normalizarRecebimentoAnimalInput({ ...base, pesoEntrada: "0" })).toMatchObject({
      message: MSG_RECEBIMENTO_PESO,
    });
  });

  it("não aceita raça fora do catálogo", () => {
    expect(normalizarRecebimentoAnimalInput({ ...base, raca: "Inventada" })).toMatchObject({
      message: MSG_RECEBIMENTO_RACA,
    });
    const ok = normalizarRecebimentoAnimalInput({ ...base, raca: "Nelore" });
    expect(ok.ok).toBe(true);
  });

  it("observa a Compra pelo id, sem usar Compra 1", () => {
    expect(observacaoRecebimentoCompra(9001)).toBe("Recebimento da Compra 9001");
    expect(observacaoRecebimentoCompra(9001)).not.toContain("Compra 1");
  });
});

describe("exibição do peso de entrada da Compra", () => {
  it("mostra a pesagem do recebimento e ignora pesoAtual posterior", () => {
    const exibicao = resolverExibicaoPesoEntrada({
      compraId: 1,
      pesoEntrada: null,
      pesagens: [
        { peso: "480", observacoes: "Manejo de rotina" },
        { peso: "300.00", observacoes: observacaoRecebimentoCompra(1) },
      ],
    });
    expect(exibicao).toMatchObject({
      origem: "compra_pesagem",
      pesoKg: 300,
      compraId: 1,
      somenteLeitura: true,
    });
    expect(formatarPesoEntradaExibicao(exibicao.pesoKg!)).toBe("300,0 kg");
    expect(textoAuxiliarPesoEntrada(exibicao)).toBe(
      "Pesagem realizada no recebimento da Compra 1",
    );
    expect(pesoEntradaNoUpdateAnimal(exibicao, "300")).toBeUndefined();
  });

  it("animal recebido sem pesagem mostra ausência, sem usar peso cadastral", () => {
    const exibicao = resolverExibicaoPesoEntrada({
      compraId: 1,
      pesoEntrada: "220",
      pesagens: [],
    });
    expect(exibicao).toMatchObject({
      origem: "compra_sem_pesagem",
      pesoKg: null,
      somenteLeitura: true,
    });
    expect(textoAuxiliarPesoEntrada(exibicao)).toBe(
      "Nenhuma pesagem registrada no recebimento",
    );
    expect(pesoEntradaNoUpdateAnimal(exibicao, "")).toBeUndefined();
  });

  it("não pega a primeira pesagem só pela data", () => {
    expect(
      localizarPesagemRecebimentoCompra(
        [
          { peso: "199", observacoes: "primeira do dia" },
          { peso: "300", observacoes: observacaoRecebimentoCompra(1) },
        ],
        1,
      ),
    ).toEqual({ pesoKg: 300, compraId: 1 });
    expect(
      localizarPesagemRecebimentoCompra(
        [{ peso: "199", observacoes: "primeira do dia" }],
        1,
      ),
    ).toBeNull();
  });

  it("duas observações iguais deixam o peso sem identificação", () => {
    expect(
      localizarPesagemRecebimentoCompra(
        [
          { peso: "300", observacoes: observacaoRecebimentoCompra(1) },
          { peso: "310", observacoes: observacaoRecebimentoCompra(1) },
        ],
        1,
      ),
    ).toBeNull();
  });

  it("animal legado continua no peso cadastral editável", () => {
    const exibicao = resolverExibicaoPesoEntrada({
      compraId: null,
      pesoEntrada: "280",
      pesagens: [{ peso: "400", observacoes: observacaoRecebimentoCompra(1) }],
    });
    expect(exibicao).toEqual({ origem: "cadastral", pesoKg: 280, somenteLeitura: false });
    expect(pesoEntradaNoUpdateAnimal(exibicao, "280")).toBe("280");
    expect(pesoEntradaNoUpdateAnimal(exibicao, "")).toBeNull();
  });
});
