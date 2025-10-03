// Grid
export const GRID_SIZE = 20;

// Node sizing
export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 120;

// Layout spacing
export const NODE_SPACING_X = 160; // GRID_SIZE * 8
export const NODE_SPACING_Y = 120; // GRID_SIZE * 6

// Colors - Dark & Light Mode Compatible
export const NODE_COLORS = {
  default: 'hsl(var(--card))',
  primary: 'hsl(var(--primary))',
  success: 'hsl(142.1 76.2% 36.3%)', // green-600
  error: 'hsl(0 84.2% 60.2%)', // red-500
  warning: 'hsl(47.9 95.8% 53.1%)', // yellow-500
  running: 'hsl(221.2 83.2% 53.3%)', // blue-600
  disabled: 'hsl(var(--muted))',
};

export const EDGE_COLORS = {
  default: 'hsl(var(--muted-foreground))',
  success: 'hsl(142.1 76.2% 36.3%)',
  error: 'hsl(0 84.2% 60.2%)',
  running: 'hsl(221.2 83.2% 53.3%)',
  idle: 'hsl(var(--muted-foreground))',
};

// Z-Index
export const Z_INDEX = {
  node: 1,
  edge: 0,
  edgeHovered: 1000,
  minimap: 5,
  controls: 5,
  toolbar: 10,
  contextMenu: 100,
};

// Zoom
export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 1.8;
export const DEFAULT_ZOOM = 1;

// Animation
export const ZOOM_DURATION = 200;
export const PAN_DURATION = 200;

// Node Type Specific
export const NODE_TYPE_CONFIG = {
  agentDetails: {
    color: 'hsl(var(--primary))',
    icon: '🤖',
    label: 'Agente IA',
  },
  modelConfig: {
    color: 'hsl(262.1 83.3% 57.8%)', // purple-500
    icon: '⚙️',
    label: 'Modelo',
  },
  toolsConfig: {
    color: 'hsl(24.6 95% 53.1%)', // orange-500
    icon: '🔧',
    label: 'Ferramentas',
  },
  outputParser: {
    color: 'hsl(142.1 76.2% 36.3%)', // green-600
    icon: '📝',
    label: 'Saída Estruturada',
  },
};
