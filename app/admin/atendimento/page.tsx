"use client";

import { Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Bot, Package, FileText, Zap } from 'lucide-react';

import { DialogflowIntegrations } from './components/DialogflowIntegrations';
import { DialogflowCaixasAgentes } from './components/DialogflowCaixasAgentes';
import { LotesManagement } from './components/LotesManagement';
import { TemplatesManagement } from './components/TemplatesManagement';
import { MensagensInterativas } from './components/MensagensInterativas';
import { ApiWhatsApp } from './components/ApiWhatsApp';

export default function AtendimentoPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Atendimento WhatsApp</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie integrações, lotes, templates e mensagens interativas do WhatsApp
        </p>
      </div>

      <Tabs defaultValue="integracoes" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="integracoes" className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            Integrações
          </TabsTrigger>
          <TabsTrigger value="lotes" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Lotes
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            API WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integracoes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Integrações Dialogflow
              </CardTitle>
              <CardDescription>
                Gerencie suas integrações com o Dialogflow. Crie, edite e ative diferentes configurações.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<DialogflowIntegrationsSkeleton />}>
                <DialogflowCaixasAgentes />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lotes" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Gerenciar Lotes
              </CardTitle>
              <CardDescription>
                Configure lotes de vendas com valores, datas e configurações específicas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<LotesManagementSkeleton />}>
                <LotesManagement />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-6">
          <Card>
            <CardHeader>
                             <CardTitle className="flex items-center gap-2">
                 <FileText className="w-5 h-5" />
                 Mapear Templates
               </CardTitle>
              <CardDescription>
                Gerencie templates do WhatsApp e configure seu uso dinâmico.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<TemplatesManagementSkeleton />}>
                <TemplatesManagement />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mensagens" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Mensagens Interativas
              </CardTitle>
              <CardDescription>
                Crie e gerencie mensagens interativas com botões e conteúdo personalizado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<MensagensInterativasSkeleton />}>
                <MensagensInterativas />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5" />
                API WhatsApp
              </CardTitle>
              <CardDescription>
                Configure tokens e configurações da API do WhatsApp.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<ApiWhatsAppSkeleton />}>
                <ApiWhatsApp />
              </Suspense>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componentes de skeleton para loading
function DialogflowIntegrationsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

function LotesManagementSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    </div>
  );
}

function TemplatesManagementSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}

function MensagensInterativasSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}

function ApiWhatsAppSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
} 