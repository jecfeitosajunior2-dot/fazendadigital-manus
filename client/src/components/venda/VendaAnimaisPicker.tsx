import { useEffect, useMemo, useState } from "react";
import { filterAnimalAutocompleteCandidates, type AnimalAutocompleteRow } from "@shared/animalAutocomplete";
import {
  labelAnimalBusca,
  labelSexoAnimal,
  sexoDotClassName,
  subtituloAnimalBusca,
  withSexoNoSubtitulo,
} from "@shared/animalBuscaDisplay";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDownSelect, FormLabel, formControlFlatCls } from "@/components/FormFields";

const SEM_LOTE = "sem-lote";

function opcoesLoteDeAnimais(animals: AnimalAutocompleteRow[]) {
  const map = new Map<string, string>();
  let semLote = false;
  for (const animal of animals) {
    if (animal.loteId && animal.loteId > 0) {
      const key = String(animal.loteId);
      if (!map.has(key)) {
        map.set(key, animal.loteNome?.trim() || `Lote #${animal.loteId}`);
      }
    } else {
      semLote = true;
    }
  }
  const opts = [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  if (semLote) opts.push({ value: SEM_LOTE, label: "Sem Lote" });
  return [{ value: "", label: "Todos os Lotes" }, ...opts];
}

function animalNoLoteFiltro(animal: AnimalAutocompleteRow, loteFiltro: string) {
  if (!loteFiltro) return true;
  if (loteFiltro === SEM_LOTE) return !animal.loteId || animal.loteId <= 0;
  return String(animal.loteId) === loteFiltro;
}

function SexoBolinha({ sexo }: { sexo?: string | null }) {
  const cls = sexoDotClassName(sexo);
  if (!cls) return null;
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} aria-hidden />;
}

const checkboxCls =
  "size-4 min-h-4 min-w-4 max-h-4 max-w-4 shrink-0 rounded-[4px] border-2 border-gray-400 bg-white shadow-none data-[state=checked]:bg-[#4ECDC4] data-[state=checked]:border-[#4ECDC4] data-[state=checked]:text-white";

type Props<T extends AnimalAutocompleteRow> = {
  animals: T[];
  loading?: boolean;
  disabled?: boolean;
  onAddMany: (animals: T[]) => void;
};

export function VendaAnimaisPicker<T extends AnimalAutocompleteRow>({
  animals,
  loading = false,
  disabled = false,
  onAddMany,
}: Props<T>) {
  const [busca, setBusca] = useState("");
  const [loteFiltro, setLoteFiltro] = useState("");
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set());
  const [ocultos, setOcultos] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    const ids = new Set(animals.map(a => a.id));
    setMarcados(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
    });
    setOcultos(prev => {
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
    });
  }, [animals]);

  const lotesOpcoes = useMemo(() => opcoesLoteDeAnimais(animals), [animals]);

  useEffect(() => {
    if (loteFiltro && !lotesOpcoes.some(o => o.value === loteFiltro)) {
      setLoteFiltro("");
    }
  }, [loteFiltro, lotesOpcoes]);

  const disponiveis = useMemo(
    () => animals.filter(a => !ocultos.has(a.id)),
    [animals, ocultos],
  );
  const doLote = useMemo(
    () => disponiveis.filter(a => animalNoLoteFiltro(a, loteFiltro)),
    [disponiveis, loteFiltro],
  );
  const visiveis = useMemo(
    () => filterAnimalAutocompleteCandidates(doLote, { search: busca, limit: 80 }),
    [doLote, busca],
  );
  const escolhidos = useMemo(
    () => disponiveis.filter(a => marcados.has(a.id)),
    [disponiveis, marcados],
  );

  const toggle = (id: number) => {
    setMarcados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const marcarVisiveis = () => {
    const todosMarcados = visiveis.length > 0 && visiveis.every(a => marcados.has(a.id));
    setMarcados(prev => {
      const next = new Set(prev);
      if (todosMarcados) {
        for (const animal of visiveis) next.delete(animal.id);
      } else {
        for (const animal of visiveis) next.add(animal.id);
      }
      return next;
    });
  };

  const incluirSelecionados = () => {
    if (!escolhidos.length) return;
    setOcultos(prev => {
      const next = new Set(prev);
      for (const animal of escolhidos) next.add(animal.id);
      return next;
    });
    setMarcados(new Set());
    onAddMany(escolhidos);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-row items-end gap-3">
        <div className="w-[13rem] shrink-0">
          <FormLabel>Lote</FormLabel>
          <FormDownSelect
            value={loteFiltro}
            onChange={setLoteFiltro}
            placeholder="Todos os Lotes"
            disabled={disabled}
            options={lotesOpcoes}
            required
          />
        </div>
        <div className="min-w-0 flex-1">
          <input
            type="search"
            value={busca}
            disabled={disabled}
            onChange={e => setBusca(e.target.value)}
            placeholder={disabled ? "Selecione a Fazenda primeiro" : "Buscar por brinco, RFID ou nome"}
            className={`${formControlFlatCls} bg-white outline-none placeholder:text-gray-400 border-l-[3px] border-l-[#4ECDC4] disabled:opacity-60`}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="rounded border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
          <p className="text-[11px] text-gray-500">
            {disabled
              ? "Escolha a Fazenda para listar os animais"
              : loading
                ? "Carregando..."
                : visiveis.length
                  ? `${visiveis.length} disponível(is)`
                  : doLote.length === 0 && loteFiltro
                    ? "Nenhum animal neste lote"
                    : animals.length
                      ? "Nenhum resultado"
                      : "Nenhum animal ativo nesta Fazenda"}
          </p>
          {!disabled && !loading && visiveis.length > 0 ? (
            <button
              type="button"
              onClick={marcarVisiveis}
              className="text-[11px] font-medium text-gray-500 hover:text-[#4ECDC4] hover:underline shrink-0"
            >
              {visiveis.every(a => marcados.has(a.id)) ? "Desmarcar visíveis" : "Marcar visíveis"}
            </button>
          ) : null}
        </div>
        <ul className="max-h-52 overflow-y-auto">
          {disabled || loading ? (
            <li className="px-3 py-4 text-center text-[11px] text-gray-400">
              {loading ? "Buscando animais..." : "Selecione a Fazenda primeiro"}
            </li>
          ) : visiveis.length === 0 ? (
            <li className="px-3 py-4 text-center text-[11px] text-gray-400">
              {doLote.length === 0 && loteFiltro
                ? "Nenhum animal neste lote."
                : animals.length
                  ? "Nenhum animal encontrado."
                  : "Nenhum animal ativo nesta Fazenda."}
            </li>
          ) : (
            visiveis.map(animal => {
              const titulo = labelAnimalBusca(animal);
              const sexoLabel = labelSexoAnimal(animal.sexo);
              const temBolinha = Boolean(sexoDotClassName(animal.sexo));
              const subtitle = withSexoNoSubtitulo(animal.sexo, subtituloAnimalBusca(animal) ?? "");
              const marcado = marcados.has(animal.id);
              return (
                <li key={animal.id}>
                  <label
                    className={`flex items-center justify-between gap-3 px-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer ${
                      marcado ? "bg-white" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <SexoBolinha sexo={animal.sexo} />
                        <span className="text-[13px] font-semibold text-gray-900 truncate">{titulo}</span>
                      </div>
                      {subtitle ? (
                        <div className={`text-[11px] text-gray-500 ${temBolinha ? "pl-3.5" : ""}`}>
                          {subtitle}
                        </div>
                      ) : null}
                    </div>
                    <Checkbox
                      checked={marcado}
                      onCheckedChange={() => toggle(animal.id)}
                      aria-label={sexoLabel ? `Selecionar ${titulo} — ${sexoLabel}` : `Selecionar ${titulo}`}
                      className={checkboxCls}
                    />
                  </label>
                </li>
              );
            })
          )}
        </ul>
        {!disabled && !loading ? (
          <div className="flex items-center justify-end px-3 py-2 border-t border-gray-100 bg-gray-50">
            <button
              type="button"
              disabled={!escolhidos.length}
              onClick={incluirSelecionados}
              className="h-7 px-2.5 rounded text-[11px] font-medium text-white bg-[#4ECDC4] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Incluir selecionados{escolhidos.length ? ` (${escolhidos.length})` : ""}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
