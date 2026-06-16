import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  animais, lotes, pastos, pesagens, saudeRegistros, estoque,
} from "../../drizzle/schema";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import z from "zod";
import { calcularIdadeMeses, faixaIdadeLote, FAIXAS_IDADE_LOTE } from "../../shared/lote-faixas-idade";

// ─── Helper: dias entre data e hoje ──────────────────────────────────────────
function diasDesde(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export const rebanhoOverviewRouter = router({
  overview: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      // ── 1. Buscar todos os animais ativos ────────────────────────────────
      const conditions: ReturnType<typeof eq>[] = [
        eq(animais.userId, userId),
        eq(animais.status, "ativo"),
      ];
      if (input?.fazendaId) {
        conditions.push(eq(animais.fazendaId, input.fazendaId));
      }
      const lista = await db.select().from(animais).where(and(...conditions));

      if (lista.length === 0) {
        return {
          totalAnimais: 0,
          totalMachos: 0,
          totalFemeas: 0,
          pesoMedio: null,
          gmdMedio: null,
          totalEmCarencia: 0,
          totalSemLote: 0,
          totalSemPesagemRecente: 0,
          totalLotesSuperLotados: 0,
          porCategoria: [] as { label: string; value: number; pct: number }[],
          porCategoriaMachos: [] as { label: string; value: number; pct: number }[],
          porCategoriaFemeas: [] as { label: string; value: number; pct: number }[],
          porRaca: [] as { label: string; value: number; pct: number }[],
          porAtividade: [] as { label: string; value: number; pct: number }[],
          porFaixaPeso: [] as { label: string; value: number; pct: number }[],
          porFaixaEtaria: [] as { label: string; value: number; pct: number }[],
          top5Gmd: [] as { brinco: string | null; categoria: string | null; gmd: number }[],
          evolucaoEfetivo: { entradas: 0, saidas: 0 },
        };
      }

      const animalIds = lista.map(a => a.id);
      const loteIds = [...new Set(lista.map(a => a.loteId).filter(Boolean) as number[])];

      // ── 2. Pesagens ───────────────────────────────────────────────────────
      const todasPesagens = await db.select()
        .from(pesagens)
        .where(and(eq(pesagens.userId, userId), inArray(pesagens.animalId, animalIds)))
        .orderBy(pesagens.animalId, pesagens.data);

      const pesagensPorAnimal = new Map<number, typeof todasPesagens>();
      for (const p of todasPesagens) {
        if (!pesagensPorAnimal.has(p.animalId)) pesagensPorAnimal.set(p.animalId, []);
        pesagensPorAnimal.get(p.animalId)!.push(p);
      }

      // ── 3. Carências ──────────────────────────────────────────────────────
      const saudeAll = await db.select({
        animalId: saudeRegistros.animalId,
        medicamento: saudeRegistros.medicamento,
        dataRegistro: saudeRegistros.dataRegistro,
      })
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.userId, userId), inArray(saudeRegistros.animalId, animalIds)))
        .orderBy(desc(saudeRegistros.dataRegistro));

      const medicamentosCarencia = await db.select({
        nome: estoque.nome,
        carenciaAbateDias: estoque.carenciaAbateDias,
      }).from(estoque).where(eq(estoque.possuiCarencia, true));

      const medCarenciaMap = new Map(
        medicamentosCarencia.map(m => [m.nome.toLowerCase().trim(), m.carenciaAbateDias || 0])
      );

      const emCarenciaSet = new Set<number>();
      const saudeVistos = new Set<string>();
      for (const s of saudeAll) {
        const chave = `${s.animalId}-${s.medicamento}`;
        if (saudeVistos.has(chave)) continue;
        saudeVistos.add(chave);
        const med = (s.medicamento || "").toLowerCase().trim();
        const diasCarencia = medCarenciaMap.get(med);
        if (diasCarencia && diasCarencia > 0 && s.dataRegistro) {
          const dataAplicacao = new Date(s.dataRegistro);
          const fimCarencia = new Date(dataAplicacao);
          fimCarencia.setDate(fimCarencia.getDate() + diasCarencia);
          if (fimCarencia >= hoje) emCarenciaSet.add(s.animalId);
        }
      }

      // ── 4. Lotes com atividade ────────────────────────────────────────────
      const lotesRows = loteIds.length
        ? await db.select({ id: lotes.id, nome: lotes.nome, capacidade: lotes.capacidade })
            .from(lotes)
            .where(inArray(lotes.id, loteIds))
        : [];
      const loteAtividadeMap = new Map<number, string>();
      // Inferir atividade pelo nome do lote (heurística)
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

      // Contar animais por lote para verificar superlotação
      const animaisPorLote = new Map<number, number>();
      for (const a of lista) {
        if (a.loteId) {
          animaisPorLote.set(a.loteId, (animaisPorLote.get(a.loteId) || 0) + 1);
        }
      }
      let totalLotesSuperLotados = 0;
      for (const l of lotesRows) {
        if (l.capacidade && l.capacidade > 0) {
          const qtd = animaisPorLote.get(l.id) || 0;
          if (qtd > l.capacidade) totalLotesSuperLotados++;
        }
      }

      // ── 5. Calcular métricas por animal ───────────────────────────────────
      let somaUltimoPeso = 0;
      let countComPeso = 0;
      let somaGmd = 0;
      let countComGmd = 0;
      let totalSemPesagemRecente = 0;
      const top5Gmd: { brinco: string | null; categoria: string | null; gmd: number }[] = [];

      const LIMITE_DIAS_SEM_PESAGEM = 30;

      for (const animal of lista) {
        const pesos = pesagensPorAnimal.get(animal.id) || [];
        const ultimoPeso = pesos.length > 0
          ? Number(pesos[pesos.length - 1].peso)
          : (animal.pesoAtual ? Number(animal.pesoAtual) : null);

        if (ultimoPeso !== null && ultimoPeso > 0) {
          somaUltimoPeso += ultimoPeso;
          countComPeso++;
        }

        // Sem pesagem recente: última pesagem há mais de 30 dias (ou nunca pesado)
        if (pesos.length === 0) {
          totalSemPesagemRecente++;
        } else {
          const ultimaData = pesos[pesos.length - 1].data;
          const diasSemPesar = diasDesde(String(ultimaData));
          if (diasSemPesar !== null && diasSemPesar > LIMITE_DIAS_SEM_PESAGEM) {
            totalSemPesagemRecente++;
          }
        }

        // GMD
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
          top5Gmd.push({ brinco: animal.brinco, categoria: animal.categoria, gmd });
        }
      }

      top5Gmd.sort((a, b) => b.gmd - a.gmd);
      const top5 = top5Gmd.slice(0, 5);

      // ── 6. Distribuições ──────────────────────────────────────────────────
      const total = lista.length;

      // Por categoria
      const catCount = new Map<string, number>();
      for (const a of lista) {
        const cat = a.categoria || "Sem categoria";
        catCount.set(cat, (catCount.get(cat) || 0) + 1);
      }
      const porCategoria = [...catCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

      // Por categoria separado por sexo
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

      // Por raça
      const racaCount = new Map<string, number>();
      for (const a of lista) {
        const raca = a.raca || "Sem raça";
        racaCount.set(raca, (racaCount.get(raca) || 0) + 1);
      }
      const porRaca = [...racaCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

      // Por atividade (via lote)
      const atividadeCount = new Map<string, number>();
      for (const a of lista) {
        const atividade = a.loteId ? (loteAtividadeMap.get(a.loteId) || "Outros") : "Sem lote";
        atividadeCount.set(atividade, (atividadeCount.get(atividade) || 0) + 1);
      }
      const porAtividade = [...atividadeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value, pct: Math.round((value / total) * 100) }));

      // Por faixa etária
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
        '0-8': '0–8 meses',
        '9-12': '9–12 meses',
        '13-24': '13–24 meses',
        '25-36': '25–36 meses',
        '36+': '> 36 meses',
      };
      const totalComIdade = total - semIdadeCount;
      const porFaixaEtaria = FAIXAS_IDADE_LOTE.map(f => {
        const value = etariaCount.get(f) || 0;
        return { label: LABEL_MAP[f] || f, value, pct: totalComIdade > 0 ? Math.round((value / totalComIdade) * 100) : 0 };
      });

      // Por faixa de peso
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

      // ── 7. Evolução do efetivo no mês atual ───────────────────────────────
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const inicioMesStr = inicioMes.toISOString().slice(0, 10);
      const entradas = lista.filter(a => {
        const d = a.dataEntrada || a.dataNascimento;
        return d && d >= inicioMesStr;
      }).length;
      const saidas = await db.select({ count: sql<number>`count(*)` })
        .from(animais)
        .where(and(
          eq(animais.userId, userId),
          sql`status IN ('vendido','morto','transferido')`,
          sql`updatedAt >= ${inicioMesStr}`
        ));
      const saidasCount = Number(saidas[0]?.count ?? 0);

      return {
        totalAnimais: total,
        totalMachos: lista.filter(a => a.sexo === "macho").length,
        totalFemeas: lista.filter(a => a.sexo === "femea").length,
        pesoMedio: countComPeso > 0 ? Math.round(somaUltimoPeso / countComPeso) : null,
        gmdMedio: countComGmd > 0 ? Math.round((somaGmd / countComGmd) * 1000) / 1000 : null,
        totalEmCarencia: emCarenciaSet.size,
        totalSemLote: lista.filter(a => !a.loteId).length,
        totalSemPesagemRecente,
        totalLotesSuperLotados,
        porCategoria,
        porCategoriaMachos,
        porCategoriaFemeas,
        porFaixaEtaria,
        porRaca,
        porAtividade,
        porFaixaPeso,
        top5Gmd: top5,
        evolucaoEfetivo: { entradas, saidas: saidasCount },
      };
    }),
});
