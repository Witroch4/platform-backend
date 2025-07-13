"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, Copy, ExternalLink, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";

interface RegisterApiKeyDialogProps {
  trigger?: React.ReactNode;
  userHasToken?: boolean;
  onTokenRegistered?: () => void;
  initialToken?: string;
  initialAccountId?: string;
}

export function RegisterApiKeyDialog({ 
  trigger, 
  userHasToken = false,
  onTokenRegistered,
  initialToken = "",
  initialAccountId = ""
}: RegisterApiKeyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState(initialToken);
  const [accountId, setAccountId] = useState(initialAccountId);
  const [isLoading, setIsLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Preencher os campos ao abrir o dialog, usando props se existirem
  useEffect(() => {
    if (isOpen) {
      // Apenas atualiza o estado interno do dialog com os valores
      // que vieram da página principal. Sem chamadas de API!
      setToken(initialToken || "");
      setAccountId(initialAccountId || "");
    }
  }, [isOpen, initialToken, initialAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      toast.error("Token não pode estar vazio");
      return;
    }

    if (!accountId.trim()) {
      toast.error("ID da conta não pode estar vazio");
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/admin/leads-chatwit/register-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          chatwitAccessToken: token.trim(),
          chatwitAccountId: accountId.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        setToken("");
        setAccountId("");
        setIsOpen(false);
        onTokenRegistered?.();
      } else {
        toast.error(data.error || "Erro ao registrar token");
      }
    } catch (error) {
      console.error("Erro ao registrar token:", error);
      toast.error("Erro interno. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const defaultTrigger = (
    <Button variant={userHasToken ? "outline" : "default"} className="gap-2">
      <Key className="h-4 w-4" />
      {userHasToken ? "Atualizar API Key" : "Cadastrar API Key"}
    </Button>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {userHasToken ? "Atualizar" : "Cadastrar"} Token de Acesso do Chatwit
          </DialogTitle>
          <DialogDescription>
            Configure seu token de acesso e ID da conta para visualizar apenas seus leads do Chatwit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Instruções */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Como obter seu token
              </CardTitle>
              <CardDescription>
                Siga os passos abaixo para obter seu token de acesso:
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="min-w-6 h-6 flex items-center justify-center text-xs">
                  1
                </Badge>
                <div>
                  <p className="text-sm">
                    Acesse sua conta no Chatwit e observe o ID na URL:{" "}
                    <a 
                      href="https://chatwit.witdev.com.br/app/accounts/3" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      https://chatwit.witdev.com.br/app/accounts/<strong>3</strong>
                    </a>
                    <br />
                    <span className="text-xs text-muted-foreground">
                      O número após "/accounts/" é o ID da sua conta (exemplo: 3)
                    </span>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="min-w-6 h-6 flex items-center justify-center text-xs">
                  2
                </Badge>
                <div>
                  <p className="text-sm">
                    Acesse as configurações do perfil e procure pela seção "Token de acesso"
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="min-w-6 h-6 flex items-center justify-center text-xs">
                  3
                </Badge>
                <div>
                  <p className="text-sm">
                    Clique no botão "Copiar" ao lado do token
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="min-w-6 h-6 flex items-center justify-center text-xs">
                  4
                </Badge>
                <div>
                  <p className="text-sm">
                    Cole o token e o ID da conta nos campos abaixo e clique em "Registrar"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accountId">ID da Conta Chatwit</Label>
              <Input
                id="accountId"
                type="text"
                placeholder="Ex: 3"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Encontre o ID na URL do Chatwit: https://chatwit.witdev.com.br/app/accounts/<strong>3</strong>
              </p>
              {!!accountId && (
                <span className="text-green-600 text-xs block mt-1">✓ ID configurado: {accountId}</span>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="token">Token de Acesso do Chatwit</Label>
              <div className="flex items-center gap-2 mt-2">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  placeholder="Cole seu token aqui (ex: XzqGPinpcBhwkfyyjuyShBgD)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono pr-10 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      setToken(text);
                      toast.success("Token colado da área de transferência");
                    } catch (error) {
                      toast.error("Não foi possível colar da área de transferência");
                    }
                  }}
                  className="shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                O token deve ter exatamente 24 caracteres alfanuméricos
              </p>
            </div>

            {/* Status atual */}
            {userHasToken && (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-700 dark:text-green-400">
                  Você já possui um token registrado. Inserir um novo token irá substituir o atual.
                </span>
              </div>
            )}

            {!userHasToken && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-700 dark:text-amber-400">
                  Você precisa registrar um token para visualizar seus leads do Chatwit.
                </span>
              </div>
            )}
          </form>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancelar
          </Button>
          <Button 
            type="submit" 
            onClick={handleSubmit}
            disabled={isLoading || !token.trim() || !accountId.trim()}
          >
            {isLoading ? "Registrando..." : userHasToken ? "Atualizar Token" : "Registrar Token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 