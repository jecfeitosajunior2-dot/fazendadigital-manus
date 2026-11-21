/**
 * Regras da planilha de animais que não dependem do arquivo local.
 * A tela pode mandar mapas de id; quem decide é este catálogo, lido no banco.
 * Cada linha gravada é a sua própria transação: uma linha ruim não apaga as que já entraram.
 * Dois funcionários diferentes ainda podem cadastrar o mesmo brinco ativo ao mesmo tempo
 * enquanto o índice animais_user_brinco_ativo_uq não existir. Por isso a importação
 * permanece parcial até essa proteção estar no banco.
 */

export const INDICE_BRINCO_ATIVO = "animais_user_brinco_ativo_uq";

/** Sem o índice, dois funcionários ainda conseguem gravar o mesmo brinco ativo. A importação fica recusada. */
export function decisaoImportacaoSemIndice(indiceExiste: boolean): "liberada" | "bloqueada" {
  return indiceExiste ? "liberada" : "bloqueada";
}

/** O SHOW INDEX do MySQL pode vir como linhas ou como o par [linhas, campos]. */
export function indiceBrincoAtivoPresente(resultado: unknown): boolean {
  if (Array.isArray(resultado) && Array.isArray(resultado[0])) return resultado[0].length > 0;
  return Array.isArray(resultado) && resultado.length > 0 && !Array.isArray(resultado[1]);
}

export type CatalogoImportacaoAnimal = {
  principal: boolean;
  fazendasAutorizadas: readonly number[];
  fazendas: readonly { id: number; nome: string }[];
  lotes: readonly { id: number; nome: string; fazendaId: number | null; ativo: boolean }[];
  pastos: readonly { id: number; nome: string; fazendaId: number | null }[];
};

export type ErroVinculoImportacao = {
  campo: "Fazenda" | "lote" | "Subdivisão";
  mensagem: string;
};

export type VinculoImportacaoAnimal =
  | { ok: true; fazendaId: number; loteId?: number; pastoId?: number }
  | { ok: false; campo: ErroVinculoImportacao["campo"]; mensagem: string };

function mesmoNome(valor: string, nome: string): boolean {
  return valor.toLowerCase().trim() === nome.toLowerCase().trim();
}

/** Fazenda, lote e pasto da linha, só entre o que o titular concedeu. */
export function errosDeVinculoImportacao(
  linha: { fazendaNome?: string; lote?: string; subdivisao?: string },
  catalogo: CatalogoImportacaoAnimal,
): { erros: ErroVinculoImportacao[]; fazendaId?: number; loteId?: number; pastoId?: number } {
  const erros: ErroVinculoImportacao[] = [];
  const autorizadas = new Set(catalogo.fazendasAutorizadas);
  const fazendas = catalogo.fazendas.filter((fazenda) => catalogo.principal || autorizadas.has(fazenda.id));
  const fazendaNome = (linha.fazendaNome || "").trim();
  let fazendaId: number | undefined;
  if (!fazendaNome) {
    erros.push({ campo: "Fazenda", mensagem: "Fazenda é obrigatória" });
  } else {
    const fazenda = fazendas.find((item) => mesmoNome(item.nome, fazendaNome));
    if (!fazenda) erros.push({ campo: "Fazenda", mensagem: `Fazenda não encontrada: "${fazendaNome}"` });
    else fazendaId = fazenda.id;
  }

  const loteNome = (linha.lote || "").trim();
  let loteId: number | undefined;
  if (loteNome) {
    const doNome = fazendaId == null
      ? []
      : catalogo.lotes.filter((lote) => lote.fazendaId === fazendaId && mesmoNome(lote.nome, loteNome));
    const ativo = doNome.find((lote) => lote.ativo);
    if (!ativo && doNome.length > 0) erros.push({ campo: "lote", mensagem: `Lote "${loteNome}" está inativo` });
    else if (!ativo) erros.push({ campo: "lote", mensagem: `Lote não encontrado: "${loteNome}"` });
    else loteId = ativo.id;
  }

  const pastoNome = (linha.subdivisao || "").trim();
  let pastoId: number | undefined;
  if (pastoNome) {
    const pasto = fazendaId == null
      ? undefined
      : catalogo.pastos.find((item) => item.fazendaId === fazendaId && mesmoNome(item.nome, pastoNome));
    if (!pasto) erros.push({ campo: "Subdivisão", mensagem: `Pasto/Subdivisão não encontrado: "${pastoNome}"` });
    else pastoId = pasto.id;
  }

  return { erros, fazendaId, loteId, pastoId };
}

export function resolverVinculosImportacao(
  linha: { fazendaNome?: string; lote?: string; subdivisao?: string },
  catalogo: CatalogoImportacaoAnimal,
): VinculoImportacaoAnimal {
  const resultado = errosDeVinculoImportacao(linha, catalogo);
  if (resultado.erros.length > 0 || resultado.fazendaId == null) {
    const erro = resultado.erros[0] ?? { campo: "Fazenda" as const, mensagem: "Fazenda é obrigatória" };
    return { ok: false, campo: erro.campo, mensagem: erro.mensagem };
  }
  return { ok: true, fazendaId: resultado.fazendaId, loteId: resultado.loteId, pastoId: resultado.pastoId };
}

/**
 * O histórico de um evento só aparece se toda fazenda marcada nele foi concedida.
 * Evento sem fazenda continua visível para quem já pode ver o animal.
 * A fazenda atual do animal não libera o histórico de outra fazenda.
 */
export function eventoHistoricoVisivel(
  evento: { fazendaOrigemId?: number | null; fazendaDestinoId?: number | null },
  fazendasAutorizadas: readonly number[],
  principal: boolean,
): boolean {
  if (principal) return true;
  const marcadas = [evento.fazendaOrigemId, evento.fazendaDestinoId].filter(
    (id): id is number => id != null,
  );
  if (marcadas.length === 0) return true;
  const concedidas = new Set(fazendasAutorizadas);
  return marcadas.every((id) => concedidas.has(id));
}

export type UsuarioTravadoImportacao = {
  id: number;
  papel: string;
  titularUserId: number;
  situacao: string;
  sessionVersion: number;
};

export type TransacaoImportacaoAnimal = {
  travarUsuario(id: number): Promise<UsuarioTravadoImportacao | null>;
  permissoes(userId: number, titularUserId: number): Promise<string[]>;
  fazendasDoVinculo(userId: number): Promise<number[]>;
  brincoAtivo(titularUserId: number, brinco: string): Promise<boolean>;
  rfidAtivo(titularUserId: number, rfid: string): Promise<boolean>;
  inserir(row: Record<string, unknown>): Promise<number>;
};

export type ResultadoImportacaoAnimal =
  | { ok: true; id: number }
  | { ok: false; motivo: "sem_identidade" | "sem_permissao" | "brinco_duplicado" | "rfid_duplicado" };

function erroDeIndiceUnico(error: unknown): boolean {
  const erro = error as { errno?: number; code?: string };
  return erro?.errno === 1062 || erro?.code === "ER_DUP_ENTRY";
}

/**
 * Trava primeiro quem executa e, se for funcionário, o titular em seguida.
 * A mesma ordem do cadastro individual evita inversão quando é a mesma pessoa.
 * Dois funcionários diferentes se encontram na linha do titular.
 */
export async function inserirAnimalImportadoNaTransacao(
  tx: TransacaoImportacaoAnimal,
  pedido: {
    executorId: number;
    titularUserId: number;
    sessionVersionDaSessao: number;
    fazendaId: number;
    brinco: string;
    brincoEletronico: string | null;
    status: string;
    row: Record<string, unknown>;
  },
): Promise<ResultadoImportacaoAnimal> {
  const executor = await tx.travarUsuario(pedido.executorId);
  if (!executor || executor.situacao !== "ativo" || executor.sessionVersion !== pedido.sessionVersionDaSessao) {
    return { ok: false, motivo: "sem_identidade" };
  }
  if (executor.papel !== "principal" && executor.titularUserId !== pedido.titularUserId) {
    return { ok: false, motivo: "sem_identidade" };
  }
  if (executor.papel !== "principal") {
    const permissoes = await tx.permissoes(executor.id, pedido.titularUserId);
    const fazendas = await tx.fazendasDoVinculo(executor.id);
    if (!permissoes.includes("animais.criar") || !fazendas.includes(pedido.fazendaId)) {
      return { ok: false, motivo: "sem_permissao" };
    }
  }
  if (executor.id !== pedido.titularUserId) {
    const titular = await tx.travarUsuario(pedido.titularUserId);
    if (!titular || titular.papel !== "principal" || titular.id !== pedido.titularUserId) {
      return { ok: false, motivo: "sem_identidade" };
    }
  }
  const ativo = pedido.status === "ativo";
  if (ativo && pedido.brinco.trim() && await tx.brincoAtivo(pedido.titularUserId, pedido.brinco)) {
    return { ok: false, motivo: "brinco_duplicado" };
  }
  if (ativo && pedido.brincoEletronico?.trim() && await tx.rfidAtivo(pedido.titularUserId, pedido.brincoEletronico)) {
    return { ok: false, motivo: "rfid_duplicado" };
  }
  try {
    const id = await tx.inserir({ ...pedido.row, userId: pedido.titularUserId });
    return { ok: true, id };
  } catch (error) {
    if (erroDeIndiceUnico(error)) return { ok: false, motivo: "brinco_duplicado" };
    throw error;
  }
}
