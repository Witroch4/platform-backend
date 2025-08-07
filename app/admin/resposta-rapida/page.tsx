"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Users, Activity } from "lucide-react";
import { Input } from "@/components/ui/input";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  flashIntentEnabled: boolean;
}

interface SystemStats {
  totalUsers: number;
  flashIntentEnabledUsers: number;
  queueHealth: {
    respostaRapida: boolean;
    persistenciaCredenciais: boolean;
  };
}

export default function RespostaRapidaPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [globalFlashIntent, setGlobalFlashIntent] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carregar usuários
      const usersResponse = await fetch("/api/admin/resposta-rapida/users");
      if (!usersResponse.ok) throw new Error("Erro ao carregar usuários");
      const usersData = await usersResponse.json();
      setUsers(usersData.users);

      // Carregar estatísticas do sistema
      const statsResponse = await fetch("/api/admin/resposta-rapida/stats");
      if (!statsResponse.ok) throw new Error("Erro ao carregar estatísticas");
      const statsData = await statsResponse.json();
      setSystemStats(statsData);

      // Verificar status global da Flash Intent
      const globalResponse = await fetch("/api/admin/resposta-rapida/global-status");
      if (!globalResponse.ok) throw new Error("Erro ao carregar status global");
      const globalData = await globalResponse.json();
      setGlobalFlashIntent(globalData.enabled);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados da página");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserFlashIntent = async (userId: string, enabled: boolean) => {
    try {
      setUpdating(userId);
      
      const response = await fetch("/api/admin/resposta-rapida/toggle-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, enabled }),
      });

      if (!response.ok) throw new Error("Erro ao atualizar usuário");

      // Atualizar estado local
      setUsers(prev => 
        prev.map(user => 
          user.id === userId 
            ? { ...user, flashIntentEnabled: enabled }
            : user
        )
      );

      toast.success(
        enabled 
          ? "Flash Intent ativada para o usuário" 
          : "Flash Intent desativada para o usuário"
      );

      // Recarregar estatísticas
      const statsResponse = await fetch("/api/admin/resposta-rapida/stats");
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setSystemStats(statsData);
      }

    } catch (error) {
      console.error("Erro ao atualizar usuário:", error);
      toast.error("Erro ao atualizar configuração do usuário");
    } finally {
      setUpdating(null);
    }
  };

  const toggleGlobalFlashIntent = async (enabled: boolean) => {
    try {
      setGlobalLoading(true);
      
      const response = await fetch("/api/admin/resposta-rapida/toggle-global", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) throw new Error("Erro ao atualizar configuração global");

      setGlobalFlashIntent(enabled);
      
      toast.success(
        enabled 
          ? "Flash Intent ativada globalmente - todas as respostas rápidas estão ativas" 
          : "Flash Intent desativada globalmente"
      );

      // Recarregar dados para refletir mudanças
      await loadData();

    } catch (error) {
      console.error("Erro ao atualizar configuração global:", error);
      toast.error("Erro ao atualizar configuração global");
    } finally {
      setGlobalLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Zap className="h-8 w-8 text-yellow-500" />
        <div>
          <h1 className="text-3xl font-bold">Gestão de Respostas Rápidas</h1>
          <p className="text-muted-foreground">
            Ative ou desative a Flash Intent para usuários específicos ou globalmente
          </p>
        </div>
      </div>

      {/* Estatísticas do Sistema */}
      {systemStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Total de Usuários</p>
                  <p className="text-2xl font-bold">{systemStats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Flash Intent Ativa</p>
                  <p className="text-2xl font-bold">{systemStats.flashIntentEnabledUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Fila Resposta Rápida</p>
                  <Badge variant={systemStats.queueHealth.respostaRapida ? "default" : "destructive"}>
                    {systemStats.queueHealth.respostaRapida ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Fila Persistência</p>
                  <Badge variant={systemStats.queueHealth.persistenciaCredenciais ? "default" : "destructive"}>
                    {systemStats.queueHealth.persistenciaCredenciais ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controle Global */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Controle Global da Flash Intent
          </CardTitle>
          <CardDescription>
            Ative ou desative a Flash Intent para todos os usuários do sistema. 
            Quando ativa, todas as respostas rápidas, filas e processamento otimizado ficam disponíveis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Flash Intent Global</p>
              <p className="text-sm text-muted-foreground">
                {globalFlashIntent 
                  ? "Todas as funcionalidades de resposta rápida estão ativas"
                  : "Sistema funcionando em modo padrão"
                }
              </p>
            </div>
            <div className="flex items-center gap-2">
              {globalLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Switch
                checked={globalFlashIntent}
                onCheckedChange={toggleGlobalFlashIntent}
                disabled={globalLoading}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Usuários */}
      <Card>
        <CardHeader>
          <CardTitle>Usuários do Sistema</CardTitle>
          <CardDescription>
            Gerencie a Flash Intent individualmente para cada usuário
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Busca */}
          <Input
            placeholder="Buscar usuários por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />

          {/* Lista de usuários */}
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{user.name || "Sem nome"}</p>
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  {updating === user.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Switch
                    checked={user.flashIntentEnabled}
                    onCheckedChange={(enabled) => toggleUserFlashIntent(user.id, enabled)}
                    disabled={updating === user.id || globalLoading}
                  />
                  <span className="text-sm text-muted-foreground min-w-[60px]">
                    {user.flashIntentEnabled ? "Ativa" : "Inativa"}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum usuário encontrado
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}