/**
 * Lançamento e estorno sanitário com o mesmo estoque de sempre.
 * A rota deixa de gravar com o usuário da sessão.
 * A conta do saldo continua em persistirManejoSanitarioNoTx e estornarManejoSanitarioNoTx.
 */
import { TRPCError } from "@trpc/server";
import { avaliarManejoVsBaixa } from "../shared/animalBaixa";
import { calcularQuantidadeEstoquePorDose } from "../client/src/lib/produto-types";
import { EstoqueCapitalError, custoMedioFonteTecnica } from "../shared/estoqueCapital";
import {
  MOTIVO_ESTORNO_SAUDE_PADRAO,
  MSG_SAUDE_NAO_ENCONTRADO,
} from "../shared/saudeEstoque";
import { formatCustoMedio, parseCustoMedio } from "./custoMedioEstoque";
import {
  estornarManejoSanitarioNoTx,
  persistirManejoSanitarioNoTx,
  SaudeEstoqueError,
  type PersistirManejoSanitarioInput,
  type SaudeEstoqueTx,
} from "./saudeEstoque";
import {
  autorizarOperacaoPersistida,
  type ConsultaAutorizacaoPersistida,
  type PedidoAutorizacaoPersistida,
} from "./cadastroAnimalAutorizado";
import type { MotivoOperacional } from "./contextoOperacional";
import {
  MSG_ANIMAL_MANEJO_AUSENTE,
  MSG_FAZENDA_ANIMAL_DIVERGENTE,
  MSG_SEM_FAZENDA_MANEJO,
  MSG_SEM_PERMISSAO_CASTRACAO,
} from "./registrarManejoAutorizado";

export const PERMISSAO_SAUDE_CRIAR = "saude.criar";
export const PERMISSAO_SAUDE_INATIVAR = "saude.inativar";
export const ORDEM_BLOQUEIO_SANIDADE =
  "espiar; lote; identidade; pasto; animal; lançamento; estoque; saldo e histórico";

export const MSG_SEM_PERMISSAO_ESTORNO_SAUDE =
  "Você não tem permissão para estornar o lançamento de saúde.";
export const MSG_ESTOQUE_INSUFICIENTE = "Estoque insuficiente para a quantidade informada.";
export const MSG_PRODUTO_OUTRA_FAZENDA = "O produto selecionado não pertence à Fazenda do manejo.";
export const MSG_CONFLITO_SANIDADE =
  "A gravação encontrou outra operação ao mesmo tempo. Tente novamente.";

const TENTATIVAS = 3;

export class ConflitoSanidadeEstoque extends Error {
  constructor() {
    super(MSG_CONFLITO_SANIDADE);
    this.name = "ConflitoSanidadeEstoque";
  }
}

class AnimalMudouDuranteSanidade extends Error {}

export type AnimalSanidadeLinha = {
  id: number;
  userId: number;
  fazendaId: number | null;
  loteId: number | null;
  pastoId: number | null;
  status: string | null;
};

export type EstoqueSanidadeLinha = {
  id: number;
  nome: string | null;
  quantidade: string | number | null;
  unidade: string | null;
  valorUnitario: string | number | null;
  valorTotalEstoque?: string | number | null;
  capitalInicializadoEm?: Date | string | null;
  fazendaId: number | null;
  categoria: string | null;
  situacao: string | null;
  embalagens: string | null;
};

export type RegistroSanidadeResumo = {
  id: number;
  userId: number;
  animalId: number;
  estoqueId: number | null;
  status: string | null;
};

export type ConsultaSanidade = ConsultaAutorizacaoPersistida & SaudeEstoqueTx & {
  lote(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  pasto(id: number): Promise<{ id: number; userId: number; fazendaId: number | null } | null>;
  espiarAnimal(id: number): Promise<AnimalSanidadeLinha | null>;
  animal(id: number, titularUserId: number): Promise<AnimalSanidadeLinha | null>;
  baixaAtiva(animalId: number): Promise<{ dataBaixa: string | null } | null>;
  espiarEstoque(id: number): Promise<EstoqueSanidadeLinha | null>;
  travarEstoque(id: number): Promise<EstoqueSanidadeLinha | null>;
  espiarRegistro(id: number): Promise<RegistroSanidadeResumo | null>;
  travarRegistro(id: number): Promise<void>;
};

export type IoSanidade = {
  emTransacao<T>(fn: (tx: ConsultaSanidade) => Promise<T>): Promise<T>;
  aposIdentidade?: () => Promise<void>;
  aposRegistro?: () => Promise<void>;
};

type PedidoBase = Omit<PedidoAutorizacaoPersistida, "permissaoId" | "fazendaId"> & {
  executorNome?: string | null;
};

export type PedidoSanidade = PedidoBase & {
  input: {
    animalId: number;
    fazendaId: number;
    tipo: string;
    descricao?: string | null;
    medicamento?: string | null;
    dosagem?: string | null;
    doseValor?: string | null;
    doseUnidade?: string | null;
    viaAplicacao?: string | null;
    estoqueId?: number | null;
    veterinario?: string | null;
    dataRegistro: string;
    proximaData?: string | null;
    observacoes?: string | null;
  };
};

export type PedidoEstornoSanidade = PedidoBase & {
  input: { id: number; motivo?: string | null };
  hojeISO: string;
};

export type MotivoSanidade =
  | MotivoOperacional
  | "nao_encontrado"
  | "animal_invalido"
  | "conflito";

export type RecusaSanidade = { ok: false; motivo: MotivoSanidade; mensagem?: string };
export type SucessoSanidade = {
  ok: true;
  id: number;
  userId: number;
  executorUserId: number;
  movimentacaoId: number | null;
};

function recusa(motivo: MotivoSanidade, mensagem?: string): RecusaSanidade {
  return mensagem ? { ok: false, motivo, mensagem } : { ok: false, motivo };
}

function ehDeadlock(erro: unknown): boolean {
  const visto = new Set<unknown>();
  let atual: unknown = erro;
  while (atual && typeof atual === "object" && !visto.has(atual)) {
    visto.add(atual);
    const candidato = atual as { errno?: number; code?: string; cause?: unknown };
    if (candidato.errno === 1213 || candidato.code === "ER_LOCK_DEADLOCK") return true;
    atual = candidato.cause;
  }
  return false;
}

async function repetir<T>(operacao: () => Promise<T>): Promise<T> {
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa += 1) {
    try {
      return await operacao();
    } catch (erro) {
      if (erro instanceof AnimalMudouDuranteSanidade || ehDeadlock(erro)) continue;
      throw erro;
    }
  }
  throw new ConflitoSanidadeEstoque();
}

function mudou(antes: AnimalSanidadeLinha, depois: AnimalSanidadeLinha): boolean {
  return antes.loteId !== depois.loteId
    || antes.pastoId !== depois.pastoId
    || antes.fazendaId !== depois.fazendaId
    || antes.status !== depois.status;
}

function dataCivil(valor: string): { ok: true; dataISO: string } | { ok: false; message: string } {
  const dataISO = valor.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    return { ok: false, message: "Data do manejo sanitário inválida." };
  }
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (dataISO > hojeISO) {
    return { ok: false, message: "A data do manejo sanitário não pode ser futura." };
  }
  return { ok: true, dataISO };
}

function doseNumero(valor: string): number {
  let normalized = valor;
  if (valor.includes(",")) normalized = valor.replace(/\./g, "").replace(",", ".");
  return Number(normalized);
}

async function travarAnimal(
  tx: ConsultaSanidade,
  io: IoSanidade,
  pedido: PedidoBase,
  animalId: number,
  permissaoId: string,
  fazendasExtras: number[] = [],
): Promise<{ titularUserId: number; executorUserId: number; animal: AnimalSanidadeLinha } | RecusaSanidade> {
  const antes = await tx.espiarAnimal(animalId);
  if (!antes) return recusa("nao_encontrado", MSG_ANIMAL_MANEJO_AUSENTE);
  if (antes.loteId != null) await tx.lote(antes.loteId);
  if (antes.fazendaId == null) return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  const fazendas = [...new Set([antes.fazendaId, ...fazendasExtras])].sort((a, b) => a - b);
  let executorUserId = 0;
  let titularUserId = 0;
  for (const fazendaId of fazendas) {
    const decisao = await autorizarOperacaoPersistida(tx, { ...pedido, permissaoId, fazendaId });
    if (!decisao.ok) {
      if (decisao.motivo === "sem_fazenda") return recusa(decisao.motivo, MSG_SEM_FAZENDA_MANEJO);
      return recusa(decisao.motivo);
    }
    executorUserId = decisao.contexto.executorUserId;
    titularUserId = decisao.contexto.titularUserId;
  }
  await io.aposIdentidade?.();
  if (antes.pastoId != null) await tx.pasto(antes.pastoId);
  const animal = await tx.animal(animalId, titularUserId);
  if (!animal) return recusa("nao_encontrado", MSG_ANIMAL_MANEJO_AUSENTE);
  if (mudou(antes, animal)) throw new AnimalMudouDuranteSanidade();
  return { titularUserId, executorUserId, animal };
}

function montarConsumo(item: EstoqueSanidadeLinha, pedido: PedidoSanidade["input"], fazendaId: number) {
  if (Number(item.fazendaId) !== Number(fazendaId)) {
    return recusa("animal_invalido", MSG_PRODUTO_OUTRA_FAZENDA);
  }
  const situacao = String(item.situacao || "ativo").toLowerCase();
  if (situacao === "inativo") {
    return recusa("animal_invalido", "O produto selecionado está inativo no estoque.");
  }
  if (String(item.categoria || "").trim().toLowerCase() !== "farmácia") {
    return recusa("animal_invalido", "Selecione um produto da categoria Farmácia.");
  }
  const custoMedio = custoMedioFonteTecnica(item) ?? parseCustoMedio(item.valorUnitario);
  if (custoMedio == null) {
    return recusa(
      "animal_invalido",
      "Este produto ainda não possui custo médio no estoque. Registre uma entrada com valor antes de usá-lo no manejo sanitário.",
    );
  }
  const doseValorRaw = (pedido.doseValor ?? "").trim();
  const doseUnidadeRaw = (pedido.doseUnidade ?? "").trim();
  if (!doseValorRaw || !doseUnidadeRaw) {
    return recusa("animal_invalido", "Informe a dose (valor e unidade) para baixar o estoque.");
  }
  const doseNum = doseNumero(doseValorRaw);
  if (!Number.isFinite(doseNum) || doseNum <= 0) {
    return recusa("animal_invalido", "Informe um valor de dose válido maior que zero.");
  }
  const conv = calcularQuantidadeEstoquePorDose({
    doseValor: doseNum,
    doseUnidade: doseUnidadeRaw,
    unidadeEstoque: item.unidade,
    embalagensRaw: item.embalagens,
  });
  if ("erro" in conv) return recusa("animal_invalido", conv.erro);
  const qtd = Math.round(conv.quantidade * 10000) / 10000;
  const disponivel = parseFloat(String(item.quantidade ?? 0));
  if (!Number.isFinite(disponivel) || qtd > disponivel + 1e-9) {
    return recusa("animal_invalido", MSG_ESTOQUE_INSUFICIENTE);
  }
  const dosagemTexto = (pedido.dosagem ?? "").trim();
  const custoTotal = Math.round(qtd * custoMedio * 100) / 100;
  return {
    ok: true as const,
    medicamento: (item.nome || "").trim() || (pedido.medicamento ?? "").trim() || undefined,
    dosagem: dosagemTexto || `${Number.isInteger(doseNum) ? String(doseNum) : String(doseNum).replace(".", ",")} ${doseUnidadeRaw}`,
    quantidadeConsumo: String(qtd),
    valorUnitario: formatCustoMedio(custoMedio),
    custo: formatCustoMedio(custoTotal),
    unidadeEstoque: item.unidade,
  };
}

async function lancarNaTransacao(
  tx: ConsultaSanidade,
  io: IoSanidade,
  pedido: PedidoSanidade,
  dataISO: string,
): Promise<SucessoSanidade | RecusaSanidade> {
  const estoqueId = pedido.input.estoqueId ?? null;
  const produto = estoqueId == null ? null : await tx.espiarEstoque(estoqueId);
  if (estoqueId != null && !produto) {
    return recusa("animal_invalido", "Produto de estoque não encontrado. Atualize a lista e tente novamente.");
  }
  const fazendaProduto = produto?.fazendaId != null ? Number(produto.fazendaId) : null;
  const trava = await travarAnimal(
    tx,
    io,
    pedido,
    pedido.input.animalId,
    PERMISSAO_SAUDE_CRIAR,
    fazendaProduto != null && fazendaProduto !== 0 ? [fazendaProduto] : [],
  );
  if ("ok" in trava) return trava;
  if (trava.animal.fazendaId !== pedido.input.fazendaId) {
    return recusa("animal_invalido", MSG_FAZENDA_ANIMAL_DIVERGENTE);
  }
  const baixa = await tx.baixaAtiva(trava.animal.id);
  const manejo = avaliarManejoVsBaixa({
    status: trava.animal.status,
    dataBaixa: baixa?.dataBaixa,
    dataEvento: dataISO,
  });
  if (!manejo.permitido) return recusa("animal_invalido", manejo.mensagem);
  const tipo = pedido.input.tipo.trim();
  const descricao = (pedido.input.descricao ?? "").trim() || undefined;
  let medicamento = (pedido.input.medicamento ?? "").trim() || undefined;
  let dosagem = (pedido.input.dosagem ?? "").trim() || undefined;
  let quantidadeConsumo: string | undefined;
  let valorUnitario: string | undefined;
  let custoPrevisto: string | undefined;
  let unidadeEstoque: string | null | undefined;
  if (estoqueId != null) {
    const travado = await tx.travarEstoque(estoqueId);
    if (!travado) {
      return recusa("animal_invalido", "Produto de estoque não encontrado. Atualize a lista e tente novamente.");
    }
    const consumo = montarConsumo(travado, pedido.input, trava.animal.fazendaId!);
    if (!consumo.ok) return consumo;
    medicamento = consumo.medicamento;
    dosagem = consumo.dosagem;
    quantidadeConsumo = consumo.quantidadeConsumo;
    valorUnitario = consumo.valorUnitario;
    custoPrevisto = consumo.custo;
    unidadeEstoque = consumo.unidadeEstoque;
  }
  const registradoPor = pedido.executorNome?.trim() || `user-${pedido.executorId}`;
  const persistido = await persistirManejoSanitarioNoTx(tx, {
    userId: trava.titularUserId,
    registradoPor,
    animalId: trava.animal.id,
    fazendaId: trava.animal.fazendaId!,
    tipo,
    descricao,
    medicamento,
    dosagem,
    viaAplicacao: (pedido.input.viaAplicacao ?? "").trim() || undefined,
    veterinario: (pedido.input.veterinario ?? "").trim() || undefined,
    estoqueId,
    quantidadeConsumo,
    valorUnitario,
    custoPrevisto,
    dataRegistro: dataISO,
    proximaData: pedido.input.proximaData ?? undefined,
    observacoes: (pedido.input.observacoes ?? "").trim() || undefined,
    unidadeEstoque,
  } satisfies PersistirManejoSanitarioInput);
  await io.aposRegistro?.();
  return {
    ok: true,
    id: persistido.id,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
    movimentacaoId: persistido.movimentacaoId,
  };
}

function previaLancamento(input: PedidoSanidade["input"]): { ok: true; dataISO: string } | RecusaSanidade {
  const data = dataCivil(input.dataRegistro);
  if (!data.ok) return recusa("animal_invalido", data.message);
  const tipo = input.tipo.trim();
  if (!tipo) return recusa("animal_invalido", "Informe o tipo de manejo sanitário.");
  const descricao = (input.descricao ?? "").trim();
  if (tipo === "Outro" && !descricao) return recusa("animal_invalido", "Descreva o manejo sanitário.");
  if (tipo !== "Outro" && input.estoqueId == null) {
    return recusa("animal_invalido", "Selecione um produto / medicamento do estoque da Fazenda.");
  }
  return { ok: true, dataISO: data.dataISO };
}

export async function lancarSanidadeAutorizado(
  io: IoSanidade,
  pedido: PedidoSanidade,
): Promise<SucessoSanidade | RecusaSanidade> {
  const previa = previaLancamento(pedido.input);
  if (!previa.ok) return previa;
  try {
    return await repetir(() => io.emTransacao((tx) => lancarNaTransacao(tx, io, pedido, previa.dataISO)));
  } catch (erro) {
    if (erro instanceof ConflitoSanidadeEstoque) return recusa("conflito", erro.message);
    if (erro instanceof SaudeEstoqueError || erro instanceof EstoqueCapitalError) {
      return recusa("animal_invalido", erro.message);
    }
    throw erro;
  }
}

export async function lancarSanidadeEEspelhar(
  io: IoSanidade,
  pedido: PedidoSanidade,
  espelho: { lancar(userId: number, dados: Record<string, unknown>): Promise<void> },
): Promise<SucessoSanidade | RecusaSanidade> {
  const resultado = await lancarSanidadeAutorizado(io, pedido);
  if (!resultado.ok) return resultado;
  try {
    await espelho.lancar(resultado.userId, {
      animalId: pedido.input.animalId,
      tipo: pedido.input.tipo.trim(),
      descricao: (pedido.input.descricao ?? "").trim() || undefined,
      dataRegistro: pedido.input.dataRegistro.trim().slice(0, 10),
      proximaData: pedido.input.proximaData ?? undefined,
      observacoes: (pedido.input.observacoes ?? "").trim() || undefined,
    });
  } catch (erro) {
    console.warn("[saude.create] espelho fora", erro);
  }
  return resultado;
}

async function estornarNaTransacao(
  tx: ConsultaSanidade,
  io: IoSanidade,
  pedido: PedidoEstornoSanidade,
): Promise<SucessoSanidade | RecusaSanidade> {
  const resumo = await tx.espiarRegistro(pedido.input.id);
  if (!resumo) return recusa("nao_encontrado", MSG_SAUDE_NAO_ENCONTRADO);
  const produto = resumo.estoqueId == null ? null : await tx.espiarEstoque(resumo.estoqueId);
  const fazendaProduto = produto?.fazendaId != null ? Number(produto.fazendaId) : null;
  const trava = await travarAnimal(
    tx,
    io,
    pedido,
    resumo.animalId,
    PERMISSAO_SAUDE_INATIVAR,
    fazendaProduto != null && fazendaProduto !== 0 ? [fazendaProduto] : [],
  );
  if ("ok" in trava) return trava;
  if (resumo.userId !== trava.titularUserId) return recusa("nao_encontrado", MSG_SAUDE_NAO_ENCONTRADO);
  await tx.travarRegistro(resumo.id);
  if (resumo.estoqueId != null) await tx.travarEstoque(resumo.estoqueId);
  const registradoPor = pedido.executorNome?.trim() || `user-${pedido.executorId}`;
  const estorno = await estornarManejoSanitarioNoTx(tx, {
    userId: trava.titularUserId,
    registradoPor,
    id: resumo.id,
    motivo: pedido.input.motivo?.trim() || MOTIVO_ESTORNO_SAUDE_PADRAO,
    hojeISO: pedido.hojeISO,
  });
  await io.aposRegistro?.();
  return {
    ok: true,
    id: estorno.id,
    userId: trava.titularUserId,
    executorUserId: trava.executorUserId,
    movimentacaoId: estorno.movimentacaoEstornoId,
  };
}

export async function estornarSanidadeAutorizado(
  io: IoSanidade,
  pedido: PedidoEstornoSanidade,
): Promise<SucessoSanidade | RecusaSanidade> {
  try {
    return await repetir(() => io.emTransacao((tx) => estornarNaTransacao(tx, io, pedido)));
  } catch (erro) {
    if (erro instanceof ConflitoSanidadeEstoque) return recusa("conflito", erro.message);
    if (erro instanceof SaudeEstoqueError || erro instanceof EstoqueCapitalError) {
      return recusa("animal_invalido", erro.message);
    }
    throw erro;
  }
}

function erroComum(resultado: RecusaSanidade, semPermissao: string): TRPCError {
  switch (resultado.motivo) {
    case "sem_identidade":
      return new TRPCError({ code: "UNAUTHORIZED", message: "Sessão inválida." });
    case "sem_permissao":
    case "reservado_ao_principal":
      return new TRPCError({ code: "FORBIDDEN", message: semPermissao });
    case "sem_fazenda":
      return new TRPCError({ code: "FORBIDDEN", message: MSG_SEM_FAZENDA_MANEJO });
    case "nao_encontrado":
    case "outro_titular":
    case "fazenda_inexistente":
      return new TRPCError({ code: "NOT_FOUND", message: resultado.mensagem ?? MSG_ANIMAL_MANEJO_AUSENTE });
    case "conflito":
      return new TRPCError({ code: "CONFLICT", message: resultado.mensagem ?? MSG_CONFLITO_SANIDADE });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: resultado.mensagem ?? "Não foi possível gravar o manejo sanitário." });
  }
}

export function erroLancamentoSanidade(resultado: RecusaSanidade): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_CASTRACAO);
}

export function erroEstornoSanidade(resultado: RecusaSanidade): TRPCError {
  return erroComum(resultado, MSG_SEM_PERMISSAO_ESTORNO_SAUDE);
}
