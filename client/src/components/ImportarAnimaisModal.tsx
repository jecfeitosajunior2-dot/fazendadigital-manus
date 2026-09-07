/**
 * ImportarAnimaisModal — Modal de Importação em Massa de Animais
 *
 * Fluxo em 3 etapas:
 *   1. Upload  → usuário baixa modelo ou faz upload de XLSX/XLS/CSV
 *   2. Validação → exibe resumo e erros por linha antes de confirmar
 *   3. Resultado → relatório final com totais e botões de ação
 */
import React, { useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  normalizarLinha,
  isLinhaExemplo,
  mensagemErroTecnicoImportacao,
  isErroDataReferenciaImportacao,
  linhasComErroDataReferencia,
  resumoLinhasDataReferencia,
  somenteErrosDataReferencia,
} from '@shared/importacaoAnimais';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRight,
  RotateCcw,
  ListChecks,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const FD_PRIMARY = '#4ECDC4';

const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[40px]';

const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-4 rounded-lg text-[12px] font-semibold border border-gray-200 bg-[#EEEEEE] text-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[40px]';

const stepCard = 'border border-gray-200 rounded shadow-sm bg-white p-4';

const metricCard = 'border border-gray-200 rounded shadow-sm bg-white p-3 text-center';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Etapa = 'upload' | 'validacao' | 'resultado';

type ErroValidacao = {
  linha: number;
  campo: string;
  mensagem: string;
};

type ResultadoValidacao = {
  total: number;
  validos: number;
  invalidos: number;
  erros: ErroValidacao[];
  mensagemPrincipal?: string;
  mensagemDetalhada?: string;
  loteNomeParaId: Record<string, number>;
  fazendaNomeParaId?: Record<string, number>;
  pastoNomeParaId?: Record<string, number>;
};

type ResultadoImportacao = {
  total: number;
  importados: number;
  rejeitados: number;
  detalhesRejeitados: { linha: number; mensagem: string }[];
};

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onImportado?: () => void;
}

export const ImportarAnimaisModal: React.FC<Props> = ({ open, onClose, onImportado }) => {
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [validacao, setValidacao] = useState<ResultadoValidacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [mostrarErros, setMostrarErros] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const gerarModeloMutation = trpc.animais.gerarModeloPlanilha.useMutation();
  const validarMutation = trpc.animais.validarImportacao.useMutation();
  const importarMutation = trpc.animais.importar.useMutation();

  // ── Reset ao fechar ──
  const handleClose = () => {
    setEtapa('upload');
    setArquivo(null);
    setLinhas([]);
    setValidacao(null);
    setResultado(null);
    setMostrarErros(false);
    onClose();
  };

  // ── Download do modelo ──
  const handleDownloadModelo = () => {
    gerarModeloMutation.mutate(undefined, {
      onSuccess: (res) => {
        const bin = atob(res.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Modelo baixado com sucesso!');
      },
      onError: (err) => toast.error(`Erro ao gerar modelo: ${err.message}`),
    });
  };

  // ── Parse do arquivo ──
  const parseArquivo = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // cellDates:true → SheetJS retorna objetos Date para células de data,
        // evitando que o formato da célula (MM/DD vs DD/MM) inverta dia/mês.
        const wb = XLSX.read(data, { type: 'binary', cellDates: true });
        // Prioriza a aba 'Animais' se existir; caso contrário usa a primeira aba
        const sheetName = wb.SheetNames.includes('Animais') ? 'Animais' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
          defval: '',
          raw: true, // mantém objetos Date para células de data
        });

        // Converte um valor de célula para string segura.
        // Objetos Date são convertidos para DD/MM/AAAA (formato BR) de forma
        // determinística, sem depender do locale do sistema operacional.
        const celulaPraString = (v: unknown): string => {
          if (v instanceof Date) {
            // Usa UTC para evitar que o fuso horário do cliente altere o dia
            const d = String(v.getUTCDate()).padStart(2, '0');
            const m = String(v.getUTCMonth() + 1).padStart(2, '0');
            const y = v.getUTCFullYear();
            return `${d}/${m}/${y}`;
          }
          return String(v ?? '').trim();
        };

        // Converte todos os valores para string, filtra linhas completamente
        // vazias E remove a linha de EXEMPLO ilustrativa (defesa estrutural
        // que funciona mesmo com planilhas antigas que traziam a linha embutida)
        const linhasStr = rows
          .map(row =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k.trim(), celulaPraString(v)])
            )
          )
          .filter(row => Object.values(row).some(v => v !== ''))
          .filter(row => !isLinhaExemplo(normalizarLinha(row)));
        if (linhasStr.length === 0) {
          toast.error('A planilha está vazia ou não contém dados.');
          return;
        }
        setLinhas(linhasStr);
        setArquivo(file);
        toast.success(`${linhasStr.length} linha(s) detectada(s) na planilha.`);
      } catch {
        toast.error('Erro ao ler o arquivo. Verifique se é um XLSX, XLS ou CSV válido.');
      }
    };
    reader.readAsBinaryString(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseArquivo(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseArquivo(file);
  };

  // ── Validação ──
  const handleValidar = () => {
    if (linhas.length === 0) {
      toast.error('Nenhum dado para validar. Faça o upload da planilha primeiro.');
      return;
    }
    validarMutation.mutate({ linhas }, {
      onSuccess: (res) => {
        setValidacao(res);
        setEtapa('validacao');
        if (res.erros.length > 0) {
          setMostrarErros(true);
          toast.error(res.mensagemPrincipal || 'Corrija os erros na planilha antes de importar.');
        }
      },
      onError: (err) => toast.error(mensagemErroTecnicoImportacao(err.message)),
    });
  };

  // ── Importação ──
  const handleImportar = () => {
    if (!validacao) return;
    // Filtra apenas as linhas sem erros
    const linhasComErro = new Set(validacao.erros.map(e => e.linha - 2)); // -2 para índice 0-based
    const linhasValidas = linhas.filter((_, i) => !linhasComErro.has(i));

    importarMutation.mutate(
      {
        linhas: linhasValidas,
        loteNomeParaId: validacao.loteNomeParaId,
        fazendaNomeParaId: validacao.fazendaNomeParaId,
        pastoNomeParaId: validacao.pastoNomeParaId,
      },
      {
        onSuccess: (res) => {
          setResultado(res);
          setEtapa('resultado');
          utils.animais.list.invalidate();
          onImportado?.();
        },
        onError: (err) => toast.error(mensagemErroTecnicoImportacao(err.message)),
      }
    );
  };

  // ─── Renderização por etapa ────────────────────────────────────────────────

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
            <p className="text-[13px] font-semibold text-[#4ECDC4] mb-1">Baixe o modelo de planilha</p>
            <p className="text-[11px] text-gray-500 mb-3 leading-relaxed">
              Modelo com colunas do cadastro, abas de Instruções e Dicionário, listas suspensas e
              campos obrigatórios marcados com <strong>*</strong>. Datas no formato{' '}
              <strong>dd/mm/aaaa</strong>.
            </p>
            <button
              type="button"
              onClick={handleDownloadModelo}
              disabled={gerarModeloMutation.isPending}
              className={btnPrimary}
              style={{ backgroundColor: FD_PRIMARY }}
            >
              {gerarModeloMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Baixar Modelo da Planilha
            </button>
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
            <p className="text-[13px] font-semibold text-[#4ECDC4] mb-1">Preencha e envie a planilha</p>
            <p className="text-[11px] text-gray-500 mb-3">
              Formatos aceitos: <strong>XLSX</strong>, <strong>XLS</strong>, <strong>CSV</strong>
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
                  <FileSpreadsheet className="w-10 h-10 text-emerald-600" />
                  <p className="font-semibold text-gray-800 text-[13px]">{arquivo.name}</p>
                  <p className="text-[11px] text-gray-500">{linhas.length} linha(s) detectada(s)</p>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setArquivo(null);
                      setLinhas([]);
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
                  <p className="text-[11px] text-gray-400">XLSX, XLS ou CSV</p>
                </div>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3 pt-1 border-t border-gray-100">
        <button type="button" onClick={handleClose} className={btnSecondary}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleValidar}
          disabled={linhas.length === 0 || validarMutation.isPending}
          className={btnPrimary}
          style={{ backgroundColor: FD_PRIMARY }}
        >
          {validarMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          Validar Planilha
        </button>
      </div>
    </div>
  );

  const renderValidacao = () => {
    if (!validacao) return null;
    const temErros = validacao.erros.length > 0;
    // Agrupa erros por linha
    const errosPorLinha = validacao.erros.reduce<Record<number, ErroValidacao[]>>((acc, e) => {
      if (!acc[e.linha]) acc[e.linha] = [];
      acc[e.linha].push(e);
      return acc;
    }, {});
    const linhasComErro = Object.keys(errosPorLinha).map(Number).sort((a, b) => a - b);
    const linhasDataRef = linhasComErroDataReferencia(validacao.erros);
    const exibirListaDetalhada = !(
      linhasComErro.length === 1 && somenteErrosDataReferencia(validacao.erros)
    );

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className={metricCard}>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">{validacao.total}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Total de registros</p>
          </div>
          <div className={metricCard}>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{validacao.validos}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Válidos</p>
          </div>
          <div className={metricCard}>
            <p className={cn('text-2xl font-bold tabular-nums', temErros ? 'text-red-700' : 'text-emerald-700')}>
              {validacao.invalidos}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Com erro</p>
          </div>
        </div>

        {!temErros ? (
          <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50/60 rounded-lg p-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-[13px] text-emerald-900 font-medium">
              Todos os {validacao.total} registros estão válidos e prontos para importação!
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 border border-red-200 bg-red-50/60 rounded-lg p-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] text-red-900 font-medium whitespace-pre-line">
                {validacao.mensagemPrincipal || 'Corrija os erros na planilha antes de importar.'}
              </p>
              {validacao.mensagemDetalhada && !somenteErrosDataReferencia(validacao.erros) && (
                <p className="text-[11px] text-red-800 mt-2 whitespace-pre-line">
                  {validacao.mensagemDetalhada}
                </p>
              )}
              <p className="text-[11px] text-red-800 mt-2">
                A importação só pode continuar depois que todos os registros estiverem válidos.
              </p>
            </div>
          </div>
        )}

        {temErros && exibirListaDetalhada && (
          <div>
            {linhasDataRef.length >= 2 && (
              <p className="text-[13px] font-medium text-red-800 mb-2">
                {resumoLinhasDataReferencia(linhasDataRef.length)}
              </p>
            )}
            <button
              type="button"
              onClick={() => setMostrarErros(v => !v)}
              className="flex items-center gap-1.5 text-[13px] font-semibold text-red-700 hover:text-red-900 transition-colors"
            >
              <XCircle className="w-4 h-4" />
              {mostrarErros ? 'Ocultar erros' : `Ver ${linhasComErro.length} linha(s) com erro`}
            </button>

            {mostrarErros && (
              <div className="mt-3 max-h-52 overflow-y-auto border border-red-200 rounded-lg divide-y divide-red-100">
                {linhasComErro.map(numLinha => (
                  <div key={numLinha} className="p-3 bg-red-50/80">
                    <p className="text-[11px] font-bold text-red-800 mb-1">Linha {numLinha}</p>
                    {errosPorLinha[numLinha].map((e, idx) => (
                      <p key={idx} className="text-[11px] text-red-700">
                        {isErroDataReferenciaImportacao(e)
                          ? `• ${e.mensagem}`
                          : <>• <span className="font-semibold">{e.campo}:</span> {e.mensagem}</>}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-3 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              setEtapa('upload');
              setValidacao(null);
              setMostrarErros(false);
            }}
            className={btnSecondary}
          >
            <RotateCcw className="w-4 h-4" />
            Voltar
          </button>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleClose} className={btnSecondary}>
              Cancelar
            </button>
            {!temErros && (
              <button
                type="button"
                onClick={handleImportar}
                disabled={importarMutation.isPending}
                className={btnPrimary}
                style={{ backgroundColor: FD_PRIMARY }}
              >
                {importarMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Importar {validacao.validos} animal(is)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderResultado = () => {
    if (!resultado) return null;
    const sucesso = resultado.rejeitados === 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center py-3">
          {sucesso ? (
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-2" />
          ) : (
            <AlertTriangle className="w-14 h-14 text-amber-500 mb-2" />
          )}
          <h3
            className="text-[18px] font-semibold text-gray-900"
            style={{ fontFamily: 'Fraunces, serif' }}
          >
            {sucesso ? 'Importação concluída!' : 'Importação concluída com avisos'}
          </h3>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className={metricCard}>
            <p className="text-2xl font-bold text-gray-800 tabular-nums">{resultado.total}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Processados</p>
          </div>
          <div className={metricCard}>
            <p className="text-2xl font-bold text-emerald-700 tabular-nums">{resultado.importados}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Importados</p>
          </div>
          <div className={metricCard}>
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                resultado.rejeitados > 0 ? 'text-red-700' : 'text-emerald-700',
              )}
            >
              {resultado.rejeitados}
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">Rejeitados</p>
          </div>
        </div>

        {resultado.detalhesRejeitados.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-red-700 mb-2">Registros rejeitados:</p>
            <div className="max-h-40 overflow-y-auto border border-red-200 rounded-lg divide-y divide-red-100">
              {resultado.detalhesRejeitados.map((r, i) => (
                <div key={i} className="p-2.5 bg-red-50/80">
                  <p className="text-[11px] text-red-700">
                    <span className="font-bold">Linha {r.linha}:</span> {r.mensagem}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-1 border-t border-gray-100">
          <button
            type="button"
            onClick={() => {
              setEtapa('upload');
              setArquivo(null);
              setLinhas([]);
              setValidacao(null);
              setResultado(null);
              setMostrarErros(false);
            }}
            className={cn(btnSecondary, 'flex-1')}
          >
            <RotateCcw className="w-4 h-4" />
            Nova Importação
          </button>
          <button
            type="button"
            onClick={handleClose}
            className={cn(btnPrimary, 'flex-1')}
            style={{ backgroundColor: FD_PRIMARY }}
          >
            <ListChecks className="w-4 h-4" />
            Ir para Lista de Animais
          </button>
        </div>
      </div>
    );
  };

  // ─── Títulos por etapa ────────────────────────────────────────────────────

  const titulos: Record<Etapa, { title: string; desc: string }> = {
    upload: {
      title: 'Importar Animais em Massa',
      desc: 'Baixe o modelo com coluna Fazenda, preencha os dados e envie a planilha.',
    },
    validacao: {
      title: 'Pré-validação da Planilha',
      desc: 'Verifique os erros antes de confirmar a importação.',
    },
    resultado: {
      title: 'Relatório de Importação',
      desc: 'Resumo do processamento realizado.',
    },
  };

  // ─── Indicador de etapas ──────────────────────────────────────────────────

  const etapas: { id: Etapa; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'validacao', label: 'Validação' },
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
          {etapa === 'validacao' && renderValidacao()}
          {etapa === 'resultado' && renderResultado()}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportarAnimaisModal;
