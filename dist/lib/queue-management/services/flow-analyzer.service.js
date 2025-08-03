"use strict";
/**
 * Flow Analyzer Service
 *
 * Analyzes job flows and dependencies, detects orphaned jobs,
 * circular dependencies, and provides flow optimization suggestions.
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlowAnalyzerService = void 0;
exports.getFlowAnalyzerService = getFlowAnalyzerService;
const events_1 = require("events");
const constants_1 = require("../constants");
const errors_1 = require("../errors");
const logger_1 = require("../utils/logger");
const permission_manager_service_1 = require("./permission-manager.service");
/**
 * Flow Analyzer Service Implementation
 */
let FlowAnalyzerService = (() => {
    let _classSuper = events_1.EventEmitter;
    let _instanceExtraInitializers = [];
    let _analyzeFlow_decorators;
    return class FlowAnalyzerService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _analyzeFlow_decorators = [(0, logger_1.measurePerformance)(new logger_1.Logger('FlowAnalyzerService'), 'analyzeFlow')];
            __esDecorate(this, null, _analyzeFlow_decorators, { kind: "method", name: "analyzeFlow", static: false, private: false, access: { has: obj => "analyzeFlow" in obj, get: obj => obj.analyzeFlow }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        logger = __runInitializers(this, _instanceExtraInitializers);
        permissionManager = (0, permission_manager_service_1.getPermissionManager)();
        prisma;
        analysisCache = new Map();
        orphanedJobsCache = new Map();
        circularDependenciesCache = new Map();
        constructor(prisma) {
            super();
            this.logger = new logger_1.Logger('FlowAnalyzerService');
            this.prisma = prisma;
        }
        /**
         * Analyze a complete flow
         */
        async analyzeFlow(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'view', flowId);
                }
                // Check cache first
                const cached = this.analysisCache.get(flowId);
                if (cached && this.isCacheValid(cached, 300000)) { // 5 minutes cache
                    return cached;
                }
                this.logger.info(`Analyzing flow: ${flowId}`, { flowId, userId: user?.userId });
                // Get flow tree
                const tree = await this.getFlowTree(flowId, user);
                // Calculate metrics
                const metrics = await this.getFlowMetrics(flowId, user);
                // Detect issues
                const issues = await this.detectFlowIssues(flowId, tree);
                // Generate optimizations
                const optimizations = await this.generateOptimizations(flowId, tree, metrics);
                const analysis = {
                    flowId,
                    tree,
                    metrics,
                    issues,
                    optimizations
                };
                // Cache the result
                this.analysisCache.set(flowId, analysis);
                this.logger.info(`Flow analysis completed: ${flowId}`, {
                    flowId,
                    totalJobs: tree.totalJobs,
                    completedJobs: tree.completedJobs,
                    failedJobs: tree.failedJobs,
                    issuesFound: issues.length,
                    optimizationsFound: optimizations.length,
                    userId: user?.userId
                });
                this.emit(constants_1.EVENT_TYPES.FLOW_ANALYZED, {
                    flowId,
                    analysis,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                return analysis;
            }
            catch (error) {
                this.logger.error(`Failed to analyze flow ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to analyze flow: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get flow tree structure
         */
        async getFlowTree(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'view', flowId);
                }
                // Get flow from database
                const flow = await this.prisma.jobFlow.findUnique({
                    where: { flowId },
                    include: {
                        dependencies: {
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                });
                if (!flow) {
                    throw new errors_1.FlowNotFoundError(flowId);
                }
                // Get all job metrics for this flow
                const jobMetrics = await this.prisma.jobMetric.findMany({
                    where: { flowId },
                    orderBy: { createdAt: 'desc' }
                });
                // Build dependency tree
                const rootNode = await this.buildFlowNode(flow.rootJobId, flow.dependencies, jobMetrics);
                const tree = {
                    flowId,
                    rootJob: rootNode,
                    totalJobs: flow.totalJobs,
                    completedJobs: flow.completedJobs,
                    failedJobs: flow.failedJobs,
                    status: flow.status,
                    startedAt: flow.startedAt || undefined,
                    completedAt: flow.completedAt || undefined,
                    estimatedCompletion: flow.estimatedCompletion || undefined
                };
                return tree;
            }
            catch (error) {
                if (error instanceof errors_1.FlowNotFoundError) {
                    throw error;
                }
                this.logger.error(`Failed to get flow tree for ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to get flow tree: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Get flow metrics
         */
        async getFlowMetrics(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'view', flowId);
                }
                const flow = await this.prisma.jobFlow.findUnique({
                    where: { flowId }
                });
                if (!flow) {
                    throw new errors_1.FlowNotFoundError(flowId);
                }
                // Get all job metrics for this flow
                const jobMetrics = await this.prisma.jobMetric.findMany({
                    where: { flowId },
                    orderBy: { createdAt: 'desc' }
                });
                // Calculate total duration
                const totalDuration = flow.completedAt && flow.startedAt
                    ? flow.completedAt.getTime() - flow.startedAt.getTime()
                    : 0;
                // Calculate critical path
                const criticalPath = await this.calculateCriticalPath(flowId, jobMetrics);
                // Calculate parallelism
                const parallelism = await this.calculateParallelism(flowId, jobMetrics);
                // Calculate efficiency
                const efficiency = totalDuration > 0
                    ? (criticalPath.reduce((sum, jobId) => {
                        const job = jobMetrics.find(j => j.jobId === jobId);
                        return sum + (job?.processingTime || 0);
                    }, 0) / totalDuration) * 100
                    : 0;
                // Detect bottlenecks
                const bottlenecks = await this.detectBottlenecks(flowId, jobMetrics);
                const metrics = {
                    flowId,
                    totalDuration,
                    criticalPath,
                    parallelism,
                    efficiency,
                    bottlenecks
                };
                return metrics;
            }
            catch (error) {
                if (error instanceof errors_1.FlowNotFoundError) {
                    throw error;
                }
                this.logger.error(`Failed to get flow metrics for ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to get flow metrics: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Cancel a flow and all its jobs
         */
        async cancelFlow(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'cancel', flowId);
                }
                const flow = await this.prisma.jobFlow.findUnique({
                    where: { flowId }
                });
                if (!flow) {
                    throw new errors_1.FlowNotFoundError(flowId);
                }
                // Update flow status
                await this.prisma.jobFlow.update({
                    where: { flowId },
                    data: {
                        status: 'cancelled',
                        completedAt: new Date()
                    }
                });
                // Cancel all active jobs in the flow
                const activeJobs = await this.prisma.jobMetric.findMany({
                    where: {
                        flowId,
                        status: { in: ['waiting', 'active', 'delayed'] }
                    }
                });
                let cancelledJobs = 0;
                for (const jobMetric of activeJobs) {
                    try {
                        // This would need integration with the actual queue to cancel jobs
                        // For now, we'll just update the status in our metrics
                        await this.prisma.jobMetric.update({
                            where: { id: jobMetric.id },
                            data: { status: 'failed' }
                        });
                        cancelledJobs++;
                    }
                    catch (error) {
                        this.logger.error(`Failed to cancel job ${jobMetric.jobId}:`, error);
                    }
                }
                this.logger.info(`Flow cancelled: ${flowId}`, {
                    flowId,
                    cancelledJobs,
                    totalJobs: flow.totalJobs,
                    userId: user?.userId
                });
                this.emit(constants_1.EVENT_TYPES.FLOW_CANCELLED, {
                    flowId,
                    cancelledJobs,
                    totalJobs: flow.totalJobs,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                // Clear cache
                this.analysisCache.delete(flowId);
                return true;
            }
            catch (error) {
                if (error instanceof errors_1.FlowNotFoundError) {
                    throw error;
                }
                this.logger.error(`Failed to cancel flow ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to cancel flow: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Retry a failed flow
         */
        async retryFlow(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'retry', flowId);
                }
                const flow = await this.prisma.jobFlow.findUnique({
                    where: { flowId }
                });
                if (!flow) {
                    throw new errors_1.FlowNotFoundError(flowId);
                }
                if (flow.status !== 'failed') {
                    throw new errors_1.ValidationError(`Cannot retry flow in status: ${flow.status}`, 'status', flow.status);
                }
                // Reset flow status
                await this.prisma.jobFlow.update({
                    where: { flowId },
                    data: {
                        status: 'pending',
                        completedAt: null,
                        failedJobs: 0
                    }
                });
                // Retry all failed jobs in the flow
                const failedJobs = await this.prisma.jobMetric.findMany({
                    where: {
                        flowId,
                        status: 'failed'
                    }
                });
                let retriedJobs = 0;
                for (const jobMetric of failedJobs) {
                    try {
                        // This would need integration with the actual queue to retry jobs
                        // For now, we'll just update the status in our metrics
                        await this.prisma.jobMetric.update({
                            where: { id: jobMetric.id },
                            data: {
                                status: 'waiting',
                                attempts: jobMetric.attempts + 1
                            }
                        });
                        retriedJobs++;
                    }
                    catch (error) {
                        this.logger.error(`Failed to retry job ${jobMetric.jobId}:`, error);
                    }
                }
                this.logger.info(`Flow retried: ${flowId}`, {
                    flowId,
                    retriedJobs,
                    totalFailedJobs: failedJobs.length,
                    userId: user?.userId
                });
                this.emit(constants_1.EVENT_TYPES.FLOW_RETRIED, {
                    flowId,
                    retriedJobs,
                    totalFailedJobs: failedJobs.length,
                    userId: user?.userId,
                    timestamp: new Date()
                });
                // Clear cache
                this.analysisCache.delete(flowId);
                return true;
            }
            catch (error) {
                if (error instanceof errors_1.FlowNotFoundError || error instanceof errors_1.ValidationError) {
                    throw error;
                }
                this.logger.error(`Failed to retry flow ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to retry flow: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Detect orphaned jobs
         */
        async detectOrphanedJobs() {
            try {
                // Check cache first
                const cacheKey = 'global';
                const cached = this.orphanedJobsCache.get(cacheKey);
                if (cached && this.isOrphanedJobsCacheValid(cached, 600000)) { // 10 minutes cache
                    return cached;
                }
                this.logger.info('Detecting orphaned jobs');
                const orphanedJobs = [];
                // Find jobs with missing parent jobs
                const jobsWithMissingParents = await this.prisma.jobMetric.findMany({
                    where: {
                        parentJobId: { not: null },
                        NOT: {
                            parentJobId: {
                                in: await this.prisma.jobMetric.findMany({
                                    select: { jobId: true }
                                }).then(jobs => jobs.map(j => j.jobId))
                            }
                        }
                    }
                });
                for (const job of jobsWithMissingParents) {
                    orphanedJobs.push({
                        jobId: job.jobId,
                        queueName: job.queueName,
                        flowId: job.flowId || undefined,
                        parentJobId: job.parentJobId || undefined,
                        reason: 'missing_parent',
                        detectedAt: new Date()
                    });
                }
                // Find jobs with missing flows
                const jobsWithMissingFlows = await this.prisma.jobMetric.findMany({
                    where: {
                        flowId: { not: null },
                        NOT: {
                            flowId: {
                                in: await this.prisma.jobFlow.findMany({
                                    select: { flowId: true }
                                }).then(flows => flows.map(f => f.flowId))
                            }
                        }
                    }
                });
                for (const job of jobsWithMissingFlows) {
                    orphanedJobs.push({
                        jobId: job.jobId,
                        queueName: job.queueName,
                        flowId: job.flowId || undefined,
                        parentJobId: job.parentJobId || undefined,
                        reason: 'missing_flow',
                        detectedAt: new Date()
                    });
                }
                // Cache the result
                this.orphanedJobsCache.set(cacheKey, orphanedJobs);
                this.logger.info(`Orphaned jobs detection completed`, {
                    orphanedJobsFound: orphanedJobs.length,
                    missingParents: jobsWithMissingParents.length,
                    missingFlows: jobsWithMissingFlows.length
                });
                if (orphanedJobs.length > 0) {
                    this.emit(constants_1.EVENT_TYPES.ORPHANED_JOBS_DETECTED, {
                        orphanedJobs,
                        count: orphanedJobs.length,
                        timestamp: new Date()
                    });
                }
                return orphanedJobs;
            }
            catch (error) {
                this.logger.error('Failed to detect orphaned jobs:', error);
                throw new errors_1.QueueManagementError(`Failed to detect orphaned jobs: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Detect circular dependencies
         */
        async detectCircularDependencies() {
            try {
                // Check cache first
                const cacheKey = 'global';
                const cached = this.circularDependenciesCache.get(cacheKey);
                if (cached && this.isCircularDependenciesCacheValid(cached, 600000)) { // 10 minutes cache
                    return cached;
                }
                this.logger.info('Detecting circular dependencies');
                const circularDependencies = [];
                // Get all flows with their dependencies
                const flows = await this.prisma.jobFlow.findMany({
                    include: {
                        dependencies: true
                    }
                });
                for (const flow of flows) {
                    const cycles = this.findCyclesInFlow(flow.dependencies);
                    for (const cycle of cycles) {
                        circularDependencies.push({
                            flowId: flow.flowId,
                            cycle,
                            severity: constants_1.ALERT_SEVERITIES.ERROR,
                            description: `Circular dependency detected in flow ${flow.flowId}: ${cycle.join(' -> ')}`
                        });
                    }
                }
                // Cache the result
                this.circularDependenciesCache.set(cacheKey, circularDependencies);
                this.logger.info(`Circular dependencies detection completed`, {
                    circularDependenciesFound: circularDependencies.length,
                    flowsAnalyzed: flows.length
                });
                if (circularDependencies.length > 0) {
                    this.emit(constants_1.EVENT_TYPES.CIRCULAR_DEPENDENCIES_DETECTED, {
                        circularDependencies,
                        count: circularDependencies.length,
                        timestamp: new Date()
                    });
                }
                return circularDependencies;
            }
            catch (error) {
                this.logger.error('Failed to detect circular dependencies:', error);
                throw new errors_1.QueueManagementError(`Failed to detect circular dependencies: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Detect bottlenecks in a flow
         */
        async detectBottlenecks(flowId, jobMetrics) {
            try {
                if (!jobMetrics) {
                    jobMetrics = await this.prisma.jobMetric.findMany({
                        where: { flowId }
                    });
                }
                const bottlenecks = [];
                const totalFlowDuration = this.calculateTotalFlowDuration(jobMetrics);
                // Find jobs that take significantly longer than average
                const avgProcessingTime = jobMetrics.reduce((sum, job) => sum + (job.processingTime || 0), 0) / jobMetrics.length;
                const threshold = avgProcessingTime * 2; // Jobs taking 2x average time
                for (const job of jobMetrics) {
                    if (job.processingTime && job.processingTime > threshold) {
                        const impact = totalFlowDuration > 0 ? (job.processingTime / totalFlowDuration) * 100 : 0;
                        bottlenecks.push({
                            jobId: job.jobId,
                            jobName: job.jobName || job.jobType || 'Unknown',
                            queueName: job.queueName,
                            duration: job.processingTime,
                            impact,
                            suggestions: this.generateBottleneckSuggestions(job, impact)
                        });
                    }
                }
                // Sort by impact (highest first)
                bottlenecks.sort((a, b) => b.impact - a.impact);
                return bottlenecks;
            }
            catch (error) {
                this.logger.error(`Failed to detect bottlenecks for flow ${flowId}:`, error);
                return [];
            }
        }
        /**
         * Suggest optimizations for a flow
         */
        async suggestOptimizations(flowId, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'view', flowId);
                }
                const analysis = await this.analyzeFlow(flowId, user);
                return analysis.optimizations;
            }
            catch (error) {
                this.logger.error(`Failed to suggest optimizations for flow ${flowId}:`, error, {
                    flowId,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to suggest optimizations: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        /**
         * Simulate flow changes
         */
        async simulateFlowChanges(flowId, changes, user) {
            try {
                // Validate permissions
                if (user) {
                    this.permissionManager.validateFlowOperation(user, 'view', flowId);
                }
                // Get current metrics
                const originalMetrics = await this.getFlowMetrics(flowId, user);
                // Simulate changes (simplified simulation)
                const simulatedMetrics = await this.simulateMetricsWithChanges(originalMetrics, changes);
                // Calculate improvements
                const improvements = {
                    totalDurationReduction: originalMetrics.totalDuration > 0
                        ? ((originalMetrics.totalDuration - simulatedMetrics.totalDuration) / originalMetrics.totalDuration) * 100
                        : 0,
                    parallelismIncrease: originalMetrics.parallelism > 0
                        ? ((simulatedMetrics.parallelism - originalMetrics.parallelism) / originalMetrics.parallelism) * 100
                        : 0,
                    bottleneckReduction: originalMetrics.bottlenecks.length - simulatedMetrics.bottlenecks.length
                };
                // Generate risks and recommendations
                const risks = this.generateSimulationRisks(changes);
                const recommendations = this.generateSimulationRecommendations(changes, improvements);
                const result = {
                    flowId,
                    originalMetrics,
                    simulatedMetrics,
                    improvements,
                    risks,
                    recommendations
                };
                this.logger.info(`Flow simulation completed: ${flowId}`, {
                    flowId,
                    changesCount: changes.length,
                    durationReduction: improvements.totalDurationReduction,
                    parallelismIncrease: improvements.parallelismIncrease,
                    userId: user?.userId
                });
                return result;
            }
            catch (error) {
                this.logger.error(`Failed to simulate flow changes for ${flowId}:`, error, {
                    flowId,
                    changesCount: changes.length,
                    userId: user?.userId
                });
                throw new errors_1.QueueManagementError(`Failed to simulate flow changes: ${error.message}`, constants_1.ERROR_CODES.INTERNAL_ERROR);
            }
        }
        // Private helper methods
        async buildFlowNode(jobId, dependencies, jobMetrics) {
            const jobMetric = jobMetrics.find(j => j.jobId === jobId);
            const children = [];
            // Find child jobs
            const childDependencies = dependencies.filter(d => d.parentJobId === jobId);
            for (const childDep of childDependencies) {
                const childNode = await this.buildFlowNode(childDep.jobId, dependencies, jobMetrics);
                children.push(childNode);
            }
            // Get job dependencies
            const jobDependencies = dependencies
                .filter(d => d.jobId === jobId)
                .map(d => d.parentJobId)
                .filter(Boolean);
            return {
                jobId,
                jobName: jobMetric?.jobName || jobMetric?.jobType || 'Unknown',
                status: jobMetric?.status || 'unknown',
                children,
                dependencies: jobDependencies,
                metrics: jobMetric || this.createEmptyJobMetrics(jobId),
                error: jobMetric?.errorMessage
            };
        }
        createEmptyJobMetrics(jobId) {
            return {
                jobId,
                queueName: 'unknown',
                jobName: 'Unknown',
                jobType: 'unknown',
                status: 'unknown',
                timing: {
                    createdAt: new Date()
                },
                resources: {
                    memoryPeak: 0,
                    cpuTime: 0
                },
                attempts: 0,
                maxAttempts: 1,
                payloadSize: 0
            };
        }
        async calculateCriticalPath(flowId, jobMetrics) {
            // Simplified critical path calculation
            // In a real implementation, this would use proper graph algorithms
            return jobMetrics
                .sort((a, b) => (b.processingTime || 0) - (a.processingTime || 0))
                .slice(0, Math.min(5, jobMetrics.length))
                .map(job => job.jobId);
        }
        async calculateParallelism(flowId, jobMetrics) {
            // Calculate average parallelism based on concurrent jobs
            const timeSlots = new Map();
            for (const job of jobMetrics) {
                if (job.startedAt && job.completedAt) {
                    const startTime = Math.floor(job.startedAt.getTime() / 60000); // 1-minute slots
                    const endTime = Math.floor(job.completedAt.getTime() / 60000);
                    for (let time = startTime; time <= endTime; time++) {
                        timeSlots.set(time, (timeSlots.get(time) || 0) + 1);
                    }
                }
            }
            if (timeSlots.size === 0)
                return 1;
            const totalConcurrency = Array.from(timeSlots.values()).reduce((sum, count) => sum + count, 0);
            return totalConcurrency / timeSlots.size;
        }
        calculateTotalFlowDuration(jobMetrics) {
            const startTimes = jobMetrics
                .map(job => job.startedAt?.getTime())
                .filter(Boolean);
            const endTimes = jobMetrics
                .map(job => job.completedAt?.getTime())
                .filter(Boolean);
            if (startTimes.length === 0 || endTimes.length === 0)
                return 0;
            return Math.max(...endTimes) - Math.min(...startTimes);
        }
        generateBottleneckSuggestions(job, impact) {
            const suggestions = [];
            if (impact > 50) {
                suggestions.push('Consider breaking this job into smaller parallel tasks');
                suggestions.push('Optimize the job processing logic');
                suggestions.push('Increase worker concurrency for this queue');
            }
            else if (impact > 25) {
                suggestions.push('Review job implementation for optimization opportunities');
                suggestions.push('Consider caching frequently accessed data');
            }
            else {
                suggestions.push('Monitor job performance over time');
            }
            return suggestions;
        }
        async detectFlowIssues(flowId, tree) {
            const issues = [];
            // Check for stuck flows
            if (tree.status === 'running' && tree.startedAt) {
                const runningTime = Date.now() - tree.startedAt.getTime();
                if (runningTime > 24 * 60 * 60 * 1000) { // 24 hours
                    issues.push({
                        type: 'stuck_flow',
                        severity: constants_1.ALERT_SEVERITIES.WARNING,
                        description: `Flow has been running for more than 24 hours`,
                        affectedJobs: [tree.rootJob.jobId],
                        suggestions: ['Check for deadlocks', 'Review job dependencies', 'Consider cancelling and restarting']
                    });
                }
            }
            // Check for high failure rate
            if (tree.totalJobs > 0 && tree.failedJobs / tree.totalJobs > 0.2) {
                issues.push({
                    type: 'bottleneck',
                    severity: constants_1.ALERT_SEVERITIES.ERROR,
                    description: `High failure rate: ${Math.round((tree.failedJobs / tree.totalJobs) * 100)}%`,
                    affectedJobs: [],
                    suggestions: ['Review failed job logs', 'Check job dependencies', 'Improve error handling']
                });
            }
            return issues;
        }
        async generateOptimizations(flowId, tree, metrics) {
            const optimizations = [];
            // Suggest parallelization if efficiency is low
            if (metrics.efficiency < 50 && metrics.parallelism < 2) {
                optimizations.push({
                    type: 'parallelization',
                    description: 'Increase parallelism by running independent jobs concurrently',
                    estimatedImprovement: 30,
                    implementation: 'Review job dependencies and parallelize independent tasks'
                });
            }
            // Suggest resource optimization for bottlenecks
            if (metrics.bottlenecks.length > 0) {
                optimizations.push({
                    type: 'resource_allocation',
                    description: 'Optimize resource allocation for bottleneck jobs',
                    estimatedImprovement: 20,
                    implementation: 'Increase worker concurrency or optimize job processing logic'
                });
            }
            return optimizations;
        }
        findCyclesInFlow(dependencies) {
            const cycles = [];
            const visited = new Set();
            const recursionStack = new Set();
            // Build adjacency list
            const graph = new Map();
            for (const dep of dependencies) {
                if (!graph.has(dep.jobId)) {
                    graph.set(dep.jobId, []);
                }
                if (dep.parentJobId) {
                    graph.get(dep.jobId).push(dep.parentJobId);
                }
            }
            // DFS to detect cycles
            const dfs = (node, path) => {
                visited.add(node);
                recursionStack.add(node);
                path.push(node);
                const neighbors = graph.get(node) || [];
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        dfs(neighbor, [...path]);
                    }
                    else if (recursionStack.has(neighbor)) {
                        // Found a cycle
                        const cycleStart = path.indexOf(neighbor);
                        if (cycleStart !== -1) {
                            cycles.push([...path.slice(cycleStart), neighbor]);
                        }
                    }
                }
                recursionStack.delete(node);
            };
            // Check all nodes
            for (const dep of dependencies) {
                if (!visited.has(dep.jobId)) {
                    dfs(dep.jobId, []);
                }
            }
            return cycles;
        }
        async simulateMetricsWithChanges(originalMetrics, changes) {
            // Simplified simulation - in reality this would be much more complex
            let simulatedMetrics = { ...originalMetrics };
            for (const change of changes) {
                switch (change.type) {
                    case 'parallelize':
                        simulatedMetrics.parallelism *= 1.5;
                        simulatedMetrics.totalDuration *= 0.8;
                        break;
                    case 'change_priority':
                        simulatedMetrics.efficiency *= 1.1;
                        break;
                    case 'add_dependency':
                        simulatedMetrics.totalDuration *= 1.1;
                        break;
                    case 'remove_dependency':
                        simulatedMetrics.totalDuration *= 0.9;
                        simulatedMetrics.parallelism *= 1.2;
                        break;
                }
            }
            return simulatedMetrics;
        }
        generateSimulationRisks(changes) {
            const risks = [];
            if (changes.some(c => c.type === 'remove_dependency')) {
                risks.push('Removing dependencies may cause jobs to run out of order');
            }
            if (changes.some(c => c.type === 'parallelize')) {
                risks.push('Increased parallelism may strain system resources');
            }
            return risks;
        }
        generateSimulationRecommendations(changes, improvements) {
            const recommendations = [];
            if (improvements.totalDurationReduction > 20) {
                recommendations.push('These changes show significant performance improvement');
            }
            if (improvements.parallelismIncrease > 30) {
                recommendations.push('Monitor system resources after implementing parallelization changes');
            }
            return recommendations;
        }
        isCacheValid(analysis, maxAge) {
            // Simple cache validation - in reality this would be more sophisticated
            return true; // For now, always consider cache valid within the time window
        }
        isOrphanedJobsCacheValid(orphanedJobs, maxAge) {
            if (orphanedJobs.length === 0)
                return false;
            const oldestDetection = Math.min(...orphanedJobs.map(job => job.detectedAt.getTime()));
            return Date.now() - oldestDetection < maxAge;
        }
        isCircularDependenciesCacheValid(dependencies, maxAge) {
            return true; // For now, always consider cache valid within the time window
        }
    };
})();
exports.FlowAnalyzerService = FlowAnalyzerService;
// Add missing event types
const FLOW_ANALYZER_EVENTS = {
    FLOW_ANALYZED: 'flow.analyzed',
    FLOW_RETRIED: 'flow.retried',
    ORPHANED_JOBS_DETECTED: 'flow.orphaned.jobs.detected',
    CIRCULAR_DEPENDENCIES_DETECTED: 'flow.circular.dependencies.detected'
};
// Export singleton instance
let flowAnalyzerServiceInstance = null;
function getFlowAnalyzerService(prisma) {
    if (!flowAnalyzerServiceInstance) {
        flowAnalyzerServiceInstance = new FlowAnalyzerService(prisma);
    }
    return flowAnalyzerServiceInstance;
}
exports.default = FlowAnalyzerService;
