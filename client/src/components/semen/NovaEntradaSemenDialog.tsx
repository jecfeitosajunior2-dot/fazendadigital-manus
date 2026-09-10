import { AnimalAutocomplete } from "@/components/AnimalAutocomplete";
import {
  SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL,
  SemenReprodutorExternoField,
} from "@/components/SemenReprodutorExternoField";
import { CadastrarSemenExternoDialog } from "@/components/semen/CadastrarSemenExternoDialog";
import {
  FD_PRIMARY,
  FormDatePicker,
  FormInput,
  FormLabel,
  FormNativeSelect,
} from "@/components/FormFields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SEMEN_ENTRADA_FIELD_LIGHT,
  semenEntradaModalLayout,
} from "@/lib/semenEntradaModalLayout";
import type { SemenEntradaPrefill } from "@/lib/semenEstoqueEntradaPrefill";
import { trpc } from "@/lib/trpc";
import { formatCurrencyBrl } from "@/lib/utils";
import type { AnimalAutocompleteRow } from "@shared/animalAutocomplete";
import { toDateOnlyISO } from "@shared/carenciaAnimal";
import { filterMachosReprodutoresCandidatos } from "@shared/reproMachoSelect";
import {
  SEMEN_ORIGEM_EXTERNO,
  SEMEN_ORIGEM_INTERNO,
  formatSemenCustoTotalDisplay,
  isSemenEntradaFormSubmittable,
  parseSemenCustoTotal,
  parseSemenQuantidadeDoses,
} from "@shared/semenEstoque";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function SemenEntradaSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={semenEntradaModalLayout.section}>
      <h3 className={semenEntradaModalLayout.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

export type NovaEntradaSemenSuccess = {
  movimentacaoId: number;
  partidaId: number;
  saldoAtual: number;
  custoMedioAtual: string | null;
  novaEntrada: boolean;
};

type NovaEntradaSemenDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fazendaId: number;
  animais: AnimalAutocompleteRow[];
  loadingAnimais: boolean;
  prefill: SemenEntradaPrefill | null;
  onSuccess: (result: NovaEntradaSemenSuccess) => void;
};

export function NovaEntradaSemenDialog({
  open,
  onOpenChange,
  fazendaId,
  animais,
  loadingAnimais,
  prefill,
  onSuccess,
}: NovaEntradaSemenDialogProps) {
  const locked = prefill != null;
  const [origem, setOrigem] = useState<"" | typeof SEMEN_ORIGEM_INTERNO | typeof SEMEN_ORIGEM_EXTERNO>(
    "",
  );
  const [machoSel, setMachoSel] = useState<AnimalAutocompleteRow | null>(null);
  const [reprodutorTexto, setReprodutorTexto] = useState("");
  const [partida, setPartida] = useState("");
  const [centralOrigem, setCentralOrigem] = useState("");
  const [quantidadeDoses, setQuantidadeDoses] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [dataEntrada, setDataEntrada] = useState(toDateOnlyISO(new Date()));
  const [cadastroReprodutorOpen, setCadastroReprodutorOpen] = useState(false);

  const resetForm = useCallback(() => {
    setOrigem("");
    setMachoSel(null);
    setReprodutorTexto("");
    setPartida("");
    setCentralOrigem("");
    setQuantidadeDoses("");
    setCustoUnitario("");
    setDataEntrada(toDateOnlyISO(new Date()));
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    setQuantidadeDoses("");
    setCustoUnitario("");
    setDataEntrada(toDateOnlyISO(new Date()));
    if (prefill) {
      setOrigem(prefill.origem);
      setReprodutorTexto(prefill.reprodutorTexto);
      setPartida(prefill.partida);
      setCentralOrigem(prefill.centralOrigem);
      setMachoSel(null);
    } else {
      resetForm();
    }
  }, [open, prefill, resetForm]);

  useEffect(() => {
    if (!open || !prefill || prefill.origem !== SEMEN_ORIGEM_INTERNO || prefill.machoId == null) {
      return;
    }
    const found = animais.find(a => a.id === prefill.machoId) ?? null;
    if (found) setMachoSel(found);
  }, [open, prefill, animais]);

  const qtdNum = parseSemenQuantidadeDoses(quantidadeDoses);
  const custoUnitNum = parseSemenCustoTotal(custoUnitario);
  const custoTotalCalculado =
    qtdNum != null && custoUnitNum != null
      ? formatSemenCustoTotalDisplay(qtdNum * custoUnitNum)
      : "—";

  const formCanSubmit = useMemo(
    () =>
      isSemenEntradaFormSubmittable({
        origem,
        machoId: machoSel?.id ?? prefill?.machoId ?? null,
        reprodutorTexto,
        partida,
        quantidadeDoses,
        custoTotal:
          qtdNum != null && custoUnitNum != null
            ? formatSemenCustoTotalDisplay(qtdNum * custoUnitNum)
            : "",
        dataEntrada,
      }),
    [
      origem,
      machoSel,
      prefill,
      reprodutorTexto,
      partida,
      quantidadeDoses,
      qtdNum,
      custoUnitNum,
      dataEntrada,
    ],
  );

  const filterMacho = useCallback(
    (a: AnimalAutocompleteRow) =>
      filterMachosReprodutoresCandidatos([a], { fazendaId }).length > 0,
    [fazendaId],
  );

  const { data: reprodutoresExternosCatalogo = [], isFetching: carregandoExternos } =
    trpc.semen.listCatalogoExternos.useQuery(
      { fazendaId },
      {
        enabled:
          open &&
          fazendaId > 0 &&
          origem === SEMEN_ORIGEM_EXTERNO &&
          !locked,
      },
    );

  const registrar = trpc.semen.registrarEntrada.useMutation({
    onSuccess: result => onSuccess(result),
    onError: err => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCanSubmit || registrar.isPending) return;

    const custoUnitParsed = parseSemenCustoTotal(custoUnitario);
    const qtdParsed = parseSemenQuantidadeDoses(quantidadeDoses);
    if (custoUnitParsed == null || qtdParsed == null || !origem) return;

    registrar.mutate({
      fazendaId,
      origemReprodutor: origem,
      machoId: origem === SEMEN_ORIGEM_INTERNO ? (machoSel?.id ?? prefill?.machoId ?? undefined) : undefined,
      reprodutorTexto: origem === SEMEN_ORIGEM_EXTERNO ? reprodutorTexto : undefined,
      partida,
      centralOrigem: centralOrigem || undefined,
      quantidadeDoses: qtdParsed,
      custoTotal: custoUnitParsed * qtdParsed,
      dataEntrada,
    });
  };

  const submitDisabled = !formCanSubmit || registrar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={semenEntradaModalLayout.content}
        data-semen-entrada-modal
      >
        <div className={semenEntradaModalLayout.shell}>
          <DialogHeader className={semenEntradaModalLayout.header}>
            <DialogTitle className="text-[15px] font-semibold text-gray-900 leading-tight">
              Nova entrada de Sêmen
            </DialogTitle>
          </DialogHeader>

          <form
            onSubmit={handleSubmit}
            className={semenEntradaModalLayout.form}
            data-semen-entrada-form
          >
          <div className={semenEntradaModalLayout.body} data-semen-entrada-body>
            <div className={semenEntradaModalLayout.formCard}>
              <SemenEntradaSection title="Reprodutor">
                <div>
                  <FormLabel required className="mb-1">
                    Origem do reprodutor
                  </FormLabel>
                  <FormNativeSelect
                    value={origem}
                    onChange={v => {
                      setOrigem(v as typeof origem);
                      setMachoSel(null);
                      setReprodutorTexto("");
                      setCentralOrigem("");
                    }}
                    disabled={locked}
                    variant="light"
                    compact
                    placeholder="Selecione a origem"
                    options={[
                      { value: SEMEN_ORIGEM_INTERNO, label: "Animal do rebanho" },
                      { value: SEMEN_ORIGEM_EXTERNO, label: "Sêmen / reprodutor externo" },
                    ]}
                  />
                </div>

                {origem === SEMEN_ORIGEM_INTERNO ? (
                  locked ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Macho do rebanho
                      </FormLabel>
                      <FormInput
                        value={prefill?.reprodutorDisplay ?? ""}
                        onChange={() => {}}
                        readOnly
                        variant="light"
                        compact
                      />
                    </div>
                  ) : (
                    <AnimalAutocomplete
                      label="Macho do rebanho"
                      required
                      selected={machoSel}
                      onSelect={setMachoSel}
                      animals={animais}
                      loading={loadingAnimais}
                      disabled={!fazendaId}
                      inputClassName={SEMEN_ENTRADA_FIELD_LIGHT}
                      placeholder="Busque pelo brinco ou nome do touro"
                      emptyMessage="Nenhum reprodutor elegível encontrado."
                      filterCandidate={filterMacho}
                    />
                  )
                ) : null}

                {origem === SEMEN_ORIGEM_EXTERNO ? (
                  locked ? (
                    <div>
                      <FormLabel required className="mb-1">
                        Reprodutor / Sêmen
                      </FormLabel>
                      <FormInput
                        value={reprodutorTexto}
                        onChange={() => {}}
                        readOnly
                        variant="light"
                        compact
                      />
                    </div>
                  ) : (
                    <SemenReprodutorExternoField
                      value={reprodutorTexto}
                      onChange={setReprodutorTexto}
                      onSelect={item => {
                        setReprodutorTexto(item.reprodutorTexto);
                        setCentralOrigem(item.centralPadrao ?? "");
                      }}
                      onCadastrarNovo={() => setCadastroReprodutorOpen(true)}
                      showCadastrarNovo={false}
                      cadastrarNovoLabel={SEMEN_REPRODUTOR_CADASTRAR_ENTRADA_LABEL}
                      options={reprodutoresExternosCatalogo}
                      disabled={!fazendaId}
                      loading={carregandoExternos}
                      inputClassName={SEMEN_ENTRADA_FIELD_LIGHT}
                      labelClassName="block text-[11px] font-semibold text-gray-700 mb-1"
                    />
                  )
                ) : null}
              </SemenEntradaSection>

              <SemenEntradaSection title="Partida">
                <div className={semenEntradaModalLayout.fieldGrid}>
                  <div>
                    <FormLabel className="mb-1">Partida / Lote</FormLabel>
                    <FormInput
                      value={partida}
                      onChange={setPartida}
                      placeholder="Ex.: L23081"
                      variant="light"
                      compact
                      readOnly={locked}
                    />
                  </div>
                  <div>
                    <FormLabel className="mb-1">Central / Origem</FormLabel>
                    <FormInput
                      value={centralOrigem}
                      onChange={setCentralOrigem}
                      placeholder="Ex.: Alta Genetics"
                      variant="light"
                      compact
                      readOnly={locked}
                    />
                  </div>
                </div>
              </SemenEntradaSection>

              <SemenEntradaSection title="Valores e data">
                <div className={semenEntradaModalLayout.fieldGrid3}>
                  <div>
                    <FormLabel required className="mb-1">
                      Doses
                    </FormLabel>
                    <FormInput
                      type="number"
                      min={1}
                      step={1}
                      value={quantidadeDoses}
                      onChange={setQuantidadeDoses}
                      placeholder="10"
                      variant="light"
                      compact
                      inputMode="numeric"
                    />
                  </div>
                  <div className="min-w-0">
                    <FormLabel required className="mb-1">
                      Custo unit.
                    </FormLabel>
                    <FormInput
                      value={custoUnitario}
                      onChange={v => setCustoUnitario(formatCurrencyBrl(v))}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      required
                      variant="light"
                      compact
                      aria-label="Custo unitário por dose em reais"
                    />
                  </div>
                  <div>
                    <FormLabel required className="mb-1">
                      Data
                    </FormLabel>
                    <FormDatePicker
                      value={dataEntrada}
                      onChange={setDataEntrada}
                      max={toDateOnlyISO(new Date())}
                      required
                      variant="light"
                      minHeight={34}
                    />
                  </div>
                </div>
                <p className={semenEntradaModalLayout.infoLine}>
                  Custo total: <strong className="text-gray-700">{custoTotalCalculado}</strong>
                </p>
              </SemenEntradaSection>
            </div>
          </div>

          <div className={semenEntradaModalLayout.footer} data-semen-entrada-footer>
            <div className={semenEntradaModalLayout.footerActions}>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={registrar.isPending}
                className="px-5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitDisabled}
                className="inline-flex items-center justify-center px-5 py-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wide text-gray-800 disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {registrar.isPending ? "Salvando…" : "Registrar entrada"}
              </button>
            </div>
          </div>
          </form>
        </div>
      </DialogContent>

      <CadastrarSemenExternoDialog
        open={cadastroReprodutorOpen}
        onOpenChange={setCadastroReprodutorOpen}
        fazendaId={fazendaId}
        initialReprodutorTexto={reprodutorTexto}
        onCreated={item => {
          setReprodutorTexto(item.reprodutorTexto);
          setCentralOrigem(item.centralPadrao ?? "");
          toast.success(`Reprodutor ${item.reprodutorTexto} cadastrado.`);
        }}
      />
    </Dialog>
  );
}
