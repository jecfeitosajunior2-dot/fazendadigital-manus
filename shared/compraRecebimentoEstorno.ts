import { normalizeBrincoKey } from "./brincoAtivo";
import { parsePesoPositivo } from "./pesoEntrada";
import { normalizeRfidKey } from "./rfidUnicidade";

export const COMPRA_RECEBIMENTO_STATUS_ESTORNADO = "estornado" as const;
export const COMPRA_RECEBIMENTO_STATUS_CONFIRMADO = "confirmado" as const;

export const MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA = [
  "lancamento_incorreto",
  "animal_identificado_incorretamente",
  "rfid_incorreto",
  "animal_nao_pertence_compra",
  "outro",
] as const;

export type MotivoEstornoRecebimentoCompra =
  (typeof MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA)[number];

export const MOTIVO_ESTORNO_RECEBIMENTO_COMPRA_LABEL: Record<
  MotivoEstornoRecebimentoCompra,
  string
> = {
  lancamento_incorreto: "Lançamento incorreto",
  animal_identificado_incorretamente: "Animal identificado incorretamente",
  rfid_incorreto: "RFID incorreto",
  animal_nao_pertence_compra: "Animal não pertencente a esta compra",
  outro: "Outro",
};

export const CODIGOS_BLOQUEIO_ESTORNO_RECEBIMENTO = [
  "RECEBIMENTO_JA_ESTORNADO",
  "ANIMAL_NAO_ENCONTRADO",
  "PESAGEM_POSTERIOR",
  "MOVIMENTACAO_POSTERIOR",
  "IDENTIFICACAO_ALTERADA",
  "LOCALIZACAO_ALTERADA",
  "MANEJO_SANITARIO",
  "MANEJO_REPRODUTIVO",
  "VENDA_EXISTENTE",
  "BAIXA_EXISTENTE",
  "GENEALOGIA_EXISTENTE",
  "SEMEN_EXISTENTE",
  "STATUS_INCOMPATIVEL",
  "RECEBIMENTO_LEGADO",
  "INCONSISTENCIA_DADOS",
] as const;

export type CodigoBloqueioEstornoRecebimento =
  (typeof CODIGOS_BLOQUEIO_ESTORNO_RECEBIMENTO)[number];

export const MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO = "Recebimento não encontrado.";
export const MSG_ESTORNO_RECEBIMENTO_MOTIVO = "Informe o motivo do estorno.";
export const MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO =
  "Informe a observação quando o motivo for Outro.";
export const MSG_ESTORNO_RECEBIMENTO_FALHOU = "Não foi possível desfazer o recebimento.";
export const MSG_ESTORNO_RECEBIMENTO_LEGADO =
  "Este animal pertence a um recebimento legado e não pode ser estornado por este fluxo.";

export const MSG_BLOQUEIO_ESTORNO_RECEBIMENTO: Record<
  CodigoBloqueioEstornoRecebimento,
  string
> = {
  RECEBIMENTO_JA_ESTORNADO: "Este recebimento já foi estornado.",
  ANIMAL_NAO_ENCONTRADO: "O animal deste recebimento não foi encontrado.",
  PESAGEM_POSTERIOR: "Há pesagem posterior ao recebimento. O estorno não é permitido.",
  MOVIMENTACAO_POSTERIOR:
    "Há movimentação posterior ao recebimento. O estorno não é permitido.",
  IDENTIFICACAO_ALTERADA:
    "A identificação do animal foi alterada depois do recebimento. O estorno não é permitido.",
  LOCALIZACAO_ALTERADA:
    "O lote ou o pasto atuais não correspondem ao destino do recebimento. O estorno não é permitido.",
  MANEJO_SANITARIO:
    "Há manejo sanitário ou castração depois do recebimento. O estorno não é permitido.",
  MANEJO_REPRODUTIVO:
    "Há manejo reprodutivo ou desmama depois do recebimento. O estorno não é permitido.",
  VENDA_EXISTENTE:
    "Este animal possui item de venda. O estorno do recebimento não é permitido.",
  BAIXA_EXISTENTE: "Este animal possui baixa. O estorno do recebimento não é permitido.",
  GENEALOGIA_EXISTENTE:
    "Este animal participa da genealogia do rebanho. O estorno não é permitido.",
  SEMEN_EXISTENTE:
    "Este animal possui partida de sêmen. O estorno do recebimento não é permitido.",
  STATUS_INCOMPATIVEL:
    "O status atual do animal não permite desfazer o recebimento.",
  RECEBIMENTO_LEGADO: MSG_ESTORNO_RECEBIMENTO_LEGADO,
  INCONSISTENCIA_DADOS:
    "Os dados do animal não conferem com o recebimento. O estorno não é permitido.",
};

export function isMotivoEstornoRecebimentoCompra(
  value: unknown,
): value is MotivoEstornoRecebimentoCompra {
  return (
    typeof value === "string" &&
    (MOTIVOS_ESTORNO_RECEBIMENTO_COMPRA as readonly string[]).includes(value)
  );
}

export function idEstornoRef(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export function idsEstornoIguais(a: unknown, b: unknown): boolean {
  return idEstornoRef(a) === idEstornoRef(b);
}

export function pesosEstornoIguais(a: unknown, b: unknown): boolean {
  const pa = parsePesoPositivo(a);
  const pb = parsePesoPositivo(b);
  if (pa == null && pb == null) return true;
  if (pa == null || pb == null) return false;
  return Math.abs(pa - pb) < 0.005;
}

export function normalizarEstornoRecebimentoCompraInput(input: {
  recebimentoId?: unknown;
  motivo?: unknown;
  observacao?: unknown;
}):
  | {
      ok: true;
      recebimentoId: number;
      motivo: MotivoEstornoRecebimentoCompra;
      observacao: string | null;
    }
  | { ok: false; message: string } {
  const recebimentoId = idEstornoRef(input.recebimentoId);
  if (recebimentoId == null) {
    return { ok: false, message: MSG_ESTORNO_RECEBIMENTO_NAO_ENCONTRADO };
  }
  if (!isMotivoEstornoRecebimentoCompra(input.motivo)) {
    return { ok: false, message: MSG_ESTORNO_RECEBIMENTO_MOTIVO };
  }
  const observacao = String(input.observacao ?? "").trim().slice(0, 1000) || null;
  if (input.motivo === "outro" && !observacao) {
    return { ok: false, message: MSG_ESTORNO_RECEBIMENTO_OBSERVACAO_OUTRO };
  }
  return { ok: true, recebimentoId, motivo: input.motivo, observacao };
}

export type RecebimentoEstornoSnap = {
  id: number;
  userId: number;
  compraId: number;
  compraGrupoId: number;
  animalId: number;
  brincoVisual: string;
  rfid: string | null;
  sexo: "macho" | "femea" | string;
  categoria: string;
  pesoRecebimento: unknown;
  loteDestinoId: number | null;
  pastoDestinoId: number | null;
  status: string;
};

export type AnimalEstornoSnap = {
  id: number;
  userId: number;
  status: string | null;
  brinco: string | null;
  brincoEletronico: string | null;
  loteId: number | null;
  pastoId: number | null;
  sexo: string | null;
  categoria: string | null;
  compraId: number | null;
  compraGrupoId: number | null;
  castrado?: boolean | number | null;
  dataDesmama?: string | null;
  pesoAtual?: unknown;
};

export type VinculoEstornoRef = {
  compraRecebimentoId?: number | null;
};

export type FatosEstornoRecebimentoCompra = {
  userId: number;
  recebimento: RecebimentoEstornoSnap | null;
  animal: AnimalEstornoSnap | null;
  compraUserId?: number | null;
  pesagens: readonly VinculoEstornoRef[];
  movimentacoes: readonly VinculoEstornoRef[];
  temHistoricoBrincos: boolean;
  temSaude: boolean;
  temReproducaoFemea: boolean;
  temReproducaoMacho: boolean;
  temFilhoComoMae: boolean;
  temFilhoComoPai: boolean;
  temPartoCria: boolean;
  temSemenPartida: boolean;
  temBaixa: boolean;
  temVendaItem: boolean;
};

export type ResultadoElegibilidadeEstornoRecebimento =
  | { ok: true }
  | { ok: false; codigo: CodigoBloqueioEstornoRecebimento; message: string };

function bloqueio(
  codigo: CodigoBloqueioEstornoRecebimento,
): ResultadoElegibilidadeEstornoRecebimento {
  return { ok: false, codigo, message: MSG_BLOQUEIO_ESTORNO_RECEBIMENTO[codigo] };
}

export function pertenceAoRecebimento(
  vinculo: VinculoEstornoRef,
  recebimentoId: number,
): boolean {
  return idEstornoRef(vinculo.compraRecebimentoId) === recebimentoId;
}

function temVinculoDeOutroRecebimento(
  itens: readonly VinculoEstornoRef[],
  recebimentoId: number,
): boolean {
  return itens.some(item => {
    const id = idEstornoRef(item.compraRecebimentoId);
    return id != null && id !== recebimentoId;
  });
}

function temVinculoPosterior(
  itens: readonly VinculoEstornoRef[],
  recebimentoId: number,
): boolean {
  return itens.some(item => !pertenceAoRecebimento(item, recebimentoId));
}

function temVinculoProprio(
  itens: readonly VinculoEstornoRef[],
  recebimentoId: number,
): boolean {
  return itens.some(item => pertenceAoRecebimento(item, recebimentoId));
}

function flagCastrado(value: unknown): boolean {
  return value === true || value === 1;
}

function temDesmamaCadastral(value: unknown): boolean {
  return String(value ?? "").trim() !== "";
}

/** Animal de Compra sem linha em compra_recebimentos — fluxo legado. */
export function isRecebimentoLegado(opts: {
  recebimento: RecebimentoEstornoSnap | null;
  animal: AnimalEstornoSnap | null;
}): boolean {
  if (opts.recebimento) return false;
  return idEstornoRef(opts.animal?.compraId) != null;
}

export function verificarElegibilidadeEstornoRecebimento(
  fatos: FatosEstornoRecebimentoCompra,
): ResultadoElegibilidadeEstornoRecebimento {
  if (isRecebimentoLegado({ recebimento: fatos.recebimento, animal: fatos.animal })) {
    return bloqueio("RECEBIMENTO_LEGADO");
  }

  const rec = fatos.recebimento;
  if (!rec) return bloqueio("INCONSISTENCIA_DADOS");
  if (rec.userId !== fatos.userId) return bloqueio("INCONSISTENCIA_DADOS");
  if (idEstornoRef(fatos.compraUserId) !== fatos.userId) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }
  if (rec.status === COMPRA_RECEBIMENTO_STATUS_ESTORNADO) {
    return bloqueio("RECEBIMENTO_JA_ESTORNADO");
  }
  if (rec.status !== COMPRA_RECEBIMENTO_STATUS_CONFIRMADO) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }

  const animal = fatos.animal;
  if (!animal) return bloqueio("ANIMAL_NAO_ENCONTRADO");
  if (animal.userId !== fatos.userId || animal.id !== rec.animalId) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }
  if (!idsEstornoIguais(animal.compraId, rec.compraId)) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }
  if (!idsEstornoIguais(animal.compraGrupoId, rec.compraGrupoId)) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }
  if ((animal.sexo ?? "") !== rec.sexo || (animal.categoria ?? "") !== rec.categoria) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }
  if (!pesosEstornoIguais(animal.pesoAtual, rec.pesoRecebimento)) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }

  const temPesoSnapshot = parsePesoPositivo(rec.pesoRecebimento) != null;
  const temPesagemPropria = temVinculoProprio(fatos.pesagens, rec.id);
  if (temPesoSnapshot !== temPesagemPropria) return bloqueio("INCONSISTENCIA_DADOS");
  if (temVinculoDeOutroRecebimento(fatos.pesagens, rec.id)) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }

  const esperavaMovimentacao = idEstornoRef(rec.loteDestinoId) != null;
  const temMovPropria = temVinculoProprio(fatos.movimentacoes, rec.id);
  if (esperavaMovimentacao !== temMovPropria) return bloqueio("INCONSISTENCIA_DADOS");
  if (temVinculoDeOutroRecebimento(fatos.movimentacoes, rec.id)) {
    return bloqueio("INCONSISTENCIA_DADOS");
  }

  if ((animal.status ?? "").trim() !== "ativo") {
    return bloqueio("STATUS_INCOMPATIVEL");
  }

  if (temVinculoPosterior(fatos.pesagens, rec.id)) {
    return bloqueio("PESAGEM_POSTERIOR");
  }
  if (temVinculoPosterior(fatos.movimentacoes, rec.id)) {
    return bloqueio("MOVIMENTACAO_POSTERIOR");
  }

  if (
    !idsEstornoIguais(animal.loteId, rec.loteDestinoId) ||
    !idsEstornoIguais(animal.pastoId, rec.pastoDestinoId)
  ) {
    return bloqueio("LOCALIZACAO_ALTERADA");
  }

  if (fatos.temHistoricoBrincos) return bloqueio("IDENTIFICACAO_ALTERADA");
  if (normalizeBrincoKey(animal.brinco) !== normalizeBrincoKey(rec.brincoVisual)) {
    return bloqueio("IDENTIFICACAO_ALTERADA");
  }
  if (normalizeRfidKey(animal.brincoEletronico) !== normalizeRfidKey(rec.rfid)) {
    return bloqueio("IDENTIFICACAO_ALTERADA");
  }

  if (fatos.temSaude || flagCastrado(animal.castrado)) {
    return bloqueio("MANEJO_SANITARIO");
  }
  if (
    fatos.temReproducaoFemea ||
    fatos.temReproducaoMacho ||
    temDesmamaCadastral(animal.dataDesmama)
  ) {
    return bloqueio("MANEJO_REPRODUTIVO");
  }
  if (
    fatos.temFilhoComoMae ||
    fatos.temFilhoComoPai ||
    fatos.temPartoCria
  ) {
    return bloqueio("GENEALOGIA_EXISTENTE");
  }
  if (fatos.temSemenPartida) return bloqueio("SEMEN_EXISTENTE");
  if (fatos.temBaixa) return bloqueio("BAIXA_EXISTENTE");
  if (fatos.temVendaItem) return bloqueio("VENDA_EXISTENTE");

  return { ok: true };
}
