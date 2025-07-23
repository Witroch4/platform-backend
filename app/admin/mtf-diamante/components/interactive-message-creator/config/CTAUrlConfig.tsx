import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ExternalLink } from 'lucide-react';
import type { InteractiveMessage } from '../types';
import { isCtaUrlAction } from '@/types/interactive-messages';

interface CTAUrlConfigProps {
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}

export const CTAUrlConfig: React.FC<CTAUrlConfigProps> = ({ message, updateAction }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <ExternalLink className="h-4 w-4" />
        Configuração do Botão URL
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>Texto do Botão</Label>
        <Input
          placeholder="Ex: Ver Mais, Acessar Site..."
          value={message.action && isCtaUrlAction(message.action) ? message.action.action.displayText : ""}
          onChange={(e) =>
            updateAction({
              action: {
                displayText: e.target.value,
                url: message.action && isCtaUrlAction(message.action) ? message.action.action.url : "",
              },
              type: "cta_url"
            })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>URL de Destino</Label>
        <Input
          placeholder="https://exemplo.com"
          value={message.action && isCtaUrlAction(message.action) ? message.action.action.url : ""}
          onChange={(e) =>
            updateAction({
              action: {
                displayText: message.action && isCtaUrlAction(message.action) ? message.action.action.displayText : "",
                url: e.target.value,
              },
              type: "cta_url"
            })
          }
        />
      </div>
    </CardContent>
  </Card>
);
