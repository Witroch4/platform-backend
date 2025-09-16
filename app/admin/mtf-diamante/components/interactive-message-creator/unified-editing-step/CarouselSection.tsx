"use client";

import React, { useState, useEffect } from "react";
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
import MinIOMediaUpload, { MinIOMediaFile } from "../../shared/MinIOMediaUpload";
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { SortableItem } from "../../shared/dnd/SortableItem";
import { ButtonManager, type InteractiveButton as BMInteractiveButton } from "../../shared/ButtonManager";

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [elementUploads, setElementUploads] = useState<Record<string, MinIOMediaFile[]>>({});

  // Get carousel elements from message action
  const carouselElements = React.useMemo(() => {
    if (message.type === 'generic') {
      const a: any = message.action || {};
      // Try to get elements from different possible locations
      let elements = a.elements || a.action?.elements || [];

      // Also check in content.action (API response format)
      if (elements.length === 0 && (message as any).content?.action?.elements) {
        elements = (message as any).content.action.elements;
      }

      // Also check genericPayload directly
      if (elements.length === 0 && (message as any).content?.genericPayload) {
        if ((message as any).content.genericPayload.elements) {
          elements = (message as any).content.genericPayload.elements;
        }
      }

      // Ensure all elements have IDs for internal management
      return elements.map((el: any, index: number) => ({
        ...el,
        id: el.id || generatePrefixedId(channelType || null, `element_${index}_${Date.now()}`),
        buttons: el.buttons?.map((btn: any, btnIndex: number) => ({
          ...btn,
          id: btn.id || btn.payload || generatePrefixedId(channelType || null, `btn_${index}_${btnIndex}_${Date.now()}`)
        })) || []
      }));
    }
    return [];
  }, [message.type, message.action, (message as any).content?.action, channelType]);

  // Seed upload states from existing image_url
  useEffect(() => {
    const map: Record<string, MinIOMediaFile[]> = { ...elementUploads };
    (carouselElements || []).forEach((el: any, idx: number) => {
      const key = el.id || String(idx);
      const has = Array.isArray(map[key]) && map[key].length > 0;
      if (!has && el.image_url) {
        map[key] = [{ id: `${key}-img`, progress: 100, status: 'success', url: el.image_url, mime_type: 'image/jpeg' }];
      }
    });
    setElementUploads(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carouselElements.length]);

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

  // Drag reorder elements
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = carouselElements.findIndex((e: any, i: number) => (e.id || String(i)) === active.id);
    const newIndex = carouselElements.findIndex((e: any, i: number) => (e.id || String(i)) === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(carouselElements, oldIndex, newIndex);
    onMessageUpdate({ type: 'generic', action: { type: 'generic', elements: newOrder } as any });
  };

  // Initialize carousel action if not exists
  const initializeCarousel = () => {
    if (message.type !== 'generic') {
      onMessageUpdate({
        type: 'generic',
        action: {
          type: 'generic',
          elements: [
            {
              id: generatePrefixedId(channelType || null, Math.random().toString(36).slice(2, 11)),
              title: 'Elemento 1',
              subtitle: '',
              image_url: '',
              buttons: [],
            },
          ],
        } as any,
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

    onMessageUpdate({ type: 'generic', action: { type: 'generic', elements: updatedElements } as any });
  };

  // Remove carousel element
  const removeElement = (index: number) => {
    if (carouselElements.length <= 1) return; // Keep at least one element

    const updatedElements = carouselElements.filter((_: any, i: number) => i !== index);

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

    onMessageUpdate({ type: 'generic', action: { type: 'generic', elements: updatedElements } as any });
  };

  // Update element field
  const updateElement = (index: number, field: keyof CarouselElement, value: any) => {
    const updatedElements = [...carouselElements];
    updatedElements[index] = {
      ...updatedElements[index],
      [field]: value
    };

    // Keep the elements with IDs for local state management
    onMessageUpdate({
      type: 'generic',
      action: {
        type: "generic",
        elements: updatedElements // Keep IDs for internal management
      } as any
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

    const updatedButtons = element.buttons.filter((_: any, i: number) => i !== buttonIndex);
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

  if (message.type !== 'generic') {
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
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={carouselElements.map((el: any, idx: number) => el.id || String(idx))} strategy={verticalListSortingStrategy}>
        {carouselElements.map((element: any, index: number) => (
          <SortableItem id={element.id || String(index)} key={element.id || index}>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Grip className="h-3 w-3 text-muted-foreground" />
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

                {/* Image Upload */}
                <div className="space-y-1">
                  <Label className="text-xs">Imagem do Elemento (opcional)</Label>
                  <MinIOMediaUpload
                    uploadedFiles={elementUploads[element.id || String(index)] || []}
                    setUploadedFiles={(updater) => {
                      setElementUploads((prev) => {
                        const key = element.id || String(index);
                        const next = typeof updater === 'function' ? (updater as any)(prev[key] || []) : updater;
                        return { ...prev, [key]: next };
                      });
                    }}
                    allowedTypes={['image/jpeg','image/png','image/jpg','image/gif']}
                    maxSizeMB={8}
                    maxFiles={1}
                    title="Upload image"
                    description="Upload para MinIO"
                    onUploadComplete={(file) => updateElement(index, 'image_url', file.url || '')}
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

                {/* Buttons with drag-and-drop (standard app pattern) */}
                <div className="space-y-2">
                  <Label className="text-xs">Botões (máx. 3 por elemento)</Label>
                  <ButtonManager
                    buttons={(element.buttons || []).slice(0,3).map((b: any) => {
                      // Ensure proper ID with prefix so focus is stable while typing
                      const buttonId = (b as any).payload || (b as any).id || generatePrefixedId(channelType || null, `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);

                      if ((b as any).type === 'web_url') {
                        return { id: buttonId, text: String(b.title || ''), type: 'url', url: (b as any).url } as BMInteractiveButton;
                      }
                      return { id: buttonId, text: String(b.title || ''), type: 'reply' } as BMInteractiveButton;
                    })}
                    onChange={(bm) => {
                      const mapped = bm.slice(0,3).map((x) => {
                        const buttonId = x.id || generatePrefixedId(channelType || null, `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`);

                        if (x.type === 'url') {
                          return {
                            id: buttonId,
                            type: 'web_url',
                            title: x.text,
                            url: x.url || ''
                          };
                        }

                        return {
                          id: buttonId,
                          type: 'postback',
                          title: x.text,
                          payload: buttonId
                        };
                      });
                      updateElement(index, 'buttons', mapped as any);
                    }}
                    maxButtons={3}
                    disabled={disabled}
                    className="pt-1"
                    showReactionConfig={false}
                    idPrefix={channelType === 'Channel::Instagram' ? 'ig_' : (channelType === 'Channel::FacebookPage' ? 'fb_' : '')}
                    channelType={channelType}
                  />
                </div>
              </CardContent>
            )}
          </Card>
          </SortableItem>
        ))}
          </SortableContext>
        </DndContext>
      </CardContent>
    </Card>
  );
};
