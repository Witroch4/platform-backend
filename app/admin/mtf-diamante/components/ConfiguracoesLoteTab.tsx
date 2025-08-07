'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { CalendarIcon, Plus, Trash2, Edit, HelpCircle, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { DisparoMensagemDialog } from './DisparoMensagemDialog';
import { LoteCardSkeleton, VariavelSkeleton } from './LoadingSkeletons';
import { useMtfData } from '../context/MtfDataProvider';
import { validateVariable, ensureSpecialVariables, SPECIAL_VARIABLES } from '@/app/lib/variable-utils';
import { useVariableManager } from '@/hooks/useVariableManager';

interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  whatsappBusinessAccountId?: string;
  fbGraphApiBase?: string;
  whatsappToken?: string; // Só usado para novos tokens
  tokenMask?: string; // Máscara do token existente (••••••xx345)
  hasToken?: boolean; // Indica se existe um token salvo
}

interface MtfDiamanteVariavel {
  id?: string;
  chave: string;
  valor: string;
  tipo?: 'special' | 'custom';
  isRequired?: boolean;
  maxLength?: number;
  description?: string;
}

interface MtfDiamanteLote {
  id?: string;
  numero: number;
  nome: string;
  valor: string;
  dataInicio: string;
  dataFim: string;
  isActive: boolean;
}

interface ConfiguracoesLoteTabProps {
  configPadrao: WhatsAppConfig | null;
  onUpdate: () => void; // Função para recarregar os dados na página pai
}

const ConfiguracoesLoteTab = ({ configPadrao, onUpdate }: ConfiguracoesLoteTabProps) => {
  const [config, setConfig] = useState<WhatsAppConfig>({
    phoneNumberId: '',
    whatsappBusinessAccountId: '',
    fbGraphApiBase: '',
    hasToken: false,
    tokenMask: ''
  });
  const [newToken, setNewToken] = useState(''); // Token digitado pelo usuário

  // Usando contexto de dados para cache persistente
  const { variaveis, loadingVariaveis, refreshVariaveis, lotes, loadingLotes, refreshLotes } = useMtfData();
  
  // Using the enhanced variable manager for better variable handling
  const variableManager = useVariableManager();

  useEffect(() => {
    if (configPadrao) {
      setConfig(configPadrao);
    }
  }, [configPadrao]);

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'whatsappToken') {
      setNewToken(value);
    } else {
      setConfig(prev => ({ ...prev, [name]: value }));
    }
  };

  // Estado local para edição de variáveis (cópia dos dados do cache)
  const [variaveisEditaveis, setVariaveisEditaveis] = useState<MtfDiamanteVariavel[]>([]);

  // Sincroniza dados do cache com estado local para edição
  useEffect(() => {
    // Ensure special variables always exist
    const specialVariables = [
      {
        chave: 'chave_pix',
        valor: variaveis.find(v => v.chave === 'chave_pix')?.valor || '',
        tipo: 'special' as const,
        isRequired: true,
        maxLength: 15,
        description: 'PIX key for copy code button (max 15 characters)'
      },
      {
        chave: 'nome_do_escritorio_rodape',
        valor: variaveis.find(v => v.chave === 'nome_do_escritorio_rodape')?.valor || '',
        tipo: 'special' as const,
        isRequired: true,
        description: 'Company name that appears in footer automatically'
      }
    ];

    // Get custom variables (excluding special ones and lote variables)
    const customVariables = variaveis.filter(v => 
      !['chave_pix', 'nome_do_escritorio_rodape', 'lote_ativo'].includes(v.chave) &&
      !v.chave.startsWith('lote_') // Filtrar qualquer variável que comece com 'lote_'
    ).map(v => ({
      ...v,
      tipo: 'custom' as const,
      isRequired: false
    }));

    setVariaveisEditaveis([...specialVariables, ...customVariables]);
  }, [variaveis]);

  const handleVariavelChange = (index: number, field: 'chave' | 'valor', value: string) => {
    setVariaveisEditaveis(prev => prev.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
  };

  const adicionarVariavel = () => {
    setVariaveisEditaveis(prev => [...prev, { chave: '', valor: '' }]);
  };

  const removerVariavel = (index: number) => {
    setVariaveisEditaveis(prev => prev.filter((_, i) => i !== index));
  };

  const handleWhatsAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: any = {
      phoneNumberId: config.phoneNumberId,
      whatsappBusinessAccountId: config.whatsappBusinessAccountId,
      fbGraphApiBase: config.fbGraphApiBase
    };

    if (newToken.trim()) {
      payload.token = newToken;
    }

    try {
      const response = await fetch('/api/admin/mtf-diamante/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao salvar configurações do WhatsApp.');
      }

      toast.success('Configurações do WhatsApp salvas com sucesso!');
      setNewToken('');
      onUpdate();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };



  const handleVariaveisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Use the enhanced variable manager for saving
    const success = await variableManager.saveVariables(variaveisEditaveis);
    
    if (success) {
      // Refresh the cache after successful save
      refreshVariaveis();
    }
  };

  return (
    <div className="space-y-6">
      {/* SEÇÃO 1: CONFIGURAÇÃO WHATSAPP */}
      <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            Configuração WhatsApp
          </CardTitle>
          <CardDescription>
            Configure as credenciais de acesso à API do WhatsApp Business.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleWhatsAppSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                name="phoneNumberId"
                type="text"
                value={config.phoneNumberId || ''}
                onChange={handleWhatsAppChange}
                placeholder="ID do Número de Telefone da Meta"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsappBusinessAccountId">WhatsApp Business Account ID</Label>
              <Input
                id="whatsappBusinessAccountId"
                name="whatsappBusinessAccountId"
                type="text"
                value={config.whatsappBusinessAccountId || ''}
                onChange={handleWhatsAppChange}
                placeholder="ID da Conta Business do WhatsApp"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fbGraphApiBase">Facebook Graph API Base URL</Label>
              <Input
                id="fbGraphApiBase"
                name="fbGraphApiBase"
                type="url"
                value={config.fbGraphApiBase || ''}
                onChange={handleWhatsAppChange}
                placeholder="https://graph.facebook.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsappToken">Token de Acesso Permanente</Label>
              <div className="space-y-2">
                <Input
                  id="whatsappToken"
                  name="whatsappToken"
                  type="password"
                  autoComplete="off"
                  value={newToken}
                  onChange={handleWhatsAppChange}
                  placeholder={config.hasToken ? "Digite um novo token para alterar" : "Seu token de acesso da API do WhatsApp"}
                  required={!config.hasToken}
                />
                {config.hasToken && config.tokenMask && (
                  <div className="text-xs text-gray-500 font-mono">
                    Token configurado: {config.tokenMask}
                  </div>
                )}
              </div>
            </div>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Salvar Configurações WhatsApp
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* SEÇÃO 2: VARIÁVEIS DO MÉTODO */}
      <Card className="border-purple-200 bg-purple-50/30 dark:border-purple-800 dark:bg-purple-950/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            Variáveis do Método
          </CardTitle>
          <CardDescription>
            Crie e gerencie variáveis personalizadas que podem ser usadas em suas automações e mensagens. Use nomes curtos e sem espaços, como chave_pix.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVariaveisSubmit} className="space-y-4">
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4 space-y-4">
              <TooltipProvider>
                {/* Variáveis Especiais (Padrão) */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-purple-700 dark:text-purple-300 border-b border-purple-200 dark:border-purple-700 pb-2">
                    Variáveis Especiais
                  </h4>

                  {/* Chave PIX */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end bg-purple-50/50 dark:bg-purple-900/20 p-3 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label htmlFor="chave_pix" className="text-sm font-medium">chave_pix</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-purple-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-sm">
                              <strong>Variável especial PIX</strong><br />
                              Para ser usada com botão de copiar código no WhatsApp.
                              Pode ter no máximo 15 caracteres.
                              Pode colocar por exemplo CPF ou CNPJ.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="chave_pix"
                        value={variaveisEditaveis.find(v => v.chave === 'chave_pix')?.valor || ''}
                        onChange={(e) => {
                          const index = variaveisEditaveis.findIndex(v => v.chave === 'chave_pix');
                          if (index >= 0) {
                            handleVariavelChange(index, 'valor', e.target.value);
                          }
                        }}
                        placeholder="Ex: 12345678901"
                        maxLength={15}
                        className="font-mono"
                      />
                      <p className="text-xs text-gray-500 mt-1">Máximo 15 caracteres</p>
                    </div>
                  </div>

                  {/* Nome do Escritório Rodapé */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end bg-purple-50/50 dark:bg-purple-900/20 p-3 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Label htmlFor="nome_do_escritorio_rodape" className="text-sm font-medium">nome_do_escritorio_rodape</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-purple-500 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-sm">
                              <strong>Variável especial Nome do escritório</strong><br />
                              Ela automaticamente será adicionada ao rodapé das mensagens por padrão.
                              Esta variável é importante pois aparece muito nas mensagens.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <Input
                        id="nome_do_escritorio_rodape"
                        value={variaveisEditaveis.find(v => v.chave === 'nome_do_escritorio_rodape')?.valor || ''}
                        onChange={(e) => {
                          const index = variaveisEditaveis.findIndex(v => v.chave === 'nome_do_escritorio_rodape');
                          if (index >= 0) {
                            handleVariavelChange(index, 'valor', e.target.value);
                          }
                        }}
                        placeholder="Ex: Meu Escritório de Advocacia"
                      />
                      <p className="text-xs text-gray-500 mt-1">Aparece automaticamente no rodapé</p>
                    </div>
                  </div>
                </div>

                {/* Variáveis Personalizadas */}
                {variaveisEditaveis.filter(v => !['chave_pix', 'nome_do_escritorio_rodape'].includes(v.chave)).length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 pb-2">
                      Variáveis Personalizadas
                    </h4>
                    {variaveisEditaveis
                      .filter(v => !['chave_pix', 'nome_do_escritorio_rodape'].includes(v.chave))
                      .map((variavel, originalIndex) => {
                        const index = variaveisEditaveis.findIndex(v => v.id === variavel.id || (v.chave === variavel.chave && v.valor === variavel.valor));
                        return (
                          <div key={`${variavel.id || index}-${originalIndex}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <div>
                              <Label htmlFor={`chave-${index}`}>Nome da Variável (Chave)</Label>
                              <Input
                                id={`chave-${index}`}
                                value={variavel.chave}
                                onChange={(e) => handleVariavelChange(index, 'chave', e.target.value)}
                                placeholder="Ex: minha_variavel"
                                required
                                className={cn(
                                  variavel.chave && !/^[a-z_]+$/.test(variavel.chave) 
                                    ? "border-red-500 focus:border-red-500" 
                                    : ""
                                )}
                              />
                              {variavel.chave && !/^[a-z_]+$/.test(variavel.chave) && (
                                <p className="text-xs text-red-500 mt-1">
                                  Use apenas letras minúsculas e underscores
                                </p>
                              )}
                            </div>
                            <div>
                              <Label htmlFor={`valor-${index}`}>Valor da Variável</Label>
                              <Input
                                id={`valor-${index}`}
                                value={variavel.valor}
                                onChange={(e) => handleVariavelChange(index, 'valor', e.target.value)}
                                placeholder="Ex: Meu valor personalizado"
                                required
                              />
                            </div>
                            <div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removerVariavel(index)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </TooltipProvider>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={adicionarVariavel}
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Nova Variável
              </Button>
              <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
                Salvar Variáveis
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* SEÇÃO 3: CONFIGURAÇÃO DE LOTES */}
      <Card className="border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/30">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Configuração de Lotes MTF Diamante
              </CardTitle>
              <CardDescription>
                Configure os lotes que serão utilizados nas mensagens interativas do sistema.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <DisparoMensagemDialog />
              <AdicionarLoteDialog onLoteAdicionado={refreshLotes} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLotes ? (
            <div className="space-y-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <LoteCardSkeleton key={i} />
              ))}
            </div>
          ) : lotes.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>Nenhum lote configurado.</p>
              <p className="text-sm">Clique em "Adicionar Lote" para criar um novo lote.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {lotes.map((lote) => (
                <LoteCard key={lote.id} lote={lote} onUpdate={refreshLotes} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Componente para exibir um card de lote
function LoteCard({ lote, onUpdate }: { lote: MtfDiamanteLote, onUpdate: () => void }) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleActive = async () => {
    const togglePromise = async () => {
      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !lote.isActive }),
      });

      if (!response.ok) {
        throw new Error('Erro ao atualizar status');
      }

      onUpdate();
      return response.json();
    };

    toast.promise(togglePromise, {
      loading: lote.isActive ? 'Desativando lote...' : 'Ativando lote...',
      success: `Lote ${lote.isActive ? 'desativado' : 'ativado'} com sucesso!`,
      error: 'Erro ao alterar status do lote',
    });
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Lote excluído com sucesso!');
        onUpdate();
        setShowDeleteDialog(false);
      } else {
        throw new Error('Erro ao excluir lote');
      }
    } catch (error) {
      toast.error('Erro ao excluir lote');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className={cn(
      "transition-all",
      lote.isActive
        ? "border-green-200 bg-green-50/50 dark:border-green-700 dark:bg-green-900/20"
        : "border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg dark:text-gray-100">Lote {lote.numero}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400">•</span>
                <span className="font-medium dark:text-gray-200">{lote.nome}</span>
              </div>
              <div className="text-lg font-bold text-green-600 dark:text-green-400">{lote.valor}</div>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              <span>Início: {format(new Date(lote.dataInicio), 'dd/MM/yyyy', { locale: ptBR })}</span>
              <span>•</span>
              <span>Fim: {format(new Date(lote.dataFim), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor={`active-${lote.id}`} className="text-sm dark:text-gray-300">Ativo</Label>
              <Switch
                id={`active-${lote.id}`}
                checked={lote.isActive}
                onCheckedChange={handleToggleActive}
              />
            </div>
            <EditarLoteDialog lote={lote} onLoteAtualizado={onUpdate} />
            <Button variant="ghost" size="icon" onClick={handleDeleteClick} className="hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" />
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este lote? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// Componente para adicionar novo lote
function AdicionarLoteDialog({ onLoteAdicionado }: { onLoteAdicionado: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero: 1,
    nome: '',
    valor: '',
    dataInicio: new Date(),
    dataFim: new Date(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Converter datas para string antes de enviar
      const payload = {
        ...formData,
        dataInicio: formData.dataInicio.toISOString().split('T')[0],
        dataFim: formData.dataFim.toISOString().split('T')[0],
      };

      const response = await fetch('/api/admin/mtf-diamante/lotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success('Lote adicionado com sucesso!');
        onLoteAdicionado();
        setOpen(false);
        setFormData({
          numero: 1,
          nome: '',
          valor: '',
          dataInicio: new Date(),
          dataFim: new Date(),
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao adicionar lote');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Lote
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Novo Lote</DialogTitle>
          <DialogDescription>
            Configure um novo lote para ser usado nas mensagens interativas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero">Número do Lote</Label>
              <Input
                id="numero"
                type="number"
                min="1"
                value={formData.numero}
                onChange={(e) => setFormData(prev => ({ ...prev, numero: Number.parseInt(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                value={formData.valor}
                onChange={(e) => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="R$ 287,90"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nome">Nome do Lote</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Primeiro Lote, Lote Premium"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataInicio && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataInicio ? format(formData.dataInicio, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataInicio}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataInicio: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data de Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataFim && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataFim ? format(formData.dataFim, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataFim}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataFim: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Adicionar Lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Componente para editar lote existente
function EditarLoteDialog({ lote, onLoteAtualizado }: { lote: MtfDiamanteLote, onLoteAtualizado: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    numero: lote.numero,
    nome: lote.nome,
    valor: lote.valor,
    dataInicio: new Date(lote.dataInicio),
    dataFim: new Date(lote.dataFim),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Converter datas para string antes de enviar
      const payload = {
        ...formData,
        dataInicio: formData.dataInicio.toISOString().split('T')[0],
        dataFim: formData.dataFim.toISOString().split('T')[0],
      };

      const response = await fetch(`/api/admin/mtf-diamante/lotes/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success('Lote atualizado com sucesso!');
        onLoteAtualizado();
        setOpen(false);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao atualizar lote');
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Edit className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Lote</DialogTitle>
          <DialogDescription>
            Atualize as informações do lote.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="numero">Número do Lote</Label>
              <Input
                id="numero"
                type="number"
                min="1"
                value={formData.numero}
                onChange={(e) => setFormData(prev => ({ ...prev, numero: Number.parseInt(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="valor">Valor</Label>
              <Input
                id="valor"
                value={formData.valor}
                onChange={(e) => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="R$ 287,90"
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="nome">Nome do Lote</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Primeiro Lote, Lote Premium"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Data de Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataInicio && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataInicio ? format(formData.dataInicio, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataInicio}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataInicio: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data de Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !formData.dataFim && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.dataFim ? format(formData.dataFim, 'dd/MM/yyyy', { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.dataFim}
                    onSelect={(date) => date && setFormData(prev => ({ ...prev, dataFim: date }))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Atualizar Lote'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ConfiguracoesLoteTab;