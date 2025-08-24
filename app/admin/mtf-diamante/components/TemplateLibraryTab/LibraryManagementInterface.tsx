'use client';

import type React from 'react';
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Plus, 
  Edit, 
  Trash2, 
  Globe, 
  User, 
  MessageSquare, 
  FileText,
  Settings,
  Users
} from 'lucide-react';
import { useTemplateLibrary } from '../../hooks/useTemplateLibrary';
import { TemplateLibraryWithCreator } from '@/app/lib/template-library-service';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

interface LibraryManagementInterfaceProps {
  onCreateGlobal: () => void;
}

export const LibraryManagementInterface: React.FC<LibraryManagementInterfaceProps> = ({
  onCreateGlobal
}) => {
  const { data: session } = useSession();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'template' | 'interactive_message'>('all');

  const isSuperAdmin = session?.user?.role === 'SUPERADMIN';

  const {
    templates: globalTemplates,
    loading: globalLoading,
    error: globalError,
    deleteTemplate
  } = useTemplateLibrary({
    type: selectedType === 'all' ? undefined : selectedType,
    scope: 'global',
    search: searchQuery || undefined,
    autoFetch: true
  });

  const {
    templates: accountTemplates,
    loading: accountLoading,
    error: accountError
  } = useTemplateLibrary({
    type: selectedType === 'all' ? undefined : selectedType,
    scope: 'account_specific',
    search: searchQuery || undefined,
    autoFetch: true
  });

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (confirm(`Tem certeza que deseja excluir o template "${templateName}"?`)) {
      try {
        await deleteTemplate(templateId);
        toast.success('Template excluído com sucesso!');
      } catch (error) {
        console.error('Error deleting template:', error);
        toast.error('Erro ao excluir template');
      }
    }
  };

  const getTypeIcon = (type: string) => {
    return type === 'template' ? <FileText className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />;
  };

  const getTypeLabel = (type: string) => {
    return type === 'template' ? 'Template' : 'Mensagem Interativa';
  };

  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            Acesso Restrito
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Esta funcionalidade está disponível apenas para usuários SUPERADMIN.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Gerenciamento da Biblioteca</h2>
            <p className="text-muted-foreground">
              Gerencie templates e mensagens interativas globais
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            <Shield className="h-3 w-3 mr-1" />
            SUPERADMIN
          </Badge>
          <Button onClick={onCreateGlobal}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Global
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="px-3 py-2 border rounded-md bg-background text-foreground"
              >
                <option value="all">Todos os Tipos</option>
                <option value="template">Templates</option>
                <option value="interactive_message">Mensagens Interativas</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="global" className="space-y-4">
        <TabsList variant="line">
          <TabsTrigger value="global">
            <Globe className="h-4 w-4 mr-2" />
            Templates Globais ({globalTemplates.length})
          </TabsTrigger>
          <TabsTrigger value="account">
            <Users className="h-4 w-4 mr-2" />
            Templates de Contas ({accountTemplates.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="global" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Templates Globais da Biblioteca</CardTitle>
              <CardDescription>
                Templates disponíveis para todos os usuários
              </CardDescription>
            </CardHeader>
            <CardContent>
              {globalLoading ? (
                <div className="text-center py-8">Carregando templates globais...</div>
              ) : globalError ? (
                <div className="text-center py-8 text-red-500">Erro: {globalError}</div>
              ) : globalTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Globe className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum template global encontrado</p>
                  <p className="text-sm">Crie o primeiro template global para a biblioteca</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {globalTemplates.map((template) => (
                    <div key={template.id} className="border border-border p-4 rounded-lg flex justify-between items-start hover:bg-accent/50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getTypeIcon(template.type)}
                          <span className="font-medium text-foreground">{template.name}</span>
                          <Badge variant="default" className="text-xs">
                            <Globe className="h-3 w-3 mr-1" />
                            Global
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(template.type)}
                          </Badge>
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Por {template.createdBy.name || template.createdBy.email}</span>
                          <span>Usado {template.usageCount ?? 0} vezes</span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Editar template"
                          className="hover:bg-accent"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteTemplate(template.id, template.name)}
                          title="Excluir template"
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Templates de Contas Específicas</CardTitle>
              <CardDescription>
                Templates criados por usuários para suas próprias contas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {accountLoading ? (
                <div className="text-center py-8">Carregando templates de contas...</div>
              ) : accountError ? (
                <div className="text-center py-8 text-red-500">Erro: {accountError}</div>
              ) : accountTemplates.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum template de conta encontrado</p>
                  <p className="text-sm">Templates criados por usuários aparecerão aqui</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {accountTemplates.map((template) => (
                    <div key={template.id} className="border border-border p-4 rounded-lg flex justify-between items-start hover:bg-accent/50 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getTypeIcon(template.type)}
                          <span className="font-medium text-foreground">{template.name}</span>
                          <Badge variant="secondary" className="text-xs">
                            <User className="h-3 w-3 mr-1" />
                            Privado
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(template.type)}
                          </Badge>
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Por {template.createdBy.name || template.createdBy.email}</span>
                          <span>Usado {template.usageCount ?? 0} vezes</span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Promover para global"
                          className="hover:bg-accent"
                        >
                          <Globe className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDeleteTemplate(template.id, template.name)}
                          title="Excluir template"
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};