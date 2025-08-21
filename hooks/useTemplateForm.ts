import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import axios from 'axios';
import { arrayMove } from '@dnd-kit/sortable';
import type { MetaMediaFile } from '@/components/custom/MetaMediaUpload';
import { extractVariables } from '@/lib/whatsapp/variable-utils';

// Definição de tipos para o estado do formulário
export interface TemplateFormState {
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  allowCategoryChange: boolean;
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText: string;
  headerExample: string;
  headerMetaMedia: MetaMediaFile[];
  headerNamedExamples?: Record<string, string>;
  bodyText: string;
    bodyExamples: string[];
    bodyNamedExamples?: Record<string, string>;
  footerText: string;
  buttons: any[];
}

// Hook customizado para gerenciar o estado e a lógica do formulário de template
export const useTemplateForm = (initialState: TemplateFormState, onSuccessCallback?: () => void) => {
  const router = useRouter();
  const [state, setState] = useState<TemplateFormState>(initialState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [templateId, setTemplateId] = useState<string>('');

  // Lógica de validação
  const isValidName = useMemo(() => /^[a-z0-9_]{1,512}$/.test(state.name), [state.name]);
  const isValidHeaderText = useMemo(() => {
    if (state.headerType !== 'TEXT') return true;
    const lenOk = state.headerText.length > 0 && state.headerText.length <= 60;
    const varCount = extractVariables(state.headerText).length;
    const metaLimitOk = varCount <= 1; // Meta permite apenas 1 variável no HEADER de texto
    return lenOk && metaLimitOk;
  }, [state.headerType, state.headerText]);
  const isValidBodyText = useMemo(() => state.bodyText.length > 0 && state.bodyText.length <= 1024, [state.bodyText]);
  const isValidFooterText = useMemo(() => state.footerText.length <= 60, [state.footerText]);
  const isValidHeaderMedia = useMemo(() => {
    if (state.headerType === 'VIDEO' || state.headerType === 'IMAGE') {
      return state.headerMetaMedia.length > 0 && state.headerMetaMedia[0]?.status === 'success' && !!state.headerMetaMedia[0]?.mediaHandle;
    }
    return true;
  }, [state.headerType, state.headerMetaMedia]);

  const isFormValid = useMemo(() => 
    isValidName && isValidHeaderText && isValidBodyText && isValidFooterText && isValidHeaderMedia && state.bodyText.trim() !== '',
    [isValidName, isValidHeaderText, isValidBodyText, isValidFooterText, isValidHeaderMedia, state.bodyText]
  );

  // Funções de manipulação de estado
  const handleStateChange = <T extends keyof TemplateFormState>(field: T, value: TemplateFormState[T]) => {
    setState(prevState => ({ ...prevState, [field]: value }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/\s+/g, '_');
    handleStateChange('name', value);
  };

  // Funções de manipulação de botões
  const generateButtonId = () => `btn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const addButton = (type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'FLOW') => {
    const newButtons = [...state.buttons];
    const countType = (t: string) => newButtons.filter(b => b.type === t).length;

    if (newButtons.length >= 10) {
      toast.error('Limite de botões', { description: 'Você pode adicionar no máximo 10 botões.' });
      return;
    }

    let buttonToAdd;
    switch (type) {
      case 'QUICK_REPLY':
        if (countType('QUICK_REPLY') >= 10) {
          toast.error('Limite de botões', { description: 'Máximo de 10 botões de resposta rápida em templates.' });
          return;
        }
        buttonToAdd = { id: generateButtonId(), type: 'QUICK_REPLY', text: `Botão ${countType('QUICK_REPLY') + 1}` };
        break;
      case 'URL':
        if (countType('URL') >= 2) {
          toast.error('Limite de botões', { description: 'Máximo de 2 botões de URL.' });
          return;
        }
        buttonToAdd = { id: generateButtonId(), type: 'URL', text: 'Acessar o site', url: 'https://exemplo.com' };
        break;
      // Adicionar outros tipos de botão aqui
    }

    if (buttonToAdd) {
      handleStateChange('buttons', [...newButtons, buttonToAdd]);
    }
  };

  const removeButton = (index: number) => {
    handleStateChange('buttons', state.buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, field: string, value: string) => {
    const newButtons = [...state.buttons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    handleStateChange('buttons', newButtons);
  };

  const onDragEndButtons = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = state.buttons.findIndex(b => b.id === active.id);
    const newIndex = state.buttons.findIndex(b => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      handleStateChange('buttons', arrayMove(state.buttons, oldIndex, newIndex));
    }
  };

  // Efeitos
  useEffect(() => {
    try {
      const savedMedia = localStorage.getItem('headerMetaMedia');
      if (savedMedia) {
        handleStateChange('headerMetaMedia', JSON.parse(savedMedia));
      }
    } catch (err) {
      console.error('Erro ao carregar mídia do localStorage:', err);
    }

    return () => {
      try {
        localStorage.removeItem('headerMetaMedia');
      } catch (err) {
        console.error('Erro ao remover mídia do localStorage:', err);
      }
    };
  }, []);

  useEffect(() => {
    if (state.headerMetaMedia.length > 0) {
      try {
        localStorage.setItem('headerMetaMedia', JSON.stringify(state.headerMetaMedia));
      } catch (err) {
        console.error('Erro ao salvar mídia em localStorage:', err);
      }
    }
  }, [state.headerMetaMedia]);

  // Submissão do formulário
  const createTemplate = async () => {
    if (!isFormValid) {
      toast.error('Formulário inválido', { description: 'Verifique os campos obrigatórios.' });
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Construir payload de componentes conforme documentação Meta
      const components: Array<Record<string, unknown>> = [];

      // HEADER
      if (state.headerType && state.headerType !== 'NONE') {
        if (state.headerType === 'TEXT') {
          const rawHeaderVars = extractVariables(state.headerText);
          const headerVars = rawHeaderVars.map(v => v.replace(/\{\{|\}\}/g, ''));

          const headerComponent: any = {
            type: 'HEADER',
            format: 'TEXT',
            text: state.headerText,
          };

          if (headerVars.length > 0) {
            // Sempre usar NAMED_PARAMS no cabeçalho
            const headerNamedParams = headerVars.map((name) => ({
              param_name: name,
              example: (state.headerNamedExamples && state.headerNamedExamples[name]) || state.headerExample || '',
            }));
            headerComponent.example = { header_text_named_params: headerNamedParams };
          }

          components.push(headerComponent);
        } else {
          const media = state.headerMetaMedia?.[0];
          if (media?.mediaHandle) {
            const headerComponent: any = {
              type: 'HEADER',
              format: state.headerType, // IMAGE | VIDEO | DOCUMENT
              example: {
                header_handle: [media.mediaHandle],
                _minioUrl: media.url,
              },
            };
            components.push(headerComponent);
          }
        }
      }

      // BODY (obrigatório)
      const rawBodyVars = extractVariables(state.bodyText);
      const bodyVars = rawBodyVars.map(v => v.replace(/\{\{|\}\}/g, ''));
      const bodyNamedParams = bodyVars.length > 0
        ? bodyVars.map((name) => ({
            param_name: name,
            example: (state.bodyNamedExamples && state.bodyNamedExamples[name]) || '',
          }))
        : undefined;
      const bodyComponent: any = {
        type: 'BODY',
        text: state.bodyText,
      };
      if (bodyNamedParams) {
        bodyComponent.example = { body_text_named_params: bodyNamedParams };
      }
      components.push(bodyComponent);

      // FOOTER (opcional)
      if (state.footerText && state.footerText.trim().length > 0) {
        components.push({ type: 'FOOTER', text: state.footerText });
      }

      // BUTTONS (opcional)
      if (Array.isArray(state.buttons) && state.buttons.length > 0) {
        const buttons = state.buttons.map((b: any) => {
          switch (b.type) {
            case 'QUICK_REPLY':
              return { type: 'QUICK_REPLY', text: b.text };
            case 'URL': {
              const btn: any = { type: 'URL', text: b.text, url: b.url };
              return btn;
            }
            case 'PHONE_NUMBER':
              return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phone_number };
            case 'COPY_CODE':
              return { type: 'COPY_CODE', text: b.text || 'Copiar código da oferta', example: [b.example?.[0] || ''] };
            case 'FLOW': {
              const btn: any = { type: 'FLOW', text: b.text };
              if (b.flow_id) btn.flow_id = b.flow_id;
              if (b.flow_name) btn.flow_name = b.flow_name;
              return btn;
            }
            default:
              return null;
          }
        }).filter(Boolean);

        if (buttons.length > 0) {
          components.push({ type: 'BUTTONS', buttons });
        }
      }

      const payload = { name: state.name, category: state.category, language: state.language, components };

      const response = await axios.post('/api/admin/mtf-diamante/templates', payload);

      if (response.data.success) {
        setCreationSuccess(true);
        setTemplateId(response.data.templateId || response.data.id);
        toast.success('Template criado com sucesso!');
        await axios.get('/api/admin/mtf-diamante/templates?refresh=true');
        
        if (onSuccessCallback) {
          setTimeout(() => onSuccessCallback(), 1500);
        } else {
          setTimeout(() => router.push('/admin/mtf-diamante?tab=templates'), 1500);
        }
      } else {
        setError(response.data.error || 'Erro ao criar template');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ocorreu um erro.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    state,
    isSubmitting,
    error,
    creationSuccess,
    templateId,
    isValidName,
    isFormValid,
    handleStateChange,
    handleNameChange,
    addButton,
    removeButton,
    updateButton,
    onDragEndButtons,
    createTemplate,
  };
};
