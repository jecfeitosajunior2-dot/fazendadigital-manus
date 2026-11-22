import { TRPCError } from "@trpc/server";
import { isMarcaValidaParaTipo } from "../shared/maquina-types";
import {
  formatLeituraMedidorGravacao,
  isLinhaExemplo,
  isLinhaVazia,
  leituraInicialEhVaziaParaSemMedidor,
  normalizarCondicaoAquisicao,
  normalizarLinha,
  normalizarTipoMedidor,
  OBSERVACOES_MAX_CHARS,
  parseDataAquisicaoImportacao,
  parseLeituraMedidorImportacao,
  parseValorAquisicaoImportacao,
  TIPOS_MAQUINA,
  hojeISOLocal,
} from "../shared/importacaoMaquinarios";
import {
  maquinasOperacao,
  type LinhaImportacaoMaquina,
  type SessaoMaquina,
} from "./maquinasOperacao";

export type ErroLinhaImportacao = { linha: number; mensagem: string };

export function analisarPlanilhaParaImportar(linhas: Record<string, string>[]) {
  const tiposValidos = [...TIPOS_MAQUINA] as string[];
  const anoAtual = new Date().getFullYear();
  const hojeIso = hojeISOLocal();
  const prontas: LinhaImportacaoMaquina[] = [];
  const erros: ErroLinhaImportacao[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const linha = normalizarLinha(linhas[i] ?? {});
    const numLinha = i + 2;
    if (isLinhaVazia(linha) || isLinhaExemplo(linha)) continue;

    const nome = (linha.nome || "").trim();
    const tipo = (linha.tipo || "").trim();
    const marca = (linha.marca || "").trim();
    const tipoMedidor = normalizarTipoMedidor(linha.tipoMedidor || "");
    const leituraRaw = (linha.leituraInicial || "").trim();

    if (!nome || !tipo || !marca || !tipoMedidor) {
      erros.push({ linha: numLinha, mensagem: "Linha incompleta ou inválida. Valide a planilha novamente." });
      continue;
    }
    if (!tiposValidos.includes(tipo) || !isMarcaValidaParaTipo(tipo, marca)) {
      erros.push({ linha: numLinha, mensagem: "Tipo ou Marca inválidos. Valide a planilha novamente." });
      continue;
    }

    let ano: number | undefined;
    const anoRaw = (linha.ano || "").trim();
    if (anoRaw) {
      if (!/^\d{4}$/.test(anoRaw) || parseInt(anoRaw, 10) > anoAtual || parseInt(anoRaw, 10) < 1900) {
        erros.push({ linha: numLinha, mensagem: "Ano de fabricação inválido." });
        continue;
      }
      ano = parseInt(anoRaw, 10);
    }

    let dataAquisicao: string | undefined;
    const dataRaw = (linha.dataAquisicao || "").trim();
    if (dataRaw) {
      const parsed = parseDataAquisicaoImportacao(dataRaw);
      if (!parsed.ok || parsed.iso > hojeIso) {
        erros.push({ linha: numLinha, mensagem: "Data de aquisição inválida." });
        continue;
      }
      dataAquisicao = parsed.iso;
    }

    let estado = normalizarCondicaoAquisicao(linha.estado || "");
    if (linha.estado?.trim() && !estado) {
      erros.push({ linha: numLinha, mensagem: "Condição de aquisição inválida." });
      continue;
    }
    if (!estado) estado = "novo";

    let valor: string | undefined;
    const valorRaw = (linha.valor || "").trim();
    if (valorRaw) {
      const n = parseValorAquisicaoImportacao(valorRaw);
      if (n == null || Number.isNaN(n) || n < 0) {
        erros.push({ linha: numLinha, mensagem: "Valor de aquisição inválido." });
        continue;
      }
      valor = n.toFixed(2);
    }

    let vidaUtil: string | undefined;
    const vidaRaw = (linha.vidaUtil || "").trim();
    if (vidaRaw) {
      const vida = parseInt(vidaRaw.replace(/[^\d]/g, ""), 10);
      if (Number.isNaN(vida) || vida <= 0) {
        erros.push({ linha: numLinha, mensagem: "Vida útil inválida." });
        continue;
      }
      vidaUtil = String(vida);
    }

    let horimetro: string | undefined;
    if (tipoMedidor === "sem_medidor") {
      if (leituraRaw && !leituraInicialEhVaziaParaSemMedidor(leituraRaw)) {
        erros.push({ linha: numLinha, mensagem: "Leitura inicial deve ficar vazia para Sem medidor." });
        continue;
      }
    } else {
      if (!leituraRaw) {
        erros.push({ linha: numLinha, mensagem: "Leitura inicial obrigatória para o medidor informado." });
        continue;
      }
      const n = parseLeituraMedidorImportacao(leituraRaw);
      if (n == null) {
        erros.push({ linha: numLinha, mensagem: "Leitura inicial inválida." });
        continue;
      }
      horimetro = formatLeituraMedidorGravacao(n);
    }

    const obs = (linha.observacoes || "").trim();
    if (obs.length > OBSERVACOES_MAX_CHARS) {
      erros.push({ linha: numLinha, mensagem: "Observações excedem o limite permitido." });
      continue;
    }

    prontas.push({
      numLinha,
      nome,
      tipo,
      marca,
      modelo: (linha.modelo || "").trim() || null,
      placa: (linha.placa || "").trim() || null,
      ano: ano ?? null,
      dataAquisicao: dataAquisicao ?? null,
      estado,
      valor: valor ?? null,
      vidaUtil: vidaUtil ?? null,
      tipoMedidor,
      horimetro: horimetro ?? null,
      observacoes: obs || null,
    });
  }

  return { prontas, erros };
}

export function mensagemImportacaoBloqueada(erros: ErroLinhaImportacao[], semLinha: boolean) {
  if (erros.length > 0) {
    const primeira = erros[0];
    return `Importação bloqueada na linha ${primeira?.linha}. ${primeira?.mensagem} Nenhuma máquina foi importada.`;
  }
  if (semLinha) return "Nenhuma linha válida para importar. Nenhuma máquina foi importada.";
  return "Importação bloqueada. Nenhuma máquina foi importada.";
}

/** A planilha inteira entra numa transação, ou nenhuma máquina nova permanece. Não há chave de reenvio. */
export async function importarPlanilhaMaquinas(
  sessao: SessaoMaquina,
  fazendaId: number,
  linhas: Record<string, string>[],
) {
  const analise = analisarPlanilhaParaImportar(linhas);
  if (analise.erros.length > 0 || analise.prontas.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: mensagemImportacaoBloqueada(analise.erros, analise.prontas.length === 0),
    });
  }
  return maquinasOperacao.importarLote(sessao, fazendaId, analise.prontas);
}
