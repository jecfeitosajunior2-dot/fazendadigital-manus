import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraRecebimentoPage.tsx"), "utf8");
const detalhe = readFileSync(resolve(here, "../pages/CompraDetalhePage.tsx"), "utf8");
const app = readFileSync(resolve(here, "../App.tsx"), "utf8");
const router = readFileSync(resolve(here, "../../../server/routers.ts"), "utf8");
const service = readFileSync(resolve(here, "../../../server/receberAnimalCompra.ts"), "utf8");
const dbAdapter = readFileSync(resolve(here, "../../../server/receberAnimalCompraDb.ts"), "utf8");
const serviceTest = readFileSync(resolve(here, "../../../server/receberAnimalCompra.test.ts"), "utf8");
const transferencia = readFileSync(
  resolve(here, "../../../server/transferirAnimaisEntreLotes.ts"),
  "utf8",
);

describe("Recebimento manual da Compra — etapa 1", () => {
  it("rota própria vem antes do detalhe e não usa Curral", () => {
    const recebimento = app.indexOf('path="/compra-venda/compras/:id/recebimento"');
    const detalheRota = app.indexOf('path="/compra-venda/compras/:id"');
    expect(recebimento).toBeGreaterThan(-1);
    expect(detalheRota).toBeGreaterThan(recebimento);
    expect(app).toContain("CompraRecebimentoPage");
    expect(page).toContain("useAt05Reader");
    expect(page).toContain("At05RfidReaderControl");
    expect(page).not.toContain("identificarPorRfid");
    expect(page).not.toContain("incluirPorRfid");
    expect(page).toContain("useTruTestBleReader");
    expect(page).not.toContain("useScaleReader");
    expect(page).not.toContain("ScaleReaderControl");
    expect(page).not.toContain("Web Serial");
    expect(page).not.toContain("curral");
    expect(page).not.toContain("animais.create");
    expect(detalhe).not.toContain("curral");
  });

  it("procedure recebe só o payload operacional, sem sexo/categoria/fazenda do frontend", () => {
    expect(router).toContain("receberAnimal:");
    expect(router).toContain("receberAnimalCompra(ctx.user.id, input");
    const start = router.indexOf("receberAnimal: protectedProcedure");
    const chunk = router.slice(start, router.indexOf("delete: protectedProcedure", start));
    expect(chunk).toContain("compraId");
    expect(chunk).toContain("compraGrupoId");
    expect(chunk).toContain("brincoVisual");
    expect(chunk).toContain("dataRecebimento");
    expect(chunk).not.toMatch(/\bsexo:/);
    expect(chunk).not.toMatch(/\bcategoria:/);
    expect(chunk).not.toMatch(/\bfazendaId:/);
    expect(chunk).not.toMatch(/\buserId:/);
    expect(chunk).not.toMatch(/\bpesoAtual:/);
    expect(service).toContain("sexo: grupo.sexo");
    expect(service).toContain("categoria: grupo.categoria");
    expect(service).toContain("fazendaId = Number(compra.fazendaId)");
    expect(service).toContain("compraId: parsed.compraId");
    expect(service).toContain("compraGrupoId: grupo.id");
    expect(dbAdapter).toContain("FOR UPDATE");
    expect(dbAdapter).not.toContain("pesoEntrada:");
  });

  it("tela confirma contínuo, guarda memória operacional e não inventa peso", () => {
    expect(page).toContain("Recebimento da Compra");
    expect(page).toContain("Recebimento do animal");
    expect(page).toContain('titulo="Identificação"');
    expect(page).toContain('titulo="Entrada"');
    expect(page).toContain('id="recebimento-equipamentos"');
    expect(page).toContain('variant="strip"');
    expect(page).toMatch(
      /mostraEquipamentos = compraConcluida && !cancelada && \(data\?\.identificacao\.pendentes/,
    );
    expect(page.match(/<At05RfidReaderControl/g)?.length).toBe(1);
    expect(page.match(/<RecebimentoS3ReaderControl/g)?.length).toBe(1);
    expect(page).not.toContain("CampoRecebimento");
    expect(page).not.toContain("FaixaEquipamento");
    expect(page).not.toContain("CurralEquipamentoCard");
    expect(page).not.toContain('variant="hub"');
    expect(page).not.toContain("Complementar");
    expect(page).not.toContain("Observações");
    expect(page).not.toContain("setObservacoes");
    expect(page).not.toContain("Ler RFID");
    expect(page).not.toContain("Ler Peso");
    expect(page).toContain("RecebimentoS3ReaderControl");
    expect(page).toContain("consumirPesoS3AposConfirmar");
    expect(page).toContain("Data do recebimento");
    expect(page).toContain("Confirmar entrada e próximo");
    expect(page).toContain("Último animal recebido");
    expect(page).toContain("id=\"recebimento-brinco\"");
    expect(page).toContain("id=\"recebimento-rfid\"");
    expect(page).toContain("id=\"recebimento-peso\"");
    expect(page).toContain("setBrincoVisual(\"\")");
    expect(page).toContain("setRfid(\"\")");
    expect(page).toContain("setPesoEntrada(\"\")");
    expect(page).not.toContain("setGrupoId(null)");
    expect(page).not.toContain("setLoteId(\"\")");
    expect(page).not.toContain("setPastoId(\"\")");
    expect(page).not.toContain("setRaca(\"\")");
    expect(page).not.toContain("setDataRecebimento(");
    expect(page).toContain("formatPesoRecebido(ultimo.pesoKg)");
    expect(detalhe).toContain("Receber / Identificar animais");
  });

  it("novos recebimentos gravam vínculo estrutural; manejo posterior não", () => {
    expect(service).toContain("insertRecebimento");
    expect(service).toContain("compraRecebimentoId: recebimentoId");
    expect(dbAdapter).toContain("compraRecebimentos");
    expect(page).not.toContain("Desfazer");
    expect(page).not.toContain("desfazerRecebimento");
    expect(page).not.toContain("compra_recebimentos");
    expect(page).not.toContain("compraRecebimentoId");
    const estornoStart = router.indexOf("desfazerRecebimento: protectedProcedure");
    expect(estornoStart).toBeGreaterThan(-1);
    const estornoChunk = router.slice(
      estornoStart,
      router.indexOf("delete: protectedProcedure", estornoStart),
    );
    expect(estornoChunk).toContain("desfazerRecebimentoCompra");
    expect(estornoChunk).not.toContain("assertAnimalPodeExcluir");
    expect(estornoChunk).not.toContain("animais.delete");
    const pesagemManejo = router.slice(
      router.indexOf("const result = await db.insert(pesagens)"),
      router.indexOf("await db.update(animais).set({ pesoAtual"),
    );
    expect(pesagemManejo).toContain("insert(pesagens)");
    expect(pesagemManejo).not.toContain("compraRecebimentoId");
    expect(transferencia).toContain("insert(animalLoteMovimentacoes)");
    expect(transferencia).not.toContain("compraRecebimentoId");
  });

  it("testes de serviço usam fixtures isoladas, nunca a Compra 1", () => {
    expect(serviceTest).toContain("9001");
    expect(serviceTest).toContain("9101");
    expect(serviceTest).not.toMatch(/compraId:\s*1\b/);
    expect(serviceTest).not.toMatch(/id:\s*1,\s*userId:\s*7,\s*fazendaId/);
  });
});
