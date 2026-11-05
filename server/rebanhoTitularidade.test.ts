import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import type { FazendaConhecida } from "./acessoFazendas";
import { CATALOGO_PERMISSOES } from "./catalogoPermissoes";
import {
  criarServicoRebanho,
  LACUNA_AUTORIA_ANIMAL,
  type AnimalPersistido,
  type ConsultaPaginada,
  type DepsRebanho,
  type ExtrasCliente,
  type LotePersistido,
  type RepositorioRebanho,
  type SessaoRebanho,
} from "./rebanhoTitularidade";

type UsuarioMemoria = IdentidadeUsuario & {
  name: string;
  permissoes: string[];
  fazendas: number[];
};

type Estado = {
  usuarios: UsuarioMemoria[];
  fazendas: Array<FazendaConhecida & { nome: string }>;
  animais: AnimalPersistido[];
  lotes: LotePersistido[];
  movimentos: Array<{ userId: number; animalId: number; usuarioNome: string }>;
  seqAnimal: number;
  seqLote: number;
};

function pessoa(parcial: Partial<UsuarioMemoria> & Pick<UsuarioMemoria, "id" | "papel">): UsuarioMemoria {
  return {
    openId: "",
    name: `Pessoa ${parcial.id}`,
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: 1,
    situacao: "ativo",
    sessionVersion: 0,
    permissoes: [],
    fazendas: [],
    ...parcial,
  };
}

function estadoInicial(): Estado {
  return {
    usuarios: [
      pessoa({ id: 1, papel: "principal", titularUserId: 1, name: "Ana" }),
      pessoa({ id: 3, papel: "secundario", permissoes: ["animais.criar", "animais.visualizar", "animais.editar", "animais.transferir", "lotes.criar", "lotes.visualizar", "lotes.editar", "fazendas.visualizar"], fazendas: [10] }),
      pessoa({ id: 2, papel: "comum", permissoes: ["animais.criar", "animais.visualizar", "animais.editar", "lotes.visualizar", "fazendas.visualizar"], fazendas: [10] }),
      pessoa({ id: 4, papel: "comum", permissoes: [], fazendas: [10] }),
      pessoa({ id: 8, papel: "comum", situacao: "inativo", permissoes: ["animais.criar"], fazendas: [10] }),
      pessoa({ id: 7, papel: "comum", situacao: "convidado", permissoes: ["animais.criar"], fazendas: [10] }),
    ],
    fazendas: [
      { id: 10, userId: 1, nome: "Pasto Norte" },
      { id: 20, userId: 1, nome: "Pasto Sul" },
      { id: 30, userId: 9, nome: "Pasto Alheio" },
    ],
    animais: [],
    lotes: [],
    movimentos: [],
    seqAnimal: 1,
    seqLote: 1,
  };
}

function repositorio(estado: Estado): RepositorioRebanho {
  return {
    async carregar(executorId: number, _extras?: ExtrasCliente): Promise<SessaoRebanho | null> {
      const usuario = estado.usuarios.find((item) => item.id === executorId);
      if (!usuario || usuario.situacao !== "ativo") return null;
      return {
        identidade: usuario,
        permissoes: usuario.permissoes,
        fazendasDoTitular: estado.fazendas.filter((fazenda) => fazenda.userId === usuario.titularUserId),
        vinculos: usuario.fazendas.map((fazendaId) => ({ userId: usuario.id, fazendaId })),
        executorNome: usuario.name,
      };
    },
    async obterFazenda(id) {
      const fazenda = estado.fazendas.find((item) => item.id === id);
      return fazenda ? { id: fazenda.id, userId: fazenda.userId } : null;
    },
    async listarAnimais(consulta: ConsultaPaginada) {
      const todos = estado.animais
        .filter((animal) => animal.userId === consulta.titularUserId && animal.fazendaId != null && consulta.fazendaIds.includes(animal.fazendaId))
        .sort((a, b) => b.id - a.id);
      return { total: todos.length, itens: todos.slice(consulta.offset, consulta.offset + consulta.limit) };
    },
    async obterAnimal(titularId, id) {
      return estado.animais.find((animal) => animal.id === id && animal.userId === titularId) ?? null;
    },
    async animaisAtivos(titularId) {
      return estado.animais.filter((animal) => animal.userId === titularId && animal.status === "ativo");
    },
    async lotesDoTitular(titularId) {
      return estado.lotes.filter((lote) => lote.userId === titularId);
    },
    async listarLotes(consulta) {
      const todos = estado.lotes
        .filter((lote) => lote.userId === consulta.titularUserId && lote.fazendaId != null && consulta.fazendaIds.includes(lote.fazendaId))
        .sort((a, b) => b.id - a.id);
      return { total: todos.length, itens: todos.slice(consulta.offset, consulta.offset + consulta.limit) };
    },
    async obterLote(titularId, id) {
      return estado.lotes.find((lote) => lote.id === id && lote.userId === titularId) ?? null;
    },
    async inserirAnimal(row) {
      const id = estado.seqAnimal++;
      estado.animais.push({ ...row, id });
      return id;
    },
    async atualizarAnimal(id, titularId, patch) {
      const animal = estado.animais.find((item) => item.id === id && item.userId === titularId);
      if (!animal) return;
      if (patch.nome !== undefined) animal.nome = patch.nome ?? null;
      if (patch.brinco !== undefined) animal.brinco = patch.brinco ?? null;
      if (patch.brincoEletronico !== undefined) animal.brincoEletronico = patch.brincoEletronico ?? null;
      if (patch.fazendaId !== undefined) animal.fazendaId = patch.fazendaId ?? null;
    },
    async inserirLote(row) {
      const id = estado.seqLote++;
      estado.lotes.push({ ...row, id });
      return id;
    },
    async atualizarLote(id, titularId, patch) {
      const lote = estado.lotes.find((item) => item.id === id && item.userId === titularId);
      if (!lote) return;
      if (patch.nome !== undefined && patch.nome != null) lote.nome = patch.nome;
      if (patch.sigla !== undefined) lote.sigla = patch.sigla ?? null;
      if (patch.descricao !== undefined) lote.descricao = patch.descricao ?? null;
    },
    async inserirMovimento(row) {
      estado.movimentos.push({ userId: row.userId, animalId: row.animalId, usuarioNome: row.usuarioNome });
      return estado.movimentos.length;
    },
  };
}

function depsDe(estado: Estado): DepsRebanho {
  return {
    ler: repositorio(estado),
    async emTransacao(fn) {
      const animais = estado.animais.map((item) => ({ ...item }));
      const lotes = estado.lotes.map((item) => ({ ...item }));
      const movimentos = estado.movimentos.map((item) => ({ ...item }));
      const seqAnimal = estado.seqAnimal;
      const seqLote = estado.seqLote;
      try {
        return await fn(repositorio(estado));
      } catch (erro) {
        estado.animais = animais;
        estado.lotes = lotes;
        estado.movimentos = movimentos;
        estado.seqAnimal = seqAnimal;
        estado.seqLote = seqLote;
        throw erro;
      }
    },
  };
}

const forja: ExtrasCliente = {
  titularInformadoPeloCliente: 9,
  papelInformadoPeloCliente: "principal",
  permissoesInformadasPeloCliente: CATALOGO_PERMISSOES.map((item) => item.id),
  fazendasInformadasPeloCliente: [30],
};

describe("rebanho por titularidade", () => {
  it("principal cadastra animal na própria conta", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const resultado = await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea", brinco: "A1" }, forja);
    expect(resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 1 });
    expect(estado.animais[0]?.userId).toBe(1);
  });

  it("secundário autorizado cadastra animal", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(3, { fazendaId: 10, sexo: "macho", nome: "Touro" });
    expect(resultado.ok).toBe(true);
  });

  it("comum autorizado cadastra animal", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(2, { fazendaId: 10, sexo: "femea" });
    expect(resultado.ok).toBe(true);
  });

  it("comum sem permissão recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(4, { fazendaId: 10, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(estado.animais).toHaveLength(0);
  });

  it("animal cadastrado por funcionário pertence ao titular", async () => {
    const estado = estadoInicial();
    await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(2, { fazendaId: 10, sexo: "femea", brinco: "B2" });
    expect(estado.animais[0]).toMatchObject({ userId: 1, fazendaId: 10, brinco: "B2" });
  });

  it("executor não substitui o titular", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(3, {
      fazendaId: 10,
      sexo: "macho",
      loteId: undefined,
    });
    expect(resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 3 });
    expect(estado.animais[0]?.userId).not.toBe(3);
  });

  it("fazenda de outra conta recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(3, { fazendaId: 30, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "outro_titular" });
    expect(JSON.stringify(resultado)).not.toContain("Alheio");
    expect(estado.animais).toHaveLength(0);
  });

  it("fazenda não autorizada recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(2, { fazendaId: 20, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_fazenda" });
    expect(estado.animais).toHaveLength(0);
  });

  it("fazenda inexistente recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(1, { fazendaId: 99, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "fazenda_inexistente" });
  });

  it("identificador de titularidade forjado é recusado", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(1, {
      fazendaId: 10,
      sexo: "femea",
      userId: 9,
    });
    expect(resultado).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    expect(estado.animais).toHaveLength(0);
  });

  it("principal consulta animal criado por funcionário", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "femea", nome: "Mimosa" });
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    const lido = await servico.obterAnimal(1, criado.id);
    expect(lido).toMatchObject({ ok: true, animal: { userId: 1, nome: "Mimosa" } });
  });

  it("funcionário consulta animal de fazenda autorizada", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "macho" });
    if (!criado.ok) throw new Error("cadastro");
    const lido = await servico.obterAnimal(3, criado.id);
    expect(lido.ok).toBe(true);
  });

  it("funcionário não consulta animal de fazenda proibida", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(1, { fazendaId: 20, sexo: "femea", nome: "Oculta" });
    if (!criado.ok) throw new Error("cadastro");
    const lido = await servico.obterAnimal(2, criado.id);
    expect(lido).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(lido)).not.toContain("Oculta");
  });

  it("consulta por identificador não revela outra conta", async () => {
    const estado = estadoInicial();
    estado.usuarios.push(pessoa({ id: 9, papel: "principal", titularUserId: 9 }));
    estado.animais.push({
      id: 50,
      userId: 9,
      fazendaId: 30,
      loteId: null,
      brinco: "Z9",
      brincoEletronico: null,
      nome: "Conta B",
      sexo: "macho",
      status: "ativo",
    });
    const lido = await criarServicoRebanho(depsDe(estado)).obterAnimal(1, 50);
    expect(lido).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(JSON.stringify(lido)).not.toContain("Conta B");
  });

  it("atualização não modifica titularidade", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "femea" });
    if (!criado.ok) throw new Error("cadastro");
    const atualizado = await servico.atualizarAnimal(2, { id: criado.id, nome: "Nova", userId: 9 });
    expect(atualizado).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    expect(estado.animais[0]?.userId).toBe(1);
    expect(estado.animais[0]?.nome).toBeNull();
  });

  it("atualização valida fazenda de destino", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(3, { fazendaId: 10, sexo: "macho" });
    if (!criado.ok) throw new Error("cadastro");
    const recusado = await servico.atualizarAnimal(3, { id: criado.id, fazendaId: 20 });
    expect(recusado).toEqual({ ok: false, motivo: "sem_fazenda" });
    const principal = await servico.atualizarAnimal(1, { id: criado.id, fazendaId: 20 });
    expect(principal.ok).toBe(true);
    expect(estado.animais[0]).toMatchObject({ fazendaId: 20, userId: 1 });
  });

  it("cadastro de lote utiliza o titular", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarLote(3, { fazendaId: 10, nome: "Bezerros" });
    expect(resultado).toMatchObject({ ok: true, userId: 1, executorUserId: 3 });
    expect(estado.lotes[0]?.userId).toBe(1);
  });

  it("lote não pode pertencer a outra conta", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarLote(3, { fazendaId: 30, nome: "Alheio" });
    expect(resultado).toEqual({ ok: false, motivo: "outro_titular" });
    expect(estado.lotes).toHaveLength(0);
  });

  it("lote não pode utilizar fazenda não autorizada", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarLote(3, { fazendaId: 20, nome: "Sul" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_fazenda" });
    expect(estado.lotes).toHaveLength(0);
  });

  it("consulta de lotes respeita fazendas concedidas", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    await servico.cadastrarLote(1, { fazendaId: 10, nome: "Norte" });
    await servico.cadastrarLote(1, { fazendaId: 20, nome: "Sul" });
    const lista = await servico.listarLotes(3);
    expect(lista).toMatchObject({ ok: true, total: 1 });
    if (lista.ok) expect(lista.itens.map((lote) => lote.nome)).toEqual(["Norte"]);
  });

  it("atualização de lote preserva titularidade", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarLote(3, { fazendaId: 10, nome: "Lote" });
    if (!criado.ok) throw new Error("lote");
    const atualizado = await servico.atualizarLote(3, { id: criado.id, nome: "Lote 2", userId: 9, fazendaId: 30 });
    expect(atualizado).toEqual({ ok: false, motivo: "titularidade_imutavel" });
    expect(estado.lotes[0]).toMatchObject({ userId: 1, fazendaId: 10, nome: "Lote" });
  });

  it("relação entre animal, lote e fazenda é validada", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const lote = await servico.cadastrarLote(1, { fazendaId: 20, nome: "Sul" });
    if (!lote.ok) throw new Error("lote");
    const animal = await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea", loteId: lote.id });
    expect(animal).toEqual({ ok: false, motivo: "lote_incompativel" });
    expect(estado.animais).toHaveLength(0);
    expect(estado.movimentos).toHaveLength(0);
  });

  it("usuário inativo recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(8, { fazendaId: 10, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("usuário convidado recebe recusa", async () => {
    const estado = estadoInicial();
    const resultado = await criarServicoRebanho(depsDe(estado)).cadastrarAnimal(7, { fazendaId: 10, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("permissão revogada impede nova operação", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const primeiro = await servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "femea" });
    expect(primeiro.ok).toBe(true);
    const comum = estado.usuarios.find((item) => item.id === 2);
    if (comum) comum.permissoes = comum.permissoes.filter((id) => id !== "animais.criar");
    const segundo = await servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "macho" });
    expect(segundo).toEqual({ ok: false, motivo: "sem_permissao" });
    expect(estado.animais).toHaveLength(1);
  });

  it("fazenda revogada impede nova operação", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const comum = estado.usuarios.find((item) => item.id === 2);
    if (comum) comum.fazendas = [];
    const resultado = await servico.cadastrarAnimal(2, { fazendaId: 10, sexo: "femea" });
    expect(resultado).toEqual({ ok: false, motivo: "sem_fazenda" });
    expect(estado.animais).toHaveLength(0);
  });

  it("regras existentes de unicidade permanecem", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    expect((await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea", brinco: "A1", brincoEletronico: "E1" })).ok).toBe(true);
    expect(await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "macho", brinco: "a1" })).toEqual({ ok: false, motivo: "brinco_duplicado" });
    expect(await servico.cadastrarAnimal(1, { fazendaId: 20, sexo: "macho", brincoEletronico: " E1 " })).toEqual({ ok: false, motivo: "rfid_duplicado" });
    expect(estado.animais).toHaveLength(1);
  });

  it("regras de situação do animal permanecem", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const criado = await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea", status: "vendido" });
    expect(criado.motivo).toBe("situacao_preservada");
    const ativo = await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea" });
    if (!ativo.ok) throw new Error("cadastro");
    const baixa = await servico.atualizarAnimal(1, { id: ativo.id, status: "morto" });
    expect(baixa.motivo).toBe("situacao_preservada");
    expect(estado.animais[0]?.status).toBe("ativo");
  });

  it("listagens e contagens respeitam isolamento", async () => {
    const estado = estadoInicial();
    estado.usuarios.push(pessoa({ id: 9, papel: "principal", titularUserId: 9 }));
    const servico = criarServicoRebanho(depsDe(estado));
    await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "femea", nome: "Um" });
    await servico.cadastrarAnimal(1, { fazendaId: 10, sexo: "macho", nome: "Dois" });
    estado.animais.push({
      id: 90,
      userId: 9,
      fazendaId: 30,
      loteId: null,
      brinco: null,
      brincoEletronico: null,
      nome: "Outra",
      sexo: "femea",
      status: "ativo",
    });
    const pagina = await servico.listarAnimais(2, { pagina: 1, tamanho: 1 });
    expect(pagina).toMatchObject({ ok: true, total: 2 });
    if (pagina.ok) {
      expect(pagina.itens).toHaveLength(1);
      expect(pagina.itens.every((animal) => animal.userId === 1)).toBe(true);
    }
    const fazendas = await servico.listarFazendas(2);
    expect(fazendas).toEqual({ ok: true, fazendas: [{ id: 10, nome: "Pasto Norte" }] });
  });

  it("falha durante gravação não deixa registro parcial", async () => {
    const estado = estadoInicial();
    const servico = criarServicoRebanho(depsDe(estado));
    const lote = await servico.cadastrarLote(1, { fazendaId: 10, nome: "Curral" });
    if (!lote.ok) throw new Error("lote");
    await expect(servico.cadastrarAnimal(
      1,
      { fazendaId: 10, sexo: "femea", loteId: lote.id },
      undefined,
      async () => {
        throw new Error("falha provocada");
      },
    )).rejects.toThrow("falha provocada");
    expect(estado.animais).toHaveLength(0);
    expect(estado.movimentos).toHaveLength(0);
    expect(estado.lotes).toHaveLength(1);
  });

  it("não troca o executor pelo dono quando o modelo não tem coluna", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fonte = readFileSync(resolve(here, "rebanhoTitularidade.ts"), "utf8");
    expect(LACUNA_AUTORIA_ANIMAL).toContain("usuarioNome");
    expect(fonte).not.toContain("routers");
    expect(fonte).not.toContain("from \"./db\"");
  });
});
