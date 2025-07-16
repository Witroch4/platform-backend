'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface WhatsAppConfig {
  id?: string;
  phoneNumberId: string;
  token: string;
}

interface ConfiguracoesLoteTabProps {
  configPadrao: WhatsAppConfig | null;
  onUpdate: () => void; // Função para recarregar os dados na página pai
}

const ConfiguracoesLoteTab = ({ configPadrao, onUpdate }: ConfiguracoesLoteTabProps) => {
  const [config, setConfig] = useState<WhatsAppConfig>({ phoneNumberId: '', token: '' });

  useEffect(() => {
    if (configPadrao) {
      setConfig(configPadrao);
    }
  }, [configPadrao]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/atendimento/configuracoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Envia sem caixaId para salvar como configuração global
        body: JSON.stringify({ 
          phoneNumberId: config.phoneNumberId,
          token: config.token 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao salvar configurações globais.');
      }
      
      toast.success('Configurações globais salvas com sucesso!');
      onUpdate(); // Notifica o componente pai para recarregar os dados
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurações Globais do WhatsApp</CardTitle>
        <CardDescription>
          Estas configurações se aplicam a todas as caixas de entrada que não possuem uma configuração espec��fica.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phoneNumberId">Phone Number ID</Label>
            <Input
              id="phoneNumberId"
              name="phoneNumberId"
              value={config.phoneNumberId}
              onChange={handleChange}
              placeholder="ID do Número de Telefone da Meta"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Token de Acesso Permanente</Label>
            <Input
              id="token"
              name="token"
              type="password"
              value={config.token}
              onChange={handleChange}
              placeholder="Seu token de acesso da API do WhatsApp"
              required
            />
          </div>
          <Button type="submit">Salvar Configurações Globais</Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ConfiguracoesLoteTab;
