import { FlowNodeData } from "@/types/flow-builder/nodes";
import { Node } from "@xyflow/react";

export interface EditorProps<T extends FlowNodeData> {
    node: Node;
    data: T;
    onUpdate: (id: string, data: Partial<FlowNodeData>) => void;
}
