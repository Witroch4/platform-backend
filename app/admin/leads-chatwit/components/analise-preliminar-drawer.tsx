"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Minus, Loader2, Check, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

interface AnaliseItem {
  titulo: string;
  descricao: string;
  valor: string;
  MelhoriasPropostas?: string;
}

interface AnaliseData {
  exameDescricao?: string;
  inscricao?: string;
  nomeExaminando?: string;
  seccional?: string;
  areaJuridica?: string;
  notaFinal?: string;
  situacao?: string;
  pontosPeca?: AnaliseItem[];
  subtotalPeca?: string;
  pontosQuestoes?: AnaliseItem[];
  subtotalQuestoes?: string;
  conclusao?: string;
  argumentacao?: string[];
  leadID?: string;
  analisepreliminar?: boolean;
  [key: string]: any; // Para permitir outros campos dinamicamente
}

interface AnalisePreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  analisePreliminar: any;
  leadId: string;
  onSave: (analiseData: any) => Promise<void>;
  onValidar: (analiseData: any) => Promise<void>;
}

export function AnalisePreviewDrawer({
  isOpen,
  onClose,
  analisePreliminar,
  leadId,
  onSave,
  onValidar,
}: AnalisePreviewDrawerProps) {
  const [analiseData, setAnaliseData] = useState<AnaliseData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  // Inicializar os dados da análise ao abrir o drawer
  useEffect(() => {
    if (isOpen && analisePreliminar) {
      setAnaliseData(analisePreliminar);
    }
  }, [isOpen, analisePreliminar]);

  // Funções para manipular os dados
  const updateCabecalho = (field: string, value: string) => {
    setAnaliseData((prev) => ({ ...prev, [field]: value }));
  };

  const updatePontoPeca = (index: number, field: string, value: string) => {
    if (!analiseData.pontosPeca) return;

    const novaPontuacao = [...analiseData.pontosPeca];
    novaPontuacao[index] = { ...novaPontuacao[index], [field]: value };
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      pontosPeca: novaPontuacao 
    }));
  };

  const updatePontoQuestao = (index: number, field: string, value: string) => {
    if (!analiseData.pontosQuestoes) return;

    const novaPontuacao = [...analiseData.pontosQuestoes];
    novaPontuacao[index] = { ...novaPontuacao[index], [field]: value };
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      pontosQuestoes: novaPontuacao 
    }));
  };

  const addPontoPeca = () => {
    const novoPonto: AnaliseItem = {
      titulo: "Novo Ponto",
      descricao: "Descrição do novo ponto",
      valor: "+0,00",
      MelhoriasPropostas: "Melhorias propostas para este ponto"
    };

    setAnaliseData((prev) => ({
      ...prev,
      pontosPeca: [...(prev.pontosPeca || []), novoPonto]
    }));
  };

  const removePontoPeca = (index: number) => {
    if (!analiseData.pontosPeca) return;

    const novaPontuacao = [...analiseData.pontosPeca];
    novaPontuacao.splice(index, 1);
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      pontosPeca: novaPontuacao 
    }));
  };

  const addPontoQuestao = () => {
    const novoPonto: AnaliseItem = {
      titulo: "Nova Questão",
      descricao: "Descrição da nova questão",
      valor: "+0,00",
      MelhoriasPropostas: "Melhorias propostas para esta questão"
    };

    setAnaliseData((prev) => ({
      ...prev,
      pontosQuestoes: [...(prev.pontosQuestoes || []), novoPonto]
    }));
  };

  const removePontoQuestao = (index: number) => {
    if (!analiseData.pontosQuestoes) return;

    const novaPontuacao = [...analiseData.pontosQuestoes];
    novaPontuacao.splice(index, 1);
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      pontosQuestoes: novaPontuacao 
    }));
  };

  const addArgumentacao = () => {
    const novaArgumentacao = "Nova argumentação";

    setAnaliseData((prev) => ({
      ...prev,
      argumentacao: [...(prev.argumentacao || []), novaArgumentacao]
    }));
  };

  const updateArgumentacao = (index: number, value: string) => {
    if (!analiseData.argumentacao) return;

    const novaArgumentacao = [...analiseData.argumentacao];
    novaArgumentacao[index] = value;
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      argumentacao: novaArgumentacao 
    }));
  };

  const removeArgumentacao = (index: number) => {
    if (!analiseData.argumentacao) return;

    const novaArgumentacao = [...analiseData.argumentacao];
    novaArgumentacao.splice(index, 1);
    
    setAnaliseData((prev) => ({ 
      ...prev, 
      argumentacao: novaArgumentacao 
    }));
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      await onSave(analiseData);
      toast("Alterações salvas", { description: "As alterações na análise preliminar foram salvas."  });
    } catch (error: any) {
      toast("Erro ao salvar", { description: error.message || "Não foi possível salvar as alterações."  });
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidar = async () => {
    try {
      setIsValidating(true);
      
      // Detectar se é análise de simulado baseado na pré-análise recebida
      const isAnaliseSimulado = analisePreliminar?.analisesimuladopreliminar === true;
      
      // Adicionar a flag apropriada ao payload de validação
      const validationData = {
        ...analiseData,
        ...(isAnaliseSimulado 
          ? { analisesimuladovalidado: true }  // Para análise de simulado
          : { analiseValidada: true }          // Para análise normal
        )
      };
      
      await onValidar(validationData);
      toast("Análise validada", { description: isAnaliseSimulado 
          ? "A análise de simulado foi validada e enviada para gerar o PDF final."
          : "A análise foi validada e enviada para gerar o PDF final."  });
      onClose();
    } catch (error: any) {
      toast("Erro ao validar", { description: error.message || "Não foi possível validar a análise."  });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="h-[90vh] max-h-[90vh] flex flex-col">
        <div className="container mx-auto max-w-5xl h-full flex flex-col">
          <DrawerHeader className="px-6 py-4">
            <DrawerTitle className="text-2xl">Pré-Análise da Prova</DrawerTitle>
            <DrawerDescription>
              Revise e edite os dados da análise preliminar antes de validá-la.
            </DrawerDescription>
          </DrawerHeader>

          <Tabs defaultValue="cabecalho" className="flex-1 flex flex-col">
            <TabsList className="grid grid-cols-4 mb-4 px-6">
              <TabsTrigger value="cabecalho">Cabeçalho</TabsTrigger>
              <TabsTrigger value="pontuacao">Pontuação</TabsTrigger>
              <TabsTrigger value="conclusao">Conclusão</TabsTrigger>
              <TabsTrigger value="argumentacao">Argumentação</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-hidden px-6 pb-4">
              {/* Cabeçalho */}
              <TabsContent value="cabecalho" className="h-full flex-1 overflow-hidden">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle>Informações do Exame</CardTitle>
                    <CardDescription>
                      Dados do examinando e do exame
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 flex-1 overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="exameDescricao">Descrição do Exame</Label>
                        <Input
                          id="exameDescricao"
                          value={analiseData.exameDescricao || ""}
                          onChange={(e) => updateCabecalho("exameDescricao", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="areaJuridica">Área Jurídica</Label>
                        <Input
                          id="areaJuridica"
                          value={analiseData.areaJuridica || ""}
                          onChange={(e) => updateCabecalho("areaJuridica", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="nomeExaminando">Nome do Examinando</Label>
                        <Input
                          id="nomeExaminando"
                          value={analiseData.nomeExaminando || ""}
                          onChange={(e) => updateCabecalho("nomeExaminando", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="inscricao">Inscrição</Label>
                        <Input
                          id="inscricao"
                          value={analiseData.inscricao || ""}
                          onChange={(e) => updateCabecalho("inscricao", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="seccional">Seccional</Label>
                        <Input
                          id="seccional"
                          value={analiseData.seccional || ""}
                          onChange={(e) => updateCabecalho("seccional", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notaFinal">Nota Final</Label>
                        <Input
                          id="notaFinal"
                          value={analiseData.notaFinal || ""}
                          onChange={(e) => updateCabecalho("notaFinal", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="situacao">Situação</Label>
                        <Input
                          id="situacao"
                          value={analiseData.situacao || ""}
                          onChange={(e) => updateCabecalho("situacao", e.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Pontuação - com correção para o scroll */}
              <TabsContent 
                value="pontuacao" 
                className="h-full flex-1 overflow-y-scroll"
                style={{ height: "calc(100vh - 300px)" }}
              >
                <div className="space-y-4 pb-20">
                  {/* Pontos da Peça */}
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <CardTitle>Pontos da Peça</CardTitle>
                        <CardDescription>
                          Pontuação da peça processual
                        </CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                         
                        onClick={addPontoPeca} 
                        className="mt-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-4">
                        {analiseData.pontosPeca?.map((ponto, index) => (
                          <div key={`peca-${index}`} className="p-4 border rounded-lg relative">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="absolute top-1 right-1 h-6 w-6" 
                              onClick={() => removePontoPeca(index)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                            <div className="grid grid-cols-1 gap-4">
                              {/* Primeira linha - Título, Descrição e Valor */}
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor={`peca-titulo-${index}`}>Título</Label>
                                  <Input
                                    id={`peca-titulo-${index}`}
                                    value={ponto.titulo || ""}
                                    onChange={(e) => updatePontoPeca(index, "titulo", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-3">
                                  <Label htmlFor={`peca-descricao-${index}`}>Descrição</Label>
                                  <Input
                                    id={`peca-descricao-${index}`}
                                    value={ponto.descricao || ""}
                                    onChange={(e) => updatePontoPeca(index, "descricao", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <Label htmlFor={`peca-valor-${index}`}>Valor</Label>
                                  <Input
                                    id={`peca-valor-${index}`}
                                    value={ponto.valor || ""}
                                    onChange={(e) => updatePontoPeca(index, "valor", e.target.value)}
                                  />
                                </div>
                              </div>
                              {/* Segunda linha - Melhorias Propostas */}
                              <div className="space-y-2">
                                <Label htmlFor={`peca-melhorias-${index}`}>Melhorias Propostas</Label>
                                <Textarea
                                  id={`peca-melhorias-${index}`}
                                  rows={3}
                                  value={ponto.MelhoriasPropostas || ""}
                                  onChange={(e) => updatePontoPeca(index, "MelhoriasPropostas", e.target.value)}
                                  className="resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg mx-6 mb-4">
                      <Label htmlFor="subtotalPeca">Subtotal da Peça</Label>
                      <Input
                        id="subtotalPeca"
                        value={analiseData.subtotalPeca || ""}
                        onChange={(e) => updateCabecalho("subtotalPeca", e.target.value)}
                        className="max-w-[200px]"
                      />
                    </div>
                  </Card>

                  {/* Pontos das Questões */}
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <CardTitle>Pontos das Questões</CardTitle>
                        <CardDescription>
                          Pontuação das questões práticas
                        </CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                         
                        onClick={addPontoQuestao} 
                        className="mt-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-4">
                        {analiseData.pontosQuestoes?.map((ponto, index) => (
                          <div key={`questao-${index}`} className="p-4 border rounded-lg relative">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="absolute top-1 right-1 h-6 w-6" 
                              onClick={() => removePontoQuestao(index)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                            <div className="grid grid-cols-1 gap-4">
                              {/* Primeira linha - Título, Descrição e Valor */}
                              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                <div className="space-y-2 md:col-span-2">
                                  <Label htmlFor={`questao-titulo-${index}`}>Título</Label>
                                  <Input
                                    id={`questao-titulo-${index}`}
                                    value={ponto.titulo || ""}
                                    onChange={(e) => updatePontoQuestao(index, "titulo", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-3">
                                  <Label htmlFor={`questao-descricao-${index}`}>Descrição</Label>
                                  <Input
                                    id={`questao-descricao-${index}`}
                                    value={ponto.descricao || ""}
                                    onChange={(e) => updatePontoQuestao(index, "descricao", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <Label htmlFor={`questao-valor-${index}`}>Valor</Label>
                                  <Input
                                    id={`questao-valor-${index}`}
                                    value={ponto.valor || ""}
                                    onChange={(e) => updatePontoQuestao(index, "valor", e.target.value)}
                                  />
                                </div>
                              </div>
                              {/* Segunda linha - Melhorias Propostas */}
                              <div className="space-y-2">
                                <Label htmlFor={`questao-melhorias-${index}`}>Melhorias Propostas</Label>
                                <Textarea
                                  id={`questao-melhorias-${index}`}
                                  rows={3}
                                  value={ponto.MelhoriasPropostas || ""}
                                  onChange={(e) => updatePontoQuestao(index, "MelhoriasPropostas", e.target.value)}
                                  className="resize-none"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                    <div className="flex justify-between items-center p-2 bg-muted rounded-lg mx-6 mb-4">
                      <Label htmlFor="subtotalQuestoes">Subtotal das Questões</Label>
                      <Input
                        id="subtotalQuestoes"
                        value={analiseData.subtotalQuestoes || ""}
                        onChange={(e) => updateCabecalho("subtotalQuestoes", e.target.value)}
                        className="max-w-[200px]"
                      />
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Conclusão */}
              <TabsContent value="conclusao" className="h-full flex-1 overflow-hidden">
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-2">
                    <CardTitle>Conclusão da Análise</CardTitle>
                    <CardDescription>
                      Avaliação final sobre o potencial de recurso
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-auto">
                    <div className="h-full">
                      <Label htmlFor="conclusao">Conclusão</Label>
                      <Textarea
                        id="conclusao"
                        rows={10}
                        value={analiseData.conclusao || ""}
                        onChange={(e) => updateCabecalho("conclusao", e.target.value)}
                        className="min-h-[300px] h-[calc(100% - 25px)] mt-2 resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Argumentação */}
              <TabsContent 
                value="argumentacao" 
                className="h-full flex-1 overflow-y-scroll"
                style={{ height: "calc(100vh - 300px)" }}
              >
                <div className="space-y-4 pb-20">
                  <Card>
                    <CardHeader className="flex flex-row items-start justify-between pb-2">
                      <div>
                        <CardTitle>Argumentação para Recurso</CardTitle>
                        <CardDescription>
                          Pontos a serem destacados no recurso
                        </CardDescription>
                      </div>
                      <Button 
                        variant="outline" 
                         
                        onClick={addArgumentacao} 
                        className="mt-0"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar
                      </Button>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-4">
                        {analiseData.argumentacao?.map((arg, index) => (
                          <div key={`arg-${index}`} className="relative p-4 border rounded-lg">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="absolute top-1 right-1 h-6 w-6" 
                              onClick={() => removeArgumentacao(index)}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                            <div className="space-y-2 pr-8">
                              <Label htmlFor={`argumentacao-${index}`}>Ponto {index + 1}</Label>
                              <Textarea
                                id={`argumentacao-${index}`}
                                rows={3}
                                value={arg || ""}
                                onChange={(e) => updateArgumentacao(index, e.target.value)}
                                className="resize-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DrawerFooter className="py-4 border-t sticky bottom-0 bg-background mt-auto">
            <div className="flex flex-row items-center justify-between w-full">
              <div>
                <DrawerClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DrawerClose>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={handleSave} 
                  disabled={isLoading || isValidating}
                  variant="outline"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
                
                <Button 
                  onClick={handleValidar} 
                  disabled={isValidating || isLoading}
                  variant="default"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Validando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Validar Análise
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
} 