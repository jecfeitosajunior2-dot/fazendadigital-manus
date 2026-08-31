import { describe, expect, it } from "vitest";
import {
  assertDataCastracaoNaoFutura,
  exigeDescricaoMetodo,
  filtrarMachosElegiveisCastracao,
  formatHistoricoCastracao,
  isRegistroCastracao,
  isSexoMacho,
  jaPossuiCastracaoRegistrada,
  labelMetodoCastracao,
  montarPersistenciaCastracao,
  MSG_CASTRACAO_DESCRICAO,
  MSG_CASTRACAO_DUPLICADA,
  MSG_CASTRACAO_INATIVO,
  MSG_CASTRACAO_MACHO,
  MSG_CASTRACAO_METODO,
  podeSalvarCastracao,
  TIPO_SAUDE_CASTRACAO,
  validarAnimalParaCastracao,
  validarCastracaoInput,
  detalheCastracaoSanitario,
  condicaoCastracaoAtual,
  condicaoCastracaoAposTrocaSexo,
  deveMostrarCondicaoCastracaoCadastro,
  estadoCastradoResumo,
  resolverCastradoCadastroInicial,
  textoCastradoSomenteLeitura,
  celulasCastracaoNaTabelaSanitario,
  formatDetalhesColunaSanitario,
  observacaoPersistivel,
  textoHistoricoOuTraco,
} from "../shared/castracaoManejo";

describe("castracaoManejo", () => {
  it("reconhece macho independente de maiúsculas", () => {
    expect(isSexoMacho("macho")).toBe(true);
    expect(isSexoMacho("Macho")).toBe(true);
    expect(isSexoMacho("femea")).toBe(false);
    expect(isSexoMacho("Fêmea")).toBe(false);
  });

  it("lista só machos ativos ainda não castrados", () => {
    const out = filtrarMachosElegiveisCastracao([
      { id: 1, sexo: "macho", status: "ativo", castrado: false },
      { id: 2, sexo: "femea", status: "ativo", castrado: false },
      { id: 3, sexo: "macho", status: "vendido", castrado: false },
      { id: 4, sexo: "macho", status: "ativo", castrado: true },
      { id: 5, sexo: "macho", status: "ativo", castrado: null },
    ] as Array<{
      id: number;
      sexo: string;
      status: string;
      castrado: boolean | null;
    }>);
    expect(out.map(a => a.id)).toEqual([1, 5]);
  });

  it("bloqueia fêmea, inativo e duplicidade no animal", () => {
    const femea = validarAnimalParaCastracao({ sexo: "femea", status: "ativo" });
    expect(femea.ok).toBe(false);
    if (!femea.ok) expect(femea.message).toBe(MSG_CASTRACAO_MACHO);

    const inativo = validarAnimalParaCastracao({ sexo: "macho", status: "morto" });
    expect(inativo.ok).toBe(false);
    if (!inativo.ok) expect(inativo.message).toBe(MSG_CASTRACAO_INATIVO);

    const duplicado = validarAnimalParaCastracao({
      sexo: "macho",
      status: "ativo",
      castrado: true,
    });
    expect(duplicado.ok).toBe(false);
    if (!duplicado.ok) expect(duplicado.message).toBe(MSG_CASTRACAO_DUPLICADA);

    expect(validarAnimalParaCastracao({
      sexo: "macho",
      status: "ativo",
      castrado: null,
    }).ok).toBe(true);
    expect(validarAnimalParaCastracao({
      sexo: "macho",
      status: "ativo",
      castrado: false,
    }).ok).toBe(true);
  });

  it("exige descrição só em Outro", () => {
    expect(exigeDescricaoMetodo("burdizzo")).toBe(false);
    expect(exigeDescricaoMetodo("outro")).toBe(true);
    const semDesc = validarCastracaoInput({
        fazendaId: 1,
        animalId: 2,
        dataCastracao: "2026-08-28",
        metodo: "outro",
      });
    expect(semDesc.ok).toBe(false);
    if (!semDesc.ok) expect(semDesc.message).toBe(MSG_CASTRACAO_DESCRICAO);
    expect(
      validarCastracaoInput({
        fazendaId: 1,
        animalId: 2,
        dataCastracao: "2026-08-28",
        metodo: "outro",
        descricaoMetodo: "técnica X",
      }).ok,
    ).toBe(true);
  });

  it("exige método e data válida", () => {
    const semMetodo = validarCastracaoInput({
        fazendaId: 1,
        animalId: 2,
        dataCastracao: "2026-08-28",
      });
    expect(semMetodo.ok).toBe(false);
    if (!semMetodo.ok) expect(semMetodo.message).toBe(MSG_CASTRACAO_METODO);
    expect(assertDataCastracaoNaoFutura("2099-01-01", "2026-08-28").ok).toBe(false);
    expect(podeSalvarCastracao({
      fazendaId: 1,
      animalId: 3,
      dataCastracao: "2026-08-28",
      metodo: "burdizzo",
    })).toBe(true);
  });

  it("detecta registro de castração no histórico sanitário", () => {
    expect(isRegistroCastracao("Castração")).toBe(true);
    expect(isRegistroCastracao("castracao")).toBe(true);
    expect(isRegistroCastracao("Vacinação")).toBe(false);
    expect(jaPossuiCastracaoRegistrada([{ tipo: "Vacinação" }, { tipo: "Castração" }])).toBe(
      true,
    );
  });

  it("persiste método no campo medicamento e tipo Castração", () => {
    const burdizzo = montarPersistenciaCastracao({ metodo: "burdizzo" });
    expect(burdizzo.tipo).toBe(TIPO_SAUDE_CASTRACAO);
    expect(burdizzo.medicamento).toBe(labelMetodoCastracao("burdizzo"));
    expect(burdizzo.descricao).toBeUndefined();

    const outro = montarPersistenciaCastracao({
      metodo: "outro",
      descricaoMetodo: "técnica usada",
      observacoes: "sem intercorrência",
    });
    expect(outro.descricao).toBe("técnica usada");
    expect(outro.observacoes).toBe("sem intercorrência");
  });

  it("monta linhas do histórico individual", () => {
    const hist = formatHistoricoCastracao({
      medicamento: "Cirúrgica",
      observacoes: "Procedimento sem intercorrências.",
    });
    expect(hist.titulo).toBe("Castração");
    expect(hist.metodoLinha).toBe("Método: Cirúrgica");
    expect(hist.observacoesLinha).toBe("Observações: Procedimento sem intercorrências.");
  });

  it("monta o detalhe da tabela Sanitário sem inventar produto", () => {
    expect(detalheCastracaoSanitario({ medicamento: "Burdizzo" }).texto).toBe("Método: Burdizzo");
    expect(detalheCastracaoSanitario({ medicamento: "Cirúrgica" }).texto).toBe("Método: Cirúrgica");
    const outro = detalheCastracaoSanitario({
      medicamento: "Outro",
      descricao: "Orquiectomia conforme técnica do veterinário",
    });
    expect(outro.texto).toBe(
      "Método: Outro\nTécnica: Orquiectomia conforme técnica do veterinário",
    );
  });

  it("resume Castrado só para macho, com 3 estados", () => {
    expect(estadoCastradoResumo({ sexo: "femea", castrado: false })).toBeNull();
    expect(estadoCastradoResumo({ sexo: "femea", castrado: true })).toBeNull();
    expect(estadoCastradoResumo({ sexo: "macho", castrado: false })).toBe("Não");
    expect(estadoCastradoResumo({ sexo: "macho", castrado: true })).toBe("Sim");
    expect(estadoCastradoResumo({ sexo: "macho", castrado: null })).toBe("—");
    expect(estadoCastradoResumo({ sexo: "macho" })).toBe("—");
    expect(
      estadoCastradoResumo({ sexo: "macho", castrado: false, temEventoCastracao: true }),
    ).toBe("Sim");
    expect(
      estadoCastradoResumo({ sexo: "macho", castrado: null, temEventoCastracao: true }),
    ).toBe("Sim");
  });

  it("exibe Castrado somente leitura: Sim / Não / —; fêmea oculta", () => {
    expect(textoCastradoSomenteLeitura({ sexo: "macho", castrado: true })).toBe("Sim");
    expect(textoCastradoSomenteLeitura({ sexo: "macho", castrado: false })).toBe("Não");
    expect(textoCastradoSomenteLeitura({ sexo: "macho", castrado: null })).toBe("—");
    expect(
      textoCastradoSomenteLeitura({ sexo: "macho", castrado: false, temEventoCastracao: true }),
    ).toBe("Sim");
    expect(textoCastradoSomenteLeitura({ sexo: "femea", castrado: false })).toBeNull();
    expect(textoCastradoSomenteLeitura({ sexo: "femea", castrado: true })).toBeNull();
  });

  it("cadastro inicial: 3 estados, fêmea não persiste e troca de sexo limpa", () => {
    expect(deveMostrarCondicaoCastracaoCadastro("Macho")).toBe(true);
    expect(deveMostrarCondicaoCastracaoCadastro("Fêmea")).toBe(false);
    expect(resolverCastradoCadastroInicial({
      sexo: "macho",
      condicao: "nao_informado",
    })).toBeNull();
    expect(resolverCastradoCadastroInicial({
      sexo: "macho",
      condicao: "nao_castrado",
    })).toBe(false);
    expect(resolverCastradoCadastroInicial({
      sexo: "macho",
      condicao: "castrado",
    })).toBe(true);
    expect(resolverCastradoCadastroInicial({
      sexo: "femea",
      condicao: "castrado",
    })).toBeNull();
    expect(condicaoCastracaoAposTrocaSexo()).toBe("nao_informado");
    expect(condicaoCastracaoAtual({ sexo: "macho", castrado: null })).toBe("nao_informado");
    expect(condicaoCastracaoAtual({ sexo: "macho", castrado: false })).toBe("nao_castrado");
    expect(condicaoCastracaoAtual({ sexo: "macho", castrado: true })).toBe("castrado");
    expect(condicaoCastracaoAtual({ sexo: "femea", castrado: true })).toBeNull();
  });

  it("não persiste placeholder Opcional como observação", () => {
    expect(observacaoPersistivel("")).toBeUndefined();
    expect(observacaoPersistivel("   ")).toBeUndefined();
    expect(observacaoPersistivel("Opcional")).toBeUndefined();
    expect(observacaoPersistivel("opcional")).toBeUndefined();
    expect(observacaoPersistivel("Sem intercorrências.")).toBe("Sem intercorrências.");
    expect(montarPersistenciaCastracao({ metodo: "cirurgica", observacoes: "Opcional" }).observacoes)
      .toBeUndefined();
    expect(
      montarPersistenciaCastracao({ metodo: "cirurgica", observacoes: "Sem intercorrências." })
        .observacoes,
    ).toBe("Sem intercorrências.");
  });

  it("trata legado Opcional e vazios como traço no histórico", () => {
    expect(textoHistoricoOuTraco("")).toBe("—");
    expect(textoHistoricoOuTraco(null)).toBe("—");
    expect(textoHistoricoOuTraco("Opcional")).toBe("—");
    expect(textoHistoricoOuTraco("Não informado")).toBe("—");
    expect(textoHistoricoOuTraco("Selecione")).toBe("—");
    expect(textoHistoricoOuTraco("Sem intercorrências.")).toBe("Sem intercorrências.");
  });

  it("Castração na tabela Sanitário: Método em Detalhes e — em Dose/Via/Custo/obs vazia", () => {
    const semObs = celulasCastracaoNaTabelaSanitario({ medicamento: "Cirúrgica" });
    expect(semObs).toEqual({
      detalhes: "Método: Cirúrgica",
      dose: "—",
      via: "—",
      custo: "—",
      observacoes: "—",
    });

    const comObs = celulasCastracaoNaTabelaSanitario({
      medicamento: "Burdizzo",
      observacoes: "Sem intercorrências.",
    });
    expect(comObs.detalhes).toBe("Método: Burdizzo");
    expect(comObs.observacoes).toBe("Sem intercorrências.");

    const legadoOpcional = celulasCastracaoNaTabelaSanitario({
      medicamento: "Elastrador / anel",
      observacoes: "Opcional",
    });
    expect(legadoOpcional.observacoes).toBe("—");
  });

  it("tratamentos continuam mostrando o produto na coluna Detalhes", () => {
    expect(
      formatDetalhesColunaSanitario({ tipo: "Tratamento", medicamento: "Kinetomax" }),
    ).toBe("Kinetomax");
    expect(
      formatDetalhesColunaSanitario({ tipo: "Vacinação", medicamento: "Aftosa" }),
    ).toBe("Aftosa");
    expect(
      formatDetalhesColunaSanitario({ tipo: "Castração", medicamento: "Cirúrgica" }),
    ).toBe("Método: Cirúrgica");
  });
});
