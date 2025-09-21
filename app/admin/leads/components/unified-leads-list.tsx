"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Filter, 
  RefreshCw, 
  Eye, 
  Edit, 
  Trash2, 
  Plus,
  Instagram,
  Scale,
  User,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { LeadSource } from "@prisma/client";

interface UnifiedLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  source: LeadSource;
  sourceIdentifier: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  account: {
    id: string;
    provider: string;
  } | null;
  instagramProfile?: {
    id: string;
    isFollower: boolean;
    lastMessageAt: string | null;
    isOnline: boolean;
  } | null;
  oabData?: {
    id: string;
    concluido: boolean;
    anotacoes: string | null;
    seccional: string | null;
    areaJuridica: string | null;
    notaFinal: number | null;
    situacao: string | null;
    inscricao: string | null;
    especialidade: string | null;
  } | null;
  stats: {
    chatsCount: number;
    automacoesCount: number;
    disparosCount: number;
  };
}

interface LeadsListProps {
  onLeadSelect?: (lead: UnifiedLead) => void;
  showActions?: boolean;
  compact?: boolean;
}

export function UnifiedLeadsList({ 
  onLeadSelect, 
  showActions = true, 
  compact = false 
}: LeadsListProps) {
  const router = useRouter();
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  useEffect(() => {
    fetchLeads();
  }, [searchQuery, sourceFilter, sortBy, sortOrder, pagination.page]);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sortBy,
        sortOrder,
      });

      if (searchQuery.trim()) {
        params.append("search", searchQuery.trim());
      }

      if (sourceFilter !== "all") {
        params.append("source", sourceFilter);
      }

      const response = await fetch(`/api/admin/leads?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setLeads(data.leads);
        setPagination(data.pagination);
      } else {
        throw new Error(data.error || "Erro ao buscar leads");
      }
    } catch (error) {
      console.error("Erro ao buscar leads:", error);
      toast.error("Erro", { 
        description: "Não foi possível carregar os leads. Tente novamente." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("Tem certeza que deseja excluir este lead?")) return;

    try {
      const response = await fetch(`/api/admin/leads/${leadId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Lead excluído com sucesso!");
        fetchLeads();
      } else {
        const data = await response.json();
        throw new Error(data.error || "Erro ao excluir lead");
      }
    } catch (error: any) {
      console.error("Erro ao excluir lead:", error);
      toast.error("Erro", {
        description: error.message || "Não foi possível excluir o lead.",
      });
    }
  };

  const getSourceIcon = (source: LeadSource) => {
    switch (source) {
      case LeadSource.INSTAGRAM:
        return <Instagram className="h-4 w-4" />;
      case LeadSource.CHATWIT_OAB:
        return <Scale className="h-4 w-4" />;
      case LeadSource.MANUAL:
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getSourceColor = (source: LeadSource) => {
    switch (source) {
      case LeadSource.INSTAGRAM:
        return "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400";
      case LeadSource.CHATWIT_OAB:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
      case LeadSource.MANUAL:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderSourceSpecificData = (lead: UnifiedLead) => {
    switch (lead.source) {
      case LeadSource.INSTAGRAM:
        if (lead.instagramProfile) {
          return (
            <div className="text-xs text-muted-foreground">
              {lead.instagramProfile.isFollower && (
                <Badge variant="outline" className="mr-1">Seguidor</Badge>
              )}
              {lead.instagramProfile.isOnline && (
                <Badge variant="outline" className="bg-green-100 text-green-800">Online</Badge>
              )}
            </div>
          );
        }
        break;
      case LeadSource.CHATWIT_OAB:
        if (lead.oabData) {
          return (
            <div className="text-xs text-muted-foreground">
              {lead.oabData.concluido && (
                <Badge variant="outline" className="bg-green-100 text-green-800 mr-1">
                  Concluído
                </Badge>
              )}
              {lead.oabData.notaFinal && (
                <span className="text-xs">Nota: {lead.oabData.notaFinal}</span>
              )}
            </div>
          );
        }
        break;
    }
    return null;
  };

  if (compact) {
    return (
      <div className="space-y-2">
        {leads.map((lead) => (
          <div
            key={lead.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
            onClick={() => onLeadSelect?.(lead)}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {getSourceIcon(lead.source)}
                <div>
                  <div className="font-medium">{lead.name || "Sem nome"}</div>
                  <div className="text-sm text-muted-foreground">
                    {lead.email || lead.phone || lead.sourceIdentifier}
                  </div>
                </div>
              </div>
            </div>
            <Badge className={getSourceColor(lead.source)}>
              {lead.source}
            </Badge>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Leads Unificados
          </CardTitle>
          <Button onClick={() => router.push("/admin/leads/create")}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lead
          </Button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={sourceFilter} onValueChange={(value) => setSourceFilter(value as LeadSource | "all")}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value={LeadSource.INSTAGRAM}>Instagram</SelectItem>
              <SelectItem value={LeadSource.CHATWIT_OAB}>Chatwit OAB</SelectItem>
              <SelectItem value={LeadSource.MANUAL}>Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
            const [field, order] = value.split('-');
            setSortBy(field);
            setSortOrder(order as "asc" | "desc");
          }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt-desc">Mais recentes</SelectItem>
              <SelectItem value="createdAt-asc">Mais antigos</SelectItem>
              <SelectItem value="name-asc">Nome A-Z</SelectItem>
              <SelectItem value="name-desc">Nome Z-A</SelectItem>
              <SelectItem value="updatedAt-desc">Última atualização</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchLeads} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Nenhum lead encontrado</h3>
            <p className="text-sm">
              {searchQuery || sourceFilter !== "all" 
                ? "Tente ajustar os filtros de busca." 
                : "Comece criando seu primeiro lead."}
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Dados Específicos</TableHead>
                    <TableHead>Estatísticas</TableHead>
                    <TableHead>Criado em</TableHead>
                    {showActions && <TableHead className="w-[100px]">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {lead.avatarUrl && (
                            <img 
                              src={lead.avatarUrl} 
                              alt={lead.name || "Avatar"} 
                              className="h-8 w-8 rounded-full"
                            />
                          )}
                          <div>
                            <div className="font-medium">
                              {lead.name || "Sem nome"}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              ID: {lead.sourceIdentifier}
                            </div>
                            {lead.tags.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {lead.tags.slice(0, 2).map((tag) => (
                                  <Badge key={tag} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {lead.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{lead.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getSourceColor(lead.source)}>
                          <div className="flex items-center gap-1">
                            {getSourceIcon(lead.source)}
                            {lead.source}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {lead.email && (
                            <div className="text-muted-foreground">{lead.email}</div>
                          )}
                          {lead.phone && (
                            <div className="text-muted-foreground">{lead.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {renderSourceSpecificData(lead)}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          <div>Chats: {lead.stats.chatsCount}</div>
                          <div>Automações: {lead.stats.automacoesCount}</div>
                          <div>Disparos: {lead.stats.disparosCount}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(lead.createdAt)}
                        </div>
                      </TableCell>
                      {showActions && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/admin/leads/${lead.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => router.push(`/admin/leads/${lead.id}/edit`)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLead(lead.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {((pagination.page - 1) * pagination.limit) + 1} a{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
                  {pagination.total} leads
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={!pagination.hasPrevPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-sm">
                    Página {pagination.page} de {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={!pagination.hasNextPage}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}