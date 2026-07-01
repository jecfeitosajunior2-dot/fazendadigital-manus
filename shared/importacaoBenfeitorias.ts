/**
 * Importação/exportação de benfeitorias — alinhada à listagem e ao cadastro.
 * Ordem: Fazenda → Nome → Ano de Construção → Vida Útil → Valor → Observações
 */

import { BENFEITORIA_LISTAGEM_COLUNAS } from "./benfeitoriaCampos";

export interface ColunaImportacao {
  key: string;
  label: string;
  obrigatorio: boolean;
  descricao: string;
  exemplo: string;
  largura: number;
}

const COLUNA_FAZENDA: ColunaImportacao = {
  key: "fazendaNome",
  label: "Fazenda",
  obrigatorio: true,
  largura: 22,
  descricao: "Nome exato da fazenda cadastrada no sistema",
  exemplo: "Fazenda Volta Grande",
};

const COLUNA_OBSERVACOES: ColunaImportacao = {
  key: "observacoes",
  label: "Observações",
  obrigatorio: false,
  largura: 28,
  descricao: "Observações adicionais",
  exemplo: "",
};

const COLUNAS_DADOS: ColunaImportacao[] = BENFEITORIA_LISTAGEM_COLUNAS.map(col => ({
  key: col.key,
  label: col.label,
  obrigatorio: col.key === "nome" || col.key === "anoConstrucao",
  largura: col.key === "nome" ? 24 : col.key === "anoConstrucao" ? 14 : col.key === "valor" ? 14 : 12,
  descricao:
    col.key === "nome"
      ? "Nome da benfeitoria"
      : col.key === "anoConstrucao"
        ? "Ano de construção (4 dígitos)"
        : col.key === "vidaUtil"
          ? "Vida útil estimada em anos"
          : col.key === "valor"
            ? "Valor estimado em reais"
            : "",
  exemplo:
    col.key === "nome"
      ? "Galpão de Máquinas"
      : col.key === "anoConstrucao"
        ? "2020"
        : col.key === "vidaUtil"
          ? "15"
          : col.key === "valor"
            ? "150.000,00"
            : "",
}));

export const COLUNAS_IMPORTACAO: ColunaImportacao[] = [
  COLUNA_FAZENDA,
  ...COLUNAS_DADOS,
  COLUNA_OBSERVACOES,
];

export function normalizarCabecalho(texto: string): string {
  return (texto || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export const CABECALHO_PARA_CHAVE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const col of COLUNAS_IMPORTACAO) {
    map[normalizarCabecalho(col.label)] = col.key;
    map[normalizarCabecalho(col.key)] = col.key;
  }
  const aliases: Record<string, string> = {
    benfeitoria: "nome",
    nome: "nome",
    nomebenfeitoria: "nome",
    fazenda: "fazendaNome",
    fazendanome: "fazendaNome",
    anoconstrucao: "anoConstrucao",
    ano: "anoConstrucao",
    anodeconstrucao: "anoConstrucao",
    vidautil: "vidaUtil",
    valorrs: "valor",
    valorestimado: "valor",
    observacoes: "observacoes",
    observacao: "observacoes",
  };
  for (const [k, v] of Object.entries(aliases)) {
    map[normalizarCabecalho(k)] = v;
  }
  return map;
})();

export function normalizarLinha(linhaOriginal: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [cabecalho, valor] of Object.entries(linhaOriginal)) {
    const chaveNorm = normalizarCabecalho(cabecalho);
    const chaveInterna = CABECALHO_PARA_CHAVE[chaveNorm];
    if (chaveInterna) {
      out[chaveInterna] = (valor ?? "").toString().trim();
    }
  }
  return out;
}

export const EXEMPLO_NOME = "Galpão de Máquinas";
export const EXEMPLO_FAZENDA = "Fazenda Volta Grande";
export const EXEMPLO_ANO = "2020";

export function isLinhaExemplo(linha: Record<string, string>): boolean {
  const nome = (linha.nome ?? "").trim().toLowerCase();
  const fazenda = (linha.fazendaNome ?? "").trim().toLowerCase();
  const ano = (linha.anoConstrucao ?? "").trim();
  return (
    nome === EXEMPLO_NOME.toLowerCase() &&
    fazenda === EXEMPLO_FAZENDA.toLowerCase() &&
    ano === EXEMPLO_ANO
  );
}

export { parseMoedaBr as parseValorImport } from "./parseMoedaBr";

/** Cabeçalhos na mesma ordem da lista visível. */
export const EXPORT_HEADERS = BENFEITORIA_LISTAGEM_COLUNAS.map(c => c.label);

/** Índice da coluna Valor para alinhamento à direita na exportação PDF. */
export const EXPORT_VALOR_COL_INDEX = BENFEITORIA_LISTAGEM_COLUNAS.findIndex(c => c.key === "valor");
