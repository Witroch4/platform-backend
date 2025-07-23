import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin } from 'lucide-react';
import type { InteractiveMessage } from '../types';

interface LocationConfigProps {
  message: InteractiveMessage;
  updateMessage: (updates: Partial<InteractiveMessage>) => void;
}

export const LocationConfig: React.FC<LocationConfigProps> = ({ message, updateMessage }) => {
  const getLocation = () =>
    message.action && message.action.type === 'location' ? message.action.action : { latitude: '', longitude: '', name: '', address: '' };
  const location = getLocation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Configuração da Localização
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Latitude</Label>
            <Input
              placeholder="-23.5505"
              value={location.latitude || ""}
              onChange={(e) =>
                updateMessage({
                  action: {
                    type: "location",
                    action: {
                      ...location,
                      latitude: e.target.value,
                    },
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Longitude</Label>
            <Input
              placeholder="-46.6333"
              value={location.longitude || ""}
              onChange={(e) =>
                updateMessage({
                  action: {
                    type: "location",
                    action: {
                      ...location,
                      longitude: e.target.value,
                    },
                  },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Nome do Local (Opcional)</Label>
          <Input
            placeholder="Ex: Escritório Central"
            value={location.name || ""}
            onChange={(e) =>
              updateMessage({
                action: {
                  type: "location",
                  action: {
                    ...location,
                    name: e.target.value,
                  },
                },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label>Endereço (Opcional)</Label>
          <Input
            placeholder="Ex: Rua das Flores, 123 - São Paulo, SP"
            value={location.address || ""}
            onChange={(e) =>
              updateMessage({
                action: {
                  type: "location",
                  action: {
                    ...location,
                    address: e.target.value,
                  },
                },
              })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
};
