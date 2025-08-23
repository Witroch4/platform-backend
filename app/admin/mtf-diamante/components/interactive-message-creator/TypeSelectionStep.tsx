import type React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight } from 'lucide-react';
import type { InteractiveMessageType } from './types';
import { InteractiveMessageTypeSelector } from '../InteractiveMessageTypeSelector';

interface TypeSelectionStepProps {
  selectedType: InteractiveMessageType;
  onTypeSelect: (type: InteractiveMessageType) => void;
  inboxId?: string;
  channelType?: string;
  onNext?: () => void;
}

export const TypeSelectionStep: React.FC<TypeSelectionStepProps> = ({
  selectedType,
  onTypeSelect,
  inboxId,
  channelType = 'Channel::WhatsApp',
  onNext
}) => {

  return (
    <div className="space-y-6">
      <InteractiveMessageTypeSelector
        selectedType={selectedType}
        onTypeSelect={onTypeSelect}
        channelType={channelType}
        showExamples={true}
      />
      
      {selectedType && onNext && (
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-end">
              <Button onClick={onNext} className="flex items-center gap-2">
                Continuar
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
