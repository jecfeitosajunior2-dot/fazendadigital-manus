import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  errosDeVinculoImportacao,
  eventoHistoricoVisivel,
  decisaoImportacaoSemIndice,
  indiceBrincoAtivoPresente,
  inserirAnimalImportadoNaTransacao,
  type CatalogoImportacaoAnimal,
  type TransacaoImportacaoAnimal,
  type UsuarioTravadoImportacao,
} from "./importacaoAnimalAutorizada";

const here = dirname(fileURLToPath(import.meta.url));
const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
const animais = fonte.slice(fonte.indexOf("const animaisRouter = router({"), fonte.indexOf("const lotesRouter = router({"));

const catalogo: CatalogoImportacaoAnimal = {
  principal: false,
  fazendasAutorizadas: [10],
  fazendas: [
    { id: 10, nome: "Norte" },
    { id: 20, nome: "Sul" },
  ],
  lotes: [
    { id: 1, nome: "Lote Norte", fazendaId: 10, ativo: true },
    { id: 2, nome: "Lote Sul", fazendaId: 20, ativo: true },
    { id: 3, nome: "Velho", fazendaId: 10, ativo: false },
  ],
  pastos: [
    { id: 7, nome: "Pasto A", fazendaId: 10 },
    { id: 8, nome: "Pasto B", fazendaId: 20 },
  ],
};

function usuario(id: number, papel: string): UsuarioTravadoImportacao {
  return { id, papel, titularUserId: papel === "principal" ? id : 1, situacao: "ativo", sessionVersion: 0 };
}

function transacao(opcoes?: {
  brincoOcupado?: boolean;
  rfidOcupado?: boolean;
  permissao?: boolean;
  fazendas?: number[];
  falhaNoInsert?: unknown;
}): TransacaoImportacaoAnimal & { ordem: string[]; gravado: Record<string, unknown> | null } {
  const estado = { ordem: [] as string[], gravado: null as Record<string, unknown> | null };
  return {
    ordem: estado.ordem,
    get gravado() { return estado.gravado; },
    async travarUsuario(id) {
      estado.ordem.push(`usuario:${id}`);
      return usuario(id, id === 1 ? "principal" : "comum");
    },
    async permissoes() {
      estado.ordem.push("permissoes");
      return opcoes?.permissao === false ? [] : ["animais.criar"];
    },
    async fazendasDoVinculo() {
      estado.ordem.push("vinculos");
      return opcoes?.fazendas ?? [10];
    },
    async brincoAtivo() {
      estado.ordem.push("brinco");
      return opcoes?.brincoOcupado === true;
    },
    async rfidAtivo() {
      return opcoes?.rfidOcupado === true;
    },
    async inserir(row) {
      if (opcoes?.falhaNoInsert) throw opcoes.falhaNoInsert;
      estado.gravado = row;
      return 41;
    },
  };
}

describe("animais — consultas e importação sem o arquivo local", () => {
  it("as oito rotas que faltavam não respondem pelo arquivo", () => {
    const trechos = ["historicoPastos:", "marcasDistintas:", "list: protectedProcedure", "getById:", "getByBrincoEletronicoExact:", "gerarModeloPlanilha:", "validarImportacao:", "importar:"];
    for (const nome of trechos) {
      expect(animais).toContain(nome);
    }
    expect(animais).not.toContain("listLocalHistoricoPastosAnimal");
    expect(animais).not.toContain("listLocalAnimaisEnriched");
    expect(animais).not.toContain("getLocalAnimal");
    expect(animais).not.toContain("createLocalAnimal");
    expect(animais).not.toContain("escolherAnimalPorRfid");
    expect(animais).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(animais).toContain("recusarAnimalSemMysql()");
    expect(animais).toContain("recusarExclusaoFisicaAnimal()");
    expect(animais).toContain("inserirAnimalImportadoNaTransacao");
    expect(animais).toContain("INDICE_BRINCO_ATIVO");
    expect(animais).toContain("A importação está bloqueada até a proteção contra brinco repetido existir no banco.");
    expect(decisaoImportacaoSemIndice(false)).toBe("bloqueada");
    expect(decisaoImportacaoSemIndice(true)).toBe("liberada");
    expect(indiceBrincoAtivoPresente([[{ Key_name: "animais_user_brinco_ativo_uq" }], []])).toBe(true);
    expect(indiceBrincoAtivoPresente([[], []])).toBe(false);
    expect(indiceBrincoAtivoPresente([])).toBe(false);
    expect(animais).toContain('"animais.visualizar"');
    expect(animais).toContain('"animais.criar"');
  });

  it("histórico de outra fazenda não aparece só porque o animal está hoje numa fazenda concedida", () => {
    expect(eventoHistoricoVisivel({ fazendaOrigemId: 10, fazendaDestinoId: 20 }, [10], false)).toBe(false);
    expect(eventoHistoricoVisivel({ fazendaOrigemId: 10, fazendaDestinoId: 10 }, [10], false)).toBe(true);
    expect(eventoHistoricoVisivel({ fazendaOrigemId: null, fazendaDestinoId: null }, [10], false)).toBe(true);
    expect(eventoHistoricoVisivel({ fazendaOrigemId: 20, fazendaDestinoId: 30 }, [10], true)).toBe(true);
  });

  it("a planilha não aceita fazenda, lote ou pasto de fora da concessão", () => {
    expect(errosDeVinculoImportacao({ fazendaNome: "Sul", lote: "Lote Sul", subdivisao: "Pasto B" }, catalogo).erros)
      .toEqual([
        { campo: "Fazenda", mensagem: 'Fazenda não encontrada: "Sul"' },
        { campo: "lote", mensagem: 'Lote não encontrado: "Lote Sul"' },
        { campo: "Subdivisão", mensagem: 'Pasto/Subdivisão não encontrado: "Pasto B"' },
      ]);
    const certo = errosDeVinculoImportacao({ fazendaNome: "Norte", lote: "Lote Norte", subdivisao: "Pasto A" }, catalogo);
    expect(certo.erros).toEqual([]);
    expect(certo).toMatchObject({ fazendaId: 10, loteId: 1, pastoId: 7 });
    expect(errosDeVinculoImportacao({ fazendaNome: "Norte", lote: "Lote Sul" }, catalogo).erros[0]?.mensagem)
      .toContain("Lote não encontrado");
    expect(errosDeVinculoImportacao({ fazendaNome: "Norte", lote: "Velho" }, catalogo).erros[0]?.mensagem)
      .toContain("inativo");
    expect(errosDeVinculoImportacao({ fazendaNome: "Norte", subdivisao: "Pasto B" }, catalogo).erros[0]?.mensagem)
      .toContain("não encontrado");
  });

  it("a linha gravada fica no titular e a trava segue o cadastro", async () => {
    const tx = transacao();
    const resultado = await inserirAnimalImportadoNaTransacao(tx, {
      executorId: 2,
      titularUserId: 1,
      sessionVersionDaSessao: 0,
      fazendaId: 10,
      brinco: "B1",
      brincoEletronico: null,
      status: "ativo",
      row: { userId: 99, brinco: "B1", fazendaId: 10 },
    });
    expect(resultado).toEqual({ ok: true, id: 41 });
    expect(tx.ordem).toEqual(["usuario:2", "permissoes", "vinculos", "usuario:1", "brinco"]);
    expect(tx.gravado).toMatchObject({ userId: 1, brinco: "B1" });
  });

  it("permissão revogada e brinco repetido recusam a linha", async () => {
    const semPermissao = await inserirAnimalImportadoNaTransacao(transacao({ permissao: false }), {
      executorId: 2, titularUserId: 1, sessionVersionDaSessao: 0, fazendaId: 10,
      brinco: "B1", brincoEletronico: null, status: "ativo", row: { brinco: "B1" },
    });
    expect(semPermissao).toEqual({ ok: false, motivo: "sem_permissao" });
    const repetido = await inserirAnimalImportadoNaTransacao(transacao({ brincoOcupado: true }), {
      executorId: 2, titularUserId: 1, sessionVersionDaSessao: 0, fazendaId: 10,
      brinco: "B1", brincoEletronico: null, status: "ativo", row: { brinco: "B1" },
    });
    expect(repetido).toEqual({ ok: false, motivo: "brinco_duplicado" });
  });

  it("falha no meio da linha não devolve um id", async () => {
    await expect(inserirAnimalImportadoNaTransacao(transacao({ falhaNoInsert: new Error("disco") }), {
      executorId: 1, titularUserId: 1, sessionVersionDaSessao: 0, fazendaId: 10,
      brinco: "B1", brincoEletronico: null, status: "ativo", row: { brinco: "B1" },
    })).rejects.toThrow("disco");
  });
});
