import { describe, expect, it } from "vitest";
import {
  MSG_ESTOQUE_VALOR_UNITARIO_DERIVADO,
  aplicarAjusteEntradaSemValor,
  aplicarAjusteSaidaCapital,
  aplicarEntradaCapital,
  aplicarEstornoCapital,
  aplicarProducaoPropriaCapital,
  aplicarSaidaCapital,
  calcularCustoMedioTecnico,
  capitalEstaInicializado,
  capitalSeAplica,
  custoMedioFonteTecnica,
  persistirCapital,
  persistirCustoMedioTecnico,
  persistirQuantidadeEstoque,
  aplicarTransferenciaCapital,
  transferenciaPodeAtivarCapital,
  valorPatrimonialExibicao,
  valorUnitarioEhCampoLivre,
} from "./estoqueCapital";

describe("estoqueCapital — motor", () => {
  it("CASO A — entrada da Compra #8 fecha 6.605,28", () => {
    const r = aplicarEntradaCapital({ quantidade: 49.98, capital: 6465.91 }, 1, 139.37);
    expect(r.quantidade).toBe(50.98);
    expect(r.capital).toBe(6605.28);
    expect(r.valorMovimentado).toBe(139.37);
  });

  it("CASO B — médio técnico não vira 129,57 antes do uso", () => {
    const r = aplicarEntradaCapital({ quantidade: 49.98, capital: 6465.91 }, 1, 139.37);
    const medio = calcularCustoMedioTecnico(r.capital, r.quantidade);
    expect(medio).not.toBeNull();
    expect(medio).not.toBe(129.57);
    expect(persistirCustoMedioTecnico(medio!)).toBe("129.566104");
    expect(r.quantidade * 129.57).not.toBe(r.capital);
  });

  it("CASO C — saída parcial proporcional em centavos", () => {
    const r = aplicarSaidaCapital({ quantidade: 50.98, capital: 6605.28 }, 0.02);
    expect(r.quantidade).toBe(50.96);
    expect(r.valorMovimentado).toBe(2.59);
    expect(r.capital).toBe(6602.69);
  });

  it("CASO D — várias saídas parciais nunca passam do capital", () => {
    let estado = { quantidade: 10, capital: 100 };
    const primeira = aplicarSaidaCapital(estado, 3.33);
    estado = { quantidade: primeira.quantidade, capital: primeira.capital };
    const segunda = aplicarSaidaCapital(estado, 3.33);
    estado = { quantidade: segunda.quantidade, capital: segunda.capital };
    const terceira = aplicarSaidaCapital(estado, 3.34);
    expect(primeira.valorMovimentado + segunda.valorMovimentado + terceira.valorMovimentado).toBe(100);
    expect(terceira.quantidade).toBe(0);
    expect(terceira.capital).toBe(0);
    expect(estado.capital - segunda.valorMovimentado).toBeGreaterThanOrEqual(0);
  });

  it("CASO E — última saída zera o capital residual", () => {
    const r = aplicarSaidaCapital({ quantidade: 0.03, capital: 0.03 }, 0.03);
    expect(r.quantidade).toBe(0);
    expect(r.capital).toBe(0);
    expect(r.valorMovimentado).toBe(0.03);
  });

  it("CASO F — estorno de entrada devolve exatamente o capital", () => {
    const depois = aplicarEntradaCapital({ quantidade: 49.98, capital: 6465.91 }, 1, 139.37);
    const estorno = aplicarEstornoCapital(
      { quantidade: depois.quantidade, capital: depois.capital },
      1,
      depois.valorMovimentado,
    );
    expect(estorno.quantidade).toBe(49.98);
    expect(estorno.capital).toBe(6465.91);
  });

  it("CASO G — estorno de saída recompõe o capital retirado", () => {
    const saida = aplicarSaidaCapital({ quantidade: 50.98, capital: 6605.28 }, 0.5);
    const estorno = aplicarEstornoCapital(
      { quantidade: saida.quantidade, capital: saida.capital },
      -0.5,
      saida.valorMovimentado,
    );
    expect(estorno.quantidade).toBe(50.98);
    expect(estorno.capital).toBe(6605.28);
  });

  it("CASO H — ajuste de entrada sem valor não inventa capital", () => {
    const r = aplicarAjusteEntradaSemValor({ quantidade: 50.98, capital: 6605.28 }, 1);
    expect(r.quantidade).toBe(51.98);
    expect(r.capital).toBe(6605.28);
    expect(r.valorMovimentado).toBe(0);
  });

  it("CASO I — ajuste de saída retira capital proporcional", () => {
    const r = aplicarAjusteSaidaCapital({ quantidade: 50.98, capital: 6605.28 }, 0.02);
    expect(r.quantidade).toBe(50.96);
    expect(r.valorMovimentado).toBe(2.59);
    expect(r.capital).toBe(6602.69);
  });

  it("CASO J — produção própria sem valor incrementa capital zero", () => {
    const r = aplicarProducaoPropriaCapital({ quantidade: 10, capital: 1000 }, 2, null);
    expect(r.quantidade).toBe(12);
    expect(r.capital).toBe(1000);
    expect(r.valorMovimentado).toBe(0);
  });

  it("CASO K — produção própria com valor recebe o valor", () => {
    const r = aplicarProducaoPropriaCapital({ quantidade: 10, capital: 1000 }, 2, 80);
    expect(r.quantidade).toBe(12);
    expect(r.capital).toBe(1080);
    expect(r.valorMovimentado).toBe(80);
  });

  it("CASO L — uso imediato não se aplica capital", () => {
    expect(capitalSeAplica(false)).toBe(false);
    expect(capitalSeAplica(true)).toBe(true);
  });
});

describe("estoqueCapital — precisão", () => {
  it.each([
    [0.01], [0.03], [0.1], [33.33], [33.34], [129.37], [139.37], [6605.28],
  ])("persiste %s em centavos", (valor) => {
    expect(persistirCapital(valor)).toBe(valor.toFixed(2));
  });

  it.each([
    [0.01], [0.02], [1], [49.98], [50.98], [9999.99],
  ])("persiste quantidade %s", (qtd) => {
    expect(persistirQuantidadeEstoque(qtd)).toBe(qtd.toFixed(2));
  });

  it("exibição legado usa qtd × unitário; capital inicializado usa o total", () => {
    expect(valorPatrimonialExibicao({
      quantidade: 50.98,
      valorUnitario: 129.57,
      valorTotalEstoque: null,
      capitalInicializadoEm: null,
    })).toBeCloseTo(6605.48, 2);

    expect(valorPatrimonialExibicao({
      quantidade: 50.98,
      valorUnitario: 129.57,
      valorTotalEstoque: 6605.28,
      capitalInicializadoEm: "2026-10-09T00:00:00.000Z",
    })).toBe(6605.28);
  });

  it("fonte técnica de custo não usa 129,57 quando o capital existe", () => {
    const tecnico = custoMedioFonteTecnica({
      quantidade: 50.98,
      valorUnitario: 129.57,
      valorTotalEstoque: 6605.28,
      capitalInicializadoEm: new Date("2026-10-09"),
    });
    expect(tecnico).toBeCloseTo(6605.28 / 50.98, 6);
    expect(tecnico).not.toBe(129.57);
  });

  it("cadastro deixa de ser campo livre após inicializar", () => {
    expect(valorUnitarioEhCampoLivre(false)).toBe(true);
    expect(valorUnitarioEhCampoLivre(true)).toBe(false);
    expect(MSG_ESTOQUE_VALOR_UNITARIO_DERIVADO.length).toBeGreaterThan(10);
  });

  it("transferência bilateral deixa de bloquear a ativação estrutural", () => {
    expect(transferenciaPodeAtivarCapital()).toBe(true);
    const r = aplicarTransferenciaCapital(
      { quantidade: 10, capital: 100 },
      { quantidade: 5, capital: 80 },
      3,
    );
    expect(r.origem).toMatchObject({ quantidade: 7, capital: 70 });
    expect(r.destino).toMatchObject({ quantidade: 8, capital: 110 });
    expect(r.valorTransferido).toBe(30);
  });

  it("NULL de inicialização é diferente de capital zero", () => {
    expect(capitalEstaInicializado({ capitalInicializadoEm: null })).toBe(false);
    expect(capitalEstaInicializado({ capitalInicializadoEm: new Date() })).toBe(true);
  });
});
