# Instagram Translation Worker Configuration

## Overview

The Instagram Translation Worker is a high-performance, IO-bound worker designed to translate WhatsApp interactive messages to Instagram-compatible formats. It processes translation jobs asynchronously while ensuring webhook responses are delivered within the required 5-second timeout.

## Configuration

### Worker Settings

- **Concurrency**: 100 (optimized for IO-bound tasks)
- **Lock Duration**: 5 seconds (ensures webhook timeout compliance)
- **Max Retries**: 3 attempts with exponential backoff
- **Priority**: High (10) for user-facing responses

### Resource Limits

#### Memory
- **Maximum**: 512MB (1GB in production)
- **Warning**: 384MB (768MB in production)
- **Critical**: 460MB (920MB in production)

#### CPU
- **Maximum**: 100% (1 core, 200% in production)
- **Warning**: 75% (150% in production)
- **Critical**: 90% (180% in production)

#### Processing Time
- **Maximum**: 4.5 seconds (webhook timeout compliance)
- **Warning**: 3 seconds
- **Timeout**: 5 seconds (lock duration)

### Queue Configuration

- **Priority**: 10 (high priority)
- **Remove on Complete**: 100 jobs
- **Remove on Fail**: 50 jobs
- **Backoff Strategy**: Exponential (2s → 4s → 8s, max 30s)

## Monitoring

### Metrics Collection
- **Interval**: 30 seconds
- **Health Checks**: Every 60 seconds
- **Performance Review**: Every 5 minutes

### Alert Thresholds
- **Error Rate**: > 5%
- **Queue Depth**: > 50 jobs
- **Processing Time**: > 4 seconds
- **Memory Usage**: > 80%
- **CPU Usage**: > 85%

### Available Endpoints
- `GET /api/admin/monitoring/instagram-translation?action=summary` - Performance summary
- `GET /api/admin/monitoring/instagram-translation?action=health` - Health status
- `GET /api/admin/monitoring/instagram-translation?action=logs` - Recent logs
- `GET /api/admin/monitoring/dashboard` - Integrated dashboard metrics

## Lifecycle Management

### Startup
1. Configuration validation
2. Resource limit verification
3. Health check execution
4. Worker initialization with timeout (10s)
5. Resource monitoring activation

### Runtime
- Continuous resource monitoring
- Performance metrics collection
- Error tracking and recovery
- Queue health monitoring

### Shutdown
1. Graceful shutdown signal handling (SIGTERM, SIGINT)
2. Resource monitoring cleanup
3. Worker closure with timeout (30s)
4. Database disconnection
5. Process exit

## Performance Optimization

### Concurrency Tuning
The worker is configured with a concurrency factor of 100, optimized for IO-bound translation tasks. This can be adjusted based on:

- CPU usage patterns
- Memory consumption
- Processing time metrics
- Queue depth trends

### Environment-Specific Settings

#### Development
- Concurrency: 10
- Memory Limit: 256MB
- Reduced monitoring frequency

#### Test
- Concurrency: 5
- Monitoring disabled
- Shorter timeouts

#### Production
- Concurrency: 100 (default)
- Memory Limit: 1GB
- Full monitoring enabled

## Error Handling

### Error Categories
- **Validation Errors**: Invalid job data or configuration
- **Conversion Errors**: Message format incompatibilities
- **Database Errors**: Query failures or connection issues
- **System Errors**: Unexpected runtime errors

### Recovery Strategies
- Automatic retry with exponential backoff
- Fallback to simple text messages
- Error tracking and alerting
- Graceful degradation

## Integration

### Queue Integration
The worker is registered in the main worker initialization system (`worker/init.ts`) and integrates with:

- BullMQ queue management
- Redis connection pooling
- Monitoring dashboard
- Error tracking system

### Monitoring Integration
- Application Performance Monitor
- Queue Monitor
- Database Monitor
- Instagram Translation Monitor
- Error Tracker

## Troubleshooting

### Common Issues

#### High Memory Usage
- Check concurrency settings
- Review job payload sizes
- Monitor for memory leaks
- Consider reducing concurrency

#### Slow Processing
- Verify database connection performance
- Check Redis connectivity
- Review conversion logic efficiency
- Monitor CPU usage patterns

#### Queue Backlog
- Increase worker concurrency (if resources allow)
- Check for failed jobs
- Verify worker health
- Review error rates

### Health Check Commands

```bash
# Check worker status
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=health"

# Get performance summary
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=summary&timeWindow=60"

# View recent logs
curl "http://localhost:3000/api/admin/monitoring/instagram-translation?action=logs&timeWindow=60"
```

### Configuration Validation

The worker configuration is automatically validated on startup. Invalid configurations will prevent worker initialization and log detailed error messages.

## Best Practices

1. **Monitor Resource Usage**: Regularly review CPU and memory metrics
2. **Tune Concurrency**: Adjust based on actual performance data
3. **Review Error Rates**: Investigate patterns in failed translations
4. **Health Checks**: Use monitoring endpoints for proactive maintenance
5. **Graceful Shutdowns**: Always use proper shutdown signals
6. **Log Analysis**: Review worker logs for performance insights

## Support

For issues or questions regarding the Instagram Translation Worker:

1. Check the monitoring dashboard for current status
2. Review worker logs for error details
3. Verify configuration settings
4. Test with health check endpoints
5. Consult performance metrics for optimization opportunities