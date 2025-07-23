"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface InteractiveMessageTesterProps {
  messageId?: string;
  messageName: string;
  disabled?: boolean;
}

export const InteractiveMessageTester: React.FC<InteractiveMessageTesterProps> = ({
  messageId,
  messageName,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [sending, setSending] = useState(false);

  const handleSendTest = async () => {
    if (!messageId) {
      toast.error("Salve a mensagem antes de testar o envio");
      return;
    }

    if (!recipientPhone.trim()) {
      toast.error("Digite um número de telefone para teste");
      return;
    }

    // Validar formato do telefone (básico)
    const phoneRegex = /^\d{10,15}$/;
    const cleanPhone = recipientPhone.replace(/\D/g, '');
    
    if (!phoneRegex.test(cleanPhone)) {
      toast.error("Digite um número de telefone válido (apenas números, 10-15 dígitos)");
      return;
    }

    try {
      setSending(true);

      const response = await fetch('/api/admin/mtf-diamante/interactive-messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          recipientPhone: cleanPhone,
          caixaId: 'test_send'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao enviar mensagem');
      }

      const result = await response.json();
      console.log('Mensagem enviada:', result);

      toast.success(`Mensagem "${messageName}" enviada com sucesso!`, {
        description: `Enviada para: ${recipientPhone}`
      });

      setIsOpen(false);
      setRecipientPhone("");

    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      toast.error('Erro ao enviar mensagem', {
        description: error.message
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled || !messageId}
          className="flex items-center gap-2"
        >
          <Send className="h-4 w-4" />
          Testar Envio
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Testar Envio da Mensagem</DialogTitle>
          <DialogDescription>
            Envie a mensagem "{messageName}" para um número de teste
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número do WhatsApp (apenas números)</Label>
            <Input
              id="phone"
              placeholder="5511999999999"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              disabled={sending}
            />
            <p className="text-xs text-muted-foreground">
              Digite apenas números, incluindo código do país (ex: 5511999999999)
            </p>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={sending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSendTest}
              disabled={sending || !recipientPhone.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Teste
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};