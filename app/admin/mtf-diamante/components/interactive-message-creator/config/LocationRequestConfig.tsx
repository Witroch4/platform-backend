import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from 'lucide-react';
import type { InteractiveMessage } from '../types';

interface LocationRequestConfigProps {
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}

export const LocationRequestConfig: React.FC<LocationRequestConfigProps> = ({ message, updateAction }) => {
  React.useEffect(() => {
    updateAction({
      action: {
        requestText: '',
      },
      type: 'location_request',
    });
  }, [updateAction]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Navigation className="h-4 w-4" />
          Solicitação de Localização
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-center py-8 text-muted-foreground">
          <Navigation className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">
            Esta mensagem solicitará a localização do usuário
          </p>
          <p className="text-xs">Não há configurações adicionais necessárias</p>
        </div>
      </CardContent>
    </Card>
  );
};
