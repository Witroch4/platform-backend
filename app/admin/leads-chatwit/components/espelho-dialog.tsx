"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Image as ImageIcon, Send, ArrowRight, Eye, FileText } from "lucide-react";
import { ImageGalleryDialog } from "./image-gallery-dialog";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { StructuredEditor } from './StructuredEditor';

import { Badge } from "@/components/ui/badge";
import type { LeadChatwit } from "../types";
import type { StudentMirrorPayload, StudentMirrorItem } from "@/lib/oab-eval/types";

interface EspelhoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadData?: LeadChatwit; // Adicionar dados completos do lead
  textoEspelho: any; // Pode ser null ou um objeto JSON
  imagensEspelho: string[];
  aguardandoEspelho?: boolean;
  onSave: (texto: any, imagens: string[]) => Promise<void>;
  onCancelarEspelho?: () => Promise<void>;
  // Props para modo batch
  batchMode?: boolean;
  batchInfo?: {
    current: number;
    total: number;
    leadName: string;
  };
  onBatchNext?: () => void;
  onBatchSkip?: () => void;
}

function asStudentMirrorPayload(value: unknown): StudentMirrorPayload | null {
  let candidate: unknown = value;

  if (!candidate) {
    return null;
  }

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (Array.isArray(candidate)) {
    // Legado: [{ textoDoEspelho: "..." }]
    const first = candidate[0] as any;
    if (first?.textoDoEspelho) {
      return asStudentMirrorPayload(first.textoDoEspelho);
    }
  }

  if (candidate && typeof candidate === 'object') {
    const obj = candidate as Record<string, unknown>;

    if (obj.payload && typeof obj.payload === 'object') {
      return asStudentMirrorPayload(obj.payload);
    }

    if (obj.json && typeof obj.json === 'object') {
      return asStudentMirrorPayload(obj.json);
    }

    if (obj.meta && obj.aluno && obj.itens) {
      return obj as unknown as StudentMirrorPayload;
    }
  }

  return null;
}

function formatScoreOptional(value: number | null | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return '-';
}

function groupQuestionItems(itens: StudentMirrorItem[]): Record<string, StudentMirrorItem[]> {
  return itens.reduce<Record<string, StudentMirrorItem[]>>((acc, item) => {
    if (!acc[item.questao]) {
      acc[item.questao] = [];
    }
    acc[item.questao].push(item);
    return acc;
  }, {});
}

function sumQuestionScore(items: StudentMirrorItem[]): number {
  const groupScores = new Map<string, number>();
  let total = 0;

  for (const item of items) {
    const score = typeof item.nota_obtida === 'number' ? item.nota_obtida : 0;

    if (Array.isArray(item.alternativas_grupo) && item.alternativas_grupo.length > 0) {
      const key = item.alternativas_grupo.slice().sort().join('|');
      const current = groupScores.get(key) ?? 0;
      if (score > current) {
        groupScores.set(key, score);
      }
      continue;
    }

    total += score;
  }

  for (const value of groupScores.values()) {
    total += value;
  }

  return Number.parseFloat(total.toFixed(2));
}

function StudentMirrorViewer({ payload }: { payload: StudentMirrorPayload }) {
  // Garantir que totais sempre existe com valores seguros
  const safePayload = useMemo(() => ({
    ...payload,
    totais: payload.totais || {
      peca: { obtido: 0, maximo: 10 },
      questoes: { obtido: 0, maximo: 10 },
      final: { obtido: 0, maximo: 20 },
    },
  }), [payload]);

  const pieceItems = useMemo(
    () => safePayload.itens.filter(item => item.escopo === 'Peça'),
    [safePayload.itens],
  );

  const questionItems = useMemo(
    () => safePayload.itens.filter(item => item.escopo === 'Questão'),
    [safePayload.itens],
  );

  const groupedQuestions = useMemo(() => groupQuestionItems(questionItems), [questionItems]);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold text-muted-foreground">Dados do Exame</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Exame</dt>
              <dd className="text-right text-foreground">{safePayload.meta?.exam ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Área</dt>
              <dd className="text-right text-foreground">{safePayload.meta?.area ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Fonte</dt>
              <dd className="text-right text-foreground">{safePayload.meta?.fonte ?? '-'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Aplicação</dt>
              <dd className="text-right text-foreground">{safePayload.meta?.data_aplicacao ?? '-'}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <h4 className="text-sm font-semibold text-muted-foreground">Dados do Examinando</h4>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Nome</dt>
              <dd className="text-right text-foreground">{safePayload.aluno.nome}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Inscrição</dt>
              <dd className="text-right text-foreground">{safePayload.aluno.inscricao}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Situação</dt>
              <dd className="text-right text-foreground">{safePayload.aluno.situacao}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Nota Final</dt>
              <dd className="text-right text-foreground">
                {formatScoreOptional(safePayload.aluno.nota_final)}
                {safePayload.aluno.nota_final_raw && (
                  <span className="ml-2 text-xs text-muted-foreground">(Imagem: {safePayload.aluno.nota_final_raw})</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h4 className="text-sm font-semibold text-muted-foreground">Totais</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
          {([
            { label: 'Peça', data: safePayload.totais.peca },
            { label: 'Questões', data: safePayload.totais.questoes },
            { label: 'Nota Final', data: safePayload.totais.final },
          ] as const).map(({ label, data }) => (
            <div key={label} className="rounded border bg-background p-3">
              <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold text-foreground">
                {formatScoreOptional(data.obtido)}
                {typeof data.maximo === 'number' && (
                  <span className="ml-1 text-sm text-muted-foreground">/ {data.maximo.toFixed(2)}</span>
                )}
              </div>
              {(typeof data.maximo_rubrica === 'number' || typeof data.obtido_rubrica === 'number') && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <div>Rubrica: {formatScoreOptional(data.obtido_rubrica)} / {formatScoreOptional(data.maximo_rubrica)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h4 className="text-sm font-semibold text-muted-foreground">Peça Profissional</h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left text-xs uppercase text-muted-foreground">
                <th className="w-24 border px-3 py-2">Item</th>
                <th className="border px-3 py-2">Descrição</th>
                <th className="w-20 border px-3 py-2">Peso</th>
                <th className="w-24 border px-3 py-2">Pontuação</th>
              </tr>
            </thead>
            <tbody>
              {pieceItems.map(item => (
                <tr key={item.id} className="border-b last:border-b-0">
                  <td className="border px-3 py-2 font-medium text-foreground">{item.id}</td>
                  <td className="border px-3 py-2 text-foreground">
                    <div className="whitespace-pre-wrap leading-relaxed">{item.descricao}</div>
                    {item.fundamentos && item.fundamentos.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Fundamentos: {item.fundamentos.join('; ')}
                      </div>
                    )}
                  </td>
                  <td className="border px-3 py-2 text-foreground">{item.peso?.toFixed(2) ?? '-'}</td>
                  <td className="border px-3 py-2 text-foreground">
                    {formatScoreOptional(item.nota_obtida)}
                    {item.nota_obtida_raw && (
                      <span className="ml-1 text-xs text-muted-foreground">(imagem: {item.nota_obtida_raw})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h4 className="text-sm font-semibold text-muted-foreground">Questões Discursivas</h4>
        <div className="mt-3 space-y-6">
          {Object.entries(groupedQuestions)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([questao, itens]) => (
              <div key={questao} className="rounded border bg-background">
                <div className="flex items-center justify-between border-b px-4 py-2">
                  <div className="text-sm font-semibold text-foreground">{questao}</div>
                  <div className="text-xs text-muted-foreground">
                    Total: {formatScoreOptional(sumQuestionScore(itens))}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px] table-fixed border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted text-left text-xs uppercase text-muted-foreground">
                        <th className="w-28 border px-3 py-2">Item</th>
                        <th className="border px-3 py-2">Descrição</th>
                        <th className="w-20 border px-3 py-2">Peso</th>
                        <th className="w-24 border px-3 py-2">Pontuação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map(item => (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="border px-3 py-2 font-medium text-foreground">{item.id}</td>
                          <td className="border px-3 py-2 text-foreground">
                            <div className="whitespace-pre-wrap leading-relaxed">{item.descricao}</div>
                            {item.fundamentos && item.fundamentos.length > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                Fundamentos: {item.fundamentos.join('; ')}
                              </div>
                            )}
                          </td>
                          <td className="border px-3 py-2 text-foreground">{item.peso?.toFixed(2) ?? '-'}</td>
                          <td className="border px-3 py-2 text-foreground">
                            {formatScoreOptional(item.nota_obtida)}
                            {item.nota_obtida_raw && (
                              <span className="ml-1 text-xs text-muted-foreground">(imagem: {item.nota_obtida_raw})</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}

export function EspelhoDialog({
  isOpen,
  onClose,
  leadId,
  leadData,
  textoEspelho,
  imagensEspelho,
  aguardandoEspelho = false,
  onSave,
  onCancelarEspelho,
  batchMode = false,
  batchInfo,
  onBatchNext,
  onBatchSkip,
}: EspelhoDialogProps) {
  const [texto, setTexto] = useState<any>(textoEspelho);
  const [imagens, setImagens] = useState<string[]>(imagensEspelho);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isCancelando, setIsCancelando] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [ast, setAst] = useState<any>(null);

  const structuredPayload = useMemo(() => asStudentMirrorPayload(texto), [texto]);
  const canEditContent = !structuredPayload;

  // Atualiza o texto quando as props mudam
  useEffect(() => {
    if (isOpen) {
      setTexto(textoEspelho);
      setImagens(imagensEspelho);
      
      // Se está aguardando processamento, não alterar modo
      if (aguardandoEspelho) {
        return;
      }
      
      // Definir modo inicial baseado na disponibilidade de texto
      const hasText = textoEspelho && (
        typeof textoEspelho === 'string' ? textoEspelho.trim().length > 0 :
        Array.isArray(textoEspelho) ? textoEspelho.length > 0 :
        typeof textoEspelho === 'object' && textoEspelho !== null
      );
      setIsEditMode(!hasText && !structuredPayload); // Apenas entra em edição se não houver conteúdo estruturado
      
      // Fazer parsing do markdown para AST quando há texto
      if (hasText && !structuredPayload) {
        const formattedText = formatEspelhoTexto();
        if (formattedText && formattedText.trim().length > 0) {
          try {
            const processor = unified().use(remarkParse).use(remarkGfm);
            const tree = processor.parse(formattedText);
            setAst(tree);
          } catch (error) {
            console.error('Erro ao fazer parsing do markdown:', error);
            setAst(null);
          }
        }
      }
    }
      }, [isOpen, textoEspelho, imagensEspelho, aguardandoEspelho, structuredPayload]);

  // Efeito para fazer parsing do markdown quando entrar no modo de edição
  useEffect(() => {
    if (isEditMode && !structuredPayload && !ast) {
      const formattedText = formatEspelhoTexto();
      if (formattedText && formattedText.trim().length > 0) {
        try {
          const processor = unified().use(remarkParse).use(remarkGfm);
          const tree = processor.parse(formattedText);
          setAst(tree);
        } catch (error) {
          console.error('Erro ao fazer parsing do markdown:', error);
          setAst(null);
        }
      }
    }
  }, [isEditMode, texto, structuredPayload]);

  useEffect(() => {
    if (structuredPayload) {
      setIsEditMode(false);
      setAst(null);
    }
  }, [structuredPayload]);

  // Função para verificar se há texto formatado
  const hasFormattedText = () => {
    const formatted = formatEspelhoTexto();
    return formatted && formatted.trim().length > 0;
  };



  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      let textoFinalParaSalvar = texto;
      
      // Se estava no modo de edição e o AST existe, converte-o de volta para string
      if (isEditMode && ast) {
        try {
          const processor = unified().use(remarkGfm).use(remarkStringify);
          textoFinalParaSalvar = processor.stringify(ast);
        } catch (error) {
          console.error('Erro ao converter AST para markdown:', error);
          toast.error("Erro", { description: "Erro ao processar o conteúdo editado. Salvando versão original." });
        }
      }
      
      await onSave(textoFinalParaSalvar, imagens);
      toast.success("Espelho salvo", { 
        description: "Espelho atualizado com sucesso",
        duration: 2000
      });
      
      if (batchMode && onBatchNext) {
        onBatchNext();
      } else {
        handleClose();
      }
    } catch (error: any) {
      toast.error("Erro", { description: error.message || "Não foi possível salvar as alterações." });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelarEspelho = async () => {
    console.log("[EspelhoDialog] Botão cancelar clicado!");
    console.log("[EspelhoDialog] onCancelarEspelho:", !!onCancelarEspelho);
    
    if (!onCancelarEspelho) {
      console.log("[EspelhoDialog] Função onCancelarEspelho não está disponível!");
      return;
    }
    
    try {
      console.log("[EspelhoDialog] Iniciando cancelamento...");
      setIsCancelando(true);
      await onCancelarEspelho();
      console.log("[EspelhoDialog] Cancelamento concluído!");
      toast("Sucesso", { description: "Processamento do espelho cancelado com sucesso!"  });
      handleClose();
    } catch (error: any) {
      console.error("[EspelhoDialog] Erro ao cancelar:", error);
      toast("Erro", { description: error.message || "Não foi possível cancelar o processamento."  });
    } finally {
      setIsCancelando(false);
    }
  };

  const handleSkip = () => {
    if (batchMode && onBatchSkip) {
      onBatchSkip();
    }
  };

  // Função para garantir a limpeza correta ao fechar
  const handleClose = () => {
    console.log("[EspelhoDialog] handleClose chamado - estado:", { isSaving, isGeneratingText, isCancelando });
    
    if (!isSaving && !isGeneratingText && !isCancelando) {
      // Fecha o diálogo imediatamente para evitar problemas de estado
      console.log("[EspelhoDialog] Fechando diálogo normalmente");
      onClose();
      
      // Reseta o estado local após fechar
      setTexto(textoEspelho);
      setImagens(imagensEspelho);
      setShowConfirmDialog(false);
      setPendingImages([]);
      setAst(null);
    } else {
      console.log("[EspelhoDialog] Não pode fechar agora - operação em andamento");
    }
  };

  // Função para abrir o gerenciador de imagens
  const handleOpenImageGallery = () => {
    setShowGallery(true);
  };

  // Função para receber as imagens selecionadas da galeria
  const handleImageSelection = async (selectedImages: string[]) => {
    setImagens(selectedImages);
    setShowGallery(false);
    
    // Se houver imagens selecionadas, perguntar via dialog se quer enviar para sistema externo
    if (selectedImages.length > 0) {
      setPendingImages(selectedImages);
      setShowConfirmDialog(true);
    }
  };

  // Confirmar envio para sistema externo
  const handleConfirmSendToExternal = async () => {
    setShowConfirmDialog(false);
    await handleGenerateTextFromImages(pendingImages);
    setPendingImages([]);
  };

  // Cancelar envio para sistema externo
  const handleCancelSendToExternal = () => {
    setShowConfirmDialog(false);
    setPendingImages([]);
  };

  // Função para enviar imagens para o sistema externo e gerar texto
  const handleGenerateTextFromImages = async (imageUrls: string[]) => {
    try {
      setIsGeneratingText(true);
      
      if (!leadData) {
        throw new Error("Dados do lead não disponíveis");
      }
      
      // Verificar se está editando um espelho da biblioteca
      const isEspelhoBiblioteca = leadData.espelhoBibliotecaId !== undefined;
      // Verificar se a consultoria está ativa
      const consultoriaAtiva = leadData.consultoriaFase2 || false;
      
      const payload = {
        leadID: leadId,
        nome: leadData.nomeReal || leadData.name || "Lead sem nome",
        telefone: leadData.phoneNumber,
        // Usar flag correta dependendo do contexto da consultoria
        ...(consultoriaAtiva ? { espelhoparabiblioteca: true } : { espelho: true }),
        arquivos: leadData.arquivos?.map((a: { id: string; dataUrl: string; fileType: string }) => ({
          id: a.id,
          url: a.dataUrl,
          tipo: a.fileType,
          nome: a.fileType
        })) || [],
        arquivos_pdf: leadData.pdfUnificado ? [{
          id: leadId,
          url: leadData.pdfUnificado,
          nome: "PDF Unificado"
        }] : [],
        arquivos_imagens_espelho: imageUrls.map((url: string, index: number) => ({
          id: `${leadId}-espelho-${index}`,
          url: url,
          nome: `Espelho ${index + 1}`
        })),
        metadata: {
          leadUrl: leadData.leadUrl,
          sourceId: leadData.sourceId,
          concluido: leadData.concluido,
          fezRecurso: leadData.fezRecurso
        }
      };
      
      // Adicionar dados específicos da biblioteca se for o caso
      if (isEspelhoBiblioteca) {
        (payload as any).espelhoBibliotecaId = leadData.espelhoBibliotecaId;
        (payload as any).usuarioId = leadData.usuarioId;
      }
      
      const response = await fetch("/api/admin/leads-chatwit/enviar-manuscrito", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao enviar espelho para processamento");
      }
      
      toast("Imagens enviadas", { description: "Imagens enviadas para o sistema externo! O texto será gerado automaticamente."  });
      
    } catch (error: any) {
      console.error("Erro ao enviar imagens para sistema externo:", error);
      toast("Erro", { description: error.message || "Não foi possível enviar para o sistema externo."  });
    } finally {
      setIsGeneratingText(false);
    }
  };

  // Formatar o texto JSON para exibição
  const formatEspelhoTexto = () => {
    if (!texto) return "";
    if (structuredPayload) {
      try {
        return JSON.stringify(structuredPayload, null, 2);
      } catch {
        return "";
      }
    }
    
    // Função auxiliar para processar quebras de linha
    const processLineBreaks = (text: string) => {
      return text.replace(/\\n/g, '\n');
    };
    
    try {
      if (typeof texto === 'string') {
        // Tentar parsear como JSON se for uma string
        try {
          const parsed = JSON.parse(texto);
          // Se é um objeto JSON com output, processar quebras de linha
          if (parsed && typeof parsed === 'object' && parsed.output) {
            return processLineBreaks(parsed.output);
          }
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Se não for JSON válido, processar quebras de linha e retornar
          return processLineBreaks(texto);
        }
      } else if (Array.isArray(texto)) {
        // Se for um array, formata cada item
        const formattedText = texto.map((item, index) => {
          if (item.output) {
            return `#### Parte ${index + 1} ####\n${processLineBreaks(item.output)}`;
          } else if (typeof item === 'string') {
            return `#### Parte ${index + 1} ####\n${processLineBreaks(item)}`;
          } else {
            return `#### Parte ${index + 1} ####\n${JSON.stringify(item, null, 2)}`;
          }
        }).join('\n\n---------------------------------\n\n');
        
        return formattedText;
      } else if (typeof texto === 'object' && texto !== null) {
        // Se for um objeto, tenta detectar estruturas específicas
        if (texto.output) {
          return processLineBreaks(texto.output);
        }
        // Caso contrário, formata como JSON
        return JSON.stringify(texto, null, 2);
      } else {
        // Para qualquer outro tipo, converte para string e processa quebras de linha
        return processLineBreaks(String(texto));
      }
    } catch (error) {
      console.error("Erro ao formatar texto do espelho:", error);
      // Fallback seguro
      try {
        const fallbackText = typeof texto === 'string' ? texto : JSON.stringify(texto, null, 2);
        return processLineBreaks(fallbackText);
      } catch {
        return "Erro ao exibir o conteúdo do espelho. Edite com cuidado.";
      }
    }
  };

  const handleCopyStructuredJson = async () => {
    if (!structuredPayload) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(structuredPayload, null, 2));
      toast.success("JSON copiado", { description: "Conteúdo estruturado disponível na área de transferência", duration: 2000 });
    } catch (error: any) {
      console.error("Erro ao copiar JSON do espelho:", error);
      toast.error("Erro", { description: "Não foi possível copiar o JSON." });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-4xl w-[95vw] min-w-[800px] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                <DialogTitle>
                  {batchMode ? "Espelho em Lote" : "Editar Espelho de Correção"}
                </DialogTitle>
              </div>
              {batchMode && batchInfo && (
                <Badge variant="secondary" className="text-xs">
                  {batchInfo.current} de {batchInfo.total}
                </Badge>
              )}
            </div>
            <DialogDescription>
              {batchMode && batchInfo ? (
                <div className="space-y-2">
                  <div>
                    Processando espelho para: <strong>{batchInfo.leadName}</strong>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    💡 Selecione as imagens que serão usadas como espelho de correção. 
                    O texto pode ser gerado automaticamente após selecionar as imagens.
                  </div>
                </div>
              ) : (
                "Visualize e edite as informações do espelho de correção."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 px-1 py-4 space-y-4">
            {aguardandoEspelho ? (
              <div className="flex flex-col items-center justify-center py-8 min-h-[300px]">
                <Loader2 className="h-16 w-16 text-primary animate-spin mb-4" />
                <p className="text-lg font-medium">Aguardando Processamento</p>
                <p className="text-sm text-muted-foreground mt-2 mb-4">
                  Estamos processando o espelho de correção. Isso pode levar alguns minutos.
                </p>
                
                {onCancelarEspelho && (
                  <Button 
                    variant="destructive" 
                    onClick={handleCancelarEspelho}
                    disabled={isCancelando}
                  >
                    {isCancelando ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Cancelando...
                      </>
                    ) : (
                      "Cancelar Processamento"
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <h3 className="text-base sm:text-lg font-medium">Texto do Espelho</h3>
                </div>

                {/* Área única de edição/visualização */}
                <div className="border rounded-md bg-background p-3 h-[600px] overflow-y-auto">
                  {isEditMode ? (
                    ast ? (
                      <div className="h-full text-base">
                        <StructuredEditor ast={ast} onAstChange={setAst} />
                      </div>
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        <p>Carregando editor...</p>
                      </div>
                    )
                  ) : structuredPayload ? (
                    <div className="h-full overflow-y-auto pr-1">
                      <StudentMirrorViewer payload={structuredPayload} />
                    </div>
                  ) : (
                    <div className="prose prose-base max-w-none dark:prose-invert h-full text-base [&_h3]:text-base [&_p]:text-base [&_ul]:text-base [&_li]:text-base">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {formatEspelhoTexto() || 'Nenhum texto disponível. Clique em "Editar" para adicionar conteúdo.'}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {isGeneratingText && (
                  <div className="flex items-center justify-center p-4 bg-muted rounded-lg">
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span className="text-base">Gerando texto automaticamente...</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center">
                  <h3 className="text-base sm:text-lg font-medium">Imagens do Espelho</h3>
                  <div className="flex gap-1 sm:gap-2 flex-wrap">
                    <Button 
                      variant="outline" 
                      
                      onClick={handleOpenImageGallery}
                      className="text-xs sm:text-sm"
                    >
                      <ImageIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Gerenciar Imagens</span>
                      <span className="sm:hidden">Imagens</span>
                    </Button>
                    {imagens.length > 0 && (
                      <Button
                        variant="outline"
                        
                        onClick={() => handleGenerateTextFromImages(imagens)}
                        disabled={isGeneratingText || !leadData}
                        className="text-xs sm:text-sm"
                      >
                        {isGeneratingText ? (
                          <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">Gerar Texto</span>
                        <span className="sm:hidden">Gerar</span>
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-[150px] sm:max-h-[200px] overflow-y-auto border rounded-md p-2 bg-muted/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    {imagens.length > 0 ? (
                      imagens.map((url, index) => (
                        <div key={index} className="border rounded-md overflow-hidden h-24 sm:h-32">
                          <img 
                            src={url} 
                            alt={`Espelho ${index + 1}`} 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-8 text-muted-foreground">
                        Nenhuma imagem selecionada
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t pt-4 flex-col sm:flex-row">
            {batchMode ? (
              <>
                <Button variant="outline" onClick={handleClose} disabled={isSaving || isGeneratingText || isCancelando}>
                  Cancelar Lote
                </Button>
                <Button variant="ghost" onClick={handleSkip} disabled={isSaving || isGeneratingText || isCancelando}>
                  Pular Este Lead
                </Button>
                {!aguardandoEspelho && (
                  <Button onClick={handleSave} disabled={isSaving || isGeneratingText}>
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <span>Salvar</span>
                    {batchInfo && batchInfo.current < batchInfo.total && (
                      <>
                        <ArrowRight className="ml-2 h-4 w-4" />
                        <span>Próximo</span>
                      </>
                    )}
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    if (isEditMode) {
                      setIsEditMode(false);
                      setTexto(textoEspelho);
                      setAst(null);
                    } else {
                      handleClose();
                    }
                  }} 
                  disabled={isSaving || isGeneratingText || isCancelando}
                >
                  {isEditMode ? "Cancelar" : "Fechar"}
                </Button>
                {!aguardandoEspelho && (
                  canEditContent ? (
                    <Button 
                      onClick={() => {
                        if (isEditMode) {
                          handleSave();
                        } else {
                          setIsEditMode(true);
                          if (!ast) {
                            const formattedText = formatEspelhoTexto();
                            if (formattedText && formattedText.trim().length > 0) {
                              try {
                                const processor = unified().use(remarkParse).use(remarkGfm);
                                const tree = processor.parse(formattedText);
                                setAst(tree);
                              } catch (error) {
                                console.error('Erro ao fazer parsing do markdown:', error);
                                setAst(null);
                              }
                            }
                          }
                        }
                      }} 
                      disabled={isSaving || isGeneratingText}
                    >
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isEditMode ? "Salvar" : "Editar"}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      onClick={handleCopyStructuredJson}
                      disabled={!structuredPayload}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Copiar JSON
                    </Button>
                  )
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação para Sistema Externo */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Texto Automaticamente</DialogTitle>
            <DialogDescription>
              Deseja enviar as {pendingImages.length} imagem(ns) selecionada(s) para o sistema externo 
              gerar o texto do espelho automaticamente?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              Esta ação irá enviar as imagens para processamento automático e o texto 
              será gerado em alguns minutos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelSendToExternal}>
              Não, apenas salvar imagens
            </Button>
            <Button onClick={handleConfirmSendToExternal}>
              <Send className="h-4 w-4 mr-2" />
              Sim, gerar texto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageGalleryDialog
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        images={imagens.length > 0 ? imagens : []}
        leadId={leadId}
        title="Gerenciar Imagens do Espelho"
        description="Selecione as imagens que serão usadas como espelho de correção."
        selectionMode={true}
        onSend={handleImageSelection}
      />
    </>
  );
} 
