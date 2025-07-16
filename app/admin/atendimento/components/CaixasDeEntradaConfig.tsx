'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ApiWhatsApp } from './ApiWhatsApp';
import { Loader2, Settings, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";

interface CaixaEntrada {
  id: string;
  nome: string;
  inboxId: string;
  inboxName: string;
  channelType: string;
  createdAt: string;
  whatsAppConfig: any;
  templatesCount: number;
}

interface ConfigPadrao {
  id: string;
  whatsappToken: string;
  whatsappBusinessAccountId: string;
  fbGraphApiBase: string;
  isActive: boolean;
}

export function CaixasDeEntradaConfig() {
  const [caixas, setCaixas] = useState<CaixaEntrada[]>([]);
  const [configPadrao, setConfigPadrao] = useState<ConfigPadrao | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCaixa, setSelectedCaixa] = useState<CaixaEntrada | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchCaixas = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/whatsapp-config/inboxes');
      const data = await response.json();
      
      if (data.success) {
        setCaixas(data.caixas);
        setConfigPadrao(data.configPadrao);
      } else {
        toast.error("Erro ao carregar caixas de entrada");
      }
    } catch (error) {
      console.error('Erro ao buscar caixas:', error);
      toast.error("Erro ao carregar caixas de entrada");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaixas();
  }, []);

  const handleConfigSaved = () => {
    setDialogOpen(false);
    fetchCaixas(); // Recarrega as caixas para mostrar a nova configuração
    toast.success("Configuração salva com sucesso!");
  };

  const getStatusBadge = (caixa: CaixaEntrada) => {
    if (caixa.whatsAppConfig) {
      return <Badge variant="default" className="bg-green-100 text-green-800">Configurado</Badge>;
    } else if (configPadrao) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Usando Padrão</Badge>;
    } else {
      return <Badge variant="destructive" className="bg-red-100 text-red-800">Não Configurado</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Carregando caixas de entrada...</span>
      </div>
    );
  }

  if (caixas.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma caixa de entrada encontrada</h3>
          <p className="text-muted-foreground mb-4">
            Configure suas caixas de entrada no Chatwit para começar a usar as configurações do WhatsApp.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Configurações por Caixa de Entrada</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie configurações específicas do WhatsApp para cada caixa de entrada
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {caixas.map((caixa) => (
          <Card key={caixa.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base">{caixa.nome}</CardTitle>
                  <CardDescription className="text-sm">
                    {caixa.inboxName} • {caixa.channelType}
                  </CardDescription>
                </div>
                {getStatusBadge(caixa)}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Templates:</span>
                  <span className="font-medium">{caixa.templatesCount}</span>
                </div>
                
                <div className="flex gap-2">
                  <Dialog open={dialogOpen && selectedCaixa?.id === caixa.id} onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) setSelectedCaixa(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setSelectedCaixa(caixa)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Configurar API
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Configurar API do WhatsApp</DialogTitle>
                        <DialogDescription>
                          Configure a API do WhatsApp para a caixa: <strong>{caixa.nome}</strong>
                        </DialogDescription>
                      </DialogHeader>
                      <ApiWhatsApp 
                        inboxId={caixa.id} 
                        onConfigSaved={handleConfigSaved}
                        title={`Configuração para: ${caixa.nome}`}
                      />
                    </DialogContent>
                  </Dialog>

                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => {
                      // TODO: Implementar navegação para gerenciar templates
                      toast.info("Funcionalidade em desenvolvimento");
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Templates
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!configPadrao && (
        <Card className="border-dashed border-2">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-4">
              <Settings className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Configure a Configuração Padrão</h3>
            <p className="text-muted-foreground mb-4">
              É recomendado configurar uma configuração padrão que será usada quando uma caixa específica não tiver configuração própria.
            </p>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Configurar Padrão
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Configuração Padrão do WhatsApp</DialogTitle>
                  <DialogDescription>
                    Esta configuração será usada como fallback para caixas sem configuração específica.
                  </DialogDescription>
                </DialogHeader>
                <ApiWhatsApp 
                  onConfigSaved={handleConfigSaved}
                  title="Configuração Padrão"
                />
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 