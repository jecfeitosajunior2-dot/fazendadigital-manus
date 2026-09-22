import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FD_PRIMARY, FormInput, FormLabel, FormSelect, FormTextarea } from "@/components/FormFields";
import { SelectItem } from "@/components/ui/select";
import { ESTADOS_BR, fetchCidadesPorEstado } from "@/lib/brazil-locations";
import {
  alterarUfComprador,
  documentoPodeSalvarComprador,
  isCpfCnpjValido,
  normalizeCpfCnpj,
  opcoesCidadeComprador,
  placeholderCidadeComprador,
  type CompradorFormValues,
} from "@/lib/compradoresCadastro";
import { formatCpfCnpj, formatPhoneBR } from "@/lib/utils";

const UF_VAZIA = "__empty__";

export function CompradorFormAcoes({
  isBusy,
  saveDisabled,
  onCancel,
  onSave,
}: {
  isBusy?: boolean;
  saveDisabled?: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={isBusy}
        className="px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isBusy || saveDisabled}
        className="inline-flex items-center px-6 py-2 rounded-full text-[11px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
        style={{ backgroundColor: FD_PRIMARY }}
      >
        {isBusy ? "Salvando..." : "Salvar"}
      </button>
    </div>
  );
}

type Props = {
  form: CompradorFormValues;
  onChange: (patch: Partial<CompradorFormValues>) => void;
  documentoOriginal?: string | null;
  editando?: boolean;
};

export function CompradorCadastroCampos({ form, onChange, documentoOriginal, editando = false }: Props) {
  const [cidades, setCidades] = useState<string[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);

  useEffect(() => {
    if (!form.uf) {
      setCidades([]);
      setLoadingCidades(false);
      return;
    }

    let cancelled = false;
    const cidadeSalva = form.cidade.trim();
    setLoadingCidades(true);
    fetchCidadesPorEstado(form.uf)
      .then(list => {
        if (cancelled) return;
        setCidades(opcoesCidadeComprador(list, cidadeSalva));
      })
      .catch(() => {
        if (cancelled) return;
        setCidades(cidadeSalva ? [cidadeSalva] : []);
        toast.error("Não foi possível carregar as cidades");
      })
      .finally(() => {
        if (!cancelled) setLoadingCidades(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.uf]);

  const opcoesCidade = useMemo(
    () => opcoesCidadeComprador(cidades, form.cidade),
    [cidades, form.cidade],
  );
  const documentoPodeSalvar = documentoPodeSalvarComprador({
    documento: form.documento,
    documentoOriginal,
    editando,
  });
  const mostrarErroDocumento =
    normalizeCpfCnpj(form.documento).length > 0 && !documentoPodeSalvar && !isCpfCnpjValido(form.documento);

  return (
    <>
      <div>
        <FormLabel required>Nome / Razão social</FormLabel>
        <FormInput
          required
          variant="light"
          value={form.nome}
          onChange={v => onChange({ nome: v })}
          placeholder="Nome ou razão social"
        />
      </div>
      <div>
        <FormLabel>Propriedade / estabelecimento</FormLabel>
        <FormInput
          variant="light"
          value={form.propriedadeEstabelecimento}
          onChange={v => onChange({ propriedadeEstabelecimento: v })}
          placeholder="Ex.: Fazenda Boa Esperança"
        />
      </div>
      <div>
        <FormLabel>Nome do contato</FormLabel>
        <FormInput
          variant="light"
          value={form.nomeContato}
          onChange={v => onChange({ nomeContato: v })}
          placeholder="Nome da pessoa para contato"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FormLabel required>CPF/CNPJ</FormLabel>
          <FormInput
            required
            variant="light"
            value={form.documento}
            onChange={v => onChange({ documento: formatCpfCnpj(v) })}
            placeholder={
              normalizeCpfCnpj(form.documento).length > 11
                ? "00.000.000/0000-00"
                : "000.000.000-00"
            }
            invalid={mostrarErroDocumento}
          />
          {mostrarErroDocumento ? (
            <p className="mt-1 text-[11px] text-red-600">Informe um CPF ou CNPJ válido.</p>
          ) : null}
        </div>
        <div>
          <FormLabel>Telefone</FormLabel>
          <FormInput
            variant="light"
            value={form.telefone}
            onChange={v => onChange({ telefone: formatPhoneBR(v) })}
            placeholder="(00) 00000-0000"
            inputMode="tel"
          />
        </div>
      </div>
      <div>
        <FormLabel>E-mail</FormLabel>
        <FormInput
          variant="light"
          value={form.email}
          onChange={v => onChange({ email: v })}
          placeholder="email@exemplo.com"
        />
      </div>
      <div>
        <FormLabel>Endereço</FormLabel>
        <FormInput
          variant="light"
          value={form.endereco}
          onChange={v => onChange({ endereco: v })}
          placeholder="Rua, número, bairro ou referência"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-4">
        <div>
          <FormLabel>UF</FormLabel>
          <FormSelect
            variant="light"
            value={form.uf || UF_VAZIA}
            onChange={v => onChange(alterarUfComprador(v === UF_VAZIA ? "" : v))}
            placeholder="Selecione"
          >
            <SelectItem value={UF_VAZIA} className="text-[12px] text-gray-400">
              Selecione
            </SelectItem>
            {ESTADOS_BR.map(e => (
              <SelectItem key={e.uf} value={e.uf} className="text-[12px]">
                {e.uf}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
        <div>
          <FormLabel>Cidade</FormLabel>
          <FormSelect
            variant="light"
            value={form.cidade || UF_VAZIA}
            onChange={v => onChange({ cidade: v === UF_VAZIA ? "" : v })}
            placeholder={placeholderCidadeComprador(form.uf, loadingCidades)}
            disabled={!form.uf || loadingCidades}
            displayValue={form.cidade}
          >
            <SelectItem value={UF_VAZIA} className="text-[12px] text-gray-400">
              Selecione
            </SelectItem>
            {opcoesCidade.map(cidade => (
              <SelectItem key={cidade} value={cidade} className="text-[12px]">
                {cidade}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
      </div>
      <div>
        <FormLabel>Observações</FormLabel>
        <FormTextarea
          variant="light"
          value={form.observacoes}
          onChange={v => onChange({ observacoes: v })}
          rows={2}
          placeholder="Informações complementares"
        />
      </div>
    </>
  );
}
