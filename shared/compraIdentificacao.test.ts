import { describe, expect, it } from "vitest";
import { calcularCustoMedioCabeca, calcularCustoMedioKg } from "./compraComercial";
import {
  animalContaNaCompra,
  animalContaNoGrupoCompra,
  compraAcessivelAoUsuario,
  contarIdentificacao,
  grupoCompraAceitaNovoVinculo,
  resumirIdentificacaoCompra,
  situacaoIdentificacaoCompra,
  valoresOficiaisDaCompra,
} from "./compraIdentificacao";

/** Fixtures isoladas — nunca a Compra 1 real. */
const COMPRA = 9001;
const GRUPO_BEZERRO = 9101;
const GRUPO_BEZERRA = 9102;
const USER = 7;

const grupos40 = [
  { id: GRUPO_BEZERRO, categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: 4400 },
  { id: GRUPO_BEZERRA, categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: 4000 },
];

describe("identificação derivada da compra", () => {
  it("compra com 40 e zero vinculados: 40 / 0 / 40", () => {
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [],
    });
    expect(r).toMatchObject({
      comprados: 40,
      identificados: 0,
      pendentes: 40,
      situacao: "aguardando",
      situacaoLabel: "Aguardando identificação",
      pesoAdquirido: 8400,
    });
  });

  it("grupo de 20 com zero: 20 / 0 / 20", () => {
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [],
    });
    expect(r.grupos[0]).toMatchObject({
      comprados: 20,
      identificados: 0,
      pendentes: 20,
      pesoAdquirido: 4400,
    });
    expect(r.grupos[1]).toMatchObject({
      comprados: 20,
      identificados: 0,
      pendentes: 20,
      pesoAdquirido: 4000,
    });
  });

  it("dois grupos somam comprados e peso", () => {
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [],
    });
    expect(r.grupos.reduce((s, g) => s + g.comprados, 0)).toBe(40);
    expect(r.pesoAdquirido).toBe(8400);
  });

  it("situação zero é aguardando identificação", () => {
    expect(situacaoIdentificacaoCompra(40, 0)).toBe("aguardando");
  });

  it("situação parcial", () => {
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [
        { id: 805, userId: USER, compraId: COMPRA, compraGrupoId: GRUPO_BEZERRO },
      ],
    });
    expect(r).toMatchObject({
      comprados: 40,
      identificados: 1,
      pendentes: 39,
      situacao: "parcial",
      situacaoLabel: "Identificação parcial",
    });
    expect(r.grupos[0]).toMatchObject({ comprados: 20, identificados: 1, pendentes: 19 });
    expect(r.grupos[1]).toMatchObject({ comprados: 20, identificados: 0, pendentes: 20 });
  });

  it("situação completa", () => {
    const vinculos = Array.from({ length: 40 }, (_, i) => ({
      id: 8000 + i,
      userId: USER,
      compraId: COMPRA,
      compraGrupoId: i < 20 ? GRUPO_BEZERRO : GRUPO_BEZERRA,
    }));
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos,
    });
    expect(r).toMatchObject({
      comprados: 40,
      identificados: 40,
      pendentes: 0,
      situacao: "concluida",
    });
  });

  it("nunca retorna pendente negativo", () => {
    expect(contarIdentificacao({ comprados: 20, identificados: 21 })).toEqual({
      comprados: 20,
      identificados: 21,
      pendentes: 0,
    });
    expect(grupoCompraAceitaNovoVinculo(20, 20)).toBe(false);
    expect(grupoCompraAceitaNovoVinculo(20, 19)).toBe(true);
  });

  it("usuário não acessa compra de outro usuário", () => {
    expect(compraAcessivelAoUsuario(7, 7)).toBe(true);
    expect(compraAcessivelAoUsuario(7, 99)).toBe(false);
    expect(compraAcessivelAoUsuario(null, 7)).toBe(false);
  });

  it("animal de outra compra não entra na contagem", () => {
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [
        { id: 1, userId: USER, compraId: 77, compraGrupoId: GRUPO_BEZERRO },
      ],
    });
    expect(r.identificados).toBe(0);
    expect(r.pendentes).toBe(40);
  });

  it("animal sem compra não entra", () => {
    expect(animalContaNaCompra({ id: 12, userId: USER, compraId: null, compraGrupoId: null }, COMPRA, USER)).toBe(false);
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [{ id: 12, userId: USER, compraId: null, compraGrupoId: null }],
    });
    expect(r.identificados).toBe(0);
  });

  it("grupo errado não entra na contagem daquele grupo", () => {
    const vinculo = { id: 805, userId: USER, compraId: COMPRA, compraGrupoId: 9999 };
    expect(animalContaNoGrupoCompra(vinculo, COMPRA, GRUPO_BEZERRO, USER)).toBe(false);
    const r = resumirIdentificacaoCompra({
      compraId: COMPRA,
      userId: USER,
      grupos: grupos40,
      vinculos: [vinculo],
    });
    expect(r.identificados).toBe(1);
    expect(r.grupos[0].identificados).toBe(0);
    expect(r.grupos[1].identificados).toBe(0);
  });

  it("compra antiga sem grupos usa quantidade persistida e continua 0 identificados", () => {
    const r = resumirIdentificacaoCompra({
      compraId: 3,
      userId: USER,
      quantidadeAnimaisLegado: 12,
      pesoTotalPersistido: null,
      grupos: [],
      vinculos: [],
    });
    expect(r).toMatchObject({
      comprados: 12,
      identificados: 0,
      pendentes: 12,
      situacao: "aguardando",
      pesoAdquirido: null,
      grupos: [],
    });
  });

  it("cálculos financeiros oficiais permanecem iguais", () => {
    const v = valoresOficiaisDaCompra({
      formaPrecificacao: "kg",
      precoUnitario: 12.5,
      valorAnimais: 105000,
      frete: 3000,
      outrosCustos: 0,
      custoTotal: 108000,
      quantidade: 40,
      pesoTotal: 8400,
    });
    expect(v).toMatchObject({
      valorAnimais: 105000,
      frete: 3000,
      outrosCustos: 0,
      custoTotal: 108000,
      custoMedioCabeca: 2700,
      custoMedioKg: 12.86,
    });
    expect(calcularCustoMedioCabeca(108000, 40)).toBe(2700);
    expect(calcularCustoMedioKg(108000, 8400)).toBe(12.86);
  });
});
