import { describe, expect, it } from "vitest";
import {
  SEMEN_ENTRADA_MODAL_MAX_HEIGHT,
  semenEntradaModalLayout,
} from "./semenEntradaModalLayout";

describe("semen entrada modal — layout responsivo", () => {
  it("A) modal usa max-height baseado na viewport", () => {
    expect(SEMEN_ENTRADA_MODAL_MAX_HEIGHT).toContain("100dvh");
    expect(SEMEN_ENTRADA_MODAL_MAX_HEIGHT).toContain("min(32rem");
    expect(semenEntradaModalLayout.content).toContain(SEMEN_ENTRADA_MODAL_MAX_HEIGHT);
  });

  it("H) modal compacto e centralizado na viewport", () => {
    expect(semenEntradaModalLayout.content).toContain("max-w-md");
    expect(semenEntradaModalLayout.content).toContain("!top-[50%]");
    expect(semenEntradaModalLayout.content).toContain("!-translate-y-1/2");
  });

  it("B) body permite scroll vertical", () => {
    expect(semenEntradaModalLayout.body).toContain("overflow-y-auto");
  });

  it("C) footer não fica dentro da área rolável", () => {
    expect(semenEntradaModalLayout.footer).toContain("shrink-0");
    expect(semenEntradaModalLayout.body).not.toContain("border-t");
    expect(semenEntradaModalLayout.footer).toContain("border-t");
  });

  it("D) header permanece separado do body", () => {
    expect(semenEntradaModalLayout.header).toContain("shrink-0");
    expect(semenEntradaModalLayout.form).toContain("overflow-hidden");
  });

  it("E) sem overflow horizontal no body", () => {
    expect(semenEntradaModalLayout.body).toContain("overflow-x-hidden");
  });

  it("F) mobile empilha campos em grid", () => {
    expect(semenEntradaModalLayout.fieldGrid).toContain("grid-cols-1");
    expect(semenEntradaModalLayout.fieldGrid).toContain("sm:grid-cols-2");
  });

  it("G) card único claro no body", () => {
    expect(semenEntradaModalLayout.formCard).toContain("rounded-lg");
    expect(semenEntradaModalLayout.formCard).toContain("bg-white");
    expect(semenEntradaModalLayout.content).toContain("bg-[#F7F9FA]");
  });

  it("content força flex column sobre grid padrão do Dialog", () => {
    expect(semenEntradaModalLayout.content).toContain("!flex");
    expect(semenEntradaModalLayout.content).toContain("!flex-col");
  });
});
