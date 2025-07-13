'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Bell, CheckCircle, Zap, List, Eye, EyeOff, Search, X, Filter } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import AutoNotifications from './auto-notifications';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

type ActiveTabType = 'manual' | 'auto' | 'list';

const AdminNotificationsPage = () => {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTabType>('manual');
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [searchNotificationTerm, setSearchNotificationTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'read' | 'unread'>('all');

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (status === 'loading') return;

      if (!session?.user) {
        toast.error("Acesso negado", { description: "Você precisa estar logado para acessar esta página",
         });
        router.push('/auth/login');
        return;
      }

      try {
        setLoading(true);
        const response = await fetch('/api/admin/notifications');

        if (response.status === 403) {
          toast.error("Acesso negado", { description: "Você não tem permissão para acessar esta página.",
           });
          router.push('/');
          return;
        }

        if (response.ok) {
          const data = await response.json();
          setUsers(data);
          toast("Usuários carregados", {
            description: `${data.length} usuários carregados com sucesso`,
          });
        } else {
          toast.error("Erro", { description: "Erro ao carregar usuários",
           });
        }
      } catch (error) {
        console.error('Erro ao verificar acesso de administrador:', error);
        toast.error("Erro", { description: "Erro ao verificar permissões",
         });
      } finally {
        setLoading(false);
      }
    };

    checkAdminAccess();
  }, [session, status, router, toast]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchAllNotifications();
    }
  }, [activeTab]);

  const fetchUsers = async () => {
    try {
      setRefreshing(true);

      toast("Atualizando", { description: "Atualizando lista de usuários..."  });

      const response = await fetch('/api/admin/notifications');

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
        toast("Usuários atualizados", {
          description: `${data.length} usuários carregados com sucesso`,
        });
      } else {
        toast.error("Erro", { description: "Erro ao carregar usuários",
         });
      }
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      toast.error("Erro", { description: "Erro ao carregar usuários",
       });
    } finally {
      setRefreshing(false);
    }
  };

  const fetchAllNotifications = async () => {
    try {
      setLoadingNotifications(true);

      toast("Carregando notificações", { description: "Buscando todas as notificações..."  });

      const response = await fetch('/api/admin/notifications/all');

      if (response.ok) {
        const data = await response.json();
        setAllNotifications(data);
        toast("Notificações carregadas", {
          description: `${data.length} notificações carregadas com sucesso`,
        });
      } else {
        toast.error("Erro", { description: "Erro ao carregar notificações",
         });
      }
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      toast.error("Erro", { description: "Erro ao carregar notificações",
       });
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleToggleNotificationStatus = async (notificationId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/notifications/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notificationId,
          isRead: !currentStatus
        }),
      });

      if (response.ok) {
        // Atualizar o estado local
        setAllNotifications(prev =>
          prev.map(notification =>
            notification.id === notificationId
              ? { ...notification, isRead: !currentStatus }
              : notification
          )
        );

        toast("Status atualizado", {
          description: `Notificação marcada como ${!currentStatus ? 'lida' : 'não lida'}`,
        });
      } else {
        toast.error("Erro", { description: "Erro ao atualizar status da notificação",
         });
      }
    } catch (error) {
      console.error('Erro ao atualizar status da notificação:', error);
      toast.error("Erro", { description: "Erro ao atualizar status da notificação",
       });
    }
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(users.map(user => user.id));
    }
    setSelectAll(!selectAll);
  };

  const handleUserSelect = (userId: string) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
      setSelectAll(false);
    } else {
      const newSelectedUsers = [...selectedUsers, userId];
      setSelectedUsers(newSelectedUsers);
      setSelectAll(newSelectedUsers.length === users.length);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedUsers.length === 0) {
      toast.error("Seleção necessária", { description: "Selecione pelo menos um usuário para enviar a notificação."  });
      return;
    }

    if (!title.trim() || !message.trim()) {
      toast.error("Campos obrigatórios", { description: "Preencha o título e a mensagem da notificação."  });
      return;
    }

    try {
      setSending(true);

      toast("Enviando", { description: "Enviando notificação..."  });

      const response = await fetch('/api/admin/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds: selectedUsers,
          title: title.trim(),
          message: message.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast("Notificação enviada", {
          description: `Notificação enviada com sucesso para ${data.sentCount} usuário(s)`,
        });
        
        // Reset form
        setTitle('');
        setMessage('');
        setSelectedUsers([]);
        setSelectAll(false);
      } else {
        const data = await response.json();
        toast.error("Erro", { description: data.error || "Erro ao enviar notificação",
         });
      }
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
      toast.error("Erro", { description: "Erro ao enviar notificação",
       });
    } finally {
      setSending(false);
    }
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const filteredNotifications = allNotifications
    .filter(notification => {
      // Filtrar por termo de busca
      const searchMatch =
        notification.title.toLowerCase().includes(searchNotificationTerm.toLowerCase()) ||
        notification.message.toLowerCase().includes(searchNotificationTerm.toLowerCase()) ||
        notification.user.name?.toLowerCase().includes(searchNotificationTerm.toLowerCase()) ||
        notification.user.email.toLowerCase().includes(searchNotificationTerm.toLowerCase());

      // Filtrar por status
      const statusMatch =
        filterStatus === 'all' ||
        (filterStatus === 'read' && notification.isRead) ||
        (filterStatus === 'unread' && !notification.isRead);

      return searchMatch && statusMatch;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-10 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-foreground">Painel de Notificações</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={activeTab === 'list' ? fetchAllNotifications : fetchUsers}
            disabled={refreshing || loadingNotifications}
            className="border-border hover:bg-accent"
          >
            {(refreshing || loadingNotifications) ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {activeTab === 'list' ? 'Atualizar Notificações' : 'Atualizar Usuários'}
              </>
            )}
          </Button>
        </div>

        <div className="mb-6">
          <div className="flex space-x-2 bg-muted p-1 rounded-md border border-border">
            <Button
              variant={activeTab === 'manual' ? 'default' : 'ghost'}
              className="flex-1 flex items-center justify-center"
              onClick={() => setActiveTab('manual')}
            >
              <Bell className="h-4 w-4 mr-2" />
              Notificações Manuais
            </Button>
            <Button
              variant={activeTab === 'auto' ? 'default' : 'ghost'}
              className="flex-1 flex items-center justify-center"
              onClick={() => setActiveTab('auto')}
            >
              <Zap className="h-4 w-4 mr-2" />
              Notificações Automáticas
            </Button>
            <Button
              variant={activeTab === 'list' ? 'default' : 'ghost'}
              className="flex-1 flex items-center justify-center"
              onClick={() => setActiveTab('list')}
            >
              <List className="h-4 w-4 mr-2" />
              Listar Notificações
            </Button>
          </div>
        </div>

        {activeTab === 'manual' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-card-foreground">
                    <span>Usuários</span>
                    <Badge variant="outline" className="ml-2 border-border">
                      {users.length} total
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">Selecione os usuários para enviar notificações</CardDescription>
                </CardHeader>
                <CardContent className="max-h-[500px] overflow-y-auto">
                  <div className="flex items-center space-x-2 mb-4 pb-2 border-b border-border">
                    <Checkbox
                      id="select-all"
                      checked={selectAll}
                      onCheckedChange={handleSelectAll}
                      className="border-border"
                    />
                    <Label htmlFor="select-all" className="font-medium text-card-foreground">Selecionar todos</Label>
                  </div>
                  <div className="space-y-2">
                    {users.map(user => (
                      <div key={user.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                        <Checkbox
                          id={`user-${user.id}`}
                          checked={selectedUsers.includes(user.id)}
                          onCheckedChange={() => handleUserSelect(user.id)}
                          className="border-border"
                        />
                        <Label htmlFor={`user-${user.id}`} className="flex flex-col cursor-pointer w-full">
                          <span className="font-medium text-card-foreground">{user.name || 'Sem nome'}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </Label>
                        {user.role === "ADMIN" && (
                          <Badge variant="secondary" className="ml-auto text-xs border-border">Admin</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
                <CardFooter>
                  <div className="text-sm text-muted-foreground flex items-center">
                    <Bell className="h-4 w-4 mr-2 text-muted-foreground" />
                    {selectedUsers.length} usuário(s) selecionado(s)
                  </div>
                </CardFooter>
              </Card>
            </div>

            <div className="md:col-span-2">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Enviar Notificação</CardTitle>
                  <CardDescription className="text-muted-foreground">Preencha os campos abaixo para enviar uma notificação</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title" className="text-card-foreground">Título</Label>
                      <Input
                        id="title"
                        placeholder="Digite o título da notificação"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message" className="text-card-foreground">Mensagem</Label>
                      <Textarea
                        id="message"
                        placeholder="Digite a mensagem da notificação"
                        rows={5}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={sending || selectedUsers.length === 0}
                    >
                      {sending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Enviar Notificação para {selectedUsers.length} usuário(s)
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'auto' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-1">
              <AutoNotifications />
            </div>

            <div className="md:col-span-1">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center text-card-foreground">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Sobre Notificações Automáticas
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Informações sobre o sistema de notificações automáticas
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-medium mb-2 text-card-foreground">Boas-vindas ao Socialwise Chatwit</h3>
                    <p className="text-sm text-muted-foreground">
                      Envia uma mensagem de boas-vindas para todos os usuários do sistema, apresentando
                      a plataforma e suas principais funcionalidades.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2 text-card-foreground">Tokens expirando em 10 dias</h3>
                    <p className="text-sm text-muted-foreground">
                      Notifica usuários que possuem tokens do Instagram que expirarão em menos de 10 dias.
                      A notificação inclui o nome de usuário (@username) da conta afetada e instruções
                      para renovar o token fazendo login novamente.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-medium mb-2 text-card-foreground">Tokens expirando em 3 dias</h3>
                    <p className="text-sm text-muted-foreground">
                      Alerta urgente para usuários com tokens do Instagram expirando em menos de 3 dias.
                      Esta notificação tem caráter de urgência e alerta o usuário que suas automações
                      podem parar de funcionar caso o token não seja renovado.
                    </p>
                  </div>

                  <div className="bg-muted/30 p-3 rounded-md border border-border">
                    <h3 className="font-medium mb-2 text-card-foreground">Dica</h3>
                    <p className="text-sm text-muted-foreground">
                      Você pode configurar estas notificações para serem enviadas automaticamente
                      usando um agendador de tarefas (cron job) que execute diariamente.
                      Isso garantirá que os usuários sejam sempre notificados sobre tokens expirando.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'list' && (
          <div className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="flex items-center text-card-foreground">
                  <List className="h-5 w-5 mr-2" />
                  Todas as Notificações
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                  Visualize e gerencie todas as notificações enviadas aos usuários
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar notificações..."
                      className="pl-10 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                      value={searchNotificationTerm}
                      onChange={(e) => setSearchNotificationTerm(e.target.value)}
                    />
                    {searchNotificationTerm && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 hover:bg-accent"
                        onClick={() => setSearchNotificationTerm("")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="ml-2 border-border hover:bg-accent">
                        <Filter className="h-4 w-4 mr-2" />
                        {filterStatus === 'all' && 'Todas'}
                        {filterStatus === 'read' && 'Lidas'}
                        {filterStatus === 'unread' && 'Não lidas'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover border-border">
                      <DropdownMenuLabel className="text-popover-foreground">Filtrar por status</DropdownMenuLabel>
                      <DropdownMenuSeparator className="bg-border" />
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setFilterStatus('all')} className="text-popover-foreground hover:bg-accent">
                          Todas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus('read')} className="text-popover-foreground hover:bg-accent">
                          <Eye className="h-4 w-4 mr-2" />
                          Lidas
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setFilterStatus('unread')} className="text-popover-foreground hover:bg-accent">
                          <EyeOff className="h-4 w-4 mr-2" />
                          Não lidas
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {loadingNotifications ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    Nenhuma notificação encontrada
                  </div>
                ) : (
                  <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-4">
                      {filteredNotifications.map(notification => (
                        <div
                          key={notification.id}
                          className={`p-4 border border-border rounded-md transition-colors ${
                            notification.isRead
                              ? 'bg-card'
                              : 'bg-muted/30 border-primary/20'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h3 className="font-medium text-card-foreground">{notification.title}</h3>
                              <div className="flex items-center text-xs text-muted-foreground mt-1">
                                <span>Enviada em {formatDate(notification.createdAt)}</span>
                                <span className="mx-2">•</span>
                                <span>Para: {notification.user.name || notification.user.email}</span>
                              </div>
                            </div>
                            <div className="flex items-center">
                              <Badge
                                variant={notification.isRead ? "outline" : "default"}
                                className="ml-2 border-border"
                              >
                                {notification.isRead ? 'Lida' : 'Não lida'}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleNotificationStatus(notification.id, notification.isRead)}
                                title={notification.isRead ? "Marcar como não lida" : "Marcar como lida"}
                                className="hover:bg-accent"
                              >
                                {notification.isRead ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <p className="text-sm mt-2 text-card-foreground">{notification.message}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
              <CardFooter className="flex justify-between">
                <div className="text-sm text-muted-foreground">
                  {filteredNotifications.length} notificação(ões) encontrada(s)
                </div>
                <div className="flex space-x-2">
                  <Badge variant="outline" className="border-border">
                    {allNotifications.filter(n => n.isRead).length} lidas
                  </Badge>
                  <Badge variant="outline" className="border-border">
                    {allNotifications.filter(n => !n.isRead).length} não lidas
                  </Badge>
                </div>
              </CardFooter>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotificationsPage;