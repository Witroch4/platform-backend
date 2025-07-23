"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ArrowLeft, Save, Plus, Trash, Copy, ExternalLink, BanIcon, PhoneCall, Check, AlertTriangle, Send, Phone } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";
import FileUpload, { UploadedFile } from "@/components/custom/FileUpload";
import MetaMediaUpload, { MetaMediaFile } from "@/components/custom/MetaMediaUpload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateTemplateComponent } from "../components/template-preview";
import { useMtfData } from "../../../context/MtfDataProvider";
import { EnhancedTextArea } from "../../EnhancedTextArea";
import { SaveToLibraryButton } from "../../shared/SaveToLibraryButton";
import { TemplateLibrarySelector } from "../../TemplateLibrarySelector";

// Componente para criar um novo template de WhatsApp
export default function CreateTemplatePage() {
  const router = useRouter();
  
  // Get variables from MTF data provider
  const { variaveis, loadingVariaveis } = useMtfData();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [creationSuccess, setCreationSuccess] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  
  // Etapas do formulário
  const [currentStep, setCurrentStep] = useState<"configurar" | "editar" | "analisar">("configurar");
  
  // Dados do template
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"MARKETING" | "UTILITY" | "AUTHENTICATION">("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [allowCategoryChange, setAllowCategoryChange] = useState(false);
  
  // Cabeçalho
  const [headerType, setHeaderType] = useState<"NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT">("NONE");
  const [headerText, setHeaderText] = useState("");
  const [headerExample, setHeaderExample] = useState("");
  
  // Estado para mídia do cabeçalho (imagem, vídeo)
  const [headerMetaMedia, setHeaderMetaMedia] = useState<MetaMediaFile[]>([]);
  
  // Corpo e rodapé
  const [bodyText, setBodyText] = useState("");
  const [bodyExamples, setBodyExamples] = useState<string[]>([]);
  const [footerText, setFooterText] = useState("");
  
  // Botões
  const [buttons, setButtons] = useState<any[]>([]);
  
  // Carregar mídia do localStorage quando o componente monta
  useEffect(() => {
    try {
      const savedMedia = localStorage.getItem('headerMetaMedia');
      if (savedMedia) {
        const parsedMedia = JSON.parse(savedMedia);
        console.log("Mídia recuperada do localStorage:", parsedMedia);
        setHeaderMetaMedia(parsedMedia);
      }
    } catch (err) {
      console.error("Erro ao carregar mídia do localStorage:", err);
    }
  }, []);
  
  // Log changes to headerMetaMedia for debugging
  useEffect(() => {
    console.log("headerMetaMedia state atualizado:", headerMetaMedia);
    
    // Se houver mídia, vamos salvar no localStorage
    if (headerMetaMedia.length > 0) {
      try {
        localStorage.setItem('headerMetaMedia', JSON.stringify(headerMetaMedia));
        console.log("Mídia salva em localStorage após atualização de estado");
      } catch (err) {
        console.error("Erro ao salvar mídia em localStorage:", err);
      }
    }
  }, [headerMetaMedia]);
  
  // Limpar localStorage quando o componente é desmontado
  useEffect(() => {
    return () => {
      try {
        localStorage.removeItem('headerMetaMedia');
        console.log("Mídia removida do localStorage na desmontagem");
      } catch (err) {
        console.error("Erro ao remover mídia do localStorage:", err);
      }
    };
  }, []);
  
  // Validações
  const isValidName = () => {
    const regex = /^[a-z0-9_]+$/;
    return name.length > 0 && name.length <= 512 && regex.test(name);
  };
  
  const isValidHeaderText = () => {
    return headerType !== "TEXT" || (headerText.length > 0 && headerText.length <= 60);
  };
  
  const isValidBodyText = () => {
    return bodyText.length > 0 && bodyText.length <= 1024;
  };
  
  const isValidFooterText = () => {
    return footerText.length === 0 || footerText.length <= 60;
  };
  
  const isValidHeaderMedia = () => {
    // Se o cabeçalho for de vídeo, verificar se temos um media handle
    if (headerType === "VIDEO") {
      return headerMetaMedia.length > 0 && headerMetaMedia[0].status === 'success' && !!headerMetaMedia[0].mediaHandle;
    }
    // Se o cabeçalho for de imagem, precisa ter um arquivo
    return (headerType === "IMAGE") ? headerMetaMedia.length > 0 : true;
  };
  
  const isFormValid = () => {
    return (
      isValidName() && 
      isValidHeaderText() && 
      isValidBodyText() && 
      isValidFooterText() &&
      isValidHeaderMedia() &&
      bodyText.trim() !== ""
    );
  };
  
  // Extrair variáveis de um texto - retorna array de matches {{1}}, {{2}}, etc.
  const extractVariables = (text: string) => {
    if (!text) return [];
    const matches = text.match(/\{\{(\d+)\}\}/g) || [];
    return [...new Set(matches)]; // Remove duplicados
  };
  
  // Adicionar botão de resposta rápida
  const addQuickReplyButton = () => {
    if (buttons.length >= 3) {
      toast.error("Limite de botões", { description: "Você pode adicionar no máximo 3 botões de resposta rápida" });
      return;
    }
    
    setButtons([...buttons, { type: "QUICK_REPLY", text: `Botão ${buttons.length + 1}` }]);
  };
  
  // Adicionar botão URL
  const addUrlButton = () => {
    if (buttons.length >= 2) {
      toast.error("Limite de botões", { description: "Você pode adicionar no máximo 2 botões de URL" });
      return;
    }
    
    setButtons([...buttons, { type: "URL", text: `Site ${buttons.length + 1}`, url: "https://exemplo.com" }]);
  };
  
  // Adicionar botão de telefone
  const addPhoneNumberButton = () => {
    if (buttons.length >= 1) {
      toast.error("Limite de botões", { description: "Você só pode ter um botão de telefone" });
      return;
    }
    
    setButtons([...buttons, { 
      type: "PHONE_NUMBER", 
      text: "Ligar agora",
      phone_number: "+55"
    }]);
  };
  
  // Adicionar botão COPY_CODE
  const addCopyCodeButton = () => {
    if (buttons.length >= 1) {
      toast.error("Limite de botões", { description: "Você só pode ter um botão Copy Code" });
      return;
    }
    
    setButtons([...buttons, { 
      type: "COPY_CODE", 
      text: "Copiar código da oferta",
      code_example: "123456"
    }]);
  };
  
  // Remover botão por índice
  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };
  
  // Atualizar texto do botão
  const updateButtonText = (index: number, text: string) => {
    const newButtons = [...buttons];
    if (newButtons[index].type !== "COPY_CODE") {
      newButtons[index].text = text;
      setButtons(newButtons);
    }
  };
  
  // Atualizar URL do botão
  const updateButtonUrl = (index: number, url: string) => {
    const newButtons = [...buttons];
    if (newButtons[index].type === "URL") {
      newButtons[index].url = url;
      setButtons(newButtons);
    }
  };
  
  // Atualizar número de telefone do botão
  const updateButtonPhoneNumber = (index: number, phoneNumber: string) => {
    const newButtons = [...buttons];
    if (newButtons[index].type === "PHONE_NUMBER") {
      newButtons[index].phone_number = phoneNumber;
      setButtons(newButtons);
    }
  };
  
  // Atualizar código de exemplo do botão
  const updateButtonCodeExample = (index: number, code: string) => {
    const newButtons = [...buttons];
    if (newButtons[index].type === "COPY_CODE") {
      newButtons[index].code_example = code;
      setButtons(newButtons);
    }
  };
  
  // Função para manipular mudanças no nome do template (substituir espaços por underscores)
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/\s+/g, '_');
    setName(value);
  };
  
  // Função para copiar o código da oferta
  const copyTemplateId = () => {
    if (!templateId) return;
    
    navigator.clipboard.writeText(templateId).then(
      () => {
        toast.success("Código do template copiado para a área de transferência!");
      },
      () => {
        toast.error("Falha ao copiar para a área de transferência");
      }
    );
  };
  
  // Função para lidar com o upload completo do vídeo para a API Meta
  const handleVideoUploadComplete = (mediaHandle: string, file: MetaMediaFile) => {
    console.log(`Upload para API Meta concluído. Media Handle: ${mediaHandle}`);
    console.log(`URL do MinIO para referência: ${file.url}`);
    
    // Garantimos que o componente de exemplo inclua a URL do MinIO para referência futura
    if (file.url && mediaHandle) {
      // Cria uma cópia completa do objeto para evitar problemas de referência
      const updatedFile = {
        ...file,
        mediaHandle,
        url: file.url,
        status: 'success' as const,
        progress: 100
      };
      
      // Verificar se o arquivo já existe na lista
      const fileExists = headerMetaMedia.some(item => item.id === file.id);
      
      if (fileExists) {
        // Atualizar o arquivo existente
        const updatedHeader = headerMetaMedia.map(item => 
          item.id === file.id ? updatedFile : item
        );
        console.log("Atualizando mídia existente:", updatedHeader);
        setHeaderMetaMedia(updatedHeader);
      } else {
        // Adicionar novo arquivo à lista
        console.log("Adicionando nova mídia:", [updatedFile]);
        setHeaderMetaMedia([updatedFile]);
      }
      
      // Salvar em localStorage para persistência durante navegação
      try {
        localStorage.setItem('headerMetaMedia', JSON.stringify([updatedFile]));
        console.log("Mídia salva em localStorage");
      } catch (err) {
        console.error("Erro ao salvar mídia em localStorage:", err);
      }
    }
    
    toast.success("Vídeo processado com sucesso!", { 
      description: "O vídeo foi enviado para a API do WhatsApp e está pronto para uso."
    });
  };
  
  // Função para lidar com o upload completo da imagem para a API Meta
  const handleImageUploadComplete = (mediaHandle: string, file: MetaMediaFile) => {
    console.log(`Upload para API Meta concluído. Media Handle: ${mediaHandle}`);
    console.log(`URL do MinIO para referência: ${file.url}`);
    
    // Garantimos que o componente de exemplo inclua a URL do MinIO para referência futura
    if (file.url && mediaHandle) {
      // Cria uma cópia completa do objeto para evitar problemas de referência
      const updatedFile = {
        ...file,
        mediaHandle,
        url: file.url,
        status: 'success' as const,
        progress: 100
      };
      
      // Verificar se o arquivo já existe na lista
      const fileExists = headerMetaMedia.some(item => item.id === file.id);
      
      if (fileExists) {
        // Atualizar o arquivo existente
        const updatedHeader = headerMetaMedia.map(item => 
          item.id === file.id ? updatedFile : item
        );
        console.log("Atualizando mídia existente:", updatedHeader);
        setHeaderMetaMedia(updatedHeader);
      } else {
        // Adicionar novo arquivo à lista
        console.log("Adicionando nova mídia:", [updatedFile]);
        setHeaderMetaMedia([updatedFile]);
      }
      
      // Salvar em localStorage para persistência durante navegação
      try {
        localStorage.setItem('headerMetaMedia', JSON.stringify([updatedFile]));
        console.log("Mídia salva em localStorage");
      } catch (err) {
        console.error("Erro ao salvar mídia em localStorage:", err);
      }
    }
    
    toast.success("Imagem processada com sucesso!", { 
      description: "A imagem foi enviada para a API do WhatsApp e está pronta para uso."
    });
  };
  
  // Criar template na API
  const createTemplate = async () => {
    if (!isFormValid()) {
      toast.error("Formulário inválido", { description: "Verifique os campos obrigatórios e tente novamente" });
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Preparar componentes
      const components = [];
      
      // Adicionar cabeçalho se existir
      if (headerType !== "NONE") {
        const headerComponent: any = {
          type: "HEADER",
          format: headerType
        };
        
        if (headerType === "TEXT") {
          headerComponent.text = headerText;
          
          // Adicionar exemplo se tiver variáveis
          if (extractVariables(headerText).length > 0 && headerExample) {
            headerComponent.example = {
              header_text: [headerExample]
            };
          }
          
          components.push(headerComponent);
        } else if (headerType === "IMAGE" && headerMetaMedia.length > 0) {
          // Para imagem, usamos o media_handle retornado pela API Meta
          
          // Verificar se temos um media handle válido
          if (!headerMetaMedia[0].mediaHandle) {
            throw new Error("Media handle não encontrado. Faça upload da imagem usando o componente específico para WhatsApp.");
          }
          
          // Armazenamos a URL para referência interna, mas criamos uma cópia sem ela para enviar à API
          const fullExample = {
            header_handle: [headerMetaMedia[0].mediaHandle],
            // Adicionamos a URL do MinIO como referência interna apenas
            header_url: headerMetaMedia[0].url
          };
          
          // Log completo para depuração interna
          console.log("== COMPONENTE DE IMAGEM WHATSAPP (COMPLETO) ==");
          console.log("Media Handle:", headerMetaMedia[0].mediaHandle);
          console.log("MinIO URL para referência interna:", headerMetaMedia[0].url);
          console.log("Exemplo completo:", JSON.stringify(fullExample, null, 2));
          
          // Para a API do WhatsApp, enviamos apenas o header_handle
          headerComponent.example = {
            header_handle: [headerMetaMedia[0].mediaHandle]
          };
          
          console.log("== COMPONENTE DE IMAGEM WHATSAPP (ENVIADO PARA API) ==");
          console.log("Componente enviado:", JSON.stringify(headerComponent, null, 2));
          
          components.push(headerComponent);
        } else if (headerType === "VIDEO" && headerMetaMedia.length > 0) {
          // Para vídeo, usamos o media_handle retornado pela API Meta
          headerComponent.format = "VIDEO";  
          
          // Verificar se temos um media handle válido
          if (!headerMetaMedia[0].mediaHandle) {
            throw new Error("Media handle não encontrado. Faça upload do vídeo usando o componente específico para WhatsApp.");
          }
          
          // Armazenamos a URL para referência interna, mas criamos uma cópia sem ela para enviar à API
          const fullExample = {
            header_handle: [headerMetaMedia[0].mediaHandle],
            // Adicionamos a URL do MinIO como referência interna apenas
            header_url: headerMetaMedia[0].url
          };
          
          // Log completo para depuração interna
          console.log("== COMPONENTE DE VÍDEO WHATSAPP (COMPLETO) ==");
          console.log("Media Handle:", headerMetaMedia[0].mediaHandle);
          console.log("MinIO URL para referência interna:", headerMetaMedia[0].url);
          console.log("Exemplo completo:", JSON.stringify(fullExample, null, 2));
          
          // Para a API do WhatsApp, enviamos apenas o header_handle
          headerComponent.example = {
            header_handle: [headerMetaMedia[0].mediaHandle]
          };
          
          console.log("== COMPONENTE DE VÍDEO WHATSAPP (ENVIADO PARA API) ==");
          console.log("Componente enviado:", JSON.stringify(headerComponent, null, 2));
          
          components.push(headerComponent);
        } else if (headerType === "VIDEO") {
          // Se não tiver mídia, não podemos criar o template
          throw new Error("Modelos com o tipo de cabeçalho VIDEO precisam de um exemplo de vídeo. Faça upload de um vídeo antes de enviar o template.");
        } else if (headerType === "IMAGE") {
          // Se não tiver mídia, não podemos criar o template
          throw new Error("Modelos com o tipo de cabeçalho IMAGE precisam de um exemplo de imagem. Faça upload de uma imagem usando o componente específico para WhatsApp.");
        } else if (headerType === "DOCUMENT") {
          components.push(headerComponent);
        }
      }
      
      // Adicionar corpo (obrigatório)
      const bodyComponent: any = {
        type: "BODY",
        text: bodyText
      };
      
      // Adicionar exemplos se tiver variáveis
      const bodyVars = extractVariables(bodyText);
      if (bodyVars.length > 0 && bodyExamples.length > 0) {
        // Transformar em formato de matriz para a API
        bodyComponent.example = {
          body_text: [bodyExamples]
        };
      }
      
      components.push(bodyComponent);
      
      // Adicionar rodapé se existir
      if (footerText.trim()) {
        components.push({
          type: "FOOTER",
          text: footerText
        });
      }
      
      // Adicionar botões se existirem
      if (buttons && buttons.length > 0) {
        const buttonComponent = {
          type: "buttons",
          buttons: buttons.map(b => {
            const btn: {
              type: string;
              text: string;
              url?: string;
              phoneNumber?: string;
              example?: string[];
            } = {
              type: b.type,
              text: b.text
            };
            
            if (b.type === "URL" && b.url) {
              btn.url = b.url;
            } else if (b.type === "PHONE_NUMBER" && b.phone_number) {
              btn.phoneNumber = b.phone_number;
            } else if (b.type === "COPY_CODE" && b.code_example) {
              btn.example = [b.code_example];
            }
            
            return btn;
          })
        };
        
        console.log("Adicionando botões:", buttonComponent);
        components.push(buttonComponent);
      }
      
      // Payload para a API
      const payload = {
        name,
        category,
        language,
        components,
        allow_category_change: allowCategoryChange
      };
      
      // Verificação final para garantir que nenhum header_url seja enviado para a API
      // Esta verificação adicional garante que mesmo se houver alterações futuras no código
      // ainda estaremos protegidos contra envio incorreto de URLs para a API do WhatsApp
      // No entanto, vamos garantir que a informação da URL seja preservada para uso interno
      const payloadToSend = {
        ...payload,
        components: payload.components.map(component => {
          // Para componentes de cabeçalho com mídia, vamos extrair a URL do MinIO 
          // e adicionar um campo especial que será processado pelo backend
          if (component.type === "HEADER" && 
              component.format && 
              ["IMAGE", "VIDEO"].includes(component.format) && 
              component.example?.header_handle) {
            
            // Encontrar a URL do MinIO nos nossos dados
            let minioUrl = null;
            
            if (component.example.header_url) {
              // Se já temos a URL no objeto, extraímos ela
              minioUrl = component.example.header_url;
              console.log("Preservando URL do MinIO para o backend:", minioUrl);
            } else if (headerMetaMedia.length > 0 && headerMetaMedia[0].url) {
              // Se não, tentamos encontrar nos dados de estado
              minioUrl = headerMetaMedia[0].url;
              console.log("Extraindo URL do MinIO dos dados de mídia:", minioUrl);
            }
            
            // Criar uma cópia do objeto para o WhatsApp (apenas com o header_handle)
            return {
              ...component,
              example: {
                header_handle: component.example.header_handle,
                // Adicionamos um campo especial que o backend vai reconhecer e usar
                // para salvar no banco de dados, mas que a API do WhatsApp vai ignorar
                _minioUrl: minioUrl
              }
            };
          }
          
          return component;
        })
      };
      
      console.log("Enviando payload para API (com URL preservada):", 
        JSON.stringify(payloadToSend, null, 2));
      
      // Enviar para API
      const response = await axios.post('/api/admin/mtf-diamante/templates', payloadToSend);
      
      if (response.data.success) {
        setCreationSuccess(true);
        setTemplateId(response.data.templateId || response.data.id);
        
        toast("Template criado com sucesso", { description: `O template foi enviado para aprovação e será revisado pelo WhatsApp.`
         });
        
        // Após criar o template, atualizar a lista de templates no banco de dados
        try {
          // Fazer uma chamada para sincronizar o novo template com o banco de dados
          await axios.get('/api/admin/mtf-diamante/templates?refresh=true');
          console.log('Lista de templates atualizada após criação do novo template');
        } catch (syncError) {
          console.error('Erro ao atualizar lista de templates:', syncError);
          // Não exibimos erro para o usuário, pois o template já foi criado com sucesso
        }
        
        // Redirecionar para a página de templates após um pequeno atraso
        // para permitir que o usuário veja o toast de sucesso
        setTimeout(() => {
          router.push('/admin/templates');
        }, 1500);
      } else {
        setError(response.data.error || "Erro ao criar template");
      }
    } catch (err: any) {
      console.error("Erro ao criar template:", err);
      
      // Verificar se é um erro específico sobre mídia de vídeo
      if (err.response?.data?.error?.error_user_msg?.includes("tipo de cabeçalho VIDEO")) {
        setError("Erro do WhatsApp: " + err.response.data.error.error_user_msg);
      } else {
        setError(err.response?.data?.error || "Ocorreu um erro ao criar o template");
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Função para avançar para a próxima etapa
  const avancarParaProximaEtapa = () => {
    if (currentStep === "configurar") {
      setCurrentStep("editar");
    } else if (currentStep === "editar") {
      setCurrentStep("analisar");
    }
  };

  // Função para escolher categoria
  const selecionarCategoria = (cat: "MARKETING" | "UTILITY" | "AUTHENTICATION") => {
    setCategory(cat);
  };
  
  // Função para obter os componentes para o preview
  const getPreviewComponents = (): CreateTemplateComponent[] => {
    const components: CreateTemplateComponent[] = [];
    
    // Adicionar o header se existir
    if (headerType !== "NONE") {
      const headerComponent: {
        type: string;
        format: string;
        text: string;
        url?: string;
      } = {
        type: "header",
        format: headerType.toLowerCase(),
        text: headerType === "TEXT" ? headerText : ""
      };
      
      // Adicionar URL para mídia se houver
      if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && headerMetaMedia.length > 0) {
        headerComponent.url = headerMetaMedia[0].url || "";
      }
      
      console.log("Adicionando header:", headerComponent);
      components.push(headerComponent);
    }
    
    // Adicionar o corpo (obrigatório)
    const bodyComponent = {
      type: "body",
      text: bodyText
    };
    console.log("Adicionando body:", bodyComponent);
    components.push(bodyComponent);
    
    // Adicionar o footer se existir
    if (footerText && footerText.trim() !== "") {
      const footerComponent = {
        type: "footer",
        text: footerText
      };
      console.log("Adicionando footer:", footerComponent);
      components.push(footerComponent);
    }
    
    // Adicionar botões se existirem
    if (buttons && buttons.length > 0) {
      const buttonComponent = {
        type: "buttons",
        buttons: buttons.map(b => {
          const btn: {
            type: string;
            text: string;
            url?: string;
            phoneNumber?: string;
            example?: string[];
          } = {
            type: b.type,
            text: b.text
          };
          
          if (b.type === "URL" && b.url) {
            btn.url = b.url;
          } else if (b.type === "PHONE_NUMBER" && b.phone_number) {
            btn.phoneNumber = b.phone_number;
          } else if (b.type === "COPY_CODE" && b.code_example) {
            btn.example = [b.code_example];
          }
          
          return btn;
        })
      };
      
      console.log("Adicionando botões:", buttonComponent);
      components.push(buttonComponent);
    }
    
    console.log("Componentes finais para preview:", components);
    return components;
  };
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/templates">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Criar Novo Template</h1>
      </div>
      
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      {/* Indicador de etapas */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div className={`flex items-center rounded-full border-2 ${currentStep === "configurar" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-300 text-gray-400"} w-10 h-10 justify-center font-bold`}>
            1
          </div>
          <div className={`flex-1 h-1 mx-2 ${currentStep === "configurar" ? "bg-blue-500" : "bg-gray-300"}`}></div>
          <div className={`flex items-center rounded-full border-2 ${currentStep === "editar" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-300 text-gray-400"} w-10 h-10 justify-center font-bold`}>
            2
          </div>
          <div className={`flex-1 h-1 mx-2 ${currentStep === "analisar" ? "bg-blue-500" : "bg-gray-300"}`}></div>
          <div className={`flex items-center rounded-full border-2 ${currentStep === "analisar" ? "border-blue-500 bg-blue-50 text-blue-500" : "border-gray-300 text-gray-400"} w-10 h-10 justify-center font-bold`}>
            3
          </div>
        </div>
        <div className="flex items-center justify-between text-sm px-1">
          <div className={`${currentStep === "configurar" ? "text-blue-500 font-medium" : "text-gray-500"} text-center flex-1`}>
            Configurar modelo
          </div>
          <div className={`${currentStep === "editar" ? "text-blue-500 font-medium" : "text-gray-500"} text-center flex-1`}>
            Editar modelo
          </div>
          <div className={`${currentStep === "analisar" ? "text-blue-500 font-medium" : "text-gray-500"} text-center flex-1`}>
            Enviar para análise
          </div>
        </div>
      </div>

      {currentStep === "configurar" && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
          <div className="md:col-span-5 space-y-6">
            <Card className="mb-6 shadow-sm border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Configurar seu modelo</CardTitle>
                <CardDescription>
                  Escolha a categoria que melhor descreve seu modelo de mensagem. Em seguida, selecione o tipo de mensagem que deseja enviar. <a href="#" className="text-blue-500 hover:underline">Saiba mais sobre as categorias</a>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button 
                    onClick={() => selecionarCategoria("MARKETING")}
                    className={`flex items-center justify-center py-5 px-4 border rounded-md transition-all duration-200 ${category === "MARKETING" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`rounded-full p-2 mb-2 ${category === "MARKETING" ? "bg-blue-100" : "bg-gray-100"}`}>
                        <svg className={`h-5 w-5 ${category === "MARKETING" ? "text-blue-500" : "text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"></path>
                        </svg>
                      </div>
                      <span className={`text-center font-medium ${category === "MARKETING" ? "text-blue-700" : "text-gray-700"}`}>Marketing</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => selecionarCategoria("UTILITY")}
                    className={`flex items-center justify-center py-5 px-4 border rounded-md transition-all duration-200 ${category === "UTILITY" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`rounded-full p-2 mb-2 ${category === "UTILITY" ? "bg-blue-100" : "bg-gray-100"}`}>
                        <svg className={`h-5 w-5 ${category === "UTILITY" ? "text-blue-500" : "text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-.34-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.09-.16-.26-.25-.44-.25-.06 0-.12.01-.17.03l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.06-.02-.12-.03-.18-.03-.17 0-.34.09-.43.25l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98 0 .33.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.09.16.26.25.44.25.06 0 .12-.01.17-.03l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.06.02.12.03.18.03.17 0 .34-.09.43-.25l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zm-1.98-1.71c.04.31.05.52.05.73 0 .21-.02.43-.05.73l-.14 1.13.89.7 1.08.84-.7 1.21-1.27-.51-1.04-.42-.9.68c-.43.32-.84.56-1.25.73l-1.06.43-.16 1.13-.2 1.35h-1.4l-.19-1.35-.16-1.13-1.06-.43c-.43-.18-.83-.41-1.23-.71l-.91-.7-1.06.43-1.27.51-.7-1.21 1.08-.84.89-.7-.14-1.13c-.03-.31-.05-.54-.05-.74s.02-.43.05-.73l.14-1.13-.89-.7-1.08-.84.7-1.21 1.27.51 1.04.42.9-.68c.43-.32.84-.56 1.25-.73l1.06-.43.16-1.13.2-1.35h1.39l.19 1.35.16 1.13 1.06.43c.43.18.83.41 1.23.71l.91.7 1.06-.43 1.27-.51.7 1.21-1.07.85-.89.7.14 1.13zM12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"></path>
                        </svg>
                      </div>
                      <span className={`text-center font-medium ${category === "UTILITY" ? "text-blue-700" : "text-gray-700"}`}>Utilidade</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => selecionarCategoria("AUTHENTICATION")}
                    className={`flex items-center justify-center py-5 px-4 border rounded-md transition-all duration-200 ${category === "AUTHENTICATION" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                  >
                    <div className="flex flex-col items-center">
                      <div className={`rounded-full p-2 mb-2 ${category === "AUTHENTICATION" ? "bg-blue-100" : "bg-gray-100"}`}>
                        <svg className={`h-5 w-5 ${category === "AUTHENTICATION" ? "text-blue-500" : "text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"></path>
                        </svg>
                      </div>
                      <span className={`text-center font-medium ${category === "AUTHENTICATION" ? "text-blue-700" : "text-gray-700"}`}>Autenticação</span>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Tipos de mensagem específicos da categoria */}
            <Card className="mb-6 shadow-sm border-gray-200">
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold mb-4">Selecione o tipo de mensagem para sua categoria</h3>
                
                {category === "MARKETING" && (
                  <div className="space-y-3">
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-personalizada" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                        defaultChecked
                      />
                      <label htmlFor="tipo-personalizada" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Personalizada</div>
                        <div className="text-sm text-gray-500">
                          Envie promoções ou anúncios para aumentar o reconhecimento e o engajamento.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-catalogo" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-catalogo" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Catálogo</div>
                        <div className="text-sm text-gray-500">
                          Envie mensagens sobre o catálogo inteiro ou vários produtos dele.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-flows" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-flows" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Flows</div>
                        <div className="text-sm text-gray-500">
                          Envie um formulário para coletar interesses dos clientes e solicitações de horas marcadas ou fazer pesquisas.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-detalhes" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-detalhes" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Detalhes do pedido</div>
                        <div className="text-sm text-gray-500">
                          Envie mensagens que os clientes podem usar para fazer pagamentos para você.
                        </div>
                      </label>
                    </div>
                  </div>
                )}
                
                {category === "UTILITY" && (
                  <div className="space-y-3">
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-atendimento" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                        defaultChecked
                      />
                      <label htmlFor="tipo-atendimento" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Atendimento ao Cliente</div>
                        <div className="text-sm text-gray-500">
                          Mensagens de suporte, esclarecimento de dúvidas e resoluções de problemas.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-informativa" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-informativa" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Mensagem Informativa</div>
                        <div className="text-sm text-gray-500">
                          Atualizações, alertas e informações de serviço para clientes.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-confirmacao" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-confirmacao" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Confirmação de Agendamento</div>
                        <div className="text-sm text-gray-500">
                          Confirmar, reagendar ou cancelar compromissos e reservas.
                        </div>
                      </label>
                    </div>
                  </div>
                )}
                
                {category === "AUTHENTICATION" && (
                  <div className="space-y-3">
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-otp" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                        defaultChecked
                      />
                      <label htmlFor="tipo-otp" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Código de Verificação (OTP)</div>
                        <div className="text-sm text-gray-500">
                          Enviar códigos para verificação em dois fatores e login.
                        </div>
                      </label>
                    </div>
                    
                    <div className="flex items-start p-3 rounded-md hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="radio" 
                        id="tipo-redefinicao" 
                        name="tipo-mensagem" 
                        className="w-4 h-4 text-blue-600 mt-1"
                      />
                      <label htmlFor="tipo-redefinicao" className="ml-3 block cursor-pointer w-full">
                        <div className="font-medium">Redefinição de Senha</div>
                        <div className="text-sm text-gray-500">
                          Enviar links ou códigos para redefinição de senha.
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

          {/* Informações Básicas */}
            <Card className="mb-6 shadow-sm border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Informações Básicas</CardTitle>
                <CardDescription>
                  Defina as propriedades principais do template
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
              <div>
                  <Label htmlFor="template-name" className="text-sm font-medium">
                  Nome do Template <span className="text-red-500">*</span>
                </Label>
                  <div className="flex items-start gap-2 mt-1.5">
                  <div className="flex-1">
                    <Input
                      id="template-name"
                      placeholder="nome_do_template"
                      value={name}
                      onChange={handleNameChange}
                      className={!isValidName() && name ? "border-red-500" : ""}
                    />
                      <p className="text-xs text-muted-foreground mt-1.5">
                      Use apenas letras minúsculas, números e underscores (_). Máximo de 512 caracteres.
                    </p>
                  </div>
                </div>
                {!isValidName() && name && (
                    <p className="text-xs text-red-500 mt-1.5">
                    Nome inválido. Use apenas letras minúsculas, números e underscores.
                  </p>
                )}
              </div>
              
                <div>
                  <Label htmlFor="language" className="text-sm font-medium">
                    Idioma <span className="text-red-500">*</span>
                  </Label>
                  <div className="mt-1.5">
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o idioma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en_US">Inglês (EUA)</SelectItem>
                      <SelectItem value="es_ES">Espanhol (Espanha)</SelectItem>
                      <SelectItem value="es_MX">Espanhol (México)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
                <div className="flex items-center space-x-2 pt-1">
                <Checkbox 
                  id="allow-category-change" 
                  checked={allowCategoryChange} 
                  onCheckedChange={(value) => setAllowCategoryChange(!!value)}
                />
                  <Label htmlFor="allow-category-change" className="text-sm">
                  Permitir que o WhatsApp altere a categoria do template se necessário
                </Label>
              </div>
            </CardContent>
          </Card>
          
            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => router.push('/admin/templates')}>
                Cancelar
              </Button>
              <Button onClick={avancarParaProximaEtapa} disabled={!isValidName()} className="bg-blue-600 hover:bg-blue-700">
                Avançar
              </Button>
            </div>
          </div>

          <div className="md:col-span-2">
            {/* Prévia do modelo */}
            <Card className="sticky top-4 shadow-sm border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Prévia do modelo</CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-hidden">
                <div className="rounded-lg overflow-hidden">
                  {/* Área de visualização com fundo do WhatsApp */}
                  <div 
                    className="p-5 min-h-[400px]"
                    style={{
                      backgroundImage: useTheme().theme === 'dark' 
                        ? "url('/fundo_whatsapp_black.jpg')" 
                        : "url('/fundo_whatsapp.jpg')",
                      backgroundSize: "cover",
                      backgroundPosition: "center"
                    }}
                  >
                    {/* Balão de mensagem */}
                    <div className="flex justify-end mb-4">
                      <div className="max-w-[80%] bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        {category === "MARKETING" && (
                          <div className="overflow-hidden">
                            {/* Imagem de produtos */}
                            <img 
                              src="https://images.unsplash.com/photo-1573246123716-6b1782bfc499?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" 
                              alt="Produtos frescos" 
                              className="w-full h-36 object-cover rounded-t-lg mb-2"
                            />
                            
                            {/* Texto da mensagem */}
                            <div className="mb-2">
                              <div className="text-sm mb-1 text-gray-900 dark:text-white">Olá! Confira nossos produtos frescos agora!</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 break-words">Use o código <span className="font-bold">SAÚDE</span> para obter 10% de desconto adicional em toda a sua compra.</div>
                            </div>
                            
                            {/* Horário da mensagem */}
                            <div className="flex justify-end items-center text-xs text-gray-500 dark:text-gray-400">
                              <span>11:59</span>
                            </div>
                          </div>
                        )}
                        
                        {category === "UTILITY" && (
                          <div>
                            {/* Conteúdo de utilidade - sem imagem */}
                            <div className="mb-2">
                              <div className="text-sm mb-1 font-medium text-gray-900 dark:text-white">Boas notícias! Seu pedido 23KFEJJ2312 foi enviado!</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 break-words">Aqui estão suas informações de rastreamento, por favor confira o link abaixo.</div>
                            </div>
                            
                            {/* Horário da mensagem */}
                            <div className="flex justify-end items-center text-xs text-gray-500 dark:text-gray-400">
                              <span>11:59</span>
                            </div>
                          </div>
                        )}
                        
                        {category === "AUTHENTICATION" && (
                          <div>
                            {/* Conteúdo de autenticação - sem imagem */}
                            <div className="mb-2">
                              <div className="text-sm mb-1 text-gray-900 dark:text-white">123456 é o seu código de verificação.</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 break-words">Para sua segurança, não compartilhe este código.</div>
                            </div>
                            
                            {/* Horário da mensagem */}
                            <div className="flex justify-end items-center text-xs text-gray-500 dark:text-gray-400">
                              <span>11:59</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Botões abaixo da mensagem */}
                    {category === "MARKETING" && (
                      <div className="flex justify-end mb-4">
                        <div className="max-w-[80%] bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                          <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            <button className="w-full py-2 text-sm text-blue-500 dark:text-blue-400 font-medium">Comprar agora</button>
                            <button className="w-full py-2 text-sm text-blue-500 dark:text-blue-400 font-medium">Copiar código</button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {category === "UTILITY" && (
                      <div className="flex justify-end mb-4">
                        <div className="max-w-[80%] bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                          <button className="w-full py-2 text-sm text-blue-500 dark:text-blue-400 font-medium">Rastrear envio</button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Informações sobre o modelo */}
                  <div className="bg-white p-4">
                    <div className="text-xs text-gray-500 text-center">
                      Este modelo é ideal para
                      <p className="font-medium mt-1">
                        {category === "MARKETING" && "Mensagens de boas-vindas, promoções, ofertas, cupons, boletins informativos, anúncios"}
                        {category === "UTILITY" && "Confirmações de pedidos, atualização de conta, recibos, lembretes de horas marcadas, cobrança"}
                        {category === "AUTHENTICATION" && "Senha descartável, código de recuperação da conta, verificação da conta, desafios de integridade"}
                      </p>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="text-xs text-gray-600 mb-2">
                        Áreas do modelo que você pode personalizar
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {category === "MARKETING" && (
                          <>
                            <Badge variant="outline" className="text-xs font-normal">Cabeçalho</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Corpo</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Rodapé</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Botão</Badge>
                          </>
                        )}
                        {category === "UTILITY" && (
                          <>
                            <Badge variant="outline" className="text-xs font-normal">Cabeçalho</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Corpo</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Rodapé</Badge>
                            <Badge variant="outline" className="text-xs font-normal">Botão</Badge>
                          </>
                        )}
                        {category === "AUTHENTICATION" && (
                          <>
                            <Badge variant="outline" className="text-xs font-normal">Método de entrega do código</Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {currentStep === "editar" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
          {/* Conteúdo do Template */}
          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Template</CardTitle>
              <CardDescription>
                Defina o conteúdo e a estrutura do template
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cabeçalho */}
              <div>
                <h3 className="text-sm font-medium mb-2">Cabeçalho (Opcional)</h3>
                <Select value={headerType} onValueChange={(value: any) => {
                  // Limpar mídia ao trocar tipo de cabeçalho
                  if (value !== headerType) {
                    setHeaderMetaMedia([]);
                  }
                  setHeaderType(value);
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de cabeçalho" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sem cabeçalho</SelectItem>
                    <SelectItem value="TEXT">Texto</SelectItem>
                    <SelectItem value="IMAGE">Imagem</SelectItem>
                    <SelectItem value="DOCUMENT">Documento</SelectItem>
                    <SelectItem value="VIDEO">Vídeo</SelectItem>
                  </SelectContent>
                </Select>
                
                {headerType === "TEXT" && (
                  <div className="mt-2">
                    <EnhancedTextArea
                      value={headerText}
                      onChange={setHeaderText}
                      variables={variaveis}
                      placeholder="Texto do cabeçalho"
                      multiline={false}
                      maxLength={60}
                      label="Texto do cabeçalho"
                      description="Right-click to insert variables. Use {{1}} format for numbered variables."
                      className={!isValidHeaderText() ? "border-red-500" : ""}
                      disabled={loadingVariaveis}
                    />
                    
                    {/* Exemplo para variável no cabeçalho */}
                    {extractVariables(headerText).length > 0 && (
                      <div className="mt-2">
                        <Label htmlFor="header-example">
                          Exemplo para o cabeçalho <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="header-example"
                          placeholder="Exemplo para substituir a variável"
                          value={headerExample}
                          onChange={(e) => setHeaderExample(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Forneça um exemplo para a variável do cabeçalho
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                {headerType === "IMAGE" && (
                  <div className="mt-4">
                    <Label>Imagem do Cabeçalho</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Faça upload da imagem que será usada como cabeçalho
                    </p>
                    <MetaMediaUpload
                      uploadedFiles={headerMetaMedia}
                      setUploadedFiles={setHeaderMetaMedia}
                      allowedTypes={['image/jpeg', 'image/png', 'image/jpg']}
                      maxSizeMB={5}
                      title="Upload de imagem para cabeçalho"
                      description="Faça upload da imagem para o cabeçalho do template"
                      maxFiles={1}
                      onUploadComplete={handleImageUploadComplete}
                    />
                    {headerMetaMedia.length === 0 && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Imagem obrigatória</AlertTitle>
                        <AlertDescription>
                          Você precisa fazer upload de uma imagem para usar como cabeçalho.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
                
                {headerType === "VIDEO" && (
                  <div className="mt-4">
                    <Label>Vídeo do Cabeçalho</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Faça upload do vídeo que será usado como cabeçalho. O WhatsApp aceita vídeos MP4 com até 16MB.
                    </p>
                    
                    <MetaMediaUpload
                      uploadedFiles={headerMetaMedia}
                      setUploadedFiles={setHeaderMetaMedia}
                      maxSizeMB={16}
                      maxFiles={1}
                      onUploadComplete={handleVideoUploadComplete}
                      title="Upload de Vídeo para WhatsApp"
                      description="Faça upload de um vídeo MP4 para ser processado pela API do WhatsApp"
                      allowedTypes={['video/mp4']}
                    />
                    
                    {headerMetaMedia.length === 0 && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Vídeo obrigatório</AlertTitle>
                        <AlertDescription>
                          Você precisa fazer upload de um vídeo para usar como cabeçalho.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
                
                {headerType === "DOCUMENT" && (
                  <div className="mt-2">
                    <Alert>
                      <AlertTitle>Mídia no cabeçalho</AlertTitle>
                      <AlertDescription>
                        Ao enviar mensagens com este template, você precisará fornecer a mídia para o cabeçalho.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
              </div>
              
              {/* Corpo (Body) - Obrigatório */}
              <div>
                <EnhancedTextArea
                  value={bodyText}
                  onChange={setBodyText}
                  variables={variaveis}
                  placeholder="Texto principal da mensagem"
                  multiline={true}
                  rows={5}
                  maxLength={1024}
                  label={<>Corpo <span className="text-red-500">*</span></>}
                  description="Main message text. Right-click to insert variables. Use {{1}}, {{2}}, etc. for numbered variables."
                  className={!isValidBodyText() ? "border-red-500" : ""}
                  disabled={loadingVariaveis}
                />
                
                {/* Exemplos para variáveis no corpo */}
                {extractVariables(bodyText).length > 0 && (
                  <div className="mt-2 space-y-2">
                    <Label>
                      Exemplos para variáveis <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Forneça um exemplo para cada variável no texto (valores serão ordenados)
                    </p>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {extractVariables(bodyText).map((variable, index) => (
                        <div key={index}>
                          <Label htmlFor={`var-${index}`}>{variable}</Label>
                          <Input
                            id={`var-${index}`}
                            placeholder="Exemplo para esta variável"
                            value={bodyExamples[index] || ""}
                            onChange={(e) => {
                              const newExamples = [...bodyExamples];
                              newExamples[index] = e.target.value;
                              setBodyExamples(newExamples);
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Rodapé (Footer) - Opcional */}
              <div>
                <EnhancedTextArea
                  value={footerText}
                  onChange={setFooterText}
                  variables={variaveis}
                  placeholder="Texto do rodapé"
                  multiline={false}
                  maxLength={60}
                  label="Rodapé (Opcional)"
                  description="Additional text that will appear at the bottom of the message. Right-click to insert variables."
                  className={!isValidFooterText() ? "border-red-500" : ""}
                  disabled={loadingVariaveis}
                />
              </div>
              
              {/* Botões - Opcional */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Botões (Opcional)</h3>
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar botão
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem 
                          onClick={addQuickReplyButton}
                          disabled={buttons.length >= 3 || buttons.some(btn => btn.type === "URL" || btn.type === "PHONE_NUMBER" || btn.type === "COPY_CODE")}
                        >
                          <span className="text-xs">Resposta Rápida</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={addUrlButton}
                          disabled={buttons.length >= 2 || buttons.some(btn => btn.type === "QUICK_REPLY" || btn.type === "PHONE_NUMBER" || btn.type === "COPY_CODE")}
                        >
                          <span className="text-xs">URL</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={addPhoneNumberButton}
                          disabled={buttons.length >= 1 || buttons.some(btn => btn.type === "QUICK_REPLY" || btn.type === "COPY_CODE")}
                        >
                          <span className="text-xs">Telefone</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={addCopyCodeButton}
                          disabled={buttons.length >= 1 || buttons.some(btn => btn.type === "QUICK_REPLY" || btn.type === "PHONE_NUMBER")}
                        >
                          <span className="text-xs">Copy Code</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                
                {buttons.length === 0 ? (
                  <div className="text-center p-4 border border-dashed rounded-md text-muted-foreground text-sm">
                    Clique nos botões acima para adicionar botões ao template
                  </div>
                ) : (
                  <div className="space-y-2">
                    {buttons.map((button, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded-md">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">
                              {button.type === "QUICK_REPLY" ? "Resposta Rápida" : button.type === "URL" ? "URL" : button.type === "PHONE_NUMBER" ? "Telefone" : "Copy Code"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removeButton(index)}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label htmlFor={`btn-text-${index}`}>Texto</Label>
                              <Input
                                id={`btn-text-${index}`}
                                value={button.text}
                                onChange={(e) => updateButtonText(index, e.target.value)}
                                maxLength={25}
                                disabled={button.type === "COPY_CODE"}
                              />
                              {button.type === "COPY_CODE" && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  O texto do botão Copy Code não pode ser modificado.
                                </p>
                              )}
                            </div>
                            
                            {button.type === "URL" && (
                              <div>
                                <Label htmlFor={`btn-url-${index}`}>URL</Label>
                                <Input
                                  id={`btn-url-${index}`}
                                  value={button.url}
                                  onChange={(e) => updateButtonUrl(index, e.target.value)}
                                  placeholder="https://..."
                                />
                              </div>
                            )}
                            
                            {button.type === "PHONE_NUMBER" && (
                              <div>
                                <Label htmlFor={`btn-phone-${index}`}>Número de Telefone</Label>
                                <Input
                                  id={`btn-phone-${index}`}
                                  value={button.phone_number}
                                  onChange={(e) => updateButtonPhoneNumber(index, e.target.value)}
                                  placeholder="+5585999999999"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Formato: código do país + DDD + número
                                </p>
                              </div>
                            )}
                            
                            {button.type === "COPY_CODE" && (
                              <div>
                                <Label htmlFor={`btn-code-${index}`}>Código de Exemplo</Label>
                                <Input
                                  id={`btn-code-${index}`}
                                  value={button.code_example}
                                  onChange={(e) => updateButtonCodeExample(index, e.target.value)}
                                  placeholder="Digite o código de exemplo"
                                  maxLength={15}
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Máximo de 15 caracteres
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <p className="text-xs text-muted-foreground mt-2">
                  Os botões no WhatsApp são exclusivos por tipo. Você pode adicionar:
                  <br />• Até 3 botões de resposta rápida (não combinável com outros tipos),
                  <br />• Ou um botão de telefone (PHONE_NUMBER),
                  <br />• Ou um botão de código para copiar (COPY_CODE),
                  <br />• Ou até 2 botões de URL.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Prévia do modelo</CardTitle>
              <CardDescription>
                Visualize como seu template ficará
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
              <div className="border rounded-lg overflow-hidden">
                {/* Fundo de chat do WhatsApp */}
                <div 
                  className="relative p-3 min-h-[400px]" 
                  style={{
                    backgroundImage: useTheme().theme === 'dark' 
                      ? "url('/fundo_whatsapp_black.jpg')" 
                      : "url('/fundo_whatsapp.jpg')",
                    backgroundSize: "cover",
                    backgroundPosition: "center"
                  }}
                >
                  {/* Mensagem de template */}
                  <div className="max-w-[80%] bg-white dark:bg-gray-800 rounded-lg shadow-sm p-3 ml-auto mr-3 mb-3">
                    {/* Header */}
                    {headerType === "TEXT" && headerText && (
                      <div className="font-bold text-center mb-2 text-gray-900 dark:text-white break-words overflow-hidden">{headerText}</div>
                    )}
                    {headerType === "IMAGE" && (
                      <div className="mb-2 overflow-hidden rounded-md" style={{ maxHeight: "180px" }}>
                        {headerMetaMedia.length > 0 && headerMetaMedia[0].url ? (
                          <img 
                            src={headerMetaMedia[0].url} 
                            alt="Header" 
                            className="w-full object-contain rounded-md max-h-[160px]" 
                          />
                        ) : (
                          <div className="w-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center" style={{ height: "140px" }}>
                            <svg className="w-12 h-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                            </svg>
                          </div>
                        )}
                      </div>
                    )}
                    {headerType === "DOCUMENT" && (
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-md mb-2 p-3 flex items-center justify-center">
                        <svg className="w-8 h-8 text-gray-500 dark:text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">Documento</span>
                      </div>
                    )}
                    {headerType === "VIDEO" && (
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-md mb-2 flex items-center justify-center" style={{ maxHeight: "180px" }}>
                        {headerMetaMedia.length > 0 && headerMetaMedia[0].status === 'success' ? (
                          <div className="flex flex-col items-center justify-center w-full h-full">
                            {headerMetaMedia[0].url ? (
                              <video 
                                src={headerMetaMedia[0].url} 
                                controls
                                className="w-full rounded-md max-h-[160px] object-contain" 
                              />
                            ) : (
                              <>
                                <Check className="w-8 h-8 text-green-500 mb-2" />
                                <p className="text-sm font-medium text-green-600 dark:text-green-400">Vídeo processado</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Media Handle: {headerMetaMedia[0].mediaHandle?.substring(0, 10)}...</p>
                              </>
                            )}
                          </div>
                        ) : (
                          <svg className="w-12 h-12 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                        )}
                      </div>
                    )}
                    
                    {/* Body */}
                    <div className="text-sm whitespace-pre-wrap break-words text-gray-900 dark:text-white mb-2">
                      {bodyText || "Digite o texto principal da mensagem aqui"}
                    </div>
                    
                    {/* Footer */}
                    {footerText && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {footerText}
                      </div>
                    )}
                    
                    <div className="text-right text-xs text-gray-500 dark:text-gray-400 flex justify-end items-center">
                      <span>17:12</span>
                    </div>
                  </div>
                  
                  {/* Botões abaixo da mensagem */}
                  {buttons.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm max-w-[80%] ml-auto mr-3 mt-1 overflow-hidden">
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {buttons.map((button, index) => (
                          <button 
                            key={index} 
                            className="w-full py-3 px-4 text-sm text-cyan-500 dark:text-cyan-400 font-medium text-center flex justify-center items-center"
                          >
                            {button.type === "URL" && <ExternalLink className="h-4 w-4 mr-2" />}
                            {button.type === "COPY_CODE" && <Copy className="h-4 w-4 mr-2" />}
                            {button.type === "PHONE_NUMBER" && <Phone className="h-4 w-4 mr-2" />}
                            {button.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Diretrizes de Aprovação</CardTitle>
              <CardDescription>
                Siga estas regras para aumentar as chances de aprovação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Importante</AlertTitle>
                <AlertDescription>
                  Templates que não seguem as diretrizes serão rejeitados pelo WhatsApp.
                </AlertDescription>
              </Alert>
              
              <div>
                <h3 className="font-medium mb-1">Nome do Template</h3>
                <p className="text-xs text-muted-foreground">
                  Use apenas letras minúsculas, números e underscore. Sem espaços ou caracteres especiais.
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">Categoria</h3>
                <p className="text-xs text-muted-foreground">
                  Use a categoria correta para o propósito do seu template.
                  <br />
                  <strong>Utilidade:</strong> Mensagens transacionais, confirmações
                  <br />
                  <strong>Marketing:</strong> Promoções, ofertas
                  <br />
                  <strong>Autenticação:</strong> Códigos de acesso
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">Conteúdo</h3>
                <p className="text-xs text-muted-foreground">
                  • Texto claro e direto, sem erros gramaticais
                  <br />
                  • Sem conteúdo abusivo, ameaçador ou proibido
                  <br />
                  • Sem solicitação de dados confidenciais
                  <br />
                  • Exemplos precisos para todas as variáveis
                </p>
              </div>
              
              <div>
                <h3 className="font-medium mb-1">Variáveis</h3>
                <p className="text-xs text-muted-foreground">
                  • Use formato {`{{número}}`} (ex: {`{{1}}`}, {`{{2}}`})
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="md:col-span-3 flex justify-between mt-6">
          <Button variant="outline" onClick={() => setCurrentStep("configurar")}>
            Voltar
          </Button>
          <Button onClick={avancarParaProximaEtapa} disabled={!isFormValid()}>
            Avançar
          </Button>
        </div>
      </div>
    )}
              
    {currentStep === "analisar" && (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Revisar Template</CardTitle>
            <CardDescription>Verifique se seu template está correto antes de enviar</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Informações Gerais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Nome:</p>
                    <p className="bg-muted p-2 rounded text-sm">{name}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Categoria:</p>
                    <Badge 
                      className={
                        category === "UTILITY" ? "bg-blue-100 text-blue-800" :
                        category === "MARKETING" ? "bg-amber-100 text-amber-800" :
                        "bg-green-100 text-green-800"
                      }
                    >
                      {category}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Idioma:</p>
                    <p className="bg-muted p-2 rounded text-sm">Português (pt_BR)</p>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              {/* Preview do Template */}
              <div className="space-y-4">
                <div className="flex flex-col space-y-1.5 mb-2">
                  <h3 className="text-lg font-semibold">Visualização do Template</h3>
                  <p className="text-sm text-muted-foreground">Veja como o template ficará após aprovação</p>
                </div>

                <Tabs defaultValue="visual">
                  <TabsList>
                    <TabsTrigger value="visual">Visual</TabsTrigger>
                    <TabsTrigger value="json">JSON</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="visual">
                    {getPreviewComponents().map((c, i) => (
                      <div key={i} className="border p-4 rounded-md mb-4">
                        <h3 className="font-semibold mb-2">{c.type.toUpperCase()}</h3>
                        {c.format && (
                          <p className="text-sm mb-2">
                            <strong>Formato:</strong> {c.format.toUpperCase()}
                          </p>
                        )}
                        {c.text && (
                          <pre className="bg-muted p-2 rounded mb-2 whitespace-pre-wrap text-sm">
                            {c.text}
                          </pre>
                        )}
                        {c.buttons && c.buttons.length > 0 && (
                          <div className="mb-2">
                            <p className="font-medium">Botões:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {c.buttons.map((b, idx) => (
                                <div
                                  key={idx}
                                  className="border p-3 rounded shadow-sm hover:shadow-md transition-shadow"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge variant="outline" className="font-mono text-xs">
                                      {b.type.toUpperCase()}
                                    </Badge>
                                    <span className="font-medium">{b.text}</span>
                                  </div>
                                  
                                  {b.url && (
                                    <a 
                                      href={b.url} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
                                    >
                                      {b.url}
                                    </a>
                                  )}
                                  
                                  {b.phoneNumber && (
                                    <a 
                                      href={`tel:${b.phoneNumber}`} 
                                      className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1"
                                    >
                                      <Phone className="h-3 w-3" />
                                      {b.phoneNumber}
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="json">
                    <pre className="bg-muted p-4 rounded overflow-auto text-xs max-h-[400px]">
                      {JSON.stringify(getPreviewComponents(), null, 2)}
                    </pre>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <Alert variant="default" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Atenção</AlertTitle>
              <AlertDescription className="text-xs">
                Após o envio, seu template passará por aprovação do WhatsApp.
                Templates promocionais podem demorar mais para serem aprovados.
              </AlertDescription>
            </Alert>
            
            <div className="flex w-full justify-between">
              <Button 
                variant="outline" 
                onClick={() => setCurrentStep("editar")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
              <div className="flex gap-2">
                <TemplateLibrarySelector
                  type="template"
                  onSelect={(template) => {
                    // Load template data from library
                    const content = template.content as any;
                    setName(template.name);
                    setCategory(template.category?.toUpperCase() as any || 'UTILITY');
                    setLanguage(template.language || 'pt_BR');
                    setHeaderText(content.header || '');
                    setBodyText(content.body || '');
                    setFooterText(content.footer || '');
                    setButtons(content.buttons || []);
                    if (content.mediaUrl) {
                      setHeaderMetaMedia([{ url: content.mediaUrl, status: 'success' as const }]);
                      setHeaderType(content.mediaType?.toUpperCase() as any || 'IMAGE');
                    }
                    toast.success('Template carregado da biblioteca!');
                  }}
                />
                <SaveToLibraryButton 
                  templateData={{
                    name,
                    category,
                    language,
                    headerType,
                    headerText,
                    bodyText,
                    footerText,
                    buttons,
                    headerMetaMedia
                  }}
                  disabled={!isFormValid() || isSubmitting}
                />
                <Button
                  onClick={createTemplate}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Template
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardFooter>
        </Card>
      </div>
    )}
      
    {/* Mostrar ID do template após criação */}
    {creationSuccess && templateId && (
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Template criado com sucesso!</CardTitle>
            <CardDescription>
              Seu template foi enviado para análise e será revisado pelo WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-md">
              <p className="text-sm font-semibold mb-2">ID do Template (código da oferta):</p>
              <p className="font-mono bg-black/5 p-3 rounded text-xs break-all">{templateId}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )}
  </div>
);
} 