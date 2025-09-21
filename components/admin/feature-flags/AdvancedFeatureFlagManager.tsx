"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Loader2, 
  Search, 
  Filter, 
  MoreHorizontal, 
  CheckSquare, 
  Square, 
  Trash2, 
  ToggleLeft, 
  ToggleRight,
  Settings,
  Download,
  Upload
} from "lucide-react";
import { toast } from "sonner";
import { FeatureFlagCard } from "./FeatureFlagCard";

interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  rolloutPercentage: number;
  userSpecific: boolean;
  systemCritical: boolean;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  metrics?: any[];
  userOverrides?: any[];
  stats?: {
    userOverridesCount: number;
    metricsCount: number;
  };
}

interface SearchFilters {
  query: string;
  category: string;
  enabled: string;
  userSpecific: string;
  systemCritical: string;
  sortBy: string;
  sortOrder: string;
}

interface AdvancedFeatureFlagManagerProps {
  onToggleFlag: (flagId: string, enabled: boolean) => Promise<void>;
  onDeleteFlag?: (flagId: string) => Promise<void>;
  onCreateFlag?: () => void;
}

export function AdvancedFeatureFlagManager({
  onToggleFlag,
  onDeleteFlag,
  onCreateFlag
}: AdvancedFeatureFlagManagerProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({
    query: "",
    category: "",
    enabled: "",
    userSpecific: "",
    systemCritical: "",
    sortBy: "name",
    sortOrder: "asc"
  });
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
    page: 1,
    totalPages: 1
  });
  const [statistics, setStatistics] = useState<any>(null);

  const searchFlags = useCallback(async (newFilters?: Partial<SearchFilters>, newOffset?: number) => {
    try {
      setLoading(true);
      
      const searchFilters = { ...filters, ...newFilters };
      const offset = newOffset !== undefined ? newOffset : pagination.offset;
      
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: offset.toString(),
        sortBy: searchFilters.sortBy,
        sortOrder: searchFilters.sortOrder
      });

      if (searchFilters.query) params.append("q", searchFilters.query);
      if (searchFilters.category) params.append("category", searchFilters.category);
      if (searchFilters.enabled) params.append("enabled", searchFilters.enabled);
      if (searchFilters.userSpecific) params.append("userSpecific", searchFilters.userSpecific);
      if (searchFilters.systemCritical) params.append("systemCritical", searchFilters.systemCritical);

      const response = await fetch(`/api/admin/feature-flags/search?${params}`);
      if (!response.ok) throw new Error("Erro ao buscar feature flags");
      
      const data = await response.json();
      setFlags(data.flags);
      setPagination(data.pagination);
      setStatistics(data.statistics);
      
      if (newFilters) {
        setFilters(searchFilters);
      }

    } catch (error) {
      console.error("Error searching flags:", error);
      toast.error("Erro ao buscar feature flags");
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit, pagination.offset]);

  useEffect(() => {
    searchFlags();
  }, []);

  const handleSearch = (newFilters: Partial<SearchFilters>) => {
    searchFlags(newFilters, 0);
  };

  const handlePageChange = (newPage: number) => {
    const newOffset = (newPage - 1) * pagination.limit;
    searchFlags({}, newOffset);
  };

  const toggleFlagSelection = (flagId: string) => {
    const newSelected = new Set(selectedFlags);
    if (newSelected.has(flagId)) {
      newSelected.delete(flagId);
    } else {
      newSelected.add(flagId);
    }
    setSelectedFlags(newSelected);
  };

  const selectAllFlags = () => {
    if (selectedFlags.size === flags.length) {
      setSelectedFlags(new Set());
    } else {
      setSelectedFlags(new Set(flags.map(f => f.id)));
    }
  };

  const executeBulkOperation = async (operation: string, data?: any) => {
    if (selectedFlags.size === 0) {
      toast.error("Selecione pelo menos uma feature flag");
      return;
    }

    try {
      setBulkLoading(true);
      
      const response = await fetch("/api/admin/feature-flags/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation,
          flagIds: Array.from(selectedFlags),
          data
        }),
      });

      if (!response.ok) throw new Error("Erro na operação em lote");
      
      const result = await response.json();
      
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} operações falharam`);
      }
      
      if (result.results.length > 0) {
        toast.success(`${result.results.length} operações executadas com sucesso`);
      }

      // Refresh the flags list
      await searchFlags();
      setSelectedFlags(new Set());
      setShowBulkDialog(false);

    } catch (error) {
      console.error("Error executing bulk operation:", error);
      toast.error("Erro ao executar operação em lote");
    } finally {
      setBulkLoading(false);
    }
  };

  const selectedFlagsData = flags.filter(f => selectedFlags.has(f.id));
  const canDelete = selectedFlagsData.every(f => !f.systemCritical);

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Busca Avançada e Filtros
          </CardTitle>
          <CardDescription>
            Use os filtros abaixo para encontrar feature flags específicas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Buscar por nome ou descrição</Label>
              <Input
                placeholder="Digite para buscar..."
                value={filters.query}
                onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch({ query: filters.query });
                  }
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => handleSearch({ query: filters.query })}>
                <Search className="h-4 w-4 mr-2" />
                Buscar
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <Label>Categoria</Label>
              <Select
                value={filters.category}
                onValueChange={(value) => handleSearch({ category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                  <SelectItem value="ai">IA</SelectItem>
                  <SelectItem value="processing">Processamento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select
                value={filters.enabled}
                onValueChange={(value) => handleSearch({ enabled: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="true">Ativas</SelectItem>
                  <SelectItem value="false">Inativas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Por Usuário</Label>
              <Select
                value={filters.userSpecific}
                onValueChange={(value) => handleSearch({ userSpecific: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  <SelectItem value="true">Sim</SelectItem>
                  <SelectItem value="false">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ordenar por</Label>
              <Select
                value={filters.sortBy}
                onValueChange={(value) => handleSearch({ sortBy: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                  <SelectItem value="enabled">Status</SelectItem>
                  <SelectItem value="createdAt">Data de Criação</SelectItem>
                  <SelectItem value="updatedAt">Última Atualização</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ordem</Label>
              <Select
                value={filters.sortOrder}
                onValueChange={(value) => handleSearch({ sortOrder: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Crescente</SelectItem>
                  <SelectItem value="desc">Decrescente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{statistics.total}</div>
              <p className="text-sm text-muted-foreground">Total de Flags</p>
            </CardContent>
          </Card>
          {statistics.status.map((stat: any) => (
            <Card key={stat.enabled.toString()}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">{stat.count}</div>
                <p className="text-sm text-muted-foreground">
                  {stat.enabled ? "Ativas" : "Inativas"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk Operations */}
      {selectedFlags.size > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="default">{selectedFlags.size} selecionadas</Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedFlagsData.filter(f => f.enabled).length} ativas, {" "}
                  {selectedFlagsData.filter(f => !f.enabled).length} inativas
                </span>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  
                  onClick={() => executeBulkOperation("toggle", { enabled: true })}
                  disabled={bulkLoading}
                >
                  <ToggleRight className="h-4 w-4 mr-1" />
                  Ativar Todas
                </Button>
                
                <Button
                  variant="outline"
                  
                  onClick={() => executeBulkOperation("toggle", { enabled: false })}
                  disabled={bulkLoading}
                >
                  <ToggleLeft className="h-4 w-4 mr-1" />
                  Desativar Todas
                </Button>

                {canDelete && (
                  <Button
                    variant="outline"
                    
                    onClick={() => executeBulkOperation("delete")}
                    disabled={bulkLoading}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Deletar
                  </Button>
                )}

                <Button
                  variant="outline"
                  
                  onClick={() => setSelectedFlags(new Set())}
                >
                  Limpar Seleção
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Resultados da Busca</CardTitle>
              <CardDescription>
                {pagination.total} feature flags encontradas
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                
                onClick={selectAllFlags}
                className="flex items-center gap-1"
              >
                {selectedFlags.size === flags.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {selectedFlags.size === flags.length ? "Desmarcar Todas" : "Selecionar Todas"}
              </Button>
              
              {onCreateFlag && (
                <Button onClick={onCreateFlag}>
                  Nova Flag
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : flags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma feature flag encontrada com os filtros aplicados
            </div>
          ) : (
            <div className="space-y-4">
              {flags.map((flag) => (
                <div key={flag.id} className="flex items-start gap-3">
                  <Checkbox
                    checked={selectedFlags.has(flag.id)}
                    onCheckedChange={() => toggleFlagSelection(flag.id)}
                    className="mt-4"
                  />
                  <div className="flex-1">
                    <FeatureFlagCard
                      flag={flag}
                      onToggle={onToggleFlag}
                      onDelete={onDeleteFlag}
                      updating={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages} ({pagination.total} total)
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  Anterior
                </Button>
                
                <Button
                  variant="outline"
                  
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={!pagination.hasMore}
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}