"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Instagram, Facebook, MessageSquare, Send, AlertCircle, Plus, Trash2, RefreshCw, CheckCircle, Users, BarChart, Calendar, Zap, Home, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";

interface InstagramAccount {
  id: string;
  providerAccountId: string;
  igUsername: string;
  isMain: boolean;
}

export default function RedeSocialPage() {
  
  const { data: session, update } = useSession();
  const router = useRouter();
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>("instagram");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectedAccounts, setConnectedAccounts] = useState<InstagramAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  // URL de autorização do Instagram
  const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI || `${window.location.origin}/registro/redesocial/callback`;
  
  // Depuração do redirectUri
  useEffect(() => {
    console.log(`redirectUri na página de registro: ${redirectUri}`);
  }, [redirectUri]);
  
  const instagramAuthUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${process.env.NEXT_PUBLIC_INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish`;

  // Função para enviar notificação de boas-vindas
  const sendWelcomeNotification = async () => {
    try {
      const response = await fetch('/api/auth/welcome-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        toast("Bem-vindo!", {
          description: "Notificação de boas-vindas enviada com sucesso.",
        });
      }
    } catch (error) {
      console.error('Erro ao chamar a API de notificação de boas-vindas:', error);
    }
  };

  // useEffect principal simplificado
  useEffect(() => {
    // Se a sessão ainda está carregando, não fazemos nada
    if (session === undefined) {
      return;
    }

    // Se usuário não está autenticado
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    // Se o usuário está autenticado e não foi verificado ainda
    if (session?.user && !sessionChecked) {
      setSessionChecked(true);
      
      // Buscar contas conectadas
      fetchAccounts();

      // Enviar notificação de boas-vindas apenas uma vez
      sendWelcomeNotification();
    }
  }, [session, sessionChecked]);

  // useEffect para detectar redirecionamento após login
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const fromLogin = urlParams.get('fromLogin');

      if (fromLogin === 'true') {
        // Remover o parâmetro da URL
        window.history.replaceState({}, document.title, window.location.pathname);

        // Forçar atualização da sessão uma única vez
        update().then(() => {
          // Resetar o flag para permitir nova verificação
          setSessionChecked(false);
        });
      }
    }
  }, []);

  // Modificar a função fetchAccounts para ser mais robusta
  const fetchAccounts = async () => {
    if (!session?.user?.id) {
      return;
    }

    try {
      setIsLoading(true);

      // Usar a rota correta e adicionar timestamp para evitar cache
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/auth/instagram/accounts?t=${timestamp}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        credentials: 'include',
        cache: 'no-store'
      });

      console.log("Status da resposta API:", response.status);

      if (!response.ok) {
        throw new Error(`Erro na API: ${response.status} ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log("Resposta bruta da API:", responseText);

      try {
        const data = JSON.parse(responseText);
        console.log("Dados parseados da API:", data);

        if (Array.isArray(data)) {
          setConnectedAccounts(data);
          console.log(`${data.length} contas carregadas com sucesso`);
        } else if (data.accounts && Array.isArray(data.accounts)) {
          setConnectedAccounts(data.accounts);
          console.log(`${data.accounts.length} contas carregadas com sucesso`);
        } else {
          console.error("Formato de resposta inesperado:", data);
          setConnectedAccounts([]);
        }
      } catch (parseError) {
        console.error("Erro ao analisar JSON:", parseError);
      }
    } catch (error) {
      console.error("Erro ao buscar contas:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Função para atualizar a lista de contas
  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchAccounts();
  };

  // Função para conectar ao Instagram
  const handleInstagramConnect = async () => {
    try {
      setIsConnecting(true);
      setConnectionError(null);
      // Redirecionar para a URL de autenticação do Instagram
      window.location.href = instagramAuthUrl;
    } catch (error) {
      console.error("Erro ao conectar com Instagram:", error);
      setConnectionError("Ocorreu um erro ao tentar conectar com o Instagram. Tente novamente mais tarde.");
      toast.error("Erro de conexão", { description: "Não foi possível conectar ao Instagram. Tente novamente mais tarde.",
       });
    } finally {
      setIsConnecting(false);
    }
  };

  // Função para desconectar uma conta do Instagram
  const handleDisconnectAccount = async (accountId: string) => {
    try {
      const response = await fetch("/api/auth/instagram/disconnect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId }),
      });

      if (response.ok) {
        // Remover a conta da lista local
        setConnectedAccounts(prevAccounts =>
          prevAccounts.filter(account => account.id !== accountId)
        );

        toast("Conta desconectada", { description: "A conta do Instagram foi desconectada com sucesso.",
          });
      } else {
        const data = await response.json();
        toast.error("Erro ao desconectar", { description: data.error || "Não foi possível desconectar a conta. Tente novamente.",
         });
      }
    } catch (error) {
      console.error("Erro ao desconectar conta:", error);
      toast.error("Erro ao desconectar", { description: "Ocorreu um erro ao tentar desconectar a conta. Tente novamente.",
       });
    }
  };

  // Função para navegar para o dashboard com a conta selecionada usando providerAccountId
  const navigateToDashboard = (providerAccountId: string) => {
    router.push(`/${providerAccountId}/dashboard`);
  };

  return (
    <>
      {/* Navbar */}
      <header className="sticky top-0 left-0 right-0 h-16 border-b bg-background z-40">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <Button variant="ghost" size="icon" className="h-8 w-8 mr-2">
                <Home className="h-5 w-5" />
                <span className="sr-only">Início</span>
              </Button>
              <h1 className="text-xl font-semibold hidden md:block">
                ChatWit Social
              </h1>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <NotificationDropdown />
            <ThemeToggle />

            {session?.user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarImage src={session.user.image || ""} alt={session.user.name || "Usuário"} />
                    <AvatarFallback>
                      {session.user.name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {session.user.name && <p className="font-medium">{session.user.name}</p>}
                      {session.user.email && (
                        <p className="w-[200px] truncate text-sm text-muted-foreground">
                          {session.user.email}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/perfil" className="flex items-center">
                      <Users className="mr-2 h-4 w-4" />
                      <span>Perfil</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {session?.user?.role === "ADMIN" && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link href="/admin" className="flex items-center">
                          <BarChart className="mr-2 h-4 w-4" />
                          <span>Painel Admin</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="flex items-center"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sair</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <div className="space-y-8 pb-10">
        {/* Banner com logo */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl p-8 text-white relative overflow-hidden">
          <div className="absolute right-0 top-0 opacity-10">
            <Image src="/ChatWit.svg" alt="ChatWit Logo" width={300} height={300} />
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white rounded-full p-2">
              <Image src="/W.svg" alt="W Logo" width={40} height={40} className="h-10 w-10" />
            </div>
            <h1 className="text-3xl font-bold">ChatWit Social</h1>
          </div>
          <p className="text-xl max-w-2xl mb-6">
            Conecte suas redes sociais e potencialize seu engajamento com automação inteligente
          </p>
          <div className="flex gap-4">
            <Button
              onClick={handleInstagramConnect}
              className="bg-white text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Conectar Conta
            </Button>
            <Button
              variant="outline"
              className="bg-transparent border-white text-white hover:bg-white/20"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Depuração */}
        {process.env.NODE_ENV === 'development' && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <h3 className="font-medium mb-2">Informações de depuração:</h3>
            <p>Sessão: {session ? "Autenticado" : "Não autenticado"}</p>
            <p>ID do usuário: {session?.user?.id || "N/A"}</p>
            <p>Contas carregadas: {connectedAccounts.length}</p>
            <p>Estado de carregamento: {isLoading ? "Carregando..." : "Concluído"}</p>
            <Link href="/admin" className="text-blue-600 hover:underline mt-2 inline-block">
              Acessar Painel Admin
            </Link>
            {session?.user?.role === "ADMIN" && (
              <Button
                onClick={() => router.push('/admin')}
                variant="default"
                size="sm"
                className="mt-2 ml-2"
              >
                <BarChart className="mr-2 h-4 w-4" />
                Painel de Administração
              </Button>
            )}

          </div>
        )}

        {/* Indicador de carregamento */}
        {isLoading ? (
          <div className="flex justify-center items-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <p className="ml-3 text-primary">Carregando suas contas...</p>
          </div>
        ) : connectedAccounts.length === 0 && session?.user?.id ? (
          <div className="text-center p-8">
            <p className="mb-4">Nenhuma conta encontrada. Se você já conectou uma conta, tente recarregar.</p>
            <Button onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Recarregar contas
            </Button>
          </div>
        ) : null}

        {/* Contas conectadas */}
        {connectedAccounts.length > 0 && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Minhas Contas</h2>
              <Badge variant="outline" className="px-3 py-1">
                {connectedAccounts.length} {connectedAccounts.length === 1 ? 'conta' : 'contas'} conectada{connectedAccounts.length !== 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="cursor-pointer"
                  onClick={() => navigateToDashboard(account.providerAccountId)}
                >
                  <Card className="h-full hover:border-primary hover:shadow-md transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                          <Instagram className="h-6 w-6" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">Instagram</CardTitle>
                          <div className="text-sm text-muted-foreground">
                            {account.isMain && (
                              <Badge variant="outline" className="bg-primary/10 text-primary">
                                Principal
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium text-lg">@{account.igUsername}</p>
                      <p className="text-sm text-muted-foreground">
                        {account.isMain
                          ? "Conta principal usada para autenticação"
                          : "Conta secundária conectada"}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="h-3 w-3 mr-1" /> Ativo
                        </Badge>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToDashboard(account.providerAccountId);
                        }}
                      >
                        Gerenciar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDisconnectAccount(account.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              ))}

              {/* Card para adicionar nova conta */}
              <div onClick={handleInstagramConnect} className="cursor-pointer">
                <Card className="h-full border-dashed hover:border-primary hover:shadow-md transition-all flex flex-col items-center justify-center py-8">
                  <div className="rounded-full bg-primary/10 p-4 mb-4">
                    <Plus className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-medium mb-1">Adicionar Nova Conta</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-[200px]">
                    Conecte outra conta do Instagram
                  </p>
                </Card>
              </div>
            </div>
          </div>
        )}

        {connectionError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-400">{connectionError}</p>
          </div>
        )}

        {/* Seção de plataformas disponíveis */}
        <Card className="border-2 border-primary/10">
          <CardHeader>
            <CardTitle>Plataformas Disponíveis</CardTitle>
            <CardDescription>
              Escolha a rede social que deseja conectar à sua conta ChatWit Social
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Instagram - Disponível */}
              <div
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  selectedPlatform === "instagram"
                    ? "border-pink-500 bg-pink-50 dark:bg-pink-950/20"
                    : "border-border hover:border-pink-300"
                }`}
                onClick={() => setSelectedPlatform("instagram")}
              >
                <div className="flex flex-col items-center text-center">
                  <Instagram className="h-10 w-10 text-pink-500 mb-2" />
                  <h3 className="font-medium">Instagram</h3>
                  <p className="text-xs text-muted-foreground mt-1">Disponível</p>
                </div>
              </div>

              {/* Facebook - Em breve */}
              <div className="p-4 rounded-lg border-2 border-border opacity-70 cursor-not-allowed">
                <div className="flex flex-col items-center text-center">
                  <Facebook className="h-10 w-10 text-blue-500 mb-2" />
                  <h3 className="font-medium">Facebook</h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mt-1">Em breve</span>
                </div>
              </div>

              {/* WhatsApp - Em breve */}
              <div className="p-4 rounded-lg border-2 border-border opacity-70 cursor-not-allowed">
                <div className="flex flex-col items-center text-center">
                  <MessageSquare className="h-10 w-10 text-green-500 mb-2" />
                  <h3 className="font-medium">WhatsApp</h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mt-1">Em breve</span>
                </div>
              </div>

              {/* TikTok - Em breve */}
              <div className="p-4 rounded-lg border-2 border-border opacity-70 cursor-not-allowed">
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 flex items-center justify-center mb-2">
                    <Image src="/tiktok-icon.svg" alt="TikTok" width={32} height={32} />
                  </div>
                  <h3 className="font-medium">TikTok</h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mt-1">Em breve</span>
                </div>
              </div>

              {/* Telegram - Em breve */}
              <div className="p-4 rounded-lg border-2 border-border opacity-70 cursor-not-allowed">
                <div className="flex flex-col items-center text-center">
                  <Send className="h-10 w-10 text-blue-400 mb-2" />
                  <h3 className="font-medium">Telegram</h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mt-1">Em breve</span>
                </div>
              </div>

              {/* Messenger - Em breve */}
              <div className="p-4 rounded-lg border-2 border-border opacity-70 cursor-not-allowed">
                <div className="flex flex-col items-center text-center">
                  <div className="h-10 w-10 flex items-center justify-center mb-2">
                    <Image src="/messenger-icon.svg" alt="Messenger" width={32} height={32} />
                  </div>
                  <h3 className="font-medium">Messenger</h3>
                  <span className="text-xs bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full mt-1">Em breve</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start space-y-4">
            <Button
              size="lg"
              className="w-full md:w-auto"
              onClick={handleInstagramConnect}
              disabled={selectedPlatform !== "instagram" || isConnecting}
            >
              <Plus className="mr-2 h-4 w-4" />
              {isConnecting ? "Conectando..." : connectedAccounts.length > 0
                ? "Adicionar nova conta do Instagram"
                : "Conectar ao Instagram"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Ao conectar sua conta, você concorda com nossos{" "}
              <Link href="/termos" className="text-primary hover:underline">
                Termos de Serviço
              </Link>{" "}
              e{" "}
              <Link href="/privacidade" className="text-primary hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </CardFooter>
        </Card>

        {/* Seção de benefícios */}
        <div className="mt-10">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-2">Por que usar o ChatWit Social?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nossa plataforma oferece ferramentas poderosas para automatizar e otimizar sua presença nas redes sociais
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2">
                  <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle>Automação Inteligente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Automatize respostas a mensagens e comentários com chatbots inteligentes treinados para sua marca.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2">
                  <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle>Engajamento Eficiente</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Aumente o engajamento com seus seguidores através de respostas rápidas e personalizadas.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-2">
                  <Calendar className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle>Agendamento de Conteúdo</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Programe suas publicações para serem postadas automaticamente nos melhores horários para seu público.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-2">
                  <BarChart className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
                <CardTitle>Análise de Desempenho</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Acompanhe métricas detalhadas e obtenha insights valiosos para otimizar sua estratégia de conteúdo.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Seção de estatísticas */}
        <div className="mt-16 py-10 px-8 bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl text-white">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Impulsione seus resultados</h2>
            <p className="max-w-2xl mx-auto opacity-90">
              Veja o que o ChatWit Social pode fazer pela sua presença digital
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-4xl font-bold mb-2">85%</p>
              <p className="text-sm opacity-90">Aumento médio no tempo de resposta</p>
            </div>

            <div className="text-center">
              <p className="text-4xl font-bold mb-2">3.2x</p>
              <p className="text-sm opacity-90">Mais engajamento com seguidores</p>
            </div>

            <div className="text-center">
              <p className="text-4xl font-bold mb-2">67%</p>
              <p className="text-sm opacity-90">Redução no tempo de gerenciamento</p>
            </div>

            <div className="text-center">
              <p className="text-4xl font-bold mb-2">24/7</p>
              <p className="text-sm opacity-90">Disponibilidade para seus seguidores</p>
            </div>
          </div>
        </div>

        {/* Seção de depoimentos */}
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-xl p-8 mt-10">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">O que nossos usuários dizem</h2>
            <p className="text-muted-foreground">Depoimentos de quem já está usando o ChatWit Social</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-white dark:bg-background">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <span className="font-bold text-blue-600">M</span>
                  </div>
                  <div>
                    <p className="font-medium">Maria Silva</p>
                    <p className="text-sm text-muted-foreground">@mariaempreendedora</p>
                  </div>
                </div>
                <p className="italic">
                  "O ChatWit Social revolucionou minha presença no Instagram. Consigo responder a todos os comentários e mensagens em tempo recorde!"
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-background">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <span className="font-bold text-green-600">J</span>
                  </div>
                  <div>
                    <p className="font-medium">João Mendes</p>
                    <p className="text-sm text-muted-foreground">@joaofotografia</p>
                  </div>
                </div>
                <p className="italic">
                  "A automação de respostas me ajudou a converter mais seguidores em clientes. Meu engajamento aumentou 200% em apenas um mês!"
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-background">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <span className="font-bold text-purple-600">C</span>
                  </div>
                  <div>
                    <p className="font-medium">Carolina Alves</p>
                    <p className="text-sm text-muted-foreground">@carolinafitness</p>
                  </div>
                </div>
                <p className="italic">
                  "As análises detalhadas me ajudaram a entender melhor meu público. Agora sei exatamente que tipo de conteúdo gera mais engajamento."
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Seção com a imagem WitdeT */}
        <div className="mt-10 bg-white dark:bg-gray-900 rounded-xl overflow-hidden shadow-lg">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="p-8 flex flex-col justify-center">
              <h2 className="text-2xl font-bold mb-4">Tecnologia WitDev para sua marca</h2>
              <p className="text-muted-foreground mb-6">
                Nossa plataforma utiliza tecnologia avançada para garantir que sua presença nas redes sociais seja otimizada e eficiente.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full mr-3 mt-0.5">
                    <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Inteligência Artificial Avançada</p>
                    <p className="text-sm text-muted-foreground">Algoritmos treinados para entender o contexto das conversas e fornecer respostas precisas.</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full mr-3 mt-0.5">
                    <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Integração Perfeita</p>
                    <p className="text-sm text-muted-foreground">Conecte-se com múltiplas plataformas e gerencie tudo em um único lugar.</p>
                  </div>
                </li>
                <li className="flex items-start">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-full mr-3 mt-0.5">
                    <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium">Segurança de Dados</p>
                    <p className="text-sm text-muted-foreground">Proteção avançada para garantir que seus dados e os de seus seguidores estejam sempre seguros.</p>
                  </div>
                </li>
              </ul>
            </div>
            <div className="flex items-center justify-center bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-8">
              <Image
                src="/01 WitdeT.png"
                alt="WitDev Technology"
                width={400}
                height={400}
                className="object-contain max-h-[400px]"
              />
            </div>
          </div>
        </div>

        {/* Seção final com CTA */}
        <div className="text-center mt-10">
          <div className="mb-6">
            <Image src="/ChatWit.svg" alt="ChatWit Logo" width={150} height={150} className="mx-auto" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Pronto para transformar sua presença nas redes sociais?</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
            Conecte sua primeira conta agora e comece a aproveitar todos os benefícios da automação inteligente
          </p>
          <Button size="lg" onClick={handleInstagramConnect} className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600">
            <Instagram className="mr-2 h-5 w-5" />
            Conectar Instagram
          </Button>
        </div>
      </div>
    </>
  );
}
