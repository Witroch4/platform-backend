"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Search, RefreshCw, Users, Phone, Mail, Calendar, CalendarDays, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { LeadChatwit } from "@/app/admin/leads-chatwit/types";

interface LeadsSelectorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedLeads: LeadChatwit[]) => void;
  title?: string;
  description?: string;
}

export function LeadsSelectorDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Selecionar Leads para Campanha",
  description = "Selecione os leads que receberão o template do WhatsApp"
}: LeadsSelectorDialogProps) {
  // Estados principais
  const [allLeads, setAllLeads] = useState<LeadChatwit[]>([]); // Cache de todos os leads
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showRecursoOnly, setShowRecursoOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedAllLeads, setHasLoadedAllLeads] = useState(false); // Controla se já carregou todos
  const [totalLeadsCount, setTotalLeadsCount] = useState(0); // Total de leads no banco
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Estados para filtro de data
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showThisMonth, setShowThisMonth] = useState(false);

  // Debounce para a busca (aguarda 500ms após parar de digitar)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Carrega leads quando o diálogo abre pela primeira vez
  useEffect(() => {
    if (isOpen && !hasLoadedAllLeads && allLeads.length === 0) {
      console.log('[LeadsSelector] Primeira abertura - carregando todos os leads');
      loadAllLeads();
    }
  }, [isOpen, hasLoadedAllLeads, allLeads.length]);

  // Reset quando o diálogo abre
  useEffect(() => {
    if (isOpen) {
      setPagination(prev => ({ ...prev, page: 1 }));
    } else {
      // Limpa estados quando fecha
      setSearchQuery("");
      setDebouncedSearchQuery("");
      setSelectedLeads([]);
    }
  }, [isOpen]);

  // Reset paginação quando filtros mudarem
  useEffect(() => {
    setPagination(prev => ({ ...prev, page: 1 }));
  }, [debouncedSearchQuery, showRecursoOnly, dateFrom, dateTo, showThisMonth]);

  // Função para definir filtro "Este mês"
  const handleThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    setDateFrom(firstDay);
    setDateTo(lastDay);
    setShowThisMonth(true);
  };

  // Função para limpar filtros de data
  const clearDateFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setShowThisMonth(false);
  };

  // Função para carregar TODOS os leads uma única vez
  const loadAllLeads = useCallback(async () => {
    if (hasLoadedAllLeads) return; // Evita carregar novamente

    setIsLoading(true);
    try {
      console.log(`[LeadsSelector] Carregando TODOS os leads...`);

      const params = new URLSearchParams({
        page: "1",
        limit: "10000", // Carrega todos os leads de uma vez
        marketing: "true", // Usar modo marketing da API consolidada
      });

      const response = await fetch(`/api/admin/leads-chatwit/leads?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        const allLeadsFromServer = data.leads || [];
        setAllLeads(allLeadsFromServer);
        setTotalLeadsCount(data.pagination?.total || allLeadsFromServer.length);
        setHasLoadedAllLeads(true);

        console.log(`[LeadsSelector] Carregados ${allLeadsFromServer.length} leads no cache`);
      } else {
        throw new Error(data.error || "Erro ao buscar leads");
      }
    } catch (error) {
      console.error("Erro ao carregar todos os leads:", error);
      toast.error("Erro", { description: "Não foi possível carregar os leads. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  }, [hasLoadedAllLeads]);

  // Função para buscar leads com filtros específicos no servidor
  const searchLeadsOnServer = useCallback(async (searchTerm: string, recursoOnly: boolean) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "10000",
        marketing: "true", // Usar modo marketing da API consolidada
      });

      if (searchTerm) {
        params.append("search", searchTerm);
      }

      if (recursoOnly) {
        params.append("fezRecurso", "true");
      }

      console.log(`[LeadsSelector] Buscando no servidor: ${params.toString()}`);

      const response = await fetch(`/api/admin/leads-chatwit/leads?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        const filteredLeads = data.leads || [];
        setAllLeads(filteredLeads);
        console.log(`[LeadsSelector] Encontrados ${filteredLeads.length} leads com filtros`);
      } else {
        throw new Error(data.error || "Erro ao buscar leads");
      }
    } catch (error) {
      console.error("Erro ao buscar leads com filtros:", error);
      toast.error("Erro", { description: "Não foi possível buscar os leads. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Busca local inteligente - filtra os leads carregados
  const filteredLeads = useMemo(() => {
    let leads = allLeads;

    // Se já carregou todos os leads, faz filtros locais
    if (hasLoadedAllLeads) {
      // Filtro por data (aplicado primeiro)
      if (dateFrom || dateTo) {
        leads = leads.filter(lead => {
          if (!lead.createdAt) return false;

          const leadDate = new Date(lead.createdAt);
          leadDate.setHours(0, 0, 0, 0); // Remove horas para comparar apenas datas

          if (dateFrom && dateTo) {
            const fromDate = new Date(dateFrom);
            const toDate = new Date(dateTo);
            fromDate.setHours(0, 0, 0, 0);
            toDate.setHours(23, 59, 59, 999);
            return leadDate >= fromDate && leadDate <= toDate;
          } else if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            return leadDate >= fromDate;
          } else if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            return leadDate <= toDate;
          }

          return true;
        });
      }

      // Filtro por recurso
      if (showRecursoOnly) {
        leads = leads.filter(lead => lead.fezRecurso === true);
      }

      // Filtro por busca - usando debouncedSearchQuery
      if (debouncedSearchQuery && debouncedSearchQuery.trim().length > 0) {
        const query = debouncedSearchQuery.toLowerCase().trim();

        leads = leads.filter(lead => {
          const name = (lead.nomeReal || lead.name || "").toLowerCase();
          const email = (lead.email || "").toLowerCase();

          // Para telefone, só faz match se a busca tiver pelo menos 4 dígitos
          const searchPhone = query.replace(/\D/g, "");
          let matchPhone = false;

          if (searchPhone.length >= 4) {
            const phone = (lead.phoneNumber || "").replace(/\D/g, "");
            matchPhone = phone.includes(searchPhone);
          }

          const matchName = name.includes(query);
          const matchEmail = email.includes(query);

          return matchName || matchEmail || matchPhone;
        });
      }
    }

    return leads;
  }, [allLeads, debouncedSearchQuery, showRecursoOnly, hasLoadedAllLeads, dateFrom, dateTo]);

  // Paginação local para leads filtrados
  const paginatedLeads = useMemo(() => {
    const startIndex = (pagination.page - 1) * pagination.limit;
    const endIndex = startIndex + pagination.limit;
    return filteredLeads.slice(startIndex, endIndex);
  }, [filteredLeads, pagination.page, pagination.limit]);

  // Atualiza estatísticas baseadas nos leads filtrados
  const leadsStats = useMemo(() => {
    const total = filteredLeads.length;
    const totalPages = Math.ceil(total / pagination.limit);
    return {
      total,
      totalPages,
      showing: paginatedLeads.length,
      startIndex: (pagination.page - 1) * pagination.limit + 1,
      endIndex: Math.min(pagination.page * pagination.limit, total)
    };
  }, [filteredLeads.length, pagination.page, pagination.limit, paginatedLeads.length]);

  const handleToggleAllLeads = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(paginatedLeads.map(lead => lead.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleToggleLead = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLeads(prev => [...prev, id]);
    } else {
      setSelectedLeads(prev => prev.filter(leadId => leadId !== id));
    }
  };

  const handleConfirm = () => {
    const selectedLeadsData = allLeads.filter(lead => selectedLeads.includes(lead.id));
    onConfirm(selectedLeadsData);
    onClose();
  };

  // Função para carregar mais leads
  const handleLoadMore = () => {
    if (pagination.page < leadsStats.totalPages && !isLoading) {
      setPagination(prev => ({ ...prev, page: prev.page + 1 }));
    }
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return "";
    // Remove todos os caracteres não numéricos
    const cleaned = phone.replace(/\D/g, "");
    // Formata como número brasileiro
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDate = (dateString: string | Date) => {
    if (!dateString) return "";
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

  const getDisplayName = (lead: LeadChatwit) => {
    return lead.nomeReal || lead.name || "Lead sem nome";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Barra de pesquisa e filtros */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por nome, email ou telefone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setHasLoadedAllLeads(false);
                  setAllLeads([]);
                  loadAllLeads();
                }}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* Filtro de Recurso */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurso-filter"
                checked={showRecursoOnly}
                onCheckedChange={(checked) => setShowRecursoOnly(checked === true)}
              />
              <Label htmlFor="recurso-filter" className="text-sm font-medium cursor-pointer">
                Mostrar apenas leads que fizeram recurso
              </Label>
              {showRecursoOnly && (
                <Badge variant="secondary" className="text-xs">
                  Filtro ativo
                </Badge>
              )}
            </div>

            {/* Filtros de Data */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Filtrar por data:</Label>
              </div>

              {/* Data Início */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    
                    className="h-8 text-xs"
                  >
                    <Calendar className="mr-2 h-3 w-3" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: ptBR }) : "Data início"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>

              {/* Data Fim */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    
                    className="h-8 text-xs"
                  >
                    <Calendar className="mr-2 h-3 w-3" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: ptBR }) : "Data fim"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>

              {/* Botão Este Mês */}
              <Button
                variant={showThisMonth ? "default" : "outline"}
                
                onClick={handleThisMonth}
                className="h-8 text-xs"
              >
                <CalendarDays className="mr-2 h-3 w-3" />
                Este mês
              </Button>

              {/* Botão Limpar Filtros de Data */}
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  
                  onClick={clearDateFilters}
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="mr-1 h-3 w-3" />
                  Limpar datas
                </Button>
              )}

              {/* Badge indicando filtro ativo */}
              {(dateFrom || dateTo) && (
                <Badge variant="secondary" className="text-xs">
                  {showThisMonth ? "Este mês" :
                    dateFrom && dateTo ? `${format(dateFrom, "dd/MM", { locale: ptBR })} - ${format(dateTo, "dd/MM", { locale: ptBR })}` :
                      dateFrom ? `A partir de ${format(dateFrom, "dd/MM", { locale: ptBR })}` :
                        `Até ${format(dateTo!, "dd/MM", { locale: ptBR })}`}
                </Badge>
              )}
            </div>
          </div>

          {/* Estatísticas */}
          <div className="flex items-center justify-between bg-muted p-3 rounded-md">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {leadsStats.total} leads {searchQuery || showRecursoOnly ? 'encontrados' : 'disponíveis'}
                </span>
              </div>
              {showRecursoOnly && (
                <Badge variant="outline" className="text-xs">
                  {allLeads.filter(l => l.fezRecurso).length} fizeram recurso
                </Badge>
              )}
              {selectedLeads.length > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <span>{selectedLeads.length} selecionados</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Lista de leads */}
          <div className="flex-1 overflow-auto border rounded-md">
            {isLoading ? (
              <div className="flex justify-center items-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginatedLeads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {debouncedSearchQuery ? "Nenhum lead encontrado para esta busca." : "Nenhum lead encontrado."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={paginatedLeads.length > 0 && selectedLeads.length === paginatedLeads.length}
                        onCheckedChange={handleToggleAllLeads}
                        aria-label="Selecionar todos os leads"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Recurso</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={(checked) => handleToggleLead(lead.id, checked === true)}
                          aria-label={`Selecionar lead ${getDisplayName(lead)}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{getDisplayName(lead)}</span>
                          <span className="text-sm text-muted-foreground">
                            {lead.usuario?.name || "Usuário não definido"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {formatPhoneNumber(lead.phoneNumber || "")}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {lead.email || "Não informado"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">
                            {formatDate(lead.createdAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={lead.fezRecurso ? "default" : "outline"}
                          className="text-xs"
                        >
                          {lead.fezRecurso ? "Sim" : "Não"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={lead.status === "ativo" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {lead.status || "Pendente"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Paginação e estatísticas otimizadas */}
          {allLeads.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                Exibindo {leadsStats.startIndex} a {leadsStats.endIndex} de {leadsStats.total} leads
                {searchQuery && searchQuery !== debouncedSearchQuery && (
                  <span className="ml-2 text-orange-600">(filtrando...)</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  
                  disabled={pagination.page === 1 || isLoading}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  
                  disabled={pagination.page >= leadsStats.totalPages || isLoading}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  Próximo
                </Button>
                {/* Botão para carregar mais leads (removido pois agora carrega todos de uma vez) */}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedLeads.length === 0}
          >
            Confirmar ({selectedLeads.length} leads)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 