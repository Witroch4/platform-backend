"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  ArrowLeft,
  User,
  Mail,
  Shield,
  Zap,
  Settings,
  Clock,
  Calendar
} from "lucide-react";
import { useSession } from "next-auth/react";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  turboModeEnabled?: boolean;
  flashIntentEnabled?: boolean;
  turboModeActivatedAt?: string | null;
  turboModeUpdatedAt?: string | null;
}

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
  userOverrides?: Array<{
    userId: string;
    flagId: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export default function UserFeaturesPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const userId = params?.id as string;

  // SUPERADMIN role verification
  if (status === "loading") {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!session?.user || session.user.role !== "SUPERADMIN") {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-destructive mb-4">Acesso Negado</h2>
            <p className="text-muted-foreground">
              Você precisa ter permissões de SUPERADMIN para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    if (session?.user?.role === "SUPERADMIN" && userId) {
      loadUserData();
    }
  }, [session, userId]);

  const loadUserData = async () => {
    try {
      setLoading(true);
      
      // Carregar dados do usuário e feature flags em paralelo
      const [userResponse, flagsResponse] = await Promise.all([
        fetch(`/api/admin/users/${userId}`),
        fetch("/api/admin/feature-flags")
      ]);

      if (!userResponse.ok) {
        throw new Error("Usuário não encontrado");
      }

      if (!flagsResponse.ok) {
        throw new Error("Erro ao carregar feature flags");
      }

      const userData = await userResponse.json();
      const flagsData = await flagsResponse.json();

      setUser(userData.user);
      setFeatureFlags(flagsData.flags);

    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do usuário");
      router.push("/admin/features");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserFeatureFlag = async (flagId: string, enabled: boolean) => {
    try {
      setUpdating(flagId);
      
      const response = await fetch("/api/admin/feature-flags/user-overrides", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ flagId, userId, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao alterar feature flag");
      }

      // Atualizar estado local
      setFeatureFlags(prev => 
        prev.map(flag => {
          if (flag.id === flagId) {
            const updatedOverrides = flag.userOverrides || [];
            const existingOverrideIndex = updatedOverrides.findIndex(o => o.userId === userId);
            
            if (existingOverrideIndex >= 0) {
              updatedOverrides[existingOverrideIndex] = { 
                ...updatedOverrides[existingOverrideIndex], 
                enabled 
              };
            } else {
              updatedOverrides.push({ 
                userId, 
                flagId, 
                enabled,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              });
            }
            
            return { ...flag, userOverrides: updatedOverrides };
          }
          return flag;
        })
      );

      toast.success(
        enabled 
          ? "Feature ativada para o usuário" 
          : "Feature desativada para o usuário"
      );

    } catch (error) {
      console.error("Erro ao alterar feature flag:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar feature flag");
    } finally {
      setUpdating(null);
    }
  };

  const toggleUserTurboMode = async (enabled: boolean) => {
    try {
      setUpdating("turbo-mode");
      
      const response = await fetch("/api/admin/turbo-mode/user/toggle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao alterar Modo Turbo");
      }

      setUser(prev => prev ? { ...prev, turboModeEnabled: enabled } : null);

      toast.success(
        enabled 
          ? "Modo Turbo ativado para o usuário" 
          : "Modo Turbo desativado para o usuário"
      );

    } catch (error) {
      console.error("Erro ao alterar Modo Turbo:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar Modo Turbo");
    } finally {
      setUpdating(null);
    }
  };

  const toggleUserFlashIntent = async (enabled: boolean) => {
    try {
      setUpdating("flash-intent");
      
      const response = await fetch("/api/admin/resposta-rapida/toggle-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId, enabled }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao alterar Respostas Rápidas");
      }

      setUser(prev => prev ? { ...prev, flashIntentEnabled: enabled } : null);

      toast.success(
        enabled 
          ? "Respostas Rápidas ativadas para o usuário" 
          : "Respostas Rápidas desativadas para o usuário"
      );

    } catch (error) {
      console.error("Erro ao alterar Respostas Rápidas:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao alterar Respostas Rápidas");
    } finally {
      setUpdating(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto py-10">
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-2xl font-bold text-destructive mb-4">Usuário não encontrado</h2>
            <Button onClick={() => router.push("/admin/features")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button 
          variant="ghost" 
          onClick={() => router.push("/admin/features")}
          className="p-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-white text-lg font-medium">
              {user.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div>
            <h1 className="text-3xl font-bold">Features do Usuário</h1>
            <p className="text-muted-foreground">
              Gerencie todas as features para {user.name || 'este usuário'}
            </p>
          </div>
        </div>
      </div>

      {/* Informações do Usuário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informações do Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Nome:</span>
              <span className="font-medium">{user.name || 'Não informado'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Email:</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Função:</span>
              <Badge variant={user.role === 'SUPERADMIN' ? 'default' : 'secondary'}>
                {user.role}
              </Badge>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Criado em:</span>
              <span className="font-medium">{formatDate(user.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Último update:</span>
              <span className="font-medium">{formatDate(user.updatedAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Features
          </CardTitle>
          <CardDescription>
            Configure as funcionalidades do sistema para este usuário
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Respostas Rápidas */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                <Zap className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <h3 className="font-medium">Respostas Rápidas (Flash Intent)</h3>
                <p className="text-sm text-muted-foreground">
                  Processamento otimizado de webhooks e respostas em menos de 100ms
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={user.flashIntentEnabled || false}
                onCheckedChange={toggleUserFlashIntent}
                disabled={updating === "flash-intent"}
              />
              {updating === "flash-intent" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>
          </div>

          {/* Modo Turbo */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Settings className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-medium">Modo Turbo</h3>
                <p className="text-sm text-muted-foreground">
                  Processamento paralelo de leads com até 10x mais velocidade
                </p>
                {user.turboModeEnabled && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default" className="text-xs bg-green-600">
                      Ativo
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Processamento em lote otimizado
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={user.turboModeEnabled || false}
                onCheckedChange={toggleUserTurboMode}
                disabled={updating === "turbo-mode"}
              />
              {updating === "turbo-mode" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
