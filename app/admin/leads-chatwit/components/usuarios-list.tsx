"use client";

import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { UsuarioItem } from "./usuario-item";
import { RefreshCw } from "lucide-react";

interface UsuariosListProps {
  searchQuery: string;
  onRefresh: () => void;
  initialLoading: boolean;
  onViewLeads: (usuarioId: string) => void;
}

export function UsuariosList({ 
  searchQuery, 
  onRefresh, 
  initialLoading,
  onViewLeads 
}: UsuariosListProps) {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnifying, setIsUnifying] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    fetchUsuarios();
  }, [searchQuery, pagination.page, pagination.limit]);

  const fetchUsuarios = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });

      if (searchQuery) {
        params.append("search", searchQuery);
      }

      const response = await fetch(`/api/admin/leads-chatwit/usuarios?${params.toString()}`);
      const data = await response.json();

      if (response.ok) {
        setUsuarios(data.usuarios);
        setPagination(data.pagination);
      } else {
        throw new Error(data.error || "Erro ao buscar usuários");
      }
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      toast.error("Erro", {
        description: "Não foi possível carregar os usuários. Tente novamente.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUsuario = async (usuarioId: string) => {
    try {
      const response = await fetch(`/api/admin/leads-chatwit/usuarios?id=${usuarioId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast("Sucesso", { description: "Usuário excluído com sucesso!",
        });
        fetchUsuarios();
      } else {
        const data = await response.json();
        throw new Error(data.error || "Erro ao excluir usuário");
      }
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      toast.error("Erro", {
        description: "Não foi possível excluir o usuário. Tente novamente.",
      });
    }
  };

  const handleUnificarArquivos = async (usuarioId: string) => {
    setIsUnifying(true);
    try {
      const response = await fetch("/api/admin/leads-chatwit/unify-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usuarioId }),
      });

      const data = await response.json();

      if (response.ok) {
        toast("Sucesso", { description: "Arquivos unificados com sucesso para todos os leads do usuário!",
          });
        fetchUsuarios(); // Recarrega a lista
      } else {
        throw new Error(data.error || "Erro ao unificar arquivos");
      }
    } catch (error) {
      console.error("Erro ao unificar arquivos:", error);
      toast.error("Erro", {
        description: "Não foi possível unificar os arquivos. Tente novamente.",
      });
    } finally {
      setIsUnifying(false);
    }
  };

  return (
    <div className="space-y-4 bg-background">
      {(isLoading || initialLoading) ? (
        <div className="flex justify-center items-center py-8 bg-card rounded-md border border-border">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : usuarios.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground bg-card rounded-md border border-border">
          Nenhum usuário encontrado.
        </div>
      ) : (
        <div className="bg-card rounded-md border border-border overflow-auto">
          <Table className="border-border">
            <TableHeader className="bg-muted/50">
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead className="text-card-foreground">Nome</TableHead>
                <TableHead className="text-card-foreground">Conta</TableHead>
                <TableHead className="text-card-foreground">Canal</TableHead>
                <TableHead className="text-card-foreground">Leads</TableHead>
                <TableHead className="w-10 text-card-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map(usuario => (
                <UsuarioItem
                  key={usuario.id}
                  usuario={usuario}
                  onDelete={handleDeleteUsuario}
                  onViewLeads={onViewLeads}
                  onUnificarArquivos={handleUnificarArquivos}
                  isLoading={isUnifying}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Navegação de paginação */}
      {usuarios.length > 0 && (
        <div className="flex items-center justify-between bg-card p-4 rounded-md border border-border">
          <div className="text-sm text-muted-foreground">
            Exibindo {(pagination.page - 1) * pagination.limit + 1} a {
              Math.min(pagination.page * pagination.limit, pagination.total)
            } de {pagination.total} usuários
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1 || isLoading}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              className="border-border hover:bg-accent"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === pagination.totalPages || isLoading}
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              className="border-border hover:bg-accent"
            >
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 