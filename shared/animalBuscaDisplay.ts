/** Linha mínima para exibição em autocomplete de animais. */
export type AnimalBuscaDisplayRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  loteId?: number | null;
  loteNome?: string | null;
  sexo?: string | null;
  categoria?: string | null;
};

/** True quando o nome agrega informação além do brinco visual. */
export function isNomeAnimalUtil(nome: string | null | undefined, brinco: string | null | undefined) {
  const n = nome?.trim() || "";
  const b = brinco?.trim() || "";
  if (!n) return false;
  if (b && n.localeCompare(b, undefined, { sensitivity: "accent" }) === 0) return false;
  if (/^\d+$/.test(n)) return false;
  return true;
}

function normalizeSexoAnimal(sexo?: string | null): "macho" | "femea" | null {
  const v = (sexo ?? "").trim().toLowerCase();
  if (v === "macho") return "macho";
  if (v === "femea" || v === "fêmea") return "femea";
  return null;
}

/** Texto de sexo para subtítulo/acessibilidade. Desconhecido: null (não inventar). */
export function labelSexoAnimal(sexo?: string | null): "Macho" | "Fêmea" | null {
  const n = normalizeSexoAnimal(sexo);
  if (n === "macho") return "Macho";
  if (n === "femea") return "Fêmea";
  return null;
}

/**
 * Bolinha de sexo — mesmo padrão do card selecionado e da lista do rebanho:
 * macho = azul, fêmea = rosa. Sexo desconhecido: omitir.
 */
export function sexoDotClassName(sexo?: string | null): "bg-blue-400" | "bg-pink-400" | null {
  const n = normalizeSexoAnimal(sexo);
  if (n === "macho") return "bg-blue-400";
  if (n === "femea") return "bg-pink-400";
  return null;
}

/** Inclui "Macho"/"Fêmea" no subtítulo sem duplicar se já estiver lá. */
export function withSexoNoSubtitulo(sexo: string | null | undefined, subtitle: string): string {
  const label = labelSexoAnimal(sexo);
  const t = subtitle.trim();
  if (!label) return t;
  if (!t) return label;
  if (t.toLowerCase().startsWith(label.toLowerCase())) return t;
  return `${label} · ${t}`;
}

/** Título da sugestão: brinco visual (nunca PK interna). */
export function labelAnimalBusca(a: AnimalBuscaDisplayRow): string {
  const brinco = a.brinco?.trim() || "";
  const nome = a.nome?.trim() || "";
  if (brinco && isNomeAnimalUtil(nome, brinco)) return `${brinco} · ${nome}`;
  if (brinco) return brinco;
  if (isNomeAnimalUtil(nome, null)) return nome;
  if (nome) return nome;
  return `#${a.id}`;
}

export function subtituloAnimalBusca(a: AnimalBuscaDisplayRow): string {
  const partes: string[] = [];
  const brinco = a.brinco?.trim();
  const rfid = a.brincoEletronico?.trim();
  if (brinco) partes.push(`Brinco visual ${brinco}`);
  if (rfid) partes.push(`RFID ${rfid}`);
  if (a.loteNome?.trim()) partes.push(`Lote ${a.loteNome.trim()}`);
  else if (a.loteId) partes.push(`Lote #${a.loteId}`);
  return partes.join(" · ");
}

export function subtituloMachoReprodutor(a: AnimalBuscaDisplayRow): string {
  const partes: string[] = [];
  const sexo = labelSexoAnimal(a.sexo);
  if (sexo) partes.push(sexo);
  if (a.categoria?.trim()) partes.push(a.categoria.trim());
  const extra = subtituloAnimalBusca(a);
  if (extra) partes.push(extra);
  return partes.join(" · ");
}

/** Identificador principal do animal selecionado. */
export function labelAnimalSelecionado(a: AnimalBuscaDisplayRow): string {
  const brinco = a.brinco?.trim() || "";
  const nome = a.nome?.trim() || "";
  if (brinco && isNomeAnimalUtil(nome, brinco)) return `${brinco} · ${nome}`;
  if (brinco) return brinco;
  if (isNomeAnimalUtil(nome, null)) return nome;
  if (nome) return nome;
  return String(a.id);
}

export function loteAnimalSelecionado(a: AnimalBuscaDisplayRow): string | null {
  if (a.loteNome?.trim()) return a.loteNome.trim();
  if (a.loteId) return `#${a.loteId}`;
  return null;
}
