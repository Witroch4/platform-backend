"use client";

import React from "react";
import { FlowVisualizer } from "../components/FlowVisualizer";
import { FlowTimeline } from "../components/FlowTimeline";
import { FlowTree } from "@/types/queue-management";

// Mock flow data for demonstration
const mockFlowTree: FlowTree = {
	flowId: "webhook-processing-flow-001",
	status: "running",
	totalJobs: 8,
	completedJobs: 5,
	failedJobs: 1,
	startedAt: new Date("2024-01-15T10:00:00Z"),
	estimatedCompletion: new Date("2024-01-15T10:15:00Z"),
	rootJob: {
		jobId: "webhook-receiver",
		jobName: "Webhook Receiver",
		status: "completed",
		dependencies: [],
		children: [
			{
				jobId: "data-validator",
				jobName: "Data Validator",
				status: "completed",
				dependencies: ["webhook-receiver"],
				children: [
					{
						jobId: "user-processor",
						jobName: "User Data Processor",
						status: "active",
						dependencies: ["data-validator"],
						children: [
							{
								jobId: "notification-sender",
								jobName: "Notification Sender",
								status: "waiting",
								dependencies: ["user-processor"],
								children: [],
								metrics: {
									jobId: "notification-sender",
									queueName: "notifications",
									jobType: "notification",
									status: "waiting",
									timing: {
										createdAt: new Date("2024-01-15T10:08:00Z"),
									},
									resources: {
										memoryPeak: 0,
										cpuTime: 0,
									},
									attempts: 0,
								},
							},
						],
						metrics: {
							jobId: "user-processor",
							queueName: "user-processing",
							jobType: "data-processing",
							status: "active",
							timing: {
								createdAt: new Date("2024-01-15T10:05:00Z"),
								startedAt: new Date("2024-01-15T10:05:30Z"),
								processingTime: 120000,
								waitTime: 30000,
							},
							resources: {
								memoryPeak: 2048,
								cpuTime: 1500,
							},
							attempts: 1,
						},
					},
					{
						jobId: "audit-logger",
						jobName: "Audit Logger",
						status: "completed",
						dependencies: ["data-validator"],
						children: [],
						metrics: {
							jobId: "audit-logger",
							queueName: "audit",
							jobType: "logging",
							status: "completed",
							timing: {
								createdAt: new Date("2024-01-15T10:03:00Z"),
								startedAt: new Date("2024-01-15T10:03:15Z"),
								completedAt: new Date("2024-01-15T10:03:45Z"),
								processingTime: 30000,
								waitTime: 15000,
							},
							resources: {
								memoryPeak: 512,
								cpuTime: 200,
							},
							attempts: 1,
						},
					},
				],
				metrics: {
					jobId: "data-validator",
					queueName: "validation",
					jobType: "validation",
					status: "completed",
					timing: {
						createdAt: new Date("2024-01-15T10:01:00Z"),
						startedAt: new Date("2024-01-15T10:01:10Z"),
						completedAt: new Date("2024-01-15T10:02:30Z"),
						processingTime: 80000,
						waitTime: 10000,
					},
					resources: {
						memoryPeak: 1024,
						cpuTime: 800,
					},
					attempts: 1,
				},
			},
			{
				jobId: "error-handler",
				jobName: "Error Handler",
				status: "failed",
				dependencies: ["webhook-receiver"],
				error: "Connection timeout to external service",
				children: [
					{
						jobId: "retry-scheduler",
						jobName: "Retry Scheduler",
						status: "waiting",
						dependencies: ["error-handler"],
						children: [],
						metrics: {
							jobId: "retry-scheduler",
							queueName: "retry",
							jobType: "scheduler",
							status: "waiting",
							timing: {
								createdAt: new Date("2024-01-15T10:07:00Z"),
							},
							resources: {
								memoryPeak: 0,
								cpuTime: 0,
							},
							attempts: 0,
						},
					},
				],
				metrics: {
					jobId: "error-handler",
					queueName: "error-handling",
					jobType: "error-processing",
					status: "failed",
					timing: {
						createdAt: new Date("2024-01-15T10:02:00Z"),
						startedAt: new Date("2024-01-15T10:02:20Z"),
						completedAt: new Date("2024-01-15T10:04:00Z"),
						processingTime: 100000,
						waitTime: 20000,
					},
					resources: {
						memoryPeak: 1536,
						cpuTime: 1200,
					},
					attempts: 3,
					error: "Connection timeout to external service",
				},
			},
		],
		metrics: {
			jobId: "webhook-receiver",
			queueName: "webhooks",
			jobType: "webhook-processing",
			status: "completed",
			timing: {
				createdAt: new Date("2024-01-15T10:00:00Z"),
				startedAt: new Date("2024-01-15T10:00:05Z"),
				completedAt: new Date("2024-01-15T10:00:45Z"),
				processingTime: 40000,
				waitTime: 5000,
			},
			resources: {
				memoryPeak: 768,
				cpuTime: 300,
			},
			attempts: 1,
		},
	},
};

export default function FlowDemoPage() {
	const handleNodeSelect = (nodeId: string) => {
		console.log("Selected node:", nodeId);
	};

	const handleFlowAction = (action: string, flowId: string) => {
		console.log("Flow action:", action, "for flow:", flowId);
	};

	return (
		<div className="container mx-auto p-6 space-y-8">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold">Flow Visualization Demo</h1>
					<p className="text-muted-foreground">Interactive demonstration of enhanced flow visualization components</p>
				</div>
			</div>

			{/* Flow Visualizer Demo */}
			<div className="space-y-4">
				<h2 className="text-2xl font-semibold">Interactive Flow Graph</h2>
				<FlowVisualizer
					flowTree={mockFlowTree}
					onNodeSelect={handleNodeSelect}
					onFlowAction={handleFlowAction}
					showDependencyLines={true}
					enableInteractiveMode={true}
					autoLayout={true}
				/>
			</div>

			{/* Flow Timeline Demo */}
			<div className="space-y-4">
				<h2 className="text-2xl font-semibold">Flow Timeline & Dependencies</h2>
				<FlowTimeline
					flowTree={mockFlowTree}
					onNodeSelect={handleNodeSelect}
					showEstimatedCompletion={true}
					showDependencyFlow={true}
					enableRealTimeUpdates={true}
				/>
			</div>
		</div>
	);
}
