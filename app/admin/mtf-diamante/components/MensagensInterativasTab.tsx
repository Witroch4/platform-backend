'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrashIcon, PencilIcon, Upload, Eye, Save, Plus, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { EnhancedTextArea } from './EnhancedTextArea';
import { TemplatePreview } from './TemplatesTab/components/template-preview';
import { useVariableManager } from '@/hooks/useVariableManager';
import { TemplateLibraryService } from '@/app/lib/template-library-service';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { MediaUploadComponent } from './shared/MediaUploadComponent';
import { ButtonManager } from './shared/ButtonManager';
import InteractiveMessageCreator from './InteractiveMessageCreator';
import type { InteractiveMessageType } from './interactive-message-creator/types';
import { InteractiveMessageTypeSelector } from './InteractiveMessageTypeSelector';

interface MensagensInterativasTabProps {
  caixaId: string;
}

interface Botao {
  id?: string;
  titulo: string;
}

interface Mensagem {
  id: string;
  nome: string;
  texto: string;
  headerTipo?: string | null;
  headerConteudo?: string | null;
  rodape?: string | null;
  botoes: Botao[];
}

const MensagensInterativasTab = ({ caixaId }: MensagensInterativasTabProps) => {
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit'>('list');
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMensagens = async () => {
    if (!caixaId) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/mtf-diamante/interactive-messages?caixaId=${caixaId}`);
      if (!response.ok) throw new Error('Falha ao buscar mensagens.');
      const data = await response.json();
      setMensagens(data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMensagens();
  }, [caixaId]);

  const handleEdit = (msg: Mensagem) => {
    // Convert old format to new format
    const convertedMessage = {
      id: msg.id,
      name: msg.nome,
      type: 'button' as InteractiveMessageType,
      body: { text: msg.texto },
      header: msg.headerTipo ? {
        type: msg.headerTipo === 'text' ? 'text' : msg.headerTipo,
        text: msg.headerTipo === 'text' ? msg.headerConteudo : undefined,
        media_url: msg.headerTipo !== 'text' ? msg.headerConteudo : undefined
      } : undefined,
      footer: msg.rodape ? { text: msg.rodape } : undefined,
      action: msg.botoes.length > 0 ? {
        buttons: msg.botoes.map(b => ({
          id: b.id || `btn_${Date.now()}`,
          title: b.titulo
        }))
      } : undefined
    };
    
    setEditingMessage(convertedMessage);
    setCurrentView('edit');
  };

  const handleDelete = async (mensagemId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem?')) return;
    try {
      const response = await fetch(`/api/admin/mtf-diamante/interactive-messages/${mensagemId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao excluir mensagem.');
      }
      toast.success('Mensagem excluída com sucesso!');
      fetchMensagens();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSaveMessage = (message: any) => {
    toast.success('Mensagem salva com sucesso!');
    setCurrentView('list');
    setEditingMessage(null);
    fetchMensagens();
  };

  const handleBackToList = () => {
    setCurrentView('list');
    setEditingMessage(null);
  };

  // Render create/edit view
  if (currentView === 'create' || currentView === 'edit') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBackToList}
              className="hover:bg-accent hover:text-accent-foreground"
            >
              ←
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {currentView === 'edit' ? 'Editar' : 'Criar'} Mensagem Interativa
              </h2>
              <p className="text-muted-foreground">
                Crie mensagens interativas avançadas com todos os tipos suportados pelo WhatsApp Business
              </p>
            </div>
          </div>
        </div>
        
        <InteractiveMessageCreator
          caixaId={caixaId}
          onSave={handleSaveMessage}
          editingMessage={editingMessage}
        />
      </div>
    );
  }

  // Render main list view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">Mensagens Interativas</h2>
            <p className="text-muted-foreground">
              Gerencie mensagens interativas com botões, listas, localização e mais funcionalidades avançadas.
            </p>
          </div>
        </div>
        <Button 
          onClick={() => setCurrentView('create')}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" /> Nova Mensagem Interativa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens Salvas</CardTitle>
          <CardDescription>
            Gerencie suas mensagens interativas salvas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}
          
          <div className="space-y-3">
            {mensagens.map(msg => (
              <div key={msg.id} className="border border-border p-4 rounded-lg flex justify-between items-start hover:bg-accent/50 transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-foreground">{msg.nome}</span>
                    <Badge variant="outline" className="text-xs">
                      {msg.headerTipo ? `${msg.headerTipo.toUpperCase()} + ` : ''}
                      {msg.botoes.length > 0 ? `${msg.botoes.length} BOTÕES` : 'TEXTO'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                    {msg.texto}
                  </p>
                  {msg.botoes.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {msg.botoes.map((botao, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {botao.titulo}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleEdit(msg)}
                    title="Editar mensagem"
                    className="hover:bg-accent"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleDelete(msg.id)}
                    title="Excluir mensagem"
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {!loading && mensagens.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhuma mensagem interativa ainda</p>
                <p className="text-sm mb-4">Crie sua primeira mensagem interativa com botões, listas e mais funcionalidades</p>
                <Button 
                  onClick={() => setCurrentView('create')}
                  variant="outline"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Mensagem
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MensagensInterativasTab;