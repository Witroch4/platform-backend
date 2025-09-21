'use client';

import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Library, 
  Search, 
  Globe, 
  User, 
  MessageSquare, 
  FileText, 
  Eye,
  Download,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { useTemplateLibrary } from '../hooks/useTemplateLibrary';
import type { TemplateLibraryWithCreator } from '@/app/lib/template-library-service';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface TemplateLibrarySelectorProps {
  onSelect: (template: TemplateLibraryWithCreator) => void;
  type?: 'template' | 'interactive_message' | 'all';
  trigger?: React.ReactNode;
}

export const TemplateLibrarySelector: React.FC<TemplateLibrarySelectorProps> = ({
  onSelect,
  type = 'all',
  trigger
}) => {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState<'all' | 'global' | 'account_specific'>('all');

  const {
    templates,
    loading: templatesLoading,
    error: templatesError,
    requestApproval
  } = useTemplateLibrary({
    type: type === 'all' ? undefined : type,
    scope: selectedScope === 'all' ? undefined : selectedScope,
    search: searchQuery || undefined,
    autoFetch: open
  });

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleSelectTemplate = (template: TemplateLibraryWithCreator) => {
    // If template has approval requests but none approved, block usage
    const approved = template.approvalRequests?.some(r => r.status === 'approved');
    if (template.approvalRequests && !approved) {
      toast.error('Este template requer aprovação antes de ser usado');
      return;
    }

    onSelect(template);
    setOpen(false);
    toast.success('Template selecionado da biblioteca!');
  };

  const handleRequestApproval = async (templateId: string) => {
    try {
      await requestApproval(templateId, 'Solicitação de aprovação para uso deste template');
      toast.success('Solicitação de aprovação enviada!');
    } catch (error) {
      console.error('Error requesting approval:', error);
      toast.error('Erro ao solicitar aprovação');
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'template' ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getScopeIcon = (scope: string) => {
    return scope === 'GLOBAL' ? <Globe className="h-4 w-4" /> : <User className="h-4 w-4" />;
  };

  const getScopeLabel = (scope: string) => {
    return scope === 'GLOBAL' ? 'Biblioteca' : 'Privado';
  };

  const getScopeBadgeVariant = (scope: string) => {
    return scope === 'GLOBAL' ? 'default' : 'secondary';
  };

  const getTypeLabel = (type: string) => {
    return type === 'template' ? 'Template' : 'Mensagem Interativa';
  };

  const getApprovalStatus = (template: TemplateLibraryWithCreator) => {
    const latestRequest = template.approvalRequests?.[0];
    if (!latestRequest) {
      return <Badge variant="secondary" className="text-xs">Sem Aprovação Necessária</Badge>;
    }

    switch (latestRequest.status) {
      case 'pending':
        return <Badge variant="default" className="text-xs"><Clock className="h-3 w-3 mr-1" />Pendente</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-500 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Aprovado</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Rejeitado</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">Desconhecido</Badge>;
    }
  };

  const canUseTemplate = (template: TemplateLibraryWithCreator) => {
    return template.approvalRequests ?
      template.approvalRequests.some(r => r.status === 'approved') : true;
  };

  const defaultTrigger = (
    <Button variant="outline" className="flex items-center gap-2">
      <Library className="h-4 w-4" />
      Usar da Biblioteca
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Selecionar da Biblioteca
          </DialogTitle>
          <DialogDescription>
            Escolha um template ou mensagem interativa da biblioteca para usar como base
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 overflow-hidden">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar na biblioteca..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={selectedScope}
                onChange={(e) => setSelectedScope(e.target.value as any)}
                className="px-3 py-2 border rounded-md bg-background text-foreground"
              >
                <option value="all">Todos os Escopos</option>
                <option value="global">Biblioteca (Global)</option>
                <option value="account_specific">Privado (Conta)</option>
              </select>
            </div>
          </div>

          {/* Lista de Templates */}
          <div className="flex-1 overflow-y-auto">
            {templatesLoading ? (
              <div className="text-center py-8">Carregando templates...</div>
            ) : templatesError ? (
              <div className="text-center py-8 text-red-500">Erro: {templatesError}</div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Library className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhum template encontrado</p>
                <p className="text-sm">Tente ajustar os filtros ou criar um novo template</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((template) => (
                  <Card key={template.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(template.type)}
                          <CardTitle className="text-base">{template.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-1">
                          {getScopeIcon(template.scope)}
                          <Badge variant={getScopeBadgeVariant(template.scope)} className="text-xs">
                            {getScopeLabel(template.scope)}
                          </Badge>
                        </div>
                      </div>
                      {template.description && (
                        <CardDescription className="text-sm">{template.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Por {template.createdBy.name || template.createdBy.email}</span>
                        <span>Usado {template.usageCount ?? 0} vezes</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {getTypeLabel(template.type)}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        {getApprovalStatus(template)}
                      </div>

                      <div className="flex gap-2">
                        {canUseTemplate(template) ? (
                          <Button
                            
                            onClick={() => handleSelectTemplate(template)}
                            className="flex-1"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Usar Template
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            
                            onClick={() => handleRequestApproval(template.id)}
                            className="flex-1"
                          >
                            Solicitar Aprovação
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};