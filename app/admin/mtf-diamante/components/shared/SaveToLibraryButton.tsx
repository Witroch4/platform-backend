'use client';

import type React from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Library, Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { TemplateLibraryService } from '@/app/lib/template-library-service';

interface SaveToLibraryButtonProps {
  templateData: {
    name: string;
    category: string;
    language: string;
    headerType: string;
    headerText: string;
    bodyText: string;
    footerText: string;
    buttons: any[];
    headerMetaMedia: any[];
  };
  disabled?: boolean;
  messageType?: 'template' | 'interactive_message';
}

export const SaveToLibraryButton: React.FC<SaveToLibraryButtonProps> = ({
  templateData,
  disabled = false,
  messageType = 'template'
}) => {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = session?.user?.role === 'SUPERADMIN';

  // Only show button for SUPERADMIN users
  if (!isSuperAdmin) {
    return null;
  }

  const handleSaveToLibrary = async () => {
    if (!session?.user?.id) {
      toast.error('Você deve estar logado para salvar na biblioteca');
      return;
    }

    if (!templateData.name || !templateData.bodyText) {
      toast.error('Nome e texto do corpo são obrigatórios');
      return;
    }

    try {
      setSaving(true);
      
      // Extract variables from all text fields
      const allText = [
        templateData.headerText,
        templateData.bodyText,
        templateData.footerText
      ].filter(Boolean).join(' ');
      
      const variableMatches = allText.match(/\{\{([^}]+)\}\}/g) || [];
      const extractedVariables = [...new Set(variableMatches.map(match => match.slice(2, -2)))];

      // Prepare content based on message type
      const content = {
        header: templateData.headerText || undefined,
        body: templateData.bodyText,
        footer: templateData.footerText || undefined,
        variables: extractedVariables,
        mediaUrl: templateData.headerMetaMedia?.[0]?.url,
        mediaType: templateData.headerType !== 'TEXT' && templateData.headerType !== 'NONE' 
          ? templateData.headerType.toLowerCase() 
          : undefined,
        buttons: templateData.buttons?.map(btn => ({
          type: btn.type,
          text: btn.text,
          url: btn.url,
          phone_number: btn.phone_number,
          code_example: btn.code_example
        }))
      };

      const libraryData: CreateTemplateLibraryData = {
        name: templateData.name,
        description: `${messageType === 'template' ? 'Template' : 'Mensagem interativa'} criado via interface`,
        type: messageType === 'template' ? 'WHATSAPP_OFFICIAL' : 'INTERACTIVE_MESSAGE',
        scope: 'GLOBAL',
        content,
        language: templateData.language || 'pt_BR',
        tags: [messageType, templateData.category?.toLowerCase() || 'utility'],
        createdById: session.user.id,
      };

      await TemplateLibraryService.saveToLibrary(libraryData);
      toast.success(`${messageType === 'template' ? 'Template' : 'Mensagem interativa'} salvo na biblioteca com sucesso!`);
    } catch (error) {
      console.error('Erro ao salvar na biblioteca:', error);
      toast.error('Falha ao salvar na biblioteca');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleSaveToLibrary}
      disabled={disabled || saving}
      className="flex items-center gap-2"
    >
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Library className="h-4 w-4" />
      )}
      {saving ? 'Salvando...' : 'Salvar na Biblioteca'}
    </Button>
  );
};