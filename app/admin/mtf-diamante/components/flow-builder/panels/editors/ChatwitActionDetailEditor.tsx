import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Loader2 } from "lucide-react";
import { useMtfData } from "@/app/admin/mtf-diamante/context/SwrProvider";
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

    useEffect(() => {
        setActionType(data.actionType || "resolve_conversation");
        setAssigneeId(data.assigneeId || "");
        setSnoozeUntil(data.snoozeUntil || "");
        setSelectedLabels(data.labels || []);
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
        </div>
    );
}
