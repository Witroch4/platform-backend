"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RefreshCw, BarChart3, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Intent = { 
  id: string; 
  name: string; 
  description: string | null; 
  similarityThreshold: number; 
  createdAt: string;
  usageCount?: number;
  embedding?: any;
  actionType?: string;
  templateId?: string | null;
};

type IntentMetrics = {
  totalClassifications: number;
  successfulMatches: number;
  averageConfidence: number;
  lastUsed: string | null;
  embeddingStatus: 'available' | 'missing' | 'regenerating';
};

type BulkOperation = {
  type: 'regenerate_embeddings' | 'update_thresholds' | 'performance_analysis';
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  total: number;
};

export default function GlobalIntentsPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [similarityThreshold, setThreshold] = useState(0.8);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<Intent | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editThreshold, setEditThreshold] = useState(0.8);
  
  // SocialWise Flow integration state
  const [intentMetrics, setIntentMetrics] = useState<Record<string, IntentMetrics>>({});
  const [bulkOperation, setBulkOperation] = useState<BulkOperation>({ type: 'regenerate_embeddings', status: 'idle', progress: 0, total: 0 });
  const [showMetrics, setShowMetrics] = useState(false);
  const [selectedIntents, setSelectedIntents] = useState<Set<string>>(new Set());

  const load = async () => {
    const r = await fetch('/api/admin/ai-integration/intents', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setIntents(Array.isArray(j?.intents) ? j.intents : []);
    }
  };

  const loadMetrics = async () => {
    try {
      const r = await fetch('/api/admin/ai-integration/intents/analytics', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        // Transform analytics data into metrics per intent
        const metricsMap: Record<string, IntentMetrics> = {};
        
        if (j.topIntents && Array.isArray(j.topIntents)) {
          j.topIntents.forEach((intent: any) => {
            metricsMap[intent.id] = {
              totalClassifications: intent.totalClassifications || 0,
              successfulMatches: intent.successfulMatches || 0,
              averageConfidence: intent.averageConfidence || 0,
              lastUsed: intent.lastUsed || null,
              embeddingStatus: intent.embedding ? 'available' : 'missing'
            };
          });
        }
        
        // Add metrics for intents not in topIntents
        intents.forEach(intent => {
          if (!metricsMap[intent.id]) {
            metricsMap[intent.id] = {
              totalClassifications: 0,
              successfulMatches: 0,
              averageConfidence: 0,
              lastUsed: null,
              embeddingStatus: intent.embedding ? 'available' : 'missing'
            };
          }
        });
        
        setIntentMetrics(metricsMap);
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  };

  const regenerateEmbeddings = async (intentIds: string[]) => {
    setBulkOperation({ type: 'regenerate_embeddings', status: 'running', progress: 0, total: intentIds.length });
    
    try {
      for (let i = 0; i < intentIds.length; i++) {
        const intentId = intentIds[i];
        const intent = intents.find(int => int.id === intentId);
        
        if (intent && intent.description) {
          // Update embedding status to regenerating
          setIntentMetrics(prev => ({
            ...prev,
            [intentId]: { ...prev[intentId], embeddingStatus: 'regenerating' }
          }));
          
          // Trigger embedding regeneration by updating the intent
          await fetch('/api/admin/ai-integration/intents', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              id: intentId, 
              description: intent.description // This will trigger embedding regeneration
            })
          });
          
          // Update embedding status to available
          setIntentMetrics(prev => ({
            ...prev,
            [intentId]: { ...prev[intentId], embeddingStatus: 'available' }
          }));
        }
        
        setBulkOperation(prev => ({ ...prev, progress: i + 1 }));
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      setBulkOperation(prev => ({ ...prev, status: 'completed' }));
      await load(); // Reload intents
      await loadMetrics(); // Reload metrics
    } catch (error) {
      console.error('Erro na regeneração de embeddings:', error);
      setBulkOperation(prev => ({ ...prev, status: 'error' }));
    }
  };

  const prewarmEmbeddings = async () => {
    try {
      const response = await fetch('/api/admin/ai-integration/intents/prewarm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentIds: Array.from(selectedIntents) })
      });
      
      if (response.ok) {
        console.log('Embeddings pré-aquecidos com sucesso');
        await loadMetrics();
      }
    } catch (error) {
      console.error('Erro ao pré-aquecer embeddings:', error);
    }
  };

  useEffect(() => { 
    load(); 
    if (showMetrics) {
      loadMetrics();
    }
  }, [showMetrics]);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/ai-integration/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, similarityThreshold })
      });
      if (r.ok) {
        toast.success("Intenção criada com sucesso!");
        setName('');
        setDescription('');
        setThreshold(0.8);
        await load();
      } else {
        const errorData = await r.json().catch(() => ({}));
        toast.error(errorData.error || "Erro ao criar intenção");
      }
    } catch (error) {
      console.error("Error creating intent:", error);
      toast.error("Erro ao criar intenção");
    } finally { 
      setSaving(false); 
    }
  };

  const remove = async (id: string) => {
    try {
      const r = await fetch(`/api/admin/ai-integration/intents?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) {
        toast.success("Intenção removida com sucesso!");
        await load();
      } else {
        toast.error("Erro ao remover intenção");
      }
    } catch (error) {
      console.error("Error removing intent:", error);
      toast.error("Erro ao remover intenção");
    }
  };

  const openEdit = (i: Intent) => {
    setEditTarget(i);
    setEditName(i.name);
    setEditDescription(i.description || '');
    setEditThreshold(i.similarityThreshold);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const id = editTarget.id;
    const optimistic: Intent = { ...editTarget, name: editName, description: editDescription || null, similarityThreshold: editThreshold };
    setIntents((prev) => prev.map((x) => (x.id === id ? optimistic : x)));
    setEditing(false);
    try {
      const r = await fetch('/api/admin/ai-integration/intents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editName, description: editDescription, similarityThreshold: editThreshold })
      });
      if (r.ok) {
        toast.success("Intenção atualizada com sucesso!");
      } else {
        toast.error("Erro ao atualizar intenção");
        await load();
      }
    } catch (error) {
      console.error("Error updating intent:", error);
      toast.error("Erro ao atualizar intenção");
      await load();
    } finally {
      setEditTarget(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <button onClick={() => router.push('/admin/capitao')} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
      <div className="border rounded-md">
        <div className="p-4 font-medium">Nova Intenção (Global)</div>
        <div className="p-4 grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm font-medium">Nome</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Recurso OAB" />
          </div>
          <div>
            <label className="text-sm font-medium">Descrição</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="descreva a intenção, opções, prazos, termos..." />
          </div>
          <div>
            <label className="text-sm font-medium">Threshold</label>
            <Input type="number" step="0.01" min="0" max="1" value={similarityThreshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={create} disabled={saving || !name.trim()}>Salvar Intenção (IA)</Button>
          </div>
        </div>
      </div>

      {/* SocialWise Flow Integration Panel */}
      <Collapsible open={showMetrics} onOpenChange={setShowMetrics} className="border rounded-md">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            <span className="font-medium">SocialWise Flow - Otimizações</span>
          </div>
          <CollapsibleTrigger className="text-sm text-muted-foreground hover:underline">
            {showMetrics ? 'Ocultar' : 'Mostrar'} Métricas e Operações
          </CollapsibleTrigger>
        </div>
        <Separator />
        <CollapsibleContent className="p-4 space-y-4">
          {/* Bulk Operations */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-md p-3">
              <div className="text-sm font-medium mb-2">Regenerar Embeddings</div>
              <p className="text-xs text-muted-foreground mb-3">
                Regenera embeddings para intenções selecionadas para melhorar a classificação
              </p>
              <Button 
                size="sm" 
                onClick={() => regenerateEmbeddings(Array.from(selectedIntents))}
                disabled={selectedIntents.size === 0 || bulkOperation.status === 'running'}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Regenerar ({selectedIntents.size})
              </Button>
            </div>
            
            <div className="border rounded-md p-3">
              <div className="text-sm font-medium mb-2">Pré-aquecer Cache</div>
              <p className="text-xs text-muted-foreground mb-3">
                Carrega embeddings no cache Redis para acesso mais rápido
              </p>
              <Button 
                size="sm" 
                variant="outline"
                onClick={prewarmEmbeddings}
                disabled={selectedIntents.size === 0}
              >
                <Zap className="w-3 h-3 mr-1" />
                Pré-aquecer ({selectedIntents.size})
              </Button>
            </div>
            
            <div className="border rounded-md p-3">
              <div className="text-sm font-medium mb-2">Análise de Performance</div>
              <p className="text-xs text-muted-foreground mb-3">
                Analisa métricas de classificação e sugere otimizações
              </p>
              <Button 
                size="sm" 
                variant="outline"
                onClick={loadMetrics}
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Analisar
              </Button>
            </div>
          </div>

          {/* Bulk Operation Progress */}
          {bulkOperation.status === 'running' && (
            <div className="border rounded-md p-3 bg-blue-50">
              <div className="text-sm font-medium mb-2">
                {bulkOperation.type === 'regenerate_embeddings' && 'Regenerando Embeddings...'}
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${(bulkOperation.progress / bulkOperation.total) * 100}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {bulkOperation.progress} de {bulkOperation.total} concluídos
              </div>
            </div>
          )}

          {/* Selection Controls */}
          <div className="flex items-center gap-2 text-sm">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedIntents(new Set(intents.map(i => i.id)))}
            >
              Selecionar Todos
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setSelectedIntents(new Set())}
            >
              Limpar Seleção
            </Button>
            <span className="text-muted-foreground">
              {selectedIntents.size} de {intents.length} selecionados
            </span>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border rounded-md">
        <div className="p-4 font-medium">Intenções Cadastradas</div>
        <div className="p-4 divide-y">
          {intents.length === 0 && <div className="text-sm text-muted-foreground">Nenhuma intenção cadastrada.</div>}
          {intents.map((i) => {
            const metrics = intentMetrics[i.id];
            const isSelected = selectedIntents.has(i.id);
            
            return (
              <div key={i.id} className="py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {showMetrics && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newSelected = new Set(selectedIntents);
                          if (e.target.checked) {
                            newSelected.add(i.id);
                          } else {
                            newSelected.delete(i.id);
                          }
                          setSelectedIntents(newSelected);
                        }}
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium">{i.name}</div>
                      {i.description && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{i.description}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground">threshold: {i.similarityThreshold}</div>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(i)}>Editar</Button>
                    <Button variant="destructive" size="sm" onClick={() => remove(i.id)}>Excluir</Button>
                  </div>
                </div>
                
                {/* SocialWise Flow Metrics */}
                {showMetrics && metrics && (
                  <div className="ml-6 flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Classificações:</span>
                      <span className="font-medium">{metrics.totalClassifications}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Taxa de Sucesso:</span>
                      <span className="font-medium">
                        {metrics.totalClassifications > 0 
                          ? `${Math.round((metrics.successfulMatches / metrics.totalClassifications) * 100)}%`
                          : 'N/A'
                        }
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Confiança Média:</span>
                      <span className="font-medium">{Math.round(metrics.averageConfidence * 100)}%</span>
                    </div>
                    <Badge 
                      variant={
                        metrics.embeddingStatus === 'available' ? 'default' :
                        metrics.embeddingStatus === 'regenerating' ? 'secondary' : 'destructive'
                      }
                    >
                      {metrics.embeddingStatus === 'available' && 'Embedding OK'}
                      {metrics.embeddingStatus === 'regenerating' && 'Regenerando...'}
                      {metrics.embeddingStatus === 'missing' && 'Sem Embedding'}
                    </Badge>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={editing} onOpenChange={(v) => { if (!v) setEditing(false); }}>
        <DialogContent className="w-[96vw] sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Editar Intenção</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Threshold</label>
              <Input type="number" step="0.01" min="0" max="1" value={editThreshold} onChange={(e) => setEditThreshold(Number(e.target.value))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={!editName.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


