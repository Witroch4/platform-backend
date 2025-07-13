"use client";

import { useState } from "react";
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
}

export function RegisterApiKeyDialog({ 
  trigger, 
  userHasToken = false,
  onTokenRegistered 
}: RegisterApiKeyDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token.trim()) {
      toast.error("Token não pode estar vazio");
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/admin/leads-chatwit/register-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chatwitAccessToken: token.trim() }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(data.message);
        setToken("");
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
            Configure seu token de acesso para visualizar apenas seus leads do Chatwit
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
                    Acesse sua conta no Chatwit em:{" "}
                    <a 
                      href="https://chatwit.witdev.com.br/app/accounts/3/profile/settings" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Configurações do Perfil
                    </a>
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="min-w-6 h-6 flex items-center justify-center text-xs">
                  2
                </Badge>
                <div>
                  <p className="text-sm">
                    Procure pela seção "Token de acesso" na página
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
                    Cole o token no campo abaixo e clique em "Registrar"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Token de Acesso do Chatwit</Label>
              <div className="relative w-full">
                <Input
                  id="token"
                  type={showToken ? "text" : "password"}
                  placeholder="Cole seu token aqui (ex: XzqGPinpcBhwkfyyjuyShBgD)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  tabIndex={-1}
                  aria-label={showToken ? "Ocultar token" : "Exibir token"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                  style={{ background: "none", border: "none" }}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex gap-2 mt-2">
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
            disabled={isLoading || !token.trim()}
          >
            {isLoading ? "Registrando..." : userHasToken ? "Atualizar Token" : "Registrar Token"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 