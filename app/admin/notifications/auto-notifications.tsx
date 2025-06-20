'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from "sonner";
import { Loader2, Bell, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface User {
  id: string;
  name: string | null;
  email: string;
  accounts?: Array<{
    id: string;
    provider: string;
    providerAccountId: string;
    igUsername?: string | null;
    expires_at?: number | null;
  }>;
}

interface NotificationResult {
  type: string;
  count: number;
  success: boolean;
  message: string;
}

const AutoNotifications = () => {
  
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<NotificationResult[]>([]);
  const [progressStatus, setProgressStatus] = useState('');

  const sendWelcomeNotifications = async () => {
    try {
      const response = await fetch('/api/admin/auto-notifications/welcome', {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        return {
          type: 'welcome',
          count: data.count,
          success: true,
          message: data.message
        };
      } else {
        const error = await response.json();
        return {
          type: 'welcome',
          count: 0,
          success: false,
          message: error.message || 'Erro ao enviar notificações de boas-vindas'
        };
      }
    } catch (error) {
      console.error('Erro ao enviar notificações de boas-vindas:', error);
      return {
        type: 'welcome',
        count: 0,
        success: false,
        message: 'Erro ao enviar notificações de boas-vindas'
      };
    }
  };

  const sendExpiringTokenNotifications = async (days: number) => {
    try {
      const response = await fetch(`/api/admin/auto-notifications/expiring-tokens?days=${days}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        return {
          type: `expiring-${days}`,
          count: data.count,
          success: true,
          message: data.message
        };
      } else {
        const error = await response.json();
        return {
          type: `expiring-${days}`,
          count: 0,
          success: false,
          message: error.message || `Erro ao enviar notificações de tokens expirando em ${days} dias`
        };
      }
    } catch (error) {
      console.error(`Erro ao enviar notificações de tokens expirando em ${days} dias:`, error);
      return {
        type: `expiring-${days}`,
        count: 0,
        success: false,
        message: `Erro ao enviar notificações de tokens expirando em ${days} dias`
      };
    }
  };

  const handleSendAllNotifications = async () => {
    setLoading(true);
    setResults([]);
    setProgressStatus('Iniciando...');

    try {
      // Enviar notificação de boas-vindas
      setProgressStatus('Enviando notificações de boas-vindas...');
      const welcomeResult = await sendWelcomeNotifications();
      setResults(prev => [...prev, welcomeResult]);

      // Enviar notificação de tokens expirando em 10 dias
      setProgressStatus('Enviando notificações de tokens expirando em 10 dias...');
      const expiring10Result = await sendExpiringTokenNotifications(10);
      setResults(prev => [...prev, expiring10Result]);

      // Enviar notificação de tokens expirando em 3 dias
      setProgressStatus('Enviando notificações de tokens expirando em 3 dias...');
      const expiring3Result = await sendExpiringTokenNotifications(3);
      setResults(prev => [...prev, expiring3Result]);

      setProgressStatus('Concluído!');

      // Mostrar toast com resultado geral
      const totalSent = [welcomeResult, expiring10Result, expiring3Result]
        .filter(r => r.success)
        .reduce((acc, curr) => acc + curr.count, 0);

      if (totalSent > 0) {
        toast("Notificações enviadas", {
          description: `${totalSent} notificações automáticas foram enviadas com sucesso.`,
        });
      } else {
        toast.error("Erro", { description: "Não foi possível enviar as notificações automáticas.",
         });
      }
    } catch (error) {
      console.error('Erro ao enviar notificações automáticas:', error);
      toast.error("Erro", { description: "Ocorreu um erro ao enviar as notificações automáticas.",
       });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center text-card-foreground">
          <Bell className="h-5 w-5 mr-2" />
          Notificações Automáticas
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Envie notificações automáticas para todos os usuários do sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border border-border">
            <div>
              <h3 className="font-medium text-card-foreground">Boas-vindas ao ChatWit Social</h3>
              <p className="text-sm text-muted-foreground">
                Envia uma mensagem de boas-vindas para todos os usuários
              </p>
            </div>
            <Badge variant="outline" className="border-border">Todos os usuários</Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border border-border">
            <div>
              <h3 className="font-medium text-card-foreground">Tokens expirando em 10 dias</h3>
              <p className="text-sm text-muted-foreground">
                Notifica usuários com tokens do Instagram expirando em menos de 10 dias
              </p>
            </div>
            <Badge variant="outline" className="border-border bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-400/30">
              Aviso prévio
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-md border border-border">
            <div>
              <h3 className="font-medium text-card-foreground">Tokens expirando em 3 dias</h3>
              <p className="text-sm text-muted-foreground">
                Alerta urgente para usuários com tokens do Instagram expirando em menos de 3 dias
              </p>
            </div>
            <Badge variant="outline" className="border-border bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:border-red-400/30">
              Urgente
            </Badge>
          </div>

          {loading && (
            <div className="mt-4">
              <div className="h-2 bg-muted rounded-full overflow-hidden border border-border">
                <div className="h-full bg-primary animate-pulse"></div>
              </div>
              <p className="text-sm text-muted-foreground mt-2 text-center">
                {progressStatus}
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-4 space-y-2">
              <h3 className="font-medium text-sm text-card-foreground">Resultados:</h3>
              {results.map((result, index) => (
                <div
                  key={index}
                  className={`p-2 rounded-md text-sm flex items-center border border-border ${
                    result.success
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 dark:border-green-400/30'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 dark:border-red-400/30'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mr-2" />
                  )}
                  <div>
                    {result.type === 'welcome' && 'Boas-vindas: '}
                    {result.type === 'expiring-10' && 'Tokens (10 dias): '}
                    {result.type === 'expiring-3' && 'Tokens (3 dias): '}
                    {result.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={handleSendAllNotifications}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando notificações...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Enviar todas as notificações automáticas
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default AutoNotifications;