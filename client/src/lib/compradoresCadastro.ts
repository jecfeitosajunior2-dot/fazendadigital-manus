import { isCpfCnpjValido, normalizeCpfCnpj } from "@shared/cpfCnpj";
import { documentoPodeSalvarComprador } from "@shared/pessoaDocumentoCliente";
import { normalizeUfBrasil } from "@shared/ufsBrasil";

export { documentoPodeSalvarComprador, isCpfCnpjValido, normalizeCpfCnpj };

export type CompradorFormValues = {
  nome: string;
  propriedadeEstabelecimento: string;
  nomeContato: string;
  documento: string;
  telefone: string;
  email: string;
  endereco: string;
  cidade: string;
  uf: string;
  observacoes: string;
};

export function emptyCompradorForm(): CompradorFormValues {
  return {
    nome: "",
    propriedadeEstabelecimento: "",
    nomeContato: "",
    documento: "",
    telefone: "",
    email: "",
    endereco: "",
    cidade: "",
    uf: "",
    observacoes: "",
  };
}

/** Payload de `pessoas` para comprador. Não envia fazendaId. Vazio vira null no backend. */
export function payloadPessoaCliente(form: CompradorFormValues) {
  return {
    nome: form.nome.trim(),
    tipo: "cliente" as const,
    documento: form.documento.trim() || undefined,
    telefone: form.telefone.trim(),
    email: form.email.trim(),
    endereco: form.endereco.trim(),
    observacoes: form.observacoes.trim(),
    propriedadeEstabelecimento: form.propriedadeEstabelecimento.trim(),
    nomeContato: form.nomeContato.trim(),
    cidade: form.cidade.trim(),
    uf: normalizeUfBrasil(form.uf) ?? "",
  };
}

export function compradorFormFromPessoa(p: {
  nome?: string | null;
  documento?: string | null;
  telefone?: string | null;
  email?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  propriedadeEstabelecimento?: string | null;
  nomeContato?: string | null;
  cidade?: string | null;
  uf?: string | null;
}): CompradorFormValues {
  return {
    ...emptyCompradorForm(),
    nome: p.nome ?? "",
    documento: p.documento ?? "",
    telefone: p.telefone ?? "",
    email: p.email ?? "",
    endereco: p.endereco ?? "",
    observacoes: p.observacoes ?? "",
    propriedadeEstabelecimento: p.propriedadeEstabelecimento ?? "",
    nomeContato: p.nomeContato ?? "",
    cidade: p.cidade ?? "",
    uf: normalizeUfBrasil(p.uf) ?? "",
  };
}

/** Trocar a UF limpa a cidade — o Select de município depende do estado. */
export function alterarUfComprador(uf: string): Pick<CompradorFormValues, "uf" | "cidade"> {
  return { uf, cidade: "" };
}

/** Mantém cidade antiga digitada à mão, mesmo se não vier na lista do IBGE. */
export function opcoesCidadeComprador(cidades: readonly string[], cidadeSalva?: string | null): string[] {
  const saved = String(cidadeSalva ?? "").trim();
  if (saved && !cidades.includes(saved)) return [saved, ...cidades];
  return [...cidades];
}

export function placeholderCidadeComprador(uf: string, loading: boolean): string {
  if (!String(uf ?? "").trim()) return "Selecione o estado primeiro";
  if (loading) return "Carregando...";
  return "Selecione a cidade";
}

export function pessoaAposInativar<T extends { ativo?: boolean | null }>(row: T): T {
  return { ...row, ativo: false };
}

export function pessoaAposReativar<T extends { ativo?: boolean | null }>(row: T): T {
  return { ...row, ativo: true };
}
