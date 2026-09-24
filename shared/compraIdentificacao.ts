import {
  calcularCustoMedioCabeca,
  calcularCustoMedioKg,
  isFormaPrecificacaoCompra,
  type FormaPrecificacaoCompra,
} from "./compraComercial";

export const SITUACAO_IDENTIFICACAO_COMPRA = ["aguardando", "parcial", "concluida"] as const;
export type SituacaoIdentificacaoCompra = (typeof SITUACAO_IDENTIFICACAO_COMPRA)[number];

export const SITUACAO_IDENTIFICACAO_COMPRA_LABEL: Record<SituacaoIdentificacaoCompra, string> = {
  aguardando: "Aguardando identificação",
  parcial: "Identificação parcial",
  concluida: "Identificação concluída",
};

export const STATUS_COMERCIAL_COMPRA_LABEL: Record<string, string> = {
  concluido: "Concluída",
  pendente: "Pendente",
  cancelado: "Cancelada",
};

export type VinculoAnimalCompra = {
  id: number;
  userId: number;
  compraId?: number | null;
  compraGrupoId?: number | null;
};

export function compraAcessivelAoUsuario(
  compraUserId: number | null | undefined,
  userId: number,
): boolean {
  return compraUserId != null && compraUserId === userId;
}

export function animalContaNaCompra(
  animal: VinculoAnimalCompra,
  compraId: number,
  userId: number,
): boolean {
  return (
    animal.userId === userId &&
    animal.compraId != null &&
    animal.compraId === compraId
  );
}

export function animalContaNoGrupoCompra(
  animal: VinculoAnimalCompra,
  compraId: number,
  grupoId: number,
  userId: number,
): boolean {
  return animalContaNaCompra(animal, compraId, userId) && animal.compraGrupoId === grupoId;
}

export function contarIdentificacao(opts: {
  comprados: number;
  identificados: number;
}): { comprados: number; identificados: number; pendentes: number } {
  const comprados = Math.max(0, Math.floor(Number(opts.comprados)) || 0);
  const identificados = Math.max(0, Math.floor(Number(opts.identificados)) || 0);
  return {
    comprados,
    identificados,
    pendentes: Math.max(0, comprados - identificados),
  };
}

export function situacaoIdentificacaoCompra(
  comprados: number,
  identificados: number,
): SituacaoIdentificacaoCompra {
  const { comprados: c, identificados: i } = contarIdentificacao({ comprados, identificados });
  if (i <= 0) return "aguardando";
  if (c > 0 && i >= c) return "concluida";
  return "parcial";
}

export function quantidadeCompradaDaCompra(
  grupos: ReadonlyArray<{ quantidade: number }>,
  quantidadeAnimaisLegado?: number | null,
): number {
  if (grupos.length) {
    return grupos.reduce((acc, g) => acc + Math.max(0, Math.floor(Number(g.quantidade)) || 0), 0);
  }
  return Math.max(0, Math.floor(Number(quantidadeAnimaisLegado)) || 0);
}

export function pesoAdquiridoDaCompra(
  grupos: ReadonlyArray<{ pesoTotal?: number | null }>,
  pesoTotalPersistido?: number | null,
): number | null {
  const pesos = grupos.map(g => g.pesoTotal).filter((n): n is number => n != null && n > 0);
  if (pesos.length) return Math.round(pesos.reduce((a, b) => a + b, 0) * 100) / 100;
  if (pesoTotalPersistido != null && pesoTotalPersistido > 0) return pesoTotalPersistido;
  return null;
}

/** Só leitura desta etapa. A gravação do vínculo virá no recebimento. */
export function grupoCompraAceitaNovoVinculo(comprados: number, identificados: number): boolean {
  return contarIdentificacao({ comprados, identificados }).pendentes > 0;
}

export function labelSexoCompra(sexo: string | null | undefined): string {
  const v = String(sexo ?? "").trim().toLowerCase();
  if (v === "femea" || v === "fêmea") return "Fêmea";
  if (v === "macho") return "Macho";
  return "—";
}

export function labelStatusComercialCompra(status: string | null | undefined): string {
  const key = String(status ?? "").trim();
  return STATUS_COMERCIAL_COMPRA_LABEL[key] ?? "—";
}

export function labelSituacaoIdentificacao(situacao: SituacaoIdentificacaoCompra): string {
  return SITUACAO_IDENTIFICACAO_COMPRA_LABEL[situacao];
}

export type GrupoCompraIdentificacao = {
  id: number;
  categoria: string;
  sexo: string;
  sexoLabel: string;
  comprados: number;
  identificados: number;
  pendentes: number;
  pesoAdquirido: number | null;
};

export type ResumoIdentificacaoCompra = {
  comprados: number;
  identificados: number;
  pendentes: number;
  situacao: SituacaoIdentificacaoCompra;
  situacaoLabel: string;
  pesoAdquirido: number | null;
  grupos: GrupoCompraIdentificacao[];
};

export function resumirIdentificacaoCompra(input: {
  compraId: number;
  userId: number;
  quantidadeAnimaisLegado?: number | null;
  pesoTotalPersistido?: number | null;
  grupos: ReadonlyArray<{
    id: number;
    categoria: string;
    sexo: string;
    quantidade: number;
    pesoTotal?: number | null;
  }>;
  vinculos: ReadonlyArray<VinculoAnimalCompra>;
}): ResumoIdentificacaoCompra {
  const grupos = input.grupos.map(grupo => {
    const identificados = input.vinculos.filter(v =>
      animalContaNoGrupoCompra(v, input.compraId, grupo.id, input.userId),
    ).length;
    const contagem = contarIdentificacao({
      comprados: grupo.quantidade,
      identificados,
    });
    return {
      id: grupo.id,
      categoria: grupo.categoria,
      sexo: grupo.sexo,
      sexoLabel: labelSexoCompra(grupo.sexo),
      comprados: contagem.comprados,
      identificados: contagem.identificados,
      pendentes: contagem.pendentes,
      pesoAdquirido: grupo.pesoTotal != null && grupo.pesoTotal > 0 ? grupo.pesoTotal : null,
    };
  });

  const comprados = quantidadeCompradaDaCompra(input.grupos, input.quantidadeAnimaisLegado);
  const identificados = input.vinculos.filter(v =>
    animalContaNaCompra(v, input.compraId, input.userId),
  ).length;
  const total = contarIdentificacao({ comprados, identificados });
  const situacao = situacaoIdentificacaoCompra(total.comprados, total.identificados);
  return {
    ...total,
    situacao,
    situacaoLabel: labelSituacaoIdentificacao(situacao),
    pesoAdquirido: pesoAdquiridoDaCompra(input.grupos, input.pesoTotalPersistido),
    grupos,
  };
}

export function valoresOficiaisDaCompra(input: {
  formaPrecificacao?: string | null;
  precoUnitario?: number | null;
  valorAnimais?: number | null;
  frete?: number | null;
  outrosCustos?: number | null;
  custoTotal?: number | null;
  quantidade: number;
  pesoTotal: number | null;
}): {
  forma: FormaPrecificacaoCompra | null;
  precoUnitario: number | null;
  valorAnimais: number;
  frete: number;
  outrosCustos: number;
  custoTotal: number;
  custoMedioCabeca: number | null;
  custoMedioKg: number | null;
} {
  const forma = isFormaPrecificacaoCompra(input.formaPrecificacao) ? input.formaPrecificacao : null;
  const custoTotal = Number(input.custoTotal);
  const custo = Number.isFinite(custoTotal) ? custoTotal : 0;
  return {
    forma,
    precoUnitario: input.precoUnitario != null && Number.isFinite(input.precoUnitario) ? input.precoUnitario : null,
    valorAnimais: Number(input.valorAnimais) || 0,
    frete: Number(input.frete) || 0,
    outrosCustos: Number(input.outrosCustos) || 0,
    custoTotal: custo,
    custoMedioCabeca: calcularCustoMedioCabeca(custo, input.quantidade),
    custoMedioKg: calcularCustoMedioKg(custo, input.pesoTotal),
  };
}
