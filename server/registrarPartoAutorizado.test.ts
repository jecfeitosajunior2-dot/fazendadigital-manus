import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { LinhaUsuarioCadastro } from "./cadastroAnimalAutorizado";
import { permissaoPorId } from "./catalogoPermissoes";
import { MSG_PARTO_CRIAS_OBRIGATORIAS, MSG_PARTO_NATIMORTO_SEM_CRIAS } from "./partoRegras";
import {
  MSG_PARTO_FAZENDA_DIVERGENTE,
  MSG_PARTO_MATRIZ_AUSENTE,
  ORDEM_BLOQUEIO_PARTO,
  PERMISSAO_PARTO,
  registrarPartoAutorizado,
  type AnimalPartoLinha,
  type ConsultaParto,
  type IoParto,
  type PedidoParto,
  type RegistroPartoLinha,
} from "./registrarPartoAutorizado";
import { MSG_SEM_FAZENDA_MANEJO, MSG_SEM_PERMISSAO_REPRODUCAO } from "./registrarManejoAutorizado";

const raiz = dirname(fileURLToPath(import.meta.url));

function usuario(parcial: Partial<LinhaUsuarioCadastro> & Pick<LinhaUsuarioCadastro, "id" | "papel">): LinhaUsuarioCadastro {
  return {
    openId: `u-${parcial.id}`,
    name: parcial.papel === "principal" ? "Administrador da conta" : "Funcionario Curral",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    titularUserId: parcial.papel === "principal" ? parcial.id : 1,
    situacao: "ativo",
    sessionVersion: 1,
    ...parcial,
  };
}

function animal(parcial: Partial<AnimalPartoLinha> & Pick<AnimalPartoLinha, "id">): AnimalPartoLinha {
  return {
    userId: 1, fazendaId: 10, loteId: 100, pastoId: 1000, sexo: "femea", categoria: "Vaca",
    status: "ativo", dataNascimento: "2018-01-01", castrado: false, ...parcial,
  };
}

function mundo(opcoes?: { falha?: "conexao"; estourarCria?: number }) {
  const usuarios = [
    usuario({ id: 1, papel: "principal", sessionVersion: 3 }),
    usuario({ id: 2, papel: "comum", titularUserId: 1 }),
    usuario({ id: 3, papel: "comum", titularUserId: 1 }),
    usuario({ id: 5, papel: "comum", titularUserId: 1 }),
  ];
  const permissoes = [
    { userId: 2, permissao: PERMISSAO_PARTO },
    { userId: 3, permissao: "animais.criar" },
    { userId: 5, permissao: PERMISSAO_PARTO },
  ];
  const animais = [
    animal({ id: 17 }),
    animal({ id: 80, sexo: "macho", categoria: "Boi" }),
    animal({ id: 90, userId: 4, fazendaId: 40, sexo: "femea", categoria: "Vaca" }),
    animal({ id: 19, categoria: "Bezerra", dataNascimento: "2026-01-01" }),
  ];
  const registros: RegistroPartoLinha[] = [
    { id: 8, tipo: "Inseminação", machoId: 80, dataCobertura: "2026-02-01", resultado: "Realizado" },
  ];
  const crias: number[] = [];
  let partos = 0;
  const consultas: ConsultaParto = {
    async usuario(id) { return usuarios.find((item) => item.id === id) ?? null; },
    async permissoes(userId) { return permissoes.filter((item) => item.userId === userId).map((item) => item.permissao); },
    async vinculos(userId) { return userId === 5 ? [{ userId: 5, fazendaId: 20 }] : userId === 2 || userId === 3 ? [{ userId, fazendaId: 10 }] : []; },
    async fazendasDoTitular(titularUserId) { return titularUserId === 1 ? [{ id: 10, userId: 1 }, { id: 20, userId: 1 }] : [{ id: 40, userId: 4 }]; },
    async fazenda(id) { return id === 40 ? { id: 40, userId: 4 } : { id, userId: 1 }; },
    async espiarAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async espiarRegistros() { return registros; },
    async travaLote(id) { return { id, userId: id === 200 ? 1 : 1, fazendaId: id === 200 ? 20 : 10 }; },
    async travaPasto(id) { return { id, userId: 1, fazendaId: id === 2000 ? 20 : 10 }; },
    async travaAnimal(id) { return animais.find((item) => item.id === id) ?? null; },
    async travaRegistros() { return registros; },
    async baixaAtiva() { return null; },
    async brincoAtivo(_userId, _fazenda, brinco) { return brinco.trim().toLowerCase() === "existe" ? { id: 50 } : null; },
    async rfidAtivo() { return null; },
    async inserirParto() { partos += 1; return 900; },
    async fecharPrevisoes() { return undefined; },
    async inserirAnimal() { const id = 1000 + crias.length; crias.push(id); return id; },
    async inserirMovimento() { return undefined; },
    async inserirVinculo() { return undefined; },
    async inserirPesagem() { return 1; },
    async aposCria(indice) {
      if (opcoes?.estourarCria === indice) throw new Error("falha na segunda cria");
    },
  };
  const io: IoParto = {
    async emTransacao(fn) {
      if (opcoes?.falha === "conexao") throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      const antes = crias.length;
      const partosAntes = partos;
      try {
        return await fn(consultas);
      } catch (erro) {
        crias.splice(antes);
        partos = partosAntes;
        throw erro;
      }
    },
  };
  return { io, crias: () => crias.slice(), partos: () => partos };
}

function pedido(
  executorId: number,
  session: number,
  extra: Partial<Omit<PedidoParto, "input">> & { input?: Partial<PedidoParto["input"]> } = {},
): PedidoParto {
  return {
    executorId,
    sessionVersionDaSessao: session,
    titularInformadoPeloCliente: extra.titularInformadoPeloCliente,
    papelInformadoPeloCliente: extra.papelInformadoPeloCliente,
    permissoesInformadasPeloCliente: extra.permissoesInformadasPeloCliente,
    fazendasInformadasPeloCliente: extra.fazendasInformadasPeloCliente,
    input: {
      femeaId: 17,
      fazendaId: 10,
      dataParto: "2026-11-10",
      resultado: "Normal",
      crias: [{ brinco: "C1", sexo: "femea", categoria: "Bezerra", pesoNascimento: "32.5" }],
      ...extra.input,
    },
  };
}

describe("parto com crias autorizado", () => {
  it("usa reproducao.criar e não exige o cadastro avulso de animal", () => {
    expect(permissaoPorId(PERMISSAO_PARTO)?.descricao).toMatch(/parto/i);
    expect(permissaoPorId("animais.criar")?.descricao).toMatch(/importar/i);
    const fonte = readFileSync(join(raiz, "registrarPartoAutorizado.ts"), "utf8");
    const rota = readFileSync(join(raiz, "routers.ts"), "utf8");
    const tela = readFileSync(join(raiz, "../client/src/pages/ManejoPages.tsx"), "utf8");
    const curral = readFileSync(join(raiz, "../client/src/components/curral/CurralReprodutivoPanel.tsx"), "utf8");
    expect(fonte).toContain(ORDEM_BLOQUEIO_PARTO);
    expect(fonte).toContain("não é exigida");
    expect(fonte).not.toContain('from "./db"');
    expect(fonte).not.toContain("localFallback");
    expect(fonte).not.toContain("deleteLocalAnimal");
    const parto = rota.slice(
      rota.indexOf("registrarPartoComCrias: protectedProcedure"),
      rota.indexOf("update: protectedProcedure", rota.indexOf("registrarPartoComCrias: protectedProcedure")),
    );
    expect(parto).toContain("registrarPartoAutorizado");
    expect(parto).not.toContain("executeRegistrarPartoComCrias");
    expect(parto).not.toContain("localFallback");
    expect(parto).not.toContain("deleteLocalAnimal");
    expect(rota).not.toContain("executeRegistrarPartoComCrias");
    expect(tela).toContain("trpc.reproducao.registrarPartoComCrias.useMutation");
    expect(curral).toContain("trpc.reproducao.registrarPartoComCrias.useMutation");
  });

  it("o administrador e o funcionário autorizado registram a cria no titular", async () => {
    const base = mundo();
    const principal = await registrarPartoAutorizado(base.io, pedido(1, 3, {
      titularInformadoPeloCliente: 4,
      permissoesInformadasPeloCliente: [],
    }));
    expect(principal).toMatchObject({ ok: true, titularUserId: 1, paiId: 80, isNatimorto: false });
    if (principal.ok) {
      expect(principal.crias).toHaveLength(1);
      expect(principal.crias[0]).toMatchObject({ fazendaId: 10, loteDestinoId: 100, pastoId: 1000 });
    }
    const funcionario = await registrarPartoAutorizado(base.io, pedido(2, 1, {
      input: { crias: [{ brinco: "C2", sexo: "macho", categoria: "Bezerro" }] },
    }));
    expect(funcionario).toMatchObject({ ok: true, titularUserId: 1 });
  });

  it("recusa permissão, fazenda, outra matriz, bezerra, fazenda trocada e brinco repetido", async () => {
    const base = mundo();
    const semParto = await registrarPartoAutorizado(base.io, pedido(3, 1, {
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: [PERMISSAO_PARTO],
    }));
    expect(semParto).toMatchObject({ mensagem: MSG_SEM_PERMISSAO_REPRODUCAO });
    const fazenda = await registrarPartoAutorizado(base.io, pedido(5, 1));
    expect(fazenda).toMatchObject({ mensagem: MSG_SEM_FAZENDA_MANEJO });
    const outra = await registrarPartoAutorizado(base.io, pedido(1, 3, { input: { femeaId: 90, fazendaId: 40 } }));
    expect(outra).toMatchObject({ mensagem: MSG_PARTO_MATRIZ_AUSENTE });
    const jovem = await registrarPartoAutorizado(base.io, pedido(1, 3, { input: { femeaId: 19 } }));
    expect(jovem.ok).toBe(false);
    const divergente = await registrarPartoAutorizado(base.io, pedido(1, 3, { input: { fazendaId: 20 } }));
    expect(divergente).toMatchObject({ mensagem: MSG_PARTO_FAZENDA_DIVERGENTE });
    const repetido = await registrarPartoAutorizado(base.io, pedido(1, 3, {
      input: { crias: [{ brinco: "EXISTE", sexo: "femea", categoria: "Bezerra" }] },
    }));
    expect(repetido.ok).toBe(false);
    expect(base.partos()).toBe(0);
  });

  it("segura natimorto, gêmeos, falha da segunda cria e banco fora", async () => {
    const base = mundo();
    const natimorto = await registrarPartoAutorizado(base.io, pedido(1, 3, { input: { resultado: "Natimorto", crias: [] } }));
    expect(natimorto).toMatchObject({ ok: true, isNatimorto: true });
    if (natimorto.ok) expect(natimorto.crias).toHaveLength(0);
    const gemeos = await registrarPartoAutorizado(base.io, pedido(1, 3, {
      input: {
        crias: [
          { brinco: "G1", sexo: "femea", categoria: "Bezerra" },
          { brinco: "G2", sexo: "macho", categoria: "Bezerro", pesoNascimento: "28" },
        ],
      },
    }));
    expect(gemeos.ok && gemeos.crias).toHaveLength(2);

    const quebrado = mundo({ estourarCria: 1 });
    await expect(registrarPartoAutorizado(quebrado.io, pedido(1, 3, {
      input: {
        crias: [
          { brinco: "G1", sexo: "femea", categoria: "Bezerra" },
          { brinco: "G2", sexo: "macho", categoria: "Bezerro" },
        ],
      },
    }))).rejects.toThrow("falha na segunda cria");
    expect(quebrado.crias()).toHaveLength(0);
    expect(quebrado.partos()).toBe(0);

    await expect(registrarPartoAutorizado(base.io, pedido(1, 3, { input: { crias: [] } }))).rejects.toMatchObject({ message: MSG_PARTO_CRIAS_OBRIGATORIAS });
    await expect(registrarPartoAutorizado(base.io, pedido(1, 3, { input: { resultado: "Natimorto" } }))).rejects.toMatchObject({ message: MSG_PARTO_NATIMORTO_SEM_CRIAS });
    const fora = mundo({ falha: "conexao" });
    await expect(registrarPartoAutorizado(fora.io, pedido(1, 3))).rejects.toBeInstanceOf(TRPCError);
    await expect(registrarPartoAutorizado(fora.io, pedido(1, 3))).rejects.toMatchObject({ message: "Banco de dados indisponível." });
  });
});
