// app/[accountid]/dashboard/page.tsx
"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Componente auxiliar: Card
type CardProps = {
  title: string;
  description: string;
  tag?: string;
  popular?: boolean;
  ia?: boolean;
};

function Card({ title, description, tag, popular, ia }: CardProps) {
  return (
    <Link href="#">
      <div
        className={`
          border border-border p-4 rounded-lg shadow-sm
          bg-card text-card-foreground
          transition-colors duration-300
          hover:border-primary hover:bg-accent/50
        `}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
          {ia && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 py-0.5 px-2 rounded-md border border-border">
              [IA]
            </span>
          )}
        </div>
        <p className="text-sm mb-3 text-muted-foreground">{description}</p>
        <div className="flex items-center gap-2">
          {tag && (
            <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 py-0.5 px-2 rounded-md border border-border">
              {tag}
            </span>
          )}
          {popular && (
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 py-0.5 px-2 rounded-md border border-border">
              POPULAR
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Configuração do Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export default function DashboardHome() {
  const { data: session } = useSession();
  const router = useRouter();
  const params = useParams();
  const accountId = params?.accountid as string;
  const subscriptionSectionRef = useRef<HTMLDivElement>(null);
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  // Estado para armazenar os dados completos da assinatura para debug
  const [subscriptionData, setSubscriptionData] = useState<any>(null);

  // Busca os dados da assinatura do usuário
  useEffect(() => {
    fetch("/api/user/subscription")
      .then((res) => res.json())
      .then((data) => {
        // Salva os dados completos da assinatura para fins de debug
        setSubscriptionData(data.subscription);
        // O usuário é considerado assinante se houver uma assinatura e seu status for "ACTIVE"
        setIsSubscribed(data.subscription && data.subscription.status === "ACTIVE");
      })
      .catch((err) => {
        console.error("Erro ao buscar dados da assinatura:", err);
        setIsSubscribed(false);
      });
  }, []);

  // Handler para clique nos cards
  const handleCardClick = useCallback(() => {
    if (!isSubscribed && subscriptionSectionRef.current) {
      subscriptionSectionRef.current.scrollIntoView({ behavior: "smooth" });
    } else {
      // Se o usuário já estiver assinando, prossiga para a funcionalidade do card
      console.log("Usuário assinante – prosseguir com a ação do card");
    }
  }, [isSubscribed]);

  // Função para buscar o clientSecret da Checkout Session
  const fetchClientSecret = useCallback(() => {
    return fetch("/api/checkout-sessions", {
      method: "POST",
    })
      .then((res) => res.json())
      .then((data) => data.clientSecret);
  }, []);

  const checkoutOptions = { fetchClientSecret };

  // Obter primeiro nome do usuário (ou "Usuário" se não houver nome)
  const userName = session?.user?.name?.split(" ")[0] ?? "Usuário";

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-8 p-6">
        {/* Seção Inicial */}
        <section className="pt-6">
          <h1 className="text-3xl font-bold mb-2 text-foreground">Olá, {userName}</h1>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 px-2 py-0.5 rounded-md text-sm font-semibold border border-border">
              [IA]
            </span>
            <p className="text-lg text-foreground">
              Deixe a IA cuidar da agitação do feriado. A IA trabalha, você comemora!
            </p>
          </div>
          <p className="mt-2 text-muted-foreground">
            Desconto de <strong>20% no valor</strong>
          </p>
        </section>

        {/* Seção com Cards */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            A IA ideal para otimizar e minimizar tarefas repetitivas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title="Use IA para automatizar interações"
              description="Reduza tarefas manuais repetitivas e aumente a produtividade."
            />
            <Card
              title="Converter interações em leads quentes com IA"
              description="Identifique rapidamente oportunidades de negócio."
            />
            <Card
              title="Converter interações em leads quentes com IA"
              description="Segmentação inteligente e automática para potenciais clientes."
            />
          </div>
        </section>

        {/* Seção "Comece aqui" */}
        <section>
          <h2 className="text-xl font-semibold mb-4 text-foreground">Comece aqui</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title="Enviar links automaticamente por DM a partir dos comentários"
              description="Envie um link sempre que alguém comentar em uma publicação ou reel."
              tag="Quick Automation"
              popular
            />
            <Card
              title="Conheça nossos modelos"
              description="Templates prontos para interações de DM automáticas."
              tag="Quick Automation"
            />
            <Card
              title="Gere leads dos stories"
              description="Use ofertas por tempo limitado nos Stories para converter leads."
              tag="Flow Builder"
            />
          </div>
        </section>

        {/* Seção com um único card */}
        <section>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card
              title="Use IA para automatizar interações"
              description="Colete informações dos seus seguidores ou defina respostas automáticas."
              tag="Flow Builder"
              ia
            />
          </div>
        </section>

        {/* Seção de assinatura (exibida somente se o usuário NÃO tiver assinatura ativa) */}
        {!isSubscribed && (
          <section ref={subscriptionSectionRef}>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Assine Agora</h2>
            <p className="mb-4 text-muted-foreground">
              Assine agora e decole na automatização das redes sociais.
            </p>
            <Button variant="default" onClick={() => setCheckoutDialogOpen(true)}>
              Assine agora
            </Button>
          </section>
        )}

        {/* Diálogo com o Embedded Checkout */}
        <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
          <DialogTrigger asChild />
          <DialogContent className="max-w-lg bg-background border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Checkout - Assinatura Mensal</DialogTitle>
            </DialogHeader>
            <div id="checkout" className="min-h-[300px]">
              <EmbeddedCheckoutProvider stripe={stripePromise} options={checkoutOptions}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
            <DialogFooter>
              <Button onClick={() => setCheckoutDialogOpen(false)}>Concluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/*
          =========================
          DEBUG: Informações da Assinatura do Usuário
          =========================
          Essa seção exibe todas as informações da assinatura salvas no banco de dados para fins didáticos.
          Após confirmar que os dados estão sendo exibidos corretamente, você pode removê-la.
        */}
        <section className="border-t border-border pt-4 mt-4">
          <h2 className="text-xl font-bold mb-2 text-foreground">DEBUG: Dados da Assinatura</h2>
          <pre className="text-sm bg-muted text-muted-foreground p-4 rounded border border-border overflow-auto">
            {JSON.stringify(subscriptionData, null, 2)}
          </pre>
        </section>
        
        {/* =========================
            DEBUG: Dados da Sessão do Usuário
            ========================= */}
        <section className="border-t border-border pt-4 mt-4">
          <h2 className="text-xl font-bold mb-2 text-foreground">DEBUG: Dados da Sessão</h2>
          <pre className="text-sm bg-muted text-muted-foreground p-4 rounded border border-border overflow-auto">
            {JSON.stringify(session, null, 2)}
          </pre>
        </section>

        {/* =========================
             Fim da seção DEBUG
             ========================= */}
      </div>
    </div>
  );
}
