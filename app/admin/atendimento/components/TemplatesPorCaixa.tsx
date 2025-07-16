'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, MessageSquare, Plus, Star, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface WhatsAppTemplate {
  id: string;
  templateId: string;
  name: string;
  status: string;
  category: string;
  language: string;
  isFavorite: boolean;
  createdAt: string;
  caixaEntradaId?: string;
}

interface CaixaEntrada {
  id: string;
  nome: string;
  inboxId: string;
  inboxName: string;
  channelType: string;
  templatesCount: number;
}

export function TemplatesPorCaixa() {
  const [caixas, setCaixas] = useState<CaixaEntrada[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
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

  const fetchTemplates = async (caixaId?: string) => {
    try {
      const url = caixaId 
        ? `/api/admin/whatsapp-templates?caixaId=${caixaId}`
        : '/api/admin/whatsapp-templates';
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setTemplates(data.templates);
      } else {
        toast.error("Erro ao carregar templates");
      }
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
      toast.error("Erro ao carregar templates");
    }
  };

  useEffect(() => {
    fetchCaixas();
  }, []);

  const handleCaixaSelect = (caixa: CaixaEntrada) => {
    setSelectedCaixa(caixa);
    fetchTemplates(caixa.id);
    setDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: "default" | "secondary" | "destructive", label: string }> = {
      'APPROVED': { variant: 'default', label: 'Aprovado' },
      'PENDING': { variant: 'secondary', label: 'Pendente' },
      'REJECTED': { variant: 'destructive', label: 'Rejeitado' },
      'DISABLED': { variant: 'destructive', label: 'Desabilitado' }
    };

    const config = statusMap[status] || { variant: 'secondary', label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getCategoryBadge = (category: string) => {
    const categoryMap: Record<string, { variant: "default" | "secondary" | "outline", label: string }> = {
      'UTILITY': { variant: 'default', label: 'Utilitário' },
      'MARKETING': { variant: 'secondary', label: 'Marketing' },
      'AUTHENTICATION': { variant: 'outline', label: 'Autenticação' }
    };

    const config = categoryMap[category] || { variant: 'outline', label: category };
    return <Badge variant={config.variant} className="text-xs">{config.label}</Badge>;
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
            Configure suas caixas de entrada no Chatwit para começar a gerenciar templates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Templates por Caixa de Entrada</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie templates específicos do WhatsApp para cada caixa de entrada
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
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Templates:</span>
                  <span className="font-medium">{caixa.templatesCount}</span>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => handleCaixaSelect(caixa)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Gerenciar Templates
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog para mostrar templates da caixa selecionada */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Templates da Caixa: {selectedCaixa?.nome}</DialogTitle>
            <DialogDescription>
              Gerencie os templates específicos desta caixa de entrada
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h4 className="font-medium">Templates ({templates.length})</h4>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Importar Templates
              </Button>
            </div>

            {templates.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum template encontrado para esta caixa</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <Card key={template.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-medium">{template.name}</h5>
                          {template.isFavorite && (
                            <Star className="h-4 w-4 text-yellow-500 fill-current" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(template.status)}
                          {getCategoryBadge(template.category)}
                          <Badge variant="outline" className="text-xs">
                            {template.language}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ID: {template.templateId}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
} 