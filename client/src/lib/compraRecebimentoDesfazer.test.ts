import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MSG_BLOQUEIO_ESTORNO_RECEBIMENTO,
  MSG_ESTORNO_RECEBIMENTO_MOTIVO,
  validarFormularioDesfazerRecebimento,
} from "@shared/compraRecebimentoEstorno";
import { podeMostrarAcaoDesfazerRecebimento } from "@shared/compraRecebimentosListagem";
import {
  TOAST_DESFAZER_RECEBIMENTO_SUCESSO,
  TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO,
  botaoDesfazerRecebimentoHabilitado,
  deveAceitarCliqueDesfazerRecebimento,
  deveFecharModalAposDesfazer,
  deveLimparUltimoRecebidoAposDesfazer,
  mensagemErroDesfazerRecebimento,
  montarPayloadDesfazerRecebimento,
  podeRemoverLinhaRecebimentoNaUi,
  queriesParaInvalidarAposDesfazerRecebimento,
} from "./compraRecebimentoDesfazer";

const here = dirname(fileURLToPath(import.meta.url));
const dialog = readFileSync(
  resolve(here, "../components/compra/DesfazerRecebimentoDialog.tsx"),
  "utf8",
);
const page = readFileSync(resolve(here, "../pages/CompraRecebimentoPage.tsx"), "utf8");

describe("PASSO 4 — conectar desfazer recebimento", () => {
  it("A. botão desabilitado sem motivo", () => {
    const form = validarFormularioDesfazerRecebimento({});
    expect(form.ok).toBe(false);
    if (!form.ok) expect(form.message).toBe(MSG_ESTORNO_RECEBIMENTO_MOTIVO);
    expect(botaoDesfazerRecebimentoHabilitado({ formularioValido: form.ok, pending: false })).toBe(
      false,
    );
  });

  it("B. motivo comum habilita o botão", () => {
    const form = validarFormularioDesfazerRecebimento({ motivo: "lancamento_incorreto" });
    expect(form.ok).toBe(true);
    expect(botaoDesfazerRecebimentoHabilitado({ formularioValido: form.ok, pending: false })).toBe(
      true,
    );
  });

  it("C. Outro sem observação mantém desabilitado", () => {
    const form = validarFormularioDesfazerRecebimento({ motivo: "outro", observacao: "  " });
    expect(form.ok).toBe(false);
    expect(botaoDesfazerRecebimentoHabilitado({ formularioValido: form.ok, pending: false })).toBe(
      false,
    );
  });

  it("D. Outro com observação habilita", () => {
    const form = validarFormularioDesfazerRecebimento({
      motivo: "outro",
      observacao: "Digitou o brinco de outro lote",
    });
    expect(form.ok).toBe(true);
    expect(botaoDesfazerRecebimentoHabilitado({ formularioValido: form.ok, pending: false })).toBe(
      true,
    );
  });

  it("E. clique envia recebimentoId, motivo e observação — nunca animalId", () => {
    const form = validarFormularioDesfazerRecebimento({
      motivo: "rfid_incorreto",
      observacao: "tag de teste 7701",
    });
    expect(form.ok).toBe(true);
    if (!form.ok) return;
    const payload = montarPayloadDesfazerRecebimento({
      recebimentoId: 7701,
      motivo: form.motivo,
      observacao: form.observacao,
    });
    expect(payload).toEqual({
      recebimentoId: 7701,
      motivo: "rfid_incorreto",
      observacao: "tag de teste 7701",
    });
    expect(payload).not.toHaveProperty("animalId");
    expect(JSON.stringify(payload)).not.toContain("8801");
    expect(page).toContain("desfazerRecebimento.useMutation");
    expect(page).toContain("recebimentoId: payload.recebimentoId");
    expect(page).toContain("motivo: payload.motivo");
    expect(page).toContain("observacao: payload.observacao");
    expect(page).not.toContain("animalId: payload");
    expect(page).toContain("recebimentoId: item.recebimentoId");
    expect(dialog).toContain("alvo.recebimentoId");
    expect(dialog).not.toContain("animalId");
  });

  it("F. duplo clique é bloqueado durante pending", () => {
    expect(
      deveAceitarCliqueDesfazerRecebimento({ formularioValido: true, pending: true }),
    ).toBe(false);
    expect(
      botaoDesfazerRecebimentoHabilitado({ formularioValido: true, pending: true }),
    ).toBe(false);
    expect(TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO).toBe("Desfazendo...");
    expect(dialog).toContain("TEXTO_BOTAO_DESFAZENDO_RECEBIMENTO");
    expect(page).toContain("desfazendoRef.current");
  });

  it("G. sucesso fecha o modal", () => {
    expect(deveFecharModalAposDesfazer(true)).toBe(true);
    expect(page).toContain("setDesfazerAlvo(null)");
  });

  it("H. sucesso invalida as queries da página", () => {
    expect(queriesParaInvalidarAposDesfazerRecebimento(9001)).toEqual({
      get: { id: 9001 },
      listarRecebimentos: { compraId: 9001 },
    });
    expect(page).toContain("queriesParaInvalidarAposDesfazerRecebimento");
    expect(page).toContain("utils.compras.get.invalidate");
    expect(page).toContain("utils.compras.listarRecebimentos.invalidate");
    expect(page).not.toContain("window.location.reload");
    expect(page).not.toContain("location.reload");
  });

  it("I. sucesso mostra a mensagem adequada", () => {
    expect(TOAST_DESFAZER_RECEBIMENTO_SUCESSO).toBe("Recebimento desfeito com sucesso.");
    expect(page).toContain("TOAST_DESFAZER_RECEBIMENTO_SUCESSO");
    expect(page).toContain("toast.success");
  });

  it("J. erro mantém o modal aberto e preserva o formulário", () => {
    expect(deveFecharModalAposDesfazer(false)).toBe(false);
    expect(page).toContain("setDesfazerErro");
    expect(dialog).toContain("submitError");
    expect(dialog).toContain("if (!open) return");
  });

  it("K. erro não remove a linha visualmente", () => {
    expect(podeRemoverLinhaRecebimentoNaUi("antes_da_resposta")).toBe(false);
    expect(podeRemoverLinhaRecebimentoNaUi("erro")).toBe(false);
    expect(podeRemoverLinhaRecebimentoNaUi("sucesso")).toBe(true);
    expect(page).not.toContain("setRecebimentos");
    expect(page).not.toContain("optimistic");
  });

  it("L. recebimento estornado ou legado não oferece a ação novamente", () => {
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: "recebimento",
        recebimentoId: 7701,
        status: "estornado",
      }),
    ).toBe(false);
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: "legado",
        recebimentoId: null,
        status: "recebido",
      }),
    ).toBe(false);
    expect(
      podeMostrarAcaoDesfazerRecebimento({
        origem: "recebimento",
        recebimentoId: 7701,
        status: "confirmado",
      }),
    ).toBe(true);
    expect(page).toContain("podeMostrarAcaoDesfazerRecebimento(item)");
    expect(page).toContain("item.recebimentoId != null");
  });

  it("usa fixture isolada e mensagem de bloqueio do backend sem replicar elegibilidade", () => {
    expect(mensagemErroDesfazerRecebimento(new Error(MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.PESAGEM_POSTERIOR))).toBe(
      MSG_BLOQUEIO_ESTORNO_RECEBIMENTO.PESAGEM_POSTERIOR,
    );
    expect(dialog).not.toContain("PESAGEM_POSTERIOR");
    expect(dialog).not.toContain("VENDA_EXISTENTE");
    expect(dialog).not.toContain("7701");
    expect(page).not.toContain("compraId: 1");
    expect(page).not.toContain("recebimentoId: 1");
  });

  it("limpa o cartão do último animal só quando o brinco desfeito é o mesmo", () => {
    expect(
      deveLimparUltimoRecebidoAposDesfazer({ ultimoBrinco: "810", alvoBrinco: "810" }),
    ).toBe(true);
    expect(
      deveLimparUltimoRecebidoAposDesfazer({ ultimoBrinco: "810", alvoBrinco: "811" }),
    ).toBe(false);
  });
});
