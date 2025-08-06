// components/subscription-guard.tsx
"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isExemptedEmail } from "@/lib/subscription-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Mail, CheckCircle } from "lucide-react";

interface SubscriptionGuardProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

export default function SubscriptionGuard({ children, fallbackPath = "/assine-agora" }: SubscriptionGuardProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscriptionStatus, setSubscriptionStatus] = useState<{
    hasAccess: boolean;
    reason: 'active_subscription' | 'exempted_email' | 'no_access' | 'loading';
  }>({ hasAccess: false, reason: 'loading' });

  useEffect(() => {
    const checkAccess = async () => {
      if (status === "loading") return;
      
      if (!session?.user?.email) {
        setSubscriptionStatus({ hasAccess: false, reason: 'no_access' });
        return;
      }

      const userEmail = session.user.email;

      // Verificar se está na lista de exceções
      if (isExemptedEmail(userEmail)) {
        setSubscriptionStatus({ hasAccess: true, reason: 'exempted_email' });
        return;
      }

      // Verificar acesso via API (inclui verificação de exceções e assinatura)
      try {
        const response = await fetch('/api/subscription/access');
        if (response.ok) {
          const data = await response.json();
          setSubscriptionStatus({
            hasAccess: data.hasAccess,
            reason: data.reason
          });
        } else {
          setSubscriptionStatus({ hasAccess: false, reason: 'no_access' });
        }
      } catch (error) {
        console.error('Erro ao verificar acesso:', error);
        setSubscriptionStatus({ hasAccess: false, reason: 'no_access' });
      }
    };

    checkAccess();
  }, [session, status]);

  // Loading state
  if (status === "loading" || subscriptionStatus.reason === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Has access - render children
  if (subscriptionStatus.hasAccess) {
    // Mostrar badge para usuários com acesso liberado
    if (subscriptionStatus.reason === 'exempted_email') {
      return (
        <div className="relative">
          <div className="absolute top-4 right-4 z-50">
            <div className="bg-green-100 border border-green-300 text-green-800 px-3 py-1 rounded-full text-xs font-medium">
              ✨ Acesso Liberado
            </div>
          </div>
          {children}
        </div>
      );
    }
    return <>{children}</>;
  }

  // No access - show subscription required message
  return (
    <div className="flex items-center justify-center min-h-[400px] p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Crown className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Assinatura Necessária</CardTitle>
          <CardDescription>
            Esta funcionalidade requer uma assinatura ativa para ser acessada.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Acesso completo a todas as funcionalidades</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Automações avançadas</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>Suporte prioritário</span>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <Button 
              onClick={() => router.push(fallbackPath)}
              className="w-full"
            >
              <Crown className="mr-2 h-4 w-4" />
              Assinar Agora
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.back()}
              className="w-full"
            >
              Voltar
            </Button>
          </div>

          {session?.user?.email && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span>Logado como: {session.user.email}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}