"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	AlertTriangle,
	CheckCircle,
	Clock,
	Maximize2,
	Minimize2,
	RefreshCw,
	Search,
	XCircle,
	Zap,
	GitBranch,
	ArrowRight,
	Filter,
	ZoomIn,
	ZoomOut,
	Move,
	Eye,
	EyeOff,
} from "lucide-react";
import { FlowTree, FlowNode, JobState } from "@/types/queue-management";

interface FlowVisualizerProps {
	flowTree: FlowTree;
	onNodeSelect?: (nodeId: string) => void;
	onFlowAction?: (action: "cancel" | "retry" | "pause" | "resume", flowId: string) => void;
	showDependencyLines?: boolean;
	enableInteractiveMode?: boolean;
	autoLayout?: boolean;
}

interface GraphNode {
	id: string;
	label: string;
	status: JobState;
	x: number;
	y: number;
	width: number;
	height: number;
	children: string[];
	parent?: string;
	level: number;
	error?: string;
	dependencies: string[];
	metrics?: any;
	isVisible: boolean;
	isHighlighted: boolean;
	processingTime?: number;
	waitTime?: number;
}

interface GraphEdge {
	from: string;
	to: string;
	type: "sequential" | "parallel" | "conditional" | "dependency";
	isVisible: boolean;
	isHighlighted: boolean;
	weight?: number;
}

interface ViewportState {
	x: number;
	y: number;
	scale: number;
}

interface InteractionState {
	isDragging: boolean;
	dragStart: { x: number; y: number };
	selectedNodes: Set<string>;
	hoveredNode: string | null;
}

export function FlowVisualizer({
	flowTree,
	onNodeSelect,
	onFlowAction,
	showDependencyLines = true,
	enableInteractiveMode = true,
	autoLayout = true,
}: FlowVisualizerProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const [nodes, setNodes] = useState<GraphNode[]>([]);
	const [edges, setEdges] = useState<GraphEdge[]>([]);
	const [selectedNode, setSelectedNode] = useState<string | null>(null);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [layoutType, setLayoutType] = useState<"hierarchical" | "radial" | "force" | "circular">("hierarchical");
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<JobState | "all">("all");
	const [showDependencies, setShowDependencies] = useState(showDependencyLines);
	const [showMetrics, setShowMetrics] = useState(false);

	// Viewport and interaction state
	const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 1 });
	const [interaction, setInteraction] = useState<InteractionState>({
		isDragging: false,
		dragStart: { x: 0, y: 0 },
		selectedNodes: new Set(),
		hoveredNode: null,
	});

	// Convert FlowTree to graph nodes and edges
	useEffect(() => {
		const convertToGraph = (flowNode: FlowNode, level = 0, parentId?: string): GraphNode[] => {
			const nodeId = flowNode.jobId;
			const graphNodes: GraphNode[] = [];

			// Create current node with enhanced properties
			const currentNode: GraphNode = {
				id: nodeId,
				label: flowNode.jobName,
				status: flowNode.status,
				x: 0, // Will be calculated by layout
				y: 0,
				width: Math.max(120, flowNode.jobName.length * 8 + 40),
				height: showMetrics ? 80 : 60,
				children: flowNode.children.map((child) => child.jobId),
				parent: parentId,
				level,
				error: flowNode.error,
				dependencies: flowNode.dependencies || [],
				metrics: flowNode.metrics,
				isVisible: true,
				isHighlighted: false,
				processingTime: flowNode.metrics?.timing?.processingTime,
				waitTime: flowNode.metrics?.timing?.waitTime,
			};

			graphNodes.push(currentNode);

			// Process children recursively
			flowNode.children.forEach((child) => {
				graphNodes.push(...convertToGraph(child, level + 1, nodeId));
			});

			return graphNodes;
		};

		const graphNodes = convertToGraph(flowTree.rootJob);

		// Apply filters
		const filteredNodes = graphNodes.map((node) => ({
			...node,
			isVisible:
				(statusFilter === "all" || node.status === statusFilter) &&
				(searchTerm === "" ||
					node.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
					node.id.toLowerCase().includes(searchTerm.toLowerCase())),
		}));

		setNodes(filteredNodes);

		// Create edges (both hierarchical and dependency)
		const graphEdges: GraphEdge[] = [];

		// Hierarchical edges (parent-child relationships)
		filteredNodes.forEach((node) => {
			if (node.parent) {
				const parentNode = filteredNodes.find((n) => n.id === node.parent);
				graphEdges.push({
					from: node.parent,
					to: node.id,
					type: "sequential",
					isVisible: node.isVisible && (parentNode?.isVisible ?? false),
					isHighlighted: false,
				});
			}
		});

		// Dependency edges (if enabled)
		if (showDependencies) {
			filteredNodes.forEach((node) => {
				node.dependencies.forEach((depId) => {
					const depNode = filteredNodes.find((n) => n.id === depId);
					if (depNode) {
						graphEdges.push({
							from: depId,
							to: node.id,
							type: "dependency",
							isVisible: node.isVisible && depNode.isVisible,
							isHighlighted: false,
							weight: 1,
						});
					}
				});
			});
		}

		setEdges(graphEdges);
	}, [flowTree, statusFilter, searchTerm, showDependencies, showMetrics]);

	// Enhanced layout calculation
	useEffect(() => {
		if (nodes.length === 0 || !autoLayout) return;

		const calculateLayout = () => {
			const updatedNodes = [...nodes];
			const visibleNodes = updatedNodes.filter((n) => n.isVisible);

			if (layoutType === "hierarchical") {
				// Enhanced hierarchical layout with better spacing
				const levelGroups: { [level: number]: GraphNode[] } = {};
				visibleNodes.forEach((node) => {
					if (!levelGroups[node.level]) levelGroups[node.level] = [];
					levelGroups[node.level].push(node);
				});

				const levelHeight = showMetrics ? 120 : 100;
				const baseNodeSpacing = 180;

				Object.keys(levelGroups).forEach((levelStr) => {
					const level = parseInt(levelStr);
					const nodesInLevel = levelGroups[level];

					// Dynamic spacing based on node width
					const maxNodeWidth = Math.max(...nodesInLevel.map((n) => n.width));
					const nodeSpacing = Math.max(baseNodeSpacing, maxNodeWidth + 40);

					const totalWidth = (nodesInLevel.length - 1) * nodeSpacing;
					const startX = -totalWidth / 2;

					nodesInLevel.forEach((node, index) => {
						const nodeInUpdated = updatedNodes.find((n) => n.id === node.id);
						if (nodeInUpdated) {
							nodeInUpdated.x = startX + index * nodeSpacing;
							nodeInUpdated.y = level * levelHeight;
						}
					});
				});
			} else if (layoutType === "radial") {
				// Enhanced radial layout
				const centerX = 0;
				const centerY = 0;
				const radiusStep = 150;

				visibleNodes.forEach((node) => {
					const nodeInUpdated = updatedNodes.find((n) => n.id === node.id);
					if (!nodeInUpdated) return;

					if (node.level === 0) {
						nodeInUpdated.x = centerX;
						nodeInUpdated.y = centerY;
					} else {
						const radius = node.level * radiusStep;
						const siblings = visibleNodes.filter((n) => n.level === node.level);
						const angleStep = (2 * Math.PI) / Math.max(siblings.length, 1);
						const nodeIndex = siblings.indexOf(node);
						const angle = nodeIndex * angleStep;

						nodeInUpdated.x = centerX + radius * Math.cos(angle);
						nodeInUpdated.y = centerY + radius * Math.sin(angle);
					}
				});
			} else if (layoutType === "circular") {
				// Circular layout for all nodes
				const centerX = 0;
				const centerY = 0;
				const radius = Math.max(200, visibleNodes.length * 15);

				visibleNodes.forEach((node, index) => {
					const nodeInUpdated = updatedNodes.find((n) => n.id === node.id);
					if (!nodeInUpdated) return;

					const angle = (index / visibleNodes.length) * 2 * Math.PI;
					nodeInUpdated.x = centerX + radius * Math.cos(angle);
					nodeInUpdated.y = centerY + radius * Math.sin(angle);
				});
			} else if (layoutType === "force") {
				// Simple force-directed layout simulation
				const iterations = 50;
				const repulsionStrength = 1000;
				const attractionStrength = 0.1;

				for (let i = 0; i < iterations; i++) {
					// Repulsion between all nodes
					for (let j = 0; j < visibleNodes.length; j++) {
						for (let k = j + 1; k < visibleNodes.length; k++) {
							const nodeA = updatedNodes.find((n) => n.id === visibleNodes[j].id);
							const nodeB = updatedNodes.find((n) => n.id === visibleNodes[k].id);
							if (!nodeA || !nodeB) continue;

							const dx = nodeB.x - nodeA.x;
							const dy = nodeB.y - nodeA.y;
							const distance = Math.sqrt(dx * dx + dy * dy) || 1;

							const force = repulsionStrength / (distance * distance);
							const fx = (dx / distance) * force;
							const fy = (dy / distance) * force;

							nodeA.x -= fx;
							nodeA.y -= fy;
							nodeB.x += fx;
							nodeB.y += fy;
						}
					}

					// Attraction along edges
					edges
						.filter((e) => e.isVisible)
						.forEach((edge) => {
							const nodeA = updatedNodes.find((n) => n.id === edge.from);
							const nodeB = updatedNodes.find((n) => n.id === edge.to);
							if (!nodeA || !nodeB) return;

							const dx = nodeB.x - nodeA.x;
							const dy = nodeB.y - nodeA.y;
							const distance = Math.sqrt(dx * dx + dy * dy) || 1;

							const force = distance * attractionStrength;
							const fx = (dx / distance) * force;
							const fy = (dy / distance) * force;

							nodeA.x += fx * 0.5;
							nodeA.y += fy * 0.5;
							nodeB.x -= fx * 0.5;
							nodeB.y -= fy * 0.5;
						});
				}
			}

			setNodes(updatedNodes);
		};

		const timeoutId = setTimeout(calculateLayout, 100);
		return () => clearTimeout(timeoutId);
	}, [nodes.length, layoutType, autoLayout, showMetrics, edges]);

	// Enhanced interaction handlers
	const handleNodeClick = useCallback(
		(nodeId: string, event?: React.MouseEvent) => {
			if (!enableInteractiveMode) return;

			if (event?.ctrlKey || event?.metaKey) {
				// Multi-select mode
				setInteraction((prev) => {
					const newSelected = new Set(prev.selectedNodes);
					if (newSelected.has(nodeId)) {
						newSelected.delete(nodeId);
					} else {
						newSelected.add(nodeId);
					}
					return { ...prev, selectedNodes: newSelected };
				});
			} else {
				// Single select mode
				setSelectedNode(nodeId);
				setInteraction((prev) => ({ ...prev, selectedNodes: new Set([nodeId]) }));
				onNodeSelect?.(nodeId);
			}

			// Highlight connected nodes
			highlightConnectedNodes(nodeId);
		},
		[enableInteractiveMode, onNodeSelect],
	);

	const handleNodeHover = useCallback((nodeId: string | null) => {
		setInteraction((prev) => ({ ...prev, hoveredNode: nodeId }));
		if (nodeId) {
			highlightConnectedNodes(nodeId, true);
		} else {
			clearHighlights();
		}
	}, []);

	const highlightConnectedNodes = useCallback((nodeId: string, isHover = false) => {
		setNodes((prev) =>
			prev.map((node) => ({
				...node,
				isHighlighted:
					node.id === nodeId ||
					node.children.includes(nodeId) ||
					node.dependencies.includes(nodeId) ||
					node.parent === nodeId,
			})),
		);

		setEdges((prev) =>
			prev.map((edge) => ({
				...edge,
				isHighlighted: edge.from === nodeId || edge.to === nodeId,
			})),
		);
	}, []);

	const clearHighlights = useCallback(() => {
		setNodes((prev) => prev.map((node) => ({ ...node, isHighlighted: false })));
		setEdges((prev) => prev.map((edge) => ({ ...edge, isHighlighted: false })));
	}, []);

	const handleZoom = useCallback((delta: number, center?: { x: number; y: number }) => {
		setViewport((prev) => {
			const newScale = Math.max(0.1, Math.min(3, prev.scale + delta));
			const scaleFactor = newScale / prev.scale;

			if (center) {
				// Zoom towards the center point
				const newX = center.x - (center.x - prev.x) * scaleFactor;
				const newY = center.y - (center.y - prev.y) * scaleFactor;
				return { x: newX, y: newY, scale: newScale };
			}

			return { ...prev, scale: newScale };
		});
	}, []);

	const handlePan = useCallback((deltaX: number, deltaY: number) => {
		setViewport((prev) => ({
			...prev,
			x: prev.x + deltaX,
			y: prev.y + deltaY,
		}));
	}, []);

	const resetView = useCallback(() => {
		setViewport({ x: 0, y: 0, scale: 1 });
		clearHighlights();
	}, [clearHighlights]);

	const fitToView = useCallback(() => {
		const visibleNodes = nodes.filter((n) => n.isVisible);
		if (visibleNodes.length === 0) return;

		const bounds = {
			minX: Math.min(...visibleNodes.map((n) => n.x)),
			maxX: Math.max(...visibleNodes.map((n) => n.x + n.width)),
			minY: Math.min(...visibleNodes.map((n) => n.y)),
			maxY: Math.max(...visibleNodes.map((n) => n.y + n.height)),
		};

		const padding = 50;
		const containerWidth = containerRef.current?.clientWidth || 800;
		const containerHeight = containerRef.current?.clientHeight || 500;

		const contentWidth = bounds.maxX - bounds.minX + padding * 2;
		const contentHeight = bounds.maxY - bounds.minY + padding * 2;

		const scaleX = containerWidth / contentWidth;
		const scaleY = containerHeight / contentHeight;
		const scale = Math.min(scaleX, scaleY, 1);

		const centerX = (bounds.minX + bounds.maxX) / 2;
		const centerY = (bounds.minY + bounds.maxY) / 2;

		setViewport({
			x: -centerX * scale + containerWidth / 2,
			y: -centerY * scale + containerHeight / 2,
			scale,
		});
	}, [nodes]);

	// Mouse event handlers for SVG interaction
	const handleMouseDown = useCallback(
		(event: React.MouseEvent) => {
			if (!enableInteractiveMode) return;

			const rect = svgRef.current?.getBoundingClientRect();
			if (!rect) return;

			setInteraction((prev) => ({
				...prev,
				isDragging: true,
				dragStart: {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
				},
			}));
		},
		[enableInteractiveMode],
	);

	const handleMouseMove = useCallback(
		(event: React.MouseEvent) => {
			if (!interaction.isDragging || !enableInteractiveMode) return;

			const rect = svgRef.current?.getBoundingClientRect();
			if (!rect) return;

			const currentX = event.clientX - rect.left;
			const currentY = event.clientY - rect.top;

			const deltaX = currentX - interaction.dragStart.x;
			const deltaY = currentY - interaction.dragStart.y;

			handlePan(deltaX, deltaY);

			setInteraction((prev) => ({
				...prev,
				dragStart: { x: currentX, y: currentY },
			}));
		},
		[interaction.isDragging, interaction.dragStart, enableInteractiveMode, handlePan],
	);

	const handleMouseUp = useCallback(() => {
		setInteraction((prev) => ({ ...prev, isDragging: false }));
	}, []);

	const handleWheel = useCallback(
		(event: React.WheelEvent) => {
			if (!enableInteractiveMode) return;

			event.preventDefault();
			const delta = -event.deltaY * 0.001;

			const rect = svgRef.current?.getBoundingClientRect();
			if (rect) {
				const center = {
					x: event.clientX - rect.left,
					y: event.clientY - rect.top,
				};
				handleZoom(delta, center);
			}
		},
		[enableInteractiveMode, handleZoom],
	);

	const getStatusColor = (status: JobState) => {
		switch (status) {
			case "completed":
				return "#10b981"; // green
			case "failed":
				return "#ef4444"; // red
			case "active":
				return "#3b82f6"; // blue
			case "waiting":
				return "#f59e0b"; // yellow
			case "delayed":
				return "#f97316"; // orange
			case "paused":
				return "#6b7280"; // gray
			default:
				return "#6b7280";
		}
	};

	const getStatusIcon = (status: JobState) => {
		switch (status) {
			case "completed":
				return <CheckCircle className="h-4 w-4" />;
			case "failed":
				return <XCircle className="h-4 w-4" />;
			case "active":
				return <Zap className="h-4 w-4" />;
			case "waiting":
				return <Clock className="h-4 w-4" />;
			case "delayed":
				return <Clock className="h-4 w-4" />;
			case "paused":
				return <AlertTriangle className="h-4 w-4" />;
			default:
				return <Clock className="h-4 w-4" />;
		}
	};

	const getEdgeColor = (edge: GraphEdge) => {
		if (edge.isHighlighted) return "#3b82f6";
		switch (edge.type) {
			case "dependency":
				return "#ef4444";
			case "parallel":
				return "#10b981";
			case "conditional":
				return "#f59e0b";
			default:
				return "#6b7280";
		}
	};

	const getEdgeStyle = (edge: GraphEdge) => {
		switch (edge.type) {
			case "dependency":
				return "5,5";
			case "conditional":
				return "10,5";
			default:
				return "none";
		}
	};

	const getFlowStatusBadge = (status: string) => {
		const variants = {
			pending: "secondary" as const,
			running: "default" as const,
			completed: "default" as const,
			failed: "destructive" as const,
			cancelled: "outline" as const,
		};
		return variants[status as keyof typeof variants] || "outline";
	};

	const calculateProgress = () => {
		return flowTree.totalJobs > 0 ? (flowTree.completedJobs / flowTree.totalJobs) * 100 : 0;
	};

	const selectedNodeData = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

	const formatDuration = (ms?: number) => {
		if (!ms) return "-";
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
		return `${(ms / 3600000).toFixed(1)}h`;
	};

	const getVisibleNodesCount = () => nodes.filter((n) => n.isVisible).length;
	const getVisibleEdgesCount = () => edges.filter((e) => e.isVisible).length;

	return (
		<TooltipProvider>
			<div className="space-y-4">
				{/* Enhanced Flow Header */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<div className="flex items-center space-x-4">
								<CardTitle className="flex items-center">
									<GitBranch className="h-5 w-5 mr-2" />
									Flow: {flowTree.flowId}
									<Badge variant={getFlowStatusBadge(flowTree.status)} className="ml-2">
										{flowTree.status}
									</Badge>
								</CardTitle>
							</div>
							<div className="flex items-center space-x-2">
								{/* Search */}
								<div className="relative">
									<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search nodes..."
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
										className="pl-8 w-40"
									/>
								</div>

								{/* Status Filter */}
								<Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
									<SelectTrigger className="w-28">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All</SelectItem>
										<SelectItem value="waiting">Waiting</SelectItem>
										<SelectItem value="active">Active</SelectItem>
										<SelectItem value="completed">Completed</SelectItem>
										<SelectItem value="failed">Failed</SelectItem>
										<SelectItem value="delayed">Delayed</SelectItem>
									</SelectContent>
								</Select>

								{/* Layout Type */}
								<Select value={layoutType} onValueChange={(value: any) => setLayoutType(value)}>
									<SelectTrigger className="w-32">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="hierarchical">Hierarchical</SelectItem>
										<SelectItem value="radial">Radial</SelectItem>
										<SelectItem value="circular">Circular</SelectItem>
										<SelectItem value="force">Force</SelectItem>
									</SelectContent>
								</Select>

								{/* View Options */}
								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											onClick={() => setShowDependencies(!showDependencies)}
											className={showDependencies ? "bg-blue-50" : ""}
										>
											{showDependencies ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
										</Button>
									</TooltipTrigger>
									<TooltipContent>{showDependencies ? "Hide Dependencies" : "Show Dependencies"}</TooltipContent>
								</Tooltip>

								<Tooltip>
									<TooltipTrigger asChild>
										<Button
											variant="outline"
											onClick={() => setShowMetrics(!showMetrics)}
											className={showMetrics ? "bg-green-50" : ""}
										>
											<Filter className="h-4 w-4" />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{showMetrics ? "Hide Metrics" : "Show Metrics"}</TooltipContent>
								</Tooltip>

								<Button variant="outline" onClick={fitToView}>
									<Move className="h-4 w-4" />
								</Button>

								<Button variant="outline" onClick={() => setIsFullscreen(!isFullscreen)}>
									{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
								</Button>

								<Button variant="outline" onClick={resetView}>
									<RefreshCw className="h-4 w-4" />
								</Button>
							</div>
						</div>

						{/* Enhanced Flow Stats */}
						<div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-4">
							<div className="text-center">
								<div className="text-2xl font-bold text-blue-600">{flowTree.totalJobs}</div>
								<div className="text-sm text-muted-foreground">Total Jobs</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-green-600">{flowTree.completedJobs}</div>
								<div className="text-sm text-muted-foreground">Completed</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-red-600">{flowTree.failedJobs}</div>
								<div className="text-sm text-muted-foreground">Failed</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold">{calculateProgress().toFixed(1)}%</div>
								<div className="text-sm text-muted-foreground">Progress</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-purple-600">{getVisibleNodesCount()}</div>
								<div className="text-sm text-muted-foreground">Visible Nodes</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-orange-600">{getVisibleEdgesCount()}</div>
								<div className="text-sm text-muted-foreground">Connections</div>
							</div>
						</div>
					</CardHeader>
				</Card>

				{/* Enhanced Graph Visualization */}
				<div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
					<Card className={`${isFullscreen ? "lg:col-span-4" : "lg:col-span-3"}`}>
						<CardHeader className="pb-2">
							<div className="flex items-center justify-between">
								<CardTitle>Interactive Flow Graph</CardTitle>
								<div className="flex items-center space-x-2">
									<Tooltip>
										<TooltipTrigger asChild>
											<Button variant="outline" onClick={() => handleZoom(0.2)}>
												<ZoomIn className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Zoom In</TooltipContent>
									</Tooltip>

									<span className="text-sm text-muted-foreground min-w-[50px] text-center">
										{Math.round(viewport.scale * 100)}%
									</span>

									<Tooltip>
										<TooltipTrigger asChild>
											<Button variant="outline" onClick={() => handleZoom(-0.2)}>
												<ZoomOut className="h-4 w-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent>Zoom Out</TooltipContent>
									</Tooltip>
								</div>
							</div>

							{/* Legend */}
							<div className="flex items-center space-x-4 text-xs text-muted-foreground">
								<div className="flex items-center space-x-1">
									<div className="w-3 h-0.5 bg-gray-600"></div>
									<span>Hierarchy</span>
								</div>
								{showDependencies && (
									<div className="flex items-center space-x-1">
										<div className="w-3 h-0.5 bg-red-500" style={{ strokeDasharray: "5,5" }}></div>
										<span>Dependencies</span>
									</div>
								)}
								<div className="flex items-center space-x-1">
									<div className="w-2 h-2 bg-blue-500 rounded-full"></div>
									<span>Selected</span>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-0">
							<div
								ref={containerRef}
								className="relative overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100 rounded-b-lg"
								style={{ height: isFullscreen ? "600px" : "500px" }}
							>
								<svg
									ref={svgRef}
									width="100%"
									height="100%"
									viewBox={`${-400 / viewport.scale + viewport.x / viewport.scale} ${-250 / viewport.scale + viewport.y / viewport.scale} ${800 / viewport.scale} ${500 / viewport.scale}`}
									className={enableInteractiveMode ? "cursor-grab" : "cursor-default"}
									onMouseDown={handleMouseDown}
									onMouseMove={handleMouseMove}
									onMouseUp={handleMouseUp}
									onMouseLeave={handleMouseUp}
									onWheel={handleWheel}
								>
									{/* Enhanced Grid background */}
									<defs>
										<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
											<path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
										</pattern>
										<pattern id="dotGrid" width="10" height="10" patternUnits="userSpaceOnUse">
											<circle cx="5" cy="5" r="0.5" fill="#d1d5db" />
										</pattern>

										{/* Enhanced Arrow markers */}
										<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
											<polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
										</marker>

										<marker
											id="arrowhead-highlighted"
											markerWidth="10"
											markerHeight="7"
											refX="9"
											refY="3.5"
											orient="auto"
										>
											<polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
										</marker>

										<marker
											id="arrowhead-dependency"
											markerWidth="10"
											markerHeight="7"
											refX="9"
											refY="3.5"
											orient="auto"
										>
											<polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
										</marker>

										{/* Node shadows */}
										<filter id="dropshadow" x="-20%" y="-20%" width="140%" height="140%">
											<feDropShadow dx="2" dy="2" stdDeviation="3" floodOpacity="0.3" />
										</filter>
									</defs>

									<rect width="100%" height="100%" fill="url(#dotGrid)" />

									{/* Enhanced Edges */}
									{edges
										.filter((e) => e.isVisible)
										.map((edge, index) => {
											const fromNode = nodes.find((n) => n.id === edge.from);
											const toNode = nodes.find((n) => n.id === edge.to);

											if (!fromNode || !toNode || !fromNode.isVisible || !toNode.isVisible) return null;

											const startX = fromNode.x + fromNode.width / 2;
											const startY = fromNode.y + fromNode.height;
											const endX = toNode.x + toNode.width / 2;
											const endY = toNode.y;

											// Calculate control points for curved edges
											const midY = (startY + endY) / 2;
											const controlY = edge.type === "dependency" ? midY - 30 : midY;

											const pathData =
												edge.type === "dependency" || Math.abs(startX - endX) > 100
													? `M ${startX} ${startY} Q ${startX} ${controlY} ${endX} ${endY}`
													: `M ${startX} ${startY} L ${endX} ${endY}`;

											return (
												<g key={`edge-${index}`}>
													<path
														d={pathData}
														stroke={getEdgeColor(edge)}
														strokeWidth={edge.isHighlighted ? "3" : "2"}
														strokeDasharray={getEdgeStyle(edge)}
														fill="none"
														markerEnd={`url(#${
															edge.isHighlighted
																? "arrowhead-highlighted"
																: edge.type === "dependency"
																	? "arrowhead-dependency"
																	: "arrowhead"
														})`}
														opacity={edge.isHighlighted ? 1 : 0.7}
													/>

													{/* Edge label for dependencies */}
													{edge.type === "dependency" && (
														<text
															x={(startX + endX) / 2}
															y={controlY - 5}
															textAnchor="middle"
															className="text-xs fill-red-600 font-medium"
														>
															depends
														</text>
													)}
												</g>
											);
										})}

									{/* Enhanced Nodes */}
									{nodes
										.filter((n) => n.isVisible)
										.map((node) => {
											const isSelected = selectedNode === node.id || interaction.selectedNodes.has(node.id);
											const isHovered = interaction.hoveredNode === node.id;
											const maxLabelLength = Math.floor((node.width - 20) / 7);
											const truncatedLabel =
												node.label.length > maxLabelLength
													? node.label.substring(0, maxLabelLength) + "..."
													: node.label;

											return (
												<g key={node.id}>
													{/* Node shadow */}
													<rect
														x={node.x + 2}
														y={node.y + 2}
														width={node.width}
														height={node.height}
														rx="8"
														fill="rgba(0,0,0,0.1)"
														className="pointer-events-none"
													/>

													{/* Node background */}
													<rect
														x={node.x}
														y={node.y}
														width={node.width}
														height={node.height}
														rx="8"
														fill={
															isSelected ? "#dbeafe" : isHovered ? "#f3f4f6" : node.isHighlighted ? "#fef3c7" : "white"
														}
														stroke={getStatusColor(node.status)}
														strokeWidth={isSelected ? "3" : node.isHighlighted ? "2" : "1.5"}
														className="cursor-pointer transition-all duration-200"
														onClick={(e) => handleNodeClick(node.id, e)}
														onMouseEnter={() => handleNodeHover(node.id)}
														onMouseLeave={() => handleNodeHover(null)}
														filter={isSelected || isHovered ? "url(#dropshadow)" : "none"}
													/>

													{/* Status indicator */}
													<circle
														cx={node.x + 12}
														cy={node.y + 12}
														r="6"
														fill={getStatusColor(node.status)}
														className="pointer-events-none"
													/>

													{/* Node label */}
													<text
														x={node.x + node.width / 2}
														y={node.y + (showMetrics ? node.height / 2 - 10 : node.height / 2 - 5)}
														textAnchor="middle"
														className="text-sm font-medium fill-gray-900 pointer-events-none"
													>
														{truncatedLabel}
													</text>

													{/* Status text */}
													<text
														x={node.x + node.width / 2}
														y={node.y + (showMetrics ? node.height / 2 + 5 : node.height / 2 + 10)}
														textAnchor="middle"
														className="text-xs fill-gray-600 pointer-events-none"
													>
														{node.status}
													</text>

													{/* Metrics display */}
													{showMetrics && (node.processingTime || node.waitTime) && (
														<text
															x={node.x + node.width / 2}
															y={node.y + node.height - 8}
															textAnchor="middle"
															className="text-xs fill-blue-600 pointer-events-none"
														>
															{node.processingTime
																? formatDuration(node.processingTime)
																: node.waitTime
																	? `wait: ${formatDuration(node.waitTime)}`
																	: ""}
														</text>
													)}

													{/* Error indicator */}
													{node.error && (
														<g>
															<circle
																cx={node.x + node.width - 12}
																cy={node.y + 12}
																r="8"
																fill="#ef4444"
																className="pointer-events-none"
															/>
															<text
																x={node.x + node.width - 12}
																y={node.y + 16}
																textAnchor="middle"
																className="text-xs fill-white font-bold pointer-events-none"
															>
																!
															</text>
														</g>
													)}

													{/* Dependency count indicator */}
													{node.dependencies.length > 0 && (
														<g>
															<circle
																cx={node.x + node.width - 12}
																cy={node.y + node.height - 12}
																r="8"
																fill="#f59e0b"
																className="pointer-events-none"
															/>
															<text
																x={node.x + node.width - 12}
																y={node.y + node.height - 8}
																textAnchor="middle"
																className="text-xs fill-white font-bold pointer-events-none"
															>
																{node.dependencies.length}
															</text>
														</g>
													)}

													{/* Children count indicator */}
													{node.children.length > 0 && (
														<g>
															<rect
																x={node.x + 4}
																y={node.y + node.height - 16}
																width="16"
																height="12"
																rx="6"
																fill="#10b981"
																className="pointer-events-none"
															/>
															<text
																x={node.x + 12}
																y={node.y + node.height - 7}
																textAnchor="middle"
																className="text-xs fill-white font-bold pointer-events-none"
															>
																{node.children.length}
															</text>
														</g>
													)}
												</g>
											);
										})}
								</svg>
							</div>
						</CardContent>
					</Card>

					{/* Node Details Panel */}
					{!isFullscreen && (
						<Card>
							<CardHeader>
								<CardTitle>Node Details</CardTitle>
							</CardHeader>
							<CardContent>
								{selectedNodeData ? (
									<div className="space-y-4">
										<div>
											<h4 className="font-medium">{selectedNodeData.label}</h4>
											<p className="text-sm text-muted-foreground">{selectedNodeData.id}</p>
										</div>

										<div className="flex items-center space-x-2">
											{getStatusIcon(selectedNodeData.status)}
											<Badge
												variant={
													selectedNodeData.status === "completed"
														? "default"
														: selectedNodeData.status === "failed"
															? "destructive"
															: "secondary"
												}
											>
												{selectedNodeData.status}
											</Badge>
										</div>

										<div className="space-y-2 text-sm">
											<div className="flex justify-between">
												<span>Level:</span>
												<span>{selectedNodeData.level}</span>
											</div>
											<div className="flex justify-between">
												<span>Children:</span>
												<span>{selectedNodeData.children.length}</span>
											</div>
											{selectedNodeData.parent && (
												<div className="flex justify-between">
													<span>Parent:</span>
													<span className="truncate">{selectedNodeData.parent}</span>
												</div>
											)}
										</div>

										{selectedNodeData.error && (
											<div className="p-2 bg-red-50 border border-red-200 rounded-md">
												<p className="text-sm text-red-800 font-medium">Error:</p>
												<p className="text-xs text-red-700">{selectedNodeData.error}</p>
											</div>
										)}

										<div className="space-y-2">
											<Button
												variant="outline"
												className="w-full"
												onClick={() => {
													// TODO: Implement job details view
													console.log("View job details:", selectedNodeData.id);
												}}
											>
												View Details
											</Button>
											{selectedNodeData.status === "failed" && (
												<Button
													variant="outline"
													className="w-full"
													onClick={() => {
														// TODO: Implement retry job
														console.log("Retry job:", selectedNodeData.id);
													}}
												>
													<RefreshCw className="h-4 w-4 mr-2" />
													Retry Job
												</Button>
											)}
										</div>
									</div>
								) : (
									<div className="text-center text-muted-foreground py-8">
										<Search className="h-8 w-8 mx-auto mb-2" />
										<p>Select a node to view details</p>
									</div>
								)}
							</CardContent>
						</Card>
					)}
				</div>

				{/* Flow Actions */}
				<Card>
					<CardHeader>
						<CardTitle>Flow Actions</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-2">
							<Button
								variant="outline"
								onClick={() => onFlowAction?.("retry", flowTree.flowId)}
								disabled={flowTree.status === "running"}
							>
								<RefreshCw className="h-4 w-4 mr-2" />
								Retry Flow
							</Button>
							<Button
								variant="outline"
								onClick={() => onFlowAction?.("cancel", flowTree.flowId)}
								disabled={["completed", "failed", "cancelled"].includes(flowTree.status)}
							>
								<XCircle className="h-4 w-4 mr-2" />
								Cancel Flow
							</Button>
							<Button
								variant="outline"
								onClick={() => onFlowAction?.("pause", flowTree.flowId)}
								disabled={flowTree.status !== "running"}
							>
								<AlertTriangle className="h-4 w-4 mr-2" />
								Pause Flow
							</Button>
							<Button
								variant="outline"
								onClick={() => onFlowAction?.("resume", flowTree.flowId)}
								disabled={flowTree.status !== "paused"}
							>
								<CheckCircle className="h-4 w-4 mr-2" />
								Resume Flow
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</TooltipProvider>
	);
}
