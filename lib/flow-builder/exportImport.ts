/**
 * Flow Builder Export/Import Utilities
 *
 * Converte entre formato React Flow (nodes/edges) e formato n8n (connections map).
 * O formato n8n facilita debug e portabilidade de flows.
 */

import type {
  FlowCanvas,
  FlowNode,
  FlowEdge,
  FlowExportFormat,
  FlowNodeExport,
  N8nConnectionsMap,
  N8nConnectionTarget,
  FlowImportValidation,
  FlowNodeType,
  FlowViewport,
  InteractiveMessageNodeData,
} from '@/types/flow-builder';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calcula o número de outputs de um nó baseado no seu tipo e configuração
 *
 * - interactive_message: número de botões (mín 1)
 * - condition: 2 (true/false)
 * - end: 0 (nó terminal)
 * - demais: 1 (output padrão)
 */
export function getNodeOutputCount(node: FlowNode): number {
  if (node.type === 'interactive_message') {
    const data = node.data as InteractiveMessageNodeData;

    // Conta botões do array elements (formato novo)
    const elementsButtonCount =
      data.elements?.filter((e) => e.type === 'button').length ?? 0;

    // Conta botões do array buttons (formato legado)
    const legacyButtonCount = data.buttons?.length ?? 0;

    // Usa o maior entre os dois (compatibilidade)
    const buttonCount = Math.max(elementsButtonCount, legacyButtonCount);

    // Mínimo 1 output (conexão padrão se não tiver botões)
    return Math.max(buttonCount, 1);
  }

  if (node.type === 'condition') {
    return 2; // true/false branches
  }

  if (node.type === 'end') {
    return 0; // nó terminal, sem outputs
  }

  return 1; // output padrão
}

/**
 * Extrai o índice do output a partir do sourceHandle
 *
 * Formatos suportados:
 * - "flow_button_*" → resolve pelo ID do botão no array elements/buttons
 * - "btn_0", "btn_1", etc. → índice numérico (formato legado)
 * - "true" → 0 (para condition)
 * - "false" → 1 (para condition)
 * - null/undefined → 0 (output padrão)
 */
function getOutputIndexFromHandle(
  sourceHandle: string | undefined | null,
  node: FlowNode,
  _edge: FlowEdge
): number {
  if (!sourceHandle) {
    return 0;
  }

  // Formato btn_N (legado)
  const btnMatch = sourceHandle.match(/^btn_(\d+)$/);
  if (btnMatch) {
    return Number.parseInt(btnMatch[1], 10);
  }

  // Condition branches
  if (sourceHandle === 'true') {
    return 0;
  }
  if (sourceHandle === 'false') {
    return 1;
  }

  // Resolver pelo sourceHandle que é o button ID real (flow_button_* ou qualquer ID)
  if (node.type === 'interactive_message') {
    const data = node.data as InteractiveMessageNodeData;

    // Busca no array elements
    const elementsButtons =
      data.elements?.filter((e) => e.type === 'button') ?? [];
    const elementsIndex = elementsButtons.findIndex(
      (b) => b.id === sourceHandle
    );
    if (elementsIndex >= 0) {
      return elementsIndex;
    }

    // Busca no array buttons (legado)
    const legacyIndex =
      data.buttons?.findIndex((b) => b.id === sourceHandle) ?? -1;
    if (legacyIndex >= 0) {
      return legacyIndex;
    }
  }

  return 0;
}

/**
 * Gera o sourceHandle a partir do índice do output.
 *
 * Para interactive_message, resolve o índice de volta para o button ID real
 * do nó (flow_button_*), necessário para que React Flow conecte a edge
 * ao Handle correto. Fallback para btn_N se o nó não tiver botões.
 */
function getHandleFromOutputIndex(
  outputIndex: number,
  nodeType: string,
  sourceNode?: FlowNodeExport | FlowNode | null
): string | undefined {
  if (nodeType === 'interactive_message') {
    // Resolver para o button ID real (flow_button_*)
    if (sourceNode) {
      const data = sourceNode.data as InteractiveMessageNodeData;
      const elementButtons = data.elements?.filter((e) => e.type === 'button') ?? [];
      if (elementButtons.length > outputIndex && elementButtons[outputIndex]?.id) {
        return elementButtons[outputIndex].id;
      }
      // Fallback: array buttons legado
      if (data.buttons && data.buttons.length > outputIndex && data.buttons[outputIndex]?.id) {
        return data.buttons[outputIndex].id;
      }
    }
    // Último fallback se não conseguir resolver
    return `btn_${outputIndex}`;
  }

  if (nodeType === 'condition') {
    return outputIndex === 0 ? 'true' : 'false';
  }

  return undefined;
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Converte FlowCanvas (React Flow) para formato n8n
 */
export function canvasToN8nFormat(
  canvas: FlowCanvas,
  meta: { flowId?: string; flowName: string; inboxId?: string }
): FlowExportFormat {
  // Agrupa edges por nó de origem
  const edgesBySource = new Map<string, FlowEdge[]>();
  for (const edge of canvas.edges) {
    const existing = edgesBySource.get(edge.source) || [];
    existing.push(edge);
    edgesBySource.set(edge.source, existing);
  }

  // Constrói mapa de conexões
  const connections: N8nConnectionsMap = {};

  for (const node of canvas.nodes) {
    const nodeEdges = edgesBySource.get(node.id) || [];
    const outputCount = getNodeOutputCount(node);

    // Só inclui nós com outputs ou edges
    if (outputCount === 0 && nodeEdges.length === 0) {
      continue;
    }

    // Inicializa array de outputs
    const outputs: N8nConnectionTarget[][] = Array.from(
      { length: Math.max(outputCount, 1) },
      () => []
    );

    // Processa cada edge
    for (const edge of nodeEdges) {
      const outputIndex = getOutputIndexFromHandle(
        edge.sourceHandle,
        node,
        edge
      );

      // Expande array se necessário
      while (outputs.length <= outputIndex) {
        outputs.push([]);
      }

      outputs[outputIndex].push({
        node: edge.target,
        type: 'main',
        index: 0,
      });
    }

    connections[node.id] = { main: outputs };
  }

  // Converte nodes para formato de exportação
  const nodesExport: FlowNodeExport[] = canvas.nodes.map((node) => ({
    ...node,
    outputs: getNodeOutputCount(node),
  }));

  return {
    meta: {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      flowId: meta.flowId,
      flowName: meta.flowName,
      inboxId: meta.inboxId,
    },
    nodes: nodesExport,
    connections,
    viewport: canvas.viewport,
  };
}

// =============================================================================
// IMPORT FUNCTIONS
// =============================================================================

/**
 * Converte formato n8n de volta para FlowCanvas (React Flow)
 */
export function n8nFormatToCanvas(exportData: FlowExportFormat): FlowCanvas {
  const edges: FlowEdge[] = [];
  let edgeIndex = 0;

  // Reconstrói edges a partir do mapa de conexões
  for (const [sourceId, sourceConnections] of Object.entries(
    exportData.connections
  )) {
    const sourceNode = exportData.nodes.find((n) => n.id === sourceId);
    if (!sourceNode) {
      continue;
    }

    const outputs = sourceConnections.main || [];

    for (let outputIdx = 0; outputIdx < outputs.length; outputIdx++) {
      const targets = outputs[outputIdx] || [];

      for (const target of targets) {
        const sourceHandle = getHandleFromOutputIndex(
          outputIdx,
          sourceNode.type as string,
          sourceNode
        );

        const edge: FlowEdge = {
          id: `edge_${sourceId}_${target.node}_${outputIdx}_${edgeIndex++}`,
          source: sourceId,
          target: target.node,
          sourceHandle,
          type: 'smoothstep',
          animated: false,
        };

        // Adiciona data com buttonId se for interactive_message
        if (sourceHandle && sourceNode.type === 'interactive_message') {
          edge.data = { buttonId: sourceHandle };
        }

        edges.push(edge);
      }
    }
  }

  // Remove campo 'outputs' dos nodes (não faz parte do FlowNode)
  const nodes: FlowNode[] = exportData.nodes.map(
    // biome-ignore lint/correctness/noUnusedVariables: outputs é removido intencionalmente
    ({ outputs, ...node }) => node as FlowNode
  );

  return {
    nodes,
    edges,
    viewport: exportData.viewport || { x: 0, y: 0, zoom: 1 },
  };
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Valida estrutura de dados antes da importação
 */
export function validateFlowImport(data: unknown): FlowImportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Verifica tipo básico
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['Dados inválidos: esperado objeto JSON'],
      warnings: [],
      nodeCount: 0,
      connectionCount: 0,
    };
  }

  const exportData = data as Partial<FlowExportFormat>;

  // Verifica campos obrigatórios
  if (!exportData.meta?.version) {
    errors.push('Campo meta.version ausente');
  }

  if (!exportData.meta?.flowName) {
    warnings.push('Campo meta.flowName ausente (será usado nome padrão)');
  }

  if (!Array.isArray(exportData.nodes)) {
    errors.push('Campo nodes deve ser um array');
  }

  if (!exportData.connections || typeof exportData.connections !== 'object') {
    errors.push('Campo connections ausente ou inválido');
  }

  // Se há erros estruturais, retorna
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      nodeCount: 0,
      connectionCount: 0,
    };
  }

  // Valida nodes
  const nodeIds = new Set<string>();
  const validNodeTypes = [
    'start',
    'interactive_message',
    'text_message',
    'emoji_reaction',
    'text_reaction',
    'handoff',
    'add_tag',
    'end',
    'condition',
    'delay',
    'media',
  ];

  for (const node of exportData.nodes!) {
    if (!node.id) {
      errors.push('Nó sem ID encontrado');
      continue;
    }

    if (!node.type) {
      errors.push(`Nó ${node.id} sem tipo definido`);
      continue;
    }

    if (!validNodeTypes.includes(node.type as string)) {
      warnings.push(`Nó ${node.id} tem tipo desconhecido: ${node.type}`);
    }

    if (nodeIds.has(node.id)) {
      errors.push(`ID de nó duplicado: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (!node.position || typeof node.position.x !== 'number') {
      warnings.push(`Nó ${node.id} sem posição válida`);
    }
  }

  // Valida conexões
  let connectionCount = 0;

  for (const [sourceId, conn] of Object.entries(exportData.connections!)) {
    if (!nodeIds.has(sourceId)) {
      warnings.push(`Conexão de nó inexistente: ${sourceId}`);
      continue;
    }

    if (!conn.main || !Array.isArray(conn.main)) {
      warnings.push(`Conexão inválida para nó ${sourceId}`);
      continue;
    }

    for (const outputs of conn.main) {
      if (!Array.isArray(outputs)) {
        continue;
      }

      for (const target of outputs) {
        connectionCount++;

        if (!target.node) {
          warnings.push(`Conexão sem nó destino em ${sourceId}`);
          continue;
        }

        if (!nodeIds.has(target.node)) {
          warnings.push(
            `Conexão para nó inexistente: ${sourceId} → ${target.node}`
          );
        }
      }
    }
  }

  // Verifica nó START
  const hasStart = exportData.nodes!.some((n) => n.type === 'start');
  if (!hasStart) {
    warnings.push('Flow não tem nó de início (START)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    nodeCount: exportData.nodes!.length,
    connectionCount,
  };
}

// =============================================================================
// DEBUG FUNCTIONS
// =============================================================================

/**
 * Gera visualização de debug das conexões em formato texto legível
 */
export function generateConnectionsDebugView(
  exportData: FlowExportFormat
): string {
  const lines: string[] = [
    '='.repeat(60),
    `FLOW: ${exportData.meta.flowName}`,
    `Exportado: ${exportData.meta.exportedAt}`,
    `Versão: ${exportData.meta.version}`,
    `Nós: ${exportData.nodes.length}`,
    '='.repeat(60),
    '',
  ];

  // Cria mapa de nodes por ID para lookup rápido
  const nodeMap = new Map(exportData.nodes.map((n) => [n.id, n]));

  // Processa cada nó na ordem do array
  for (const node of exportData.nodes) {
    const connections = exportData.connections[node.id];

    // Formata tipo do nó
    const nodeType = (node.type as string).toUpperCase().replace(/_/g, ' ');
    const nodeLabel = node.data?.label || node.id;

    lines.push(`[${nodeType}] ${nodeLabel}`);
    lines.push(`  ID: ${node.id}`);

    if (node.outputs !== undefined && node.outputs > 0) {
      lines.push(`  Outputs: ${node.outputs}`);
    }

    // Se não tem conexões, mostra como terminal
    if (!connections?.main?.length) {
      lines.push('  └─ (terminal)');
      lines.push('');
      continue;
    }

    // Processa cada output
    const outputs = connections.main;
    for (let i = 0; i < outputs.length; i++) {
      const targets = outputs[i];

      // Gera label do output baseado no tipo
      let outputLabel: string;
      if (node.type === 'interactive_message') {
        // Tenta pegar título do botão
        const data = node.data as InteractiveMessageNodeData;
        const buttons = data.buttons || [];
        const elementsButtons =
          data.elements?.filter((e) => e.type === 'button') || [];
        const allButtons = [...buttons, ...elementsButtons];
        const button = allButtons[i];
        outputLabel = button
          ? `Botão ${i}: "${(button as { title?: string }).title || button.id}"`
          : `Output ${i}`;
      } else if (node.type === 'condition') {
        outputLabel = i === 0 ? 'TRUE' : 'FALSE';
      } else {
        outputLabel = `Output ${i}`;
      }

      if (!targets?.length) {
        lines.push(`  ├─[${outputLabel}]─> (não conectado)`);
        continue;
      }

      for (let j = 0; j < targets.length; j++) {
        const target = targets[j];
        const targetNode = nodeMap.get(target.node);
        const targetType = targetNode
          ? (targetNode.type as string).toUpperCase().replace(/_/g, ' ')
          : '?';
        const targetLabel = targetNode?.data?.label || target.node;

        const isLast = j === targets.length - 1 && i === outputs.length - 1;
        const prefix = isLast ? '└' : '├';

        lines.push(`  ${prefix}─[${outputLabel}]─> [${targetType}] ${targetLabel}`);
      }
    }

    lines.push('');
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Gera JSON formatado para exportação/download
 */
export function formatExportJson(exportData: FlowExportFormat): string {
  return JSON.stringify(exportData, null, 2);
}

// =============================================================================
// DEBUG LOGGING
// =============================================================================

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

/**
 * Gera visualização compacta do grafo de conexões para debug
 */
export function generateConnectionsGraph(
  exportData: FlowExportFormat
): string {
  const lines: string[] = [];
  const nodeMap = new Map(exportData.nodes.map((n) => [n.id, n]));

  // Header
  lines.push('┌─────────────────────────────────────────────────────────────┐');
  lines.push(`│ FLOW GRAPH: ${exportData.meta.flowName.slice(0, 45).padEnd(45)} │`);
  lines.push(`│ Nodes: ${String(exportData.nodes.length).padEnd(3)} | Connections: ${countConnections(exportData.connections).toString().padEnd(25)} │`);
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Encontrar nó START
  const startNode = exportData.nodes.find((n) => n.type === 'start');
  if (startNode) {
    lines.push('│ EXECUTION SEQUENCE:                                         │');
    lines.push('├─────────────────────────────────────────────────────────────┤');

    // Percorrer grafo a partir do START
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number; path: string }> = [
      { nodeId: startNode.id, depth: 0, path: '' },
    ];

    while (queue.length > 0) {
      const { nodeId, depth, path } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const indent = '  '.repeat(depth);
      const nodeType = (node.type as string).toUpperCase().replace(/_/g, ' ');
      const label = (node.data?.label as string) || nodeId.slice(0, 12);

      lines.push(`│ ${indent}[${nodeType}] ${label.slice(0, 30 - depth * 2)}`.padEnd(62) + '│');

      // Adicionar conexões à fila
      const connections = exportData.connections[nodeId];
      if (connections?.main) {
        for (let outputIdx = 0; outputIdx < connections.main.length; outputIdx++) {
          const targets = connections.main[outputIdx];
          for (const target of targets || []) {
            const outputLabel = getOutputLabel(node, outputIdx);
            lines.push(`│ ${indent}  └─[${outputLabel}]─>`.padEnd(62) + '│');
            queue.push({
              nodeId: target.node,
              depth: depth + 1,
              path: `${path} -> ${outputLabel}`,
            });
          }
        }
      }
    }

    // Nós não visitados (órfãos)
    const orphans = exportData.nodes.filter((n) => !visited.has(n.id));
    if (orphans.length > 0) {
      lines.push('├─────────────────────────────────────────────────────────────┤');
      lines.push('│ ORPHAN NODES (not connected to START):                     │');
      for (const node of orphans) {
        const nodeType = (node.type as string).toUpperCase();
        const label = (node.data?.label as string) || node.id.slice(0, 12);
        lines.push(`│   [${nodeType}] ${label.slice(0, 40)}`.padEnd(62) + '│');
      }
    }
  }

  lines.push('├─────────────────────────────────────────────────────────────┤');
  lines.push('│ CONNECTIONS MAP:                                            │');
  lines.push('├─────────────────────────────────────────────────────────────┤');

  // Mapa de conexões detalhado
  for (const [sourceId, conn] of Object.entries(exportData.connections)) {
    const sourceNode = nodeMap.get(sourceId);
    const sourceLabel = sourceNode
      ? `${(sourceNode.type as string).toUpperCase()}:${(sourceNode.data?.label as string)?.slice(0, 15) || sourceId.slice(0, 8)}`
      : sourceId.slice(0, 20);

    for (let i = 0; i < (conn.main?.length || 0); i++) {
      const targets = conn.main?.[i] || [];
      if (targets.length === 0) continue;

      const outputLabel = sourceNode ? getOutputLabel(sourceNode, i) : `out_${i}`;

      for (const target of targets) {
        const targetNode = nodeMap.get(target.node);
        const targetLabel = targetNode
          ? `${(targetNode.type as string).toUpperCase()}:${(targetNode.data?.label as string)?.slice(0, 15) || target.node.slice(0, 8)}`
          : target.node.slice(0, 20);

        lines.push(`│ ${sourceLabel} [${outputLabel}] → ${targetLabel}`.padEnd(62) + '│');
      }
    }
  }

  lines.push('└─────────────────────────────────────────────────────────────┘');

  return lines.join('\n');
}

function getOutputLabel(node: FlowNodeExport, outputIdx: number): string {
  if (node.type === 'interactive_message') {
    const data = node.data as InteractiveMessageNodeData;
    const buttons = data.buttons || [];
    const elementsButtons = data.elements?.filter((e) => e.type === 'button') || [];
    const allButtons = [...buttons, ...elementsButtons];
    const button = allButtons[outputIdx] as { title?: string; id?: string } | undefined;
    return button?.title?.slice(0, 10) || `btn_${outputIdx}`;
  }
  if (node.type === 'condition') {
    return outputIdx === 0 ? 'TRUE' : 'FALSE';
  }
  return `out_${outputIdx}`;
}

function countConnections(connections: N8nConnectionsMap): number {
  let count = 0;
  for (const conn of Object.values(connections)) {
    for (const outputs of conn.main || []) {
      count += outputs?.length || 0;
    }
  }
  return count;
}

/**
 * Loga o grafo de conexões se DEBUG=1
 */
export function debugLogFlowGraph(
  canvas: FlowCanvas,
  meta: { flowId?: string; flowName: string; inboxId?: string },
  context?: string
): void {
  if (!DEBUG) return;

  const exportData = canvasToN8nFormat(canvas, meta);
  const graph = generateConnectionsGraph(exportData);

  console.log('\n');
  console.log(`[FLOW-DEBUG] ${context || 'Flow Graph'}`);
  console.log(graph);
  console.log('\n[FLOW-DEBUG] Full connections JSON:');
  console.log(JSON.stringify(exportData.connections, null, 2));
  console.log('\n');
}

/**
 * Loga conexões de um flow em runtime (para o executor) em formato JSON otimizado para LLM
 */
export function debugLogRuntimeFlow(
  flow: {
    id: string;
    name: string;
    nodes: Array<{ id: string; nodeType: string; config: unknown }>;
    edges: Array<{ sourceNodeId: string; targetNodeId: string; buttonId?: string | null }>;
  },
  context?: string
): void {
  if (!DEBUG) return;

  // Estrutura compacta otimizada para LLM
  const nodes: Record<string, any> = {};
  
  for (const node of flow.nodes) {
    const config = node.config as Record<string, unknown>;
    const data: any = { type: node.nodeType };

    if (node.nodeType === 'EMOJI_REACTION' || node.nodeType === 'emoji_reaction') {
      data.emoji = config?.emoji;
    } else if (node.nodeType === 'TEXT_REACTION' || node.nodeType === 'text_reaction') {
      data.text = config?.textReaction;
    } else if (node.nodeType === 'INTERACTIVE_MESSAGE' || node.nodeType === 'interactive_message') {
      const elements = config?.elements as Array<{ id: string; type: string; title?: string }> | undefined;
      const buttons = elements?.filter((e) => e.type === 'button') || [];
      data.buttons = buttons.reduce((acc, btn) => {
        acc[btn.id] = btn.title || '';
        return acc;
      }, {} as Record<string, string>);
    } else if (node.nodeType === 'TEXT_MESSAGE' || node.nodeType === 'text_message') {
      data.text = config?.text;
    } else if (node.nodeType === 'DELAY' || node.nodeType === 'delay') {
      data.delay = config?.delaySeconds;
    }

    nodes[node.id] = data;
  }

  const connections = flow.edges.map(edge => {
    const conn: any = { from: edge.sourceNodeId, to: edge.targetNodeId };
    if (edge.buttonId) {
      conn.btn = edge.buttonId;
    }
    return conn;
  });

  console.log(`\n[FLOW-DEBUG] ${context || 'Flow'}: ${flow.name} (${flow.id})`);
  console.log(JSON.stringify({ nodes, connections }, null, 2));
  console.log('\n');
}
