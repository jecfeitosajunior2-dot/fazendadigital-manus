import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentidadeUsuario } from "./_core/identidadeSessao";
import {
  importarCoordenadasNaTransacao,
  montarPayloadCoordenadas,
  planejarImportacaoCoordenadas,
  type TransacaoImportacaoCoordenadas,
} from "./routers";

const here = dirname(fileURLToPath(import.meta.url));
const QUANDO = "2026-11-05T12:00:00.000Z";
const PONTOS = "-47.123456789,-15.987654321,0 -47.200000001,-15.300000002,0";
const OUTROS = "-48.5,-16.25,0 -48.6,-16.35,0";

function pessoa(parcial: Partial<IdentidadeUsuario> & Pick<IdentidadeUsuario, "id" | "papel" | "titularUserId" | "situacao">): IdentidadeUsuario {
  return {
    openId: `ficticio-openid-${parcial.id}`,
    name: "Teste",
    email: null,
    role: parcial.papel === "principal" ? "admin" : "user",
    sessionVersion: 0,
    ...parcial,
  };
}

const principal = pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "ativo" });
const secundario = pessoa({ id: 3, papel: "secundario", titularUserId: 1, situacao: "ativo" });
const comum = pessoa({ id: 2, papel: "comum", titularUserId: 1, situacao: "ativo" });
const fazendaA = { id: 10, userId: 1 };
const fazendaB = { id: 20, userId: 1 };
const fazendaAlheia = { id: 30, userId: 9 };
const pastoNorte = { id: 7, userId: 1, fazendaId: 10, nome: "Pasto Norte", sigla: "PN" };
const pastoSul = { id: 8, userId: 1, fazendaId: 20, nome: "Pasto Sul", sigla: "PS" };
const pastoAlheio = { id: 9, userId: 9, fazendaId: 30, nome: "Pasto Alheio", sigla: null };
const pastoCruzado = { id: 15, userId: 1, fazendaId: 30, nome: "Cruzado", sigla: null };
const pastoSemFazenda = { id: 16, userId: 1, fazendaId: 999, nome: "Sem Fazenda", sigla: null };

function kml(itens: { nome: string; coordinates: string }[]) {
  const blocos = itens.map((item) => (
    `<Placemark><name>${item.nome}</name><Polygon><coordinates>${item.coordinates}</coordinates></Polygon></Placemark>`
  ));
  return `<kml>${blocos.join("")}</kml>`;
}

function importar(parcial: Partial<Parameters<typeof planejarImportacaoCoordenadas>[0]> = {}) {
  return planejarImportacaoCoordenadas({
    identidade: principal,
    permissoes: [],
    vinculos: [],
    fazendasDoTitular: [fazendaA, fazendaB],
    fazenda: fazendaA,
    pastos: [pastoNorte, pastoSul, pastoAlheio, pastoCruzado, pastoSemFazenda],
    fazendaId: 10,
    kmlContent: kml([{ nome: "Pasto Norte", coordinates: PONTOS }]),
    importadoEm: QUANDO,
    sessionVersionDaSessao: 0,
    ...parcial,
  });
}

function texto(resultado: ReturnType<typeof importar>) {
  if (!resultado.ok) return "";
  return resultado.atualizacoes[0]?.coordenadas ?? "";
}

function blocoDaRota() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const router = fonte.indexOf("const pastosRouter");
  const inicio = fonte.indexOf("importarCoordenadas: protectedProcedure", router);
  return fonte.slice(inicio, fonte.indexOf("listWithDetails: protectedProcedure", inicio));
}

function blocoDaGravacao() {
  const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
  const inicio = fonte.indexOf("export async function importarCoordenadasNaTransacao");
  return fonte.slice(inicio, fonte.indexOf("function adaptadorImportacaoCoordenadas"));
}

function memoria(opcoes?: { falhar?: boolean; relerNulo?: boolean; coordenadasDiferentes?: boolean }) {
  const gravados: { id: number; titularUserId: number; coordenadas: string }[] = [];
  const tx: TransacaoImportacaoCoordenadas = {
    async travarUsuario() {
      return {
        id: principal.id,
        openId: principal.openId,
        name: principal.name,
        email: principal.email,
        role: principal.role,
        papel: principal.papel,
        titularUserId: principal.titularUserId,
        situacao: principal.situacao,
        sessionVersion: principal.sessionVersion,
      };
    },
    async travarPermissoes() { return []; },
    async travarVinculos() { return []; },
    async travarPastosDaFazenda() { return [pastoNorte]; },
    async travarFazenda() { return fazendaA; },
    async gravarCoordenadas(id, titularUserId, coordenadas) {
      if (opcoes?.falhar) throw new Error("ER_DUP_ENTRY");
      gravados.push({ id, titularUserId, coordenadas });
    },
    async relerPasto(id, titularUserId) {
      if (opcoes?.relerNulo) return null;
      const ultimo = gravados.find((item) => item.id === id && item.titularUserId === titularUserId);
      if (!ultimo) return null;
      return {
        id,
        userId: titularUserId,
        fazendaId: 10,
        coordenadas: opcoes?.coordenadasDiferentes ? "outro" : ultimo.coordenadas,
      };
    },
  };
  return { tx, gravados };
}

describe("pastos.importarCoordenadas", () => {
  it("1. Principal importa coordenadas no pasto próprio", () => {
    const resultado = importar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.importados).toBe(1);
    expect(resultado.atualizacoes.map((item) => item.id)).toEqual([7]);
  });

  it("2. Principal importa na outra fazenda própria", () => {
    const resultado = importar({
      fazenda: fazendaB,
      fazendaId: 20,
      kmlContent: kml([{ nome: "Pasto Sul", coordinates: OUTROS }]),
    });
    expect(resultado.ok && resultado.atualizacoes.map((item) => item.id)).toEqual([8]);
  });

  it("3. Principal não importa pasto de outra conta", () => {
    const resultado = importar({
      fazenda: fazendaAlheia,
      fazendaId: 30,
      kmlContent: kml([{ nome: "Pasto Alheio", coordinates: PONTOS }]),
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("4. Principal não importa pasto inexistente", () => {
    const resultado = importar({ fazenda: null, fazendaId: 404, pastos: [] });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("5. Secundário autorizado importa", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.importados).toBe(1);
  });

  it("6. Secundário não importa em fazenda não concedida", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      fazenda: fazendaB,
      fazendaId: 20,
      kmlContent: kml([{ nome: "Pasto Sul", coordinates: PONTOS }]),
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("7. Secundário sem pastos.editar não importa", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: ["pastos.visualizar"],
      vinculos: [{ userId: 3, fazendaId: 10 }],
      permissoesInformadasPeloCliente: ["pastos.editar"],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("8. Comum autorizado importa", () => {
    const resultado = importar({
      identidade: comum,
      permissoes: ["pastos.editar"],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado.ok && resultado.atualizacoes[0]?.id).toBe(7);
  });

  it("9. Comum sem permissão não importa", () => {
    const resultado = importar({
      identidade: comum,
      permissoes: [],
      vinculos: [{ userId: 2, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("10. Usuário inativo não importa", () => {
    const resultado = importar({ identidade: pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "inativo" }) });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("11. Usuário convidado não importa", () => {
    const resultado = importar({ identidade: pessoa({ id: 1, papel: "principal", titularUserId: 1, situacao: "convidado" }) });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("12. Sessão inválida não importa", () => {
    expect(importar({ identidade: null })).toEqual({ ok: false, motivo: "sem_identidade" });
    expect(blocoDaRota()).toContain('code: "UNAUTHORIZED"');
    expect(blocoDaRota()).toContain("Sessão inválida.");
  });

  it("13. Revogação da permissão impede a importação", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: [],
      vinculos: [{ userId: 3, fazendaId: 10 }],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("14. Revogação do vínculo impede a importação", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: ["pastos.editar"],
      vinculos: [],
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("15. sessionVersion inválida impede a importação", () => {
    const resultado = importar({ sessionVersionDaSessao: 4 });
    expect(resultado).toEqual({ ok: false, motivo: "sem_identidade" });
  });

  it("16. Pasto de outra conta permanece fora da gravação", () => {
    const resultado = importar({
      fazenda: fazendaAlheia,
      fazendaId: 30,
      kmlContent: kml([{ nome: "Pasto Alheio", coordinates: PONTOS }]),
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) expect(resultado.atualizacoes).toEqual([]);
  });

  it("17. Pasto ligado a fazenda de outra conta não entra na gravação", () => {
    const resultado = importar({
      fazenda: fazendaAlheia,
      fazendaId: 30,
      kmlContent: kml([{ nome: "Cruzado", coordinates: PONTOS }]),
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("18. Pasto com fazenda inexistente não entra na gravação", () => {
    const resultado = importar({
      fazenda: null,
      fazendaId: 999,
      kmlContent: kml([{ nome: "Sem Fazenda", coordinates: PONTOS }]),
    });
    expect(resultado).toEqual({ ok: false, motivo: "nao_encontrado" });
  });

  it("19. Identificador informado pelo navegador não autoriza", () => {
    const resultado = importar({
      identidade: secundario,
      permissoes: [],
      vinculos: [],
      titularInformadoPeloCliente: 1,
      papelInformadoPeloCliente: "principal",
      permissoesInformadasPeloCliente: ["pastos.editar"],
      fazendasInformadasPeloCliente: [10, 30],
    });
    expect(resultado).toEqual({ ok: false, motivo: "sem_permissao" });
  });

  it("20. userId não faz parte da alteração", () => {
    const resultado = importar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(Object.keys(resultado.atualizacoes[0] ?? {}).sort()).toEqual(["coordenadas", "id"]);
    expect(texto(resultado)).not.toContain("userId");
  });

  it("21. fazendaId não faz parte da alteração", () => {
    const resultado = importar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(texto(resultado)).not.toContain("fazendaId");
    expect(resultado.atualizacoes[0]?.id).toBe(7);
  });

  it("22. Formato das coordenadas permanece", () => {
    const payload = texto(importar());
    expect(JSON.parse(payload)).toEqual({ coordinates: PONTOS, importadoEm: QUANDO });
    expect(payload).toBe(montarPayloadCoordenadas(PONTOS, QUANDO));
  });

  it("23. Ordem dos pontos permanece", () => {
    const coordinates = JSON.parse(texto(importar())).coordinates as string;
    expect(coordinates.indexOf("-47.123456789,-15.987654321,0")).toBeLessThan(
      coordinates.indexOf("-47.200000001,-15.300000002,0"),
    );
  });

  it("24. Precisão permanece", () => {
    const coordinates = JSON.parse(texto(importar())).coordinates as string;
    expect(coordinates).toContain("-47.123456789");
    expect(coordinates).toContain("-15.987654321");
    expect(coordinates).not.toContain("-47.12,");
  });

  it("25. Coordenadas vazias continuam recusadas", () => {
    const resultado = importar({
      kmlContent: "<kml><Placemark><name>Pasto Norte</name><coordinates>   </coordinates></Placemark></kml>",
    });
    expect(resultado).toEqual({ ok: false, motivo: "kml_vazio" });
  });

  it("26. Coordenadas inválidas continuam recusadas", () => {
    const resultado = importar({ kmlContent: "isto nao e um kml" });
    expect(resultado).toEqual({ ok: false, motivo: "kml_vazio" });
  });

  it("27. Contrato de resposta permanece", () => {
    const resultado = importar({
      kmlContent: kml([
        { nome: "Pasto Norte", coordinates: PONTOS },
        { nome: "Pasto Fantasma", coordinates: OUTROS },
      ]),
    });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.importados).toBe(1);
    expect(resultado.ignorados).toEqual(["Pasto Fantasma"]);
    expect(resultado.totalNoArquivo).toBe(2);
    expect(resultado).not.toHaveProperty("success");
  });

  it("28. Pasto inexistente não retorna sucesso", () => {
    const resultado = importar({ fazenda: null, fazendaId: 404, pastos: [] });
    expect(resultado.ok).toBe(false);
    expect(resultado).not.toHaveProperty("importados");
  });

  it("29. As mesmas coordenadas podem retornar sucesso", async () => {
    const { tx, gravados } = memoria();
    const entrada = { fazendaId: 10, kmlContent: kml([{ nome: "Pasto Norte", coordinates: PONTOS }]) };
    const primeira = await importarCoordenadasNaTransacao(principal, entrada, tx, QUANDO);
    const segunda = await importarCoordenadasNaTransacao(principal, entrada, tx, QUANDO);
    expect(primeira).toEqual({ importados: 1, ignorados: [], totalNoArquivo: 1 });
    expect(segunda).toEqual(primeira);
    expect(gravados).toHaveLength(2);
    expect(gravados[0]?.coordenadas).toBe(gravados[1]?.coordenadas);
  });

  it("30. Falha na atualização não produz sucesso", async () => {
    const quebrada = memoria({ falhar: true });
    const entrada = { fazendaId: 10, kmlContent: kml([{ nome: "Pasto Norte", coordinates: PONTOS }]) };
    await expect(importarCoordenadasNaTransacao(principal, entrada, quebrada.tx, QUANDO)).rejects.toThrow("ER_DUP_ENTRY");
    expect(quebrada.gravados).toEqual([]);
    const sumida = memoria({ relerNulo: true });
    await expect(importarCoordenadasNaTransacao(principal, entrada, sumida.tx, QUANDO)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Pasto não encontrado.",
    });
    const diferente = memoria({ coordenadasDiferentes: true });
    await expect(importarCoordenadasNaTransacao(principal, entrada, diferente.tx, QUANDO)).rejects.toThrow(
      "Coordenadas não confirmadas.",
    );
  });

  it("31. Erro SQL que não é queda de conexão não usa o espelho", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain("if (error instanceof TRPCError) throw error");
    expect(bloco).toContain("if (!isDatabaseUnavailable(error)) throw error");
    expect(bloco).not.toContain("importarCoordenadasPastos");
  });

  it("32. Queda do banco continua só para o Principal, sem o espelho antigo", () => {
    const bloco = blocoDaRota();
    expect(bloco).not.toContain("deveUsarEspelhoQuandoBancoCai");
    expect(bloco).not.toContain("importarCoordenadasNoEspelhoDoPrincipal");
    expect(bloco).not.toContain("listLocalPastosByFazenda");
    expect(bloco).toContain("recusarPastoSemMysql()");
    expect(bloco.indexOf("espelharPastoDepoisDoCommit")).toBeGreaterThan(bloco.indexOf("await db.transaction"));
    expect(bloco).toContain("updateLocalPasto(identidade.titularUserId, item.id, { coordenadas: item.coordenadas })");
    expect(bloco.slice(bloco.indexOf("} catch"))).not.toContain("updateLocalPasto");
  });

  it("33. Nenhum campo cadastral entra na gravação", () => {
    const resultado = importar();
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const campos = Object.keys(resultado.atualizacoes[0] ?? {});
    expect(campos).not.toEqual(expect.arrayContaining([
      "nome", "sigla", "tipo", "tipoPastagem", "area", "incluirArea", "capacidade", "status", "observacoes", "userId", "fazendaId",
    ]));
    expect(blocoDaGravacao()).toContain("gravarCoordenadas(item.id, fresca.titularUserId, item.coordenadas)");
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    const adaptador = fonte.slice(fonte.indexOf("async gravarCoordenadas(id, titularUserId, coordenadas)"));
    expect(adaptador.slice(0, adaptador.indexOf("async relerPasto"))).toContain(".set({ coordenadas })");
  });

  it("34. Animais e lotes não entram na rota", () => {
    const bloco = blocoDaRota();
    expect(bloco).not.toContain("animais");
    expect(bloco).not.toContain("lotes");
    expect(bloco).not.toContain("syncPastoStatus");
  });

  it("35. O fluxo atual de importação continua compatível", () => {
    const bloco = blocoDaRota();
    expect(bloco).toContain("fazendaId: z.number()");
    expect(bloco).toContain("kmlContent: z.string().min(1)");
    expect(bloco).toContain("importarCoordenadasNaTransacao");
    const gravacao = blocoDaGravacao();
    expect(gravacao).toContain("importados: plano.importados, ignorados: plano.ignorados, totalNoArquivo: plano.totalNoArquivo");
    const fonte = readFileSync(resolve(here, "routers.ts"), "utf8");
    expect(fonte).toContain('message: "Nenhuma coordenada encontrada no arquivo KML/KMZ"');
    expect(fonte).toContain('message: "Cadastre subdivisões antes de importar coordenadas"');
    const ultimo = importar({
      kmlContent: kml([
        { nome: "Pasto Norte", coordinates: OUTROS },
        { nome: "Pasto Norte", coordinates: PONTOS },
      ]),
    });
    expect(JSON.parse(texto(ultimo)).coordinates).toBe(PONTOS);
    const porSigla = importar({ kmlContent: kml([{ nome: "PN", coordinates: OUTROS }]) });
    expect(porSigla.ok && porSigla.atualizacoes[0]?.id).toBe(7);
    expect(porSigla.ok && JSON.parse(porSigla.atualizacoes[0]?.coordenadas ?? "{}").coordinates).toBe(OUTROS);
  });
});
