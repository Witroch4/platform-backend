import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import { useMtfData } from "@/app/admin/mtf-diamante/context/MtfDataProvider";
import { useChatwitLabels } from "@/app/admin/mtf-diamante/hooks/useChatwitLabels";
import type { ChatwitActionNodeData } from "@/types/flow-builder/nodes";
import type { FlowNodeData } from "@/types/flow-builder/nodes";
import { EditorProps } from "../types";

export function ChatwitActionDetailEditor({ node, data, onUpdate }: EditorProps<ChatwitActionNodeData>) {
    const { chatwitAgents } = useMtfData();
    const { chatwitLabels, isLoading: labelsLoading } = useChatwitLabels();

    const [actionType, setActionType] = useState<ChatwitActionNodeData["actionType"]>(
        data.actionType || "resolve_conversation",
    );
    const [assigneeId, setAssigneeId] = useState(data.assigneeId || "");
    const [snoozeUntil, setSnoozeUntil] = useState(data.snoozeUntil || "");
    const [selectedLabels, setSelectedLabels] = useState<Array<{ title: string; color: string }>>(
        data.labels || [],
    );
    const [contactFieldMappings, setContactFieldMappings] = useState<Array<{ field: string; value: string }>>(
        data.contactFieldMappings || [{ field: "email", value: "" }],
    );

    useEffect(() => {
        setActionType(data.actionType || "resolve_conversation");
        setAssigneeId(data.assigneeId || "");
        setSnoozeUntil(data.snoozeUntil || "");
        setSelectedLabels(data.labels || []);
        setContactFieldMappings(data.contactFieldMappings || [{ field: "email", value: "" }]);
    }, [data]);

    const updateNode = (updates: Partial<ChatwitActionNodeData>) => {
        onUpdate(node.id, {
            ...updates,
            isConfigured: true,
            label: getActionLabel(updates.actionType || actionType),
        } as Partial<FlowNodeData>);
    };

    const getActionLabel = (type: string) => {
        switch (type) {
            case "resolve_conversation":
                return "Resolver Conversa";
            case "assign_agent":
                return "Atribuir Agente";
            case "snooze_conversation":
                return "Adiar Conversa";
            case "add_label":
                return "Adicionar Etiqueta";
            case "remove_label":
                return "Remover Etiqueta";
            case "update_contact":
                return "Atualizar Contato";
            default:
                return "Ação Chatwit";
        }
    };

    const handleToggleLabel = (label: { title: string; color: string }) => {
        const alreadySelected = selectedLabels.some((l) => l.title === label.title);
        const newLabels = alreadySelected
            ? selectedLabels.filter((l) => l.title !== label.title)
            : [...selectedLabels, label];
        setSelectedLabels(newLabels);
        updateNode({ labels: newLabels });
    };

    const handleRemoveLabel = (title: string) => {
        const newLabels = selectedLabels.filter((l) => l.title !== title);
        setSelectedLabels(newLabels);
        updateNode({ labels: newLabels });
    };

    const isLabelSelected = (title: string) => selectedLabels.some((l) => l.title === title);

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de Ação</Label>
                <Select
                    value={actionType}
                    onValueChange={(value: any) => {
                        setActionType(value);
                        updateNode({ actionType: value });
                    }}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Selecione uma ação" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="resolve_conversation">Resolver Conversa</SelectItem>
                        <SelectItem value="assign_agent">Atribuir a Agente</SelectItem>
                        <SelectItem value="add_label">Adicionar Etiqueta</SelectItem>
                        <SelectItem value="remove_label">Remover Etiqueta</SelectItem>
                        <SelectItem value="update_contact">Atualizar Contato</SelectItem>
                        {/* Snooze temporarily disabled until implemented */}
                        {/* <SelectItem value="snooze_conversation">Adiar Conversa</SelectItem> */}
                    </SelectContent>
                </Select>
            </div>

            {actionType === "assign_agent" && (
                <div className="space-y-2">
                    <Label className="text-sm font-medium">Agente / Time</Label>
                    <Select
                        value={assigneeId}
                        onValueChange={(value) => {
                            setAssigneeId(value);
                            const selectedAgent = chatwitAgents?.find((a) => String(a.id) === value);
                            updateNode({
                                assigneeId: value,
                                assigneeName: selectedAgent?.name || undefined,
                            });
                        }}
                    >
                        <SelectTrigger>
                            <SelectValue placeholder="Selecione um agente" />
                        </SelectTrigger>
                        <SelectContent>
                            {chatwitAgents?.map((agent) => (
                                <SelectItem key={agent.id} value={String(agent.id)}>
                                    {agent.name} ({agent.role})
                                </SelectItem>
                            ))}
                            {(!chatwitAgents || chatwitAgents.length === 0) && (
                                <SelectItem value="no_agents" disabled>
                                    Nenhum agente encontrado
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                        Selecione o agente que receberá a conversa.
                    </p>
                </div>
            )}

            {(actionType === "add_label" || actionType === "remove_label") && (
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Etiquetas</Label>

                    {/* Etiquetas selecionadas */}
                    {selectedLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {selectedLabels.map((label) => (
                                <Badge
                                    key={label.title}
                                    variant="secondary"
                                    className="gap-1.5 pr-1 pl-1.5"
                                >
                                    <span
                                        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: label.color }}
                                    />
                                    <span className="text-xs">{label.title}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveLabel(label.title)}
                                        className="hover:bg-muted rounded-full p-0.5 ml-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    )}

                    {/* Lista de etiquetas disponíveis */}
                    <div className="border rounded-md overflow-hidden">
                        {labelsLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Carregando etiquetas...
                            </div>
                        ) : chatwitLabels.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4 px-3">
                                Nenhuma etiqueta encontrada no Chatwit.
                            </p>
                        ) : (
                            <div className="max-h-48 overflow-y-auto">
                                {chatwitLabels.map((label) => {
                                    const selected = isLabelSelected(label.title);
                                    return (
                                        <button
                                            key={label.title}
                                            type="button"
                                            onClick={() => handleToggleLabel(label)}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors hover:bg-muted/60 ${
                                                selected ? "bg-muted" : ""
                                            }`}
                                        >
                                            <span
                                                className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
                                                style={{ backgroundColor: label.color }}
                                            />
                                            <span className="flex-1 truncate">{label.title}</span>
                                            {selected && (
                                                <span className="text-xs text-muted-foreground">✓</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                        Clique para selecionar ou remover etiquetas.
                    </p>
                </div>
            )}

            {actionType === "update_contact" && (
                <div className="space-y-3">
                    <Label className="text-sm font-medium">Campos do Contato</Label>
                    <p className="text-[11px] text-muted-foreground">
                        Use variáveis do flow (ex: <code className="bg-muted px-1 rounded">{`{{user_email}}`}</code>) nos valores.
                    </p>

                    {contactFieldMappings.map((mapping, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                            <Select
                                value={mapping.field}
                                onValueChange={(value) => {
                                    const newMappings = [...contactFieldMappings];
                                    newMappings[idx] = { ...mapping, field: value };
                                    setContactFieldMappings(newMappings);
                                    updateNode({ contactFieldMappings: newMappings });
                                }}
                            >
                                <SelectTrigger className="w-[130px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="email">Email</SelectItem>
                                    <SelectItem value="name">Nome</SelectItem>
                                    <SelectItem value="phone_number">Telefone</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                value={mapping.value}
                                onChange={(e) => {
                                    const newMappings = [...contactFieldMappings];
                                    newMappings[idx] = { ...mapping, value: e.target.value };
                                    setContactFieldMappings(newMappings);
                                }}
                                onBlur={() => updateNode({ contactFieldMappings })}
                                placeholder={`{{${mapping.field === "email" ? "user_email" : mapping.field === "name" ? "user_name" : "user_phone"}}}`}
                                className="text-sm font-mono flex-1"
                            />
                            {contactFieldMappings.length > 1 && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0"
                                    onClick={() => {
                                        const newMappings = contactFieldMappings.filter((_, i) => i !== idx);
                                        setContactFieldMappings(newMappings);
                                        updateNode({ contactFieldMappings: newMappings });
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                            )}
                        </div>
                    ))}

                    {contactFieldMappings.length < 3 && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                                const usedFields = contactFieldMappings.map((m) => m.field);
                                const nextField = ["email", "name", "phone_number"].find((f) => !usedFields.includes(f)) || "email";
                                const newMappings = [...contactFieldMappings, { field: nextField, value: "" }];
                                setContactFieldMappings(newMappings);
                                updateNode({ contactFieldMappings: newMappings });
                            }}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Adicionar campo
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
