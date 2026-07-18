import { calcularIdadeMeses, faixaIdadeLote, FAIXAS_IDADE_LOTE } from "../shared/lote-faixas-idade";
import type { RebanhoOverviewData } from "../shared/rebanhoOverviewDemo";
import { REBANHO_OVERVIEW_DEMO } from "../shared/rebanhoOverviewDemo";

function diasDesde(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export type OverviewAnimalInput = {
  id: number;
  brinco: string | null;
  categoria: string | null;
  sexo: string | null;
  raca: string | null;
  loteId: number | null;
  dataNascimento: string | null;
  dataEntrada: string | null;
  pesoAtual?: string | number | null;
};

export type OverviewPesagemInput = {
  animalId: number;
  peso: string | number;
  data: string | Date;
};

export type OverviewLoteInput = {
  id: number;
  nome: string | null;
  pastoAtualId?: number | null;
};

export type ComputeRebanhoOverviewInput = {
  lista: OverviewAnimalInput[];
  pesagensPorAnimal: Map<number, OverviewPesagemInput[]>;
  emCarenciaAnimalIds: Set<number>;
  lotesRows: OverviewLoteInput[];
  pastoCapacidadeMap: Map<number, number | null>;
  saidasCount: number;
  hoje?: Date;
};

export function emptyRebanhoOverview(): RebanhoOverviewData {
  return { ...REBANHO_OVERVIEW_DEMO };
}

export function computeRebanhoOverview(input: ComputeRebanhoOverviewInput): RebanhoOverviewData {
  const { lista, pesagensPorAnimal, emCarenciaAnimalIds, lotesRows, pastoCapacidadeMap, saidasCount } = input;
  const hoje = input.hoje ?? new Date();

  if (lista.length === 0) {
    return emptyRebanhoOverview();
  }

  hoje.setHours(0, 0, 0, 0);

  const loteAtividadeMap = new Map<number, string>();
  for (const l of lotesRows) {
    const n = (l.nome || "").toLowerCase();
    if (n.includes("cria") || n.includes("bezerr") || n.includes("matern")) {
      loteAtividadeMap.set(l.id, "Cria");
    } else if (n.includes("recria") || n.includes("novilh")) {
      loteAtividadeMap.set(l.id, "Recria");
    } else if (n.includes("engorda") || n.includes("confin") || n.includes("terminaç")) {
      loteAtividadeMap.set(l.id, "Engorda");
    } else {
      loteAtividadeMap.set(l.id, "Outros");
    }
  }

  const animaisPorLote = new Map<number, number>();
  for (const a of lista) {
    if (a.loteId) {
      animaisPorLote.set(a.loteId, (animaisPorLote.get(a.loteId) || 0) + 1);
    }
  }

  const animaisPorPasto = new Map<number, number>();
  for (const l of lotesRows) {
    if (l.pastoAtualId) {
      const qtd = animaisPorLote.get(l.id) || 0;
      animaisPorPasto.set(l.pastoAtualId, (animaisPorPasto.get(l.pastoAtualId) || 0) + qtd);
    }
  }

  let totalLotesSuperLotados = 0;
  for (const [pastoId, totalAnimaisPasto] of animaisPorPasto.entries()) {
    const cap = pastoCapacidadeMap.get(pastoId);
    if (cap && cap > 0 && totalAnimaisPasto > cap) {
      totalLotesSuperLotados++;
    }
  }

  let somaUltimoPeso = 0;
  let countComPeso = 0;
  let somaGmd = 0;
  let countComGmd = 0;
  let totalSemPesagemRecente = 0;
  const top5Gmd: { animalId: number; brinco: string | null; categoria: string | null; gmd: number }[] = [];
  const LIMITE_DIAS_SEM_PESAGEM = 60;

  for (const animal of lista) {
    const pesos = pesagensPorAnimal.get(animal.id) || [];
    const ultimoPeso = pesos.length > 0
      ? Number(pesos[pesos.length - 1].peso)
      : (animal.pesoAtual ? Number(animal.pesoAtual) : null);

    if (ultimoPeso !== null && ultimoPeso > 0) {
      somaUltimoPeso += ultimoPeso;
      countComPeso++;
    }

    if (pesos.length === 0) {
      totalSemPesagemRecente++;
    } else {
      const ultimaData = pesos[pesos.length - 1].data;
      const diasSemPesar = diasDesde(String(ultimaData));
      if (diasSemPesar !== null && diasSemPesar > LIMITE_DIAS_SEM_PESAGEM) {
        totalSemPesagemRecente++;
      }
    }

    let gmd: number | null = null;
    if (pesos.length >= 2) {
      const p1 = pesos[0];
      const p2 = pesos[pesos.length - 1];
      const d1 = new Date(p1.data);
      const d2 = new Date(p2.data);
      const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      gmd = Math.round(((Number(p2.peso) - Number(p1.peso)) / dias) * 1000) / 1000;
    }
    if (gmd !== null && gmd > 0) {
      somaGmd += gmd;
      countComGmd++;
      top5Gmd.push({ animalId: animal.id, brinco: animal.brinco, categoria: animal.categoria, gmd });
    }
  }

  top5Gmd.sort((a, b) => b.gmd - a.gmd);
  const top5 = top5Gmd.slice(0, 5);

  const total = lista.length;

  const catCount = new Map<string, number>();
  for (const a of lista) {
    const cat = a.categoria || "Sem categoria";
    catCount.set(cat, (catCount.get(cat) || 0) + 1);
  }
  const porCategoria = [...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

  const CATS_MACHOS = ["boi", "novilho", "bezerro"];
  const CATS_FEMEAS = ["vaca", "novilha", "bezerra"];
  const catMachosCount = new Map<string, number>();
  const catFemeasCount = new Map<string, number>();
  for (const a of lista) {
    const cat = (a.categoria || "").toLowerCase().trim();
    const label = a.categoria || "Outros";
    if (CATS_MACHOS.some(m => cat.includes(m))) {
      catMachosCount.set(label, (catMachosCount.get(label) || 0) + 1);
    } else if (CATS_FEMEAS.some(f => cat.includes(f))) {
      catFemeasCount.set(label, (catFemeasCount.get(label) || 0) + 1);
    } else if (a.sexo === "macho") {
      catMachosCount.set(label, (catMachosCount.get(label) || 0) + 1);
    } else if (a.sexo === "femea") {
      catFemeasCount.set(label, (catFemeasCount.get(label) || 0) + 1);
    }
  }
  const totalMachosCateg = [...catMachosCount.values()].reduce((s, v) => s + v, 0);
  const totalFemeasCateg = [...catFemeasCount.values()].reduce((s, v) => s + v, 0);
  const porCategoriaMachos = [...catMachosCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, pct: totalMachosCateg > 0 ? Math.round((value / totalMachosCateg) * 100) : 0 }));
  const porCategoriaFemeas = [...catFemeasCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, pct: totalFemeasCateg > 0 ? Math.round((value / totalFemeasCateg) * 100) : 0 }));

  const racaCount = new Map<string, number>();
  for (const a of lista) {
    const raca = a.raca || "Sem raça";
    racaCount.set(raca, (racaCount.get(raca) || 0) + 1);
  }
  const porRaca = [...racaCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

  const atividadeCount = new Map<string, number>();
  for (const a of lista) {
    const atividade = a.loteId ? (loteAtividadeMap.get(a.loteId) || "Outros") : "Sem lote";
    atividadeCount.set(atividade, (atividadeCount.get(atividade) || 0) + 1);
  }
  const porAtividade = [...atividadeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

  const etariaCount = new Map<string, number>(FAIXAS_IDADE_LOTE.map(f => [f, 0]));
  let semIdadeCount = 0;
  for (const a of lista) {
    const meses = calcularIdadeMeses(a.dataNascimento);
    const faixa = faixaIdadeLote(meses);
    if (faixa) {
      etariaCount.set(faixa, (etariaCount.get(faixa) || 0) + 1);
    } else {
      semIdadeCount++;
    }
  }
  const LABEL_MAP: Record<string, string> = {
    "0-8": "0–8 meses",
    "9-12": "9–12 meses",
    "13-24": "13–24 meses",
    "25-35": "25–35 meses",
    "36+": "36+ meses",
  };
  const totalComIdade = total - semIdadeCount;
  const porFaixaEtaria = FAIXAS_IDADE_LOTE.map(f => {
    const value = etariaCount.get(f) || 0;
    return { label: LABEL_MAP[f] || f, value, pct: totalComIdade > 0 ? Math.round((value / totalComIdade) * 100) : 0 };
  });

  const TODAS_CATS = ["Boi", "Novilho", "Bezerro", "Vaca", "Novilha", "Bezerra"];
  const cruzadoMap = new Map<string, Record<string, number>>();
  for (const f of FAIXAS_IDADE_LOTE) {
    cruzadoMap.set(f, Object.fromEntries(TODAS_CATS.map(c => [c, 0])));
  }
  for (const a of lista) {
    const meses = calcularIdadeMeses(a.dataNascimento);
    const faixa = faixaIdadeLote(meses);
    const cat = a.categoria;
    if (faixa && cat && TODAS_CATS.includes(cat)) {
      const row = cruzadoMap.get(faixa)!;
      row[cat] = (row[cat] || 0) + 1;
    }
  }
  const porFaixaEtariaCategoria = FAIXAS_IDADE_LOTE.map(f => ({
    faixa: LABEL_MAP[f] || f,
    categorias: cruzadoMap.get(f) || {},
  }));

  const faixas = [
    { label: "< 200 kg", min: 0, max: 200 },
    { label: "200–350 kg", min: 200, max: 350 },
    { label: "350–500 kg", min: 350, max: 500 },
    { label: "> 500 kg", min: 500, max: Infinity },
  ];
  const faixaCount = new Map<string, number>(faixas.map(f => [f.label, 0]));
  for (const a of lista) {
    const pesos = pesagensPorAnimal.get(a.id) || [];
    const peso = pesos.length > 0
      ? Number(pesos[pesos.length - 1].peso)
      : (a.pesoAtual ? Number(a.pesoAtual) : null);
    if (peso !== null) {
      const faixa = faixas.find(f => peso >= f.min && peso < f.max);
      if (faixa) faixaCount.set(faixa.label, (faixaCount.get(faixa.label) || 0) + 1);
    }
  }
  const porFaixaPeso = [...faixaCount.entries()]
    .map(([label, value]) => ({ label, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }));

  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const inicioMesStr = inicioMes.toISOString().slice(0, 10);
  const entradas = lista.filter(a => a.dataEntrada && a.dataEntrada >= inicioMesStr).length;
  const nascimentosNoMes = lista.filter(a => a.dataNascimento && a.dataNascimento >= inicioMesStr).length;

  return {
    totalAnimais: total,
    totalMachos: lista.filter(a => a.sexo === "macho").length,
    totalFemeas: lista.filter(a => a.sexo === "femea").length,
    pesoMedio: countComPeso > 0 ? Math.round(somaUltimoPeso / countComPeso) : null,
    gmdMedio: countComGmd > 0 ? Math.round((somaGmd / countComGmd) * 1000) / 1000 : null,
    totalEmCarencia: emCarenciaAnimalIds.size,
    totalSemLote: lista.filter(a => !a.loteId).length,
    totalSemPesagemRecente,
    totalLotesSuperLotados,
    porCategoria,
    porCategoriaMachos,
    porCategoriaFemeas,
    porFaixaEtaria,
    porFaixaEtariaCategoria,
    porRaca,
    porAtividade,
    porFaixaPeso,
    top5Gmd: top5,
    evolucaoEfetivo: { entradas, saidas: saidasCount, nascimentosNoMes },
  };
}
