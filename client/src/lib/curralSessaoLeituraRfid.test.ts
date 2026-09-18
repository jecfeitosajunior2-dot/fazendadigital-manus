import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  contextoAposFinalizarAnimal,
  contextoAposTrocaRfid,
  decidirLeituraRfidSessaoCurral,
  deveFinalizarAnimalAposManejo,
  efeitosLeituraRfidSessaoCurral,
  estadoAtendimentoSessaoCurral,
  estadoFormularioPesoAposAvancar,
  identidadeAtendimentoSessao,
  leituraRfidEhDoAnimalAtual,
  rotuloAguardandoAnimal,
  textoAvisoAnimalEmAtendimento,
} from "./curralSessaoLeituraRfid";
import { subtituloScaleCard } from "./hardware/scaleTransport";
import { truTestS3RequestOptions } from "./hardware/truTestBle";
import {
  getAt05SharedSessionSnapshot,
  shutdownAt05SharedSession,
} from "@/hooks/useAt05Reader";
import {
  getTruTestBleSharedSnapshot,
  shutdownTruTestBleSharedSession,
} from "@/hooks/useTruTestBleReader";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
  return readFileSync(resolve(here, rel), "utf8");
}

describe("RFID do próprio animal durante Pesagem (cenário A validado)", () => {
  const rfidAnimal84 = "963000400650112";

  it("reconhece o RFID do animal 84 e permanece no contexto", () => {
    expect(leituraRfidEhDoAnimalAtual(rfidAnimal84, "963000400650112")).toBe(true);
    expect(leituraRfidEhDoAnimalAtual(` ${rfidAnimal84} `, rfidAnimal84)).toBe(true);

    const decisao = decidirLeituraRfidSessaoCurral({
      temAnimalAtual: true,
      capturaNovoRfidAtiva: false,
      rfidLido: rfidAnimal84,
      rfidAnimalAtual: rfidAnimal84,
    });
    expect(decisao).toBe("manter_contexto_animal");

    const efeitos = efeitosLeituraRfidSessaoCurral(decisao);
    expect(efeitos).toEqual({
      trocaAnimal: false,
      criaRegistro: false,
      mostraErro: false,
      mostraAviso: false,
      reiniciaSessao: false,
      permaneceNoManejoAtual: true,
    });
  });

  it("cadastro rápido captura o RFID em vez de identificar", () => {
    const decisao = decidirLeituraRfidSessaoCurral({
      temAnimalAtual: false,
      capturaNovoRfidAtiva: true,
      rfidLido: "963000400650112",
    });
    expect(decisao).toBe("capturar_novo_rfid");
    expect(efeitosLeituraRfidSessaoCurral(decisao).criaRegistro).toBe(false);
    expect(efeitosLeituraRfidSessaoCurral(decisao).trocaAnimal).toBe(false);
  });

  it("sem animal na sessão a leitura segue para identificação — sem criar registro sozinha", () => {
    const decisao = decidirLeituraRfidSessaoCurral({
      temAnimalAtual: false,
      capturaNovoRfidAtiva: false,
    });
    expect(decisao).toBe("identificar_animal");
    expect(efeitosLeituraRfidSessaoCurral(decisao).criaRegistro).toBe(false);
  });

  it("RFID de outro animal, com animal já selecionado, não troca e avisa", () => {
    expect(leituraRfidEhDoAnimalAtual("963000400650051", "963000400650112")).toBe(false);
    const decisao = decidirLeituraRfidSessaoCurral({
      temAnimalAtual: true,
      capturaNovoRfidAtiva: false,
      rfidLido: "963000400650300",
      rfidAnimalAtual: "963000400650112",
    });
    expect(decisao).toBe("avisar_animal_em_atendimento");
    const efeitos = efeitosLeituraRfidSessaoCurral(decisao);
    expect(efeitos.trocaAnimal).toBe(false);
    expect(efeitos.criaRegistro).toBe(false);
    expect(efeitos.mostraErro).toBe(false);
    expect(efeitos.mostraAviso).toBe(true);
    expect(efeitos.permaneceNoManejoAtual).toBe(true);
    expect(textoAvisoAnimalEmAtendimento("84")).toBe(
      "Existe um animal em atendimento. Finalize o animal 84 antes de iniciar outro.",
    );
  });
});

describe("ciclo — um animal por vez", () => {
  it("animalId é a identidade do atendimento", () => {
    expect(identidadeAtendimentoSessao(84)).toBe(84);
    expect(identidadeAtendimentoSessao(null)).toBeNull();
    expect(estadoAtendimentoSessaoCurral(null)).toBe("aguardando_animal");
    expect(estadoAtendimentoSessaoCurral(84)).toBe("animal_em_atendimento");
    expect(rotuloAguardandoAnimal(false)).toBe("Aguardando animal");
    expect(rotuloAguardandoAnimal(true)).toBe("Aguardando próximo animal");
  });

  it("a fila de manejos só finaliza no último — não entre etapas", () => {
    expect(deveFinalizarAnimalAposManejo(0, 4)).toBe(false);
    expect(deveFinalizarAnimalAposManejo(1, 4)).toBe(false);
    expect(deveFinalizarAnimalAposManejo(2, 4)).toBe(false);
    expect(deveFinalizarAnimalAposManejo(3, 4)).toBe(true);
  });

  it("troca de RFID mantém o mesmo animalId", () => {
    const depois = contextoAposTrocaRfid(84, "963000400650112");
    expect(depois.animalId).toBe(84);
    expect(depois.rfidAtual).toBe("963000400650112");
    expect(
      decidirLeituraRfidSessaoCurral({
        temAnimalAtual: true,
        capturaNovoRfidAtiva: false,
        rfidLido: "963000400650112",
        rfidAnimalAtual: depois.rfidAtual,
      }),
    ).toBe("manter_contexto_animal");
  });

  it("finalizar animal limpa contexto e peso, sem apagar o conceito de sessão", () => {
    expect(contextoAposFinalizarAnimal()).toEqual({
      animalId: null,
      manejoAtualIdx: 0,
      novoPeso: "",
      pesoFonteBalanca: null,
    });
    expect(estadoAtendimentoSessaoCurral(contextoAposFinalizarAnimal().animalId)).toBe(
      "aguardando_animal",
    );
  });
});

describe("peso do formulário após avançar", () => {
  it("não herda peso do animal anterior", () => {
    expect(estadoFormularioPesoAposAvancar()).toEqual({
      novoPeso: "",
      pesoFonteBalanca: null,
    });
  });
});

describe("independência AT05 × S3 BLE", () => {
  it("S3 BLE não usa Web Serial e AT05 não usa Web Bluetooth", () => {
    expect(readSrc("./hardware/truTestBle.ts")).not.toMatch(/navigator\.serial/);
    expect(readSrc("./hardware/at05Serial.ts")).not.toMatch(/navigator\.bluetooth/);
    expect(readSrc("../hooks/useTruTestBleReader.ts")).not.toMatch(/navigator\.serial/);
    expect(readSrc("../hooks/useAt05Reader.ts")).not.toMatch(/navigator\.bluetooth/);
    expect(truTestS3RequestOptions().acceptAllDevices).toBe(true);
  });

  it("BLE conectada não mostra COM", () => {
    expect(subtituloScaleCard({ connected: true, transport: "ble", usbCom: "COM5" })).toBe(
      "Bluetooth",
    );
  });

  it("desligar um equipamento não altera o snapshot do outro", async () => {
    const at05Antes = getAt05SharedSessionSnapshot();
    await shutdownTruTestBleSharedSession("test-isolamento-ble");
    expect(getAt05SharedSessionSnapshot()).toEqual(at05Antes);

    const bleAntes = getTruTestBleSharedSnapshot();
    await shutdownAt05SharedSession("test-isolamento-at05");
    expect(getTruTestBleSharedSnapshot()).toEqual(bleAntes);
  });
});

describe("POCs de diagnóstico preservadas", () => {
  it("mantém as rotas isoladas", () => {
    const app = readSrc("../App.tsx");
    expect(app).toContain('path="/diagnostico/at05"');
    expect(app).toContain('path="/diagnostico/trutest-s3"');
  });
});

describe("ciclo de vida — equipamentos pertencem à sessão", () => {
  it("hooks de AT05, USB e BLE ficam na página da sessão, antes do hub", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    const sessao = page.slice(page.indexOf("export function ManejoSessaoPage"));
    const at05 = sessao.indexOf("useAt05Reader({");
    const usb = sessao.indexOf("useScaleReader({");
    const ble = sessao.indexOf("useTruTestBleReader({");
    const hub = sessao.indexOf('if (fase === "hub")');
    expect(at05).toBeGreaterThan(0);
    expect(usb).toBeGreaterThan(at05);
    expect(ble).toBeGreaterThan(usb);
    expect(hub).toBeGreaterThan(ble);
    expect(sessao).toContain("session={at05CurralSession}");
    expect(sessao).toContain("session={scaleCurralSession}");
    expect(sessao).toContain("bleSession={bleCurralSession}");
    expect(sessao).not.toMatch(/useAt05Reader\(\{[^}]*manejoAtualId/);
  });

  it("card compacto do AT05 some com animal selecionado, mas o hook da sessão permanece", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    expect(page).toMatch(/\{!animalSel && fazendaNum && !cadastroCurral\.aberto \? \(/);
    expect(page).toMatch(/variant="compact"/);
    expect(page).toContain("const at05CurralSession = useAt05Reader({");
    expect(page).toContain("at05OnReadCurral");
  });

  it("Identificação → Pesagem só troca o painel; não recria os hooks", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    const sessao = page.slice(page.indexOf("export function ManejoSessaoPage"));
    expect(sessao).toContain('manejoAtualId === "pesagem"');
    expect(sessao).toContain("avancarFilaManejoAnimal");
    expect(sessao.match(/useAt05Reader\(/g)?.length).toBe(1);
    expect(sessao.match(/useTruTestBleReader\(/g)?.length).toBe(1);
    expect(sessao.match(/useScaleReader\(/g)?.length).toBe(1);
  });

  it("peso da balança só preenche o campo — registro exige clique explícito", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    expect(page).toMatch(/bindScaleStableWeight\(kg => \{\s*setPesoFonteBalanca/);
    expect(page).toContain("aplicarPesoBalanca(kg)");
    expect(page).toContain("onClick={registrarPesagemCurral}");
    const bindBlock = page.slice(
      page.indexOf("return bindScaleStableWeight(kg =>"),
      page.indexOf("}, [animalSel, aplicarPesoBalanca, bindScaleStableWeight, fase, manejoAtualId]"),
    );
    expect(bindBlock).not.toMatch(/pesagens\.create|pesagemMutation\.mutate|setHistoricoSessao/);
  });

  it("não hardcodar COM5 no AT05 da sessão", () => {
    expect(readSrc("../hooks/useAt05Reader.ts")).not.toMatch(/["']COM5["']/);
    expect(readSrc("./hardware/serialPortHints.ts")).not.toMatch(/["']COM5["']/);
    const sessao = readSrc("../pages/ManejoPages.tsx").slice(
      readSrc("../pages/ManejoPages.tsx").indexOf("export function ManejoSessaoPage"),
    );
    expect(sessao).not.toMatch(/["']COM5["']/);
  });
});

describe("UI operacional da Tru-Test S3 BLE", () => {
  it("card da sessão não expõe GATT, UUID nem Nordic UART", () => {
    const card = readSrc("../components/curral/CurralEquipamentoCard.tsx");
    const scale = readSrc("../components/curral/ScaleReaderControl.tsx");
    for (const src of [card, scale]) {
      expect(src).not.toMatch(/181D|2A9D|0x181D|0x2A9D|Nordic UART|GATT/i);
    }
    expect(readSrc("./hardware/scaleTransport.ts")).toContain('"Aguardando peso..."');
    expect(readSrc("../components/curral/CurralBalancaTransportDialog.tsx")).toContain(
      "Sem cabo — recomendado para uso no curral.",
    );
    expect(readSrc("../components/curral/CurralBalancaTransportDialog.tsx")).toContain(
      "Cabo USB — alternativa.",
    );
    expect(scale).toContain('variant === "hub" && bleSession');
  });
});

describe("shutdown só com o último hook da sessão", () => {
  it("AT05 e S3 BLE só desligam quando hookAliveCount chega a 0", () => {
    expect(readSrc("../hooks/useAt05Reader.ts")).toContain("if (hookAliveCount === 0)");
    expect(readSrc("../hooks/useTruTestBleReader.ts")).toContain("if (hookAliveCount === 0)");
    expect(readSrc("../hooks/useScaleReader.ts")).toContain("if (hookAliveCount === 0)");
  });
});

describe("Sessão no Curral — ciclo operacional na página", () => {
  it("Cadastro rápido registra captura AT05 na sessão, sem salvar o animal", () => {
    const cadastro = readSrc("../components/curral/CurralCadastroAnimalPanel.tsx");
    const sessao = readSrc("../pages/ManejoPages.tsx").slice(
      readSrc("../pages/ManejoPages.tsx").indexOf("export function ManejoSessaoPage"),
    );
    expect(cadastro).toContain("registerNovoRfidCapture");
    expect(cadastro).toContain("registerNovoRfidCapture(onTag)");
    expect(cadastro).toContain("Salvar e manejar");
    expect(sessao).toContain("registerNovoRfidCapture={registerCurralNovoRfidCapture}");
    expect(cadastro).not.toMatch(/onSalvarEManejar\(.*rfid/);
  });

  it("aguarda animal, RFID define o atual e outro RFID só avisa", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    const sessao = page.slice(page.indexOf("export function ManejoSessaoPage"));
    expect(sessao).toContain("rotuloAguardandoAnimal");
    expect(sessao).toContain("onRfidRead={identificarPorRfid}");
    expect(sessao).toContain("textoAvisoAnimalEmAtendimento");
    expect(sessao).toContain("identidadeAtendimentoSessao(animalId)");
    expect(sessao).toContain("avisar_animal_em_atendimento");
    expect(sessao).toContain("setAnimalId(a.id)");
    expect(sessao).toContain("setHistoricoSessao(prev => [...prev, item])");
    expect(sessao).toContain('toast.error("Conclua ou descarte o animal atual antes de encerrar a sessão.")');
    expect(sessao).not.toMatch(/onRfidRead=\{preencherRfidNoDisplay\}/);
  });

  it("Trocar animal não encerra a sessão", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    const sessao = page.slice(page.indexOf("export function ManejoSessaoPage"));
    expect(sessao).toMatch(/onClick=\{\(\) => handleAnimalSelect\(null\)\}/);
    expect(sessao).toContain("Encerrar sessão");
    expect(sessao).toContain("limparContextoAnimal");
  });
});

describe("Identificação pontual sem bastão", () => {
  it("não conecta AT05 nem oferece ler RFID no formulário pontual", () => {
    const page = readSrc("../pages/ManejoPages.tsx");
    const start = page.indexOf("function ManejoBrincoEletronicoForm");
    const end = page.indexOf("type SessaoFase");
    const pontual = page.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(pontual).not.toContain("useAt05Reader");
    expect(pontual).not.toContain("Ler com bastão");
    expect(pontual).not.toContain("Leitura RFID / Bastão");
    expect(pontual).not.toContain("Conectar bastão");
    expect(pontual).toContain("Informe o RFID");
    expect(pontual).not.toContain("FormDownSelect");
    expect(pontual).toContain("Selecione a operação");
    expect(page.slice(end)).toContain("useAt05Reader");
  });
});
