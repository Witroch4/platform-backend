/**
 * Flow Builder Types
 *
 * This file re-exports all types from the modular flow-builder/ directory.
 * For new code, you can import directly from "@/types/flow-builder" (this file)
 * or from specific modules like "@/types/flow-builder/elements".
 *
 * @module types/flow-builder
 *
 * Structure:
 * - enums.ts      - FlowNodeType, status types, categories
 * - elements.ts   - InteractiveMessageElement and variants
 * - nodes.ts      - Node data interfaces (Start, Message, Template, etc.)
 * - templates.ts  - WhatsApp template types and limits
 * - instagram.ts  - Instagram/Facebook specific types
 * - canvas.ts     - FlowCanvas, FlowNode, FlowEdge
 * - palette.ts    - Palette items for sidebar
 * - constants.ts  - Channel limits, colors, canvas constants
 * - helpers.ts    - createFlowNode, validateFlowCanvas, etc.
 * - export.ts     - N8n-style export/import types
 */

export * from "./flow-builder/index";
