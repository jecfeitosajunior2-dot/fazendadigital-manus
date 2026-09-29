import { parsePesoPositivo } from "./pesoEntrada";
import { labelSexoCompra } from "./compraIdentificacao";
import { COMPRA_RECEBIMENTO_STATUS_CONFIRMADO } from "./compraRecebimento";

export const TEXTO_VAZIO_RECEBIMENTO_LISTA = "—";
export const ORIGEM_RECEBIMENTO_LISTA = "recebimento" as const;
export const ORIGEM_LEGADO_LISTA = "legado" as const;
export const STATUS_LISTA_RECEBIDO = "recebido" as const;

export type OrigemItemListaRecebimentoCompra =
  | typeof ORIGEM_RECEBIMENTO_LISTA
  | typeof ORIGEM_LEGADO_LISTA;

export type RecebimentoCompraListaRow = {
  id: number;
  userId: number;
  compraId: number;
  compraGrupoId: number;
  animalId: number;
  brincoVisual: string;
  rfid: string | null;
  sexo: string;
  categoria: string;
  pesoRecebimento: unknown;
  loteDestinoId: number | null;
  pastoDestinoId: number | null;
  status: string;
  recebidoEm: Date | string | null;
};

export type AnimalVinculoListaCompra = {
  id: number;
  brinco: string | null;
  brincoEletronico?: string | null;
  sexo: string;
  categoria?: string | null;
  compraGrupoId: number | null;
  dataEntrada: string | Date | null;
};

export type GrupoListaCompra = {
  id: number;
  categoria: string;
  sexo: string;
};

export type RecebimentoCompraListaItem = {
  origem: OrigemItemListaRecebimentoCompra;
  animalId: number;
  recebimentoId: number | null;
  chaveLista: string;
  compraId: number;
  brincoVisual: string;
  rfid: string | null;
  sexo: string;
  sexoLabel: string;
  categoria: string;
  grupoLabel: string;
  pesoKg: number | null;
  loteDestinoId: number | null;
  pastoDestinoId: number | null;
  loteNome: string | null;
  pastoNome: string | null;
  destinoLabel: string;
  status: string;
  statusLabel: string;
  recebidoEm: string | null;
  recebidoEmSoData: boolean;
};

export function chaveItemListaRecebimentoCompra(opts: {
  origem: OrigemItemListaRecebimentoCompra;
  animalId: number;
  recebimentoId: number | null;
}): string {
  if (opts.origem === ORIGEM_RECEBIMENTO_LISTA && opts.recebimentoId != null) {
    return `${ORIGEM_RECEBIMENTO_LISTA}:${opts.recebimentoId}`;
  }
  return `${ORIGEM_LEGADO_LISTA}:${opts.animalId}`;
}

export function labelStatusRecebimentoCompra(status: string | null | undefined): string {
  const v = String(status ?? "").trim().toLowerCase();
  if (v === "confirmado") return "Confirmado";
  if (v === "estornado") return "Estornado";
  if (v === STATUS_LISTA_RECEBIDO) return "Recebido";
  return TEXTO_VAZIO_RECEBIMENTO_LISTA;
}

export function labelDestinoRecebimentoCompra(opts: {
  loteNome?: string | null;
  pastoNome?: string | null;
}): string {
  const lote = String(opts.loteNome ?? "").trim();
  const pasto = String(opts.pastoNome ?? "").trim();
  const partes = [
    lote ? `Lote ${lote}` : null,
    pasto ? `Pasto ${pasto}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(" • ") : TEXTO_VAZIO_RECEBIMENTO_LISTA;
}

export function textoOuTracoRecebimento(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  return t || TEXTO_VAZIO_RECEBIMENTO_LISTA;
}

/** Card "Último animal recebido": não inventa brinco visual a partir do RFID. */
export function rotuloUltimoAnimalRecebido(opts: {
  brincoVisual?: string | null;
  rfid?: string | null;
}): string {
  const visual = String(opts.brincoVisual ?? "").trim();
  if (visual) return `Brinco ${visual}`;
  const rfid = String(opts.rfid ?? "").trim();
  if (rfid) return `RFID ${rfid}`;
  return TEXTO_VAZIO_RECEBIMENTO_LISTA;
}

export function formatarPesoRecebimentoLista(pesoKg: number | null): string {
  if (pesoKg == null || !Number.isFinite(pesoKg) || pesoKg <= 0) {
    return TEXTO_VAZIO_RECEBIMENTO_LISTA;
  }
  return `${pesoKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
}

export function formatarDataHoraRecebimentoLista(value: Date | string | null | undefined): string {
  if (value == null || value === "") return TEXTO_VAZIO_RECEBIMENTO_LISTA;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return TEXTO_VAZIO_RECEBIMENTO_LISTA;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Só a data civil (dd/mm/aaaa). Não inventa horário. */
export function formatarDataEntradaRecebimentoLista(
  value: Date | string | null | undefined,
): string {
  if (value == null || value === "") return TEXTO_VAZIO_RECEBIMENTO_LISTA;
  if (typeof value === "string") {
    const iso = value.trim().slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return TEXTO_VAZIO_RECEBIMENTO_LISTA;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}/${mo}/${y}`;
}

export function formatarRecebidoEmLista(item: Pick<
  RecebimentoCompraListaItem,
  "recebidoEm" | "recebidoEmSoData"
>): string {
  if (item.recebidoEmSoData) return formatarDataEntradaRecebimentoLista(item.recebidoEm);
  return formatarDataHoraRecebimentoLista(item.recebidoEm);
}

function dataEntradaIso(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    const iso = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const mo = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

export function montarItemListaRecebimentoCompra(
  row: RecebimentoCompraListaRow,
  nomes?: { loteNome?: string | null; pastoNome?: string | null },
): RecebimentoCompraListaItem {
  const sexoLabel = labelSexoCompra(row.sexo);
  const categoria = String(row.categoria ?? "").trim() || TEXTO_VAZIO_RECEBIMENTO_LISTA;
  const loteNome = nomes?.loteNome ?? null;
  const pastoNome = nomes?.pastoNome ?? null;
  const recebidoEm =
    row.recebidoEm instanceof Date
      ? row.recebidoEm.toISOString()
      : row.recebidoEm
        ? String(row.recebidoEm)
        : null;
  const origem = ORIGEM_RECEBIMENTO_LISTA;
  const recebimentoId = row.id;
  const animalId = row.animalId;
  return {
    origem,
    animalId,
    recebimentoId,
    chaveLista: chaveItemListaRecebimentoCompra({ origem, animalId, recebimentoId }),
    compraId: row.compraId,
    brincoVisual: String(row.brincoVisual ?? "").trim(),
    rfid: String(row.rfid ?? "").trim() || null,
    sexo: row.sexo,
    sexoLabel,
    categoria,
    grupoLabel: `${categoria} • ${sexoLabel}`,
    pesoKg: parsePesoPositivo(row.pesoRecebimento),
    loteDestinoId: row.loteDestinoId,
    pastoDestinoId: row.pastoDestinoId,
    loteNome,
    pastoNome,
    destinoLabel: labelDestinoRecebimentoCompra({ loteNome, pastoNome }),
    status: row.status,
    statusLabel: labelStatusRecebimentoCompra(row.status),
    recebidoEm,
    recebidoEmSoData: false,
  };
}

export function montarItemListaRecebimentoLegado(
  animal: AnimalVinculoListaCompra,
  grupo: GrupoListaCompra | null | undefined,
  compraId: number,
): RecebimentoCompraListaItem {
  const sexo = grupo?.sexo ?? animal.sexo;
  const sexoLabel = labelSexoCompra(sexo);
  const categoria =
    String(grupo?.categoria ?? animal.categoria ?? "").trim() || TEXTO_VAZIO_RECEBIMENTO_LISTA;
  const origem = ORIGEM_LEGADO_LISTA;
  const animalId = animal.id;
  return {
    origem,
    animalId,
    recebimentoId: null,
    chaveLista: chaveItemListaRecebimentoCompra({ origem, animalId, recebimentoId: null }),
    compraId,
    brincoVisual: String(animal.brinco ?? "").trim(),
    rfid: String(animal.brincoEletronico ?? "").trim() || null,
    sexo,
    sexoLabel,
    categoria,
    grupoLabel: `${categoria} • ${sexoLabel}`,
    pesoKg: null,
    loteDestinoId: null,
    pastoDestinoId: null,
    loteNome: null,
    pastoNome: null,
    destinoLabel: TEXTO_VAZIO_RECEBIMENTO_LISTA,
    status: STATUS_LISTA_RECEBIDO,
    statusLabel: labelStatusRecebimentoCompra(STATUS_LISTA_RECEBIDO),
    recebidoEm: dataEntradaIso(animal.dataEntrada),
    recebidoEmSoData: true,
  };
}

function msOrdenacaoLista(item: RecebimentoCompraListaItem): number {
  if (!item.recebidoEm) return 0;
  if (item.recebidoEmSoData) {
    const iso = item.recebidoEm.slice(0, 10);
    const t = Date.parse(`${iso}T00:00:00`);
    return Number.isFinite(t) ? t : 0;
  }
  const t = new Date(item.recebidoEm).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function ordenarAnimaisRecebidosCompra(
  itens: readonly RecebimentoCompraListaItem[],
): RecebimentoCompraListaItem[] {
  return [...itens].sort((a, b) => {
    const diff = msOrdenacaoLista(b) - msOrdenacaoLista(a);
    if (diff !== 0) return diff;
    return b.animalId - a.animalId;
  });
}

export function unificarAnimaisRecebidosCompra(input: {
  compraId: number;
  recebimentos: readonly RecebimentoCompraListaItem[];
  animais: readonly AnimalVinculoListaCompra[];
  grupos: readonly GrupoListaCompra[];
}): RecebimentoCompraListaItem[] {
  const rastreados = input.recebimentos.filter(
    item =>
      item.origem === ORIGEM_RECEBIMENTO_LISTA &&
      item.status === COMPRA_RECEBIMENTO_STATUS_CONFIRMADO,
  );
  const comConfirmado = new Set(rastreados.map(item => item.animalId));
  const grupoPorId = new Map(input.grupos.map(grupo => [grupo.id, grupo]));
  const legados = input.animais
    .filter(animal => !comConfirmado.has(animal.id))
    .map(animal =>
      montarItemListaRecebimentoLegado(
        animal,
        animal.compraGrupoId != null ? grupoPorId.get(animal.compraGrupoId) : undefined,
        input.compraId,
      ),
    );
  return ordenarAnimaisRecebidosCompra([...rastreados, ...legados]);
}

export function recebimentosVisiveisNaSecao(
  itens: readonly RecebimentoCompraListaItem[],
): RecebimentoCompraListaItem[] {
  return itens.filter(
    item =>
      item.origem === ORIGEM_LEGADO_LISTA ||
      (item.origem === ORIGEM_RECEBIMENTO_LISTA &&
        item.status === COMPRA_RECEBIMENTO_STATUS_CONFIRMADO),
  );
}

export function podeMostrarAcaoDesfazerRecebimento(item: {
  origem?: string | null;
  recebimentoId?: number | null;
  status?: string | null;
}): boolean {
  if (String(item.origem ?? "").trim() !== ORIGEM_RECEBIMENTO_LISTA) return false;
  const id = Number(item.recebimentoId);
  if (!Number.isInteger(id) || id <= 0) return false;
  return String(item.status ?? "").trim() === COMPRA_RECEBIMENTO_STATUS_CONFIRMADO;
}
