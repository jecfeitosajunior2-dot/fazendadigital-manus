import { lerTipoExecucaoManutencao } from "@shared/manutencaoTipoExecucao";

export function toggleExpandedId<T>(prev: ReadonlySet<T>, id: T): Set<T> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function rotuloTipoExecucaoLista(tipo?: string | null): string {
  const t = lerTipoExecucaoManutencao(tipo);
  if (t === "interna") return "Interna";
  if (t === "externa") return "Prestador externo";
  return "Não informado";
}

export function rotuloStatusManutencaoLista(status?: string | null): string {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "estornado") return "Estornada";
  if (s === "concluida") return "Concluída";
  if (s === "agendada") return "Agendada";
  return String(status ?? "").trim() || "—";
}

export function camposOpcionaisDetalheManutencao(input: {
  tipoExecucao?: string | null;
  prestadorContato?: string | null;
  horimetro?: string | null;
  proximaManutencao?: unknown;
}): {
  telefone: boolean;
  horimetro: boolean;
  proximaManutencao: boolean;
  maoObra: boolean;
  valorCobradoOficina: boolean;
} {
  const externa = lerTipoExecucaoManutencao(input.tipoExecucao) === "externa";
  return {
    telefone: Boolean(String(input.prestadorContato ?? "").trim()),
    horimetro: Boolean(String(input.horimetro ?? "").trim()),
    proximaManutencao: Boolean(input.proximaManutencao),
    maoObra: externa,
    valorCobradoOficina: externa,
  };
}

export function acoesAbastecimentoLista(input: {
  abastecidoNaFazenda?: boolean | null;
  fazendaId?: number | null;
  status?: string | null;
}): { podeEditar: boolean; podeEstornar: boolean; podeExcluir: boolean } {
  const isEstornado = String(input.status ?? "registrado").toLowerCase() === "estornado";
  const isEstoque = Boolean(input.abastecidoNaFazenda && input.fazendaId);
  return {
    podeEditar: !isEstornado,
    podeEstornar: isEstoque && !isEstornado,
    podeExcluir: !isEstoque && !isEstornado,
  };
}

export function rotuloStatusAbastecimentoLista(status?: string | null): string {
  return String(status ?? "registrado").toLowerCase() === "estornado" ? "Estornado" : "Registrado";
}
