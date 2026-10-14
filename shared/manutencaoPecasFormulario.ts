import { calcularCustosManutencaoCompletos, pecaManutencaoEDeEstoque, pecaManutencaoEDeOficina, validarPecaOficina } from "./manutencaoPecasOrigem";

export type OrigemPecaFormulario = "estoque" | "oficina";

export type PecaFormularioManutencao = {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  estoqueId?: number | null;
  unidade?: string | null;
  origem?: string | null;
};

export type PecaRegistroManutencao = {
  nome?: string | null;
  quantidade?: string | number | null;
  valorUnitario?: string | number | null;
  estoqueId?: number | null;
  origem?: string | null;
};

export function podeExibirOrigemOficina(tipoExecucao: string | null | undefined): boolean {
  return String(tipoExecucao ?? "").trim().toLowerCase() === "externa";
}

export function pecaItemDeRegistro(peca: PecaRegistroManutencao): PecaFormularioManutencao {
  const oficina = pecaManutencaoEDeOficina(peca);
  return {
    nome: String(peca.nome ?? "").trim(),
    quantidade: Number(String(peca.quantidade ?? 0).replace(",", ".")) || 0,
    valorUnitario: Number(String(peca.valorUnitario ?? 0).replace(",", ".")) || 0,
    estoqueId: oficina ? null : peca.estoqueId ?? null,
    origem: oficina ? "oficina" : peca.estoqueId != null ? "estoque" : peca.origem ?? null,
  };
}

export function payloadPecaManutencao(peca: PecaFormularioManutencao): {
  nome: string;
  quantidade: number;
  valorUnitario: number;
  estoqueId?: number | null;
  origem: OrigemPecaFormulario;
} {
  if (pecaManutencaoEDeOficina(peca)) {
    return {
      nome: peca.nome,
      quantidade: peca.quantidade,
      valorUnitario: peca.valorUnitario,
      origem: "oficina",
    };
  }
  return {
    nome: peca.nome,
    quantidade: peca.quantidade,
    valorUnitario: peca.valorUnitario,
    estoqueId: peca.estoqueId,
    origem: "estoque",
  };
}

export function rotuloOrigemPeca(peca: PecaFormularioManutencao): "Estoque" | "Oficina" | null {
  if (pecaManutencaoEDeOficina(peca)) return "Oficina";
  if (pecaManutencaoEDeEstoque(peca) || peca.estoqueId != null) return "Estoque";
  return null;
}

export function deveExibirRotuloOrigemPeca(
  tipoExecucao: string | null | undefined,
  pecas: PecaFormularioManutencao[],
): boolean {
  return podeExibirOrigemOficina(tipoExecucao) || pecas.some(pecaManutencaoEDeOficina);
}

export function podeRemoverPecaNaEdicao(
  patrimonializada: boolean,
  peca: PecaFormularioManutencao,
): boolean {
  if (!patrimonializada) return true;
  return pecaManutencaoEDeOficina(peca);
}

export function podeMostrarFormularioEstoque(input: {
  patrimonializada: boolean;
  origemPeca: OrigemPecaFormulario;
}): boolean {
  return !input.patrimonializada && input.origemPeca === "estoque";
}

export function podeMostrarFormularioOficina(input: {
  tipoExecucao: string | null | undefined;
  origemPeca: OrigemPecaFormulario;
}): boolean {
  return podeExibirOrigemOficina(input.tipoExecucao) && input.origemPeca === "oficina";
}

export function podeTrocarParaInterna(pecas: PecaFormularioManutencao[]): {
  ok: true;
} | { ok: false; message: string } {
  if (pecas.some(pecaManutencaoEDeOficina)) {
    return {
      ok: false,
      message: "Remova as peças da oficina antes de mudar para manutenção interna.",
    };
  }
  return { ok: true };
}

export function resumoCustosFormulario(
  pecas: PecaFormularioManutencao[],
  valorMaoObra: number,
) {
  return calcularCustosManutencaoCompletos({
    pecasEstoque: pecas.filter((p) => !pecaManutencaoEDeOficina(p)).map((p) => ({
      quantidade: p.quantidade,
      valorUnitario: p.valorUnitario,
    })),
    pecasOficina: pecas.filter(pecaManutencaoEDeOficina).map((p) => ({
      quantidade: p.quantidade,
      valorUnitario: p.valorUnitario,
      valorTotal: p.quantidade * p.valorUnitario,
    })),
    valorMaoObra,
  });
}

export function prepararPecaOficinaDoFormulario(input: {
  nome: string;
  quantidade: number;
  valorUnitario: number;
}) {
  return validarPecaOficina({
    nome: input.nome,
    quantidade: input.quantidade,
    valorUnitario: input.valorUnitario,
    origem: "oficina",
  });
}
