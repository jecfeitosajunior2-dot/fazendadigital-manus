import { describe, expect, it } from "vitest";
import { packReproObservacoes } from "../shared/reproRegistroMeta";
import {
  categoriaAposTrocaSexoNoFormulario,
  coletarEvidenciasAlteracaoSexo,
  isMensagemBloqueioAlteracaoSexo,
  MSG_BLOQUEIO_SEXO_GENERICA,
  MSG_CAMPOS_OBRIGATORIOS_DESTAQUE,
  opcoesCategoriaComValorAtual,
  precisaValidarAlteracaoSexo,
  toastErroSalvarEditarAnimal,
  validarAlteracaoSexoAnimal,
  type EvidenciasAlteracaoSexo,
} from "../shared/validarAlteracaoSexoAnimal";

const ev = (parcial: Partial<EvidenciasAlteracaoSexo> = {}): EvidenciasAlteracaoSexo => ({
  temEventoCastracao: false,
  castradoInicialExplicito: false,
  vinculadoComoPai: false,
  vinculadoComoMae: false,
  tiposReproComoAlvo: [],
  vinculadoComoMachoEstrutural: false,
  vinculadoComoFemeaEmCoberturaAlvo: false,
  ...parcial,
});

describe("precisaValidarAlteracaoSexo", () => {
  it("não valida quando o sexo não veio no payload", () => {
    expect(precisaValidarAlteracaoSexo("macho", undefined)).toBe(false);
    expect(precisaValidarAlteracaoSexo("femea", null)).toBe(false);
  });

  it("não valida quando o sexo permanece o mesmo (enum ou label)", () => {
    expect(precisaValidarAlteracaoSexo("macho", "macho")).toBe(false);
    expect(precisaValidarAlteracaoSexo("femea", "Fêmea")).toBe(false);
    expect(precisaValidarAlteracaoSexo("Macho", "macho")).toBe(false);
  });

  it("valida somente na troca real", () => {
    expect(precisaValidarAlteracaoSexo("macho", "femea")).toBe(true);
    expect(precisaValidarAlteracaoSexo("femea", "macho")).toBe(true);
  });
});

describe("validarAlteracaoSexoAnimal — mesmo sexo não dispara bloqueio", () => {
  it("Teste O: macho castrado salvando macho continua permitido", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "macho",
      evidencias: ev({ temEventoCastracao: true, vinculadoComoPai: true }),
    });
    expect(r.permitido).toBe(true);
  });

  it("Teste M/N: só categoria — sexo igual não bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "femea",
      evidencias: ev({ tiposReproComoAlvo: ["Inseminação", "Parto"] }),
    });
    expect(r.permitido).toBe(true);
  });
});

describe("validarAlteracaoSexoAnimal — Fêmea → Macho", () => {
  it("Teste A: fêmea jovem só com eventos neutros pode corrigir", () => {
    const evidencias = coletarEvidenciasAlteracaoSexo({
      animalId: 10,
      saudeTipos: ["Vacinação", "Vermifugação"],
      reproRegistros: [{ tipo: "Desmama", femeaId: 10 }],
    });
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias,
    });
    expect(r.permitido).toBe(true);
  });

  it("Teste B: Inseminação (IA/IATF) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Inseminação"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.codigo).toBe("REPRO_INSEMINACAO");
      expect(r.mensagem).toMatch(/inseminação/i);
    }
  });

  it("Teste C: Diagnóstico de prenhez bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Diagnóstico de prenhez"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("REPRO_DIAGNOSTICO_PRENHEZ");
  });

  it("Teste D: Parto bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Parto"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.codigo).toBe("REPRO_PARTO");
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Macho porque este animal possui registro de parto.",
      );
    }
  });

  it("Teste E: Aborto bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Aborto"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("REPRO_ABORTO");
  });

  it("Cio (retorno ao cio do projeto) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Cio"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("REPRO_CIO");
  });

  it("Cobertura no papel de fêmea (alvo) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Cobertura"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("REPRO_COBERTURA");
  });

  it("Teste G: maternidade estruturada (maeId) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ vinculadoComoMae: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.codigo).toBe("MATERNIDADE");
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Macho porque este animal está vinculado como mãe de descendentes.",
      );
    }
  });

  it("papel de fêmea em coberturaAlvo estrutural bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ vinculadoComoFemeaEmCoberturaAlvo: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("COBERTURA_ALVO_FEMEA");
  });

  it("não bloqueia por Desmama, Outro, sanitário comum ou texto de pai/mãe", () => {
    const evidencias = coletarEvidenciasAlteracaoSexo({
      animalId: 8,
      saudeTipos: ["Vacinação", "Tratamento"],
      descendentes: [],
      reproRegistros: [{ tipo: "Desmama", femeaId: 8 }, { tipo: "Outro", femeaId: 8 }],
    });
    expect(
      validarAlteracaoSexoAnimal({
        sexoAtual: "femea",
        novoSexo: "macho",
        evidencias,
      }).permitido,
    ).toBe(true);
  });

  it("Secagem não existe no projeto — ausência não bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Desmama"] }),
    });
    expect(r.permitido).toBe(true);
  });
});

describe("validarAlteracaoSexoAnimal — Macho → Fêmea", () => {
  it("Teste H: macho simples com eventos neutros pode corrigir", () => {
    const evidencias = coletarEvidenciasAlteracaoSexo({
      animalId: 3,
      castradoAtual: false,
      saudeTipos: ["Vacinação", "Identificação"],
      reproRegistros: [],
    });
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias,
    });
    expect(r.permitido).toBe(true);
  });

  it("não informado / não castrado sozinhos não bloqueiam", () => {
    expect(
      validarAlteracaoSexoAnimal({
        sexoAtual: "macho",
        novoSexo: "femea",
        evidencias: coletarEvidenciasAlteracaoSexo({ animalId: 1, castradoAtual: null }),
      }).permitido,
    ).toBe(true);
    expect(
      validarAlteracaoSexoAnimal({
        sexoAtual: "macho",
        novoSexo: "femea",
        evidencias: coletarEvidenciasAlteracaoSexo({ animalId: 1, castradoAtual: false }),
      }).permitido,
    ).toBe(true);
  });

  it("Teste I: evento de Castração bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: ev({ temEventoCastracao: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.codigo).toBe("HISTORICO_CASTRACAO");
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Fêmea porque este animal possui registro de castração.",
      );
    }
  });

  it("Teste J: estado inicial Castrado bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: coletarEvidenciasAlteracaoSexo({ animalId: 4, castradoAtual: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("ESTADO_INICIAL_CASTRADO");
  });

  it("Teste K: paternidade estruturada (paiId) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: ev({ vinculadoComoPai: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.codigo).toBe("PATERNIDADE");
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Fêmea porque este animal está vinculado como pai de descendentes.",
      );
    }
  });

  it("Teste L: reprodutor estrutural (machoId) bloqueia", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: ev({ vinculadoComoMachoEstrutural: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("REPRODUTOR_ESTRUTURAL");
  });

  it("exame andrológico e coleta de sêmen bloqueiam", () => {
    expect(
      validarAlteracaoSexoAnimal({
        sexoAtual: "macho",
        novoSexo: "femea",
        evidencias: ev({ tiposReproComoAlvo: ["Exame andrológico"] }),
      }).permitido,
    ).toBe(false);
    expect(
      validarAlteracaoSexoAnimal({
        sexoAtual: "macho",
        novoSexo: "femea",
        evidencias: ev({ tiposReproComoAlvo: ["Coleta de sêmen"] }),
      }).permitido,
    ).toBe(false);
  });

  it("primeiro motivo determinístico prevalece quando há vários", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: ev({
        temEventoCastracao: true,
        vinculadoComoPai: true,
        tiposReproComoAlvo: ["Coleta de sêmen"],
      }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) expect(r.codigo).toBe("HISTORICO_CASTRACAO");
  });
});

describe("mensagens e prioridade de toast no Editar Animal", () => {
  it("Teste B: estado inicial Castrado usa mensagem específica", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "macho",
      novoSexo: "femea",
      evidencias: coletarEvidenciasAlteracaoSexo({ animalId: 4, castradoAtual: true }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Fêmea porque este animal já está registrado como castrado.",
      );
    }
  });

  it("diagnóstico usa mensagem específica de gestação", () => {
    const r = validarAlteracaoSexoAnimal({
      sexoAtual: "femea",
      novoSexo: "macho",
      evidencias: ev({ tiposReproComoAlvo: ["Diagnóstico de prenhez"] }),
    });
    expect(r.permitido).toBe(false);
    if (!r.permitido) {
      expect(r.mensagem).toBe(
        "Não é possível alterar o sexo para Macho porque este animal possui registro de diagnóstico de gestação.",
      );
    }
  });

  it("no edit, trocar sexo não zera categoria — evita toast genérico falso", () => {
    expect(
      categoriaAposTrocaSexoNoFormulario({ modo: "edit", categoriaAtual: "Bezerro" }),
    ).toBe("Bezerro");
    expect(
      categoriaAposTrocaSexoNoFormulario({ modo: "create", categoriaAtual: "Bezerro" }),
    ).toBe("");
  });

  it("mantém categoria atual nas opções se ela não for do novo sexo", () => {
    expect(opcoesCategoriaComValorAtual("Fêmea", "Bezerro")).toEqual([
      "Bezerro",
      "Bezerra",
      "Novilha",
      "Vaca",
    ]);
  });

  it("bloqueio de Sexo do backend não vira toast de campos obrigatórios", () => {
    const aviso = toastErroSalvarEditarAnimal({
      temErroRequired: false,
      mensagemBackend:
        "Não é possível alterar o sexo para Fêmea porque este animal possui registro de castração.",
    });
    expect(aviso.tipo).toBe("sexo");
    expect(aviso.mensagem).toMatch(/castração/);
    expect(aviso.mensagem).not.toBe(MSG_CAMPOS_OBRIGATORIOS_DESTAQUE);
    expect(isMensagemBloqueioAlteracaoSexo(aviso.mensagem)).toBe(true);
  });

  it("Teste I: required real continua com a mensagem genérica", () => {
    const aviso = toastErroSalvarEditarAnimal({ temErroRequired: true });
    expect(aviso.tipo).toBe("required");
    expect(aviso.mensagem).toBe(MSG_CAMPOS_OBRIGATORIOS_DESTAQUE);
  });

  it("fallback de Sexo sem texto específico não usa campos obrigatórios", () => {
    const aviso = toastErroSalvarEditarAnimal({
      temErroRequired: false,
      mensagemBackend: "",
    });
    expect(aviso.mensagem).toBe(MSG_BLOQUEIO_SEXO_GENERICA);
  });
});

describe("coletarEvidenciasAlteracaoSexo", () => {
  it("reconhece castração, pai/mãe estruturados e ignora texto legado", () => {
    const evd = coletarEvidenciasAlteracaoSexo({
      animalId: 7,
      castradoAtual: 1,
      saudeTipos: ["Castração", "Vacinação"],
      descendentes: [
        { paiId: 7, maeId: 2 },
        { paiId: 9, maeId: 7 },
      ],
    });
    expect(evd.temEventoCastracao).toBe(true);
    expect(evd.castradoInicialExplicito).toBe(true);
    expect(evd.vinculadoComoPai).toBe(true);
    expect(evd.vinculadoComoMae).toBe(true);
  });

  it("machoId em evento de outra fêmea é papel estrutural de reprodutor", () => {
    const evd = coletarEvidenciasAlteracaoSexo({
      animalId: 16,
      reproRegistros: [{ tipo: "Inseminação", femeaId: 20, machoId: 16 }],
    });
    expect(evd.vinculadoComoMachoEstrutural).toBe(true);
    expect(evd.tiposReproComoAlvo).toEqual([]);
  });

  it("evento masculino do próprio animal entra como alvo, não como sire de outra matriz", () => {
    const evd = coletarEvidenciasAlteracaoSexo({
      animalId: 16,
      reproRegistros: [{ tipo: "Exame andrológico", femeaId: 16, machoId: 16 }],
    });
    expect(evd.tiposReproComoAlvo).toEqual(["Exame andrológico"]);
    expect(evd.vinculadoComoMachoEstrutural).toBe(false);
  });

  it("coberturaAlvo usa só animalIds estruturados — não compara brinco textual", () => {
    const comId = packReproObservacoes(null, null, null, null, {
      selectionMode: "individual",
      animalIds: [44],
      labelsBrinco: ["7845"],
    });
    const soTextoLote = packReproObservacoes(null, null, null, null, {
      selectionMode: "lote",
      animalIds: [],
      labelsBrinco: [],
      tipo: "lote",
      loteId: 1,
      labelLoteNome: "Lote A",
    });
    const evId = coletarEvidenciasAlteracaoSexo({
      animalId: 44,
      reproRegistros: [{ tipo: "Cobertura realizada", femeaId: 16, machoId: 16, observacoes: comId }],
    });
    const evTexto = coletarEvidenciasAlteracaoSexo({
      animalId: 44,
      reproRegistros: [{ tipo: "Cobertura realizada", femeaId: 16, machoId: 16, observacoes: soTextoLote }],
    });
    expect(evId.vinculadoComoFemeaEmCoberturaAlvo).toBe(true);
    expect(evTexto.vinculadoComoFemeaEmCoberturaAlvo).toBe(false);
  });
});
