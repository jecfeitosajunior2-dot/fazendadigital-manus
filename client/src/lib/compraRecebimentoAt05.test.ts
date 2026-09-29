import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HINT_RECEBIMENTO_IDENTIFICACAO,
  MSG_RECEBIMENTO_IDENTIFICACAO,
  temIdentificacaoRecebimento,
} from "@shared/compraRecebimento";
import {
  aplicarRfidNoFormularioRecebimento,
  decidirLeituraAt05RecebimentoCompra,
  deveAplicarRfidRecebimentoCompra,
  deveGuardarRfidPendenteRecebimento,
  formularioRecebimentoAptoParaRfid,
  proximoCicloCapturaRecebimento,
  rfidIdentificacaoAt05NaLinha,
  rotuloStatusAt05Recebimento,
} from "./compraRecebimentoAt05";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "../pages/CompraRecebimentoPage.tsx"), "utf8");
const hook = readFileSync(resolve(here, "../hooks/useAt05Reader.ts"), "utf8");
const labels = readFileSync(resolve(here, "./hardware/serialPortLabels.ts"), "utf8");
const venda = readFileSync(resolve(here, "../pages/NovaVendaPage.tsx"), "utf8");
const curral = readFileSync(resolve(here, "../pages/ManejoPages.tsx"), "utf8");
const control = readFileSync(resolve(here, "../components/At05RfidReaderControl.tsx"), "utf8");

describe("AT05 no recebimento da Compra — só preenche RFID", () => {
  it("A — sem porta escolhida o connect cai em requestPort; não auto-escolhe getPorts", () => {
    const resolveFn = labels.slice(
      labels.indexOf("export async function resolveAt05PortForConnect"),
      labels.indexOf("export async function resolveScalePortForConnect"),
    );
    expect(resolveFn).toContain("const port = await requestNewPort()");
    expect(resolveFn).toContain('source: "requested"');
    expect(resolveFn).not.toContain("podeReutilizarPortaAt05Autorizada");
    expect(resolveFn).not.toContain("getPorts()");
  });

  it("B — Conectar abre o seletor nativo do Chrome; sem modal Porta 1…N", () => {
    expect(control).toContain("void connect().catch");
    expect(control).not.toContain("At05PortaPickerDialog");
    expect(control).not.toContain("listarPortasAt05ParaEscolha");
    expect(control).not.toContain("Trocar porta");
    expect(control).not.toContain("getPorts()");
    expect(hook).toContain("resolveAt05PortForConnect");
    expect(hook).toContain("requestPortFromUserGesture");
    expect(hook).toContain("isPortSelectionCancelled");
    expect(hook).toContain("openAt05PortWithRetry");
    expect(hook).toContain("startRxLoop(port, connectGen)");
    expect(hook).toContain("rxProvenPort");
    expect(hook).not.toContain("preferredPort");
    expect(hook).not.toContain("closeAt05PortForFreshOpen");
    expect(hook).not.toContain("releaseSerialPortBeforeAt05Open");
    expect(page).not.toContain("At05RecebimentoDiagCard");
    expect(page).not.toContain("Diagnóstico AT05");
    expect(page).toContain("RecebimentoS3ReaderControl");
    expect(page).toContain("useTruTestBleReader");
    expect(page).not.toContain("useScaleReader");
  });

  it("C — connect resolve a porta antes do cleanup e inicia o RX loop", () => {
    const resolveIdx = hook.indexOf("RESOLVE PORT START");
    const cleanupIdx = hook.indexOf('shutdownAt05SharedSession("pre-open-other-port")');
    const loopIdx = hook.indexOf("const loopPromise = startRxLoop(port, connectGen)");
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(cleanupIdx).toBeGreaterThan(resolveIdx);
    expect(loopIdx).toBeGreaterThan(cleanupIdx);
    expect(hook).toContain("syncStatus(\"connected\")");
    expect(hook).toContain("syncStatus(\"listening\")");
  });

  it("D — linha RFID válida chega ao parser compartilhado", () => {
    expect(rfidIdentificacaoAt05NaLinha("963000400291061")).toBe("963000400291061");
    expect(rfidIdentificacaoAt05NaLinha("AT+SPPCONN=ECBDA7F30A3C")).toBeNull();
    expect(rfidIdentificacaoAt05NaLinha("999090000000055")).toBeNull();
    expect(hook).toContain("createAt05OnlineRxProcessor");
    expect(hook).toContain("rxProcessor.pushChunk(chunk)");
  });

  it("E/F — identificação chega ao handler da Compra e preenche o campo", () => {
    const ciclo = 1;
    const decisao = decidirLeituraAt05RecebimentoCompra({
      line: "963000400291061\r\n".replace(/\r\n$/, ""),
      aceitandoLeituras: true,
      cicloAtual: ciclo,
      cicloDaLeitura: ciclo,
    });
    expect(decisao).toEqual({ aplicar: true, rfid: "963000400291061" });
    expect(aplicarRfidNoFormularioRecebimento("", decisao.aplicar ? decisao.rfid : "")).toBe(
      "963000400291061",
    );
    expect(page).toContain("onRead: rfidLido => aplicarRfidLidoRef.current(rfidLido)");
    expect(page).toContain("onRfidRead={aplicarRfidLido}");
    expect(page).toContain('id="recebimento-rfid"');
    expect(page).toContain("setRfid(decisao.rfid)");
  });

  it("G — leitura não confirma nem cria animal", () => {
    const aplicar = page.slice(
      page.indexOf("const aplicarRfidLido = useCallback"),
      page.indexOf("const aplicarRfidLidoRef"),
    );
    expect(aplicar).toContain("setRfid(decisao.rfid)");
    expect(aplicar).not.toContain("receberMut");
    expect(aplicar).not.toContain("receberAnimal");
    expect(aplicar).not.toContain("mutateAsync");
    expect(page).not.toContain("receberAnimalCompra");
    expect(page).not.toContain("animais.create");
  });

  it("H — leitura repetida só substitui o RFID, sem efeito colateral", () => {
    expect(aplicarRfidNoFormularioRecebimento("963000400291061", "963000400315712")).toBe(
      "963000400315712",
    );
    const primeira = deveAplicarRfidRecebimentoCompra({
      rfid: "963000400291061",
      aceitandoLeituras: true,
      cicloAtual: 1,
      cicloDaLeitura: 1,
    });
    const segunda = deveAplicarRfidRecebimentoCompra({
      rfid: "963000400315712",
      aceitandoLeituras: true,
      cicloAtual: 1,
      cicloDaLeitura: 1,
    });
    expect(primeira.aplicar).toBe(true);
    expect(segunda.aplicar).toBe(true);
    expect(page).not.toContain("Ler RFID");
  });

  it("I — após confirmar, limpa campos e segue o ciclo para o próximo", () => {
    expect(page).toContain('setBrincoVisual("")');
    expect(page).toContain('setRfid("")');
    expect(page).toContain('setPesoEntrada("")');
    expect(page).toContain("cicloCapturaRef.current = proximoCicloCapturaRecebimento");
    expect(page).toContain("focarIdentificacao(");
    expect(page).not.toContain("void at05.disconnect");
    expect(page).not.toContain("at05.disconnect(");
    const cicloDepois = proximoCicloCapturaRecebimento(3);
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "963000400315712",
        aceitandoLeituras: true,
        cicloAtual: cicloDepois,
        cicloDaLeitura: cicloDepois,
      }).aplicar,
    ).toBe(true);
  });

  it("J — modo manual continua funcionando", () => {
    expect(page).toContain('id="recebimento-rfid"');
    expect(page).toContain("onChange={setRfid}");
    expect(page).toContain("placeholder=\"Opcional\"");
  });

  it("K — desmontagem da página limpa listener/sessão compartilhada", () => {
    expect(hook).toContain("return pushAt05OnRead(handler)");
    expect(hook).toContain("if (hookAliveCount === 0)");
    expect(hook).toContain('void shutdownAt05SharedSession("effect-cleanup")');
  });

  it("L — Venda/Curral seguem no mesmo driver, sem parser paralelo da Compra", () => {
    expect(venda).toContain("At05RfidReaderControl");
    expect(venda).toContain('mode="identificar"');
    expect(venda).toContain("continuous");
    expect(curral).toContain("const at05CurralSession = useAt05Reader({");
    expect(curral).toContain("session={at05CurralSession}");
    expect(control).toContain("useAt05Reader");
    expect(page).toContain("useAt05Reader({");
    expect(page).not.toContain("createAt05LineParser");
    expect(page).not.toContain("navigator.serial");
  });

  it("leitura válida atualiza o campo RFID", () => {
    const ciclo = 1;
    const decisao = deveAplicarRfidRecebimentoCompra({
      rfid: "  RFID-MOCK-A  ",
      aceitandoLeituras: true,
      cicloAtual: ciclo,
      cicloDaLeitura: ciclo,
    });
    expect(decisao).toEqual({ aplicar: true, rfid: "RFID-MOCK-A" });
    expect(aplicarRfidNoFormularioRecebimento("", "RFID-MOCK-A")).toBe("RFID-MOCK-A");
  });

  it("formulário só aceita RFID com grupo pendente e sem confirmação em curso", () => {
    expect(
      formularioRecebimentoAptoParaRfid({
        grupoSelecionado: true,
        pendentes: 1,
        confirmando: false,
      }),
    ).toBe(true);
    expect(
      formularioRecebimentoAptoParaRfid({
        grupoSelecionado: false,
        pendentes: 1,
        confirmando: false,
      }),
    ).toBe(false);
    expect(
      formularioRecebimentoAptoParaRfid({
        grupoSelecionado: true,
        pendentes: 0,
        confirmando: false,
      }),
    ).toBe(false);
    expect(
      formularioRecebimentoAptoParaRfid({
        grupoSelecionado: true,
        pendentes: 1,
        confirmando: true,
      }),
    ).toBe(false);
  });

  it("guarda RFID pendente se o grupo ainda não estiver aberto", () => {
    expect(
      deveGuardarRfidPendenteRecebimento({ motivo: "nao_aceitando", confirmando: false }),
    ).toBe(true);
    expect(
      deveGuardarRfidPendenteRecebimento({ motivo: "nao_aceitando", confirmando: true }),
    ).toBe(false);
    expect(
      deveGuardarRfidPendenteRecebimento({ motivo: "ciclo_stale", confirmando: false }),
    ).toBe(false);
    expect(page).toContain("rfidPendenteRef");
  });

  it("depois de confirmar, ciclo novo ignora leitura stale do animal anterior", () => {
    const cicloAntes = 3;
    const cicloDepois = proximoCicloCapturaRecebimento(cicloAntes);
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "RFID-MOCK-A",
        aceitandoLeituras: true,
        cicloAtual: cicloDepois,
        cicloDaLeitura: cicloAntes,
      }),
    ).toEqual({ aplicar: false, motivo: "ciclo_stale" });
  });

  it("não aplica leitura sem formulário aberto ou durante a confirmação", () => {
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "RFID-MOCK-A",
        aceitandoLeituras: false,
        cicloAtual: 1,
        cicloDaLeitura: 1,
      }),
    ).toEqual({ aplicar: false, motivo: "nao_aceitando" });
    expect(
      decidirLeituraAt05RecebimentoCompra({
        line: "AT+SPPDISC",
        aceitandoLeituras: true,
        cicloAtual: 1,
        cicloDaLeitura: 1,
      }),
    ).toEqual({ aplicar: false, motivo: "nao_identificacao" });
  });

  it("status reflete conexão real, sem inventar equipamento", () => {
    expect(rotuloStatusAt05Recebimento({ sessionActive: false, connecting: false })).toBe("");
    expect(rotuloStatusAt05Recebimento({ sessionActive: false, connecting: true })).toBe(
      "AT05 conectando...",
    );
    expect(rotuloStatusAt05Recebimento({ sessionActive: true, connecting: false })).toBe(
      "AT05 conectado",
    );
  });

  it("tela reusa o hook, escuta contínua e não confirma no bip", () => {
    expect(page).toContain("useAt05Reader({");
    expect(page).toContain("formularioRecebimentoAptoParaRfid");
    expect(page).toContain('id="recebimento-equipamentos"');
    expect(page.indexOf('id="recebimento-equipamentos"')).toBeLessThan(page.indexOf('id="recebimento-rfid"'));
    expect(page).toContain('variant="strip"');
    expect(page).not.toContain('variant="hub"');
    expect(page).not.toContain("CurralEquipamentoCard");
    expect(page).toContain("continuous");
    expect(page).toContain('mode="identificar"');
    expect(page).toContain("proximoCicloCapturaRecebimento");
    expect(page).not.toContain("useScaleReader");
    expect(hook).toContain("return pushAt05OnRead(handler)");
    expect(hook).toContain("if (hookAliveCount === 0)");
  });
});

describe("Identificação Visual OU RFID no Recebimento", () => {
  it("1–4 — visual, RFID, ambos válidos; ambos vazios bloqueados", () => {
    expect(temIdentificacaoRecebimento("0001", "")).toBe(true);
    expect(temIdentificacaoRecebimento("", "963000400650144")).toBe(true);
    expect(temIdentificacaoRecebimento("0001", "963000400650144")).toBe(true);
    expect(temIdentificacaoRecebimento("  ", "")).toBe(false);
    expect(MSG_RECEBIMENTO_IDENTIFICACAO).toBe(
      "Informe o brinco visual ou o RFID para identificar o animal.",
    );
  });

  it("5–8 — RFID com visual vazio ou preenchido; ordem livre", () => {
    expect(
      deveAplicarRfidRecebimentoCompra({
        rfid: "963000400650144",
        aceitandoLeituras: true,
        cicloAtual: 1,
        cicloDaLeitura: 1,
      }).aplicar,
    ).toBe(true);
    expect(aplicarRfidNoFormularioRecebimento("", "963000400650144")).toBe("963000400650144");
    expect(aplicarRfidNoFormularioRecebimento("0001", "963000400650144")).toBe("963000400650144");
    expect(temIdentificacaoRecebimento("0001", "963000400650144")).toBe(true);
    expect(page).toContain("HINT_RECEBIMENTO_IDENTIFICACAO");
    expect(HINT_RECEBIMENTO_IDENTIFICACAO).toContain("brinco visual ou RFID");
    expect(page).not.toContain("<FormLabel required>Brinco visual");
  });

  it("9–10 — AT05 não confirma; RFID manual permanece", () => {
    const aplicar = page.slice(
      page.indexOf("const aplicarRfidLido = useCallback"),
      page.indexOf("const aplicarRfidLidoRef"),
    );
    expect(aplicar).not.toContain("mutateAsync");
    expect(page).toContain("onChange={setRfid}");
    expect(page).toContain("temIdentificacaoRecebimento(brincoVisual, rfid)");
  });

  it("11–12 — tela não inventa visual e mantém unicidade no backend", () => {
    expect(page).not.toContain("setBrincoVisual(decisao.rfid)");
    const service = readFileSync(resolve(here, "../../../server/receberAnimalCompra.ts"), "utf8");
    expect(service).toContain("findBrincoAtivoConflito");
    expect(service).toContain("findRfidConflito");
    expect(service).toContain("brinco: parsed.brinco || null");
  });

  it("13–15 — após confirmar limpa identificação/peso/raça e mantém grupo/lote/pasto/AT05", () => {
    expect(page).toContain('setBrincoVisual("")');
    expect(page).toContain('setRfid("")');
    expect(page).toContain('setPesoEntrada("")');
    expect(page).toContain('setRaca("")');
    expect(page).not.toContain("setGrupoId(null)");
    expect(page).not.toContain('setLoteId("")');
    expect(page).not.toContain('setPastoId("")');
    expect(page).not.toContain("at05.disconnect(");
    expect(page).toContain("continuous");
    expect(hook).toContain("flushPending");
    expect(hook).toContain("AT05_RX_IDLE_FLUSH_MS");
  });
});
