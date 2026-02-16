"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
	AlertTriangle,
	ArrowUpDown,
	Calendar,
	CheckCircle,
	ChevronLeft,
	ChevronRight,
	Clock,
	Eye,
	Filter,
	MoreHorizontal,
	RefreshCw,
	Search,
	Trash2,
	TrendingUp,
	XCircle,
} from "lucide-react";
import { Job, JobState, JobAction, BatchAction, JobFilters, SortOptions, Pagination } from "@/types/queue-management";

interface JobListProps {
	queueName: string;
	state: JobState;
	onJobAction: (action: JobAction) => void;
	onBatchAction: (action: BatchAction) => void;
}

export function JobList({ queueName, state, onJobAction, onBatchAction }: JobListProps) {
	const [jobs, setJobs] = useState<Job[]>([]);
	const [loading, setLoading] = useState(true);
	const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
	const [filters, setFilters] = useState<JobFilters>({});
	const [sortBy, setSortBy] = useState<SortOptions>({ field: "createdAt", direction: "desc" });
	const [pagination, setPagination] = useState<Pagination>({
		page: 1,
		limit: 50,
		total: 0,
		totalPages: 0,
	});
	const [searchTerm, setSearchTerm] = useState("");

	// Mock data for demonstration
	useEffect(() => {
		const fetchJobs = async () => {
			setLoading(true);

			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// Generate mock jobs based on state
			const mockJobs: Job[] = Array.from({ length: Math.min(pagination.limit, 100) }, (_, i) => ({
				id: `job-${state}-${i + 1}`,
				name: `${state}-job-${i + 1}`,
				queueName,
				status: state,
				data: {
					userId: `user-${i + 1}`,
					action: `process-${state}`,
					timestamp: new Date().toISOString(),
				},
				progress: state === "active" ? Math.floor(Math.random() * 100) : undefined,
				attempts: Math.floor(Math.random() * 3) + 1,
				maxAttempts: 3,
				createdAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
				processedAt: state !== "waiting" ? new Date(Date.now() - Math.random() * 12 * 60 * 60 * 1000) : undefined,
				finishedAt: ["completed", "failed"].includes(state)
					? new Date(Date.now() - Math.random() * 6 * 60 * 60 * 1000)
					: undefined,
				error: state === "failed" ? `Error processing job ${i + 1}: Connection timeout` : undefined,
				delay: state === "delayed" ? Math.floor(Math.random() * 300000) : undefined,
				priority: Math.floor(Math.random() * 10),
			}));

			setJobs(mockJobs);
			setPagination((prev) => ({
				...prev,
				total: 100,
				totalPages: Math.ceil(100 / prev.limit),
			}));
			setLoading(false);
		};

		fetchJobs();
	}, [queueName, state, pagination.page, pagination.limit, filters, sortBy]);

	const getStatusIcon = (status: JobState) => {
		switch (status) {
			case "completed":
				return <CheckCircle className="h-4 w-4 text-green-600" />;
			case "failed":
				return <XCircle className="h-4 w-4 text-red-600" />;
			case "active":
				return <TrendingUp className="h-4 w-4 text-blue-600" />;
			case "waiting":
				return <Clock className="h-4 w-4 text-yellow-600" />;
			case "delayed":
				return <Calendar className="h-4 w-4 text-orange-600" />;
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

	const formatDuration = (ms: number) => {
		if (ms < 1000) return `${ms}ms`;
		if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
		if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
		return `${(ms / 3600000).toFixed(1)}h`;
	};

	const formatRelativeTime = (date: Date) => {
		const now = new Date();
		const diff = now.getTime() - date.getTime();

		if (diff < 60000) return "Just now";
		if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
		return `${Math.floor(diff / 86400000)}d ago`;
	};

	const handleSelectAll = (checked: boolean) => {
		if (checked) {
			setSelectedJobs(jobs.map((job) => job.id));
		} else {
			setSelectedJobs([]);
		}
	};

	const handleSelectJob = (jobId: string, checked: boolean) => {
		if (checked) {
			setSelectedJobs((prev) => [...prev, jobId]);
		} else {
			setSelectedJobs((prev) => prev.filter((id) => id !== jobId));
		}
	};

	const handleJobAction = (action: JobAction["action"], jobIds: string[] = selectedJobs) => {
		onJobAction({ action, jobIds });
		setSelectedJobs([]);
	};

	const handleSort = (field: string) => {
		setSortBy((prev) => ({
			field,
			direction: prev.field === field && prev.direction === "asc" ? "desc" : "asc",
		}));
	};

	const filteredJobs = jobs.filter((job) => {
		if (
			searchTerm &&
			!job.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
			!job.id.toLowerCase().includes(searchTerm.toLowerCase())
		) {
			return false;
		}
		return true;
	});

	const canRetry = ["failed", "completed"].includes(state);
	const canRemove = true;
	const canPromote = state === "waiting";

	return (
		<div className="space-y-4">
			{/* Filters and Search */}
			<Card>
				<CardHeader className="pb-3">
					<div className="flex items-center justify-between">
						<CardTitle className="flex items-center">
							{getStatusIcon(state)}
							<span className="ml-2 capitalize">{state} Jobs</span>
							<Badge variant="outline" className="ml-2">
								{pagination.total}
							</Badge>
						</CardTitle>
						<div className="flex items-center space-x-2">
							<div className="relative">
								<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search jobs..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-8 w-64"
								/>
							</div>
							<Button variant="outline">
								<Filter className="h-4 w-4 mr-2" />
								Filters
							</Button>
							<Button variant="outline">
								<RefreshCw className="h-4 w-4 mr-2" />
								Refresh
							</Button>
						</div>
					</div>
				</CardHeader>

				{/* Batch Actions */}
				{selectedJobs.length > 0 && (
					<CardContent className="pt-0">
						<div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-md">
							<span className="text-sm font-medium">
								{selectedJobs.length} job{selectedJobs.length > 1 ? "s" : ""} selected
							</span>
							<div className="flex space-x-2">
								{canRetry && (
									<Button variant="outline" onClick={() => handleJobAction("retry")}>
										<RefreshCw className="h-4 w-4 mr-2" />
										Retry
									</Button>
								)}
								{canPromote && (
									<Button variant="outline" onClick={() => handleJobAction("promote")}>
										<TrendingUp className="h-4 w-4 mr-2" />
										Promote
									</Button>
								)}
								{canRemove && (
									<Button variant="outline" onClick={() => handleJobAction("remove")}>
										<Trash2 className="h-4 w-4 mr-2" />
										Remove
									</Button>
								)}
							</div>
						</div>
					</CardContent>
				)}
			</Card>

			{/* Jobs Table */}
			<Card>
				<CardContent className="p-0">
					{loading ? (
						<div className="flex items-center justify-center py-12">
							<RefreshCw className="h-8 w-8 animate-spin mr-2" />
							<span>Loading jobs...</span>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">
										<Checkbox
											checked={selectedJobs.length === jobs.length && jobs.length > 0}
											onCheckedChange={handleSelectAll}
										/>
									</TableHead>
									<TableHead>
										<Button variant="ghost" onClick={() => handleSort("name")} className="h-auto p-0 font-semibold">
											Job Name
											<ArrowUpDown className="ml-2 h-4 w-4" />
										</Button>
									</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>
										<Button
											variant="ghost"
											onClick={() => handleSort("createdAt")}
											className="h-auto p-0 font-semibold"
										>
											Created
											<ArrowUpDown className="ml-2 h-4 w-4" />
										</Button>
									</TableHead>
									<TableHead>Progress</TableHead>
									<TableHead>Attempts</TableHead>
									<TableHead>Duration</TableHead>
									<TableHead className="w-12">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredJobs.map((job) => {
									const duration =
										job.finishedAt && job.processedAt
											? job.finishedAt.getTime() - job.processedAt.getTime()
											: job.processedAt
												? Date.now() - job.processedAt.getTime()
												: null;

									return (
										<TableRow key={job.id} className="hover:bg-muted/50">
											<TableCell>
												<Checkbox
													checked={selectedJobs.includes(job.id)}
													onCheckedChange={(checked) => handleSelectJob(job.id, checked as boolean)}
												/>
											</TableCell>
											<TableCell>
												<div>
													<div className="font-medium">{job.name}</div>
													<div className="text-sm text-muted-foreground">{job.id}</div>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex items-center space-x-2">
													{getStatusIcon(job.status)}
													<Badge variant={getStatusBadgeVariant(job.status)}>{job.status}</Badge>
												</div>
											</TableCell>
											<TableCell>
												<div>
													<div className="text-sm">{formatRelativeTime(job.createdAt)}</div>
													<div className="text-xs text-muted-foreground">{job.createdAt.toLocaleString()}</div>
												</div>
											</TableCell>
											<TableCell>
												{job.progress !== undefined ? (
													<div className="w-24">
														<div className="flex justify-between text-xs mb-1">
															<span>{job.progress}%</span>
														</div>
														<div className="w-full bg-gray-200 rounded-full h-2">
															<div className="bg-blue-600 h-2 rounded-full" style={{ width: `${job.progress}%` }} />
														</div>
													</div>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
											</TableCell>
											<TableCell>
												<div className="text-sm">
													{job.attempts}/{job.maxAttempts}
													{job.attempts > 1 && (
														<Badge variant="outline" className="ml-1 text-xs">
															Retry
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell>
												{duration ? (
													<span className="text-sm">{formatDuration(duration)}</span>
												) : (
													<span className="text-muted-foreground">-</span>
												)}
											</TableCell>
											<TableCell>
												<Button variant="ghost">
													<Eye className="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}

					{/* Pagination */}
					{!loading && filteredJobs.length > 0 && (
						<div className="flex items-center justify-between px-6 py-4 border-t">
							<div className="text-sm text-muted-foreground">
								Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
								{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} jobs
							</div>
							<div className="flex items-center space-x-2">
								<Button
									variant="outline"
									onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
									disabled={pagination.page === 1}
								>
									<ChevronLeft className="h-4 w-4" />
									Previous
								</Button>
								<div className="flex items-center space-x-1">
									{Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
										const page = i + 1;
										return (
											<Button
												key={page}
												variant={pagination.page === page ? "default" : "outline"}
												onClick={() => setPagination((prev) => ({ ...prev, page }))}
												className="w-8 h-8 p-0"
											>
												{page}
											</Button>
										);
									})}
								</div>
								<Button
									variant="outline"
									onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
									disabled={pagination.page === pagination.totalPages}
								>
									Next
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					)}

					{/* Empty State */}
					{!loading && filteredJobs.length === 0 && (
						<div className="flex flex-col items-center justify-center py-12">
							<Clock className="h-12 w-12 text-muted-foreground mb-4" />
							<h3 className="text-lg font-semibold mb-2">No {state} jobs found</h3>
							<p className="text-muted-foreground text-center">
								{searchTerm
									? `No jobs match your search criteria "${searchTerm}"`
									: `There are currently no ${state} jobs in this queue.`}
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
