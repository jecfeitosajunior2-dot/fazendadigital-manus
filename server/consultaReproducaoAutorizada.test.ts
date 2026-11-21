import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_REPRO_PIPELINE_CONFIG } from "../shared/reproPipeline";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { permissaoPorId } from "./catalogoPermissoes";
import {
  gravarPipelineAutorizado,
  lerPipelineAutorizado,
  listarReproducaoAutorizada,
  MSG_FAZENDA_REPRO_AUSENTE,
  MSG_SEM_PERMISSAO_REGUA,
  MSG_SEM_PERMISSAO_VER_REPRODUCAO,
  PERMISSAO_EDITAR_REGUA,
  PERMISSAO_VER_REPRODUCAO,
  type ConsultaReproducao,
  type IoConsultaReproducao,
  type PedidoConsulta,
  type RegistroReproLista,
} from "./consultaReproducaoAutorizada";
import { MSG_SEM_FAZENDA_MANEJO } from "./registrarManejoAutorizado";

const raiz = dirname(fileURLToPath(import.meta.url));

function usuario(parcial: Partial<LinhaUsuarioCadastro> & Pick<LinhaUsuarioCadastro, "id" | "papel">): LinhaUsuarioCadastro {
  return {
    openId: `u-${parcial.id}`, name: "Pessoa", email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: parcial.papel === "principal" ? parcial.id : 1,
    situacao: "ativo", sessionVersion: 1, ...parcial,
  };
}

function registro(parcial: Partial<RegistroReproLista> & Pick<RegistroReproLista, "id" | "tipo" | "femeaId"> & {
  animalFazendaId?: number | null;
  animalLoteId?: number | null;
  animalUserId?: number | null;
  createdAt?: string;
}) {
  return {
    userId: 1, machoId: null, dataCobertura: "2026-11-10", dataPrevistoParto: null, dataPartoReal: null,
    resultado: "Realizado", filhotes: null, observacoes: null, createdAt: parcial.createdAt ?? "2026-11-10T12:00:00",
    animalUserId: parcial.userId ?? 1, animalFazendaId: 10, animalLoteId: 100, ...parcial,
  };
}

function mundo(opcoes?: { falha?: "conexao"; estourar?: boolean }) {
  const usuarios = [
    usuario({ id: 1, papel: "principal", sessionVersion: 3 }),
    usuario({ id: 2, papel: "comum", titularUserId: 1 }),
    usuario({ id: 3, papel: "comum", titularUserId: 1 }),
    usuario({ id: 5, papel: "comum", titularUserId: 1 }),
    usuario({ id: 6, papel: "comum", titularUserId: 1 }),
  ];
  const permissoes = [
    { userId: 2, permissao: PERMISSAO_VER_REPRODUCAO },
    { userId: 2, permissao: PERMISSAO_EDITAR_REGUA },
    { userId: 3, permissao: "animais.criar" },
    { userId: 5, permissao: PERMISSAO_VER_REPRODUCAO },
    { userId: 5, permissao: PERMISSAO_EDITAR_REGUA },
    { userId: 6, permissao: PERMISSAO_VER_REPRODUCAO },
  ];
  const registros = [
    registro({ id: 1, tipo: "Diagnóstico de prenhez", femeaId: 17, createdAt: "2026-11-01T10:00:00" }),
    registro({ id: 2, tipo: "Estação de monta", femeaId: 80, createdAt: "2026-11-02T10:00:00", observacoes: "lote" }),
    registro({ id: 3, tipo: "Exposição à monta", femeaId: 17, machoId: 80, createdAt: "2026-11-02T10:00:01", observacoes: "copia" }),
    registro({ id: 4, tipo: "Exposição à monta", femeaId: 21, machoId: 80, createdAt: "2026-11-02T10:00:02", observacoes: "anulado" }),
    registro({ id: 5, tipo: "Parto", femeaId: 21, createdAt: "2026-11-08T10:00:00" }),
    registro({ id: 6, tipo: "Cobertura", femeaId: 33, createdAt: "2026-11-09T10:00:00", animalFazendaId: 20, animalLoteId: 200 }),
    registro({ id: 7, tipo: "Cio", femeaId: 90, userId: 4, createdAt: "2026-11-09T11:00:00", animalUserId: 4, animalFazendaId: 40, animalLoteId: null }),
  ];
  const configs = new Map<number, string | null>([
    [10, JSON.stringify({ maxTentativasIatfAntesMonta: 3, diasParaDgAposInseminacao: 40, diasParaDgAposMonta: 75, sugerirDescarteAposMontaVazia: false })],
    [20, null],
  ]);
  const consultas: ConsultaReproducao = {
    async usuario(id) { return usuarios.find((item) => item.id === id) ?? null; },
    async permissoes(userId) { return permissoes.filter((item) => item.userId === userId).map((item) => item.permissao); },
    async vinculos(userId) {
      if (userId === 2 || userId === 6) return [{ userId, fazendaId: 10 }];
      if (userId === 5) return [{ userId, fazendaId: 20 }];
      if (userId === 3) return [{ userId, fazendaId: 10 }];
      return [];
    },
    async fazendasDoTitular(titularUserId) {
      return titularUserId === 1 ? [{ id: 10, userId: 1 }, { id: 20, userId: 1 }] : [{ id: 40, userId: 4 }];
    },
    async fazenda(id) { return id === 40 ? { id: 40, userId: 4 } : id === 10 || id === 20 ? { id, userId: 1 } : null; },
    async lotes(titularUserId) {
      return titularUserId === 1
        ? [{ id: 100, userId: 1, fazendaId: 10, pastoAtualId: 1000 }, { id: 200, userId: 1, fazendaId: 20, pastoAtualId: 2000 }]
        : [];
    },
    async pastos(titularUserId) {
      return titularUserId === 1 ? [{ id: 1000, userId: 1, fazendaId: 10 }, { id: 2000, userId: 1, fazendaId: 20 }] : [];
    },
    async registros(titularUserId) {
      return registros
        .filter((item) => item.userId === titularUserId)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id);
    },
    async lerConfig(fazendaId, titularUserId) {
      if (titularUserId !== 1 || !configs.has(fazendaId)) return undefined;
      return configs.get(fazendaId) ?? null;
    },
    async gravarConfig(fazendaId, titularUserId, serializado) {
      if (titularUserId !== 1 || !configs.has(fazendaId)) return 0;
      configs.set(fazendaId, serializado);
      return 1;
    },
    async aposGravar() {
      if (opcoes?.estourar) throw new Error("falha na régua");
    },
  };
  const io: IoConsultaReproducao = {
    async emTransacao(fn) {
      if (opcoes?.falha === "conexao") throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      const foto = new Map(configs);
      try {
        return await fn(consultas);
      } catch (erro) {
        configs.clear();
        for (const [id, valor] of foto) configs.set(id, valor);
        throw erro;
      }
    },
  };
  return { io, configs };
}

function pedido(executorId: number, session: number, extra: Partial<PedidoConsulta> = {}): PedidoConsulta {
  return { executorId, sessionVersionDaSessao: session, ...extra };
}

describe("consulta e régua reprodutiva", () => {
  it("usa as permissões que já existem e não grava a régua no JSON", () => {
    expect(permissaoPorId(PERMISSAO_VER_REPRODUCAO)?.descricao).toMatch(/consultar reprodução/i);
    expect(permissaoPorId(PERMISSAO_EDITAR_REGUA)?.descricao).toMatch(/régua/i);
    const fonte = readFileSync(join(raiz, "consultaReproducaoAutorizada.ts"), "utf8");
    const rota = readFileSync(join(raiz, "routers.ts"), "utf8");
    const tela = readFileSync(join(raiz, "../client/src/pages/ReproductionManagementPage.tsx"), "utf8");
    const manejo = readFileSync(join(raiz, "../client/src/pages/ManejoPages.tsx"), "utf8");
    const curral = readFileSync(join(raiz, "../client/src/components/curral/CurralReprodutivoPanel.tsx"), "utf8");
    const dialog = readFileSync(join(raiz, "../client/src/components/curral/ReproPipelineConfigDialog.tsx"), "utf8");
    const ficha = readFileSync(join(raiz, "../client/src/pages/CattleDetailPageExpanded.tsx"), "utf8");
    expect(fonte).not.toContain('from "./db"');
    expect(fonte).not.toContain("localFallback");
    const bloco = rota.slice(rota.indexOf("REPRODUCAO ROUTER"), rota.indexOf("create: protectedProcedure", rota.indexOf("REPRODUCAO ROUTER")));
    expect(bloco).toContain("listarReproducaoAutorizada");
    expect(bloco).toContain("lerPipelineAutorizado");
    expect(bloco).toContain("gravarPipelineAutorizado");
    expect(bloco).not.toContain("localFallback");
    expect(bloco).not.toContain("listLocalReproducaoRegistros");
    expect(rota).toContain("registrarReproducaoColetivaAutorizada");
    expect(rota).toContain("registrarPartoAutorizado");
    expect(tela).toContain("trpc.reproducao.list.useQuery");
    expect(manejo).toContain("trpc.reproducao.getPipelineConfig.useQuery");
    expect(curral).toContain("trpc.reproducao.list.useQuery");
    expect(dialog).toContain("trpc.reproducao.updatePipelineConfig.useMutation");
    expect(ficha).toContain("trpc.reproducao.list.useQuery");
    expect(ficha).toContain("trpc.reproducao.getPipelineConfig.useQuery");
    expect(bloco).toContain("list: protectedProcedure.query");
  });

  it("o principal vê a conta e o funcionário só as fazendas concedidas", async () => {
    const base = mundo();
    const principal = await listarReproducaoAutorizada(base.io, pedido(1, 3, {
      titularInformadoPeloCliente: 4, permissoesInformadasPeloCliente: [],
    }));
    expect(principal.ok).toBe(true);
    if (!principal.ok) return;
    expect(principal.titularUserId).toBe(1);
    expect(principal.registros.map((item) => item.id)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(principal.registros.map((item) => item.tipo)).toEqual([
      "Cobertura", "Parto", "Exposição à monta", "Exposição à monta", "Estação de monta", "Diagnóstico de prenhez",
    ]);
    const funcionario = await listarReproducaoAutorizada(base.io, pedido(2, 1));
    expect(funcionario.ok).toBe(true);
    if (!funcionario.ok) return;
    expect(funcionario.registros.map((item) => item.id)).toEqual([5, 4, 3, 2, 1]);
    expect(funcionario.registros.every((item) => item.userId === 1)).toBe(true);
    const regua = await lerPipelineAutorizado(base.io, pedido(1, 3, { fazendaId: 10 }));
    expect(regua.ok && regua.config).toMatchObject({ maxTentativasIatfAntesMonta: 3, diasParaDgAposInseminacao: 40 });
    const padrao = await lerPipelineAutorizado(base.io, pedido(2, 1, { fazendaId: 10 }));
    expect(padrao.ok && padrao.config.diasParaDgAposMonta).toBe(75);
    const vazia = await lerPipelineAutorizado(base.io, pedido(5, 1, { fazendaId: 20 }));
    expect(vazia.ok && vazia.config).toEqual(DEFAULT_REPRO_PIPELINE_CONFIG);
  });

  it("recusa quem não pode, outra conta, outra fazenda e sessão trocada", async () => {
    const base = mundo();
    const sem = await listarReproducaoAutorizada(base.io, pedido(3, 1, {
      papelInformadoPeloCliente: "principal", permissoesInformadasPeloCliente: [PERMISSAO_VER_REPRODUCAO],
    }));
    expect(sem).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_VER_REPRODUCAO });
    const sessao = await listarReproducaoAutorizada(base.io, pedido(1, 9));
    expect(sessao).toMatchObject({ motivo: "sem_identidade" });
    const outra = await lerPipelineAutorizado(base.io, pedido(1, 3, { fazendaId: 40 }));
    expect(outra).toMatchObject({ mensagem: MSG_FAZENDA_REPRO_AUSENTE });
    const semFazenda = await lerPipelineAutorizado(base.io, pedido(2, 1, { fazendaId: 20 }));
    expect(semFazenda).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const semEditar = await gravarPipelineAutorizado(base.io, pedido(6, 1, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 45 },
    }));
    expect(semEditar).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_REGUA });
    const fazendaErrada = await gravarPipelineAutorizado(base.io, pedido(2, 1, {
      fazendaId: 20, config: { maxTentativasIatfAntesMonta: 4 },
    }));
    expect(fazendaErrada).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    expect(base.configs.get(10)).toContain("\"diasParaDgAposInseminacao\":40");
    expect(base.configs.get(20)).toBeNull();
  });

  it("grava a régua no titular, preserva a outra fazenda e desfaz a falha", async () => {
    const base = mundo();
    const gravou = await gravarPipelineAutorizado(base.io, pedido(2, 1, {
      fazendaId: 10,
      config: { maxTentativasIatfAntesMonta: 4, diasParaDgAposInseminacao: 45, diasParaDgAposMonta: 80, sugerirDescarteAposMontaVazia: true },
    }));
    expect(gravou.ok && gravou.titularUserId).toBe(1);
    expect(base.configs.get(20)).toBeNull();
    expect(JSON.parse(String(base.configs.get(10))).diasParaDgAposInseminacao).toBe(45);
    const falha = mundo({ estourar: true });
    const antes = falha.configs.get(10);
    await expect(gravarPipelineAutorizado(falha.io, pedido(1, 3, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 50 },
    }))).rejects.toThrow("falha na régua");
    expect(falha.configs.get(10)).toBe(antes);
    await expect(gravarPipelineAutorizado(mundo({ falha: "conexao" }).io, pedido(1, 3, {
      fazendaId: 10, config: { diasParaDgAposInseminacao: 50 },
    }))).rejects.toMatchObject({ message: "Banco de dados indisponível." });
  });
});
