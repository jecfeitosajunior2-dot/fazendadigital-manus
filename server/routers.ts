import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { db } from "./db";
import {
  users, animais, lotes, saudeRegistros, reproducaoRegistros,
  maquinas, abastecimentos, manutencoes, manutencaoPecas, pesagens, batidas,
  benfeitorias, estoque, estoqueMovimentacoes, contasFinanceiras, movimentacoes,
  compras, vendas, fazendas, pastos, lotePastoMovimentacoes
} from "../drizzle/schema";
import { eq, desc, and, sql, isNull, inArray } from "drizzle-orm";
import { createSession, clearAuthCookie } from "./_core/cookies";
import { resolveImageSlots } from "./_core/storage";

const imageSlotInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("empty") }),
  z.object({ type: z.literal("keep"), path: z.string() }),
  z.object({ type: z.literal("new"), data: z.string(), mimeType: z.string() }),
]);

// ─── AUTH ROUTER ─────────────────────────────────────────────────────────────
const authRouter = router({
  me: protectedProcedure.query(({ ctx }) => ctx.user),

  login: publicProcedure
    .input(z.object({ username: z.string(), password: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Support login by email OR by openId
      const { or } = await import("drizzle-orm");
      const [user] = await db.select().from(users).where(
        or(eq(users.openId, input.username), eq(users.email, input.username))
      ).limit(1);
      if (!user) throw new Error("Usuário não encontrado");
      // Check password: use passwordHash if available, otherwise fallback to admin123
      let valid = false;
      if (user.passwordHash) {
        valid = await bcrypt.compare(input.password, user.passwordHash);
      } else {
        valid = input.password === "admin123";
      }
      if (!valid) throw new Error("Senha incorreta");
      const token = await createSession({ id: user.id, openId: user.openId, name: user.name, email: user.email || "", role: user.role || "user" });
      ctx.res.cookie("session", token, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
      return { success: true, user: { id: user.id, openId: user.openId, name: user.name, email: user.email, role: user.role } };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    clearAuthCookie(ctx.res);
    return { success: true };
  }),
});

// ─── ANIMAIS ROUTER ───────────────────────────────────────────────────────────
const animaisRouter = router({
  list: protectedProcedure
    .input(z.object({ sexo: z.string().optional(), status: z.string().optional(), loteId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(animais.userId, ctx.user.id)];
      if (input?.sexo && input.sexo !== '') conditions.push(eq(animais.sexo, input.sexo as any));
      if (input?.status && input.status !== '') conditions.push(eq(animais.status, input.status as any));
      if (input?.loteId) conditions.push(eq(animais.loteId, input.loteId));

      const lista = await db.select().from(animais).where(and(...conditions)).orderBy(desc(animais.createdAt));
      if (lista.length === 0) return [];

      const animalIds = lista.map(a => a.id);

      // Busca lotes
      const lotesAll = await db.select({ id: lotes.id, nome: lotes.nome })
        .from(lotes).where(eq(lotes.userId, ctx.user.id));
      const loteMap = new Map(lotesAll.map(l => [l.id, l.nome]));

      // Busca TODAS as pesagens dos animais listados (para calcular GMD e ganho)
      const todasPesagens = await db.select()
        .from(pesagens)
        .where(and(eq(pesagens.userId, ctx.user.id), inArray(pesagens.animalId, animalIds)))
        .orderBy(pesagens.animalId, pesagens.data);

      // Agrupa pesagens por animalId
      const pesagensPorAnimal = new Map<number, typeof todasPesagens>();
      for (const p of todasPesagens) {
        if (!pesagensPorAnimal.has(p.animalId)) pesagensPorAnimal.set(p.animalId, []);
        pesagensPorAnimal.get(p.animalId)!.push(p);
      }

      // Busca últimos registros de saúde com carencia para cada animal
      // Usa o campo medicamento para cruzar com estoque
      const saudeAll = await db.select({
        animalId: saudeRegistros.animalId,
        medicamento: saudeRegistros.medicamento,
        dataRegistro: saudeRegistros.dataRegistro,
      })
        .from(saudeRegistros)
        .where(and(eq(saudeRegistros.userId, ctx.user.id), inArray(saudeRegistros.animalId, animalIds)))
        .orderBy(desc(saudeRegistros.dataRegistro));

      // Busca medicamentos do estoque que possuem carencia
      // Nota: tabela estoque não tem userId, filtra apenas por possuiCarencia
      const medicamentosCarencia = await db.select({
        nome: estoque.nome,
        carenciaAbateDias: estoque.carenciaAbateDias,
        possuiCarencia: estoque.possuiCarencia,
      }).from(estoque).where(eq(estoque.possuiCarencia, true));
      const medCarenciaMap = new Map(medicamentosCarencia.map(m => [m.nome.toLowerCase().trim(), m.carenciaAbateDias || 0]));

      // Para cada animal, calcula "em carência" = se existe registro de saúde recente com medicamento de carencia
      // cuja data de fim da carencia ainda não passou
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const emCarenciaPorAnimal = new Map<number, boolean>();
      // Agrupa por animal (pega o mais recente de cada medicamento)
      const saudeVistos = new Set<string>();
      for (const s of saudeAll) {
        const chave = `${s.animalId}-${s.medicamento}`;
        if (saudeVistos.has(chave)) continue;
        saudeVistos.add(chave);
        const med = (s.medicamento || '').toLowerCase().trim();
        const diasCarencia = medCarenciaMap.get(med);
        if (diasCarencia && diasCarencia > 0 && s.dataRegistro) {
          const dataAplicacao = new Date(s.dataRegistro);
          const fimCarencia = new Date(dataAplicacao);
          fimCarencia.setDate(fimCarencia.getDate() + diasCarencia);
          if (fimCarencia >= hoje) {
            emCarenciaPorAnimal.set(s.animalId, true);
          }
        }
      }

      // Monta resultado enriquecido
      return lista.map(animal => {
        const loteNome = animal.loteId ? (loteMap.get(animal.loteId) || null) : null;

        // Idade em meses
        let idadeMeses: number | null = null;
        if (animal.dataNascimento) {
          const nasc = new Date(animal.dataNascimento);
          const diffMs = hoje.getTime() - nasc.getTime();
          idadeMeses = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44));
        }

        // Dias na fazenda
        let diasNaFazenda: number | null = null;
        if (animal.dataEntrada) {
          const entrada = new Date(animal.dataEntrada);
          diasNaFazenda = Math.floor((hoje.getTime() - entrada.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Pesagens do animal (ordenadas por data asc)
        const pesos = pesagensPorAnimal.get(animal.id) || [];
        const ultimoPeso = pesos.length > 0 ? Number(pesos[pesos.length - 1].peso) : (animal.pesoAtual ? Number(animal.pesoAtual) : null);
        const primeiroPeso = pesos.length > 0 ? Number(pesos[0].peso) : (animal.pesoEntrada ? Number(animal.pesoEntrada) : null);

        // Ganho total (kg)
        let ganhoKg: number | null = null;
        if (ultimoPeso !== null && primeiroPeso !== null && ultimoPeso !== primeiroPeso) {
          ganhoKg = Math.round((ultimoPeso - primeiroPeso) * 100) / 100;
        }

        // GMD: ganho médio diário (kg/dia)
        let gmd: number | null = null;
        if (pesos.length >= 2) {
          const p1 = pesos[0];
          const p2 = pesos[pesos.length - 1];
          const d1 = new Date(p1.data);
          const d2 = new Date(p2.data);
          const dias = Math.max(1, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
          gmd = Math.round(((Number(p2.peso) - Number(p1.peso)) / dias) * 1000) / 1000;
        } else if (diasNaFazenda && diasNaFazenda > 0 && ganhoKg !== null) {
          gmd = Math.round((ganhoKg / diasNaFazenda) * 1000) / 1000;
        }

        return {
          ...animal,
          loteNome,
          idadeMeses,
          diasNaFazenda,
          ultimoPeso,
          ganhoKg,
          gmd,
          emCarencia: emCarenciaPorAnimal.get(animal.id) || false,
        };
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [animal] = await db.select().from(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id))).limit(1);
      return animal;
    }),

  create: protectedProcedure
    .input(z.object({
      brinco: z.string().optional(),
      brincoEletronico: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["macho", "femea"]),
      dataNascimento: z.string().optional(),
      pesoAtual: z.string().optional(),
      loteId: z.number().optional(),
      categoria: z.string().optional(),
      observacoes: z.string().optional(),
      // Zootécnicos
      pelagem: z.string().optional(),
      marca: z.string().optional(),
      dataDesmama: z.string().optional(),
      castrado: z.boolean().optional(),
      // Entrada / aquisição
      dataEntrada: z.string().optional(),
      pesoEntrada: z.string().optional(),
      produtorOrigem: z.string().optional(),
      precoKg: z.string().optional(),
      frete: z.string().optional(),
      // Rastreabilidade
      sisbov: z.string().optional(),
      dataRnd: z.string().optional(),
      rgn: z.string().optional(),
      rgd: z.string().optional(),
      rastreadoNascimento: z.boolean().optional(),
      // Genealogia
      pai: z.string().optional(),
      mae: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(animais).values({
        userId: ctx.user.id,
        brinco: input.brinco,
        brincoEletronico: input.brincoEletronico,
        nome: input.nome,
        raca: input.raca,
        sexo: input.sexo,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : undefined,
        pesoAtual: input.pesoAtual,
        loteId: input.loteId,
        categoria: input.categoria,
        observacoes: input.observacoes,
        pelagem: input.pelagem,
        marca: input.marca,
        dataDesmama: input.dataDesmama ? new Date(input.dataDesmama) : undefined,
        castrado: input.castrado,
        dataEntrada: input.dataEntrada ? new Date(input.dataEntrada) : undefined,
        pesoEntrada: input.pesoEntrada,
        produtorOrigem: input.produtorOrigem,
        precoKg: input.precoKg,
        frete: input.frete,
        sisbov: input.sisbov,
        dataRnd: input.dataRnd ? new Date(input.dataRnd) : undefined,
        rgn: input.rgn,
        rgd: input.rgd,
        rastreadoNascimento: input.rastreadoNascimento,
        pai: input.pai,
        mae: input.mae,
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      brinco: z.string().optional(),
      brincoEletronico: z.string().optional(),
      nome: z.string().optional(),
      raca: z.string().optional(),
      sexo: z.enum(["macho", "femea"]).optional(),
      dataNascimento: z.string().optional(),
      pesoAtual: z.string().optional(),
      loteId: z.number().optional(),
      categoria: z.string().optional(),
      status: z.enum(["ativo", "vendido", "morto", "transferido"]).optional(),
      observacoes: z.string().optional(),
      pelagem: z.string().optional(),
      marca: z.string().optional(),
      dataDesmama: z.string().optional(),
      castrado: z.boolean().optional(),
      dataEntrada: z.string().optional(),
      pesoEntrada: z.string().optional(),
      produtorOrigem: z.string().optional(),
      precoKg: z.string().optional(),
      frete: z.string().optional(),
      sisbov: z.string().optional(),
      dataRnd: z.string().optional(),
      rgn: z.string().optional(),
      rgd: z.string().optional(),
      rastreadoNascimento: z.boolean().optional(),
      pai: z.string().optional(),
      mae: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataNascimento, dataDesmama, dataEntrada, dataRnd, ...rest } = input;
      await db.update(animais).set({
        ...rest,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : undefined,
        dataDesmama: dataDesmama ? new Date(dataDesmama) : undefined,
        dataEntrada: dataEntrada ? new Date(dataEntrada) : undefined,
        dataRnd: dataRnd ? new Date(dataRnd) : undefined,
      }).where(and(eq(animais.id, id), eq(animais.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(animais).where(and(eq(animais.id, input.id), eq(animais.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Gera planilha modelo para download ──────────────────────────────────────
  gerarModeloPlanilha: protectedProcedure
    .mutation(async () => {
      const ExcelJS = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Fazenda Digital';
      wb.created = new Date();

      // ─── CORES INSTITUCIONAIS ──────────────────────────────────────────────────
      const COR_HEADER_BG  = '1A3C3C'; // verde petróleo escuro
      const COR_HEADER_TXT = 'FFFFFF';
      const COR_COL_BG     = '2D5A5A'; // verde petróleo médio
      const COR_COL_TXT    = 'FFFFFF';
      const COR_OBRIG_BG   = 'FFF3CD'; // amarelo suave — campos obrigatórios
      const COR_EXEMPLO_BG = 'E8F5E9'; // verde claro — linha de exemplo
      const COR_LINHA_ALT  = 'F7FAFA'; // cinza muito claro — linhas alternadas
      const COR_INSTRUCAO  = 'E3F2FD'; // azul claro — bloco instruções

      // ─── ABA 1: IMPORTAÇÃO DE ANIMAIS ─────────────────────────────────────────
      const ws = wb.addWorksheet('Importação de Animais', {
        properties: { tabColor: { argb: COR_COL_BG } },
        views: [{ state: 'frozen', ySplit: 7 }], // congela até linha 7
      });

      // Cabeçalho institucional (linhas 1-3)
      ws.mergeCells('A1:L1');
      const tituloCell = ws.getCell('A1');
      tituloCell.value = 'FAZENDA DIGITAL — IMPORTAÇÃO DE ANIMAIS';
      tituloCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COR_HEADER_TXT } };
      tituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_BG } };
      tituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 36;

      ws.mergeCells('A2:L2');
      const subtituloCell = ws.getCell('A2');
      subtituloCell.value = 'Preencha uma linha por animal. Não altere os nomes das colunas.';
      subtituloCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COR_HEADER_TXT } };
      subtituloCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_COL_BG } };
      subtituloCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(2).height = 22;

      // Bloco de instruções (linhas 3-6)
      const instrucoes = [
        'INSTRUÇÕES:',
        '  • Campos com fundo AMARELO são OBRIGATÓRIOS (Brinco e Sexo).',
        '  • Datas no formato DD/MM/AAAA — Ex: 15/03/2022',
        '  • Use os menus suspensos para Sexo, Categoria, Raça e Castrado.',
      ];
      instrucoes.forEach((txt, i) => {
        ws.mergeCells(`A${3 + i}:L${3 + i}`);
        const c = ws.getCell(`A${3 + i}`);
        c.value = txt;
        c.font = { name: 'Calibri', size: 10, bold: i === 0, color: { argb: '1A3C3C' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_INSTRUCAO } };
        c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        ws.getRow(3 + i).height = 18;
      });

      // Linha 7: cabeçalho das colunas
      const COLUNAS = [
        { key: 'brinco',           label: 'Brinco *',           obrig: true,  width: 14 },
        { key: 'brincoEletronico', label: 'RFID',               obrig: false, width: 20 },
        { key: 'nome',             label: 'Nome',               obrig: false, width: 16 },
        { key: 'sexo',             label: 'Sexo *',             obrig: true,  width: 12 },
        { key: 'categoria',        label: 'Categoria',          obrig: false, width: 14 },
        { key: 'raca',             label: 'Raça',               obrig: false, width: 16 },
        { key: 'pelagem',          label: 'Pelagem',            obrig: false, width: 14 },
        { key: 'marca',            label: 'Marca',              obrig: false, width: 12 },
        { key: 'dataNascimento',   label: 'Dt. Nascimento',     obrig: false, width: 16 },
        { key: 'dataDesmama',      label: 'Dt. Desmama',        obrig: false, width: 14 },
        { key: 'castrado',         label: 'Castrado',           obrig: false, width: 12 },
        { key: 'lote',             label: 'Lote',               obrig: false, width: 16 },
      ];

      const headerRow = ws.getRow(7);
      headerRow.height = 22;
      COLUNAS.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.label;
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COR_COL_TXT } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrig ? 'B8860B' : COR_COL_BG } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
        cell.border = {
          bottom: { style: 'medium', color: { argb: COR_HEADER_BG } },
          right:  { style: 'thin',   color: { argb: 'FFFFFF' } },
        };
        ws.getColumn(idx + 1).width = col.width;
      });

      // Linha 8: exemplo destacado
      const exemploData = [
        'BR-001', '123456789012345', 'Mimosa', 'femea', 'Vaca', 'Nelore',
        'Branca', 'Fogo', '15/03/2022', '15/09/2022', 'nao', 'Prenhas',
      ];
      const exemploRow = ws.getRow(8);
      exemploRow.height = 20;
      exemploData.forEach((val, idx) => {
        const cell = exemploRow.getCell(idx + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: '2D5A5A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_EXEMPLO_BG } };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Linhas 9-508: área de preenchimento (500 linhas)
      for (let r = 9; r <= 508; r++) {
        const row = ws.getRow(r);
        row.height = 18;
        COLUNAS.forEach((col, idx) => {
          const cell = row.getCell(idx + 1);
          // Fundo alternado
          const isAlt = (r % 2 === 0);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.obrig ? COR_OBRIG_BG : (isAlt ? COR_LINHA_ALT : 'FFFFFF') } };
          cell.font = { name: 'Calibri', size: 10 };
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
          cell.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
        });
      }

      // Dropdowns de validação por coluna (aplicados célula a célula nas linhas 8-108)
      // ExcelJS aplica dataValidation por célula; para ranges grandes usamos as 100 primeiras linhas
      const dvConfig: { colIdx: number; formulae: string[] }[] = [
        { colIdx: 4,  formulae: ['"femea,macho"'] },
        { colIdx: 5,  formulae: ['"Touro,Boi,Bezerro,Garrote,Vaca,Novilha,Bezerra,Vaca Prenhe"'] },
        { colIdx: 6,  formulae: ['"Nelore,Nelore Mocho,Angus,Senepol,Brahman,Girolando,Gir,Holandês,Mestiço,Outro"'] },
        { colIdx: 11, formulae: ['"nao,sim"'] },
      ];
      for (let r = 8; r <= 508; r++) {
        dvConfig.forEach(({ colIdx, formulae }) => {
          const cell = ws.getRow(r).getCell(colIdx);
          cell.dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae,
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: 'Selecione um valor da lista.',
          };
        });
      }

      // ─── ABA 2: DICIONÁRIO DE DADOS ─────────────────────────────────────────
      const wsDic = wb.addWorksheet('Dicionário de Dados', {
        properties: { tabColor: { argb: '1565C0' } },
      });
      wsDic.getColumn(1).width = 22;
      wsDic.getColumn(2).width = 12;
      wsDic.getColumn(3).width = 50;
      wsDic.getColumn(4).width = 30;

      wsDic.mergeCells('A1:D1');
      const dicTitulo = wsDic.getCell('A1');
      dicTitulo.value = 'DICIONÁRIO DE DADOS — IMPORTAÇÃO DE ANIMAIS';
      dicTitulo.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      dicTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER_BG } };
      dicTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
      wsDic.getRow(1).height = 30;

      const dicHeaders = ['Campo', 'Obrigatório', 'Descrição', 'Exemplo'];
      const dicHeaderRow = wsDic.getRow(2);
      dicHeaderRow.height = 20;
      dicHeaders.forEach((h, i) => {
        const c = dicHeaderRow.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Calibri', size: 11 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_COL_BG } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const dicDados = [
        ['Brinco',           'SIM', 'Identificação visual do animal (brinco físico)',                 'BR-001'],
        ['RFID',             'Não', 'Número eletrônico do chip RFID',                               '123456789012345'],
        ['Nome',             'Não', 'Nome do animal',                                              'Mimosa'],
        ['Sexo',             'SIM', 'Sexo do animal: femea ou macho',                              'femea'],
        ['Categoria',        'Não', 'Categoria produtiva: Vaca, Novilha, Bezerro, Touro...',       'Vaca'],
        ['Raça',             'Não', 'Raça do animal conforme lista disponível',                     'Nelore'],
        ['Pelagem',          'Não', 'Cor/pelagem do animal',                                       'Branca'],
        ['Marca',            'Não', 'Marca ou sinal do animal',                                    'Fogo'],
        ['Dt. Nascimento',   'Não', 'Data de nascimento no formato DD/MM/AAAA',                    '15/03/2022'],
        ['Dt. Desmama',      'Não', 'Data de desmama no formato DD/MM/AAAA',                       '15/09/2022'],
        ['Castrado',         'Não', 'Se o animal é castrado: sim ou nao',                          'nao'],
        ['Lote',             'Não', 'Nome exato do lote ativo cadastrado no sistema',              'Prenhas'],
      ];
      dicDados.forEach((row, i) => {
        const r = wsDic.getRow(3 + i);
        r.height = 20;
        row.forEach((val, j) => {
          const c = r.getCell(j + 1);
          c.value = val;
          c.font = { name: 'Calibri', size: 10 };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFF' : COR_LINHA_ALT } };
          if (j === 1) {
            c.font = { name: 'Calibri', size: 10, bold: val === 'SIM', color: { argb: val === 'SIM' ? 'B71C1C' : '388E3C' } };
            c.alignment = { horizontal: 'center' };
          }
          c.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
        });
      });

      // ─── ABA 3: EXEMPLOS ─────────────────────────────────────────────────────
      const wsEx = wb.addWorksheet('Exemplos', {
        properties: { tabColor: { argb: '388E3C' } },
      });
      wsEx.getColumn(1).width = 14;
      wsEx.getColumn(2).width = 20;
      wsEx.getColumn(3).width = 16;
      wsEx.getColumn(4).width = 12;
      wsEx.getColumn(5).width = 14;
      wsEx.getColumn(6).width = 16;
      wsEx.getColumn(7).width = 14;
      wsEx.getColumn(8).width = 12;
      wsEx.getColumn(9).width = 16;
      wsEx.getColumn(10).width = 14;
      wsEx.getColumn(11).width = 12;
      wsEx.getColumn(12).width = 16;

      wsEx.mergeCells('A1:L1');
      const exTitulo = wsEx.getCell('A1');
      exTitulo.value = 'EXEMPLOS DE ANIMAIS — USE COMO REFERÊNCIA';
      exTitulo.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      exTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E7D32' } };
      exTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
      wsEx.getRow(1).height = 30;

      const exHeaders = ['Brinco', 'RFID', 'Nome', 'Sexo', 'Categoria', 'Raça', 'Pelagem', 'Marca', 'Dt. Nascimento', 'Dt. Desmama', 'Castrado', 'Lote'];
      const exHeaderRow = wsEx.getRow(2);
      exHeaderRow.height = 20;
      exHeaders.forEach((h, i) => {
        const c = exHeaderRow.getCell(i + 1);
        c.value = h;
        c.font = { bold: true, color: { argb: 'FFFFFF' }, name: 'Calibri', size: 11 };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '388E3C' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const exDados = [
        ['BR-001', '123456789012345', 'Mimosa',  'femea', 'Vaca',     'Nelore',       'Branca',  'Fogo',   '15/03/2022', '15/09/2022', 'nao', 'Prenhas'],
        ['BR-002', '',               'Touro Z', 'macho', 'Touro',    'Angus',        'Preta',   '',       '10/06/2020', '',           'nao', 'Reprodutores'],
        ['BR-003', '',               'Bezerra', 'femea', 'Bezerra',  'Nelore Mocho', 'Amarela', '',       '01/01/2025', '',           'nao', 'Cria'],
        ['BR-004', '',               'Garrote', 'macho', 'Garrote',  'Senepol',      'Vermelha','',       '20/08/2023', '20/02/2024', 'sim', 'Engorda'],
        ['BR-005', '',               'Novilha', 'femea', 'Novilha',  'Brahman',      'Cinza',   '',       '05/05/2022', '05/11/2022', 'nao', 'Recria'],
      ];
      exDados.forEach((row, i) => {
        const r = wsEx.getRow(3 + i);
        r.height = 18;
        row.forEach((val, j) => {
          const c = r.getCell(j + 1);
          c.value = val;
          c.font = { name: 'Calibri', size: 10 };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFFF' : COR_LINHA_ALT } };
          c.border = { bottom: { style: 'hair', color: { argb: 'E0E0E0' } } };
        });
      });

      // Serializa para base64
      const buf = await wb.xlsx.writeBuffer();
      const base64 = Buffer.from(buf).toString('base64');
      return { base64, filename: 'modelo_importacao_animais.xlsx' };
    }),

  // ── Valida linhas antes de importar ─────────────────────────────────────────
  validarImportacao: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
    }))
    .mutation(async ({ ctx, input }) => {
      const SEXOS_VALIDOS = ['macho', 'femea'];
      const STATUS_VALIDOS = ['ativo', 'vendido', 'morto', 'transferido'];
      const RACAS_VALIDAS = [
        'Nelore', 'Nelore Mocho', 'Angus', 'Senepol', 'Brahman',
        'Girolando', 'Gir', 'Holandês', 'Mestiço', 'Outro',
      ];
      const CATEGORIAS_VALIDAS = [
        'Touro', 'Boi', 'Bezerro', 'Garrote',
        'Vaca', 'Novilha', 'Bezerra', 'Vaca Prenhe',
      ];

      // Busca apenas lotes ATIVOS do usuário
      const lotesUsuario = await db.select({ id: lotes.id, nome: lotes.nome, ativo: lotes.ativo })
        .from(lotes).where(and(eq(lotes.userId, ctx.user.id), eq(lotes.ativo, true)));
      const loteNomeParaId = new Map(lotesUsuario.map(l => [l.nome.toLowerCase().trim(), l.id]));
      // Mapa de todos os lotes (ativos + inativos) para detectar lotes inativos
      const todosLotes = await db.select({ id: lotes.id, nome: lotes.nome, ativo: lotes.ativo })
        .from(lotes).where(eq(lotes.userId, ctx.user.id));
      const loteInativoSet = new Set(
        todosLotes.filter(l => !l.ativo).map(l => l.nome.toLowerCase().trim())
      );

      // Busca brincos já existentes no banco
      const brincosBanco = await db.select({ brinco: animais.brinco })
        .from(animais).where(eq(animais.userId, ctx.user.id));
      const brincosBancoSet = new Set(brincosBanco.map(a => (a.brinco || '').toLowerCase().trim()));

      const erros: { linha: number; campo: string; mensagem: string }[] = [];
      const validos: typeof input.linhas = [];
      const brincosNaPlanilha = new Set<string>();

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = input.linhas[i];
        const numLinha = i + 2; // +2 porque linha 1 é cabeçalho
        const errosLinha: { linha: number; campo: string; mensagem: string }[] = [];

        // Brinco obrigatório
        const brinco = (linha.brinco || '').trim();
        if (!brinco) {
          errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: 'Brinco é obrigatório' });
        } else {
          if (brincosNaPlanilha.has(brinco.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: `Brinco "${brinco}" duplicado na planilha` });
          } else if (brincosBancoSet.has(brinco.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'brinco', mensagem: `Brinco "${brinco}" já existe no banco de dados` });
          } else {
            brincosNaPlanilha.add(brinco.toLowerCase());
          }
        }

        // Sexo obrigatório
        const sexo = (linha.sexo || '').trim().toLowerCase();
        if (!sexo) {
          errosLinha.push({ linha: numLinha, campo: 'sexo', mensagem: 'Sexo é obrigatório' });
        } else if (!SEXOS_VALIDOS.includes(sexo)) {
          errosLinha.push({ linha: numLinha, campo: 'sexo', mensagem: `Sexo inválido: "${linha.sexo}". Use: macho ou femea` });
        }

        // Status (opcional, mas se informado deve ser válido)
        const status = (linha.status || '').trim().toLowerCase();
        if (status && !STATUS_VALIDOS.includes(status)) {
          errosLinha.push({ linha: numLinha, campo: 'status', mensagem: `Status inválido: "${linha.status}". Use: ativo, vendido, morto ou transferido` });
        }

        // Raça (opcional, mas se informada deve ser válida)
        const raca = (linha.raca || '').trim();
        if (raca && !RACAS_VALIDAS.includes(raca)) {
          errosLinha.push({ linha: numLinha, campo: 'raca', mensagem: `Raça não cadastrada: "${raca}"` });
        }

        // Categoria (opcional, mas se informada deve ser válida)
        const categoria = (linha.categoria || '').trim();
        if (categoria && !CATEGORIAS_VALIDAS.includes(categoria)) {
          errosLinha.push({ linha: numLinha, campo: 'categoria', mensagem: `Categoria inválida: "${categoria}"` });
        }

        // Datas — aceita DD/MM/AAAA, DD/MM/AA e AAAA-MM-DD
        // Converte automaticamente para YYYY-MM-DD antes de validar
        const parseDateBR = (raw: string): string | null => {
          const s = raw.trim();
          if (!s) return null;
          // Formato ISO: YYYY-MM-DD
          const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (isoMatch) return s; // já está no formato correto
          // Formato brasileiro: DD/MM/YYYY ou DD/MM/YY
          const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
          if (brMatch) {
            const d = brMatch[1].padStart(2, '0');
            const m = brMatch[2].padStart(2, '0');
            let y = brMatch[3];
            if (y.length === 2) {
              // Ano com 2 dígitos: 00-49 → 2000-2049, 50-99 → 1950-1999
              y = parseInt(y, 10) < 50 ? `20${y}` : `19${y}`;
            }
            return `${y}-${m}-${d}`;
          }
          return null; // formato não reconhecido
        };

        const camposDatas = ['dataNascimento', 'dataDesmama', 'dataEntrada', 'dataRnd'];
        for (const campo of camposDatas) {
          const rawVal = (linha[campo] || '').trim();
          if (rawVal) {
            const converted = parseDateBR(rawVal);
            if (!converted) {
              errosLinha.push({ linha: numLinha, campo, mensagem: `Data inválida em "${campo}": "${rawVal}". Use DD/MM/AAAA ou AAAA-MM-DD` });
            } else {
              // Valida datas inexistentes (ex: 30/02/2025)
              const [y, mo, d] = converted.split('-').map(Number);
              const dt = new Date(y, mo - 1, d);
              if (dt.getFullYear() !== y || dt.getMonth() + 1 !== mo || dt.getDate() !== d) {
                errosLinha.push({ linha: numLinha, campo, mensagem: `Data inexistente em "${campo}": "${rawVal}"` });
              } else {
                // Normaliza o valor na linha para YYYY-MM-DD antes de salvar
                linha[campo] = converted;
              }
            }
          }
        }

        // Lote (opcional, mas se informado deve ser ativo e existir)
        const loteNome = (linha.lote || '').trim();
        if (loteNome) {
          if (loteInativoSet.has(loteNome.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'lote', mensagem: `Lote "${loteNome}" está inativo` });
          } else if (!loteNomeParaId.has(loteNome.toLowerCase())) {
            errosLinha.push({ linha: numLinha, campo: 'lote', mensagem: `Lote não encontrado: "${loteNome}"` });
          }
        }

        if (errosLinha.length > 0) {
          erros.push(...errosLinha);
        } else {
          validos.push(linha);
        }
      }

      return {
        total: input.linhas.length,
        validos: validos.length,
        invalidos: erros.length > 0 ? input.linhas.length - validos.length : 0,
        erros,
        loteNomeParaId: Object.fromEntries(loteNomeParaId),
      };
    }),

  // ── Importa animais em lote ──────────────────────────────────────────────────
  importar: protectedProcedure
    .input(z.object({
      linhas: z.array(z.record(z.string(), z.string())),
      loteNomeParaId: z.record(z.string(), z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const importados: number[] = [];
      const rejeitados: { linha: number; mensagem: string }[] = [];

      for (let i = 0; i < input.linhas.length; i++) {
        const linha = input.linhas[i];
        const numLinha = i + 2;
        try {
          const brinco = (linha.brinco || '').trim();
          const sexo = (linha.sexo || '').trim().toLowerCase() as 'macho' | 'femea';

          // Resolve loteId
          const loteNome = (linha.lote || '').trim().toLowerCase();
          const loteId = loteNome ? input.loteNomeParaId[loteNome] : undefined;

          // Converte castrado/rastreadoNascimento
          const toBool = (v: string) => ['sim', 'yes', '1', 'true'].includes((v || '').toLowerCase().trim());

          const result = await db.insert(animais).values({
            userId: ctx.user.id,
            brinco: brinco || undefined,
            brincoEletronico: (linha.brincoEletronico || '').trim() || undefined,
            nome: (linha.nome || '').trim() || brinco || undefined,
            raca: (linha.raca || '').trim() || undefined,
            sexo,
            dataNascimento: linha.dataNascimento ? new Date(linha.dataNascimento) : undefined,
            pesoAtual: (linha.pesoEntrada || '').trim() || undefined,
            loteId: loteId || undefined,
            categoria: (linha.categoria || '').trim() || undefined,
            observacoes: (linha.observacoes || '').trim() || undefined,
            pelagem: (linha.pelagem || '').trim() || undefined,
            marca: (linha.marca || '').trim() || undefined,
            dataDesmama: linha.dataDesmama ? new Date(linha.dataDesmama) : undefined,
            castrado: toBool(linha.castrado),
            dataEntrada: linha.dataEntrada ? new Date(linha.dataEntrada) : undefined,
            pesoEntrada: (linha.pesoEntrada || '').trim() || undefined,
            produtorOrigem: (linha.produtorOrigem || '').trim() || undefined,
            precoKg: (linha.precoKg || '').trim() || undefined,
            frete: (linha.frete || '').trim() || undefined,
            sisbov: (linha.sisbov || '').trim() || undefined,
            dataRnd: linha.dataRnd ? new Date(linha.dataRnd) : undefined,
            rgn: (linha.rgn || '').trim() || undefined,
            rgd: (linha.rgd || '').trim() || undefined,
            rastreadoNascimento: toBool(linha.rastreadoNascimento),
            pai: (linha.pai || '').trim() || undefined,
            mae: (linha.mae || '').trim() || undefined,
            status: (['ativo','vendido','morto','transferido'].includes((linha.status||'').toLowerCase())
              ? (linha.status.toLowerCase() as any) : 'ativo'),
          });
          importados.push((result as any)[0]?.insertId);
        } catch (err: any) {
          rejeitados.push({ linha: numLinha, mensagem: err?.message || 'Erro desconhecido' });
        }
      }

      return {
        total: input.linhas.length,
        importados: importados.length,
        rejeitados: rejeitados.length,
        detalhesRejeitados: rejeitados,
      };
    }),
});

// ─── LOTES / PASTOS HELPERS ───────────────────────────────────────────────────
function diasEntre(inicio: string | Date, fim: string | Date = new Date()): number {
  const a = new Date(inicio);
  const b = new Date(fim);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

async function countAnimaisLote(loteId: number) {
  const [row] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(animais)
    .where(and(eq(animais.loteId, loteId), eq(animais.status, "ativo")));
  return Number(row?.count ?? 0);
}

async function syncPastoStatus(pastoId: number, userId: number) {
  const [ocupacao] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(lotes)
    .where(and(eq(lotes.pastoAtualId, pastoId), eq(lotes.userId, userId)));
  const temLotes = Number(ocupacao?.count ?? 0) > 0;
  await db.update(pastos).set({ status: temLotes ? "ativo" : "descanso" })
    .where(and(eq(pastos.id, pastoId), eq(pastos.userId, userId)));
}

async function enrichLote(lote: typeof lotes.$inferSelect) {
  const qtdAnimais = await countAnimaisLote(lote.id);
  let pastoNome: string | null = null;
  let pastoCapacidade: number | null = null;
  let fazendaNome: string | null = null;
  if (lote.pastoAtualId) {
    const [pasto] = await db.select().from(pastos).where(eq(pastos.id, lote.pastoAtualId)).limit(1);
    pastoNome = pasto?.nome ?? null;
    pastoCapacidade = pasto?.capacidade ?? null;
    if (pasto?.fazendaId) {
      const [fazenda] = await db.select({ nome: fazendas.nome }).from(fazendas).where(eq(fazendas.id, pasto.fazendaId)).limit(1);
      fazendaNome = fazenda?.nome ?? null;
    }
  }
  const diasNoPasto = lote.dataEntradaPasto ? diasEntre(lote.dataEntradaPasto) : null;
  return { ...lote, qtdAnimais, pastoNome, pastoCapacidade, fazendaNome, diasNoPasto };
}

// ─── LOTES ROUTER ─────────────────────────────────────────────────────────────
const lotesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const lotesList = await db.select().from(lotes).where(eq(lotes.userId, ctx.user.id)).orderBy(desc(lotes.createdAt));
    return Promise.all(lotesList.map(enrichLote));
  }),

  listByPasto: protectedProcedure
    .input(z.object({ pastoId: z.number() }))
    .query(async ({ ctx, input }) => {
      const lotesList = await db.select().from(lotes).where(
        and(eq(lotes.pastoAtualId, input.pastoId), eq(lotes.userId, ctx.user.id))
      );
      return Promise.all(lotesList.map(enrichLote));
    }),

  listMovimentacoes: protectedProcedure
    .input(z.object({ loteId: z.number() }))
    .query(async ({ ctx, input }) => {
      const rows = await db.select().from(lotePastoMovimentacoes).where(
        and(eq(lotePastoMovimentacoes.loteId, input.loteId), eq(lotePastoMovimentacoes.userId, ctx.user.id))
      ).orderBy(desc(lotePastoMovimentacoes.dataEntrada));
      const pastoIds = [...new Set(rows.flatMap(r => [r.pastoOrigemId, r.pastoDestinoId].filter(Boolean) as number[]))];
      const pastoMap: Record<number, string> = {};
      if (pastoIds.length) {
        const pastosRows = await db.select({ id: pastos.id, nome: pastos.nome }).from(pastos).where(inArray(pastos.id, pastoIds));
        pastosRows.forEach(p => { pastoMap[p.id] = p.nome; });
      }
      return rows.map(r => ({
        ...r,
        pastoOrigemNome: r.pastoOrigemId ? pastoMap[r.pastoOrigemId] ?? null : null,
        pastoDestinoNome: r.pastoDestinoId ? pastoMap[r.pastoDestinoId] ?? null : null,
      }));
    }),

  moveToPasto: protectedProcedure
    .input(z.object({
      loteId: z.number(),
      pastoId: z.number().nullable(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [lote] = await db.select().from(lotes).where(
        and(eq(lotes.id, input.loteId), eq(lotes.userId, ctx.user.id))
      ).limit(1);
      if (!lote) throw new Error("Lote não encontrado");

      const hoje = hojeISO();
      const qtdAnimais = await countAnimaisLote(lote.id);
      const pastoOrigemId = lote.pastoAtualId ?? null;

      if (input.pastoId === pastoOrigemId) {
        return { success: true };
      }

      // Fecha estadia anterior
      if (pastoOrigemId) {
        const [aberta] = await db.select().from(lotePastoMovimentacoes).where(
          and(
            eq(lotePastoMovimentacoes.loteId, lote.id),
            eq(lotePastoMovimentacoes.pastoDestinoId, pastoOrigemId),
            isNull(lotePastoMovimentacoes.dataSaida),
          )
        ).limit(1);

        const dataEntrada = aberta?.dataEntrada ?? lote.dataEntradaPasto ?? hoje;
        const dias = diasEntre(dataEntrada, hoje);

        if (aberta) {
          await db.update(lotePastoMovimentacoes).set({ dataSaida: hoje, diasNoPasto: dias })
            .where(eq(lotePastoMovimentacoes.id, aberta.id));
        } else {
          await db.insert(lotePastoMovimentacoes).values({
            userId: ctx.user.id,
            loteId: lote.id,
            pastoOrigemId: null,
            pastoDestinoId: pastoOrigemId,
            dataEntrada,
            dataSaida: hoje,
            diasNoPasto: dias,
            qtdAnimais,
          });
        }
        await syncPastoStatus(pastoOrigemId, ctx.user.id);
      }

      if (input.pastoId === null) {
        await db.update(lotes).set({
          pastoAtualId: null,
          dataEntradaPasto: null,
          fazendaId: null,
        }).where(eq(lotes.id, lote.id));
        return { success: true };
      }

      const [pasto] = await db.select().from(pastos).where(
        and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id))
      ).limit(1);
      if (!pasto) throw new Error("Pasto não encontrado");

      await db.insert(lotePastoMovimentacoes).values({
        userId: ctx.user.id,
        loteId: lote.id,
        pastoOrigemId,
        pastoDestinoId: input.pastoId,
        dataEntrada: hoje,
        qtdAnimais,
        observacoes: input.observacoes,
      });

      await db.update(lotes).set({
        pastoAtualId: input.pastoId,
        fazendaId: pasto.fazendaId,
        dataEntradaPasto: hoje,
        localizacao: pasto.nome,
      }).where(eq(lotes.id, lote.id));

      await db.update(pastos).set({ status: "ativo" })
        .where(and(eq(pastos.id, input.pastoId), eq(pastos.userId, ctx.user.id)));

      return { success: true };
    }),

  create: protectedProcedure
    .input(z.object({
      nome: z.string(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(lotes).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      descricao: z.string().optional(),
      localizacao: z.string().optional(),
      capacidade: z.number().optional(),
      ativo: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(lotes).set(rest).where(and(eq(lotes.id, id), eq(lotes.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(lotes).where(and(eq(lotes.id, input.id), eq(lotes.userId, ctx.user.id)));
      return { success: true };
    }),
});
const saudeRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(saudeRegistros.userId, ctx.user.id)];
      if (input?.animalId) conditions.push(eq(saudeRegistros.animalId, input.animalId));
      return db.select().from(saudeRegistros).where(and(...conditions)).orderBy(desc(saudeRegistros.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      tipo: z.string(),
      descricao: z.string().optional(),
      medicamento: z.string().optional(),
      dosagem: z.string().optional(),
      veterinario: z.string().optional(),
      custo: z.string().optional(),
      dataRegistro: z.string(),
      proximaData: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dataRegistro, proximaData, ...rest } = input;
      const result = await db.insert(saudeRegistros).values({
        userId: ctx.user.id,
        ...rest,
        dataRegistro: new Date(dataRegistro),
        proximaData: proximaData ? new Date(proximaData) : undefined,
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(saudeRegistros).where(and(eq(saudeRegistros.id, input.id), eq(saudeRegistros.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── REPRODUCAO ROUTER ────────────────────────────────────────────────────────
const reproducaoRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(reproducaoRegistros).where(eq(reproducaoRegistros.userId, ctx.user.id)).orderBy(desc(reproducaoRegistros.createdAt));
  }),

  create: protectedProcedure
    .input(z.object({
      femeaId: z.number(),
      machoId: z.number().optional(),
      tipo: z.string(),
      dataCobertura: z.string(),
      dataPrevistoParto: z.string().optional(),
      resultado: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { dataCobertura, dataPrevistoParto, ...rest } = input;
      const result = await db.insert(reproducaoRegistros).values({
        userId: ctx.user.id,
        ...rest,
        dataCobertura: new Date(dataCobertura),
        dataPrevistoParto: dataPrevistoParto ? new Date(dataPrevistoParto) : undefined,
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      resultado: z.string().optional(),
      dataPartoReal: z.string().optional(),
      filhotes: z.number().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataPartoReal, ...rest } = input;
      await db.update(reproducaoRegistros).set({
        ...rest,
        dataPartoReal: dataPartoReal ? new Date(dataPartoReal) : undefined,
      }).where(and(eq(reproducaoRegistros.id, id), eq(reproducaoRegistros.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(reproducaoRegistros).where(and(eq(reproducaoRegistros.id, input.id), eq(reproducaoRegistros.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── MAQUINAS ROUTER ──────────────────────────────────────────────────────────
// Campos comuns a create e update (todos opcionais — create valida no client)
const maquinasBaseFields = {
  nome: z.string().optional(),
  tipo: z.string().min(1).optional(),
  marca: z.string().min(1).optional(),
  fazendaId: z.number().int().positive().optional(),
  ano: z.number().optional(),
  anoAquisicao: z.number().optional(),
  modelo: z.string().optional(),
  placa: z.string().optional(),
  valor: z.string().optional(),
  vidaUtil: z.string().optional(),
  dataDesativacao: z.string().optional(),
  estado: z.enum(["novo", "usado"]).optional(),
  horimetro: z.string().optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

// Create exige tipo, marca e fazendaId
const maquinasInputFields = {
  ...maquinasBaseFields,
  fazendaId: z.number().int().positive(),
  tipo: z.string().min(1),
  marca: z.string().min(1),
};

const maquinasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(maquinas).where(eq(maquinas.userId, ctx.user.id)).orderBy(desc(maquinas.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(maquinas).where(
        and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id))
      );
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(maquinasInputFields))
    .mutation(async ({ ctx, input }) => {
      const { dataDesativacao, imageSlots, nome, valor, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      try {
        const result = await db.insert(maquinas).values({
          userId: ctx.user.id,
          ...rest,
          nome: nome?.trim() || "Sem apelido",
          valor: valor && valor !== "0" && valor !== "0.00" ? valor : undefined,
          dataDesativacao: dataDesativacao ? new Date(dataDesativacao) : undefined,
          imagem1: img1,
          imagem2: img2,
          imagem3: img3,
        });
        return { success: true, id: (result as any)[0]?.insertId };
      } catch (err) {
        console.error("[maquinas.create]", err);
        throw new Error("Não foi possível salvar o maquinário. Verifique se o banco está atualizado e tente novamente.");
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...maquinasBaseFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataDesativacao, imageSlots, nome, tipo, marca, fazendaId, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      await db.update(maquinas).set({
        ...rest,
        ...(nome !== undefined ? { nome: nome.trim() || "Sem apelido" } : {}),
        // Só atualiza tipo/marca/fazendaId se enviados (não sobrescreve existentes com null)
        ...(tipo ? { tipo } : {}),
        ...(marca ? { marca } : {}),
        ...(fazendaId ? { fazendaId } : {}),
        dataDesativacao: dataDesativacao ? new Date(dataDesativacao) : null,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      }).where(and(eq(maquinas.id, id), eq(maquinas.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(maquinas).where(and(eq(maquinas.id, input.id), eq(maquinas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── ABASTECIMENTOS: HELPER DE BAIXA NO ESTOQUE ─────────────────────────────

const COMBUSTIVEL_KEYWORDS_SERVER: Record<string, string[]> = {
  diesel: ["diesel", "s10", "s500", "óleo diesel", "oleo diesel"],
  gasolina: ["gasolina"],
  etanol: ["etanol", "álcool", "alcool"],
  arla: ["arla"],
};

function matchCombustivelEstoque(
  item: { nome: string | null; categoria: string | null },
  combustivel: string
): boolean {
  const keywords = COMBUSTIVEL_KEYWORDS_SERVER[combustivel] ?? [combustivel];
  const nome = (item.nome ?? "").toLowerCase();
  const cat = (item.categoria ?? "").toLowerCase();
  return keywords.some(k => nome.includes(k) || cat.includes(k));
}

/**
 * Encontra o item de estoque de combustível para a fazenda.
 * Retorna o primeiro item que bate com o tipo de combustível e fazendaId.
 */
async function findEstoqueCombustivel(
  fazendaId: number,
  combustivel: string
): Promise<{ id: number; quantidade: string | null } | null> {
  const itens = await db
    .select({ id: estoque.id, nome: estoque.nome, categoria: estoque.categoria, quantidade: estoque.quantidade })
    .from(estoque)
    .where(eq(estoque.fazendaId, fazendaId));
  const match = itens.find(i => matchCombustivelEstoque(i, combustivel));
  return match ?? null;
}

/**
 * Aplica baixa no estoque de combustível (saída).
 * Registra movimentação de saída e atualiza saldo.
 */
async function darBaixaEstoqueCombustivel(
  fazendaId: number,
  combustivel: string,
  litros: number,
  data: string,
  observacoes?: string
): Promise<void> {
  const item = await findEstoqueCombustivel(fazendaId, combustivel);
  if (!item) return; // sem item de estoque cadastrado — silencioso
  const atual = parseFloat(String(item.quantidade ?? 0));
  const novo = atual - litros;
  // Registra movimentação de saída
  await db.insert(estoqueMovimentacoes).values({
    estoqueId: item.id,
    fazendaId,
    tipo: "Saída",
    dataMovimentacao: data,
    quantidade: String(-litros), // negativo = saída
    observacoes: observacoes ?? `Abastecimento interno de ${combustivel}`,
  });
  // Atualiza saldo
  await db.update(estoque).set({ quantidade: String(Math.max(0, novo)) }).where(eq(estoque.id, item.id));
}

/**
 * Reverte uma baixa anterior no estoque (para update/delete de abastecimento).
 */
async function reverterBaixaEstoqueCombustivel(
  fazendaId: number,
  combustivel: string,
  litros: number
): Promise<void> {
  const item = await findEstoqueCombustivel(fazendaId, combustivel);
  if (!item) return;
  const atual = parseFloat(String(item.quantidade ?? 0));
  await db.update(estoque).set({ quantidade: String(atual + litros) }).where(eq(estoque.id, item.id));
}

// ─── ABASTECIMENTOS ROUTER ────────────────────────────────────────────────────
const abastecimentosBaseFields = {
  maquinaId: z.number().optional(),
  data: z.string().optional(),
  combustivel: z.enum(["diesel", "gasolina", "etanol", "arla"]).optional(),
  litros: z.string().optional(),
  valorLitro: z.string().optional(),
  valorTotal: z.string().optional(),
  horimetro: z.string().optional(),
  responsavel: z.string().optional(),
  abastecidoNaFazenda: z.boolean().optional(),
  fazendaId: z.number().int().positive().optional().nullable(),
  observacoes: z.string().optional(),
};

const abastecimentosRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(abastecimentos.userId, ctx.user.id)];
      if (input?.maquinaId) conditions.push(eq(abastecimentos.maquinaId, input.maquinaId));
      return db.select().from(abastecimentos).where(and(...conditions)).orderBy(desc(abastecimentos.data), desc(abastecimentos.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(abastecimentos).where(
        and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id))
      );
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object({
      maquinaId: z.number(),
      data: z.string(),
      combustivel: z.enum(["diesel", "gasolina", "etanol", "arla"]),
      litros: z.string(),
      valorLitro: z.string().optional(),
      valorTotal: z.string().optional(),
      horimetro: z.string().optional(),
      responsavel: z.string().optional(),
      abastecidoNaFazenda: z.boolean().optional(),
      fazendaId: z.number().int().positive().optional().nullable(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, valorLitro, litros, ...rest } = input;
      const dataISO = data.slice(0, 10);
      const total = input.valorTotal
        ?? (valorLitro && litros
          ? (parseFloat(litros) * parseFloat(valorLitro)).toFixed(2)
          : undefined);
      const result = await db.insert(abastecimentos).values({
        userId: ctx.user.id,
        ...rest,
        litros,
        valorLitro,
        valorTotal: total,
        data: dataISO,
      });
      // Dar baixa automática no estoque quando abastecimento é interno
      if (input.abastecidoNaFazenda && input.fazendaId && litros) {
        const qtd = parseFloat(litros);
        if (qtd > 0) {
          await darBaixaEstoqueCombustivel(
            input.fazendaId,
            input.combustivel,
            qtd,
            dataISO,
            input.observacoes
          );
        }
      }
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...abastecimentosBaseFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, data, valorLitro, litros, fazendaId, ...rest } = input;
      const dataISO = data ? data.slice(0, 10) : undefined;
      const total = input.valorTotal
        ?? (valorLitro && litros
          ? (parseFloat(litros) * parseFloat(valorLitro)).toFixed(2)
          : undefined);

      // Buscar registro anterior para reverter baixa se necessário
      const [anterior] = await db
        .select()
        .from(abastecimentos)
        .where(and(eq(abastecimentos.id, id), eq(abastecimentos.userId, ctx.user.id)));

      await db.update(abastecimentos).set({
        ...rest,
        ...(dataISO ? { data: dataISO } : {}),
        ...(litros !== undefined ? { litros } : {}),
        ...(valorLitro !== undefined ? { valorLitro } : {}),
        ...(total !== undefined ? { valorTotal: total } : {}),
        ...(fazendaId !== undefined ? { fazendaId: fazendaId ?? null } : {}),
      }).where(and(eq(abastecimentos.id, id), eq(abastecimentos.userId, ctx.user.id)));

      // Reverter baixa anterior e aplicar nova baixa se necessário
      if (anterior) {
        const eraInterno = anterior.abastecidoNaFazenda && anterior.fazendaId && anterior.combustivel;
        const eAgora = (input.abastecidoNaFazenda ?? anterior.abastecidoNaFazenda) &&
                       (fazendaId ?? anterior.fazendaId) &&
                       (input.combustivel ?? anterior.combustivel);

        // Reverter baixa anterior
        if (eraInterno) {
          const litrosAnt = parseFloat(String(anterior.litros ?? 0));
          if (litrosAnt > 0) {
            await reverterBaixaEstoqueCombustivel(
              anterior.fazendaId!,
              anterior.combustivel!,
              litrosAnt
            );
          }
        }

        // Aplicar nova baixa
        if (eAgora) {
          const novoFazendaId = (fazendaId ?? anterior.fazendaId) as number;
          const novoCombustivel = (input.combustivel ?? anterior.combustivel) as string;
          const novosLitros = parseFloat(String(litros ?? anterior.litros ?? 0));
          const novaData = dataISO ?? anterior.data;
          if (novosLitros > 0) {
            await darBaixaEstoqueCombustivel(
              novoFazendaId,
              novoCombustivel,
              novosLitros,
              novaData,
              input.observacoes ?? anterior.observacoes ?? undefined
            );
          }
        }
      }

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Buscar registro para reverter baixa no estoque
      const [anterior] = await db
        .select()
        .from(abastecimentos)
        .where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));

      await db.delete(abastecimentos).where(and(eq(abastecimentos.id, input.id), eq(abastecimentos.userId, ctx.user.id)));

      // Reverter baixa no estoque se era abastecimento interno
      if (anterior?.abastecidoNaFazenda && anterior.fazendaId && anterior.combustivel) {
        const litrosAnt = parseFloat(String(anterior.litros ?? 0));
        if (litrosAnt > 0) {
          await reverterBaixaEstoqueCombustivel(
            anterior.fazendaId,
            anterior.combustivel,
            litrosAnt
          );
        }
      }

      return { success: true };
    }),
});

// ─── MANUTENCOES ROUTER ───────────────────────────────────────────────────────
const pecaInput = z.object({
  nome: z.string().min(1),
  quantidade: z.number().positive(),
  valorUnitario: z.number().min(0),
  estoqueId: z.number().int().positive().optional().nullable(),
});

const manutencaoBaseInput = z.object({
  maquinaId: z.number(),
  tipo: z.string(),
  descricao: z.string().optional(),
  data: z.string(),
  horimetro: z.string().optional(),
  proximaManutencao: z.string().optional(),
  status: z.enum(["agendada", "em_andamento", "concluida"]).optional(),
  prestadorNome: z.string().optional(),
  prestadorContato: z.string().optional(),
  valorMaoObra: z.number().min(0).optional(),
  observacoes: z.string().optional(),
  pecas: z.array(pecaInput).optional(),
});

/** Calcula valor de peças, mão de obra e total geral. */
export function calcularTotaisManutencao(
  pecas: { quantidade: number; valorUnitario: number }[] | undefined,
  valorMaoObra: number | undefined
) {
  const valorPecas = (pecas ?? []).reduce(
    (s, p) => s + p.quantidade * p.valorUnitario,
    0
  );
  const maoObra = valorMaoObra ?? 0;
  return {
    valorPecas,
    valorMaoObra: maoObra,
    valorTotal: valorPecas + maoObra,
  };
}

/**
 * Valida se as peças vinculadas ao estoque não ultrapassam o saldo disponível.
 * Soma as quantidades por estoqueId e compara com a quantidade em estoque.
 * Lança TRPCError BAD_REQUEST se alguma peça exceder o saldo.
 */
export async function validarSaldoEstoquePecas(
  pecas: { nome: string; quantidade: number; estoqueId?: number | null }[] | undefined
) {
  if (!pecas || pecas.length === 0) return;
  // Agrupa quantidades por estoqueId (ignora itens sem vínculo de estoque)
  const porEstoque = new Map<number, number>();
  for (const p of pecas) {
    if (p.estoqueId == null) continue;
    porEstoque.set(p.estoqueId, (porEstoque.get(p.estoqueId) ?? 0) + p.quantidade);
  }
  if (porEstoque.size === 0) return;
  const ids = Array.from(porEstoque.keys());
  const itens = await db
    .select({ id: estoque.id, nome: estoque.nome, quantidade: estoque.quantidade, unidade: estoque.unidade })
    .from(estoque)
    .where(inArray(estoque.id, ids));
  const mapEstoque = new Map(itens.map(i => [i.id, i]));
  for (const [estoqueId, qtdSolicitada] of porEstoque.entries()) {
    const item = mapEstoque.get(estoqueId);
    if (!item || item.quantidade == null) continue; // sem controle de estoque
    const disponivel = parseFloat(String(item.quantidade));
    if (Number.isNaN(disponivel)) continue;
    if (qtdSolicitada > disponivel) {
      const unidade = item.unidade ? ` ${item.unidade}` : "";
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Estoque insuficiente para "${item.nome}". Solicitado: ${qtdSolicitada.toLocaleString("pt-BR")}${unidade}, disponível: ${disponivel.toLocaleString("pt-BR")}${unidade}.`,
      });
    }
  }
}

const manutencoesRouter = router({
  list: protectedProcedure
    .input(z.object({ maquinaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(manutencoes.userId, ctx.user.id)];
      if (input?.maquinaId) conditions.push(eq(manutencoes.maquinaId, input.maquinaId));
      return db.select().from(manutencoes).where(and(...conditions)).orderBy(desc(manutencoes.createdAt));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [registro] = await db
        .select()
        .from(manutencoes)
        .where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
      if (!registro) return null;
      const pecas = await db
        .select()
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, input.id))
        .orderBy(manutencaoPecas.id);
      return { ...registro, pecas };
    }),

  listPecas: protectedProcedure
    .input(z.object({ manutencaoId: z.number() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(manutencaoPecas)
        .where(eq(manutencaoPecas.manutencaoId, input.manutencaoId))
        .orderBy(manutencaoPecas.id);
    }),

  create: protectedProcedure
    .input(manutencaoBaseInput)
    .mutation(async ({ ctx, input }) => {
      const { data, proximaManutencao, pecas, valorMaoObra, ...rest } = input;
      await validarSaldoEstoquePecas(pecas);
      const totais = calcularTotaisManutencao(pecas, valorMaoObra);
      const result = await db.insert(manutencoes).values({
        userId: ctx.user.id,
        ...rest,
        data,
        proximaManutencao: proximaManutencao || undefined,
        valorMaoObra: totais.valorMaoObra.toFixed(2),
        valorPecas: totais.valorPecas.toFixed(2),
        valorTotal: totais.valorTotal.toFixed(2),
        custo: totais.valorTotal.toFixed(2),
      });
      const manutencaoId = Number((result as any)[0]?.insertId);
      if (pecas && pecas.length > 0) {
        await db.insert(manutencaoPecas).values(
          pecas.map(p => ({
            manutencaoId,
            estoqueId: p.estoqueId ?? undefined,
            nome: p.nome,
            quantidade: p.quantidade.toFixed(2),
            valorUnitario: p.valorUnitario.toFixed(2),
            valorTotal: (p.quantidade * p.valorUnitario).toFixed(2),
          }))
        );
      }
      return { success: true, id: manutencaoId };
    }),

  update: protectedProcedure
    .input(manutencaoBaseInput.extend({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { id, data, proximaManutencao, pecas, valorMaoObra, ...rest } = input;
      await validarSaldoEstoquePecas(pecas);
      const totais = calcularTotaisManutencao(pecas, valorMaoObra);
      await db
        .update(manutencoes)
        .set({
          ...rest,
          data,
          proximaManutencao: proximaManutencao || null,
          valorMaoObra: totais.valorMaoObra.toFixed(2),
          valorPecas: totais.valorPecas.toFixed(2),
          valorTotal: totais.valorTotal.toFixed(2),
          custo: totais.valorTotal.toFixed(2),
        })
        .where(and(eq(manutencoes.id, id), eq(manutencoes.userId, ctx.user.id)));
      // Substitui as peças: remove as antigas e insere as novas
      await db.delete(manutencaoPecas).where(eq(manutencaoPecas.manutencaoId, id));
      if (pecas && pecas.length > 0) {
        await db.insert(manutencaoPecas).values(
          pecas.map(p => ({
            manutencaoId: id,
            estoqueId: p.estoqueId ?? undefined,
            nome: p.nome,
            quantidade: p.quantidade.toFixed(2),
            valorUnitario: p.valorUnitario.toFixed(2),
            valorTotal: (p.quantidade * p.valorUnitario).toFixed(2),
          }))
        );
      }
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(manutencaoPecas).where(eq(manutencaoPecas.manutencaoId, input.id));
      await db.delete(manutencoes).where(and(eq(manutencoes.id, input.id), eq(manutencoes.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── PESAGENS ROUTER ──────────────────────────────────────────────────────────
const pesagensRouter = router({
  list: protectedProcedure
    .input(z.object({ animalId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(pesagens.userId, ctx.user.id)];
      if (input?.animalId) conditions.push(eq(pesagens.animalId, input.animalId));
      return db.select().from(pesagens).where(and(...conditions)).orderBy(desc(pesagens.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      animalId: z.number(),
      peso: z.string(),
      data: z.string(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(pesagens).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      // Update animal's current weight
      await db.update(animais).set({ pesoAtual: input.peso }).where(and(eq(animais.id, input.animalId), eq(animais.userId, ctx.user.id)));
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(pesagens).where(and(eq(pesagens.id, input.id), eq(pesagens.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── NUTRICAO ROUTER ──────────────────────────────────────────────────────────
const nutricaoRouter = router({
  listBatidas: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(batidas).where(eq(batidas.userId, ctx.user.id)).orderBy(desc(batidas.createdAt));
  }),

  createBatida: protectedProcedure
    .input(z.object({
      data: z.string(),
      quantidade: z.string().optional(),
      responsavel: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(batidas).values({
        userId: ctx.user.id,
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  deleteBatida: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(batidas).where(and(eq(batidas.id, input.id), eq(batidas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── BENFEITORIAS ROUTER ──────────────────────────────────────────────────────
const benfeitoriasInputFields = {
  fazendaId: z.number(),
  nome: z.string(),
  anoConstrucao: z.number(),
  percentualAtividade: z.number().optional(),
  tipo: z.string().optional(),
  vidaUtil: z.string().optional(),
  localizacao: z.string().optional(),
  status: z.enum(["ativo", "manutencao", "inativo"]).optional(),
  dataInstalacao: z.string().optional(),
  valorEstimado: z.string().optional(),
  observacoes: z.string().optional(),
  imageSlots: z.array(imageSlotInput).length(3).optional(),
};

const benfeitoriasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id)).orderBy(desc(benfeitorias.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(benfeitorias).where(
        and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id))
      );
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(benfeitoriasInputFields))
    .mutation(async ({ ctx, input }) => {
      const { dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      const result = await db.insert(benfeitorias).values({
        userId: ctx.user.id,
        ...rest,
        percentualAtividade: percentualAtividade != null ? String(percentualAtividade) : undefined,
        dataInstalacao: dataInstalacao ? new Date(dataInstalacao) : undefined,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...benfeitoriasInputFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, dataInstalacao, imageSlots, percentualAtividade, ...rest } = input;
      const [img1, img2, img3] = await resolveImageSlots(imageSlots);
      await db.update(benfeitorias).set({
        ...rest,
        percentualAtividade: percentualAtividade != null ? String(percentualAtividade) : undefined,
        dataInstalacao: dataInstalacao ? new Date(dataInstalacao) : undefined,
        imagem1: img1,
        imagem2: img2,
        imagem3: img3,
      }).where(and(eq(benfeitorias.id, id), eq(benfeitorias.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(benfeitorias).where(and(eq(benfeitorias.id, input.id), eq(benfeitorias.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── ESTOQUE ROUTER ───────────────────────────────────────────────────────────
const estoqueInputFields = {
  fazendaId: z.number().optional(),
  nome: z.string(),
  categoria: z.string(),
  subcategoria: z.string(),
  unidade: z.string(),
  quantidadeMinima: z.string().optional(),
  quantidadeMaxima: z.string().optional(),
  fabricante: z.string().optional(),
  identificadorUnico: z.string().optional(),
  produzidoNaFazenda: z.boolean().optional(),
  monitorarEstoque: z.boolean(),
  situacao: z.enum(["ativo", "inativo"]).optional(),
  embalagens: z.array(z.object({
    nome: z.string(),
    volume: z.number().optional(),
    unidade: z.string().optional(),
  })).optional(),
  possuiCarencia: z.boolean().optional(),
  carenciaAbateDias: z.number().nullish(),
  carenciaAbateUnidade: z.enum(["d", "h"]).nullish(),
  carenciaLeiteDias: z.number().nullish(),
  observacoesCarencia: z.string().nullish(),
  quantidade: z.string().optional(),
  valorUnitario: z.string().optional(),
  localizacao: z.string().optional(),
  observacoes: z.string().optional(),
};

const estoqueRouter = router({
  list: protectedProcedure.query(async () => {
    return db.select().from(estoque).orderBy(desc(estoque.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(estoque).where(eq(estoque.id, input.id));
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object(estoqueInputFields))
    .mutation(async ({ input }) => {
      const { embalagens, ...rest } = input;
      const result = await db.insert(estoque).values({
        ...rest,
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : undefined,
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), ...estoqueInputFields }))
    .mutation(async ({ input }) => {
      const { id, embalagens, ...rest } = input;
      await db.update(estoque).set({
        ...rest,
        embalagens: embalagens?.length ? JSON.stringify(embalagens) : undefined,
      }).where(eq(estoque.id, id));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.estoqueId, input.id));
      await db.delete(estoque).where(eq(estoque.id, input.id));
      return { success: true };
    }),

  inativarProdutos: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await db
        .update(estoque)
        .set({ situacao: "inativo" })
        .where(inArray(estoque.id, input.ids));
      return { success: true, count: input.ids.length };
    }),

  ativarProdutos: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await db
        .update(estoque)
        .set({ situacao: "ativo" })
        .where(inArray(estoque.id, input.ids));
      return { success: true, count: input.ids.length };
    }),

  resumo: protectedProcedure.query(async () => {
    const itens = await db.select().from(estoque);
    const monitorados = itens.filter(i => i.monitorarEstoque);
    const abaixoLimite = monitorados.filter(i => {
      const q = Number(i.quantidade ?? 0);
      const min = Number(i.quantidadeMinima ?? 0);
      return min > 0 && q <= min;
    });
    return {
      totalMonitorados: monitorados.length,
      totalAbaixoLimite: abaixoLimite.length,
    };
  }),

  listMovimentacoes: protectedProcedure.query(async () => {
    const rows = await db
      .select({
        id: estoqueMovimentacoes.id,
        estoqueId: estoqueMovimentacoes.estoqueId,
        fazendaId: estoqueMovimentacoes.fazendaId,
        produtoFazendaId: estoque.fazendaId,
        tipo: estoqueMovimentacoes.tipo,
        dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
        quantidade: estoqueMovimentacoes.quantidade,
        dataValidade: estoqueMovimentacoes.dataValidade,
        destino: estoqueMovimentacoes.destino,
        manejo: estoqueMovimentacoes.manejo,
        notaFiscal: estoqueMovimentacoes.notaFiscal,
        frete: estoqueMovimentacoes.frete,
        fornecedor: estoqueMovimentacoes.fornecedor,
        valor: estoqueMovimentacoes.valor,
        observacoes: estoqueMovimentacoes.observacoes,
        nome: estoque.nome,
        categoria: estoque.categoria,
        subcategoria: estoque.subcategoria,
        fabricante: estoque.fabricante,
        identificadorUnico: estoque.identificadorUnico,
        unidade: estoque.unidade,
      })
      .from(estoqueMovimentacoes)
      .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
      .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
    return rows;
  }),

  getMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select({
          id: estoqueMovimentacoes.id,
          estoqueId: estoqueMovimentacoes.estoqueId,
          fazendaId: estoqueMovimentacoes.fazendaId,
          produtoFazendaId: estoque.fazendaId,
          tipo: estoqueMovimentacoes.tipo,
          dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
          quantidade: estoqueMovimentacoes.quantidade,
          dataValidade: estoqueMovimentacoes.dataValidade,
          destino: estoqueMovimentacoes.destino,
          manejo: estoqueMovimentacoes.manejo,
          notaFiscal: estoqueMovimentacoes.notaFiscal,
          frete: estoqueMovimentacoes.frete,
          fornecedor: estoqueMovimentacoes.fornecedor,
          valor: estoqueMovimentacoes.valor,
          observacoes: estoqueMovimentacoes.observacoes,
          nome: estoque.nome,
          categoria: estoque.categoria,
          subcategoria: estoque.subcategoria,
          fabricante: estoque.fabricante,
          unidade: estoque.unidade,
          embalagens: estoque.embalagens,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
        .where(eq(estoqueMovimentacoes.id, input.id));
      return row ?? null;
    }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      estoqueId: z.number(),
      fazendaId: z.number().optional(),
      tipo: z.string().optional(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      destino: z.string().optional(),
      manejo: z.string().optional(),
      notaFiscal: z.string().optional(),
      frete: z.string().optional(),
      fornecedor: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }
      const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
      if (!item) throw new Error("Produto não encontrado.");

      const atual = Number(item.quantidade ?? 0);
      const novo = atual + qty;
      if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");

      let observacoes = input.observacoes;
      if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
        observacoes = JSON.stringify({
          modo: input.modo,
          sinal: input.sinal,
          unidades: input.quantidadeUnidades,
          porUnidade: input.quantidadePorUnidade,
          unidade: input.unidadeLancamento,
          total: qty,
        });
      }

      const result = await db.insert(estoqueMovimentacoes).values({
        estoqueId: input.estoqueId,
        fazendaId: input.fazendaId ?? item.fazendaId ?? undefined,
        tipo: input.tipo || undefined,
        dataMovimentacao: input.dataMovimentacao,
        quantidade: String(qty),
        dataValidade: input.dataValidade || undefined,
        destino: input.destino || undefined,
        manejo: input.manejo || undefined,
        notaFiscal: input.notaFiscal || undefined,
        frete: input.frete || undefined,
        fornecedor: input.fornecedor || undefined,
        valor: input.valor || undefined,
        observacoes,
      });

      await db.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, input.estoqueId));

      return { success: true, id: (result as any)[0]?.insertId };
    }),

  updateMovimentacao: protectedProcedure
    .input(z.object({
      id: z.number(),
      estoqueId: z.number(),
      fazendaId: z.number().optional(),
      tipo: z.string().optional(),
      dataMovimentacao: z.string(),
      quantidade: z.string(),
      dataValidade: z.string().optional(),
      destino: z.string().optional(),
      manejo: z.string().optional(),
      notaFiscal: z.string().optional(),
      frete: z.string().optional(),
      fornecedor: z.string().optional(),
      valor: z.string().optional(),
      observacoes: z.string().optional(),
      modo: z.enum(["direto", "unidades"]).optional(),
      sinal: z.enum(["entrada", "saida"]).optional(),
      quantidadeUnidades: z.string().optional(),
      quantidadePorUnidade: z.string().optional(),
      unidadeLancamento: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const qty = parseFloat(input.quantidade.replace(",", "."));
      if (Number.isNaN(qty) || qty === 0) {
        throw new Error("Informe uma quantidade válida.");
      }

      const [mov] = await db
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, input.id));
      if (!mov) throw new Error("Movimentação não encontrada.");

      const oldQty = Number(mov.quantidade);
      const oldEstoqueId = mov.estoqueId;

      if (oldEstoqueId === input.estoqueId) {
        const [item] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!item) throw new Error("Produto não encontrado.");
        const base = Number(item.quantidade ?? 0) - oldQty;
        const novo = base + qty;
        if (novo < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        await db.update(estoque).set({ quantidade: String(novo) }).where(eq(estoque.id, input.estoqueId));
      } else {
        const [oldItem] = await db.select().from(estoque).where(eq(estoque.id, oldEstoqueId));
        const [newItem] = await db.select().from(estoque).where(eq(estoque.id, input.estoqueId));
        if (!oldItem || !newItem) throw new Error("Produto não encontrado.");
        const oldStock = Number(oldItem.quantidade ?? 0) - oldQty;
        const newStock = Number(newItem.quantidade ?? 0) + qty;
        if (newStock < 0) throw new Error("Quantidade em estoque insuficiente para esta saída.");
        await db.update(estoque).set({ quantidade: String(oldStock) }).where(eq(estoque.id, oldEstoqueId));
        await db.update(estoque).set({ quantidade: String(newStock) }).where(eq(estoque.id, input.estoqueId));
      }

      let observacoes = input.observacoes;
      if (input.modo === "unidades" && input.quantidadeUnidades && input.quantidadePorUnidade) {
        observacoes = JSON.stringify({
          modo: input.modo,
          sinal: input.sinal,
          unidades: input.quantidadeUnidades,
          porUnidade: input.quantidadePorUnidade,
          unidade: input.unidadeLancamento,
          total: qty,
        });
      }

      await db.update(estoqueMovimentacoes).set({
        estoqueId: input.estoqueId,
        fazendaId: input.fazendaId ?? null,
        tipo: input.tipo || null,
        dataMovimentacao: input.dataMovimentacao.slice(0, 10),
        quantidade: String(qty),
        dataValidade: input.dataValidade ? input.dataValidade.slice(0, 10) : null,
        destino: input.destino || null,
        manejo: input.manejo || null,
        notaFiscal: input.notaFiscal || null,
        frete: input.frete || null,
        fornecedor: input.fornecedor || null,
        valor: input.valor || null,
        observacoes: observacoes ?? null,
      }).where(eq(estoqueMovimentacoes.id, input.id));

      return { success: true };
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [mov] = await db
        .select()
        .from(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.id, input.id));
      if (!mov) throw new Error("Movimentação não encontrada.");

      const [item] = await db.select().from(estoque).where(eq(estoque.id, mov.estoqueId));
      if (item) {
        const atual = Number(item.quantidade ?? 0);
        const revertido = atual - Number(mov.quantidade);
        await db.update(estoque).set({ quantidade: String(revertido) }).where(eq(estoque.id, mov.estoqueId));
      }

      await db.delete(estoqueMovimentacoes).where(eq(estoqueMovimentacoes.id, input.id));
      return { success: true };
    }),

  listMovimentacoesByProduto: protectedProcedure
    .input(z.object({ estoqueId: z.number() }))
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: estoqueMovimentacoes.id,
          estoqueId: estoqueMovimentacoes.estoqueId,
          tipo: estoqueMovimentacoes.tipo,
          dataMovimentacao: estoqueMovimentacoes.dataMovimentacao,
          quantidade: estoqueMovimentacoes.quantidade,
          dataValidade: estoqueMovimentacoes.dataValidade,
          manejo: estoqueMovimentacoes.manejo,
          observacoes: estoqueMovimentacoes.observacoes,
          nome: estoque.nome,
          categoria: estoque.categoria,
          unidade: estoque.unidade,
        })
        .from(estoqueMovimentacoes)
        .innerJoin(estoque, eq(estoqueMovimentacoes.estoqueId, estoque.id))
        .where(eq(estoqueMovimentacoes.estoqueId, input.estoqueId))
        .orderBy(desc(estoqueMovimentacoes.dataMovimentacao), desc(estoqueMovimentacoes.id));
      return rows;
    }),

  deleteAllMovimentacoesByProduto: protectedProcedure
    .input(z.object({ estoqueId: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .delete(estoqueMovimentacoes)
        .where(eq(estoqueMovimentacoes.estoqueId, input.estoqueId));
      await db
        .update(estoque)
        .set({ quantidade: "0" })
        .where(eq(estoque.id, input.estoqueId));
      return { success: true };
    }),

  listByCategories: protectedProcedure
    .input(z.object({ categorias: z.array(z.string()).min(1) }))
    .query(async ({ input }) => {
      return db
        .select({
          id: estoque.id,
          nome: estoque.nome,
          categoria: estoque.categoria,
          subcategoria: estoque.subcategoria,
          unidade: estoque.unidade,
          quantidade: estoque.quantidade,
          valorUnitario: estoque.valorUnitario,
          fabricante: estoque.fabricante,
        })
        .from(estoque)
        .where(inArray(estoque.categoria, input.categorias))
        .orderBy(estoque.nome);
    }),
});

// ─── FINANCEIRO ROUTER ────────────────────────────────────────────────────────
const financeiroRouter = router({
  listContas: protectedProcedure.query(async () => {
    return db.select().from(contasFinanceiras).orderBy(desc(contasFinanceiras.createdAt));
  }),

  createConta: protectedProcedure
    .input(z.object({
      nome: z.string(),
      tipo: z.string().optional(),
      banco: z.string().optional(),
      saldoInicial: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await db.insert(contasFinanceiras).values({
        nome: input.nome,
        tipo: input.tipo,
        banco: input.banco,
        saldoInicial: input.saldoInicial || "0",
        saldoAtual: input.saldoInicial || "0",
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  listMovimentacoes: protectedProcedure.query(async () => {
    return db.select().from(movimentacoes).orderBy(desc(movimentacoes.createdAt));
  }),

  createMovimentacao: protectedProcedure
    .input(z.object({
      contaId: z.number().optional(),
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string(),
      valor: z.string(),
      data: z.string(),
      status: z.enum(["pendente", "confirmado", "cancelado"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { data, ...rest } = input;
      const result = await db.insert(movimentacoes).values({
        ...rest,
        data: new Date(data),
      });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  deleteMovimentacao: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(movimentacoes).where(eq(movimentacoes.id, input.id));
      return { success: true };
    }),

  summary: protectedProcedure.query(async ({ ctx }) => {
    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));
    const totalReceitas = parseFloat(receitas?.total || "0");
    const totalDespesas = parseFloat(despesas?.total || "0");
    return {
      totalReceitas,
      totalDespesas,
      saldoTotal: totalReceitas - totalDespesas,
    };
  }),
});

// ─── DASHBOARD ROUTER ─────────────────────────────────────────────────────────
const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [totalAnimaisResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(animais).where(eq(animais.userId, ctx.user.id));
    const [totalLotesResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(lotes).where(eq(lotes.userId, ctx.user.id));
    const [totalMaquinasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(maquinas).where(eq(maquinas.userId, ctx.user.id));
    const [totalBenfeitoriasResult] = await db.select({ count: sql<number>`COUNT(*)` }).from(benfeitorias).where(eq(benfeitorias.userId, ctx.user.id));

    const [receitas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "receita"));
    const [despesas] = await db.select({ total: sql<string>`COALESCE(SUM(valor), 0)` }).from(movimentacoes).where(eq(movimentacoes.tipo, "despesa"));

    return {
      totalAnimais: Number(totalAnimaisResult?.count || 0),
      totalLotes: Number(totalLotesResult?.count || 0),
      totalMaquinas: Number(totalMaquinasResult?.count || 0),
      totalBenfeitorias: Number(totalBenfeitoriasResult?.count || 0),
      totalReceitas: parseFloat(receitas?.total || "0"),
      totalDespesas: parseFloat(despesas?.total || "0"),
      saldoTotal: parseFloat(receitas?.total || "0") - parseFloat(despesas?.total || "0"),
    };
  }),
});

// ─── COMPRAS ROUTER ─────────────────────────────────────────────────────────
const comprasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(compras).where(eq(compras.userId, ctx.user.id)).orderBy(desc(compras.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      fornecedor: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(compras).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(compras).where(and(eq(compras.id, input.id), eq(compras.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── VENDAS ROUTER ───────────────────────────────────────────────────────────
const vendasRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(vendas).where(eq(vendas.userId, ctx.user.id)).orderBy(desc(vendas.createdAt))
  ),
  create: protectedProcedure
    .input(z.object({
      comprador: z.string().optional(),
      data: z.string(),
      quantidadeAnimais: z.number().optional(),
      valorTotal: z.string().optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(vendas).values({ userId: ctx.user.id, ...input });
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(vendas).where(and(eq(vendas.id, input.id), eq(vendas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── FAZENDAS ROUTER ────────────────────────────────────────────────────────
const fazendaFields = {
  sigla: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  unidadeArea: z.string().optional(),
  area: z.string().optional(),
  areaReserva: z.string().optional(),
  areaLiquida: z.string().optional(),
  endereco: z.string().optional(),
  cep: z.string().optional(),
  telefone: z.string().optional(),
  responsavel: z.string().optional(),
  atividadeCria: z.boolean().optional(),
  atividadeRecria: z.boolean().optional(),
  atividadeEngorda: z.boolean().optional(),
  atividadeConfinamento: z.boolean().optional(),
  cpfCnpj: z.string().optional(),
  inscricaoEstadual: z.string().optional(),
  registroIncra: z.string().optional(),
  nirf: z.string().optional(),
  possuiSisbov: z.boolean().optional(),
  razaoSocial: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  distanciaMunicipio: z.string().optional(),
  valorHectare: z.string().optional(),
  melhoramentoGenetico: z.string().optional(),
  observacoes: z.string().optional(),
};

const fazendasRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(fazendas).where(eq(fazendas.userId, ctx.user.id)).orderBy(desc(fazendas.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [row] = await db.select().from(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
      return row ?? null;
    }),

  create: protectedProcedure
    .input(z.object({ nome: z.string(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(fazendas).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({ id: z.number(), nome: z.string().optional(), ...fazendaFields }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(fazendas).set(rest).where(and(eq(fazendas.id, id), eq(fazendas.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(fazendas).where(and(eq(fazendas.id, input.id), eq(fazendas.userId, ctx.user.id)));
      return { success: true };
    }),
});

// ─── PASTOS ROUTER ──────────────────────────────────────────────────────────
const pastosRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(pastos).where(eq(pastos.userId, ctx.user.id)).orderBy(desc(pastos.createdAt));
  }),

  listByFazenda: protectedProcedure
    .input(z.object({ fazendaId: z.number() }))
    .query(async ({ ctx, input }) => {
      return db.select().from(pastos).where(
        and(eq(pastos.fazendaId, input.fazendaId), eq(pastos.userId, ctx.user.id))
      ).orderBy(desc(pastos.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      fazendaId: z.number(),
      nome: z.string(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(pastos).values({ userId: ctx.user.id, ...input });
      return { success: true, id: (result as any)[0]?.insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      nome: z.string().optional(),
      sigla: z.string().optional(),
      tipo: z.string().optional(),
      tipoPastagem: z.string().optional(),
      area: z.string().optional(),
      incluirArea: z.boolean().optional(),
      capacidade: z.number().optional(),
      status: z.enum(["ativo", "descanso", "vazio"]).optional(),
      observacoes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      await db.update(pastos).set(rest).where(and(eq(pastos.id, id), eq(pastos.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(pastos).where(and(eq(pastos.id, input.id), eq(pastos.userId, ctx.user.id)));
      return { success: true };
    }),

  listWithDetails: protectedProcedure
    .input(z.object({ fazendaId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conditions = [eq(pastos.userId, ctx.user.id)];
      if (input?.fazendaId) conditions.push(eq(pastos.fazendaId, input.fazendaId));

      const pastosList = await db.select().from(pastos).where(and(...conditions)).orderBy(desc(pastos.createdAt));
      const fazendaIds = [...new Set(pastosList.map(p => p.fazendaId))];
      const fazendaMap: Record<number, string> = {};
      if (fazendaIds.length) {
        const fazRows = await db.select({ id: fazendas.id, nome: fazendas.nome }).from(fazendas).where(inArray(fazendas.id, fazendaIds));
        fazRows.forEach(f => { fazendaMap[f.id] = f.nome; });
      }

      return Promise.all(pastosList.map(async (pasto) => {
        const lotesNoPasto = await db.select().from(lotes).where(
          and(eq(lotes.pastoAtualId, pasto.id), eq(lotes.userId, ctx.user.id))
        );
        const lotesEnriched = await Promise.all(lotesNoPasto.map(enrichLote));
        const qtdAnimais = lotesEnriched.reduce((s, l) => s + (l.qtdAnimais ?? 0), 0);
        const capacidade = pasto.capacidade ?? 0;
        const pctOcupacao = capacidade > 0 ? Math.min(100, Math.round((qtdAnimais / capacidade) * 100)) : null;

        const [ultimaSaida] = await db.select().from(lotePastoMovimentacoes).where(
          and(eq(lotePastoMovimentacoes.pastoOrigemId, pasto.id), eq(lotePastoMovimentacoes.userId, ctx.user.id))
        ).orderBy(desc(lotePastoMovimentacoes.dataSaida)).limit(1);

        const diasDescanso = !lotesNoPasto.length && ultimaSaida?.dataSaida
          ? diasEntre(ultimaSaida.dataSaida)
          : null;

        const diasPastejo = lotesEnriched.length
          ? Math.max(...lotesEnriched.map(l => l.diasNoPasto ?? 0))
          : null;

        return {
          ...pasto,
          fazendaNome: fazendaMap[pasto.fazendaId] ?? null,
          qtdAnimais,
          qtdLotes: lotesNoPasto.length,
          pctOcupacao,
          diasPastejo,
          diasDescanso,
          lotes: lotesEnriched,
        };
      }));
    }),
});

// ─── APP ROUTER ───────────────────────────────────────────────────────────────
export const appRouter = router({
  auth: authRouter,
  animais: animaisRouter,
  lotes: lotesRouter,
  saude: saudeRouter,
  reproducao: reproducaoRouter,
  maquinas: maquinasRouter,
  abastecimentos: abastecimentosRouter,
  manutencoes: manutencoesRouter,
  pesagens: pesagensRouter,
  nutricao: nutricaoRouter,
  benfeitorias: benfeitoriasRouter,
  estoque: estoqueRouter,
  financeiro: financeiroRouter,
  dashboard: dashboardRouter,
  compras: comprasRouter,
  vendas: vendasRouter,
  fazendas: fazendasRouter,
  pastos: pastosRouter,
});

export type AppRouter = typeof appRouter;
