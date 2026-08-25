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

function isNomeAnimalUtil(nome: string | null | undefined, brinco: string | null | undefined) {
  const n = nome?.trim() || "";
  const b = brinco?.trim() || "";
  if (!n) return false;
  if (b && n.localeCompare(b, undefined, { sensitivity: "accent" }) === 0) return false;
  if (/^\d+$/.test(n)) return false;
  return true;
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
  if (a.sexo === "macho") partes.push("Macho");
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
