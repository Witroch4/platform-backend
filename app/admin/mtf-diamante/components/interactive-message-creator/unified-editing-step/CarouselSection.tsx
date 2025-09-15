"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Plus,
  X,
  Image,
  ExternalLink,
  Grip,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InteractiveMessage, CarouselElement } from "@/types/interactive-messages";
import { MESSAGE_LIMITS } from "@/types/interactive-messages";
import { generatePrefixedId } from "./utils";

interface CarouselSectionProps {
  message: InteractiveMessage;
  onMessageUpdate: (updates: Partial<InteractiveMessage>) => void;
  disabled?: boolean;
  channelType?: string;
  isFieldValid: (field: string) => boolean;
  validationLimits: typeof MESSAGE_LIMITS;
}

export const CarouselSection: React.FC<CarouselSectionProps> = ({
  message,
  onMessageUpdate,
  disabled = false,
  channelType,
  isFieldValid,
  validationLimits,
}) => {
  const [expandedElements, setExpandedElements] = useState<Set<number>>(new Set([0]));

  // Get carousel elements from message action
  const carouselElements = React.useMemo(() => {
    if (message.action?.type === "carousel") {
      return message.action.action?.elements || [];
    }
    return [];
  }, [message.action]);

  // Toggle element expansion
  const toggleElementExpansion = (index: number) => {
    const newExpanded = new Set(expandedElements);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedElements(newExpanded);
  };

  // Initialize carousel action if not exists
  const initializeCarousel = () => {
    if (message.action?.type !== "carousel") {
      onMessageUpdate({
        type: "carousel",
        action: {
          type: "carousel",
          action: {
            elements: [
              {
                id: generatePrefixedId(channelType || null, Math.random().toString(36).slice(2, 11)),
                title: "Elemento 1",
                subtitle: "",
                image_url: "",
                buttons: [],
              }
            ]
          }
        }
      });
    }
  };

  // Add new carousel element
  const addElement = () => {
    if (carouselElements.length >= 10) return; // Instagram limit

    const newElement: CarouselElement = {
      id: generatePrefixedId(channelType || null, Math.random().toString(36).slice(2, 11)),
      title: `Elemento ${carouselElements.length + 1}`,
      subtitle: "",
      image_url: "",
      buttons: [],
    };

    const updatedElements = [...carouselElements, newElement];
    const newIndex = updatedElements.length - 1;

    // Expand the new element
    setExpandedElements(prev => new Set([...prev, newIndex]));

    onMessageUpdate({
      action: {
        type: "carousel",
        action: {
          elements: updatedElements
        }
      }
    });
  };

  // Remove carousel element
  const removeElement = (index: number) => {
    if (carouselElements.length <= 1) return; // Keep at least one element

    const updatedElements = carouselElements.filter((_, i) => i !== index);

    // Update expanded elements indices
    const newExpanded = new Set<number>();
    expandedElements.forEach(expandedIndex => {
      if (expandedIndex < index) {
        newExpanded.add(expandedIndex);
      } else if (expandedIndex > index) {
        newExpanded.add(expandedIndex - 1);
      }
    });
    setExpandedElements(newExpanded);

    onMessageUpdate({
      action: {
        type: "carousel",
        action: {
          elements: updatedElements
        }
      }
    });
  };

  // Update element field
  const updateElement = (index: number, field: keyof CarouselElement, value: any) => {
    const updatedElements = [...carouselElements];
    updatedElements[index] = {
      ...updatedElements[index],
      [field]: value
    };

    onMessageUpdate({
      action: {
        type: "carousel",
        action: {
          elements: updatedElements
        }
      }
    });
  };

  // Add button to element
  const addButtonToElement = (elementIndex: number) => {
    const element = carouselElements[elementIndex];
    if (!element || (element.buttons?.length || 0) >= 3) return; // Instagram limit

    const newButton = {
      id: generatePrefixedId(channelType || null, Math.random().toString(36).slice(2, 11)),
      title: `Botão ${(element.buttons?.length || 0) + 1}`,
      type: "postback" as "postback" | "web_url",
      payload: ""
    };

    const updatedButtons = [...(element.buttons || []), newButton];
    updateElement(elementIndex, 'buttons', updatedButtons);
  };

  // Remove button from element
  const removeButtonFromElement = (elementIndex: number, buttonIndex: number) => {
    const element = carouselElements[elementIndex];
    if (!element?.buttons) return;

    const updatedButtons = element.buttons.filter((_, i) => i !== buttonIndex);
    updateElement(elementIndex, 'buttons', updatedButtons);
  };

  // Update button in element
  const updateElementButton = (elementIndex: number, buttonIndex: number, field: string, value: any) => {
    const element = carouselElements[elementIndex];
    if (!element?.buttons?.[buttonIndex]) return;

    const updatedButtons = [...element.buttons];
    updatedButtons[buttonIndex] = {
      ...updatedButtons[buttonIndex],
      [field]: value
    };
    updateElement(elementIndex, 'buttons', updatedButtons);
  };

  if (message.action?.type !== "carousel") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" />
            Carrossel
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Crie um carrossel com múltiplos elementos (até 10 para Instagram)
          </p>
        </CardHeader>
        <CardContent>
          <Button
            onClick={initializeCarousel}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Criar Carrossel
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" />
            Carrossel
            <Badge variant="outline" className="text-xs">
              {carouselElements.length}/10 elementos
            </Badge>
          </CardTitle>
          {carouselElements.length < 10 && (
            <Button
              size="sm"
              onClick={addElement}
              disabled={disabled}
            >
              <Plus className="h-3 w-3 mr-1" />
              Adicionar
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Configure os elementos do carrossel com título, subtítulo, imagem e botões
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {carouselElements.map((element, index) => (
          <Card key={element.id || index} className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleElementExpansion(index)}
                    className="h-6 w-6 p-0"
                  >
                    {expandedElements.has(index) ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                  <h4 className="text-sm font-medium">
                    Elemento {index + 1}
                  </h4>
                  {element.buttons && element.buttons.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {element.buttons.length} botões
                    </Badge>
                  )}
                </div>
                {carouselElements.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeElement(index)}
                    disabled={disabled}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </CardHeader>

            {expandedElements.has(index) && (
              <CardContent className="pt-0 space-y-3">
                {/* Title */}
                <div className="space-y-1">
                  <Label htmlFor={`element-title-${index}`} className="text-xs">
                    Título (máx. 80 caracteres)
                  </Label>
                  <Input
                    id={`element-title-${index}`}
                    value={element.title}
                    onChange={(e) => updateElement(index, 'title', e.target.value.slice(0, 80))}
                    disabled={disabled}
                    placeholder="Título do elemento"
                    className="text-sm"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {element.title.length}/80
                  </div>
                </div>

                {/* Subtitle */}
                <div className="space-y-1">
                  <Label htmlFor={`element-subtitle-${index}`} className="text-xs">
                    Subtítulo (opcional, máx. 80 caracteres)
                  </Label>
                  <Textarea
                    id={`element-subtitle-${index}`}
                    value={element.subtitle || ''}
                    onChange={(e) => updateElement(index, 'subtitle', e.target.value.slice(0, 80))}
                    disabled={disabled}
                    placeholder="Subtítulo do elemento"
                    className="text-sm min-h-[60px] resize-none"
                  />
                  <div className="text-xs text-muted-foreground text-right">
                    {(element.subtitle || '').length}/80
                  </div>
                </div>

                {/* Image URL */}
                <div className="space-y-1">
                  <Label htmlFor={`element-image-${index}`} className="text-xs">
                    URL da Imagem (opcional)
                  </Label>
                  <Input
                    id={`element-image-${index}`}
                    value={element.image_url || ''}
                    onChange={(e) => updateElement(index, 'image_url', e.target.value)}
                    disabled={disabled}
                    placeholder="https://exemplo.com/imagem.jpg"
                    className="text-sm"
                  />
                </div>

                {/* Default Action URL */}
                <div className="space-y-1">
                  <Label htmlFor={`element-default-action-${index}`} className="text-xs">
                    URL de Ação Padrão (opcional)
                  </Label>
                  <Input
                    id={`element-default-action-${index}`}
                    value={element.default_action?.url || ''}
                    onChange={(e) => updateElement(index, 'default_action',
                      e.target.value ? { type: 'web_url', url: e.target.value } : undefined
                    )}
                    disabled={disabled}
                    placeholder="https://exemplo.com"
                    className="text-sm"
                  />
                </div>

                {/* Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Botões (máx. 3 por elemento)</Label>
                    {(!element.buttons || element.buttons.length < 3) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addButtonToElement(index)}
                        disabled={disabled}
                        className="h-6 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Botão
                      </Button>
                    )}
                  </div>

                  {element.buttons && element.buttons.map((button, buttonIndex) => (
                    <div key={buttonIndex} className="flex gap-2 items-start p-2 border rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="flex-1 space-y-2">
                        <Input
                          value={button.title}
                          onChange={(e) => updateElementButton(index, buttonIndex, 'title', e.target.value.slice(0, 20))}
                          disabled={disabled}
                          placeholder="Título do botão"
                          className="text-sm"
                        />

                        <div className="flex gap-2">
                          <select
                            value={(button as any).type || 'postback'}
                            onChange={(e) => updateElementButton(index, buttonIndex, 'type', e.target.value)}
                            disabled={disabled}
                            className="text-xs border rounded px-2 py-1 bg-background"
                          >
                            <option value="postback">Postback</option>
                            <option value="web_url">URL</option>
                          </select>

                          <Input
                            value={(button as any).type === 'web_url' ? (button as any).url || '' : (button as any).payload || ''}
                            onChange={(e) => updateElementButton(
                              index,
                              buttonIndex,
                              (button as any).type === 'web_url' ? 'url' : 'payload',
                              e.target.value
                            )}
                            disabled={disabled}
                            placeholder={(button as any).type === 'web_url' ? "https://exemplo.com" : "payload_do_botao"}
                            className="text-sm flex-1"
                          />
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeButtonFromElement(index, buttonIndex)}
                        disabled={disabled}
                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </CardContent>
    </Card>
  );
};