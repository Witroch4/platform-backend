"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import axios from "axios";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { toast } from "sonner";
import FileUpload, { type UploadedFile } from "@/components/custom/FileUpload";

interface TemplateDetail {
  id: string;
  name: string;
  category: string;
  subCategory?: string | null;
  status: string;
  language: string;
  qualityScore?: string | null;
  correctCategory?: string | null;
  ctaUrlLinkTrackingOptedOut?: boolean | null;
  libraryTemplateName?: string | null;
  messageSendTtlSeconds?: number | null;
  parameterFormat?: string | null;
  previousCategory?: string | null;
  lastEdited?: Date | null;
  publicMediaUrl?: string | null;
  components: Array<{
    type: string;
    format?: string;
    text?: string;
    variables?: false | Array<{
      name: string;
      description: string;
      example: string;
    }>;
    buttons?: Array<{
      type: string;
      text: string;
      url: string | null;
      phone_number: string | null;
    }>;
    example?: any;
  }>;
}

export default function EditTemplateDetailsPage() {
  const params = useParams();
  const router = useRouter();
  
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [formData, setFormData] = useState<any>({
    headerUrl: "",
    bodyText: "",
    footerText: "",
    buttons: [] as {tipo: string, texto: string, url?: string, telefone?: string}[]
  });
  const [headerMedia, setHeaderMedia] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const actualTemplateId = params?.id as string;
  
  useEffect(() => {
    const fetchTemplateDetails = async () => {
      if (!actualTemplateId) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await axios.get(`/api/admin/mtf-diamante/template-info?template=${actualTemplateId}`);
        
        if (!response.data.success) {
          setError(response.data.details || "Erro ao carregar informações do template");
          setTemplate(null);
        } else {
          // Converter o formato recebido para o formato que usamos localmente
          const templateData = response.data.template;
          const template = {
            id: actualTemplateId,
            name: templateData.name,
            category: templateData.category,
            status: templateData.status || "UNKNOWN",
            language: templateData.language || "pt_BR",
            subCategory: templateData.sub_category,
            qualityScore: templateData.quality_score,
            correctCategory: templateData.correct_category,
            ctaUrlLinkTrackingOptedOut: templateData.cta_url_link_tracking_opted_out,
            libraryTemplateName: templateData.library_template_name,
            messageSendTtlSeconds: templateData.message_send_ttl_seconds,
            parameterFormat: templateData.parameter_format,
            previousCategory: templateData.previous_category,
            lastEdited: templateData.lastEdited ? new Date(templateData.lastEdited) : null,
            publicMediaUrl: templateData.publicMediaUrl,
            components: templateData.components || []
          };
          
          setTemplate(template);
          
          // Preencher o formulário com os dados do template
          const formValues: any = {
            headerUrl: "",
            bodyText: "",
            footerText: "",
            buttons: []
          };
          
          template.components.forEach((component: any) => {
            if (component.type === "HEADER" && 
               ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.format)) {
              // Preferir usar a URL pública do MinIO se disponível
              if (template.publicMediaUrl) {
                formValues.headerUrl = template.publicMediaUrl;
                console.log("Usando URL pública do MinIO:", template.publicMediaUrl);
                
                // Inicializar o headerMedia com a imagem existente do MinIO
                setHeaderMedia([{
                  id: 'existing-header',
                  url: template.publicMediaUrl,
                  progress: 100,
                  mime_type: component.format === 'IMAGE' ? 'image/jpeg' :
                            component.format === 'VIDEO' ? 'video/mp4' :
                            component.format === 'DOCUMENT' ? 'application/pdf' : 'application/octet-stream',
                  visible_name: `Mídia do cabeçalho (${component.format.toLowerCase()})`
                }]);
              } 
              // Caso contrário, usar a URL do WhatsApp
              else if (component.example?.header_handle?.[0]) {
                formValues.headerUrl = component.example.header_handle[0];
                
                // Inicializar o headerMedia com a imagem existente
                if (formValues.headerUrl) {
                  setHeaderMedia([{
                    id: 'existing-header',
                    url: formValues.headerUrl,
                    progress: 100,
                    mime_type: component.format === 'IMAGE' ? 'image/jpeg' :
                              component.format === 'VIDEO' ? 'video/mp4' :
                              component.format === 'DOCUMENT' ? 'application/pdf' : 'application/octet-stream',
                    visible_name: `Mídia do cabeçalho (${component.format.toLowerCase()})`
                  }]);
                }
              }
            } else if (component.type === "BODY" && component.text) {
              formValues.bodyText = component.text;
            } else if (component.type === "FOOTER" && component.text) {
              formValues.footerText = component.text;
            } else if (component.type === "BUTTONS" && component.buttons) {
              formValues.buttons = component.buttons.map((botao: any) => ({
                tipo: botao.type,
                texto: botao.text,
                url: botao.url || "",
                telefone: botao.phone_number || ""
              }));
            }
          });
          
          setFormData(formValues);
        }
      } catch (err) {
        console.error("Erro ao buscar detalhes do template:", err);
        setError("Erro ao carregar as informações do template");
        setTemplate(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplateDetails();
  }, [actualTemplateId]);
  
  // Efeito para atualizar headerUrl quando headerMedia mudar
  useEffect(() => {
    if (headerMedia.length > 0 && headerMedia[0].url) {
      setFormData((prev: typeof formData) => ({
        ...prev,
        headerUrl: headerMedia[0].url
      }));
    }
  }, [headerMedia]);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleButtonChange = (index: number, field: string, value: string) => {
    setFormData((prev: any) => {
      const newButtons = [...prev.buttons];
      newButtons[index] = {
        ...newButtons[index],
        [field]: value
      };
      return {
        ...prev,
        buttons: newButtons
      };
    });
  };
  
  const handleSave = async () => {
    if (!template) return;
    
    try {
      setIsSaving(true);
      
      // Montar o objeto para atualização do template
      const updatedComponents = [...template.components];
      
      // Atualizar URL do header se houver componente de header com formato de imagem
      const headerIdx = updatedComponents.findIndex(c => c.type === "HEADER" && c.format === "IMAGE");
      if (headerIdx >= 0 && formData.headerUrl) {
        updatedComponents[headerIdx] = {
          ...updatedComponents[headerIdx],
          example: {
            header_handle: [formData.headerUrl]
          }
        } as any; // Type assertion to avoid TypeScript error
      }
      
      // Atualizar texto do body
      const bodyIdx = updatedComponents.findIndex(c => c.type === "BODY");
      if (bodyIdx >= 0) {
        updatedComponents[bodyIdx] = {
          ...updatedComponents[bodyIdx],
          text: formData.bodyText
        };
      }
      
      // Atualizar texto do footer
      const footerIdx = updatedComponents.findIndex(c => c.type === "FOOTER");
      if (footerIdx >= 0) {
        updatedComponents[footerIdx] = {
          ...updatedComponents[footerIdx],
          text: formData.footerText
        };
      }
      
      // Atualizar botões
      const buttonsIdx = updatedComponents.findIndex(c => c.type === "BUTTONS");
      if (buttonsIdx >= 0) {
        updatedComponents[buttonsIdx] = {
          ...updatedComponents[buttonsIdx],
          buttons: formData.buttons.map((btn: any) => ({
            type: btn.tipo,
            text: btn.texto,
            url: btn.url || null,
            phone_number: btn.telefone || null
          }))
        };
      }
      
      // Enviar para a API
      const response = await axios.put('/api/admin/mtf-diamante/template-update', {
        templateId: template.id,
        name: template.name,
        components: updatedComponents,
        submit_for_review: true // Enviar para análise
      });
      
      if (response.data.success) {
        toast("Template enviado para análise", { description: "As alterações foram enviadas para análise pelo WhatsApp e serão revisadas em breve."
          });
        router.push(`/admin/templates/${actualTemplateId}`);
      } else {
        toast.error("Erro ao atualizar template", { description: response.data.error || "Ocorreu um erro ao enviar as alterações para análise"
         });
      }
    } catch (err) {
      console.error("Erro ao atualizar template:", err);
      toast.error("Erro ao atualizar template", { description: "Ocorreu um erro ao enviar as alterações para análise"
       });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="container mx-auto py-10 max-w-6xl">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Carregando informações do template...</span>
        </div>
      </div>
    );
  }
  
  if (error || !template) {
    return (
      <div className="container mx-auto py-10 max-w-6xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>
            {error || "Template não encontrado"}
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="ghost" asChild>
            <Link href={`/admin/templates/${actualTemplateId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para detalhes do template
            </Link>
          </Button>
        </div>
      </div>
    );
  }
  
  // Verificar quais componentes existem no template
  const hasHeaderImage = template.components.some(c => c.type === "HEADER" && c.format === "IMAGE");
  const hasBody = template.components.some(c => c.type === "BODY");
  const hasFooter = template.components.some(c => c.type === "FOOTER");
  const hasButtons = template.components.some(c => c.type === "BUTTONS");
  
  // Adicionar função para verificar a origem da mídia
  function getMediaSourceLabel(url: string, template: TemplateDetail | null) {
    if (!url || !template) return "";
    
    if (template.publicMediaUrl && url === template.publicMediaUrl) {
      return "✅ Mídia armazenada localmente no MinIO (mais confiável)";
    }
    
    if (url.includes('whatsapp.net') || url.includes('fbcdn.net')) {
      return "⚠️ Mídia hospedada nos servidores da Meta (temporária)";
    }
    
    return "";
  }
  
  return (
    <div className="container mx-auto py-10 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/admin/templates/${actualTemplateId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Editar Template: {template.name}</h1>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Editar Template</CardTitle>
              <CardDescription>
                Atualize os componentes do template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {hasHeaderImage && (
                  <div>
                    <Label>Imagem do Header</Label>
                    <FileUpload 
                      uploadedFiles={headerMedia}
                      setUploadedFiles={setHeaderMedia}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Faça upload de uma nova imagem ou use a URL abaixo
                    </p>
                    
                    <div className="mt-2">
                      <Label htmlFor="headerUrl">URL da Imagem do Header</Label>
                      <Input
                        id="headerUrl"
                        name="headerUrl"
                        value={formData.headerUrl}
                        onChange={handleInputChange}
                        placeholder="https://exemplo.com/imagem.jpg"
                      />
                      {formData.headerUrl && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {getMediaSourceLabel(formData.headerUrl, template)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                
                {hasBody && (
                  <div>
                    <Label htmlFor="bodyText">Conteúdo do Body</Label>
                    <Textarea
                      id="bodyText"
                      name="bodyText"
                      value={formData.bodyText}
                      onChange={handleInputChange}
                      rows={6}
                      placeholder="Conteúdo principal da mensagem"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use *texto* para negrito e {'{{1}}'} para variáveis
                    </p>
                  </div>
                )}
                
                {hasFooter && (
                  <div>
                    <Label htmlFor="footerText">Texto do Footer</Label>
                    <Input
                      id="footerText"
                      name="footerText"
                      value={formData.footerText}
                      onChange={handleInputChange}
                      placeholder="Texto do rodapé"
                    />
                  </div>
                )}
                
                {hasButtons && formData.buttons.length > 0 && (
                  <div>
                    <Label>Botões</Label>
                    <div className="space-y-4 mt-2">
                      {formData.buttons.map((button: any, index: number) => (
                        <div key={index} className="border p-4 rounded-md">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor={`buttonText-${index}`}>Texto do Botão</Label>
                              <Input
                                id={`buttonText-${index}`}
                                value={button.texto}
                                onChange={(e) => handleButtonChange(index, 'texto', e.target.value)}
                                placeholder="Texto do botão"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor={`buttonType-${index}`}>Tipo</Label>
                              <Input
                                id={`buttonType-${index}`}
                                value={button.tipo}
                                onChange={(e) => handleButtonChange(index, 'tipo', e.target.value)}
                                disabled
                              />
                            </div>
                            
                            {button.tipo === 'URL' && (
                              <div className="col-span-2">
                                <Label htmlFor={`buttonUrl-${index}`}>URL</Label>
                                <Input
                                  id={`buttonUrl-${index}`}
                                  value={button.url || ''}
                                  onChange={(e) => handleButtonChange(index, 'url', e.target.value)}
                                  placeholder="https://exemplo.com"
                                />
                              </div>
                            )}
                            
                            {button.tipo === 'PHONE_NUMBER' && (
                              <div className="col-span-2">
                                <Label htmlFor={`buttonPhone-${index}`}>Telefone</Label>
                                <Input
                                  id={`buttonPhone-${index}`}
                                  value={button.telefone || ''}
                                  onChange={(e) => handleButtonChange(index, 'telefone', e.target.value)}
                                  placeholder="+5511999999999"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Enviar para análise
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Prévia do Template */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Prévia do modelo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 text-black dark:text-white">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-sm overflow-hidden mx-auto">
                  {/* Header com imagem (se houver) */}
                  {hasHeaderImage && formData.headerUrl && (
                    <div className="w-full h-40 bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <img 
                        src={formData.headerUrl} 
                        alt="Header" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x200?text=Imagem+Inválida";
                        }}
                      />
                    </div>
                  )}
                  
                  {/* Corpo da mensagem */}
                  <div className="p-4">
                    {hasBody && formData.bodyText && (
                      <div 
                        className="whitespace-pre-line mb-6"
                        dangerouslySetInnerHTML={{
                          __html: formData.bodyText
                            .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
                            .replace(/{{(\d+)}}/g, '<span class="bg-blue-100 dark:bg-blue-900 px-1 rounded">$1</span>')
                        }}
                      />
                    )}
                    
                    {/* Footer */}
                    {hasFooter && formData.footerText && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-4 border-t pt-2">
                        {formData.footerText}
                      </div>
                    )}
                    
                    {/* Botões */}
                    {hasButtons && formData.buttons.length > 0 && (
                      <div className="mt-4 border-t pt-3 space-y-2">
                        {formData.buttons.map((button: any, index: number) => (
                          <div key={index} className="w-full">
                            <button
                              className="w-full py-2 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-center rounded-md text-sm transition"
                            >
                              {button.texto || "Botão"}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 