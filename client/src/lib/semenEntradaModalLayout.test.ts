import { describe, expect, it } from "vitest";
import {
  SEMEN_ENTRADA_MODAL_MAX_HEIGHT,
  semenEntradaModalLayout,
} from "./semenEntradaModalLayout";

describe("semen entrada modal — layout responsivo", () => {
  it("A) modal usa max-height baseado na viewport", () => {
    expect(SEMEN_ENTRADA_MODAL_MAX_HEIGHT).toContain("100dvh");
    expect(semenEntradaModalLayout.content).toContain(SEMEN_ENTRADA_MODAL_MAX_HEIGHT);
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

  it("content força flex column sobre grid padrão do Dialog", () => {
    expect(semenEntradaModalLayout.content).toContain("!flex");
    expect(semenEntradaModalLayout.content).toContain("!flex-col");
  });
});
