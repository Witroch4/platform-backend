"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { 
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock
} from "lucide-react";
import { toast } from "sonner";
import { DateRange } from "react-day-picker";
import { addDays, format } from "date-fns";

interface CostEvent {
  id: string;
  timestamp: string;
  traceId?: string;
  externalId?: string;
  provider: string;
  product: string;
  unit: string;
  units: number;
  currency: string;
  unitPrice?: number;
  cost?: number;
  status: string;
  sessionId?: string;
  inboxId?: string;
  userId?: string;
  intent?: string;
  metadata?: any;
}

interface CostEventsResponse {
  events: CostEvent[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  filters: any;
  stats: {
    totalCost: number;
    averageCost: number;
    minCost: number;
    maxCost: number;
    totalEvents: number;
    statusBreakdown: Array<{
      status: string;
      count: number;
    }>;
    currency: string;
  };
}

export function CostEventsTable() {
  const [eventsData, setEventsData] = useState<CostEventsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState('ts');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Filtros
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  
  const [filters, setFilters] = useState({
    provider: '',
    product: '',
    status: '',
    inboxId: '',
    userId: '',
    intent: '',
    sessionId: '',
    traceId: '',
    externalId: ''
  });

  const [searchTerm, setSearchTerm] = useState('');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (dateRange?.from) {
        params.append('startDate', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        params.append('endDate', dateRange.to.toISOString());
      }
      
      // Adicionar filtros não vazios (excluir "all" que significa todos)
      Object.entries(filters).forEach(([key, value]) => {
        if (value.trim() && value !== 'all') {
          params.append(key, value);
        }
      });
      
      const response = await fetch(`/api/admin/cost-monitoring/events?${params}`, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao carregar eventos de custo');
      }
      
      const data = await response.json();
      setEventsData(data);
    } catch (error: any) {
      console.error('Erro ao carregar eventos:', error);
      toast.error('Erro ao carregar eventos de custo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [page, limit, sortBy, sortOrder, dateRange]);

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency === 'USD' ? 'USD' : 'BRL',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6
    }).format(amount);
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case 'OPENAI':
        return 'OpenAI';
      case 'META_WHATSAPP':
        return 'WhatsApp';
      case 'INFRA':
        return 'Infraestrutura';
      default:
        return provider;
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case 'OPENAI':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'META_WHATSAPP':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'INFRA':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PRICED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'PENDING_PRICING':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'ERROR':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRICED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'PENDING_PRICING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    setPage(1); // Reset to first page when applying filters
    fetchEvents();
  };

  const clearFilters = () => {
    setFilters({
      provider: '',
      product: '',
      status: '',
      inboxId: '',
      userId: '',
      intent: '',
      sessionId: '',
      traceId: '',
      externalId: ''
    });
    setSearchTerm('');
    setPage(1);
    setTimeout(fetchEvents, 100);
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const exportEvents = async (format: 'csv' | 'excel') => {
    try {
      const params = new URLSearchParams();
      params.append('export', format);
      
      if (dateRange?.from) {
        params.append('startDate', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        params.append('endDate', dateRange.to.toISOString());
      }
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value.trim()) {
          params.append(key, value);
        }
      });
      
      const response = await fetch(`/api/admin/cost-monitoring/events?${params}`);
      
      if (!response.ok) {
        throw new Error('Falha ao exportar eventos');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cost-events-${format}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Eventos exportados em formato ${format.toUpperCase()}`);
    } catch (error: any) {
      console.error('Erro ao exportar eventos:', error);
      toast.error('Erro ao exportar eventos');
    }
  };

  return (
    <div className="space-y-6">
      {/* Controles e filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Eventos de Custo
          </CardTitle>
          <CardDescription>
            Visualize e filtre todos os eventos de custo processados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filtros principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Período</Label>
              <DatePickerWithRange
                date={dateRange}
                onDateChange={setDateRange}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider</Label>
              <Select value={filters.provider} onValueChange={(value) => handleFilterChange('provider', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="OPENAI">OpenAI</SelectItem>
                  <SelectItem value="META_WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="INFRA">Infraestrutura</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PRICED">Precificado</SelectItem>
                  <SelectItem value="PENDING_PRICING">Pendente</SelectItem>
                  <SelectItem value="ERROR">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Itens por página</Label>
              <Select value={limit.toString()} onValueChange={(value) => setLimit(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filtros avançados */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Produto</Label>
              <Input
                placeholder="Filtrar por produto"
                value={filters.product}
                onChange={(e) => handleFilterChange('product', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Inbox ID</Label>
              <Input
                placeholder="Filtrar por inbox"
                value={filters.inboxId}
                onChange={(e) => handleFilterChange('inboxId', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Session ID</Label>
              <Input
                placeholder="Filtrar por sessão"
                value={filters.sessionId}
                onChange={(e) => handleFilterChange('sessionId', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Intent</Label>
              <Input
                placeholder="Filtrar por intent"
                value={filters.intent}
                onChange={(e) => handleFilterChange('intent', e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={applyFilters} disabled={loading}>
              <Filter className="h-4 w-4 mr-1" />
              Aplicar Filtros
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Limpar Filtros
            </Button>
            <Button variant="outline" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={() => exportEvents('csv')}>
              <Download className="h-4 w-4 mr-1" />
              CSV
            </Button>
            <Button variant="outline" onClick={() => exportEvents('excel')}>
              <Download className="h-4 w-4 mr-1" />
              Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      {eventsData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {formatCurrency(eventsData.stats.totalCost)}
              </div>
              <p className="text-xs text-muted-foreground">Custo Total</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {eventsData.stats.totalEvents.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">Total de Eventos</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {formatCurrency(eventsData.stats.averageCost)}
              </div>
              <p className="text-xs text-muted-foreground">Custo Médio</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2">
                {eventsData.stats.statusBreakdown.map((status, index) => (
                  <Badge key={index} variant="outline" className={getStatusColor(status.status)}>
                    {status.status}: {status.count}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Status dos Eventos</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela de eventos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Eventos de Custo</CardTitle>
              <CardDescription>
                {eventsData && `${eventsData.pagination.totalCount} eventos encontrados`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Carregando eventos...</span>
            </div>
          ) : eventsData && eventsData.events.length > 0 ? (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('ts')}
                      >
                        Timestamp {sortBy === 'ts' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 text-right"
                        onClick={() => handleSort('cost')}
                      >
                        Custo {sortBy === 'cost' && (sortOrder === 'asc' ? '↑' : '↓')}
                      </TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead>Inbox</TableHead>
                      <TableHead>Intent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsData.events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(event.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                          </div>
                          {event.traceId && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {event.traceId.substring(0, 8)}...
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getProviderColor(event.provider)}>
                            {getProviderName(event.provider)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{event.product}</div>
                          <div className="text-xs text-muted-foreground">{event.unit}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(event.status)}
                            <Badge variant="outline" className={getStatusColor(event.status)}>
                              {event.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {event.cost ? (
                            <div className="font-medium">
                              {formatCurrency(event.cost, event.currency)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                          {event.unitPrice && (
                            <div className="text-xs text-muted-foreground">
                              {formatCurrency(event.unitPrice, event.currency)}/unit
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-mono text-sm">
                            {event.units.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          {event.inboxId ? (
                            <span className="font-mono text-xs">
                              {event.inboxId.substring(0, 8)}...
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {event.intent ? (
                            <span className="text-sm">
                              {event.intent.length > 20 ? 
                                `${event.intent.substring(0, 20)}...` : 
                                event.intent
                              }
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginação */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {((eventsData.pagination.page - 1) * eventsData.pagination.limit) + 1} a{' '}
                  {Math.min(eventsData.pagination.page * eventsData.pagination.limit, eventsData.pagination.totalCount)} de{' '}
                  {eventsData.pagination.totalCount} eventos
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    
                    onClick={() => setPage(page - 1)}
                    disabled={!eventsData.pagination.hasPrevPage}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <span className="text-sm">
                    Página {eventsData.pagination.page} de {eventsData.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    
                    onClick={() => setPage(page + 1)}
                    disabled={!eventsData.pagination.hasNextPage}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum evento encontrado para os filtros selecionados
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}