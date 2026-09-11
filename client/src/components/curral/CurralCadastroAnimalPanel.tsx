import { At05RfidReaderControl } from "@/components/At05RfidReaderControl";
import { FormInput, FormLabel, FormSelect } from "@/components/FormFields";
import { BrincoNumpadField } from "@/components/curral/BrincoNumpadField";
import { curralResultadoToggleGridClass } from "@/lib/curralReprodutivoUi";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SelectItem } from "@/components/ui/select";
import { getCategoriasPorSexo } from "@shared/animal-types";
import {
  buildPayloadCadastroSuperficialCurral,
  categoriaPadraoCadastroCurral,
  MSG_CURRAL_CADASTRO_SUCESSO,
  validarCadastroSuperficialCurral,
  type SexoCadastroCurral,
} from "@shared/curralCadastroAnimal";
import { normalizeRfidKey } from "@shared/rfidUnicidade";
import type { At05ReaderSession } from "@/hooks/useAt05Reader";
import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const FD_PRIMARY = "#4ECDC4";
const SEM_LOTE_VALUE = "__none__";

type Props = {
  fazendaNum: number;
  dataEntrada: string;
  loteIdSessao?: number | null;
  rascunho?: { brinco?: string | null; rfid?: string | null };
  /** Incrementa a cada abertura nova (identificação ou manual). */
  initKey: number;
  onSalvarEManejar: (animalId: number) => void;
  onCancelar: () => void;
  /** Sessão serial compartilhada da sessão no curral. */
  at05Session?: At05ReaderSession;
  bindAt05ReadHandler?: (handler: (rfid: string) => void) => () => void;
};

export function CurralCadastroAnimalPanel({
  fazendaNum,
  dataEntrada,
  loteIdSessao,
  rascunho,
  initKey,
  onSalvarEManejar,
  onCancelar,
  at05Session,
  bindAt05ReadHandler,
}: Props) {
  const trpcUtils = trpc.useUtils();
  const { data: lotes = [] } = trpc.lotes.list.useQuery({ somenteAtivos: true });

  const escutaContinuaCurral = Boolean(at05Session && bindAt05ReadHandler);

  const [brinco, setBrinco] = useState("");
  const [rfid, setRfid] = useState("");
  const [sexo, setSexo] = useState<SexoCadastroCurral | "">("");
  const [categoria, setCategoria] = useState("");
  const [loteId, setLoteId] = useState("");
  const [rfidLookupBusy, setRfidLookupBusy] = useState(false);

  useEffect(() => {
    setBrinco((rascunho?.brinco ?? "").trim());
    setRfid((rascunho?.rfid ?? "").trim());
    setSexo("");
    setCategoria("");
    setLoteId(loteIdSessao != null && loteIdSessao > 0 ? String(loteIdSessao) : SEM_LOTE_VALUE);
  }, [initKey, loteIdSessao, rascunho?.brinco, rascunho?.rfid]);

  useEffect(() => {
    if (!sexo) return;
    setCategoria(prev => {
      if (prev && getCategoriasPorSexo(sexo === "macho" ? "Macho" : "Fêmea").includes(prev)) {
        return prev;
      }
      return categoriaPadraoCadastroCurral(sexo);
    });
  }, [sexo]);

  const lotesFazenda = useMemo(
    () => lotes.filter(l => !fazendaNum || l.fazendaId == null || l.fazendaId === fazendaNum),
    [fazendaNum, lotes],
  );

  const categorias = useMemo(
    () => (sexo ? getCategoriasPorSexo(sexo === "macho" ? "Macho" : "Fêmea") : []),
    [sexo],
  );

  const validarRfidCadastro = useCallback(
    async (rfidBruto: string): Promise<boolean> => {
      const trimmed = normalizeRfidKey(rfidBruto);
      if (!trimmed) return false;

      if (normalizeRfidKey(rfid) === trimmed) return false;

      setRfidLookupBusy(true);
      try {
        const linked = await trpcUtils.animais.getByBrincoEletronicoExact.fetch({
          brincoEletronico: trimmed,
        });

        if (linked) {
          const status = (linked.status ?? "").toString().trim().toLowerCase();
          toast.error(
            status === "ativo"
              ? "Este RFID já está vinculado a outro animal ativo."
              : "Este RFID já foi vinculado a outro animal e não pode ser reutilizado.",
          );
          return false;
        }

        return true;
      } catch (error) {
        const err = error as Error;
        toast.error(err?.message || "Falha ao validar o RFID.");
        return false;
      } finally {
        setRfidLookupBusy(false);
      }
    },
    [rfid, trpcUtils],
  );

  const handleRfidRead = useCallback(
    async (rfidBruto: string) => {
      const ok = await validarRfidCadastro(rfidBruto);
      if (ok) setRfid(normalizeRfidKey(rfidBruto));
    },
    [validarRfidCadastro],
  );

  const mutation = trpc.animais.create.useMutation({
    onSuccess: async result => {
      toast.success(MSG_CURRAL_CADASTRO_SUCESSO);
      await trpcUtils.animais.list.invalidate();
      if (result.id) onSalvarEManejar(result.id);
    },
    onError: err => toast.error(err.message || "Não foi possível cadastrar o animal."),
  });

  const salvar = useCallback(() => {
    const sexoOk = sexo === "macho" || sexo === "femea" ? sexo : null;
    const ok = validarCadastroSuperficialCurral({
      brinco,
      sexo: sexoOk,
      categoria,
      fazendaId: fazendaNum,
    });
    if (!ok.ok) {
      toast.error(ok.message);
      return;
    }

    mutation.mutate(
      buildPayloadCadastroSuperficialCurral({
        fazendaId: fazendaNum,
        dataEntrada,
        brinco,
        sexo: sexoOk!,
        categoria,
        brincoEletronico: rfid,
        loteId: loteId && loteId !== SEM_LOTE_VALUE ? Number(loteId) : undefined,
      }),
    );
  }, [brinco, categoria, dataEntrada, fazendaNum, loteId, mutation, rfid, sexo]);

  const isSaving = mutation.isPending;
  const rfidBusy = isSaving || rfidLookupBusy;

  const bastaoStatusLinha = (() => {
    if (rfidLookupBusy) return "Validando RFID…";
    if (escutaContinuaCurral && at05Session?.sessionActive) {
      return "Bastão conectado — bipe a tag para preencher o RFID.";
    }
    if (escutaContinuaCurral) {
      return "Conecte o bastão abaixo ou digite o RFID manualmente.";
    }
    return "Use o bastão ou digite o RFID manualmente.";
  })();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#4ECDC4]/30 bg-[#4ECDC4]/8 px-4 py-3">
        <p className="text-[12px] font-semibold text-gray-900">Cadastro rápido no curral</p>
        <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
          Brinco, sexo e categoria para manejar agora. Leia o RFID com o bastão ou informe
          manualmente. Peso na pesagem · idade na desmama, se precisar. Complete a ficha depois em
          Rebanho.
        </p>
      </div>

      <div>
        <FormLabel required>Brinco visual</FormLabel>
        <BrincoNumpadField
          value={brinco}
          origem="manual"
          onChange={setBrinco}
          onManualInput={() => {}}
          onConfirm={salvar}
          disabled={isSaving}
          confirmPending={isSaving}
          showConfirm={false}
          emptyHint="Digite o brinco visual"
        />
      </div>

      <div className="space-y-2">
        <FormLabel>RFID (opcional)</FormLabel>
        <FormInput
          variant="light"
          value={rfid}
          onChange={setRfid}
          placeholder="Tag eletrônica"
          disabled={rfidBusy}
          autoComplete="off"
        />
        <At05RfidReaderControl
          variant="embedded"
          mode={escutaContinuaCurral ? "identificar" : "cadastro"}
          continuous={escutaContinuaCurral}
          currentValue={rfid}
          disabled={rfidBusy}
          onRfidRead={rfidLido => void handleRfidRead(rfidLido)}
          session={at05Session}
          bindReadHandler={bindAt05ReadHandler}
        />
        <p className="text-[10px] text-gray-400 leading-snug" aria-live="polite">
          {bastaoStatusLinha}
        </p>
      </div>

      <div>
        <FormLabel required>Sexo</FormLabel>
        <div className={curralResultadoToggleGridClass(2)}>
          {(
            [
              { id: "macho" as const, label: "Macho" },
              { id: "femea" as const, label: "Fêmea" },
            ] as const
          ).map(op => (
            <button
              key={op.id}
              type="button"
              disabled={isSaving}
              onClick={() => setSexo(op.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-[13px] font-semibold transition min-h-[48px]",
                sexo === op.id
                  ? "border-[#4ECDC4] bg-[#4ECDC4]/15 text-gray-900"
                  : "border-gray-200 bg-white text-gray-700 hover:border-[#4ECDC4]/40",
              )}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {sexo ? (
        <div>
          <FormLabel required>Categoria</FormLabel>
          <FormSelect variant="light" value={categoria} onChange={setCategoria} disabled={isSaving}>
            {categorias.map(c => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </FormSelect>
        </div>
      ) : null}

      <div>
        <FormLabel>Lote (opcional)</FormLabel>
        <FormSelect
          variant="light"
          value={loteId || SEM_LOTE_VALUE}
          onChange={setLoteId}
          disabled={isSaving}
        >
          <SelectItem value={SEM_LOTE_VALUE}>Sem lote</SelectItem>
          {lotesFazenda.map(l => (
            <SelectItem key={l.id} value={String(l.id)}>
              {l.nome}
            </SelectItem>
          ))}
        </FormSelect>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          onClick={salvar}
          disabled={isSaving}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full text-gray-900 text-[13px] font-bold uppercase tracking-wide min-h-[52px] hover:opacity-95 disabled:opacity-40"
          style={{ backgroundColor: FD_PRIMARY }}
        >
          <UserPlus className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
          {isSaving ? "Salvando…" : "Salvar e manejar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          disabled={isSaving}
          className="sm:w-auto w-full inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-5 min-h-[52px] text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
