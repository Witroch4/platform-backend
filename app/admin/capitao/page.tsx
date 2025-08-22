"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MoreHorizontal, EllipsisVertical, Plus, Trash2, Settings2, Link2, Download, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

type Assistant = {
  id: string;
  name: string;
  description?: string | null;
  productName?: string | null;
  generateFaqs: boolean;
  captureMemories: boolean;
  createdAt: string;
};

type ImportResult = {
  success: boolean;
  summary: {
    totalAssistants: number;
    importedAssistants: number;
    skippedAssistants: number;
    updatedAssistants: number;
    totalDocuments: number;
    importedDocuments: number;
    skippedDocuments: number;
    totalFaqs: number;
    importedFaqs: number;
    skippedFaqs: number;
    totalPromptVersions: number;
    importedPromptVersions: number;
    skippedPromptVersions: number;
    errors: string[];
    warnings: string[];
  };
  details: {
    processedAssistants: Array<{
      originalId: string;
      newId?: string;
      name: string;
      action: 'imported' | 'skipped' | 'updated' | 'error';
      reason?: string;
    }>;
  };
};

export default function CaptainAssistantsPage() {
  const router = useRouter();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    productName: '',
    generateFaqs: false,
    captureMemories: false,
    instructions: '',
    intentOutputFormat: 'JSON' as 'JSON' | 'AT_SYMBOL',
  });
  const [loading, setLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Export/Import state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeInactive: false,
    compress: false,
    includeMetrics: false
  });
  const [importOptions, setImportOptions] = useState({
    conflictResolution: 'skip',
    importDocuments: true,
    importFaqs: true,
    importPromptVersions: true,
    importInboxLinks: false,
    importABTests: false,
    preserveIds: false
  });
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function loadAssistants() {
    try {
      const res = await fetch('/api/admin/ai-integration/assistants', { cache: 'no-store' });
      const data = await res.json();
      setAssistants(data.assistants || []);
    } catch (error) {
      console.error('Erro ao carregar assistentes:', error);
    } finally {
      setIsInitialLoading(false);
    }
  }

  useEffect(() => {
    loadAssistants();
  }, []);

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/ai-integration/assistants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error('Falha ao criar assistente');
      setOpen(false);
      setForm({ name: '', description: '', productName: '', generateFaqs: false, captureMemories: false, instructions: '', intentOutputFormat: 'JSON' });
      await loadAssistants();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/ai-integration/assistants?id=${id}`, { method: 'DELETE' });
    if (res.ok) loadAssistants();
  }

  // Export functionality
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportOptions.includeInactive) params.set('includeInactive', 'true');
      if (exportOptions.compress) params.set('compress', 'true');
      if (exportOptions.includeMetrics) params.set('includeMetrics', 'true');
      
      const response = await fetch(`/api/admin/ai-integration/assistants/export?${params}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || 
                        `assistants-export-${new Date().toISOString().split('T')[0]}.json`;
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        const totalAssistants = response.headers.get('X-Total-Assistants') || '0';
        const totalDocuments = response.headers.get('X-Total-Documents') || '0';
        const totalFaqs = response.headers.get('X-Total-Faqs') || '0';
        
        toast.success(`Exportação concluída! ${totalAssistants} assistentes, ${totalDocuments} documentos e ${totalFaqs} FAQs exportados.`);
        setShowExportDialog(false);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.error || 'Erro durante exportação');
      }
    } catch (error) {
      console.error('Erro na exportação:', error);
      toast.error('Erro durante exportação');
    } finally {
      setExporting(false);
    }
  };

  // Import functionality
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/json') {
        toast.error('Por favor, selecione um arquivo JSON válido');
        return;
      }
      setImportFile(file);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error('Selecione um arquivo para importar');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const fileContent = await importFile.text();
      const importData = JSON.parse(fileContent);

      const response = await fetch('/api/admin/ai-integration/assistants/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: importData,
          options: importOptions
        })
      });

      const result = await response.json();
      setImportResult(result);

      if (result.success) {
        toast.success(`Importação concluída! ${result.summary.importedAssistants} assistentes importados, ${result.summary.skippedAssistants} ignorados.`);
        await loadAssistants(); // Reload assistants list
      } else if (response.status === 207) { // Multi-Status (partial success)
        toast.warning(`Importação parcial. ${result.summary.importedAssistants} importados, ${result.summary.errors.length} erros.`);
      } else {
        toast.error(result.error || 'Erro durante importação');
      }

    } catch (error) {
      console.error('Erro na importação:', error);
      toast.error('Arquivo inválido ou erro durante importação');
      setImportResult(null);
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportResult(null);
  };

  // Componente de skeleton para os assistentes
  const AssistantsSkeleton = () => (
    <div className="grid gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-md p-4 flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );

  // Componente de skeleton para o cabeçalho
  const HeaderSkeleton = () => (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="rounded-md border border-dashed p-4 bg-muted/30 flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-2xl" />
            <Skeleton className="h-4 w-full max-w-lg" />
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-9 w-48 rounded-md ml-4" />
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {isInitialLoading ? (
        <HeaderSkeleton />
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="rounded-md border border-dashed p-4 bg-muted/30 flex items-center gap-4">
              <Image src="/captain.png" alt="Capitão" width={56} height={56} />
              <div className="flex-1">
                <h2 className="text-base font-semibold">Assistentes do Capitão</h2>
                <p className="text-sm text-muted-foreground">
                  O Capitão atende seus clientes automaticamente, aprende com seus documentos e conversas anteriores,
                  responde rápido e com precisão, e faz handoff para um humano quando necessário.
                </p>
              </div>
              <a
                href="/admin/capitao/saiba-mais"
                className="inline-flex items-center text-sm px-3 py-2 rounded-md border bg-background hover:bg-accent"
              >
                Saiba mais
              </a>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowExportDialog(true)}
            >
              <Download className="w-4 h-4 mr-2" />
              Exportar
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowImportDialog(true)}
            >
              <Upload className="w-4 h-4 mr-2" />
              Importar
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Criar um novo assistente</Button>
              </DialogTrigger>
          <DialogContent className="sm:max-w-2xl w-[96vw] max-h-[85vh]">
            <DialogHeader>
              <DialogTitle>Criar um assistente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome</label>
                <Input placeholder="Digite o nome do assistente" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea placeholder="Digite a descrição do assistente" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Nome do Produto</label>
                <Input placeholder="Digite o nome do produto" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} />
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.generateFaqs} onChange={(e) => setForm({ ...form, generateFaqs: e.target.checked })} />
                  Gerar perguntas frequentes a partir de conversas resolvidas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.captureMemories} onChange={(e) => setForm({ ...form, captureMemories: e.target.checked })} />
                  Capture memórias das interações do cliente
                </label>
              </div>
              <div>
                <label className="text-sm font-medium">Instruções (prompt do assistente)</label>
                <Textarea placeholder="Defina como este assistente deve agir. Ex.: classificar intenção e extrair entidades..." value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={6} />
                <p className="text-xs text-muted-foreground mt-1">Este texto será injetado no prompt que decide a intenção e entidades.</p>
              </div>
              <div>
                <label className="text-sm font-medium">Formato de saída da intenção</label>
                <select className="w-full border rounded h-9 px-2" value={form.intentOutputFormat} onChange={(e) => setForm({ ...form, intentOutputFormat: e.target.value as any })}>
                  <option value="JSON">JSON: {`{"intent":{"name":"@pagar_fatura","confidence":0.98},"entities":[...]}`}</option>
                  <option value="AT_SYMBOL">Apenas @intent: @pagar_fatura</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={loading || !form.name}>{loading ? 'Criando...' : 'Criar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {isInitialLoading ? (
          <AssistantsSkeleton />
        ) : assistants.length === 0 ? (
          <div className="text-center py-16 border rounded-md">
            <p className="mb-2 text-xl font-semibold">Não há assistentes disponíveis</p>
            <p className="text-sm text-muted-foreground mb-6">
              Crie um assistente para responder seus clientes automaticamente. Ele pode aprender com seus documentos
              e conversas anteriores, e transferir para um atendente quando necessário.
            </p>
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="w-4 h-4 mr-2" /> Criar um novo assistente</Button>
          </div>
        ) : (
          assistants.map((a) => (
            <div key={a.id} className="border rounded-md p-4 flex items-start justify-between">
              <div>
                <h3 className="font-medium">{a.name}</h3>
                {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                {a.productName && <p className="text-xs text-muted-foreground mt-1">Produto: {a.productName}</p>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon"><EllipsisVertical className="w-4 h-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => router.push(`/admin/capitao/${a.id}`)}>
                    <Settings2 className="w-4 h-4 mr-2" /> Configurar prompt
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`/admin/capitao/${a.id}/inboxes`)}>
                    <Link2 className="w-4 h-4 mr-2" /> Ver caixas associadas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleDelete(a.id)} className="text-red-600">
                    <Trash2 className="w-4 h-4 mr-2" /> Excluir agente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      {/* Dialog de Exportação */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="w-[96vw] sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Exportar Assistentes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Exporte todos os seus assistentes IA com documentos, FAQs, prompts e configurações em um arquivo JSON.
            </p>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeInactive"
                  checked={exportOptions.includeInactive}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, includeInactive: e.target.checked }))}
                />
                <label htmlFor="includeInactive" className="text-sm">
                  Incluir assistentes inativos
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="includeMetrics"
                  checked={exportOptions.includeMetrics}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, includeMetrics: e.target.checked }))}
                />
                <label htmlFor="includeMetrics" className="text-sm">
                  Incluir métricas de performance dos prompts
                </label>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="compress"
                  checked={exportOptions.compress}
                  onChange={(e) => setExportOptions(prev => ({ ...prev, compress: e.target.checked }))}
                />
                <label htmlFor="compress" className="text-sm">
                  Comprimir arquivo JSON (menor tamanho)
                </label>
              </div>
            </div>

            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                O arquivo exportado incluirá todos os assistentes com documentos, FAQs, versões de prompt, configurações SocialWise Flow e metadados.
              </AlertDescription>
            </Alert>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Importação */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importar Assistentes
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6">
              {!importResult && (
                <>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Arquivo de Exportação</label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileSelect}
                      className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
                    />
                    {importFile && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Arquivo selecionado: {importFile.name} ({Math.round(importFile.size / 1024)}KB)
                      </p>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Opções de Importação</h4>
                    
                    <div>
                      <label className="text-sm font-medium mb-2 block">Resolução de Conflitos</label>
                      <Select 
                        value={importOptions.conflictResolution} 
                        onValueChange={(value) => setImportOptions(prev => ({ ...prev, conflictResolution: value as any }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">Pular (manter existentes)</SelectItem>
                          <SelectItem value="replace">Substituir existentes</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Como tratar assistentes com nomes que já existem
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="importDocuments"
                          checked={importOptions.importDocuments}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, importDocuments: e.target.checked }))}
                        />
                        <label htmlFor="importDocuments" className="text-sm">
                          Importar documentos dos assistentes
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="importFaqs"
                          checked={importOptions.importFaqs}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, importFaqs: e.target.checked }))}
                        />
                        <label htmlFor="importFaqs" className="text-sm">
                          Importar FAQs dos assistentes
                        </label>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="importPromptVersions"
                          checked={importOptions.importPromptVersions}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, importPromptVersions: e.target.checked }))}
                        />
                        <label htmlFor="importPromptVersions" className="text-sm">
                          Importar versões de prompt e configurações
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {importing && (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">Importando assistentes...</p>
                </div>
              )}

              {importResult && (
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    {importResult.success ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                    )}
                    <div>
                      <h4 className="font-medium">
                        {importResult.success ? 'Importação Concluída' : 'Importação Parcial'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Resultado do processamento dos assistentes
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="border rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-600">{importResult.summary.importedAssistants}</div>
                      <div className="text-xs text-muted-foreground">Importados</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-2xl font-bold text-yellow-600">{importResult.summary.skippedAssistants}</div>
                      <div className="text-xs text-muted-foreground">Ignorados</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-2xl font-bold text-blue-600">{importResult.summary.updatedAssistants}</div>
                      <div className="text-xs text-muted-foreground">Atualizados</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="border rounded-lg p-3">
                      <div className="text-lg font-bold text-green-600">{importResult.summary.importedDocuments}</div>
                      <div className="text-xs text-muted-foreground">Documentos importados</div>
                    </div>
                    <div className="border rounded-lg p-3">
                      <div className="text-lg font-bold text-green-600">{importResult.summary.importedFaqs}</div>
                      <div className="text-xs text-muted-foreground">FAQs importadas</div>
                    </div>
                  </div>

                  {importResult.summary.errors.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="text-sm font-medium mb-2">Erros encontrados:</div>
                        <ul className="text-xs space-y-1">
                          {importResult.summary.errors.slice(0, 5).map((error, i) => (
                            <li key={i} className="text-destructive">• {error}</li>
                          ))}
                          {importResult.summary.errors.length > 5 && (
                            <li className="text-muted-foreground">... e mais {importResult.summary.errors.length - 5} erros</li>
                          )}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {importResult.summary.warnings.length > 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="text-sm font-medium mb-2">Avisos:</div>
                        <ul className="text-xs space-y-1">
                          {importResult.summary.warnings.map((warning, i) => (
                            <li key={i} className="text-yellow-600">• {warning}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              {importResult ? 'Fechar' : 'Cancelar'}
            </Button>
            {importResult ? (
              <Button onClick={() => { resetImport(); setShowImportDialog(false); }}>
                Nova Importação
              </Button>
            ) : (
              <Button 
                onClick={handleImport} 
                disabled={importing || !importFile}
              >
                {importing ? 'Importando...' : 'Importar'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

