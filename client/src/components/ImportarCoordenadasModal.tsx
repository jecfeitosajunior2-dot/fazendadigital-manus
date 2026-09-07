import React, { useRef, useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import { isArquivoCoordenadasValido, readKmlFromFile } from '@/lib/readKmlFile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  Loader2,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FD_PRIMARY = '#4ECDC4';

const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[40px]';

const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold border border-gray-200 bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[40px]';

const stepCard = 'border border-gray-200 rounded shadow-sm bg-white p-4';

const metricCard = 'border border-gray-200 rounded shadow-sm bg-white p-3 text-center';

type Etapa = 'upload' | 'resultado';

type ResultadoImportacao = {
  importados: number;
  ignorados: string[];
  totalNoArquivo: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  fazendaId: number;
  onImportado?: () => void;
};

export function ImportarCoordenadasModal({ open, onClose, fazendaId, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  const utils = trpc.useUtils();

  const resetState = useCallback(() => {
    setEtapa('upload');
    setArquivo(null);
    setIsDragging(false);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const importarMutation = trpc.pastos.importarCoordenadas.useMutation({
    onSuccess: (res) => {
      setResultado(res);
      setEtapa('resultado');
      utils.pastos.listByFazenda.invalidate({ fazendaId });
      utils.pastos.list.invalidate();
      utils.pastos.listWithDetails.invalidate();
      onImportado?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileChange = (file: File | null) => {
    if (!file) {
      setArquivo(null);
      return;
    }
    if (!isArquivoCoordenadasValido(file.name)) {
      toast.error('Formato inválido. Utilize arquivos .kml ou .kmz');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setArquivo(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileChange(file);
  };

  const handleImportar = async () => {
    if (!arquivo) {
      toast.error('Selecione um arquivo KML ou KMZ');
      return;
    }
    try {
      const kmlContent = await readKmlFromFile(arquivo);
      importarMutation.mutate({ fazendaId, kmlContent });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao ler arquivo');
    }
  };

  const renderUpload = () => (
    <div className="space-y-4">
      <div className={stepCard}>
        <div className="flex items-start gap-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            1
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#4ECDC4] mb-1">Antes de importar</p>
            <ul className="text-[11px] text-gray-500 space-y-1 leading-relaxed list-disc pl-4">
              <li>Cadastre as subdivisões da fazenda (pastos, piquetes, currais etc.)</li>
              <li>
                Os nomes no arquivo devem corresponder ao <strong>nome</strong> ou à{' '}
                <strong>sigla</strong> cadastrados
              </li>
              <li>Se houver nomes duplicados no arquivo, prevalece a última ocorrência</li>
            </ul>
          </div>
        </div>
      </div>

      <div className={stepCard}>
        <div className="flex items-start gap-3">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 text-white"
            style={{ backgroundColor: FD_PRIMARY }}
          >
            2
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#4ECDC4] mb-1">Envie o arquivo KML ou KMZ</p>
            <p className="text-[11px] text-gray-500 mb-3">
              O arquivo deve conter o contorno de cada subdivisão.
            </p>

            <div
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-[#4ECDC4] bg-[#4ECDC4]/5'
                  : arquivo
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-gray-300 hover:border-[#4ECDC4] hover:bg-[#4ECDC4]/5',
              )}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              {arquivo ? (
                <div className="flex flex-col items-center gap-2">
                  <FileUp className="w-10 h-10 text-emerald-600" />
                  <p className="font-semibold text-gray-800 text-[13px]">{arquivo.name}</p>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setArquivo(null);
                      if (inputRef.current) inputRef.current.value = '';
                    }}
                    className="text-[11px] text-gray-500 hover:text-red-500 underline mt-1"
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-10 h-10 text-gray-400" />
                  <p className="text-[13px] text-gray-600">
                    <span className="font-semibold text-[#4ECDC4]">Clique para selecionar</span> ou arraste o
                    arquivo aqui
                  </p>
                  <p className="text-[11px] text-gray-400">KML ou KMZ</p>
                </div>
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".kml,.kmz"
              className="hidden"
              onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <button type="button" onClick={handleClose} className={btnSecondary}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleImportar}
          disabled={!arquivo || importarMutation.isPending}
          className={btnPrimary}
          style={{ backgroundColor: FD_PRIMARY }}
        >
          {importarMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {importarMutation.isPending ? 'Importando...' : 'Importar coordenadas'}
        </button>
      </div>
    </div>
  );

  const renderResultado = () => {
    if (!resultado) return null;

    const sucesso = resultado.importados > 0 && resultado.ignorados.length === 0;
    const parcial = resultado.importados > 0 && resultado.ignorados.length > 0;
    const falha = resultado.importados === 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-3">
          {sucesso ? (
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-2" />
          ) : parcial ? (
            <AlertTriangle className="w-14 h-14 text-amber-500 mb-2" />
          ) : (
            <AlertTriangle className="w-14 h-14 text-red-500 mb-2" />
          )}
          <h3
            className="text-[18px] font-semibold text-gray-900 text-center"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {sucesso
              ? 'Importação concluída!'
              : parcial
                ? 'Importação concluída com avisos'
                : 'Nenhuma coordenada importada'}
          </h3>
          {falha && (
            <p className="text-[11px] text-gray-500 mt-1 text-center max-w-sm">
              Verifique se as subdivisões estão cadastradas e se os nomes do arquivo correspondem ao
              nome ou sigla cadastrados.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className={metricCard}>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">{resultado.totalNoArquivo}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">No arquivo</p>
          </div>
          <div className={metricCard}>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{resultado.importados}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Atualizadas</p>
          </div>
          <div className={metricCard}>
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                resultado.ignorados.length > 0 ? 'text-amber-700' : 'text-emerald-700',
              )}
            >
              {resultado.ignorados.length}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Ignorados</p>
          </div>
        </div>

        {resultado.ignorados.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-amber-800 mb-2">
              Nomes sem subdivisão correspondente:
            </p>
            <div className="max-h-40 overflow-y-auto border border-amber-200 rounded-lg divide-y divide-amber-100">
              {resultado.ignorados.map(nome => (
                <div key={nome} className="px-3 py-2 bg-amber-50/80">
                  <p className="text-[11px] text-amber-900">{nome}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setResultado(null);
              setArquivo(null);
              setEtapa('upload');
              if (inputRef.current) inputRef.current.value = '';
            }}
            className={btnSecondary}
          >
            <RotateCcw className="w-4 h-4" />
            Nova importação
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={cn(btnPrimary, 'flex-1 sm:flex-none')}
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <MapPin className="w-4 h-4" />
            Fechar
          </button>
        </div>
      </div>
    );
  };

  const titulos: Record<Etapa, { title: string; desc: string }> = {
    upload: {
      title: 'Importar Coordenadas',
      desc: 'Envie um arquivo KML ou KMZ com os contornos das subdivisões da fazenda.',
    },
    resultado: {
      title: 'Relatório de Importação',
      desc: 'Resumo do processamento realizado.',
    },
  };

  const etapas: { id: Etapa; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'resultado', label: 'Resultado' },
  ];
  const etapaIdx = etapas.findIndex(e => e.id === etapa);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-gray-100 shrink-0 text-left space-y-1">
          <DialogTitle
            className="text-[20px] font-semibold text-gray-900"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {titulos[etapa].title}
          </DialogTitle>
          <DialogDescription className="text-[11px] text-gray-500">
            {titulos[etapa].desc}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center gap-0 mb-4">
            {etapas.map((e, idx) => (
              <React.Fragment key={e.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                      idx < etapaIdx
                        ? 'bg-emerald-500 text-white'
                        : idx === etapaIdx
                          ? 'text-white'
                          : 'bg-gray-200 text-gray-500',
                    )}
                    style={idx === etapaIdx ? { backgroundColor: FD_PRIMARY } : undefined}
                  >
                    {idx < etapaIdx ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] mt-1 font-medium',
                      idx === etapaIdx
                        ? 'text-[#4ECDC4]'
                        : idx < etapaIdx
                          ? 'text-emerald-600'
                          : 'text-gray-400',
                    )}
                  >
                    {e.label}
                  </span>
                </div>
                {idx < etapas.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-0.5 mx-2 mb-4 transition-colors',
                      idx < etapaIdx ? 'bg-emerald-400' : 'bg-gray-200',
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {etapa === 'upload' && renderUpload()}
          {etapa === 'resultado' && renderResultado()}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImportarCoordenadasModal;
