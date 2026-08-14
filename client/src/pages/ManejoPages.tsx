import AppLayout from "@/components/AppLayout";
import { useLocation, useSearch } from "wouter";
import { useEffect, useMemo, type ComponentType } from "react";
import {
  Nfc,
  Weight,
  Syringe,
  HeartPulse,
  ArrowLeftRight,
  Stethoscope,
  MilkOff,
  type LucideProps,
} from "lucide-react";

const FD_PRIMARY = "#4ECDC4";
const ICON_CLASS = "h-5 w-5 shrink-0";
const ICON_STROKE = 2;

export const TIPOS_MANEJO = [
  {
    id: "brinco-eletronico",
    label: "Brinco Eletrônico",
    icon: Nfc,
    descricao: "Brincos, chip e identificação eletrônica do animal",
  },
  {
    id: "pesagem",
    label: "Pesagem",
    icon: Weight,
    descricao: "Registro de peso dos animais",
  },
  {
    id: "sanitario",
    label: "Sanitário",
    icon: Syringe,
    descricao: "Vacinação, vermifugação e tratamentos",
  },
  {
    id: "reprodutivo",
    label: "Reprodutivo",
    icon: HeartPulse,
    descricao: "Cobertura, IATF e manejo reprodutivo",
  },
  {
    id: "troca-lote",
    label: "Troca de Lote",
    icon: ArrowLeftRight,
    descricao: "Movimentação entre lotes",
  },
  {
    id: "castracao",
    label: "Castração",
    icon: Stethoscope,
    descricao: "Registro de castração",
  },
  {
    id: "desmama",
    label: "Desmama",
    icon: MilkOff,
    descricao: "Separação de bezerros",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  icon: ComponentType<LucideProps>;
  descricao: string;
}>;

export type TipoManejoId = (typeof TIPOS_MANEJO)[number]["id"];

function NovoManejoButton({ className }: { className?: string }) {
  const [, setLocation] = useLocation();
  return (
    <button
      type="button"
      onClick={() => setLocation("/manejo/registros")}
      className={
        className ??
        "inline-flex items-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 transition shrink-0 min-h-[44px]"
      }
      style={{ backgroundColor: FD_PRIMARY }}
    >
      <span className="material-icons text-[16px]">add</span>
      Novo manejo
    </button>
  );
}

/** Stub de Visão Geral — layout interno será definido em tarefa posterior. */
export function ManejoVisaoGeralPage() {
  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Visão Geral — Manejo
          </h1>
          <NovoManejoButton />
        </div>
        <div className="p-8 text-center">
          <span className="material-icons text-4xl text-gray-200 mb-2 block">assignment</span>
          <p className="text-[12px] text-gray-400">Visão Geral em desenvolvimento</p>
          <p className="text-[11px] text-gray-300 mt-1">
            Use Registros de Manejo para consultar o histórico ou registre um novo manejo.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}

/** Listagem dos tipos de manejo disponíveis. */
export function ManejoRegistrosPage() {
  const [, setLocation] = useLocation();

  return (
    <AppLayout>
      <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h1
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Registros de Manejo
          </h1>
          <p className="text-[12px] text-gray-500 mt-1">
            Selecione o manejo que deseja registrar.
          </p>
        </div>

        <div className="overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                  Tipo
                </th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">
                  Descrição
                </th>
                <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-gray-500 uppercase tracking-wide w-[120px]">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_MANEJO.map(tipo => {
                const Icon = tipo.icon;
                return (
                <tr
                  key={tipo.id}
                  className="border-b border-gray-100 hover:bg-[#4ECDC4]/[0.05] transition-colors"
                >
                  <td className="px-5 py-3 align-middle">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="inline-flex h-[22px] w-[22px] items-center justify-center shrink-0 text-[#4ECDC4]"
                        aria-hidden="true"
                      >
                        <Icon className={ICON_CLASS} strokeWidth={ICON_STROKE} />
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{tipo.label}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 sm:hidden">
                          {tipo.descricao}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 align-middle text-gray-500 hidden sm:table-cell">
                    {tipo.descricao}
                  </td>
                  <td className="px-5 py-3 align-middle text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setLocation(
                          `/manejo/registros/cadastro?tipo=${encodeURIComponent(tipo.id)}`,
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white hover:brightness-95 transition min-h-[36px]"
                      style={{ backgroundColor: FD_PRIMARY }}
                    >
                      <span className="material-icons text-[14px]">add</span>
                      Registrar
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

/** Cadastro contextualizado pelo tipo escolhido em Registros (?tipo=). */
export function ManejoFormPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tipoId = useMemo(() => {
    const raw = new URLSearchParams(search).get("tipo") ?? "";
    return TIPOS_MANEJO.some(t => t.id === raw) ? (raw as TipoManejoId) : null;
  }, [search]);
  const tipo = TIPOS_MANEJO.find(t => t.id === tipoId) ?? null;

  useEffect(() => {
    if (!tipo) setLocation("/manejo/registros");
  }, [tipo, setLocation]);

  if (!tipo) return null;

  return (
    <AppLayout>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1
          className="text-[20px] font-semibold text-gray-900"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          {tipo.label}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocation("/manejo/registros")}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-[12px] text-gray-700 font-semibold hover:bg-gray-50 min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white text-[12px] font-semibold min-h-[40px]"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            Salvar
          </button>
        </div>
      </div>
      <div className="bg-white rounded shadow-sm border border-gray-100 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Data</label>
            <input
              type="date"
              className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-gray-600 font-medium mb-1">Lote</label>
            <select className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]">
              <option>Selecione um lote</option>
              <option>Lote Vacas</option>
              <option>Lote Engorda</option>
              <option>Lote Recria</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] text-gray-600 font-medium mb-1">
              Responsável
            </label>
            <input
              type="text"
              placeholder="Digite o nome"
              className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 min-h-[34px]"
            />
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-[11px] text-gray-600 font-medium mb-1">Observações</label>
          <textarea
            rows={3}
            className="w-full text-[12px] border border-gray-200 rounded px-3 py-2 text-gray-700 resize-none"
            placeholder="Notas adicionais..."
          />
        </div>
      </div>
    </AppLayout>
  );
}
