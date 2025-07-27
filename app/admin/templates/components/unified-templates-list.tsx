"use client";

import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Search, 
  RefreshCw, 
  MessageSquare, 
  Eye,
  Edit,
  Trash2,
  Plus,
  Copy,
  Settings,
  Tag,
  Calendar,
  User,
  Globe,
  Lock
} from "lucide-react";
import { TemplateType, TemplateScope, TemplateStatus } from "@prisma/client";

interface UnifiedTemplate {
  id: string;
  name: string;
  description: string | null;
  type: TemplateType;
  scope: TemplateScope;
  status: TemplateStatus;
  language: string;
  tags: string[];
  isActive: boolean;
  usageCount: number;
  simpleReplyText: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  };
  inbox: {
    id: string;
    nome: string;
    inboxId: string;
  } | null;
  interactiveContent?: {
    id: string;
    header?: { type: string; content: string };
    body: { text: string };
    footer?: { text: string };
  };
  whatsappOfficialInfo?: {
    id: string;
    metaTemplateId: string;
    status: string;
    category: string;
    qualityScore: string | null;
  };
  mapeamentos: Array<{
    id: string;
    intentName: string;
    inboxId: string;
  }>;
  approvalRequests: Array<{
    id: string;
    status: string;
    requestMessage: string | null;
    requestedAt: string;
    requestedBy: {
      id: string;
      name: string | null;
    };
  }>;
  stats: {
    mapeamentosCount: number;
    approvalRequestsCount: number;
  };
}

interface UnifiedTemplatesListProps {
  onTemplateSelect?: (template: UnifiedTemplate) => void;
  onTemplateEdit?: (template: UnifiedTemplate) => void;
  onTemplateDelete?: (templateId: string) => void;
  onTemplateCreate?: () => void;
}

export function UnifiedTemplatesList({ 
  onTemplateSelect, 
  onTemplateEdit, 
  onTemplateDelete,
  onTemplateCreate
}: UnifiedTemplatesListProps) {
  const [templates, setTemplates] = useState<UnifiedTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TemplateType | "all">("all");
  const [scopeFilter, setScopeFilter] = useState<TemplateScope | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TemplateStatus | "all">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (searchQuery.trim()) {
        params.append("search", searchQuery);
      }

      if (typeFilter !== "all") {
        params.append("type", typeFilter);
      }

      if (scopeFilter !== "all") {
        params.append("scope", scopeFilter);
      }

      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      if (languageFilter !== "all") {
        params.append("language", languageFilter);
      }

      const response = await fetch(`/api/admin/templates?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setTemplates(data.templates);
        setPagination(data.pagination);
      } else {
        throw new Error(data.error || "Erro ao buscar templates");
      }
    } catch (error) {
      console.error("Erro ao buscar templates:", error);
      toast.error("Erro", { 
        description: "Não foi possível carregar os templates. Tente novamente." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [pagination.page, searchQuery, typeFilter, scopeFilter, statusFilter, languageFilter]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getTypeBadgeColor = (type: TemplateType) => {
    switch (type) {
      case TemplateType.WHATSAPP_OFFICIAL:
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case TemplateType.INTERACTIVE_MESSAGE:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case TemplateType.AUTOMATION_REPLY:
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getTypeLabel = (type: TemplateType) => {
    switch (type) {
      case TemplateType.WHATSAPP_OFFICIAL:
        return "WhatsApp Oficial";
      case TemplateType.INTERACTIVE_MESSAGE:
        return "Mensagem Interativa";
      case TemplateType.AUTOMATION_REPLY:
        return "Resposta Automática";
      default:
        return type;
    }
  };

  const getScopeBadgeColor = (scope: TemplateScope) => {
    switch (scope) {
      case TemplateScope.GLOBAL:
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
      case TemplateScope.PRIVATE:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusBadgeColor = (status: TemplateStatus) => {
    switch (status) {
      case TemplateStatus.APPROVED:
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
      case TemplateStatus.PENDING:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
      case TemplateStatus.REJECTED:
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const renderTemplatePreview = (template: UnifiedTemplate) => {
    switch (template.type) {
      case TemplateType.AUTOMATION_REPLY:
        return (
          <div className="text-xs text-muted-foreground max-w-[200px] truncate">
            {template.simpleReplyText || "Sem texto definido"}
          </div>
        );
      case TemplateType.INTERACTIVE_MESSAGE:
        if (template.interactiveContent) {
          return (
            <div className="text-xs text-muted-foreground">
              <div className="font-medium">
                {template.interactiveContent.body.text.substring(0, 50)}...
              </div>
              {template.interactiveContent.header && (
                <div className="text-xs opacity-75">
                  Header: {template.interactiveContent.header.type}
                </div>
              )}
            </div>
          );
        }
        break;
      case TemplateType.WHATSAPP_OFFICIAL:
        if (template.whatsappOfficialInfo) {
          return (
            <div className="text-xs text-muted-foreground">
              <div>ID: {template.whatsappOfficialInfo.metaTemplateId}</div>
              <div>Categoria: {template.whatsappOfficialInfo.category}</div>
              {template.whatsappOfficialInfo.qualityScore && (
                <div>Qualidade: {template.whatsappOfficialInfo.qualityScore}</div>
              )}
            </div>
          );
        }
        break;
    }
    return <div className="text-xs text-muted-foreground">Sem preview disponível</div>;
  };

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Templates Unificados
            </CardTitle>
            <Button onClick={onTemplateCreate} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="lg:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar templates..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TemplateType | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value={TemplateType.WHATSAPP_OFFICIAL}>WhatsApp Oficial</SelectItem>
                <SelectItem value={TemplateType.INTERACTIVE_MESSAGE}>Mensagem Interativa</SelectItem>
                <SelectItem value={TemplateType.AUTOMATION_REPLY}>Resposta Automática</SelectItem>
              </SelectContent>
            </Select>
            <Select value={scopeFilter} onValueChange={(value) => setScopeFilter(value as TemplateScope | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Escopo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os escopos</SelectItem>
                <SelectItem value={TemplateScope.GLOBAL}>Global</SelectItem>
                <SelectItem value={TemplateScope.PRIVATE}>Privado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as TemplateStatus | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value={TemplateStatus.APPROVED}>Aprovado</SelectItem>
                <SelectItem value={TemplateStatus.PENDING}>Pendente</SelectItem>
                <SelectItem value={TemplateStatus.REJECTED}>Rejeitado</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={fetchTemplates}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {pagination.total} templates encontrados
          {typeFilter !== "all" && ` • Tipo: ${getTypeLabel(typeFilter)}`}
          {searchQuery && ` • Busca: "${searchQuery}"`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={!pagination.hasPrevPage || isLoading}
          >
            Anterior
          </Button>
          <span className="text-sm">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={!pagination.hasNextPage || isLoading}
          >
            Próxima
          </Button>
        </div>
      </div>

      {/* Templates table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum template encontrado.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead>Mapeamentos</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Criado</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id} className="hover:bg-muted/50">
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{template.name}</div>
                        {template.description && (
                          <div className="text-xs text-muted-foreground max-w-[200px] truncate">
                            {template.description}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          {template.scope === TemplateScope.GLOBAL ? (
                            <Globe className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {template.language}
                          </span>
                          {!template.isActive && (
                            <Badge variant="outline" className="text-xs">Inativo</Badge>
                          )}
                        </div>
                        {template.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {template.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {template.tags.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{template.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadgeColor(template.type)}>
                        {getTypeLabel(template.type)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getScopeBadgeColor(template.scope)}>
                        {template.scope === TemplateScope.GLOBAL ? "Global" : "Privado"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(template.status)}>
                        {template.status === TemplateStatus.APPROVED ? "Aprovado" : 
                         template.status === TemplateStatus.PENDING ? "Pendente" : "Rejeitado"}
                      </Badge>
                      {template.approvalRequests.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {template.stats.approvalRequestsCount} solicitações
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {renderTemplatePreview(template)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {template.stats.mapeamentosCount} mapeamentos
                      </div>
                      {template.mapeamentos.slice(0, 2).map((mapeamento) => (
                        <div key={mapeamento.id} className="text-xs text-muted-foreground">
                          {mapeamento.intentName}
                        </div>
                      ))}
                      {template.mapeamentos.length > 2 && (
                        <div className="text-xs text-muted-foreground">
                          +{template.mapeamentos.length - 2} mais
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{template.usageCount}</div>
                      <div className="text-xs text-muted-foreground">usos</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(template.createdAt).toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <User className="h-3 w-3" />
                          {template.createdBy.name || template.createdBy.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onTemplateSelect?.(template)}
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onTemplateEdit?.(template)}
                          className="h-8 w-8"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            navigator.clipboard.writeText(template.id);
                            toast.success('ID copiado!');
                          }}
                          className="h-8 w-8"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onTemplateDelete?.(template.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}