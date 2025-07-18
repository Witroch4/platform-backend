'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export function DisparoMensagemDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled>
          Disparar Mensagem
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Funcionalidade em desenvolvimento</DialogTitle>
        </DialogHeader>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Em breve!</AlertTitle>
          <AlertDescription>
            O disparo de mensagens por este modal ainda não está implementado.<br />
            Utilize as opções de teste individual ou envio em massa na tela de detalhes do template.
          </AlertDescription>
        </Alert>
      </DialogContent>
    </Dialog>
  );
}