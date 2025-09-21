"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Edit,
  Trash2,
  Shield,
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

interface AuthorizedDomain {
  id: string;
  domain: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    name: string | null;
    email: string;
  };
}

export default function IframeConfigPage() {
  const { data: session } = useSession();
  const [domains, setDomains] = useState<AuthorizedDomain[]>([]);
  
  // Debug: Log session data
  useEffect(() => {
    console.log('🔍 [iframe-config] Session data:', session);
    console.log('🔍 [iframe-config] User role:', session?.user?.role);
    console.log('🔍 [iframe-config] Is iframe:', window.self !== window.top);
  }, [session]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingDomain, setEditingDomain] = useState<AuthorizedDomain | null>(null);
  
  // Form states
  const [newDomain, setNewDomain] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const [iframeUrl, setIframeUrl] = useState("");

  // Set iframe URL on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIframeUrl(`${window.location.origin}/iframe/admin`);
    }
  }, []);

  // Load domains
  const loadDomains = async () => {
    try {
      const response = await fetch('/api/admin/iframe/authorized-domains');
      if (response.ok) {
        const data = await response.json();
        setDomains(data.domains);
      } else {
        toast.error("Erro ao carregar domínios autorizados");
      }
    } catch (error) {
      toast.error("Erro na comunicação com o servidor");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDomains();
  }, []);

  // Create domain
  const handleCreate = async () => {
    if (!newDomain.trim()) {
      toast.error("Domínio é obrigatório");
      return;
    }

    try {
      const response = await fetch('/api/admin/iframe/authorized-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: newDomain.trim(),
          description: newDescription.trim() || null,
        }),
      });

      if (response.ok) {
        toast.success("Domínio autorizado criado com sucesso");
        setIsCreateOpen(false);
        setNewDomain("");
        setNewDescription("");
        loadDomains();
      } else {
        const error = await response.json();
        toast.error(error.error || "Erro ao criar domínio");
      }
    } catch (error) {
      toast.error("Erro na comunicação com o servidor");
    }
  };

  // Edit domain
  const handleEdit = (domain: AuthorizedDomain) => {
    setEditingDomain(domain);
    setEditDomain(domain.domain);
    setEditDescription(domain.description || "");
    setEditIsActive(domain.isActive);
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingDomain) return;

    try {
      const response = await fetch('/api/admin/iframe/authorized-domains', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingDomain.id,
          domain: editDomain.trim(),
          description: editDescription.trim() || null,
          isActive: editIsActive,
        }),
      });

      if (response.ok) {
        toast.success("Domínio atualizado com sucesso");
        setIsEditOpen(false);
        setEditingDomain(null);
        loadDomains();
      } else {
        const error = await response.json();
        toast.error(error.error || "Erro ao atualizar domínio");
      }
    } catch (error) {
      toast.error("Erro na comunicação com o servidor");
    }
  };

  // Delete domain
  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este domínio autorizado?")) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/iframe/authorized-domains?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success("Domínio removido com sucesso");
        loadDomains();
      } else {
        const error = await response.json();
        toast.error(error.error || "Erro ao remover domínio");
      }
    } catch (error) {
      toast.error("Erro na comunicação com o servidor");
    }
  };

  // Copy iframe URL
  const copyIframeUrl = async () => {
    if (!iframeUrl) {
      toast.error("URL ainda não foi carregada");
      return;
    }
    try {
      await navigator.clipboard.writeText(iframeUrl);
      toast.success("URL do iframe copiada!");
    } catch (error) {
      toast.error("Erro ao copiar URL");
    }
  };

  if (session?.user?.role !== "SUPERADMIN") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Shield className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-2">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Apenas SUPERADMIN pode acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuração de Iframe</h1>
          <p className="text-muted-foreground">
            Gerencie domínios autorizados para acesso via iframe
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Domínio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Domínio Autorizado</DialogTitle>
              <DialogDescription>
                Adicione um novo domínio que pode acessar o dashboard via iframe
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="domain">Domínio</Label>
                <Input
                  id="domain"
                  placeholder="https://exemplo.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="description">Descrição (opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Descrição do domínio..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* URL do Iframe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="h-5 w-5" />
            URL do Iframe
          </CardTitle>
          <CardDescription>
            Use esta URL para configurar o dashboard como iframe no Chatwit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              value={iframeUrl || "Carregando..."}
              readOnly
              className="font-mono text-sm"
            />
            <Button variant="outline"  onClick={copyIframeUrl}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Domínios Autorizados */}
      <Card>
        <CardHeader>
          <CardTitle>Domínios Autorizados</CardTitle>
          <CardDescription>
            Lista de domínios que podem acessar o dashboard via iframe
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">Carregando...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domínio</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado por</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="text-muted-foreground">
                        Nenhum domínio autorizado cadastrado
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  domains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-mono text-sm">
                        {domain.domain}
                      </TableCell>
                      <TableCell>{domain.description || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={domain.isActive ? "default" : "secondary"}
                          className="flex items-center gap-1 w-fit"
                        >
                          {domain.isActive ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {domain.isActive ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>{domain.user.name || domain.user.email}</TableCell>
                      <TableCell>
                        {new Date(domain.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            
                            onClick={() => handleEdit(domain)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            
                            onClick={() => handleDelete(domain.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Domínio Autorizado</DialogTitle>
            <DialogDescription>
              Atualize as informações do domínio autorizado
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-domain">Domínio</Label>
              <Input
                id="edit-domain"
                value={editDomain}
                onChange={(e) => setEditDomain(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="edit-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
              />
              <Label htmlFor="edit-active">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}