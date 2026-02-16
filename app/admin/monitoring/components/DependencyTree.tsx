"use client";

import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
	AlertTriangle,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Clock,
	Search,
	XCircle,
	Zap,
	GitBranch,
	ArrowRight,
} from "lucide-react";
import { FlowTree, FlowNode, JobState } from "@/types/queue-management";

interface DependencyTreeProps {
	flowTree: FlowTree;
	onNodeSelect?: (nodeId: string) => void;
	showOrphanedJobs?: boolean;
}

interface TreeNodeData extends FlowNode {
	expanded: boolean;
	depth: number;
	hasChildren: boolean;
	isOrphaned: boolean;
	dependencyCount: number;
}

export function DependencyTree({ flowTree, onNodeSelect, showOrphanedJobs = true }: DependencyTreeProps) {
	const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([flowTree.rootJob.jobId]));
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState<JobState | "all">("all");
	const [viewMode, setViewMode] = useState<"tree" | "flat" | "dependencies">("tree");
	const [selectedNode, setSelectedNode] = useState<string | null>(null);

	// Convert FlowTree to tree structure with metadata
	const treeData = useMemo(() => {
		const nodes: TreeNodeData[] = [];
		const nodeMap = new Map<string, FlowNode>();

		// First pass: collect all nodes
		const collectNodes = (node: FlowNode) => {
			nodeMap.set(node.jobId, node);
			node.children.forEach(collectNodes);
		};
		collectNodes(flowTree.rootJob);

		// Second pass: build tree with metadata
		const buildTree = (node: FlowNode, depth = 0): TreeNodeData => {
			const hasChildren = node.children.length > 0;
			const isOrphaned = depth > 0 && node.dependencies.length === 0;

			return {
				...node,
				expanded: expandedNodes.has(node.jobId),
				depth,
				hasChildren,
				isOrphaned,
				dependencyCount: node.dependencies.length,
			};
		};

		const processNode = (node: FlowNode, depth = 0) => {
			const treeNode = buildTree(node, depth);
			nodes.push(treeNode);

			if (treeNode.expanded && treeNode.hasChildren) {
				node.children.forEach((child) => processNode(child, depth + 1));
			}
		};

		processNode(flowTree.rootJob);
		return nodes;
	}, [flowTree, expandedNodes]);

	// Filter nodes based on search and status
	const filteredNodes = useMemo(() => {
		let filtered = treeData;

		// Status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter((node) => node.status === statusFilter);
		}

		// Search filter
		if (searchTerm) {
			filtered = filtered.filter(
				(node) =>
					node.jobName.toLowerCase().includes(searchTerm.toLowerCase()) ||
					node.jobId.toLowerCase().includes(searchTerm.toLowerCase()),
			);
		}

		// Orphaned jobs filter
		if (!showOrphanedJobs) {
			filtered = filtered.filter((node) => !node.isOrphaned);
		}

		return filtered;
	}, [treeData, statusFilter, searchTerm, showOrphanedJobs]);

	// Get dependency analysis
	const dependencyAnalysis = useMemo(() => {
		const allNodes = new Map<string, FlowNode>();
		const collectAllNodes = (node: FlowNode) => {
			allNodes.set(node.jobId, node);
			node.children.forEach(collectAllNodes);
		};
		collectAllNodes(flowTree.rootJob);

		const orphanedJobs = Array.from(allNodes.values()).filter(
			(node) => node.jobId !== flowTree.rootJob.jobId && node.dependencies.length === 0,
		);

		const circularDependencies: string[][] = [];
		const visited = new Set<string>();
		const recursionStack = new Set<string>();

		const detectCircular = (nodeId: string, path: string[] = []): boolean => {
			if (recursionStack.has(nodeId)) {
				const cycleStart = path.indexOf(nodeId);
				if (cycleStart !== -1) {
					circularDependencies.push(path.slice(cycleStart).concat(nodeId));
				}
				return true;
			}

			if (visited.has(nodeId)) return false;

			visited.add(nodeId);
			recursionStack.add(nodeId);

			const node = allNodes.get(nodeId);
			if (node) {
				for (const depId of node.dependencies) {
					if (detectCircular(depId, [...path, nodeId])) {
						return true;
					}
				}
			}

			recursionStack.delete(nodeId);
			return false;
		};

		Array.from(allNodes.keys()).forEach((nodeId) => {
			if (!visited.has(nodeId)) {
				detectCircular(nodeId);
			}
		});

		return {
			orphanedJobs,
			circularDependencies,
			totalNodes: allNodes.size,
			maxDepth: Math.max(
				...Array.from(allNodes.values()).map((n) => treeData.find((t) => t.jobId === n.jobId)?.depth || 0),
			),
		};
	}, [flowTree, treeData]);

	const toggleNode = (nodeId: string) => {
		const newExpanded = new Set(expandedNodes);
		if (newExpanded.has(nodeId)) {
			newExpanded.delete(nodeId);
		} else {
			newExpanded.add(nodeId);
		}
		setExpandedNodes(newExpanded);
	};

	const handleNodeSelect = (nodeId: string) => {
		setSelectedNode(nodeId);
		onNodeSelect?.(nodeId);
	};

	const getStatusIcon = (status: JobState) => {
		switch (status) {
			case "completed":
				return <CheckCircle className="h-4 w-4 text-green-600" />;
			case "failed":
				return <XCircle className="h-4 w-4 text-red-600" />;
			case "active":
				return <Zap className="h-4 w-4 text-blue-600" />;
			case "waiting":
				return <Clock className="h-4 w-4 text-yellow-600" />;
			case "delayed":
				return <Clock className="h-4 w-4 text-orange-600" />;
			case "paused":
				return <AlertTriangle className="h-4 w-4 text-gray-600" />;
			default:
				return <Clock className="h-4 w-4 text-gray-600" />;
		}
	};

	const getStatusBadgeVariant = (status: JobState) => {
		switch (status) {
			case "completed":
				return "default" as const;
			case "failed":
				return "destructive" as const;
			case "active":
				return "default" as const;
			case "waiting":
				return "secondary" as const;
			case "delayed":
				return "secondary" as const;
			case "paused":
				return "outline" as const;
			default:
				return "outline" as const;
		}
	};

	const renderTreeNode = (node: TreeNodeData) => {
		const indentLevel = node.depth * 24;
		const isSelected = selectedNode === node.jobId;

		return (
			<div
				key={node.jobId}
				className={`border-l-2 ${isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
				style={{ marginLeft: `${indentLevel}px` }}
			>
				<div
					className={`flex items-center p-3 hover:bg-gray-50 cursor-pointer ${isSelected ? "bg-blue-50" : ""}`}
					onClick={() => handleNodeSelect(node.jobId)}
				>
					{/* Expand/Collapse Button */}
					<div className="w-6 flex justify-center">
						{node.hasChildren ? (
							<Button
								variant="ghost"
								className="h-6 w-6 p-0"
								onClick={(e) => {
									e.stopPropagation();
									toggleNode(node.jobId);
								}}
							>
								{node.expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
							</Button>
						) : (
							<div className="w-4 h-4" />
						)}
					</div>

					{/* Status Icon */}
					<div className="mr-3">{getStatusIcon(node.status)}</div>

					{/* Job Info */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center space-x-2">
							<span className="font-medium truncate">{node.jobName}</span>
							<Badge variant={getStatusBadgeVariant(node.status)}>{node.status}</Badge>
							{node.isOrphaned && (
								<Badge variant="destructive" className="text-xs">
									Orphaned
								</Badge>
							)}
						</div>
						<div className="text-sm text-muted-foreground">
							{node.jobId} • Level {node.depth}
							{node.dependencyCount > 0 && <span> • {node.dependencyCount} dependencies</span>}
						</div>
					</div>

					{/* Children Count */}
					{node.hasChildren && (
						<Badge variant="outline" className="text-xs">
							{node.children.length} children
						</Badge>
					)}
				</div>

				{/* Error Message */}
				{node.error && (
					<div className="ml-9 mr-3 mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
						{node.error}
					</div>
				)}

				{/* Dependencies */}
				{node.dependencies.length > 0 && (
					<div className="ml-9 mr-3 mb-2 text-xs text-muted-foreground">
						<span className="font-medium">Dependencies:</span> {node.dependencies.join(", ")}
					</div>
				)}
			</div>
		);
	};

	const renderDependencyView = () => {
		return (
			<div className="space-y-4">
				{filteredNodes.map((node) => (
					<Card key={node.jobId} className={selectedNode === node.jobId ? "border-blue-500" : ""}>
						<CardContent className="p-4">
							<div className="flex items-center justify-between mb-3">
								<div className="flex items-center space-x-3">
									{getStatusIcon(node.status)}
									<div>
										<h4 className="font-medium">{node.jobName}</h4>
										<p className="text-sm text-muted-foreground">{node.jobId}</p>
									</div>
								</div>
								<Badge variant={getStatusBadgeVariant(node.status)}>{node.status}</Badge>
							</div>

							{/* Dependencies */}
							{node.dependencies.length > 0 && (
								<div className="mb-3">
									<h5 className="text-sm font-medium mb-2">Dependencies:</h5>
									<div className="flex flex-wrap gap-2">
										{node.dependencies.map((depId) => (
											<div key={depId} className="flex items-center space-x-1 text-sm bg-gray-100 px-2 py-1 rounded">
												<ArrowRight className="h-3 w-3" />
												<span>{depId}</span>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Children */}
							{node.children.length > 0 && (
								<div>
									<h5 className="text-sm font-medium mb-2">Children:</h5>
									<div className="flex flex-wrap gap-2">
										{node.children.map((child) => (
											<div
												key={child.jobId}
												className="flex items-center space-x-1 text-sm bg-blue-100 px-2 py-1 rounded"
											>
												<GitBranch className="h-3 w-3" />
												<span>{child.jobName}</span>
											</div>
										))}
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				))}
			</div>
		);
	};

	return (
		<div className="space-y-4">
			{/* Header */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Dependency Analysis</CardTitle>
						<div className="flex items-center space-x-2">
							<div className="relative">
								<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search jobs..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-8 w-48"
								/>
							</div>

							<Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Status</SelectItem>
									<SelectItem value="waiting">Waiting</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="completed">Completed</SelectItem>
									<SelectItem value="failed">Failed</SelectItem>
									<SelectItem value="delayed">Delayed</SelectItem>
								</SelectContent>
							</Select>

							<Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
								<SelectTrigger className="w-32">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="tree">Tree View</SelectItem>
									<SelectItem value="flat">Flat View</SelectItem>
									<SelectItem value="dependencies">Dependencies</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Analysis Summary */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
						<div className="text-center">
							<div className="text-2xl font-bold">{dependencyAnalysis.totalNodes}</div>
							<div className="text-sm text-muted-foreground">Total Jobs</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold">{dependencyAnalysis.maxDepth}</div>
							<div className="text-sm text-muted-foreground">Max Depth</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold text-red-600">{dependencyAnalysis.orphanedJobs.length}</div>
							<div className="text-sm text-muted-foreground">Orphaned Jobs</div>
						</div>
						<div className="text-center">
							<div className="text-2xl font-bold text-yellow-600">{dependencyAnalysis.circularDependencies.length}</div>
							<div className="text-sm text-muted-foreground">Circular Deps</div>
						</div>
					</div>
				</CardHeader>
			</Card>

			{/* Issues Alert */}
			{(dependencyAnalysis.orphanedJobs.length > 0 || dependencyAnalysis.circularDependencies.length > 0) && (
				<Card className="border-yellow-200 bg-yellow-50">
					<CardHeader>
						<CardTitle className="flex items-center text-yellow-800">
							<AlertTriangle className="h-5 w-5 mr-2" />
							Dependency Issues Detected
						</CardTitle>
					</CardHeader>
					<CardContent>
						{dependencyAnalysis.orphanedJobs.length > 0 && (
							<div className="mb-4">
								<h4 className="font-medium text-yellow-800 mb-2">Orphaned Jobs:</h4>
								<div className="flex flex-wrap gap-2">
									{dependencyAnalysis.orphanedJobs.map((job) => (
										<Badge key={job.jobId} variant="destructive" className="text-xs">
											{job.jobName}
										</Badge>
									))}
								</div>
							</div>
						)}

						{dependencyAnalysis.circularDependencies.length > 0 && (
							<div>
								<h4 className="font-medium text-yellow-800 mb-2">Circular Dependencies:</h4>
								<div className="space-y-1">
									{dependencyAnalysis.circularDependencies.map((cycle, index) => (
										<div key={index} className="text-sm text-yellow-700">
											{cycle.join(" → ")}
										</div>
									))}
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Main Content */}
			<Card>
				<CardHeader>
					<CardTitle>
						{viewMode === "tree" ? "Tree View" : viewMode === "flat" ? "Flat View" : "Dependency View"}
						<Badge variant="outline" className="ml-2">
							{filteredNodes.length} jobs
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					{viewMode === "dependencies" ? (
						<div className="p-4">{renderDependencyView()}</div>
					) : (
						<div className="max-h-96 overflow-y-auto">
							{filteredNodes.length > 0 ? (
								filteredNodes.map(renderTreeNode)
							) : (
								<div className="text-center py-8 text-muted-foreground">
									<Search className="h-8 w-8 mx-auto mb-2" />
									<p>No jobs match the current filters</p>
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
