// @ts-nocheck - Temporary ignore for type migration
import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Workflow } from 'lucide-react';
import type { InteractiveMessage } from '../types';
import { isFlowAction } from '@/types/interactive-messages';

interface FlowConfigProps {
  message: InteractiveMessage;
  updateAction: (updates: Partial<InteractiveMessage["action"]>) => void;
}

export const FlowConfig: React.FC<FlowConfigProps> = ({ message, updateAction }) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Workflow className="h-4 w-4" />
        Configuração do Fluxo
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Label>ID do Fluxo</Label>
        <Input
          placeholder="YOUR_FLOW_ID"
          value={message.action && isFlowAction(message.action) ? message.action.action.flowId : ""}
          onChange={(e) => {
            const flowCta = message.action && isFlowAction(message.action) ? message.action.action.flowCta ?? "" : "";
            const flowMode = message.action && isFlowAction(message.action) ? message.action.action.flowMode ?? "draft" : "draft";
            updateAction({
              action: {
                flowId: e.target.value,
                flowCta,
                flowMode,
              },
              type: "flow"
            });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>Texto do Botão</Label>
        <Input
          placeholder="Ex: Iniciar, Agendar..."
          value={message.action && isFlowAction(message.action) ? message.action.action.flowCta : ""}
          onChange={(e) => {
            const flowId = message.action && isFlowAction(message.action) ? message.action.action.flowId ?? "" : "";
            const flowMode = message.action && isFlowAction(message.action) ? message.action.action.flowMode ?? "draft" : "draft";
            updateAction({
              action: {
                flowId,
                flowCta: e.target.value,
                flowMode,
              },
              type: "flow"
            });
          }}
        />
      </div>

      <div className="space-y-2">
        <Label>Modo do Fluxo</Label>
        <Input
          placeholder="draft ou published"
          value={message.action && isFlowAction(message.action) ? message.action.action.flowMode : ""}
          onChange={(e) => {
            const flowId = message.action && isFlowAction(message.action) ? message.action.action.flowId ?? "" : "";
            const flowCta = message.action && isFlowAction(message.action) ? message.action.action.flowCta ?? "" : "";
            updateAction({
              action: {
                flowId,
                flowCta,
                flowMode: e.target.value as "draft" | "published",
              },
              type: "flow"
            });
          }}
        />
      </div>
    </CardContent>
  </Card>
);
