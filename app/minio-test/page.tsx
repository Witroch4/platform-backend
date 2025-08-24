"use client";

import React, { useState } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileUpload, { type UploadedFile } from "@/components/custom/FileUpload";

export default function MinioTestPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [urlToTest, setUrlToTest] = useState<string>("");
  const [testResult, setTestResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Função para testar uma URL
  const testUrl = async () => {
    if (!urlToTest) return;

    setIsLoading(true);
    setTestResult("");

    try {
      const response = await axios.get(urlToTest, {
        responseType: 'blob'
      });

      const contentType = response.headers['content-type'];
      const isImage = contentType?.startsWith('image/');

      if (isImage) {
        const imageUrl = URL.createObjectURL(response.data);
        setTestResult(`Sucesso! A URL retornou uma imagem (${contentType}). <br/><img src="${imageUrl}" alt="Imagem do MinIO" style="max-width: 100%; max-height: 300px;" />`);
      } else {
        setTestResult(`Sucesso! A URL retornou um arquivo do tipo ${contentType}.`);
      }
    } catch (error: any) {
      console.error("Erro ao testar URL:", error);
      setTestResult(`Erro: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Função para corrigir uma URL do MinIO
  const fixMinioUrl = (url: string): string => {
    if (!url) return url;
    return url.replace('objstore.witdev.com.br', 'objstoreapi.witdev.com.br');
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Teste de Imagens do MinIO</h1>

      <Tabs defaultValue="upload">
        <TabsList variant="line" className="mb-4">
          <TabsTrigger value="upload">Upload de Arquivos</TabsTrigger>
          <TabsTrigger value="test">Testar URLs</TabsTrigger>
          <TabsTrigger value="gallery">Galeria</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload de Arquivos</CardTitle>
              <CardDescription>
                Faça upload de arquivos para o MinIO e teste as URLs geradas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload uploadedFiles={uploadedFiles} setUploadedFiles={setUploadedFiles} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="test">
          <Card>
            <CardHeader>
              <CardTitle>Testar URL</CardTitle>
              <CardDescription>
                Cole uma URL do MinIO para testar se ela está acessível.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Cole a URL aqui"
                  value={urlToTest}
                  onChange={(e) => setUrlToTest(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={testUrl} disabled={isLoading}>
                  {isLoading ? "Testando..." : "Testar"}
                </Button>
              </div>

              {testResult && (
                <div className="mt-4 p-4 border rounded-md">
                  <div dangerouslySetInnerHTML={{ __html: testResult }} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery">
          <Card>
            <CardHeader>
              <CardTitle>Galeria de Imagens</CardTitle>
              <CardDescription>
                Visualize as imagens que você fez upload.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {uploadedFiles
                  .filter(file => file.progress === 100 && file.mime_type?.startsWith('image/'))
                  .map(file => (
                    <div key={file.id} className="border rounded-md overflow-hidden">
                      <div className="aspect-square relative">
                        <img
                          src={file.thumbnail_url || file.url}
                          alt={file.original_name || file.name || "Imagem"}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div className="p-2 text-sm">
                        <p className="font-medium truncate">{file.original_name || file.name}</p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(file.url, '_blank')}
                          >
                            Original
                          </Button>
                          {file.thumbnail_url && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(file.thumbnail_url, '_blank')}
                            >
                              Thumbnail
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                {uploadedFiles.filter(file => file.progress === 100 && file.mime_type?.startsWith('image/')).length === 0 && (
                  <p className="col-span-full text-center py-8 text-gray-500">
                    Nenhuma imagem disponível. Faça upload de imagens na aba "Upload de Arquivos".
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}