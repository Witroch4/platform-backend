"use client";

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle, Loader2, EyeIcon, EyeOffIcon, ImageIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface Contact {
  nome: string;
  numero: string;
}

interface TemplateInfo {
  nome: string;
  categoria: string;
  componentes: Array<{
    tipo: string;
    texto?: string;
    formato?: string;
    variaveis?: any;
  }>;
}

export default function DisparoOABPage() {
  
  const [csvData, setCsvData] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [progresso, setProgresso] = useState(0);
  const [imageUrl, setImageUrl] = useState<string>('https://amandasousaprev.adv.br/wp-content/uploads/2024/10/AmandaFOTO.jpg');
  const [templateInfo, setTemplateInfo] = useState<TemplateInfo | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);

  // Carregar informações do template
  useEffect(() => {
    const fetchTemplateInfo = async () => {
      try {
        setLoadingTemplate(true);
        const response = await axios.get('/api/admin/mtf-diamante/template-info?template=satisfacao_oab');
        if (response.data.success) {
          setTemplateInfo(response.data.template);
        }
      } catch (error) {
        console.error("Erro ao buscar informações do template:", error);
      } finally {
        setLoadingTemplate(false);
      }
    };

    fetchTemplateInfo();
  }, []);

  // Configurar dropzone para upload de CSV
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const csvContent = reader.result as string;
        setCsvData(csvContent);
        
        // Exibir prévia dos contatos
        const lines = csvContent.split('\n');
        const header = lines[0].split(',');
        
        const parsedContacts: Contact[] = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          
          const values = lines[i].split(',');
          const contact: Contact = {
            nome: values[0]?.trim() || '',
            numero: values[1]?.trim() || ''
          };
          
          if (contact.nome && contact.numero) {
            parsedContacts.push(contact);
          }
        }
        
        setContacts(parsedContacts);
      };
      reader.readAsText(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: {
      'text/csv': ['.csv']
    },
    maxFiles: 1
  });

  // Função para enviar mensagens com o template OAB
  const enviarMensagens = async () => {
    if (!csvData) {
      toast.error("Arquivo CSV não carregado", { description: "Por favor, faça upload de um arquivo CSV com os contatos."
       });
      return;
    }

    try {
      setEnviando(true);
      setProgresso(10);

      const payload = {
        contatos: contacts,
        templateName: 'satisfacao_oab',
        configuracoes: {
          headerMedia: imageUrl
        }
      };

      setProgresso(30);
      
      const response = await axios.post('/api/admin/mtf-diamante/disparo', payload);
      
      setProgresso(100);
      setResultado(response.data);
      
      toast("Disparo OAB concluído", {
        description: `${response.data.results.enviados} mensagens enviadas de ${response.data.results.total}.`
      });
    } catch (error: any) {
      toast.error("Erro no disparo OAB", { description: error.response?.data?.error || "Ocorreu um erro ao enviar as mensagens."
       });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">Disparo Exclusivo - Template OAB</h1>
        <p className="text-muted-foreground mb-8">
          Use este sistema para enviar mensagens com o template "satisfacao_oab" específico para advogados da OAB.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-3">
            <Card className="mb-6 border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">Upload de Lista de Contatos</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Envie um arquivo CSV com a lista de contatos para envio. O arquivo deve ter as colunas "Nome" e "Numero".
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-md p-10 text-center cursor-pointer transition-colors",
                    isDragActive ? "border-primary bg-primary/10" : "border-border hover:bg-accent/10"
                  )}
                >
                  <input {...getInputProps()} />
                  {isDragActive ? (
                    <p className="text-foreground">Solte o arquivo aqui...</p>
                  ) : (
                    <div>
                      <p className="text-foreground">Arraste e solte um arquivo CSV aqui, ou clique para selecionar</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Formato: "Nome,Numero" (uma entrada por linha)
                      </p>
                    </div>
                  )}
                </div>

                {contacts.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium mb-2 text-card-foreground">Contatos Carregados ({contacts.length})</h3>
                    <div className="border border-border rounded-md overflow-hidden">
                      <div className="grid grid-cols-2 font-medium bg-accent p-2">
                        <div className="text-card-foreground">Nome</div>
                        <div className="text-card-foreground">Número</div>
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {contacts.map((contact, index) => (
                          <div key={index} className="grid grid-cols-2 p-2 border-t border-border">
                            <div className="text-card-foreground">{contact.nome}</div>
                            <div className="text-card-foreground">{contact.numero}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">Customização do Template</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Personalize a aparência do template "satisfacao_oab"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="imageUrl" className="text-card-foreground">URL da Imagem de Cabeçalho</Label>
                  <div className="flex">
                    <Input
                      id="imageUrl"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://exemplo.com/imagem.jpg"
                      className="flex-1 border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-ring"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="ml-2 border-border hover:bg-accent"
                      onClick={() => {
                        window.open(imageUrl, '_blank');
                      }}
                    >
                      <ImageIcon className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    URL da imagem que será exibida no cabeçalho da mensagem. Recomendado: 400x400px.
                  </p>
                </div>

                <div className="pt-4">
                  <h3 className="text-sm font-medium mb-2 text-card-foreground">Prévia do Template</h3>
                  {loadingTemplate ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span className="text-card-foreground">Carregando informações do template...</span>
                    </div>
                  ) : templateInfo ? (
                    <div className="border border-border rounded-md p-4 bg-card">
                      <div className="bg-muted p-3 rounded-md mb-3 flex justify-center">
                        <div className="w-32 h-32 bg-muted flex items-center justify-center rounded-md overflow-hidden">
                          <img 
                            src={imageUrl} 
                            alt="Header" 
                            className="max-w-full max-h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'https://placehold.co/400x400/gray/white?text=Imagem+Inválida';
                            }}
                          />
                        </div>
                      </div>
                      <div className="whitespace-pre-line text-card-foreground">
                        {templateInfo.componentes.find(c => c.tipo === "BODY")?.texto?.replace("{{1}}", "<nome do contato>")}
                      </div>
                    </div>
                  ) : (
                    <Alert variant="default" className="bg-muted border-border">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-card-foreground">Informações não disponíveis</AlertTitle>
                      <AlertDescription className="text-muted-foreground">
                        Não foi possível carregar as informações do template.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  onClick={enviarMensagens} 
                  disabled={!csvData || enviando}
                  className="w-full"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando mensagens...
                    </>
                  ) : (
                    "Iniciar Disparo de Mensagens OAB"
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="md:col-span-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-card-foreground">Informações do Template</CardTitle>
                <CardDescription className="text-muted-foreground">
                  Detalhes sobre o template de satisfação OAB
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">Nome do Template</h3>
                    <p className="font-mono text-sm text-card-foreground">satisfacao_oab</p>
                  </div>
                  
                  <Separator className="bg-border" />
                  
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">Categoria</h3>
                    <p className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-md inline-block text-xs">UTILITY</p>
                  </div>
                  
                  <Separator className="bg-border" />
                  
                  <div>
                    <h3 className="text-sm font-semibold text-card-foreground">Variáveis</h3>
                    <div className="mt-2">
                      <div className="bg-muted p-2 rounded-md border border-border">
                        <span className="font-mono text-xs text-card-foreground">{'{{1}}'}</span>
                        <p className="text-xs text-muted-foreground mt-1">Nome do contato (advogado)</p>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="bg-border" />
                  
                  <Alert className="border-border bg-muted/30">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-card-foreground">Importante</AlertTitle>
                    <AlertDescription className="text-muted-foreground">
                      Este template é específico para envio a advogados da OAB. Certifique-se de que sua lista contém apenas advogados.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>

            {enviando && (
              <Card className="mt-6 border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Progresso do Envio</CardTitle>
                </CardHeader>
                <CardContent>
                  <Progress value={progresso} className="h-2" />
                  <p className="text-sm text-center mt-2 text-card-foreground">
                    {progresso < 100 ? `${progresso}% concluído` : "Envio concluído!"}
                  </p>
                </CardContent>
              </Card>
            )}

            {resultado && (
              <Card className="mt-6 border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-card-foreground">Resultados do Envio</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-muted p-2 rounded-md text-center border border-border">
                      <p className="text-xs font-medium text-card-foreground">Total</p>
                      <p className="text-xl font-bold text-card-foreground">{resultado.results.total}</p>
                    </div>
                    <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-md text-center border border-border">
                      <p className="text-xs font-medium text-green-800 dark:text-green-400">Enviados</p>
                      <p className="text-xl font-bold text-green-800 dark:text-green-400">{resultado.results.enviados}</p>
                    </div>
                    <div className="bg-red-100 dark:bg-red-900/30 p-2 rounded-md text-center border border-border">
                      <p className="text-xs font-medium text-red-800 dark:text-red-400">Falhas</p>
                      <p className="text-xl font-bold text-red-800 dark:text-red-400">{resultado.results.falhas}</p>
                    </div>
                  </div>
                  
                  {resultado.results.falhas > 0 && (
                    <Alert variant="destructive" className="mt-4 border-border">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Atenção</AlertTitle>
                      <AlertDescription>
                        Houve {resultado.results.falhas} falhas no envio. Verifique os detalhes.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="outline" 
                     
                    onClick={() => setResultado(null)}
                    className="w-full border-border hover:bg-accent"
                  >
                    Limpar Resultados
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 