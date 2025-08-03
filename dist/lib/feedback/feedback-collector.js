"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeedbackCollector = void 0;
exports.getFeedbackCollector = getFeedbackCollector;
const client_1 = require("@prisma/client");
const json_1 = require("../utils/json");
class FeedbackCollector {
    prisma;
    redis;
    constructor(prisma, redis) {
        this.prisma = prisma;
        this.redis = redis;
    }
    async submitFeedback(userId, type, category, title, description, severity = 'MEDIUM', metadata, systemContext, userEmail) {
        const feedbackId = `feedback_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`;
        const ctx = typeof systemContext === 'object' &&
            systemContext !== null &&
            !Array.isArray(systemContext)
            ? systemContext
            : undefined;
        const feedback = {
            id: feedbackId,
            userId,
            userEmail: userEmail ?? null,
            type,
            category,
            title,
            description,
            severity,
            status: 'OPEN',
            metadata: ((0, json_1.toInputJson)(metadata) ?? client_1.Prisma.DbNull),
            featureFlagContext: client_1.Prisma.DbNull,
            systemContext: ((0, json_1.toInputJson)({
                userAgent: ctx?.userAgent ?? 'Unknown',
                url: ctx?.url ?? 'Unknown',
                timestamp: new Date().toISOString(),
                sessionId: (ctx?.sessionId ?? null),
                correlationId: (ctx?.correlationId ?? null),
            }) ?? client_1.Prisma.DbNull),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        try {
            // Store in database
            await this.prisma.userFeedback.create({
                data: {
                    id: feedback.id,
                    userId: feedback.userId,
                    userEmail: feedback.userEmail,
                    type: feedback.type,
                    category: feedback.category,
                    title: feedback.title,
                    description: feedback.description,
                    severity: feedback.severity,
                    status: feedback.status,
                    metadata: feedback.metadata,
                    featureFlagContext: feedback.featureFlagContext,
                    systemContext: feedback.systemContext,
                    createdAt: feedback.createdAt,
                    updatedAt: feedback.updatedAt,
                },
            });
            // Store in Redis for real-time processing
            await this.redis.lpush('feedback_queue', JSON.stringify(feedback));
            // Update metrics
            await this.updateFeedbackMetrics(feedback);
            // Analyze feedback
            const analysis = await this.analyzeFeedback(feedback);
            // Store analysis
            await this.redis.setex(`feedback_analysis:${feedbackId}`, 60 * 60 * 24 * 30, // 30 days
            JSON.stringify(analysis));
            // Send alerts for critical feedback
            if (severity === 'CRITICAL' || analysis.urgency >= 8) {
                await this.sendCriticalFeedbackAlert(feedback, analysis);
            }
            console.log(`[Feedback] Submitted feedback: ${feedbackId} (${type}/${severity})`);
            return feedback;
        }
        catch (error) {
            console.error('[Feedback] Error submitting feedback:', error);
            throw error;
        }
    }
    async submitFeatureFlagFeedback(userId, flagName, enabled, variant, experience, description, metadata) {
        const metaObj = typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
            ? metadata
            : {};
        const feedback = await this.submitFeedback(userId, 'FEATURE_FLAG_FEEDBACK', 'feature_flags', `Feature Flag Feedback: ${flagName}`, description, experience === 'NEGATIVE' ? 'HIGH' : 'MEDIUM', (0, json_1.toInputJson)({
            experience,
            ...metaObj,
        }), undefined, null);
        // Add feature flag context
        const flagContext = {
            flagName,
            enabled,
            variant,
        };
        feedback.featureFlagContext = ((0, json_1.toInputJson)(flagContext) ?? client_1.Prisma.DbNull);
        // Update feedback with feature flag context
        await this.prisma.userFeedback.update({
            where: { id: feedback.id },
            data: {
                featureFlagContext: feedback.featureFlagContext,
            },
        });
        // Track feature flag feedback metrics
        await this.redis.hincrby(`feature_flag_feedback:${flagName}`, experience.toLowerCase(), 1);
        console.log(`[Feedback] Submitted feature flag feedback for ${flagName}: ${experience}`);
        return feedback;
    }
    async getFeedbackMetrics(startDate, endDate, category) {
        try {
            const whereClause = {};
            if (startDate || endDate) {
                whereClause.createdAt = {};
                if (startDate)
                    whereClause.createdAt.gte = startDate;
                if (endDate)
                    whereClause.createdAt.lte = endDate;
            }
            if (category) {
                whereClause.category = category;
            }
            const feedback = await this.prisma.userFeedback.findMany({
                where: whereClause,
                select: {
                    type: true,
                    severity: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
            const totalFeedback = feedback.length;
            const byType = feedback.reduce((acc, f) => {
                acc[f.type] = (acc[f.type] || 0) + 1;
                return acc;
            }, {});
            const bySeverity = feedback.reduce((acc, f) => {
                acc[f.severity] = (acc[f.severity] || 0) + 1;
                return acc;
            }, {});
            const byStatus = feedback.reduce((acc, f) => {
                acc[f.status] = (acc[f.status] || 0) + 1;
                return acc;
            }, {});
            // Calculate average resolution time
            const resolvedFeedback = feedback.filter(f => f.status === 'RESOLVED' || f.status === 'CLOSED');
            const averageResolutionTime = resolvedFeedback.length > 0
                ? resolvedFeedback.reduce((acc, f) => {
                    const resolutionTime = f.updatedAt.getTime() - f.createdAt.getTime();
                    return acc + resolutionTime;
                }, 0) / resolvedFeedback.length
                : 0;
            // Calculate satisfaction score (simplified)
            const satisfactionScore = this.calculateSatisfactionScore(feedback);
            // Generate trend data
            const trendData = this.generateTrendData(feedback);
            return {
                totalFeedback,
                byType,
                bySeverity,
                byStatus,
                averageResolutionTime,
                satisfactionScore,
                trendData,
            };
        }
        catch (error) {
            console.error('[Feedback] Error getting feedback metrics:', error);
            return {
                totalFeedback: 0,
                byType: {},
                bySeverity: {},
                byStatus: {},
                averageResolutionTime: 0,
                satisfactionScore: 0,
                trendData: [],
            };
        }
    }
    async getFeatureFlagFeedbackMetrics(flagName) {
        try {
            const metrics = await this.redis.hgetall(`feature_flag_feedback:${flagName}`);
            const positive = parseInt(metrics.positive || '0');
            const negative = parseInt(metrics.negative || '0');
            const neutral = parseInt(metrics.neutral || '0');
            const total = positive + negative + neutral;
            let sentiment = 'NEUTRAL';
            if (positive > negative && positive > neutral) {
                sentiment = 'POSITIVE';
            }
            else if (negative > positive && negative > neutral) {
                sentiment = 'NEGATIVE';
            }
            // Get recent feedback
            const recentFeedback = await this.prisma.userFeedback.findMany({
                where: {
                    type: 'FEATURE_FLAG_FEEDBACK',
                    featureFlagContext: {
                        path: ['flagName'],
                        equals: flagName,
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 10,
            });
            return {
                total,
                positive,
                negative,
                neutral,
                sentiment,
                recentFeedback,
            };
        }
        catch (error) {
            console.error(`[Feedback] Error getting feature flag feedback metrics for ${flagName}:`, error);
            return {
                total: 0,
                positive: 0,
                negative: 0,
                neutral: 0,
                sentiment: 'NEUTRAL',
                recentFeedback: [],
            };
        }
    }
    async analyzeFeedback(feedback) {
        try {
            // Simple sentiment analysis (in production, use proper NLP libraries)
            const text = `${feedback.title} ${feedback.description}`.toLowerCase();
            const positiveWords = ['good', 'great', 'excellent', 'love', 'amazing', 'perfect', 'fast', 'easy'];
            const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'slow', 'broken', 'error', 'bug', 'issue'];
            const positiveCount = positiveWords.filter(word => text.includes(word)).length;
            const negativeCount = negativeWords.filter(word => text.includes(word)).length;
            let sentiment = 'NEUTRAL';
            let confidence = 0.5;
            if (positiveCount > negativeCount) {
                sentiment = 'POSITIVE';
                confidence = Math.min(0.9, 0.5 + (positiveCount - negativeCount) * 0.1);
            }
            else if (negativeCount > positiveCount) {
                sentiment = 'NEGATIVE';
                confidence = Math.min(0.9, 0.5 + (negativeCount - positiveCount) * 0.1);
            }
            // Extract keywords
            const keywords = this.extractKeywords(text);
            // Categorize
            const categories = this.categorizeFeedback(text);
            // Calculate urgency
            const urgency = this.calculateUrgency(feedback, sentiment);
            // Determine if action is required
            const actionRequired = urgency >= 7 || feedback.severity === 'CRITICAL' || sentiment === 'NEGATIVE';
            // Suggest actions
            const suggestedActions = this.suggestActions(feedback, sentiment, urgency);
            return {
                sentiment,
                confidence,
                keywords,
                categories,
                urgency,
                actionRequired,
                suggestedActions,
            };
        }
        catch (error) {
            console.error('[Feedback] Error analyzing feedback:', error);
            return {
                sentiment: 'NEUTRAL',
                confidence: 0,
                keywords: [],
                categories: [],
                urgency: 5,
                actionRequired: false,
                suggestedActions: [],
            };
        }
    }
    async getAllFeedback(limit = 50, offset = 0, filters) {
        try {
            const whereClause = {};
            if (filters?.type)
                whereClause.type = filters.type;
            if (filters?.severity)
                whereClause.severity = filters.severity;
            if (filters?.status)
                whereClause.status = filters.status;
            if (filters?.category)
                whereClause.category = filters.category;
            return await this.prisma.userFeedback.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            });
        }
        catch (error) {
            console.error('[Feedback] Error getting all feedback:', error);
            return [];
        }
    }
    async updateFeedbackMetrics(feedback) {
        try {
            const today = new Date().toISOString().split('T')[0];
            // Update daily metrics
            await this.redis.hincrby(`feedback_metrics:${today}`, 'total', 1);
            await this.redis.hincrby(`feedback_metrics:${today}`, feedback.type, 1);
            await this.redis.hincrby(`feedback_metrics:${today}`, feedback.severity, 1);
            await this.redis.hincrby(`feedback_metrics:${today}`, feedback.category, 1);
            // Set expiry for daily metrics (30 days)
            await this.redis.expire(`feedback_metrics:${today}`, 60 * 60 * 24 * 30);
        }
        catch (error) {
            console.error('[Feedback] Error updating feedback metrics:', error);
        }
    }
    async sendCriticalFeedbackAlert(feedback, analysis) {
        try {
            const alert = {
                type: 'CRITICAL_FEEDBACK',
                severity: 'HIGH',
                title: `Critical Feedback Received: ${feedback.title}`,
                message: `Critical feedback from user ${feedback.userId}`,
                details: {
                    feedbackId: feedback.id,
                    type: feedback.type,
                    category: feedback.category,
                    severity: feedback.severity,
                    sentiment: analysis.sentiment,
                    urgency: analysis.urgency,
                    description: feedback.description,
                    suggestedActions: analysis.suggestedActions,
                },
                timestamp: new Date().toISOString(),
            };
            await this.redis.lpush('system_alerts', JSON.stringify(alert));
            console.log(`[Feedback] Critical feedback alert sent for: ${feedback.id}`);
        }
        catch (error) {
            console.error('[Feedback] Error sending critical feedback alert:', error);
        }
    }
    calculateSatisfactionScore(feedback) {
        if (feedback.length === 0)
            return 0;
        const scores = feedback.map(f => {
            switch (f.severity) {
                case 'LOW': return 4;
                case 'MEDIUM': return 3;
                case 'HIGH': return 2;
                case 'CRITICAL': return 1;
                default: return 3;
            }
        });
        return scores.reduce((acc, score) => acc + score, 0) / scores.length;
    }
    generateTrendData(feedback) {
        const trendMap = new Map();
        feedback.forEach(f => {
            const date = f.createdAt.toISOString().split('T')[0];
            const existing = trendMap.get(date) || { count: 0, severitySum: 0 };
            const severityValue = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[f.severity] || 2;
            trendMap.set(date, {
                count: existing.count + 1,
                severitySum: existing.severitySum + severityValue,
            });
        });
        return Array.from(trendMap.entries())
            .map(([date, data]) => ({
            date,
            count: data.count,
            averageSeverity: data.severitySum / data.count,
        }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    extractKeywords(text) {
        // Simple keyword extraction
        const words = text.split(/\s+/).filter(word => word.length > 3);
        const frequency = new Map();
        words.forEach(word => {
            frequency.set(word, (frequency.get(word) || 0) + 1);
        });
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([word]) => word);
    }
    categorizeFeedback(text) {
        const categories = [];
        if (text.includes('slow') || text.includes('performance'))
            categories.push('performance');
        if (text.includes('bug') || text.includes('error'))
            categories.push('bug');
        if (text.includes('ui') || text.includes('interface'))
            categories.push('ui');
        if (text.includes('feature') || text.includes('request'))
            categories.push('feature');
        if (text.includes('webhook') || text.includes('api'))
            categories.push('api');
        return categories;
    }
    calculateUrgency(feedback, sentiment) {
        let urgency = 5; // Base urgency
        // Adjust based on severity
        switch (feedback.severity) {
            case 'CRITICAL':
                urgency += 4;
                break;
            case 'HIGH':
                urgency += 2;
                break;
            case 'MEDIUM':
                urgency += 0;
                break;
            case 'LOW':
                urgency -= 1;
                break;
        }
        // Adjust based on sentiment
        if (sentiment === 'NEGATIVE')
            urgency += 2;
        if (sentiment === 'POSITIVE')
            urgency -= 1;
        // Adjust based on type
        if (feedback.type === 'BUG_REPORT')
            urgency += 1;
        if (feedback.type === 'PERFORMANCE_ISSUE')
            urgency += 2;
        return Math.max(1, Math.min(10, urgency));
    }
    suggestActions(feedback, sentiment, urgency) {
        const actions = [];
        if (urgency >= 8) {
            actions.push('Immediate investigation required');
            actions.push('Notify development team');
        }
        if (feedback.type === 'BUG_REPORT') {
            actions.push('Create bug ticket');
            actions.push('Reproduce issue');
        }
        if (feedback.type === 'PERFORMANCE_ISSUE') {
            actions.push('Performance analysis');
            actions.push('Check system metrics');
        }
        if (sentiment === 'NEGATIVE') {
            actions.push('Follow up with user');
            actions.push('Provide status update');
        }
        if (feedback.featureFlagContext) {
            const ctx = feedback.featureFlagContext;
            const flagName = ctx && typeof ctx.flagName === 'string' ? ctx.flagName : 'unknown';
            actions.push(`Review feature flag: ${flagName}`);
            if (sentiment === 'NEGATIVE') {
                actions.push('Consider feature flag rollback');
            }
        }
        return actions;
    }
}
exports.FeedbackCollector = FeedbackCollector;
// Singleton instance
let feedbackCollectorInstance = null;
function getFeedbackCollector(prisma, redis) {
    if (!feedbackCollectorInstance) {
        if (!prisma || !redis) {
            throw new Error('Prisma and Redis instances required for first initialization');
        }
        feedbackCollectorInstance = new FeedbackCollector(prisma, redis);
    }
    return feedbackCollectorInstance;
}
exports.default = FeedbackCollector;
