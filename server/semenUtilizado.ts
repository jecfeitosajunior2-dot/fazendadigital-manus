import { and, eq } from "drizzle-orm";
import {
  buildSemenUtilizadoGrupoKey,
  buildSemenUtilizadoVisao,
  parseSemenUtilizadoGrupoKey,
  sortSemenUtilizadoUsosDetalhe,
  type SemenUtilizadoFiltros,
  type SemenUtilizadoGrupo,
  type SemenUtilizadoReprodutorOpcao,
  type SemenUtilizadoUso,
} from "../shared/semenUtilizado";
import { animais, db, reproducaoRegistros, semenPartidas } from "./db";
import { listLocalAnimais, listLocalReproducaoRegistros } from "./localFallbackStore";
import { assertFazendaDoUsuario } from "./manejoContexto";
import { listSemenPartidasCentralLocal } from "./semenEstoqueLocal";

export type SemenUtilizadoListResult = {
  grupos: SemenUtilizadoGrupo[];
  custoTotalFiltrado: number | null;
  reprodutoresOpcoes: SemenUtilizadoReprodutorOpcao[];
};

export type SemenUtilizadoDetalheResult = {
  grupo: SemenUtilizadoGrupo;
  usos: SemenUtilizadoUso[];
  reprodutoresOpcoes: SemenUtilizadoReprodutorOpcao[];
};

function normalizeFiltros(input: SemenUtilizadoFiltros): SemenUtilizadoFiltros {
  return {
    fazendaId: Number(input.fazendaId) || 0,
    search: String(input.search ?? "").trim() || undefined,
    dataIni: String(input.dataIni ?? "").trim() || undefined,
    dataFim: String(input.dataFim ?? "").trim() || undefined,
    reprodutor: String(input.reprodutor ?? "").trim() || undefined,
  };
}

async function loadSemenUtilizadoFontesDb(userId: number) {
  const [registros, animaisRows, partidas] = await Promise.all([
    db
      .select({
        id: reproducaoRegistros.id,
        tipo: reproducaoRegistros.tipo,
        femeaId: reproducaoRegistros.femeaId,
        machoId: reproducaoRegistros.machoId,
        dataCobertura: reproducaoRegistros.dataCobertura,
        createdAt: reproducaoRegistros.createdAt,
        resultado: reproducaoRegistros.resultado,
        observacoes: reproducaoRegistros.observacoes,
      })
      .from(reproducaoRegistros)
      .where(
        and(eq(reproducaoRegistros.userId, userId), eq(reproducaoRegistros.tipo, "Inseminação")),
      ),
    db
      .select({
        id: animais.id,
        brinco: animais.brinco,
        nome: animais.nome,
        fazendaId: animais.fazendaId,
      })
      .from(animais)
      .where(eq(animais.userId, userId)),
    db
      .select({
        id: semenPartidas.id,
        centralOrigem: semenPartidas.centralOrigem,
        reprodutorTexto: semenPartidas.reprodutorTexto,
        reprodutorKey: semenPartidas.reprodutorKey,
        origemReprodutor: semenPartidas.origemReprodutor,
        machoId: semenPartidas.machoId,
      })
      .from(semenPartidas)
      .where(eq(semenPartidas.userId, userId)),
  ]);
  return { registros, animaisRows, partidas };
}

async function loadSemenUtilizadoFontesLocal(userId: number) {
  const [registrosAll, animaisAll, partidas] = await Promise.all([
    listLocalReproducaoRegistros(userId),
    listLocalAnimais(userId),
    listSemenPartidasCentralLocal(userId),
  ]);
  const registros = registrosAll.filter(
    r => r.userId === userId && String(r.tipo ?? "").trim() === "Inseminação",
  );
  const animaisRows = animaisAll
    .filter(a => a.userId === userId)
    .map(a => ({
      id: a.id,
      brinco: a.brinco ?? null,
      nome: a.nome ?? null,
      fazendaId: a.fazendaId ?? null,
    }));
  return { registros, animaisRows, partidas };
}

export async function listSemenUtilizadoDb(
  userId: number,
  filtros: SemenUtilizadoFiltros,
): Promise<SemenUtilizadoListResult> {
  const fazendaId = Number(filtros.fazendaId) || 0;
  if (fazendaId > 0) await assertFazendaDoUsuario(userId, fazendaId);
  const fontes = await loadSemenUtilizadoFontesDb(userId);
  const visao = buildSemenUtilizadoVisao(
    fontes.registros,
    fontes.animaisRows,
    normalizeFiltros(filtros),
    fontes.partidas,
  );
  return {
    grupos: visao.grupos,
    custoTotalFiltrado: visao.custoTotalFiltrado,
    reprodutoresOpcoes: visao.reprodutoresOpcoes,
  };
}

export async function listSemenUtilizadoLocal(
  userId: number,
  filtros: SemenUtilizadoFiltros,
): Promise<SemenUtilizadoListResult> {
  const fazendaId = Number(filtros.fazendaId) || 0;
  if (fazendaId > 0) await assertFazendaDoUsuario(userId, fazendaId);
  const fontes = await loadSemenUtilizadoFontesLocal(userId);
  const visao = buildSemenUtilizadoVisao(
    fontes.registros,
    fontes.animaisRows,
    normalizeFiltros(filtros),
    fontes.partidas,
  );
  return {
    grupos: visao.grupos,
    custoTotalFiltrado: visao.custoTotalFiltrado,
    reprodutoresOpcoes: visao.reprodutoresOpcoes,
  };
}

export async function getSemenUtilizadoDb(
  userId: number,
  key: string,
  filtros: SemenUtilizadoFiltros,
): Promise<SemenUtilizadoDetalheResult | null> {
  const parsed = parseSemenUtilizadoGrupoKey(key);
  if (!parsed) return null;
  const fazendaId = Number(filtros.fazendaId) || 0;
  if (fazendaId > 0) await assertFazendaDoUsuario(userId, fazendaId);
  const fontes = await loadSemenUtilizadoFontesDb(userId);
  const visao = buildSemenUtilizadoVisao(
    fontes.registros,
    fontes.animaisRows,
    normalizeFiltros(filtros),
    fontes.partidas,
  );
  const grupo = visao.grupos.find(g => g.key === buildSemenUtilizadoGrupoKey(parsed));
  if (!grupo) return null;
  const usos = sortSemenUtilizadoUsosDetalhe(visao.usos.filter(u => u.origem === grupo.origem && u.reprodutorKey === grupo.reprodutorKey && u.partida === grupo.partida));
  return { grupo, usos, reprodutoresOpcoes: visao.reprodutoresOpcoes };
}

export async function getSemenUtilizadoLocal(
  userId: number,
  key: string,
  filtros: SemenUtilizadoFiltros,
): Promise<SemenUtilizadoDetalheResult | null> {
  const parsed = parseSemenUtilizadoGrupoKey(key);
  if (!parsed) return null;
  const fazendaId = Number(filtros.fazendaId) || 0;
  if (fazendaId > 0) await assertFazendaDoUsuario(userId, fazendaId);
  const fontes = await loadSemenUtilizadoFontesLocal(userId);
  const visao = buildSemenUtilizadoVisao(
    fontes.registros,
    fontes.animaisRows,
    normalizeFiltros(filtros),
    fontes.partidas,
  );
  const grupo = visao.grupos.find(g => g.key === buildSemenUtilizadoGrupoKey(parsed));
  if (!grupo) return null;
  const usos = sortSemenUtilizadoUsosDetalhe(
    visao.usos.filter(
      u =>
        u.origem === grupo.origem &&
        u.reprodutorKey === grupo.reprodutorKey &&
        u.partida === grupo.partida,
    ),
  );
  return { grupo, usos, reprodutoresOpcoes: visao.reprodutoresOpcoes };
}
