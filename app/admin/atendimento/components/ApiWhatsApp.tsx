'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Save, TestTube, Info } from 'lucide-react';
import axios from 'axios';

interface WhatsAppConfig {
  fbGraphApiBase: string;
  whatsappBusinessAccountId: string;
  whatsappToken: string;
}

export function ApiWhatsApp() {
  const [config, setConfig] = useState<WhatsAppConfig>({
    fbGraphApiBase: 'https://graph.facebook.com/v22.0',
    whatsappBusinessAccountId: '',
    whatsappToken: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  // Carregar configurações existentes
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/admin/whatsapp-config');
        if (response.data.success) {
          setConfig(response.data.config);
        }
      } catch (error: any) {
        console.error('Erro ao carregar configurações:', error);
        // Se for erro 404 (usuário não tem UsuarioChatwit), mostrar aviso
        if (error.response?.status === 404) {
          toast.error('Configure primeiro', { 
            description: 'Configure seu token do Chatwit antes de usar a API do WhatsApp.' 
          });
        }
        // Usar valores padrão se não conseguir carregar
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      toast.error('Campos obrigatórios', { 
        description: 'ID da conta e token são obrigatórios.' 
      });
      return;
    }

    try {
      setSaving(true);
      const response = await axios.post('/api/admin/whatsapp-config', config);
      
      if (response.data.success) {
        toast.success('Configurações salvas com sucesso!');
      } else {
        throw new Error(response.data.error || 'Erro ao salvar');
      }
    } catch (error: any) {
      console.error('Erro ao salvar configurações:', error);
      
      // Tratamento específico para diferentes tipos de erro
      if (error.response?.status === 404) {
        toast.error('Configure primeiro', { 
          description: 'Configure seu token do Chatwit antes de salvar configurações do WhatsApp.' 
        });
      } else if (error.response?.status === 400) {
        toast.error('Dados inválidos', { 
          description: error.response.data.error || 'Verifique os dados informados.' 
        });
      } else {
        toast.error('Erro ao salvar', { 
          description: error.response?.data?.error || 'Ocorreu um erro ao salvar as configurações.' 
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.whatsappBusinessAccountId || !config.whatsappToken) {
      toast.error('Configure primeiro', { 
        description: 'Configure o ID da conta e token antes de testar.' 
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult('');
      
      // Testar a API do WhatsApp
      const response = await axios.get(
        `${config.fbGraphApiBase}/${config.whatsappBusinessAccountId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.whatsappToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setTestResult(JSON.stringify(response.data, null, 2));
      toast.success('Conexão testada com sucesso!');
    } catch (error: any) {
      console.error('Erro ao testar API:', error);
      setTestResult(error.response?.data ? JSON.stringify(error.response.data, null, 2) : 'Erro na conexão');
      toast.error('Erro no teste', { 
        description: error.response?.data?.error?.message || 'Falha ao conectar com a API do WhatsApp.' 
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Configurações da API do WhatsApp</h3>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Credenciais da API</CardTitle>
          <CardDescription>
            Configure suas credenciais para acesso à API do WhatsApp Business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Pré-requisito</AlertTitle>
            <AlertDescription>
              Para usar a API do WhatsApp, você precisa primeiro configurar seu token do Chatwit. 
              Acesse a página de leads do Chatwit e configure seu token de acesso.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fbGraphApiBase">URL Base da API do Facebook</Label>
              <Input
                id="fbGraphApiBase"
                value={config.fbGraphApiBase}
                onChange={(e) => setConfig({...config, fbGraphApiBase: e.target.value})}
                placeholder="https://graph.facebook.com/v22.0"
              />
              <p className="text-sm text-muted-foreground">
                URL base da API do Facebook Graph (geralmente não precisa ser alterada)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="whatsappBusinessAccountId">ID da Conta Business do WhatsApp</Label>
              <Input
                id="whatsappBusinessAccountId"
                value={config.whatsappBusinessAccountId}
                onChange={(e) => setConfig({...config, whatsappBusinessAccountId: e.target.value})}
                placeholder="123456789012345"
              />
              <p className="text-sm text-muted-foreground">
                ID da sua conta WhatsApp Business (WABA ID)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="whatsappToken">Token de Acesso</Label>
              <div className="flex">
                <Input
                  id="whatsappToken"
                  type={showToken ? "text" : "password"}
                  value={config.whatsappToken}
                  onChange={(e) => setConfig({...config, whatsappToken: e.target.value})}
                  placeholder="EAA..."
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="ml-2"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Token de acesso permanente da API do WhatsApp Business
              </p>
            </div>
          </div>

          {testResult && (
            <div className="space-y-2">
              <Label>Resultado do Teste</Label>
              <div className="bg-muted p-4 rounded-md overflow-x-auto">
                <pre className="text-xs">{testResult}</pre>
              </div>
            </div>
          )}
        </CardContent>
        <CardContent className="flex gap-2">
          <Button 
            onClick={handleSave} 
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </Button>
          
          <Button 
            onClick={handleTest} 
            disabled={testing}
            variant="outline"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testando...
              </>
            ) : (
              <>
                <TestTube className="mr-2 h-4 w-4" />
                Testar Conexão
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instruções</CardTitle>
          <CardDescription>
            Como obter suas credenciais da API do WhatsApp Business
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium">1. ID da Conta Business (WABA ID)</h4>
            <p className="text-sm text-muted-foreground">
              Acesse o Facebook Business Manager → WhatsApp → Suas contas → 
              Selecione sua conta → O ID estará visível no painel.
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">2. Token de Acesso</h4>
            <p className="text-sm text-muted-foreground">
              No Facebook Business Manager → Configurações → Usuários do sistema → 
              Crie um novo usuário do sistema com permissões para WhatsApp Business API.
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">3. Permissões Necessárias</h4>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>whatsapp_business_messaging</li>
              <li>whatsapp_business_management</li>
              <li>business_management</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 