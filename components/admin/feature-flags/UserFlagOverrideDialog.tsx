"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Search, X, Calendar, User } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface UserOverride {
  id: string;
  userId: string;
  enabled: boolean;
  expiresAt: string | null;
  createdAt: string;
  user: User;
}

interface UserFlagOverrideDialogProps {
  flagId: string;
  flagName: string;
  children: React.ReactNode;
}

export function UserFlagOverrideDialog({
  flagId,
  flagName,
  children
}: UserFlagOverrideDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [overrides, setOverrides] = useState<UserOverride[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, flagId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load users
      const usersResponse = await fetch("/api/admin/resposta-rapida/users");
      if (!usersResponse.ok) throw new Error("Erro ao carregar usuários");
      const usersData = await usersResponse.json();
      setUsers(usersData.users);

      // Load existing overrides for this flag
      const overridesResponse = await fetch(`/api/admin/feature-flags/user-overrides?flagId=${flagId}`);
      if (!overridesResponse.ok) throw new Error("Erro ao carregar overrides");
      const overridesData = await overridesResponse.json();
      setOverrides(overridesData.overrides);

    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const createOverride = async () => {
    if (!selectedUser) return;

    try {
      setUpdating(selectedUser.id);
      
      const response = await fetch("/api/admin/feature-flags/user-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          flagId,
          userId: selectedUser.id,
          enabled: overrideEnabled,
          expiresAt: expiresAt || null
        }),
      });

      if (!response.ok) throw new Error("Erro ao criar override");

      const data = await response.json();
      setOverrides(prev => [...prev, data.override]);
      setSelectedUser(null);
      setOverrideEnabled(false);
      setExpiresAt("");
      
      toast.success("Override criado com sucesso");

    } catch (error) {
      console.error("Error creating override:", error);
      toast.error("Erro ao criar override");
    } finally {
      setUpdating(null);
    }
  };

  const removeOverride = async (overrideId: string) => {
    try {
      setUpdating(overrideId);
      
      const response = await fetch(`/api/admin/feature-flags/user-overrides/${overrideId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erro ao remover override");

      setOverrides(prev => prev.filter(o => o.id !== overrideId));
      toast.success("Override removido com sucesso");

    } catch (error) {
      console.error("Error removing override:", error);
      toast.error("Erro ao remover override");
    } finally {
      setUpdating(null);
    }
  };

  const filteredUsers = users.filter(user => 
    !overrides.some(o => o.userId === user.id) &&
    (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Overrides de Usuário</DialogTitle>
          <DialogDescription>
            Configure a feature flag "{flagName}" para usuários específicos
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Existing Overrides */}
            {overrides.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Overrides Ativos</h3>
                <div className="space-y-2">
                  {overrides.map((override) => (
                    <Card key={override.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                {override.user.name || "Sem nome"}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {override.user.email}
                              </p>
                            </div>
                            <Badge variant={override.enabled ? "default" : "secondary"}>
                              {override.enabled ? "Ativa" : "Inativa"}
                            </Badge>
                            {override.expiresAt && (
                              <Badge variant="outline" className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Expira: {new Date(override.expiresAt).toLocaleDateString("pt-BR")}
                              </Badge>
                            )}
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeOverride(override.id)}
                            disabled={updating === override.id}
                            className="text-destructive hover:text-destructive"
                          >
                            {updating === override.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Create New Override */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Criar Novo Override</h3>
              
              {/* User Search */}
              <div className="space-y-2">
                <Label>Buscar Usuário</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* User Selection */}
              {searchTerm && (
                <div className="max-h-40 overflow-y-auto border rounded-md">
                  {filteredUsers.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </div>
                  ) : (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`p-3 cursor-pointer hover:bg-muted ${
                          selectedUser?.id === user.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedUser(user)}
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{user.name || "Sem nome"}</p>
                          <Badge variant="outline">{user.role}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Override Configuration */}
              {selectedUser && (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="font-medium">
                        {selectedUser.name || "Sem nome"} ({selectedUser.email})
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label>Feature Flag Ativa</Label>
                      <Switch
                        checked={overrideEnabled}
                        onCheckedChange={setOverrideEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data de Expiração (opcional)</Label>
                      <Input
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={createOverride}
                        disabled={updating === selectedUser.id}
                        className="flex items-center gap-2"
                      >
                        {updating === selectedUser.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                        Criar Override
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedUser(null);
                          setOverrideEnabled(false);
                          setExpiresAt("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}