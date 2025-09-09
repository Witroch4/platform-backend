import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Settings, BarChart3 } from "lucide-react";
import { toast } from "sonner";

interface InboxContextMenuProps {
  children: React.ReactNode;
  inbox: {
    id: string;
    nome: string;
    inboxName?: string;
    channelType: string;
  };
  onInboxDeleted?: () => void;
}

export function InboxContextMenu({ children, inbox, onInboxDeleted }: InboxContextMenuProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    
    const deletePromise = fetch(`/api/admin/mtf-diamante/dialogflow/caixas?id=${inbox.id}`, {
      method: 'DELETE',
    }).then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao excluir caixa');
      }
      return response.json();
    });

    toast.promise(deletePromise, {
      loading: "Excluindo caixa...",
      success: (data) => {
        setShowDeleteDialog(false);
        setIsDeleting(false);
        onInboxDeleted?.();
        return "Caixa excluída com sucesso";
      },
      error: (error) => {
        setIsDeleting(false);
        return error.message || "Erro ao excluir caixa";
      },
    });
  };

  const inboxName = inbox.nome || inbox.inboxName || 'Inbox';

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="w-full">
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            onClick={() => handleNavigate(`/admin/mtf-diamante/inbox/${inbox.id}?tab=configuracoes`)}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            Configurações
          </ContextMenuItem>
          
          <ContextMenuItem
            onClick={() => handleNavigate(`/admin/mtf-diamante/inbox/${inbox.id}?tab=metricas`)}
            className="flex items-center gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Métricas
          </ContextMenuItem>
          
          <ContextMenuItem
            onClick={handleDeleteClick}
            className="flex items-center gap-2 text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Excluir caixa
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir caixa de entrada</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a caixa "{inboxName}"? 
              <br /><br />
              <strong>Esta ação não pode ser desfeita</strong> e todos os dados relacionados serão removidos:
              <br />
              • Agentes configurados
              <br />
              • Templates de mensagens
              <br />
              • Mapeamentos de intenções
              <br />
              • Histórico de conversas
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={isDeleting} onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              variant="destructive"
            >
              {isDeleting ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
