import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { montarDetalheCompra } from "./compraDetalhe";

const here = dirname(fileURLToPath(import.meta.url));
const detalheSrc = readFileSync(resolve(here, "compraDetalhe.ts"), "utf8");
const confirmarSrc = readFileSync(resolve(here, "confirmarCompra.ts"), "utf8");

const USER = 7;
const OUTRO = 99;

const compraBase = {
  id: 9001,
  userId: USER,
  fazendaId: 1,
  fornecedor: "Agropecuária Central",
  fornecedorId: 3,
  data: "2026-09-24",
  quantidadeAnimais: 40,
  formaPrecificacao: "kg" as const,
  precoUnitario: "12.50",
  valorAnimais: "105000.00",
  frete: "3000.00",
  outrosCustos: "0.00",
  custoTotal: "108000.00",
  valorTotal: "108000",
  pesoTotal: "8400.00",
  loteDestinoId: null,
  pastoDestinoId: null,
  modoIdentificacao: "nao_identificados",
  status: "concluido",
  referencia: null,
  observacoes: null,
};

const grupos = [
  { id: 9101, categoria: "Bezerro", sexo: "macho", quantidade: 20, pesoTotal: "4400.00" },
  { id: 9102, categoria: "Bezerra", sexo: "femea", quantidade: 20, pesoTotal: "4000.00" },
];

describe("detalhe da compra", () => {
  it("usuário não acessa compra de outro usuário", () => {
    expect(
      montarDetalheCompra({
        userId: OUTRO,
        compra: compraBase,
        grupos,
        vinculos: [],
        fazendaNome: "Fazenda J",
        loteNome: null,
        pastoNome: null,
      }),
    ).toBeNull();
  });

  it("compra com 40 e zero vinculados: 40 / 0 / 40 e valores oficiais", () => {
    const d = montarDetalheCompra({
      userId: USER,
      compra: compraBase,
      grupos,
      vinculos: [],
      fazendaNome: "Fazenda J",
      loteNome: null,
      pastoNome: null,
    });
    expect(d).not.toBeNull();
    expect(d!.identificacao).toMatchObject({
      comprados: 40,
      identificados: 0,
      pendentes: 40,
      situacao: "aguardando",
      pesoAdquirido: 8400,
    });
    expect(d!.valores).toMatchObject({
      valorAnimais: 105000,
      frete: 3000,
      outrosCustos: 0,
      custoTotal: 108000,
      custoMedioCabeca: 2700,
      custoMedioKg: 12.86,
    });
    expect(d!.statusComercialLabel).toBe("Concluída");
    expect(d!.podeCancelar).toBe(true);
    expect(d!.formaLabel).toBe("R$/kg vivo");
    expect(d!.loteDestinoId).toBeNull();
    expect(d!.pastoDestinoId).toBeNull();
  });

  it("1 animal vinculado bloqueia o botão de cancelar", () => {
    const d = montarDetalheCompra({
      userId: USER,
      compra: compraBase,
      grupos,
      vinculos: [{ id: 805, userId: USER, compraId: 9001, compraGrupoId: 9101 }],
      fazendaNome: "Fazenda J",
      loteNome: null,
      pastoNome: null,
    });
    expect(d!.podeCancelar).toBe(false);
    expect(d!.identificacao.identificados).toBe(1);
  });

  it("compra cancelada exibe auditoria, encerra identificação e some o botão", () => {
    const d = montarDetalheCompra({
      userId: USER,
      compra: {
        ...compraBase,
        status: "cancelado",
        canceladoEm: new Date("2026-09-24T18:00:00.000Z"),
        canceladoPorUserId: 7,
        canceladoPorNome: "Pedro Gomes",
        motivoCancelamento: "Compra lançada em duplicidade",
      },
      grupos,
      vinculos: [],
      fazendaNome: "Fazenda J",
      loteNome: null,
      pastoNome: null,
    });
    expect(d).not.toBeNull();
    expect(d!.status).toBe("cancelado");
    expect(d!.statusComercialLabel).toBe("Cancelada");
    expect(d!.podeCancelar).toBe(false);
    expect(d!.canceladoPorUserId).toBe(7);
    expect(d!.canceladoPorNome).toBe("Pedro Gomes");
    expect(d!.motivoCancelamento).toBe("Compra lançada em duplicidade");
    expect(d!.canceladoEm).toBeInstanceOf(Date);
    expect(d!.identificacao).toMatchObject({
      comprados: 40,
      identificados: 0,
      pendentes: 40,
      operacionalEncerrada: true,
      situacaoLabel: "Compra cancelada — identificação encerrada.",
    });
    expect(d!.identificacao.grupos).toHaveLength(2);
  });

  it("não cria animal, pesagem ou movimentação — só monta leitura", () => {
    expect(detalheSrc).not.toMatch(/insert\(animais\)/);
    expect(detalheSrc).not.toMatch(/insert\(pesagens\)/);
    expect(detalheSrc).not.toMatch(/insert\(animalLoteMovimentacoes\)/);
    expect(confirmarSrc).not.toMatch(/insert\(animais\)/);
    expect(confirmarSrc).not.toMatch(/insert\(pesagens\)/);
    expect(confirmarSrc).not.toMatch(/insert\(animalLoteMovimentacoes\)/);
    expect(detalheSrc).toContain("select");
    expect(detalheSrc).toContain("compraDocumentosService.listarPublicos");
    expect(detalheSrc).toContain("eq(compras.userId, userId)");
  });
});
