"use client";

import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { Search, RefreshCw, Users, Phone, Mail, Calendar } from "lucide-react";
import { LeadChatwit } from "@/app/admin/leads-chatwit/types";

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
  const [leads, setLeads] = useState<LeadChatwit[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    if (isOpen) {
      fetchLeads();
    }
  }, [isOpen, searchQuery, pagination.page, pagination.limit]);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/admin/leads-chatwit/marketing-leads?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setLeads(data.leads || []);
        setPagination(data.pagination || {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        });
      } else {
        throw new Error(data.error || "Erro ao buscar leads");
      }
    } catch (error) {
      console.error("Erro ao buscar leads:", error);
      toast.error("Erro", { description: "Não foi possível carregar os leads. Tente novamente." });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleAllLeads = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(leads.map(lead => lead.id));
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
    const selectedLeadsData = leads.filter(lead => selectedLeads.includes(lead.id));
    onConfirm(selectedLeadsData);
    onClose();
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
          {/* Barra de pesquisa */}
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
              onClick={fetchLeads}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {/* Estatísticas */}
          <div className="flex items-center justify-between bg-muted p-3 rounded-md">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {pagination.total} leads disponíveis
                </span>
              </div>
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
            ) : leads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum lead encontrado.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={leads.length > 0 && selectedLeads.length === leads.length}
                        onCheckedChange={handleToggleAllLeads}
                        aria-label="Selecionar todos os leads"
                      />
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
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

          {/* Paginação */}
          {leads.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4">
              <div className="text-sm text-muted-foreground">
                Exibindo {(pagination.page - 1) * pagination.limit + 1} a {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} leads
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === 1 || isLoading}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page === pagination.totalPages || isLoading}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  Próximo
                </Button>
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