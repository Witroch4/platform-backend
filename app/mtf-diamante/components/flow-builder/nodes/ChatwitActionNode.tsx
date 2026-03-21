import { memo, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { Workflow, UserCheck, Clock, Tag as TagIcon, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NodeContextMenu } from "../ui/NodeContextMenu";
import { NODE_COLORS, FlowNodeType } from "@/types/flow-builder";
import type { ChatwitActionNodeData } from "@/types/flow-builder/nodes";

const nodeColors = NODE_COLORS[FlowNodeType.CHATWIT_ACTION];

export const ChatwitActionNode = memo(({ id, data, selected }: NodeProps & { data: ChatwitActionNodeData }) => {
    const { setNodes, setEdges, getNodes } = useReactFlow();

    const handleDuplicate = useCallback(() => {
        const nodes = getNodes();
        const currentNode = nodes.find((n) => n.id === id);
        if (!currentNode) return;

        const newId = `${currentNode.type}-${Date.now()}`;
        const newNode = {
            ...currentNode,
            id: newId,
            position: {
                x: currentNode.position.x + 50,
                y: currentNode.position.y + 50,
            },
            data: {
                ...currentNode.data,
                label: `${currentNode.data.label || "Cópia"} (cópia)`,
            },
            selected: false,
        };

        setNodes((nodes) => [...nodes, newNode]);
    }, [id, getNodes, setNodes]);

    const handleDelete = useCallback(() => {
        setNodes((nodes) => nodes.filter((n) => n.id !== id));
        setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
    }, [id, setNodes, setEdges]);

    const getActionIcon = () => {
        switch (data.actionType) {
            case "resolve_conversation":
                return <CheckCircle className={cn("h-5 w-5", nodeColors.icon)} />;
            case "assign_agent":
                return <UserCheck className={cn("h-5 w-5", nodeColors.icon)} />;
            case "snooze_conversation":
                return <Clock className={cn("h-5 w-5", nodeColors.icon)} />;
            case "add_label":
            case "remove_label":
                return <TagIcon className={cn("h-5 w-5", nodeColors.icon)} />;
            default:
                return <Workflow className={cn("h-5 w-5", nodeColors.icon)} />;
        }
    };

    const getActionLabel = () => {
        if (data.label) return data.label;

        switch (data.actionType) {
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

    const getActionDescription = () => {
        if (!data.isConfigured) return <p className="text-xs text-muted-foreground italic">Clique para configurar</p>;

        switch (data.actionType) {
            case "assign_agent":
                return (
                    <div className="flex flex-col gap-1 mt-1">
                        <Badge variant="outline" className="w-fit">
                            {data.assigneeName || data.assigneeId || "N/A"}
                        </Badge>
                    </div>
                );
            case "add_label":
            case "remove_label":
                return (
                    <div className="flex flex-wrap gap-1 mt-1">
                        {data.labels?.map((label, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1 h-5 flex items-center gap-1">
                                <span
                                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: label.color }}
                                />
                                {label.title}
                            </Badge>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <NodeContextMenu onDuplicate={handleDuplicate} onDelete={handleDelete}>
            <div
                className={cn(
                    "min-w-[180px] rounded-lg border-2 shadow-md transition-all",
                    nodeColors.bg,
                    nodeColors.border,
                    selected && "ring-2 ring-primary ring-offset-2",
                    !data.isConfigured && "border-dashed opacity-80",
                )}
            >
                <Handle type="target" position={Position.Top} className="!h-3 !w-3 !bg-indigo-500 !border-2 !border-white" />

                <div className="flex items-start gap-3 px-4 py-3">
                    <div className="mt-0.5">{getActionIcon()}</div>
                    <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-sm truncate" title={getActionLabel()}>
                            {getActionLabel()}
                        </p>
                        {getActionDescription()}
                    </div>
                </div>

                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="!h-3 !w-3 !bg-indigo-500 !border-2 !border-white"
                />
            </div>
        </NodeContextMenu>
    );
});

ChatwitActionNode.displayName = "ChatwitActionNode";
