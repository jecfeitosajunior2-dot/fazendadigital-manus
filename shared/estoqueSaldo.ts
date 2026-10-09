/**
 * Decisão única de patch de saldo (quantidade + capital).
 * Todo writer de estoque controlado deve passar por aqui.
 */
import {
  aplicarEntradaCapital,
  aplicarEstornoCapital,
  aplicarSaidaCapital,
  capitalEstaInicializado,
  capitalSeAplica,
  EstoqueCapitalError,
  MSG_ESTORNO_CAPITAL_SEM_SNAPSHOT,
  MSG_ESTOQUE_CAPITAL_USO_IMEDIATO,
  persistirQuantidadeEstoque,
  patchPersistenciaCapital,
} from "./estoqueCapital";

function parseCustoMedioLegado(raw: unknown): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = parseFloat(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function medioPonderadoLegado(params: {
  quantidadeAnterior: number;
  custoMedioAnterior: number | null;
  quantidadeEntrada: number;
  valorTotalEntrada: number;
}): number | null {
  if (!(params.quantidadeEntrada > 0) || !(params.valorTotalEntrada > 0)) {
    return params.custoMedioAnterior;
  }
  const qAnt = Math.max(0, params.quantidadeAnterior || 0);
  const custoAnt = params.custoMedioAnterior ?? 0;
  const qTotal = qAnt + params.quantidadeEntrada;
  if (!(qTotal > 0)) return null;
  const medio = (qAnt * custoAnt + params.valorTotalEntrada) / qTotal;
  return Number.isFinite(medio) && medio > 0 ? medio : null;
}

export { EstoqueCapitalError };

export type ItemSaldo = {
  quantidade?: number | string | null;
  controlarSaldo?: boolean | null;
  valorUnitario?: number | string | null;
  valorTotalEstoque?: number | string | null;
  capitalInicializadoEm?: Date | string | null;
};

export type OperacaoSaldo =
  | {
      tipoOp: "entrada";
      quantidade: number | string;
      valorInformado?: number | string | null;
      tipoMov?: string | null;
    }
  | { tipoOp: "saida"; quantidade: number | string }
  | {
      tipoOp: "estorno";
      quantidadeOriginal: number | string;
      valorSnapshot?: number | string | null;
    };

export type PatchSaldo = {
  quantidade: string;
  valorUnitario?: string;
  valorTotalEstoque?: string;
  valorEstoqueMovimentado: string | null;
  usaCapital: boolean;
};

export function tipoEhAjusteEntrada(tipo?: string | null): boolean {
  const t = String(tipo ?? "").toLowerCase();
  return t.includes("ajuste") && t.includes("entrada");
}

export function tipoEhProducaoPropria(tipo?: string | null): boolean {
  return String(tipo ?? "").toLowerCase().includes("produ");
}

/** Ajuste de entrada e produção sem valor não inventam capital. */
export function valorEntradaCapitalizavel(
  tipoMov: string | null | undefined,
  valorInformado: number | string | null | undefined,
): number {
  if (tipoEhAjusteEntrada(tipoMov)) return 0;
  if (valorInformado == null || valorInformado === "") return 0;
  const n = typeof valorInformado === "number"
    ? valorInformado
    : Number(String(valorInformado).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function decidirPatchSaldo(item: ItemSaldo, op: OperacaoSaldo): PatchSaldo {
  const controla = capitalSeAplica(item.controlarSaldo);
  const atual = Number(String(item.quantidade ?? 0).replace(",", "."));
  const usaCapital = controla && capitalEstaInicializado(item);

  if (!controla) {
    if (op.tipoOp === "saida") {
      throw new EstoqueCapitalError(MSG_ESTOQUE_CAPITAL_USO_IMEDIATO);
    }
    return {
      quantidade: persistirQuantidadeEstoque(Number.isFinite(atual) ? atual : 0),
      valorEstoqueMovimentado: null,
      usaCapital: false,
    };
  }

  if (usaCapital) {
    const estado = {
      quantidade: Number.isFinite(atual) ? atual : 0,
      capital: Number(item.valorTotalEstoque ?? 0),
    };
    if (op.tipoOp === "entrada") {
      const valor = valorEntradaCapitalizavel(op.tipoMov, op.valorInformado);
      const r = aplicarEntradaCapital(estado, op.quantidade, valor);
      const p = patchPersistenciaCapital(r);
      return {
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        valorTotalEstoque: p.valorTotalEstoque,
        valorEstoqueMovimentado: p.valorEstoqueMovimentado,
        usaCapital: true,
      };
    }
    if (op.tipoOp === "saida") {
      const r = aplicarSaidaCapital(estado, op.quantidade);
      const p = patchPersistenciaCapital(r);
      return {
        quantidade: p.quantidade,
        valorUnitario: p.valorUnitario,
        valorTotalEstoque: p.valorTotalEstoque,
        valorEstoqueMovimentado: p.valorEstoqueMovimentado,
        usaCapital: true,
      };
    }
    if (op.valorSnapshot == null || String(op.valorSnapshot).trim() === "") {
      throw new EstoqueCapitalError(MSG_ESTORNO_CAPITAL_SEM_SNAPSHOT);
    }
    const r = aplicarEstornoCapital(estado, op.quantidadeOriginal, op.valorSnapshot);
    const p = patchPersistenciaCapital(r);
    return {
      quantidade: p.quantidade,
      valorUnitario: p.valorUnitario,
      valorTotalEstoque: p.valorTotalEstoque,
      valorEstoqueMovimentado: p.valorEstoqueMovimentado,
      usaCapital: true,
    };
  }

  if (op.tipoOp === "entrada") {
    const qEnt = Number(String(op.quantidade).replace(",", "."));
    const novo = atual + qEnt;
    const patch: PatchSaldo = {
      quantidade: persistirQuantidadeEstoque(novo),
      valorEstoqueMovimentado: null,
      usaCapital: false,
    };
    const valor = valorEntradaCapitalizavel(op.tipoMov, op.valorInformado);
    if (valor > 0) {
      const medio = medioPonderadoLegado({
        quantidadeAnterior: atual,
        custoMedioAnterior: parseCustoMedioLegado(item.valorUnitario),
        quantidadeEntrada: qEnt,
        valorTotalEntrada: valor,
      });
      if (medio != null) patch.valorUnitario = (Math.round(medio * 100) / 100).toFixed(2);
    }
    return patch;
  }

  if (op.tipoOp === "saida") {
    const qSai = Number(String(op.quantidade).replace(",", "."));
    const novo = atual - qSai;
    if (novo < -1e-9) {
      throw new EstoqueCapitalError("Quantidade em estoque insuficiente para esta saída.");
    }
    return {
      quantidade: persistirQuantidadeEstoque(Math.max(0, novo)),
      valorEstoqueMovimentado: null,
      usaCapital: false,
    };
  }

  const qOrig = Number(String(op.quantidadeOriginal).replace(",", "."));
  const novo = atual - qOrig;
  if (novo < -1e-9) {
    throw new EstoqueCapitalError("Quantidade em estoque insuficiente para esta saída.");
  }
  return {
    quantidade: persistirQuantidadeEstoque(Math.max(0, novo)),
    valorEstoqueMovimentado: null,
    usaCapital: false,
  };
}
