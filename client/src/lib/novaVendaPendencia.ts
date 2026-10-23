/**
 * Controle de confirmação pendente da Nova Venda.
 * Prepara chave ven-, persistência e retry. Não chama rota integrada nem vendas.confirmar.
 */
import {
  assinaturaIntencaoConfirmacaoVenda,
  retryConfirmacaoVendaBateComPedido,
  validarChaveIdempotenciaVenda,
  type IntencaoConfirmacaoVendaFinanceiro,
} from "@shared/vendaFinanceiro";

export const PREFIXO_PENDENCIA_VENDA_V1 = "fd.finv2.venpend.v1";
export const PREFIXO_PENDENCIA_VENDA = "fd.finv2.venpend.v2";
export const CHAVE_ABA_PENDENCIA_VENDA = "fd.finv2.venpend.aba";
export const CANAL_PENDENCIA_VENDA = "fd.finv2.venpend.v2";
export const INTEGRACAO_CONFIRMACAO_VENDA_ATIVA = false;
export const ROTULO_VERIFICAR_CONFIRMACAO = "Verificar confirmação";

export const MSG_VENDA_PENDENCIA_DESCONHECIDA =
  "Não foi possível confirmar se a venda foi gravada. A chave e os dados desta tentativa foram preservados. Não inicie outra venda com a mesma chave.";
export const MSG_VENDA_PENDENCIA_TRAVADA =
  "Esta tentativa ficou travada com comprador, animais, preços e condição originais até o resultado oficial.";
export const MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO =
  "A verificação da confirmação fica pronta para a rota integrada, ainda não ligada. A rota comercial atual não é repetida.";
export const MSG_VENDA_PENDENCIA_OUTRO_USUARIO =
  "A tentativa pendente pertence a outro usuário e não pode ser recuperada nesta sessão.";
export const MSG_VENDA_PENDENCIA_OUTRA_ABA =
  "Outra aba já está tratando esta mesma tentativa. A chave e o payload originais foram preservados.";

export type EstadoTentativaConfirmacaoVenda =
  | "pronto"
  | "enviando"
  | "desconhecido"
  | "confirmado"
  | "erro_definitivo";

const ESTADOS_CONHECIDOS = new Set<string>([
  "pronto",
  "enviando",
  "desconhecido",
  "confirmado",
  "erro_definitivo",
]);

export type PayloadConfirmacaoVendaIntegrada = IntencaoConfirmacaoVendaFinanceiro & {
  idempotencyKey: string;
};

export type TentativaConfirmacaoVenda = {
  idempotencyKey: string;
  userId: number;
  intencao: IntencaoConfirmacaoVendaFinanceiro;
  assinatura: string;
  criadoEm: string;
  estado: EstadoTentativaConfirmacaoVenda | string;
  abaToken: string;
  vendaId?: number | null;
  tituloId?: number | null;
  atualizadoEm?: string;
};

export type DocumentoPendenciaVenda = {
  versao: 1;
  userId: number;
  tentativas: TentativaConfirmacaoVenda[];
};

export type RegistroPendenciaVendaV2 = TentativaConfirmacaoVenda & {
  versao: 2;
};

export type ArmazenamentoPendenciaVenda = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  keys?(): string[];
  get length(): number;
};

export type ResultadoLockPendenciaVenda<T> =
  | { ok: true; valor: T }
  | { ok: false; motivo: "outra_aba" };

export type CoordenacaoPendenciaVenda = {
  executarExclusivo<T>(
    nome: string,
    trabalho: () => T | Promise<T>,
  ): Promise<ResultadoLockPendenciaVenda<T>>;
};

export type WebLocksPendenciaVenda = {
  request(
    nome: string,
    opcoes: { ifAvailable: boolean; mode: "exclusive" },
    callback: (lock: { name: string } | null) => Promise<unknown> | unknown,
  ): Promise<unknown>;
};

export function criarArmazenamentoPendenciaVendaMemoria(
  inicial: Record<string, string> = {},
): ArmazenamentoPendenciaVenda {
  const mapa = new Map(Object.entries(inicial));
  const storage: ArmazenamentoPendenciaVenda = {
    getItem: chave => mapa.get(chave) ?? null,
    setItem: (chave, valor) => { mapa.set(chave, valor); },
    removeItem: chave => { mapa.delete(chave); },
    key: index => [...mapa.keys()][index] ?? null,
    keys: () => [...mapa.keys()],
    get length() { return mapa.size; },
  };
  return storage;
}

export function criarCoordenacaoPendenciaVendaMemoria(
  ocupadas: Set<string> = new Set(),
): CoordenacaoPendenciaVenda {
  return {
    async executarExclusivo(nome, trabalho) {
      if (ocupadas.has(nome)) return { ok: false, motivo: "outra_aba" };
      ocupadas.add(nome);
      try {
        return { ok: true, valor: await trabalho() };
      } finally {
        ocupadas.delete(nome);
      }
    },
  };
}

export function criarCoordenacaoPendenciaVendaWebLocks(
  locks: WebLocksPendenciaVenda,
): CoordenacaoPendenciaVenda {
  return {
    async executarExclusivo(nome, trabalho) {
      let indisponivel = false;
      const valor = await locks.request(nome, { ifAvailable: true, mode: "exclusive" }, async lock => {
        if (!lock) {
          indisponivel = true;
          return undefined;
        }
        return await trabalho();
      });
      if (indisponivel) return { ok: false, motivo: "outra_aba" };
      return { ok: true, valor: valor as Awaited<ReturnType<typeof trabalho>> };
    },
  };
}

export function armazenamentoPendenciaVendaPadrao(): ArmazenamentoPendenciaVenda {
  try {
    if (typeof localStorage === "undefined") return criarArmazenamentoPendenciaVendaMemoria();
    return {
      getItem: chave => localStorage.getItem(chave),
      setItem: (chave, valor) => { localStorage.setItem(chave, valor); },
      removeItem: chave => { localStorage.removeItem(chave); },
      key: index => localStorage.key(index),
      keys: () => {
        const chaves: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const chave = localStorage.key(i);
          if (chave) chaves.push(chave);
        }
        return chaves;
      },
      get length() { return localStorage.length; },
    };
  } catch {
    return criarArmazenamentoPendenciaVendaMemoria();
  }
}

export function coordenacaoPendenciaVendaPadrao(): CoordenacaoPendenciaVenda {
  const webLocks = typeof navigator !== "undefined"
    ? (navigator as Navigator & { locks?: WebLocksPendenciaVenda }).locks
    : undefined;
  if (webLocks && typeof webLocks.request === "function") {
    return criarCoordenacaoPendenciaVendaWebLocks(webLocks);
  }
  return criarCoordenacaoPendenciaVendaMemoria();
}

export function chaveArmazenamentoPendenciaVendaV1(userId: number): string {
  return `${PREFIXO_PENDENCIA_VENDA_V1}:${userId}`;
}

export function chaveArmazenamentoPendenciaVenda(userId: number): string {
  return chaveArmazenamentoPendenciaVendaV1(userId);
}

export function chaveArmazenamentoPendenciaVendaTentativa(userId: number, idempotencyKey: string): string {
  return `${PREFIXO_PENDENCIA_VENDA}:${userId}:${idempotencyKey}`;
}

export function nomeLockPendenciaVenda(userId: number, idempotencyKey: string): string {
  return `${PREFIXO_PENDENCIA_VENDA}:lock:${userId}:${idempotencyKey}`;
}

export function nomeLockMigracaoPendenciaVenda(userId: number): string {
  return `${PREFIXO_PENDENCIA_VENDA}:lock:migracao:${userId}`;
}

export function novaChaveIdempotenciaVenda(gerarUuid: () => string = gerarUuidVenda): string {
  const bruto = String(gerarUuid()).replace(/-/g, "");
  return `ven-${bruto}`.slice(0, 80);
}

function gerarUuidVenda(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

export function abaTokenPendenciaVenda(
  sessao: ArmazenamentoPendenciaVenda = criarArmazenamentoPendenciaVendaMemoria(),
  gerarUuid: () => string = gerarUuidVenda,
): string {
  const atual = sessao.getItem(CHAVE_ABA_PENDENCIA_VENDA);
  if (atual) return atual;
  const token = String(gerarUuid());
  sessao.setItem(CHAVE_ABA_PENDENCIA_VENDA, token);
  return token;
}

export function estadoExigePreservarTentativa(estado: string): boolean {
  return estado === "enviando" || estado === "desconhecido" || !ESTADOS_CONHECIDOS.has(estado);
}

export function vendaResultadoDesconhecido(input: { codigo?: string; mensagem?: string }): boolean {
  const codigo = input.codigo?.trim();
  if (codigo === "BAD_REQUEST" || codigo === "NOT_FOUND" || codigo === "FORBIDDEN" || codigo === "UNAUTHORIZED") {
    return false;
  }
  if (!codigo) return true;
  return codigo === "TIMEOUT" || codigo === "CLIENT_CLOSED_REQUEST" || codigo === "INTERNAL_SERVER_ERROR";
}

export function vendaRecusaDefinitiva(codigo?: string): boolean {
  return codigo === "BAD_REQUEST" || codigo === "NOT_FOUND" || codigo === "FORBIDDEN" || codigo === "UNAUTHORIZED";
}

function chavesDoArmazenamento(storage: ArmazenamentoPendenciaVenda): string[] {
  if (typeof storage.keys === "function") return storage.keys();
  const chaves: string[] = [];
  const total = Number(storage.length ?? 0);
  if (typeof storage.key === "function" && total > 0) {
    for (let i = 0; i < total; i++) {
      const chave = storage.key(i);
      if (chave) chaves.push(chave);
    }
  }
  return chaves;
}

function prefixoUsuarioV2(userId: number): string {
  return `${PREFIXO_PENDENCIA_VENDA}:${userId}:`;
}

function parseTentativa(bruto: string | null, userId: number): TentativaConfirmacaoVenda | null {
  if (!bruto) return null;
  try {
    const lido = JSON.parse(bruto) as Partial<RegistroPendenciaVendaV2>;
    if (!lido || lido.userId !== userId) return null;
    if (!lido.idempotencyKey || !validarChaveIdempotenciaVenda(lido.idempotencyKey).ok) return null;
    if (!lido.intencao || !lido.assinatura || !lido.criadoEm || !lido.estado || !lido.abaToken) return null;
    return {
      idempotencyKey: lido.idempotencyKey,
      userId: lido.userId,
      intencao: lido.intencao,
      assinatura: lido.assinatura,
      criadoEm: lido.criadoEm,
      estado: String(lido.estado),
      abaToken: lido.abaToken,
      vendaId: lido.vendaId ?? null,
      tituloId: lido.tituloId ?? null,
      atualizadoEm: lido.atualizadoEm,
    };
  } catch {
    return null;
  }
}

function serializarTentativa(tentativa: TentativaConfirmacaoVenda): string {
  const registro: RegistroPendenciaVendaV2 = {
    versao: 2,
    idempotencyKey: tentativa.idempotencyKey,
    userId: tentativa.userId,
    intencao: tentativa.intencao,
    assinatura: tentativa.assinatura,
    criadoEm: tentativa.criadoEm,
    estado: tentativa.estado,
    abaToken: tentativa.abaToken,
    vendaId: tentativa.vendaId ?? null,
    tituloId: tentativa.tituloId ?? null,
    atualizadoEm: tentativa.atualizadoEm ?? new Date().toISOString(),
  };
  return JSON.stringify(registro);
}

function lerDocumentoV1(userId: number, storage: ArmazenamentoPendenciaVenda): DocumentoPendenciaVenda {
  const vazio: DocumentoPendenciaVenda = { versao: 1, userId, tentativas: [] };
  if (!Number.isInteger(userId) || userId <= 0) return vazio;
  const bruto = storage.getItem(chaveArmazenamentoPendenciaVendaV1(userId));
  if (!bruto) return vazio;
  try {
    const lido = JSON.parse(bruto) as DocumentoPendenciaVenda;
    if (lido?.versao !== 1 || lido.userId !== userId || !Array.isArray(lido.tentativas)) return vazio;
    return {
      versao: 1,
      userId,
      tentativas: lido.tentativas.filter(t => t && t.userId === userId && validarChaveIdempotenciaVenda(t.idempotencyKey).ok),
    };
  } catch {
    return vazio;
  }
}

function lerTentativaV2(
  userId: number,
  idempotencyKey: string,
  storage: ArmazenamentoPendenciaVenda,
): TentativaConfirmacaoVenda | null {
  return parseTentativa(storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(userId, idempotencyKey)), userId);
}

function listarChavesTentativaV2(userId: number, storage: ArmazenamentoPendenciaVenda): string[] {
  const prefixo = prefixoUsuarioV2(userId);
  return chavesDoArmazenamento(storage)
    .filter(chave => chave.startsWith(prefixo))
    .sort();
}

function migrarPendenciaVendaV1ParaV2NoLock(input: {
  userId: number;
  storage: ArmazenamentoPendenciaVenda;
}): { migradas: number; preservadas: number; v1Removido: boolean } {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    return { migradas: 0, preservadas: 0, v1Removido: false };
  }
  const storage = input.storage;
  const v1 = lerDocumentoV1(input.userId, storage);
  if (v1.tentativas.length === 0) {
    if (storage.getItem(chaveArmazenamentoPendenciaVendaV1(input.userId))) {
      storage.removeItem(chaveArmazenamentoPendenciaVendaV1(input.userId));
      return { migradas: 0, preservadas: 0, v1Removido: true };
    }
    return { migradas: 0, preservadas: 0, v1Removido: false };
  }
  let migradas = 0;
  let preservadas = 0;
  for (const tentativa of v1.tentativas) {
    const chaveV2 = chaveArmazenamentoPendenciaVendaTentativa(input.userId, tentativa.idempotencyKey);
    const atual = parseTentativa(storage.getItem(chaveV2), input.userId);
    if (!atual) {
      storage.setItem(chaveV2, serializarTentativa({
        ...tentativa,
        atualizadoEm: tentativa.atualizadoEm ?? tentativa.criadoEm,
      }));
      const copiada = parseTentativa(storage.getItem(chaveV2), input.userId);
      if (copiada && copiada.idempotencyKey === tentativa.idempotencyKey) migradas += 1;
      continue;
    }
    preservadas += 1;
  }
  const todasPresentes = v1.tentativas.every(t => (
    parseTentativa(
      storage.getItem(chaveArmazenamentoPendenciaVendaTentativa(input.userId, t.idempotencyKey)),
      input.userId,
    ) != null
  ));
  if (todasPresentes) {
    storage.removeItem(chaveArmazenamentoPendenciaVendaV1(input.userId));
  }
  return { migradas, preservadas, v1Removido: todasPresentes };
}

export async function migrarPendenciaVendaV1ParaV2(input: {
  userId: number;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<{ migradas: number; preservadas: number; v1Removido: boolean; recusada?: boolean }> {
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const locked = await coordenacao.executarExclusivo(
    nomeLockMigracaoPendenciaVenda(input.userId),
    () => migrarPendenciaVendaV1ParaV2NoLock({ userId: input.userId, storage }),
  );
  if (!locked.ok) return { migradas: 0, preservadas: 0, v1Removido: false, recusada: true };
  return locked.valor;
}

function garantirMigracao(userId: number, storage: ArmazenamentoPendenciaVenda): void {
  migrarPendenciaVendaV1ParaV2NoLock({ userId, storage });
}

export function listarTentativasPendenciaVenda(input: {
  userId: number;
  storage?: ArmazenamentoPendenciaVenda;
}): TentativaConfirmacaoVenda[] {
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  if (!Number.isInteger(input.userId) || input.userId <= 0) return [];
  garantirMigracao(input.userId, storage);
  const tentativas = listarChavesTentativaV2(input.userId, storage)
    .map(chave => parseTentativa(storage.getItem(chave), input.userId))
    .filter((t): t is TentativaConfirmacaoVenda => t != null);
  return tentativas.sort((a, b) => {
    const porData = String(a.criadoEm).localeCompare(String(b.criadoEm));
    return porData !== 0 ? porData : a.idempotencyKey.localeCompare(b.idempotencyKey);
  });
}

export function montarTentativaConfirmacaoVenda(input: {
  userId: number;
  idempotencyKey: string;
  intencao: IntencaoConfirmacaoVendaFinanceiro;
  estado?: EstadoTentativaConfirmacaoVenda | string;
  abaToken: string;
  criadoEm?: string;
  vendaId?: number | null;
  tituloId?: number | null;
}): { ok: true; tentativa: TentativaConfirmacaoVenda } | { ok: false; motivo: "chave" | "intencao" | "usuario" } {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return { ok: false, motivo: "usuario" };
  const chave = validarChaveIdempotenciaVenda(input.idempotencyKey);
  if (!chave.ok) return { ok: false, motivo: "chave" };
  const assinatura = assinaturaIntencaoConfirmacaoVenda(input.intencao);
  if (!assinatura) return { ok: false, motivo: "intencao" };
  const criadoEm = input.criadoEm ?? new Date().toISOString();
  return {
    ok: true,
    tentativa: {
      idempotencyKey: chave.key,
      userId: input.userId,
      intencao: input.intencao,
      assinatura,
      criadoEm,
      estado: input.estado ?? "pronto",
      abaToken: input.abaToken,
      vendaId: input.vendaId ?? null,
      tituloId: input.tituloId ?? null,
      atualizadoEm: criadoEm,
    },
  };
}

export function payloadDaTentativaVenda(tentativa: TentativaConfirmacaoVenda): PayloadConfirmacaoVendaIntegrada {
  return {
    ...tentativa.intencao,
    idempotencyKey: tentativa.idempotencyKey,
  };
}

function estadoPodeSubstituir(atual: string, proximo: string, mesmaAba: boolean, possuiLock: boolean): boolean {
  if (atual === proximo) return true;
  if (atual === "confirmado") return false;
  if (proximo === "desconhecido" && (atual === "enviando" || atual === "desconhecido")) return true;
  if (proximo === "erro_definitivo") return true;
  if (proximo === "confirmado") return true;
  if (estadoExigePreservarTentativa(atual) && !mesmaAba && !possuiLock) return false;
  return true;
}

export async function tentarCoordenacaoPendenciaVenda(input: {
  userId: number;
  idempotencyKey: string;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<{ ok: true; nome: string } | { ok: false; motivo: "outra_aba"; nome: string }> {
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const nome = nomeLockPendenciaVenda(input.userId, input.idempotencyKey);
  const locked = await coordenacao.executarExclusivo(nome, () => true);
  if (!locked.ok) return { ok: false, motivo: "outra_aba", nome };
  return { ok: true, nome };
}

function gravarTentativaPendenciaVendaNoLock(input: {
  tentativa: TentativaConfirmacaoVenda;
  storage: ArmazenamentoPendenciaVenda;
}): { ok: true; tentativas: TentativaConfirmacaoVenda[]; preservada?: boolean }
  | { ok: false; motivo: "travada" | "usuario" } {
  if (input.tentativa.userId <= 0) return { ok: false, motivo: "usuario" };
  garantirMigracao(input.tentativa.userId, input.storage);
  const chave = chaveArmazenamentoPendenciaVendaTentativa(input.tentativa.userId, input.tentativa.idempotencyKey);
  const atual = parseTentativa(input.storage.getItem(chave), input.tentativa.userId);
  if (atual) {
    if (atual.assinatura !== input.tentativa.assinatura && estadoExigePreservarTentativa(atual.estado)) {
      return { ok: false, motivo: "travada" };
    }
    const mesmaAba = atual.abaToken === input.tentativa.abaToken;
    if (!estadoPodeSubstituir(atual.estado, input.tentativa.estado, mesmaAba, true)) {
      return {
        ok: true,
        tentativas: listarTentativasPendenciaVenda({ userId: input.tentativa.userId, storage: input.storage }),
        preservada: true,
      };
    }
    const proxima: TentativaConfirmacaoVenda = {
      ...input.tentativa,
      idempotencyKey: atual.idempotencyKey,
      intencao: estadoExigePreservarTentativa(atual.estado) ? atual.intencao : input.tentativa.intencao,
      assinatura: estadoExigePreservarTentativa(atual.estado) ? atual.assinatura : input.tentativa.assinatura,
      criadoEm: atual.criadoEm,
      abaToken: estadoExigePreservarTentativa(atual.estado) && !mesmaAba ? atual.abaToken : input.tentativa.abaToken,
      atualizadoEm: new Date().toISOString(),
    };
    input.storage.setItem(chave, serializarTentativa(proxima));
  } else {
    input.storage.setItem(chave, serializarTentativa({
      ...input.tentativa,
      atualizadoEm: input.tentativa.atualizadoEm ?? new Date().toISOString(),
    }));
  }
  return { ok: true, tentativas: listarTentativasPendenciaVenda({ userId: input.tentativa.userId, storage: input.storage }) };
}

export async function gravarTentativaPendenciaVenda(input: {
  tentativa: TentativaConfirmacaoVenda;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<{ ok: true; tentativas: TentativaConfirmacaoVenda[]; preservada?: boolean }
  | { ok: false; motivo: "travada" | "usuario" | "outra_aba" }> {
  if (input.tentativa.userId <= 0) return { ok: false, motivo: "usuario" };
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const locked = await coordenacao.executarExclusivo(
    nomeLockPendenciaVenda(input.tentativa.userId, input.tentativa.idempotencyKey),
    () => gravarTentativaPendenciaVendaNoLock({ tentativa: input.tentativa, storage }),
  );
  if (!locked.ok) return { ok: false, motivo: "outra_aba" };
  return locked.valor;
}

export function decidirChaveConfirmacaoVenda(input: {
  userId: number;
  intencao: IntencaoConfirmacaoVendaFinanceiro;
  chaveAtual?: string;
  storage?: ArmazenamentoPendenciaVenda;
  gerarUuid?: () => string;
}): { ok: true; chave: string; reutilizada: boolean }
  | { ok: false; motivo: "travada" | "intencao" | "usuario" | "chave" } {
  if (!Number.isInteger(input.userId) || input.userId <= 0) return { ok: false, motivo: "usuario" };
  const assinatura = assinaturaIntencaoConfirmacaoVenda(input.intencao);
  if (!assinatura) return { ok: false, motivo: "intencao" };
  const tentativas = listarTentativasPendenciaVenda({ userId: input.userId, storage: input.storage });
  const mesmaIntencao = tentativas.find(t => t.assinatura === assinatura);
  if (mesmaIntencao) {
    return { ok: true, chave: mesmaIntencao.idempotencyKey, reutilizada: true };
  }
  const chaveInformada = String(input.chaveAtual ?? "").trim();
  if (chaveInformada) {
    const existente = tentativas.find(t => t.idempotencyKey === chaveInformada);
    if (existente && estadoExigePreservarTentativa(existente.estado) && existente.assinatura !== assinatura) {
      return { ok: false, motivo: "travada" };
    }
    const valida = validarChaveIdempotenciaVenda(chaveInformada);
    if (!valida.ok) return { ok: false, motivo: "chave" };
    if (!existente) return { ok: true, chave: valida.key, reutilizada: false };
    return { ok: true, chave: valida.key, reutilizada: true };
  }
  const chave = novaChaveIdempotenciaVenda(input.gerarUuid);
  const valida = validarChaveIdempotenciaVenda(chave);
  if (!valida.ok) return { ok: false, motivo: "chave" };
  return { ok: true, chave: valida.key, reutilizada: false };
}

export function prepararRetryConfirmacaoVenda(input: {
  tentativa: TentativaConfirmacaoVenda;
  intencaoAtual: IntencaoConfirmacaoVendaFinanceiro;
}): { ok: true; payload: PayloadConfirmacaoVendaIntegrada }
  | { ok: false; motivo: "travada" | "intencao" } {
  if (!retryConfirmacaoVendaBateComPedido(input.tentativa.intencao, input.intencaoAtual)) {
    return { ok: false, motivo: "travada" };
  }
  return { ok: true, payload: payloadDaTentativaVenda(input.tentativa) };
}

export async function marcarTimeoutConfirmacaoVenda(input: {
  userId: number;
  idempotencyKey: string;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<TentativaConfirmacaoVenda | null> {
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const locked = await coordenacao.executarExclusivo(
    nomeLockPendenciaVenda(input.userId, input.idempotencyKey),
    () => {
      garantirMigracao(input.userId, storage);
      const atual = lerTentativaV2(input.userId, input.idempotencyKey, storage);
      if (!atual) return null;
      if (atual.estado === "confirmado") return atual;
      const proxima = { ...atual, estado: "desconhecido" as const, atualizadoEm: new Date().toISOString() };
      storage.setItem(chaveArmazenamentoPendenciaVendaTentativa(input.userId, input.idempotencyKey), serializarTentativa(proxima));
      return proxima;
    },
  );
  if (!locked.ok) return null;
  return locked.valor;
}

export async function normalizarPendenciaVendaAposRecarregar(input: {
  userId: number;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<TentativaConfirmacaoVenda[]> {
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  garantirMigracao(input.userId, storage);
  for (const chave of listarChavesTentativaV2(input.userId, storage)) {
    const atual = parseTentativa(storage.getItem(chave), input.userId);
    if (!atual || atual.estado !== "enviando") continue;
    const locked = await coordenacao.executarExclusivo(
      nomeLockPendenciaVenda(input.userId, atual.idempotencyKey),
      () => {
        const refeita = parseTentativa(storage.getItem(chave), input.userId);
        if (!refeita || refeita.estado !== "enviando") return;
        storage.setItem(chave, serializarTentativa({
          ...refeita,
          estado: "desconhecido",
          atualizadoEm: new Date().toISOString(),
        }));
      },
    );
    if (!locked.ok) continue;
  }
  return listarTentativasPendenciaVenda({ userId: input.userId, storage });
}

export async function marcarConfirmacaoVendaConcluida(input: {
  userId: number;
  idempotencyKey: string;
  vendaId: number;
  tituloId: number;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<{ ok: true; tentativas: TentativaConfirmacaoVenda[] } | { ok: false; motivo: "ids" | "ausente" | "outra_aba" }> {
  if (!Number.isInteger(input.vendaId) || input.vendaId <= 0) return { ok: false, motivo: "ids" };
  if (!Number.isInteger(input.tituloId) || input.tituloId <= 0) return { ok: false, motivo: "ids" };
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const locked = await coordenacao.executarExclusivo(
    nomeLockPendenciaVenda(input.userId, input.idempotencyKey),
    () => {
      garantirMigracao(input.userId, storage);
      const chave = chaveArmazenamentoPendenciaVendaTentativa(input.userId, input.idempotencyKey);
      const atual = parseTentativa(storage.getItem(chave), input.userId);
      if (!atual) return { ok: false as const, motivo: "ausente" as const };
      storage.removeItem(chave);
      return { ok: true as const, tentativas: listarTentativasPendenciaVenda({ userId: input.userId, storage }) };
    },
  );
  if (!locked.ok) return { ok: false, motivo: "outra_aba" };
  return locked.valor;
}

export async function marcarErroDefinitivoConfirmacaoVenda(input: {
  userId: number;
  idempotencyKey: string;
  storage?: ArmazenamentoPendenciaVenda;
  coordenacao?: CoordenacaoPendenciaVenda;
}): Promise<TentativaConfirmacaoVenda | null> {
  const storage = input.storage ?? armazenamentoPendenciaVendaPadrao();
  const coordenacao = input.coordenacao ?? coordenacaoPendenciaVendaPadrao();
  const locked = await coordenacao.executarExclusivo(
    nomeLockPendenciaVenda(input.userId, input.idempotencyKey),
    () => {
      garantirMigracao(input.userId, storage);
      const atual = lerTentativaV2(input.userId, input.idempotencyKey, storage);
      if (!atual) return null;
      const proxima = { ...atual, estado: "erro_definitivo" as const, atualizadoEm: new Date().toISOString() };
      storage.setItem(chaveArmazenamentoPendenciaVendaTentativa(input.userId, input.idempotencyKey), serializarTentativa(proxima));
      return proxima;
    },
  );
  if (!locked.ok) return null;
  return locked.valor;
}

export function prepararVerificacaoConfirmacaoVenda(input: {
  tentativa: TentativaConfirmacaoVenda;
}): {
  ok: false;
  motivo: "integracao_desligada";
  rotulo: typeof ROTULO_VERIFICAR_CONFIRMACAO;
  mensagem: typeof MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO;
  payload: PayloadConfirmacaoVendaIntegrada;
} {
  return {
    ok: false,
    motivo: "integracao_desligada",
    rotulo: ROTULO_VERIFICAR_CONFIRMACAO,
    mensagem: MSG_VENDA_VERIFICACAO_AGUARDA_INTEGRACAO,
    payload: payloadDaTentativaVenda(input.tentativa),
  };
}

export function tentativasComResultadoDesconhecido(
  tentativas: readonly TentativaConfirmacaoVenda[],
): TentativaConfirmacaoVenda[] {
  return tentativas.filter(t => estadoExigePreservarTentativa(t.estado));
}

export function rascunhoCompativelComPendenciaVenda(
  rascunhoPresente: boolean,
): boolean {
  return rascunhoPresente;
}
