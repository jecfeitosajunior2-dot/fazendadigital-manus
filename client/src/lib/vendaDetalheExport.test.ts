import { describe, expect, it } from "vitest";
import {
  VENDA_DETALHE_EXPORT_SISTEMA,
  VENDA_DETALHE_EXPORT_TITULO,
  buildVendaDetalheExportHeaders,
  buildVendaDetalheExportIdentificacao,
  buildVendaDetalheExportRows,
  cabecalhoPrecoUnitarioVenda,
  nomeAbaExcelVendaDetalhe,
  nomeArquivoVendaDetalhe,
  podeExportarVendaDetalhe,
  serializarIdentificacaoVendaDetalhe,
  temDocumentoVenda,
  type VendaDetalheExportInput,
} from "./vendaDetalheExport";

const vendaConcluida: VendaDetalheExportInput = {
  id: 1,
  userId: 1,
  status: "concluido",
  data: "2026-09-19",
  fazendaNome: "Fazenda J",
  comprador: "Frigorífico São Paulo",
  formaPrecificacao: "kg",
  totais: {
    quantidade: 2,
    pesoTotal: 450,
    valorTotal: 4612.5,
    precoMedioKg: 10.25,
  },
  itens: [
    {
      animalId: 25,
      brincoSnapshot: "801",
      loteNomeSnapshot: null,
      pesoVenda: 200,
      precoUnitario: 10.25,
      valorItem: 2050,
    },
    {
      animalId: 26,
      brincoSnapshot: "802",
      loteNomeSnapshot: null,
      pesoVenda: 250,
      precoUnitario: 10.25,
      valorItem: 2562.5,
    },
  ],
  documentos: [{ tipo: "nota_fiscal" }],
};

const vendaCancelada: VendaDetalheExportInput = {
  ...vendaConcluida,
  id: 44,
  status: "cancelado",
  canceladoEm: "2026-09-20T15:30:00.000Z",
  canceladoPorNome: "Administrador",
  motivoCancelamento: "Digitação incorreta do comprador",
};

describe("exportação da ficha da venda", () => {
  it("PDF/Excel de venda concluída usam os dados reais da venda e dos itens", () => {
    const info = buildVendaDetalheExportIdentificacao(vendaConcluida);
    const texto = serializarIdentificacaoVendaDetalhe(info);
    const rows = buildVendaDetalheExportRows(vendaConcluida);

    expect(VENDA_DETALHE_EXPORT_SISTEMA).toBe("Fazenda Digital");
    expect(VENDA_DETALHE_EXPORT_TITULO).toBe("Relatório de Venda");
    expect(texto).toContain("Venda: 1");
    expect(texto).toContain("Status: Concluída");
    expect(texto).toContain("Data: 19/09/2026");
    expect(texto).toContain("Fazenda: Fazenda J");
    expect(texto).toContain("Comprador: Frigorífico São Paulo");
    expect(texto).toContain("Forma de precificação: R$/kg vivo");
    expect(texto).toContain("Animais: 2");
    expect(texto).toContain("Peso total: 450 kg");
    expect(texto).toContain("R$/kg médio: R$ 10,25");
    expect(texto).toContain("Valor total: R$ 4.612,50");
    expect(rows).toEqual([
      ["801", "—", "200 kg", "R$ 10,25", "R$ 2.050,00"],
      ["802", "—", "250 kg", "R$ 10,25", "R$ 2.562,50"],
    ]);
  });

  it("cabeçalho de preço respeita a modalidade", () => {
    expect(buildVendaDetalheExportHeaders("kg")).toEqual([
      "Brinco",
      "Lote",
      "Peso do embarque",
      "R$/kg",
      "Valor",
    ]);
    expect(cabecalhoPrecoUnitarioVenda("cabeca")).toBe("R$/cabeça");
    expect(buildVendaDetalheExportHeaders("cabeca")[3]).toBe("R$/cabeça");
    expect(buildVendaDetalheExportHeaders("arroba")[3]).toBe("R$/@");
    expect(serializarIdentificacaoVendaDetalhe(
      buildVendaDetalheExportIdentificacao({ ...vendaConcluida, formaPrecificacao: "cabeca", totais: { ...vendaConcluida.totais, precoMedioKg: null } }),
    )).not.toContain("R$/kg médio");
  });

  it("indica documentos sem expor caminho ou storage", () => {
    const texto = serializarIdentificacaoVendaDetalhe(buildVendaDetalheExportIdentificacao(vendaConcluida));
    expect(temDocumentoVenda(vendaConcluida.documentos, "gta")).toBe(false);
    expect(temDocumentoVenda(vendaConcluida.documentos, "nota_fiscal")).toBe(true);
    expect(texto).toContain("GTA: Não anexado");
    expect(texto).toContain("Nota Fiscal: Anexada");
    expect(texto).not.toContain("manus-storage");
    expect(texto).not.toContain("storage_path");
    expect(texto).not.toContain("venda_doc_");
  });

  it("venda cancelada mantém valores e inclui o cancelamento", () => {
    const texto = serializarIdentificacaoVendaDetalhe(buildVendaDetalheExportIdentificacao(vendaCancelada));
    const rows = buildVendaDetalheExportRows(vendaCancelada);
    expect(texto).toContain("Status: Cancelada");
    expect(texto).toContain("Cancelada em:");
    expect(texto).toContain("Cancelada por: Administrador");
    expect(texto).toContain("Motivo do cancelamento: Digitação incorreta do comprador");
    expect(texto).toContain("Valor total: R$ 4.612,50");
    expect(rows[0]?.[0]).toBe("801");
    expect(rows[0]?.[4]).toBe("R$ 2.050,00");
  });

  it("usuário sem acesso não exporta venda de outro usuário", () => {
    expect(podeExportarVendaDetalhe(1, 1)).toBe(true);
    expect(podeExportarVendaDetalhe(1, 99)).toBe(false);
    expect(podeExportarVendaDetalhe(null, 1)).toBe(false);
    const outra = buildVendaDetalheExportIdentificacao({ ...vendaConcluida, id: 99, userId: 7 });
    expect(serializarIdentificacaoVendaDetalhe(outra)).toContain("Venda: 99");
    expect(serializarIdentificacaoVendaDetalhe(outra)).not.toContain("Venda: 1");
  });

  it("nomes dos arquivos são claros e sem UUID/storage", () => {
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "pdf")).toBe("Venda-1-19-09-2026.pdf");
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "xlsx")).toBe("Venda-1-19-09-2026.xlsx");
    expect(nomeAbaExcelVendaDetalhe(1)).toBe("Venda 1");
    expect(nomeArquivoVendaDetalhe(vendaConcluida, "pdf")).not.toMatch(/[0-9a-f]{16}/);
  });

  it("exportação é só leitura — builders não mutam a venda", () => {
    const snapshot = structuredClone(vendaConcluida);
    buildVendaDetalheExportRows(vendaConcluida);
    buildVendaDetalheExportIdentificacao(vendaConcluida);
    expect(vendaConcluida).toEqual(snapshot);
    expect(vendaConcluida.status).toBe("concluido");
    expect(vendaConcluida.totais.valorTotal).toBe(4612.5);
  });
});
