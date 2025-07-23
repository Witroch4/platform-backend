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
    tipo: string;
    formato?: string;
    texto?: string;
    variaveis: false | Array<{
      nome: string;
      descricao: string;
      exemplo: string;
    }>;
    botoes?: Array<{
      tipo: string;
      texto: string;
      url: string | null;
      telefone: string | null;
    }>;
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
            name: templateData.nome,
            category: templateData.categoria,
            status: templateData.status || "UNKNOWN",
            language: templateData.idioma || "pt_BR",
            subCategory: templateData.subCategoria,
            qualityScore: templateData.qualidadeScore,
            correctCategory: templateData.categoriaCorreta,
            ctaUrlLinkTrackingOptedOut: templateData.ctaUrlLinkTrackingOptedOut,
            libraryTemplateName: templateData.nomeTemplateBiblioteca,
            messageSendTtlSeconds: templateData.mensagemSendTtlSegundos,
            parameterFormat: templateData.formatoParametro,
            previousCategory: templateData.categoriaAnterior,
            lastEdited: templateData.ultimaEdicao ? new Date(templateData.ultimaEdicao) : null,
            publicMediaUrl: templateData.publicMediaUrl,
            components: templateData.componentes
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
            if (component.tipo === "HEADER" && 
               ["IMAGE", "VIDEO", "DOCUMENT"].includes(component.formato)) {
              // Preferir usar a URL pública do MinIO se disponível
              if (template.publicMediaUrl) {
                formValues.headerUrl = template.publicMediaUrl;
                console.log("Usando URL pública do MinIO:", template.publicMediaUrl);
                
                // Inicializar o headerMedia com a imagem existente do MinIO
                setHeaderMedia([{
                  id: 'existing-header',
                  url: template.publicMediaUrl,
                  progress: 100,
                  mime_type: component.formato === 'IMAGE' ? 'image/jpeg' :
                            component.formato === 'VIDEO' ? 'video/mp4' :
                            component.formato === 'DOCUMENT' ? 'application/pdf' : 'application/octet-stream',
                  visible_name: `Mídia do cabeçalho (${component.formato.toLowerCase()})`
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
                    mime_type: component.formato === 'IMAGE' ? 'image/jpeg' :
                              component.formato === 'VIDEO' ? 'video/mp4' :
                              component.formato === 'DOCUMENT' ? 'application/pdf' : 'application/octet-stream',
                    visible_name: `Mídia do cabeçalho (${component.formato.toLowerCase()})`
                  }]);
                }
              }
            } else if (component.tipo === "BODY" && component.texto) {
              formValues.bodyText = component.texto;
            } else if (component.tipo === "FOOTER" && component.texto) {
              formValues.footerText = component.texto;
            } else if (component.tipo === "BUTTONS" && component.botoes) {
              formValues.buttons = component.botoes.map((botao: any) => ({
                tipo: botao.tipo,
                texto: botao.texto,
                url: botao.url || "",
                telefone: botao.telefone || ""
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
      const headerIdx = updatedComponents.findIndex(c => c.tipo === "HEADER" && c.formato === "IMAGE");
      if (headerIdx >= 0 && formData.headerUrl) {
        updatedComponents[headerIdx] = {
          ...updatedComponents[headerIdx],
          example: {
            header_handle: [formData.headerUrl]
          }
        } as any; // Type assertion to avoid TypeScript error
      }
      
      // Atualizar texto do body
      const bodyIdx = updatedComponents.findIndex(c => c.tipo === "BODY");
      if (bodyIdx >= 0) {
        updatedComponents[bodyIdx] = {
          ...updatedComponents[bodyIdx],
          texto: formData.bodyText
        };
      }
      
      // Atualizar texto do footer
      const footerIdx = updatedComponents.findIndex(c => c.tipo === "FOOTER");
      if (footerIdx >= 0) {
        updatedComponents[footerIdx] = {
          ...updatedComponents[footerIdx],
          texto: formData.footerText
        };
      }
      
      // Atualizar botões
      const buttonsIdx = updatedComponents.findIndex(c => c.tipo === "BUTTONS");
      if (buttonsIdx >= 0) {
        updatedComponents[buttonsIdx] = {
          ...updatedComponents[buttonsIdx],
          botoes: formData.buttons.map((btn: any) => ({
            tipo: btn.tipo,
            texto: btn.texto,
            url: btn.url || null,
            telefone: btn.telefone || null
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
  const hasHeaderImage = template.components.some(c => c.tipo === "HEADER" && c.formato === "IMAGE");
  const hasBody = template.components.some(c => c.tipo === "BODY");
  const hasFooter = template.components.some(c => c.tipo === "FOOTER");
  const hasButtons = template.components.some(c => c.tipo === "BUTTONS");
  
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
              <div className="bg-gray-100 rounded-lg p-4 text-black">
                <div className="bg-white rounded-lg shadow-md w-full max-w-sm overflow-hidden mx-auto">
                  {/* Header com imagem (se houver) */}
                  {hasHeaderImage && formData.headerUrl && (
                    <div className="w-full h-40 bg-gray-200 overflow-hidden">
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
                            .replace(/{{(\d+)}}/g, '<span class="bg-blue-100 px-1 rounded">$1</span>')
                        }}
                      />
                    )}
                    
                    {/* Footer */}
                    {hasFooter && formData.footerText && (
                      <div className="text-xs text-gray-500 mt-4 border-t pt-2">
                        {formData.footerText}
                      </div>
                    )}
                    
                    {/* Botões */}
                    {hasButtons && formData.buttons.length > 0 && (
                      <div className="mt-4 border-t pt-3 space-y-2">
                        {formData.buttons.map((button: any, index: number) => (
                          <div key={index} className="w-full">
                            <button
                              className="w-full py-2 px-3 bg-gray-100 hover:bg-gray-200 text-center rounded-md text-sm transition"
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