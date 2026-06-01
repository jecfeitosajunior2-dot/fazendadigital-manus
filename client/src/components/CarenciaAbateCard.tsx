import React from "react";
import { Clock } from "lucide-react";
import { SelectItem } from "@/components/ui/select";
import {
  FormLabel,
  FormInput,
  FormSelect,
  FormTextarea,
  FieldBox,
} from "@/components/FormFields";
import { UNIDADES_CARENCIA } from "@/lib/produto-types";

export type CarenciaFormState = {
  possuiCarencia: "sim" | "nao";
  carenciaAbate: string;
  carenciaAbateUnidade: "d" | "h";
  carenciaLeite: string;
  observacoesCarencia: string;
};

type Props = {
  value: CarenciaFormState;
  onChange: <K extends keyof CarenciaFormState>(key: K, val: CarenciaFormState[K]) => void;
  nomeProduto?: string;
};

function FormRadioGroup({
  value,
  onChange,
  options,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <FieldBox required={required} variant="light">
      <div className="flex flex-wrap gap-4 px-3 py-2.5 min-h-[42px] items-center">
        {options.map(opt => (
          <label key={opt.value} className="flex items-center gap-2 text-[12px] text-gray-700 cursor-pointer">
            <input
              type="radio"
              name="possui-carencia"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-[#4ECDC4] w-3.5 h-3.5"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </FieldBox>
  );
}

export default function CarenciaAbateCard({ value, onChange, nomeProduto }: Props) {
  const ativo = value.possuiCarencia === "sim";

  return (
    <div className="border border-gray-200 rounded-md mb-6 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3 bg-white">
        <Clock className="w-5 h-5 text-[#4ECDC4] shrink-0" strokeWidth={1.75} aria-hidden />
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold text-gray-800">Carência de abate</h2>
          {nomeProduto && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5">{nomeProduto}</p>
          )}
        </div>
      </div>

      <div className="px-4 py-3 bg-amber-50/80 border-b border-amber-100/80">
        <p className="text-[11px] text-amber-900/90 leading-relaxed">
          Período mínimo entre a última aplicação do produto e o abate ou descarte do leite,
          conforme bula e normas do MAPA. Consulte sempre o fabricante.
        </p>
      </div>

      <div className="px-4 py-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <FormLabel required>Possui carência?</FormLabel>
            <FormRadioGroup
              value={value.possuiCarencia}
              onChange={v => onChange("possuiCarencia", v as "sim" | "nao")}
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Não" },
              ]}
              required
            />
          </div>

          <div className={ativo ? "" : "opacity-50 pointer-events-none"}>
            <FormLabel required={ativo}>Carência para abate</FormLabel>
            <FormInput
              type="number"
              min={0}
              value={value.carenciaAbate}
              onChange={v => onChange("carenciaAbate", v.replace(/\D/g, ""))}
              placeholder="0"
              required={ativo}
            />
          </div>

          <div className={ativo ? "" : "opacity-50 pointer-events-none"}>
            <FormLabel required={ativo}>Unidade</FormLabel>
            <FormSelect
              value={value.carenciaAbateUnidade}
              onChange={v => onChange("carenciaAbateUnidade", v as "d" | "h")}
              placeholder="d"
              displayValue={value.carenciaAbateUnidade}
              required={ativo}
            >
              {UNIDADES_CARENCIA.map(u => (
                <SelectItem key={u.sigla} value={u.sigla} className="text-[12px] font-medium">
                  {u.sigla}
                </SelectItem>
              ))}
            </FormSelect>
          </div>

          <div className={ativo ? "" : "opacity-50 pointer-events-none"}>
            <FormLabel>Carência para leite</FormLabel>
            <div className="relative">
              <FormInput
                type="number"
                min={0}
                value={value.carenciaLeite}
                onChange={v => onChange("carenciaLeite", v.replace(/\D/g, ""))}
                placeholder="0"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-gray-400 pointer-events-none">
                d
              </span>
            </div>
          </div>
        </div>

        <div className={ativo ? "" : "opacity-50 pointer-events-none"}>
          <FormLabel>Observações / referência da bula</FormLabel>
          <FormTextarea
            value={value.observacoesCarencia}
            onChange={v => onChange("observacoesCarencia", v)}
            placeholder="Ex.: Carência conforme bula Virbac — abate 28 d após última aplicação IV."
            rows={2}
          />
        </div>
      </div>
    </div>
  );

}
