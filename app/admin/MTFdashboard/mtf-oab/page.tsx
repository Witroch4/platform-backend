"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  Check,
  X,
  Loader2,
  Download,
  Trash2,
  Eye,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { useDropzone } from "react-dropzone";

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  uploadedAt: Date;
  description?: string;
  agentId?: string;
}

export default function MTFOABUploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setUploading(true);

    for (const file of acceptedFiles) {
      const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newFile: UploadedFile = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'uploading',
        progress: 0,
        uploadedAt: new Date(),
        agentId: selectedAgent || undefined
      };

      setFiles(prev => [...prev, newFile]);

      // Simular upload e processamento
      try {
        // Upload simulation
        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise(resolve => setTimeout(resolve, 200));
          setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, progress } : f
          ));
        }

        // Processing phase
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'processing', progress: 0 } : f
        ));

        // Processing simulation
        for (let progress = 0; progress <= 100; progress += 20) {
          await new Promise(resolve => setTimeout(resolve, 300));
          setFiles(prev => prev.map(f =>
            f.id === fileId ? { ...f, progress } : f
          ));
        }

        // Completion
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'completed', progress: 100 } : f
        ));

        toast.success(`Arquivo ${file.name} processado com sucesso!`);
      } catch (error) {
        setFiles(prev => prev.map(f =>
          f.id === fileId ? { ...f, status: 'error' } : f
        ));
        toast.error(`Erro ao processar ${file.name}`);
      }
    }

    setUploading(false);
  }, [selectedAgent]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
    toast.success("Arquivo removido");
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading': return 'bg-blue-500';
      case 'processing': return 'bg-yellow-500';
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <Check className="h-4 w-4" />;
      case 'error':
        return <X className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Upload OAB</h1>
            <p className="text-muted-foreground">
              Upload de arquivos para agentes especializados em documentos da OAB
            </p>
          </div>
          <Link href="/admin/MTFdashboard/mtf-oab/oab-eval">
            <Button variant="outline" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Avaliação OAB
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Area */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload de Documentos</CardTitle>
              <CardDescription>
                Arraste e solte ou clique para selecionar arquivos PDF, DOC, DOCX ou TXT
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-select">Agente Destino (Opcional)</Label>
                  <select
                    id="agent-select"
                    className="w-full p-2 border rounded-md"
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                  >
                    <option value="">Selecione um agente...</option>
                    <option value="oab-legal-expert">Especialista Legal OAB</option>
                    <option value="document-analyzer">Analisador de Documentos</option>
                    <option value="citation-validator">Validador de Citações</option>
                  </select>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  {isDragActive ? (
                    <p className="text-lg font-medium">Solte os arquivos aqui...</p>
                  ) : (
                    <div>
                      <p className="text-lg font-medium mb-2">
                        Arraste arquivos aqui ou clique para selecionar
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Suporte: PDF, DOC, DOCX, TXT (máx. 10MB por arquivo)
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files List */}
          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Arquivos ({files.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {files.map((file) => (
                    <div key={file.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-md ${getStatusColor(file.status)}`}>
                            {getStatusIcon(file.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{file.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(file.size)} • {file.uploadedAt.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={file.status === 'completed' ? 'default' : 'secondary'}>
                            {file.status === 'uploading' && 'Enviando'}
                            {file.status === 'processing' && 'Processando'}
                            {file.status === 'completed' && 'Concluído'}
                            {file.status === 'error' && 'Erro'}
                          </Badge>
                          {file.status === 'completed' && (
                            <>
                              <Button size="sm" variant="outline">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeFile(file.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {(file.status === 'uploading' || file.status === 'processing') && (
                        <div className="space-y-2">
                          <Progress value={file.progress} className="w-full" />
                          <p className="text-xs text-muted-foreground">
                            {file.status === 'uploading' ? 'Enviando...' : 'Processando...'} {file.progress}%
                          </p>
                        </div>
                      )}

                      {file.agentId && (
                        <div className="mt-2">
                          <Badge variant="outline">
                            Agente: {file.agentId}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Estatísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{files.length}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">
                    {files.filter(f => f.status === 'completed').length}
                  </div>
                  <div className="text-xs text-muted-foreground">Processados</div>
                </div>
              </div>

              <div className="text-center p-3 bg-muted rounded-lg">
                <div className="text-lg font-bold">
                  {formatFileSize(files.reduce((acc, f) => acc + f.size, 0))}
                </div>
                <div className="text-xs text-muted-foreground">Tamanho Total</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agentes Disponíveis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Especialista Legal OAB</div>
                <div className="text-sm text-muted-foreground">
                  Análise especializada de documentos jurídicos
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Analisador de Documentos</div>
                <div className="text-sm text-muted-foreground">
                  Extração e estruturação de conteúdo
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="font-medium">Validador de Citações</div>
                <div className="text-sm text-muted-foreground">
                  Verificação de referências legais
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Informações
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Arquivos são processados automaticamente</p>
              <p>• Tamanho máximo: 10MB por arquivo</p>
              <p>• Formatos suportados: PDF, DOC, DOCX, TXT</p>
              <p>• Processamento pode levar alguns minutos</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
