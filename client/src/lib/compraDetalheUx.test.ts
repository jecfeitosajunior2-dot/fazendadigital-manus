import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraDetalhePage.tsx"), "utf8");
const listagem = readFileSync(resolve(here, "../pages/ModulePages.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const animaisList = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");

describe("Compra detalhe — etapa de acompanhamento", () => {
  it("abre /compra-venda/compras/:id sem RFID, S3 ou Curral", () => {
    expect(app).toContain('path="/compra-venda/compras/:id"');
    expect(app).toContain("CompraDetalhePage");
    expect(page).not.toContain("At05");
    expect(page).not.toContain("TruTest");
    expect(page).not.toContain("useScaleReader");
    expect(page).not.toContain("curral");
    expect(page).not.toContain("Identificar animais");
  });

  it("não trata pendentes como animais cadastrados", () => {
    expect(page).toContain("Comprados");
    expect(page).toContain("Pendentes");
    expect(page).toContain("data.identificacao.situacaoLabel");
    expect(page).not.toContain("animais cadastrados");
    expect(page).not.toContain("Animal pendente");
  });

  it("listagem tem Visualizar e Cancelar, sem lixeira operacional", () => {
    const start = listagem.indexOf("export function PurchasesPage");
    const end = listagem.indexOf("const VENDA_FILTRO_SELECT_EMPTY");
    const chunk = listagem.slice(start, end);
    expect(chunk).toContain("compraVendaCompraDetalhePath");
    expect(chunk).toContain('label="Ver detalhes"');
    expect(chunk).toContain('label="Cancelar compra"');
    expect(chunk).toContain("Status");
    expect(chunk).not.toContain('label="Excluir"');
    expect(chunk).not.toContain("DeleteActionIcon");
    expect(chunk).not.toContain("compras.delete");
  });

  it("detalhe mostra cancelamento e some o botão depois", () => {
    expect(page).toContain("Cancelar Compra");
    expect(page).toContain("podeCancelar");
    expect(page).toContain("Cancelamento");
    expect(page).toContain("data?.podeCancelar");
    expect(page).not.toContain("Identificar animais");
  });

  it("cabeçalho segue o esqueleto da venda, sem exportação incompleta", () => {
    expect(page).toContain("Compra {data.id}");
    expect(page).toContain("Forma de precificação:");
    expect(page).toContain("Peso adquirido");
    expect(page).not.toContain("Peso total");
    expect(page).toContain("R$/kg médio");
    expect(page).toContain("Valor total");
    expect(page).toContain("data.valores.custoMedioKg");
    expect(page).toContain("data.valores.custoTotal");
    expect(page).not.toContain("ListExportButtons");
    expect(page).not.toContain("Status comercial");
    const situacao = page.slice(page.indexOf("Situação dos animais"), page.indexOf("Composição da compra"));
    expect(situacao).toContain("Comprados");
    expect(situacao).toContain("Identificados");
    expect(situacao).toContain("Pendentes");
    expect(situacao).toContain("situacaoLabel");
    expect(situacao).not.toContain("Peso adquirido");
    expect(situacao).not.toContain("Aguardando identificação");
  });

  it("não mostra Destino planejado", () => {
    expect(page).not.toContain("Destino planejado");
    expect(page).not.toContain("Lote e pasto representam");
    expect(page).not.toContain("data.loteNome");
    expect(page).not.toContain("data.pastoNome");
  });

  it("mostra Documentos com GTA e Nota Fiscal, sem Outros", () => {
    expect(page).toContain("CompraDocumentosSection");
    expect(page).toContain("data.documentos");
    const docs = readFileSync(resolve(here, "../components/venda/VendaDocumentosSection.tsx"), "utf8");
    expect(docs).toContain('label: "GTA"');
    expect(docs).toContain('label: "Nota Fiscal"');
    expect(docs).toContain("Anexar PDF");
    expect(docs).toContain("Visualizar");
    expect(docs).toContain("onSelect={() => onBaixar(documento)}");
    expect(docs).not.toMatch(/<button[\s\S]*?>\s*Baixar\s*<\/button>/);
    expect(docs).toContain("/api/compras/documentos");
    expect(docs).toContain("compras.documentosAnexar");
    expect(docs).toContain("compras.documentosExcluir");
    expect(docs).toContain("A {operacaoLabel} em si não será alterada.");
    expect(docs).not.toContain("Outros documentos");
    expect(docs).not.toContain("outros");
    expect(page).not.toContain("Outros documentos");
  });

  it("lista de animais não ganha registros por causa da compra", () => {
    const start = animaisList.indexOf("const animaisRouter");
    const listStart = animaisList.indexOf("list: protectedProcedure", start);
    const chunk = animaisList.slice(listStart, listStart + 4000);
    expect(chunk).not.toContain("compraGrupos");
    expect(chunk).not.toContain("insert(animais)");
    expect(chunk).toContain("from(animais)");
  });
});
