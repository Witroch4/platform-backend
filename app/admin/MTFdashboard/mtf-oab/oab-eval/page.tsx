"use client";

import { useState } from "react";
import { toast } from "sonner";

interface UploadResult {
  rubricId?: string;
  submissionId?: string;
  evaluationId?: string;
  report?: unknown;
  scores?: unknown;
  evidencias?: unknown;
  error?: string;
  pageCount?: number;
  chunkCount?: number;
  structured?: unknown;
  stats?: { itens: number; withEmbeddings?: boolean; embeddingModel?: string | null };
}

interface BatchUploadResult {
  success: boolean;
  results: Array<{
    fileName: string;
    rubricId?: string;
    structured?: unknown;
    stats?: { itens: number; withEmbeddings?: boolean; embeddingModel?: string | null; metaResumo?: any };
    error?: string;
  }>;
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result.split(",").pop() ?? "");
        return;
      }

      if (result instanceof ArrayBuffer) {
        const bytes = new Uint8Array(result);
        let binary = "";
        bytes.forEach((byte) => {
          binary += String.fromCharCode(byte);
        });
        resolve(btoa(binary));
        return;
      }

      reject(new Error("Formato de arquivo inválido"));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function OabEvalWorkbench() {
  const [rubricStatus, setRubricStatus] = useState<UploadResult | null>(null);
  const [batchUploadStatus, setBatchUploadStatus] = useState<BatchUploadResult | null>(null);
  const [submissionStatus, setSubmissionStatus] = useState<UploadResult | null>(null);
  const [evaluationStatus, setEvaluationStatus] = useState<UploadResult | null>(null);

  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [rubricFiles, setRubricFiles] = useState<FileList | null>(null);
  const [studentName, setStudentName] = useState("");
  const [strategy, setStrategy] = useState("LARGE");
  const [rubricId, setRubricId] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [withEmbeddings, setWithEmbeddings] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [validationResults, setValidationResults] = useState<string | null>(null);

  const handleRunValidationTest = async () => {
    try {
      setIsLoading(true);
      toast.loading("Executando teste de validação...");
      
      const response = await fetch("/api/oab-eval/validate-pdfs");
      if (!response.ok) {
        throw new Error("Falha ao executar teste de validação");
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Falha na validação");
      }
      
      setValidationResults(data.output);
      toast.success("Teste de validação executado com sucesso");
    } catch (error) {
      console.error("Erro no teste de validação:", error);
      toast.error((error as Error).message || "Erro no teste de validação");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadExamplePDFs = async () => {
    try {
      setIsLoading(true);
      toast.loading("Carregando PDFs de exemplo...");
      
      // Fetch the example PDFs from the backend
      const response = await fetch("/api/oab-eval/load-examples");
      if (!response.ok) {
        throw new Error("Falha ao carregar PDFs de exemplo");
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "Falha ao carregar PDFs");
      }
      
      // Simulate FileList (create a DataTransfer to get FileList)
      const dt = new DataTransfer();
      for (const fileData of data.files) {
        const blob = new Blob([new Uint8Array(fileData.buffer)], { type: 'application/pdf' });
        const file = new File([blob], fileData.name, { type: 'application/pdf' });
        dt.items.add(file);
      }
      
      setRubricFiles(dt.files);
      toast.success(`${data.files.length} PDFs de exemplo carregados`);
    } catch (error) {
      console.error("Erro ao carregar PDFs de exemplo:", error);
      toast.error((error as Error).message || "Erro ao carregar PDFs de exemplo");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchRubricUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rubricFiles || rubricFiles.length === 0) {
      setBatchUploadStatus({ 
        success: false,
        results: [],
        summary: { total: 0, successful: 0, failed: 1 }
      });
      toast.error("Selecione pelo menos um arquivo PDF");
      return;
    }

    try {
      setIsLoading(true);
      setBatchUploadStatus(null);

      // Preparar FormData com múltiplos arquivos
      const form = new FormData();
      Array.from(rubricFiles).forEach((file, index) => {
        form.append(`files`, file);
      });
      form.append("withEmbeddings", String(withEmbeddings));

      const run = async () => {
        const response = await fetch("/api/oab-eval/rubric/batch-upload", { 
          method: "POST", 
          body: form 
        });
        const data: BatchUploadResult = await response.json();
        if (!response.ok) throw new Error(data.results?.[0]?.error || "Falha ao processar gabaritos em batch");
        console.log("[OAB-EVAL] Batch upload result:", data);
        return data;
      };

      const data = (await toast.promise(run(), {
        loading: `Processando ${rubricFiles.length} gabaritos em batch...`,
        success: (result) => `${result.summary.successful}/${result.summary.total} gabaritos processados com sucesso`,
        error: (e) => e.message || "Falha ao processar gabaritos em batch",
      })) as unknown as BatchUploadResult;

      setBatchUploadStatus(data);
    } catch (error) {
      setBatchUploadStatus({
        success: false,
        results: [{ fileName: "unknown", error: (error as Error).message }],
        summary: { total: rubricFiles.length, successful: 0, failed: rubricFiles.length }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRubricUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rubricFile) {
      setRubricStatus({ error: "Selecione um arquivo .json ou .pdf" });
      return;
    }

    try {
      setIsLoading(true);
      const isPdf = rubricFile.type === "application/pdf" || rubricFile.name.toLowerCase().endsWith(".pdf");
      let body: Record<string, unknown> = {};

      if (isPdf) {
        const run = async () => {
          const form = new FormData();
          form.append("file", rubricFile);
          form.append("withEmbeddings", String(withEmbeddings));
          const response = await fetch("/api/oab-eval/rubric/upload", { method: "POST", body: form });
          const data: UploadResult = await response.json();
          if (!response.ok) throw new Error(data.error || "Falha ao enviar gabarito");
          console.log("[OAB-EVAL] Upload PDF result:", data);
          return data;
        };
        const data = (await toast.promise(run(), {
          loading: "Processando gabarito (PDF)…",
          success: "Gabarito estruturado com sucesso",
          error: (e) => e.message || "Falha ao estruturar gabarito",
        })) as unknown as UploadResult;
        setRubricId(data.rubricId ?? "");
        setRubricStatus(data);
        return;
      } else {
        const text = await rubricFile.text();
        const payload = JSON.parse(text);
        body = { payload };
      }

      const run = async () => {
        const response = await fetch("/api/oab-eval/rubric", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data: UploadResult = await response.json();
        if (!response.ok) throw new Error(data.error || "Falha ao enviar gabarito");
        console.log("[OAB-EVAL] Upload JSON result:", data);
        return data;
      };
      const data = (await toast.promise(run(), {
        loading: "Processando gabarito (JSON)…",
        success: "Gabarito salvo",
        error: (e) => e.message || "Falha ao salvar gabarito",
      })) as unknown as UploadResult;

      setRubricId(data.rubricId ?? "");
      setRubricStatus(data);
      console.log("[OAB-EVAL] Upload JSON structured:", data);
    } catch (error) {
      setRubricStatus({ error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmissionUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const files = formData.getAll("examImages") as File[];

    if (!files.length) {
      setSubmissionStatus({ error: "Selecione as imagens da prova" });
      return;
    }

    setIsLoading(true);
    try {
      const images = await Promise.all(
        files.map(async (file, index) => ({
          base64: await fileToBase64(file),
          mimeType: file.type,
          page: index + 1,
          originalName: file.name,
        })),
      );

      const response = await fetch("/api/oab-eval/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alunoNome: studentName || undefined,
          images,
        }),
      });

      const data: UploadResult = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao processar prova");
      }

      setSubmissionId(data.submissionId ?? "");
      setSubmissionStatus(data);
    } catch (error) {
      setSubmissionStatus({ error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!submissionId || !rubricId) {
      setEvaluationStatus({ error: "Informe submissionId e rubricId" });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/oab-eval/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          rubricId,
          strategy,
          alunoNome: studentName || undefined,
        }),
      });

      const data: UploadResult = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao avaliar");
      }

      setEvaluationStatus(data);
    } catch (error) {
      setEvaluationStatus({ error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-10 p-6">
      <h1 className="text-2xl font-semibold">Laboratório de Avaliação OAB</h1>
      <p className="text-sm text-muted-foreground max-w-3xl">
        Pipeline experimental para avaliar provas da OAB com agentes especializados. Suba o gabarito oficial, transcreva a prova do aluno a partir das imagens e gere o relatório de omissões.
      </p>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-medium mb-2">1. Subir gabarito oficial (.json ou .pdf)</h2>
        
        {/* Toggle para modo batch */}
        <div className="mb-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input 
              type="checkbox" 
              checked={isBatchMode} 
              onChange={(e) => setIsBatchMode(e.target.checked)} 
            />
            Modo Batch (múltiplos PDFs)
          </label>
          
          {isBatchMode && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border">
              <div className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                <strong>Teste Automático:</strong> Carregue os 7 PDFs de exemplo da pasta lib/oab/pdf-exemplos-gabaritos
              </div>
              <button
                type="button"
                onClick={handleLoadExamplePDFs}
                disabled={isLoading}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                Carregar 7 PDFs de Exemplo
              </button>
            </div>
          )}
        </div>

        {!isBatchMode ? (
          /* Modo Individual */
          <form className="space-y-3" onSubmit={handleRubricUpload}>
            <input
              type="file"
              name="rubric"
              accept="application/json,application/pdf"
              onChange={(event) => setRubricFile(event.target.files?.[0] ?? null)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withEmbeddings} onChange={(e) => setWithEmbeddings(e.target.checked)} />
              Gerar embeddings (large) no retorno
            </label>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={isLoading}
            >
              Enviar gabarito
            </button>
            {rubricStatus?.error && <p className="text-sm text-destructive">{rubricStatus.error}</p>}
            {rubricStatus?.rubricId && (
              <div className="text-sm text-foreground space-y-2">
                <div>
                  Gabarito salvo com ID <code className="rounded bg-muted px-2 py-1">{rubricStatus.rubricId}</code>
                </div>
                <div className="text-xs text-muted-foreground">
                  Dica: copie o ID acima para usar na etapa 3. {rubricStatus?.stats ? `Itens: ${rubricStatus.stats.itens}${rubricStatus.stats.withEmbeddings ? ` (com embeddings ${rubricStatus.stats.embeddingModel})` : ''}` : ''}
                </div>
                {!!rubricStatus.structured && (
                  <details open>
                    <summary className="cursor-pointer">Ver JSON estruturado</summary>
                    <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                      {JSON.stringify(rubricStatus.structured as any, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </form>
        ) : (
          /* Modo Batch */
          <form className="space-y-3" onSubmit={handleBatchRubricUpload}>
            <div className="space-y-2">
              <label className="text-sm font-medium">Selecionar múltiplos PDFs:</label>
              <input
                type="file"
                name="rubrics"
                accept="application/pdf"
                multiple
                onChange={(event) => setRubricFiles(event.target.files)}
              />
              {rubricFiles && rubricFiles.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {rubricFiles.length} arquivo(s) selecionado(s): {Array.from(rubricFiles).map(f => f.name).join(', ')}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={withEmbeddings} onChange={(e) => setWithEmbeddings(e.target.checked)} />
              Gerar embeddings (large) no retorno
            </label>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={isLoading || !rubricFiles || rubricFiles.length === 0}
            >
              Processar {rubricFiles?.length || 0} gabaritos em batch
            </button>
            
            {/* Resultado do batch upload */}
            {batchUploadStatus?.success === false && (
              <p className="text-sm text-destructive">
                Erro no processamento batch: {batchUploadStatus.results?.[0]?.error || "Erro desconhecido"}
              </p>
            )}
            
            {batchUploadStatus?.success && (
              <div className="space-y-3">
                <div className="text-sm text-foreground">
                  <div className="font-medium">
                    Resultado do Batch: {batchUploadStatus.summary.successful}/{batchUploadStatus.summary.total} processados com sucesso
                  </div>
                  {batchUploadStatus.summary.failed > 0 && (
                    <div className="text-destructive text-xs mt-1">
                      {batchUploadStatus.summary.failed} arquivo(s) falharam no processamento
                    </div>
                  )}
                </div>

                {/* Resumo de pontuação para teste automático */}
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
                  <div className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
                    📊 Resumo de Pontuação (Teste Determinístico)
                  </div>
                  <div className="text-xs space-y-1">
                    {batchUploadStatus.results.map((result, index) => {
                      if (result.error) return null;
                      const area = result.stats?.metaResumo?.area || 'Área não identificada';
                      const itens = result.stats?.itens || 0;
                      return (
                        <div key={index} className="flex justify-between items-center">
                          <span className="font-mono">{area}:</span>
                          <span className="font-mono text-green-700 dark:text-green-300">
                            {itens} itens processados ✓
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-xs text-green-600 dark:text-green-400 mt-2 space-y-2">
                    <div>
                      💡 Para verificar se as pontuações estão corretas (5+5=10), execute o script: 
                      <code className="bg-green-100 dark:bg-green-900 px-1 rounded">npx tsx temp/check_oab.ts</code>
                    </div>
                    <button
                      type="button"
                      onClick={handleRunValidationTest}
                      disabled={isLoading}
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-50"
                    >
                      🧪 Executar Teste de Validação
                    </button>
                  </div>
                </div>
                
                <details className="space-y-2">
                  <summary className="cursor-pointer text-sm font-medium">Ver resultados detalhados</summary>
                  <div className="space-y-2 max-h-96 overflow-auto">
                    {batchUploadStatus.results.map((result, index) => (
                      <div key={index} className={`p-3 rounded border ${result.error ? 'border-destructive bg-destructive/5' : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'}`}>
                        <div className="text-sm font-medium">{result.fileName}</div>
                        {result.error ? (
                          <div className="text-xs text-destructive mt-1">{result.error}</div>
                        ) : (
                          <div className="text-xs space-y-1 mt-1">
                            <div>ID: <code className="bg-muted px-1 rounded">{result.rubricId}</code></div>
                            {result.stats && (
                              <div>Itens: {result.stats.itens} | {result.stats.metaResumo?.area || 'Área não identificada'}</div>
                            )}
                          </div>
                        )}
                        {result.structured ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs">Ver JSON estruturado</summary>
                            <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs mt-1">
                              {JSON.stringify(result.structured as any, null, 2)}
                            </pre>
                          </details>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
            
            {/* Resultados do teste de validação */}
            {validationResults && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded border">
                <h3 className="text-sm font-medium mb-2">🧪 Resultados do Teste de Validação</h3>
                <details>
                  <summary className="cursor-pointer text-sm">Ver saída completa do teste</summary>
                  <pre className="max-h-96 overflow-auto rounded bg-gray-100 dark:bg-gray-800 p-3 text-xs mt-2 font-mono">
                    {validationResults}
                  </pre>
                </details>
              </div>
            )}
          </form>
        )}
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-medium mb-2">2. Transcrever prova do aluno (imagens)</h2>
        <form className="space-y-3" onSubmit={handleSubmissionUpload}>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">Nome do aluno (opcional)</label>
            <input
              type="text"
              className="w-full rounded border border-border p-2"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Ex.: Gabriela Alves"
            />
          </div>
          <input type="file" name="examImages" accept="image/*" multiple />
          <button
            type="submit"
            className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            Processar prova
          </button>
          {submissionStatus?.error && <p className="text-sm text-destructive">{submissionStatus.error}</p>}
          {submissionStatus?.submissionId && (
            <div className="text-sm space-y-1">
              <p>
                Submissão criada com ID {" "}
                <code className="rounded bg-muted px-2 py-1">{submissionStatus.submissionId}</code>
              </p>
              <p>Páginas detectadas: {submissionStatus.pageCount}</p>
              <p>Chunks gerados: {submissionStatus.chunkCount}</p>
            </div>
          )}
        </form>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-medium mb-2">3. Rodar avaliação multiagente</h2>
        <form className="space-y-4" onSubmit={handleEvaluation}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col text-sm">
              <span className="font-medium">Rubric ID</span>
              <input
                className="rounded border border-border p-2"
                value={rubricId}
                onChange={(event) => setRubricId(event.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              <span className="font-medium">Submission ID</span>
              <input
                className="rounded border border-border p-2"
                value={submissionId}
                onChange={(event) => setSubmissionId(event.target.value)}
              />
            </label>
            <label className="flex flex-col text-sm">
              <span className="font-medium">Estratégia</span>
              <select
                className="rounded border border-border p-2"
                value={strategy}
                onChange={(event) => setStrategy(event.target.value)}
              >
                <option value="LARGE">Máxima precisão (large)</option>
                <option value="SMALL">Custo reduzido (small)</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={isLoading}
          >
            Avaliar
          </button>
        </form>

        {evaluationStatus?.error && <p className="mt-3 text-sm text-destructive">{evaluationStatus.error}</p>}
        {!!evaluationStatus?.report && (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-medium">Relatório</h3>
            <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(evaluationStatus.report, null, 2)}
            </pre>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Pontuações detalhadas</summary>
              <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify({ scores: evaluationStatus.scores, evidencias: evaluationStatus.evidencias }, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
