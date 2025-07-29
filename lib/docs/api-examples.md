# ChatWit Queue Management API - Usage Examples

This document provides practical examples of how to use the ChatWit Queue Management API.

## Authentication

All API requests require authentication using a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     https://api.chatwit.com/api/admin/queues
```

## Queue Management

### List All Queues

Get an overview of all queues with health metrics:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/queues?page=1&limit=20&sortBy=name"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalQueues": 5,
      "totalJobs": 1250,
      "activeJobs": 15,
      "failedJobs": 8
    },
    "queues": [
      {
        "name": "email-processing",
        "health": {
          "queueName": "email-processing",
          "waiting": 12,
          "active": 3,
          "completed": 1500,
          "failed": 5,
          "delayed": 2,
          "paused": false,
          "timestamp": "2024-01-15T10:30:00.000Z"
        },
        "performance": {
          "throughput": {
            "jobsPerMinute": 5.2,
            "jobsPerHour": 312
          },
          "averageProcessingTime": 2500,
          "averageWaitTime": 800,
          "successRate": 98.5,
          "errorRate": 1.5,
          "retryRate": 2.1
        },
        "status": "healthy"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Get Queue Details

Get detailed information about a specific queue:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/queues/email-processing?includeJobs=true&jobLimit=50"
```

### Create a New Queue

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "image-processing",
       "displayName": "Image Processing Queue",
       "description": "Processes uploaded images for optimization",
       "priority": 5,
       "concurrency": 3,
       "retryPolicy": {
         "attempts": 3,
         "backoff": "exponential",
         "delay": 2000
       },
       "cleanupPolicy": {
         "removeOnComplete": 100,
         "removeOnFail": 50
       },
       "alertThresholds": {
         "maxWaitingJobs": 50,
         "maxFailedJobs": 10,
         "maxProcessingTime": 30000,
         "minSuccessRate": 95
       }
     }' \
     https://api.chatwit.com/api/admin/queues
```

### Batch Queue Operations

Pause multiple queues at once:

```bash
curl -X PATCH \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "pause",
       "queueNames": ["email-processing", "image-processing"]
     }' \
     https://api.chatwit.com/api/admin/queues
```

Clean failed jobs from multiple queues:

```bash
curl -X PATCH \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "clean",
       "queueNames": ["email-processing"],
       "options": {
         "olderThan": 3600000,
         "limit": 100
       }
     }' \
     https://api.chatwit.com/api/admin/queues
```

## Job Management

### List Jobs

Get jobs with filtering and pagination:

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/jobs?queueName=email-processing&status=failed&page=1&limit=50&timeRange=24h"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "jobId": "job_123456",
        "jobName": "send-welcome-email",
        "queueName": "email-processing",
        "status": "failed",
        "createdAt": "2024-01-15T09:15:00.000Z",
        "processedAt": "2024-01-15T09:15:05.000Z",
        "finishedAt": "2024-01-15T09:15:08.000Z",
        "processingTime": 3000,
        "waitTime": 5000,
        "attempts": 3,
        "maxAttempts": 3,
        "error": "SMTP connection timeout",
        "correlationId": "user_signup_789"
      }
    ],
    "summary": {
      "total": 25,
      "byStatus": {
        "waiting": 5,
        "active": 2,
        "completed": 15,
        "failed": 3,
        "delayed": 0
      },
      "averageProcessingTime": 2500,
      "averageWaitTime": 800,
      "successRate": 88.0
    },
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 25,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Get Job Details

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/jobs/job_123456?queueName=email-processing&includePayload=true&includeHistory=true"
```

### Create a New Job

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "queueName": "email-processing",
       "jobName": "send-notification",
       "data": {
         "userId": "user_123",
         "email": "user@example.com",
         "template": "welcome",
         "variables": {
           "name": "John Doe",
           "activationLink": "https://app.example.com/activate/abc123"
         }
       },
       "options": {
         "priority": 5,
         "delay": 0,
         "attempts": 3,
         "backoff": {
           "type": "exponential",
           "delay": 2000
         }
       }
     }' \
     https://api.chatwit.com/api/admin/jobs
```

### Batch Job Operations

Retry multiple failed jobs:

```bash
curl -X PATCH \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "retry",
       "jobIds": ["job_123456", "job_789012"],
       "queueName": "email-processing"
     }' \
     https://api.chatwit.com/api/admin/jobs
```

Remove multiple jobs:

```bash
curl -X PATCH \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "remove",
       "jobIds": ["job_123456", "job_789012"],
       "queueName": "email-processing",
       "options": {
         "force": true
       }
     }' \
     https://api.chatwit.com/api/admin/jobs
```

## Metrics and Analytics

### Get Metrics in JSON Format

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/metrics?queueName=email-processing&timeRange=24h&format=json&metrics=throughput,latency,success_rate"
```

### Export Metrics as CSV

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/metrics?format=csv&timeRange=7d" \
     -o queue-metrics.csv
```

### Get Prometheus Metrics

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/metrics?format=prometheus"
```

### Export Detailed Metrics

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "queueNames": ["email-processing", "image-processing"],
       "timeRange": {
         "start": "2024-01-14T00:00:00.000Z",
         "end": "2024-01-15T00:00:00.000Z"
       },
       "metrics": ["throughput", "latency", "success_rate", "error_rate"],
       "format": "json",
       "includeJobDetails": true,
       "filters": {
         "jobTypes": ["send-welcome-email", "send-notification"],
         "statuses": ["completed", "failed"]
       }
     }' \
     https://api.chatwit.com/api/admin/metrics/export
```

## Webhook Management

### List Webhooks

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/webhooks?page=1&limit=20&enabled=true"
```

### Create a Webhook

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "slack-notifications",
       "url": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
       "events": [
         "job.failed",
         "queue.paused",
         "alert.created"
       ],
       "headers": {
         "Content-Type": "application/json"
       },
       "secret": "your-webhook-secret-key",
       "enabled": true,
       "retryPolicy": {
         "maxAttempts": 3,
         "backoffType": "exponential",
         "initialDelay": 1000,
         "maxDelay": 30000
       },
       "filters": {
         "queueNames": ["email-processing", "image-processing"],
         "severityLevels": ["error", "critical"]
       },
       "timeout": 10000
     }' \
     https://api.chatwit.com/api/admin/webhooks
```

### Get Webhook Details

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/webhooks/webhook-id-123?includeDeliveries=true&deliveryLimit=100"
```

### Test a Webhook

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "webhookId": "webhook-id-123",
       "eventType": "test.manual",
       "testPayload": {
         "message": "This is a test webhook delivery",
         "timestamp": "2024-01-15T10:30:00.000Z"
       }
     }' \
     https://api.chatwit.com/api/admin/webhooks/test
```

### Update Webhook

```bash
curl -X PUT \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "enabled": false,
       "events": ["job.failed", "alert.critical"],
       "timeout": 15000
     }' \
     https://api.chatwit.com/api/admin/webhooks/webhook-id-123
```

### Get Webhook Deliveries

```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/webhooks/webhook-id-123/deliveries?status=failed&page=1&limit=50&timeRange=24h"
```

### Retry Failed Deliveries

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "action": "retry",
       "deliveryIds": ["delivery-id-1", "delivery-id-2"]
     }' \
     https://api.chatwit.com/api/admin/webhooks/webhook-id-123/deliveries/actions
```

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "validationErrors": [
        {
          "path": "name",
          "message": "Name is required",
          "code": "invalid_type"
        }
      ]
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Invalid input data
- `QUEUE_NOT_FOUND`: Specified queue does not exist
- `JOB_NOT_FOUND`: Specified job does not exist
- `WEBHOOK_NOT_FOUND`: Specified webhook does not exist
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `UNAUTHORIZED`: Invalid or missing authentication
- `FORBIDDEN`: Insufficient permissions
- `CONFLICT`: Resource already exists
- `INTERNAL_SERVER_ERROR`: Unexpected server error

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Authenticated users**: 1000 requests per hour
- **Unauthenticated requests**: 100 requests per hour

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 995
X-RateLimit-Reset: 2024-01-15T11:00:00.000Z
```

## Pagination

List endpoints support pagination with consistent parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

Pagination metadata is included in responses:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Filtering and Sorting

Most list endpoints support filtering and sorting:

### Common Filter Parameters

- `search`: Text search across relevant fields
- `status`: Filter by status (varies by endpoint)
- `timeRange`: Time range for data (1h, 6h, 24h, 7d, 30d)

### Common Sort Parameters

- `sortBy`: Field to sort by
- `sortOrder`: Sort direction (asc, desc)

Example:
```bash
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
     "https://api.chatwit.com/api/admin/jobs?search=email&status=failed&sortBy=createdAt&sortOrder=desc"
```

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

class ChatWitQueueAPI {
  constructor(apiToken, baseURL = 'https://api.chatwit.com') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async getQueues(options = {}) {
    const response = await this.client.get('/api/admin/queues', { params: options });
    return response.data;
  }

  async getJobs(options = {}) {
    const response = await this.client.get('/api/admin/jobs', { params: options });
    return response.data;
  }

  async createJob(jobData) {
    const response = await this.client.post('/api/admin/jobs', jobData);
    return response.data;
  }

  async retryJobs(queueName, jobIds) {
    const response = await this.client.patch('/api/admin/jobs', {
      action: 'retry',
      jobIds,
      queueName
    });
    return response.data;
  }

  async createWebhook(webhookConfig) {
    const response = await this.client.post('/api/admin/webhooks', webhookConfig);
    return response.data;
  }
}

// Usage
const api = new ChatWitQueueAPI('your-api-token');

// Get all queues
const queues = await api.getQueues({ status: 'warning', limit: 50 });

// Get failed jobs
const failedJobs = await api.getJobs({ 
  status: 'failed', 
  timeRange: '24h',
  queueName: 'email-processing'
});

// Retry failed jobs
const retryResult = await api.retryJobs('email-processing', ['job1', 'job2']);
```

### Python

```python
import requests
from typing import Dict, List, Optional

class ChatWitQueueAPI:
    def __init__(self, api_token: str, base_url: str = 'https://api.chatwit.com'):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        }
    
    def get_queues(self, **params) -> Dict:
        response = requests.get(
            f'{self.base_url}/api/admin/queues',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def get_jobs(self, **params) -> Dict:
        response = requests.get(
            f'{self.base_url}/api/admin/jobs',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()
    
    def create_job(self, job_data: Dict) -> Dict:
        response = requests.post(
            f'{self.base_url}/api/admin/jobs',
            headers=self.headers,
            json=job_data
        )
        response.raise_for_status()
        return response.json()
    
    def retry_jobs(self, queue_name: str, job_ids: List[str]) -> Dict:
        response = requests.patch(
            f'{self.base_url}/api/admin/jobs',
            headers=self.headers,
            json={
                'action': 'retry',
                'jobIds': job_ids,
                'queueName': queue_name
            }
        )
        response.raise_for_status()
        return response.json()

# Usage
api = ChatWitQueueAPI('your-api-token')

# Get queues with warnings
queues = api.get_queues(status='warning', limit=50)

# Get failed jobs from last 24 hours
failed_jobs = api.get_jobs(
    status='failed',
    timeRange='24h',
    queueName='email-processing'
)

# Retry specific jobs
retry_result = api.retry_jobs('email-processing', ['job1', 'job2'])
```

This comprehensive guide should help developers integrate with the ChatWit Queue Management API effectively.