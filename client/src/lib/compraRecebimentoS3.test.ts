import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  aplicarEdicaoManualPesoRecebimento,
  aplicarLeituraPesoS3Recebimento,
  consumirPesoS3AposConfirmar,
  estadoInicialPesoS3Recebimento,
  pesoRecebimentoParaPayload,
  rotuloStatusS3Recebimento,
} from "./compraRecebimentoS3";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraRecebimentoPage.tsx"), "utf8");
const hook = readFileSync(resolve(here, "../hooks/useTruTestBleReader.ts"), "utf8");
const at05Hook = readFileSync(resolve(here, "../hooks/useAt05Reader.ts"), "utf8");
const control = readFileSync(
  resolve(here, "../components/venda/RecebimentoS3ReaderControl.tsx"),
  "utf8",
);

function livre() {
  return estadoInicialPesoS3Recebimento();
}

describe("S3 no recebimento da Compra — só preenche o peso", () => {
  it("A) peso válido 300 preenche o campo", () => {
    const decisao = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: livre(),
    });
    expect(decisao).toMatchObject({
      aplicar: true,
      kg: 300,
      textoCampo: "300",
    });
    if (!decisao.aplicar) throw new Error("esperado aplicar");
    expect(decisao.estado.origem).toBe("s3");
    expect(decisao.estado.fase).toBe("capturado");
    expect(decisao.estado.pesoCampo).toBe("300");
  });

  it("B) zero / inválido não viram peso do animal", () => {
    for (const kg of [0, 0.0, -0, -3, 0.4, Number.NaN, Number.POSITIVE_INFINITY]) {
      const decisao = aplicarLeituraPesoS3Recebimento({
        kg,
        aceitandoLeituras: true,
        estado: livre(),
      });
      expect(decisao.aplicar).toBe(false);
      expect(decisao.estado.pesoCampo).toBe("");
      expect(decisao.estado.origem).toBeNull();
    }
  });

  it("C) leitura S3 não confirma o animal", () => {
    const decisao = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: livre(),
    });
    expect(decisao.aplicar).toBe(true);
    expect(page).toContain("onWeight: kg => aplicarPesoS3Ref.current(kg)");
    expect(page).toContain('onClick={() => void handleConfirmar()}');
    expect(page).not.toContain("Ler Peso");
    expect(page).not.toContain("aplicarPesoS3Ref.current(kg); void handleConfirmar");
  });

  it("D) correção manual 301 não volta para 300 no mesmo ciclo", () => {
    const capturado = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: livre(),
    });
    expect(capturado.aplicar).toBe(true);
    const manual = aplicarEdicaoManualPesoRecebimento(capturado.estado, "301");
    expect(manual.origem).toBe("manual");
    expect(manual.pesoCampo).toBe("301");
    expect(pesoRecebimentoParaPayload(manual.pesoCampo)).toBe("301");

    const residual = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: manual,
    });
    expect(residual).toMatchObject({ aplicar: false, motivo: "ciclo_capturado" });
    expect(residual.estado.pesoCampo).toBe("301");
    expect(residual.estado.origem).toBe("manual");
  });

  it("E) depois de confirmar, residual 300 não entra no próximo formulário", () => {
    const capturado = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: livre(),
    });
    const proximo = consumirPesoS3AposConfirmar(capturado.estado);
    expect(proximo.pesoCampo).toBe("");
    expect(proximo.origem).toBeNull();
    expect(proximo.fase).toBe("aguardando_zero");

    const residual = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: proximo,
    });
    expect(residual).toMatchObject({ aplicar: false, motivo: "aguardando_zero" });
    expect(residual.estado.pesoCampo).toBe("");
  });

  it("F) zero libera o ciclo; novo peso 320 preenche o próximo", () => {
    const aposConfirmar = consumirPesoS3AposConfirmar(
      aplicarLeituraPesoS3Recebimento({
        kg: 300,
        aceitandoLeituras: true,
        estado: livre(),
      }).estado,
    );
    const zero = aplicarLeituraPesoS3Recebimento({
      kg: 0,
      aceitandoLeituras: true,
      estado: aposConfirmar,
    });
    expect(zero.aplicar).toBe(false);
    expect(zero.estado.fase).toBe("livre");
    expect(zero.estado.pesoCampo).toBe("");

    const novo = aplicarLeituraPesoS3Recebimento({
      kg: 320,
      aceitandoLeituras: true,
      estado: zero.estado,
    });
    expect(novo).toMatchObject({ aplicar: true, kg: 320, textoCampo: "320" });
  });

  it("G) modo manual continua disponível com S3 bloqueada ou desconectada", () => {
    const bloqueada = consumirPesoS3AposConfirmar(
      aplicarLeituraPesoS3Recebimento({
        kg: 300,
        aceitandoLeituras: true,
        estado: livre(),
      }).estado,
    );
    const digitado = aplicarEdicaoManualPesoRecebimento(bloqueada, "315");
    expect(digitado.pesoCampo).toBe("315");
    expect(digitado.origem).toBe("manual");
    expect(digitado.fase).toBe("aguardando_zero");
    expect(page).toContain('id="recebimento-peso"');
    expect(page).toContain("onChange={valor => {");
    expect(page).not.toMatch(/id="recebimento-peso"[\s\S]{0,400}disabled=\{s3/);
  });

  it("H) reconectar não cria segundo listener no driver compartilhado", () => {
    expect(hook).toContain("weightListeners.add(fn)");
    expect(hook).toContain("weightListeners.delete(fn)");
    expect(hook).toContain("if (connectInFlight || getShared().shuttingDown) return");
    expect(page.match(/useTruTestBleReader\(/g)?.length).toBe(1);
    expect(control).not.toContain("useTruTestBleReader(");
  });

  it("I) unmount remove o listener e encerra a sessão BLE se ninguém mais usa", () => {
    expect(hook).toContain("weightListeners.delete(fn)");
    expect(hook).toContain("if (hookAliveCount === 0)");
    expect(hook).toContain('shutdownTruTestBleSharedSession("effect-cleanup")');
    expect(page).toContain("useTruTestBleReader({");
  });

  it("J) AT05 continua independente da S3", () => {
    expect(page).toContain("useAt05Reader({");
    expect(page).toContain("useTruTestBleReader({");
    expect(page).toContain('id="recebimento-equipamentos"');
    expect(page.indexOf('id="recebimento-equipamentos"')).toBeLessThan(page.indexOf('id="recebimento-peso"'));
    expect(page).toContain("aplicarRfidLidoRef");
    expect(page).toContain("aplicarPesoS3Ref");
    expect(page).not.toContain("useScaleReader");
    expect(page).not.toContain("ScaleReaderControl");
    expect(at05Hook).toContain("return pushAt05OnRead(handler)");
    expect(hook).not.toContain("useAt05Reader");
  });

  it("K) peso capturado pela S3 usa o mesmo payload do peso manual", () => {
    const s3 = aplicarLeituraPesoS3Recebimento({
      kg: 300,
      aceitandoLeituras: true,
      estado: livre(),
    });
    expect(pesoRecebimentoParaPayload(s3.estado.pesoCampo)).toBe("300");
    const manual = aplicarEdicaoManualPesoRecebimento(livre(), "300");
    expect(pesoRecebimentoParaPayload(manual.pesoCampo)).toBe("300");
    expect(page).toContain("pesoEntrada: pesoEntrada.trim() || null");
    expect(page).not.toContain("pesoAtual");
    expect(page).not.toContain("receberAnimalCompra");
  });

  it("zero durante a confirmação ainda libera o próximo ciclo", () => {
    const aposConfirmar = consumirPesoS3AposConfirmar(
      aplicarLeituraPesoS3Recebimento({
        kg: 300,
        aceitandoLeituras: true,
        estado: livre(),
      }).estado,
    );
    const zero = aplicarLeituraPesoS3Recebimento({
      kg: 0,
      aceitandoLeituras: false,
      estado: aposConfirmar,
    });
    expect(zero.estado.fase).toBe("livre");
    expect(
      aplicarLeituraPesoS3Recebimento({
        kg: 320,
        aceitandoLeituras: true,
        estado: zero.estado,
      }).aplicar,
    ).toBe(true);
  });

  it("status reflete conexão real, sem inventar equipamento", () => {
    expect(rotuloStatusS3Recebimento({ sessionActive: false, connecting: false })).toBe("");
    expect(rotuloStatusS3Recebimento({ sessionActive: false, connecting: true })).toBe(
      "Conectando à balança...",
    );
    expect(rotuloStatusS3Recebimento({ sessionActive: true, connecting: false })).toBe(
      "Balança conectada",
    );
    expect(control).toContain("Balança desconectada");
    expect(control).toContain("Balança conectada");
    expect(control).toContain("Tru-Test S3");
    expect(control).toContain("SessaoEquipamentoLinha");
    expect(control).not.toContain("S3 escutando");
    expect(control).not.toContain("CurralEquipamentoCard");
  });
});
