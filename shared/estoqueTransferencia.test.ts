import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { createTransferenciaInsumosService } from "../server/transferenciaInsumos";
import {
  MSG_TRANSFERENCIA_MESMA_FAZENDA,
  limparDestinoSeIgualOrigem,
  opcoesEstoqueDestinoTransferencia,
  transferenciaPodeSalvarDestino,
  validarTransferenciaInsumosInput,
} from "./estoqueTransferencia";

const FAZENDAS = [
  { value: "1", label: "Fazenda J" },
  { value: "2", label: "Fazenda B" },
] as const;

const inputValido = {
  idempotencyKey: "idem-teste-ok",
  fazendaOrigemId: 1,
  fazendaDestinoId: 2,
  dataOperacao: "2026-10-12",
  itens: [{ estoqueOrigemId: 99, quantidade: "1" }],
};

describe("opcoesEstoqueDestinoTransferencia", () => {
  it("CASO A — origem J id1: destino mostra somente B id2", () => {
    expect(opcoesEstoqueDestinoTransferencia(FAZENDAS, 1)).toEqual([
      { value: "2", label: "Fazenda B" },
    ]);
  });

  it("CASO B — origem B id2: destino mostra somente J id1", () => {
    expect(opcoesEstoqueDestinoTransferencia(FAZENDAS, "2")).toEqual([
      { value: "1", label: "Fazenda J" },
    ]);
  });

  it("CASO C — única fazenda: lista de destino vazia e não pode salvar", () => {
    const unica = [{ value: "1", label: "Fazenda J" }];
    expect(opcoesEstoqueDestinoTransferencia(unica, 1)).toEqual([]);
    expect(transferenciaPodeSalvarDestino(1, "")).toBe(false);
    expect(transferenciaPodeSalvarDestino(1, 1)).toBe(false);
  });

  it("CASO D — destino antigo id2 fica inválido quando origem vira id2", () => {
    expect(limparDestinoSeIgualOrigem(2, 2)).toBe("");
    expect(transferenciaPodeSalvarDestino(2, 2)).toBe(false);
    expect(limparDestinoSeIgualOrigem(1, 2)).toBe("2");
  });
});

describe("validarTransferenciaInsumosInput — mesma fazenda", () => {
  it("rejeita origem = destino (J → J) antes de qualquer movimento", () => {
    expect(validarTransferenciaInsumosInput({
      ...inputValido,
      fazendaDestinoId: 1,
    })).toBe(MSG_TRANSFERENCIA_MESMA_FAZENDA);
  });

  it("permite origem J e destino B na validação, sem executar transferência", () => {
    expect(validarTransferenciaInsumosInput(inputValido)).toBeNull();
  });
});

describe("confirmar transferência — mesma fazenda não abre transação", () => {
  it("origem = destino lança erro de domínio e não chama o store", async () => {
    let txCalled = 0;
    const service = createTransferenciaInsumosService({
      async transaction() {
        txCalled += 1;
        throw new Error("não deveria abrir transação");
      },
    });

    await expect(service.confirmar(1, "Tester", {
      ...inputValido,
      fazendaOrigemId: 1,
      fazendaDestinoId: 1,
    })).rejects.toMatchObject({
      name: "TRPCError",
      message: MSG_TRANSFERENCIA_MESMA_FAZENDA,
    } satisfies Partial<TRPCError>);

    expect(txCalled).toBe(0);
  });
});
