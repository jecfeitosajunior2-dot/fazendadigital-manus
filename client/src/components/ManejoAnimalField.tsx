import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import {
  labelAnimalSelecionado,
  loteAnimalSelecionado,
} from "@shared/animalBuscaDisplay";

const fieldCls =
  "w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]";

const sectionTitleCls =
  "text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2";

export type ManejoAnimalRow = {
  id: number;
  brinco?: string | null;
  nome?: string | null;
  brincoEletronico?: string | null;
  loteId?: number | null;
  loteNome?: string | null;
  sexo?: string | null;
  categoria?: string | null;
  fazendaId?: number | null;
  status?: string | null;
  idadeMeses?: number | null;
  dataNascimento?: string | null;
  ultimoPeso?: number | null;
};

function sexoDotClass(sexo?: string | null) {
  if (sexo === "macho") return "bg-blue-400";
  if (sexo === "femea") return "bg-pink-400";
  return "bg-gray-300";
}

type ManejoAnimalFieldProps<T extends ManejoAnimalRow> = {
  selected: T | null;
  onSelect: (animal: T | null) => void;
  animals: T[];
  loading?: boolean;
  disabled?: boolean;
  hintMessage?: string;
  /** Conteúdo extra no card (ex.: último peso na Pesagem). */
  selectedExtra?: React.ReactNode;
  /** Chamado ao limpar seleção (Alterar animal). */
  onAfterClear?: () => void;
};

export function ManejoAnimalField<T extends ManejoAnimalRow>({
  selected,
  onSelect,
  animals,
  loading = false,
  disabled = false,
  hintMessage,
  selectedExtra,
  onAfterClear,
}: ManejoAnimalFieldProps<T>) {
  return (
    <div className="border-t border-gray-100 pt-5">
      <p className={sectionTitleCls}>Animal</p>
      <AnimalAutocomplete
        selected={selected}
        onSelect={onSelect}
        animals={animals}
        loading={loading}
        disabled={disabled}
        inputClassName={fieldCls}
        placeholder="Buscar por brinco, RFID ou nome…"
        emptyMessage="Nenhum animal ativo encontrado."
        hintMessage={
          hintMessage ??
          (disabled
            ? "Selecione uma Fazenda primeiro."
            : "Digite e selecione um animal da lista.")
        }
        renderSelected={(a, onClear) => (
          <div className="rounded-lg border border-[#4ECDC4]/40 bg-[#4ECDC4]/[0.06] px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 text-[12px] text-gray-600">
                <span className="inline-flex items-center gap-1.5 shrink-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${sexoDotClass(a.sexo)}`}
                    title={
                      a.sexo === "macho"
                        ? "Macho"
                        : a.sexo === "femea"
                          ? "Fêmea"
                          : undefined
                    }
                    aria-hidden
                  />
                  <span className="text-[13px] font-semibold text-gray-900">
                    {labelAnimalSelecionado(a)}
                  </span>
                </span>
                <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                  |
                </span>
                <span className="shrink-0">
                  Brinco visual{" "}
                  <span className="font-medium text-gray-800">
                    {a.brinco?.trim() || "Não vinculado"}
                  </span>
                </span>
                <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                  |
                </span>
                <span className="shrink-0">
                  RFID{" "}
                  <span className="font-medium text-gray-800">
                    {a.brincoEletronico?.trim() || "Não vinculado"}
                  </span>
                </span>
                {loteAnimalSelecionado(a) ? (
                  <>
                    <span className="text-[#4ECDC4]/55 select-none" aria-hidden>
                      |
                    </span>
                    <span className="shrink-0">
                      Lote{" "}
                      <span className="font-medium text-gray-800">
                        {loteAnimalSelecionado(a)}
                      </span>
                    </span>
                  </>
                ) : null}
                {selectedExtra}
              </div>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  onAfterClear?.();
                }}
                className="text-[11px] font-semibold text-gray-600 underline shrink-0"
              >
                Alterar animal
              </button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
