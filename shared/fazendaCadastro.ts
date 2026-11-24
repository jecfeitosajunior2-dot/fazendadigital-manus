/** Regras do cadastro de fazenda que o navegador e o servidor precisam concordar. */

export const PAIS_PADRAO_FAZENDA = "Brasil";

export const PAISES_FAZENDA = ["Brasil", "Argentina", "Paraguai", "Uruguai"] as const;

const UFS_BRASIL = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

const UF_BRASIL = new Set<string>(UFS_BRASIL);

export type AreaLida =
  | { ok: true; vazia: true }
  | { ok: true; vazia: false; valor: string; centavos: number }
  | { ok: false; mensagem: string };

/** A conta ainda não tem país configurado. Sem isso, o padrão é Brasil. */
export function paisInicial(paisDaConta?: string | null): string {
  const pais = String(paisDaConta ?? "").trim();
  return (PAISES_FAZENDA as readonly string[]).includes(pais) ? pais : PAIS_PADRAO_FAZENDA;
}

export function ufDoBrasil(estado: string): boolean {
  return UF_BRASIL.has(estado.trim().toUpperCase());
}

/**
 * Lê área no jeito brasileiro (1.500,50) ou com ponto decimal (1500.50).
 * O número fica na unidade escolhida. Não converte hectare, alqueire ou metro.
 */
export function interpretarArea(bruto: unknown): AreaLida {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: true, vazia: true };
  if (/[a-zA-Z]/.test(texto)) {
    return { ok: false, mensagem: "Informe a área com números. Exemplo: 1.500,50." };
  }

  let normal = texto.replace(/\s/g, "");
  if (normal.startsWith("-")) {
    return { ok: false, mensagem: "A área não pode ser negativa." };
  }
  if (normal.startsWith("+")) normal = normal.slice(1);

  if (normal.includes(",")) {
    normal = normal.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(normal)) {
    normal = normal.replace(/\./g, "");
  }

  if (!/^\d+(\.\d+)?$/.test(normal)) {
    return { ok: false, mensagem: "Informe a área com números. Exemplo: 1.500,50." };
  }

  const [inteiro, frac = ""] = normal.split(".");
  if (frac.length > 2) {
    return { ok: false, mensagem: "Use no máximo duas casas decimais." };
  }
  if (inteiro.length > 8) {
    return { ok: false, mensagem: "A área passa do limite do cadastro." };
  }

  const centavos = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return { ok: true, vazia: false, valor: `${inteiro}.${frac.padEnd(2, "0")}`, centavos };
}

export function formatarAreaPtBr(centavos: number): string {
  const inteiro = Math.trunc(centavos / 100);
  const frac = String(Math.abs(centavos) % 100).padStart(2, "0");
  return `${inteiro.toLocaleString("pt-BR")},${frac}`;
}

export function exibirAreaSalva(bruto: unknown): string {
  const lida = interpretarArea(bruto);
  if (!lida.ok || lida.vazia) return "";
  return formatarAreaPtBr(lida.centavos);
}

export function conferirAreas(area: unknown, reserva: unknown): {
  erros: { area?: string; areaReserva?: string };
  total: string | null;
  reserva: string | null;
  liquida: number | null;
} {
  const total = interpretarArea(area);
  const reservaLida = interpretarArea(reserva);
  const erros: { area?: string; areaReserva?: string } = {};
  if (!total.ok) erros.area = total.mensagem;
  if (!reservaLida.ok) erros.areaReserva = reservaLida.mensagem;
  if (!total.ok || !reservaLida.ok) {
    return { erros, total: null, reserva: null, liquida: null };
  }
  if (total.vazia) {
    return { erros, total: null, reserva: reservaLida.vazia ? null : reservaLida.valor, liquida: null };
  }
  const centavosReserva = reservaLida.vazia ? 0 : reservaLida.centavos;
  if (centavosReserva > total.centavos) {
    erros.areaReserva = "A área de reserva não pode ser maior que a área total.";
    return { erros, total: total.valor, reserva: reservaLida.vazia ? null : reservaLida.valor, liquida: null };
  }
  return {
    erros,
    total: total.valor,
    reserva: reservaLida.vazia ? null : reservaLida.valor,
    liquida: total.centavos - centavosReserva,
  };
}

function mesmoDigito(digitos: string): boolean {
  return /^(\d)\1+$/.test(digitos);
}

function digito(base: string, fatorInicial: number): number {
  let soma = 0;
  let fator = fatorInicial;
  for (const char of base) {
    soma += Number(char) * fator;
    fator -= 1;
    if (fator < 2) fator = 9;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Vazio passa. Fora do Brasil o campo não usa esta regra. */
export function documentoBrConsistente(valor: unknown): true | string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return true;
  if (digitos.length !== 11 && digitos.length !== 14) return "CPF ou CNPJ incompleto.";
  if (mesmoDigito(digitos)) return digitos.length === 11 ? "O CPF informado não confere." : "O CNPJ informado não confere.";
  if (digitos.length === 11) {
    const um = digito(digitos.slice(0, 9), 10);
    const dois = digito(digitos.slice(0, 10), 11);
    return digitos.endsWith(`${um}${dois}`) ? true : "O CPF informado não confere.";
  }
  const um = digito(digitos.slice(0, 12), 5);
  const dois = digito(digitos.slice(0, 13), 6);
  return digitos.endsWith(`${um}${dois}`) ? true : "O CNPJ informado não confere.";
}

export function prepararCamposFazenda(entrada: Record<string, unknown>):
  | { ok: true; dados: Record<string, unknown> }
  | { ok: false; mensagem: string } {
  const dados: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(entrada)) {
    if (chave === "userId" || chave === "id" || chave === "createdAt" || chave === "updatedAt" || chave === "areaLiquida") {
      continue;
    }
    if (valor !== undefined) dados[chave] = valor;
  }

  if (typeof dados.estado === "string") {
    const estado = dados.estado.trim().toUpperCase();
    if (estado.length > 2) {
      return { ok: false, mensagem: "O estado precisa ser uma sigla de duas letras." };
    }
    dados.estado = estado;
    if (dados.pais === "Brasil" && estado && !UF_BRASIL.has(estado)) {
      return { ok: false, mensagem: "Selecione um estado do Brasil." };
    }
  }

  if (dados.pais === "Brasil" && dados.cpfCnpj != null && String(dados.cpfCnpj).trim()) {
    const documento = documentoBrConsistente(dados.cpfCnpj);
    if (documento !== true) return { ok: false, mensagem: documento };
  }

  if (dados.area !== undefined || dados.areaReserva !== undefined) {
    const areas = conferirAreas(dados.area ?? "", dados.areaReserva ?? "");
    const mensagem = areas.erros.area || areas.erros.areaReserva;
    if (mensagem) return { ok: false, mensagem };
    if (dados.area !== undefined) dados.area = areas.total;
    if (dados.areaReserva !== undefined) dados.areaReserva = areas.reserva;
    if (dados.area !== undefined && areas.liquida != null) {
      dados.areaLiquida = (areas.liquida / 100).toFixed(2);
    }
  }

  return { ok: true, dados };
}
