# Requirements Document

## Introduction

This feature refactors the Dialogflow response architecture to be completely asynchronous. The current system has timeout issues because the webhook directly communicates with WhatsApp API, causing delays that exceed Dialogflow's response time limits. The new architecture will separate concerns: the webhook will only interpret Dialogflow requests, queue tasks for a worker, and respond immediately with 200 OK. The worker will handle all WhatsApp API communication asynchronously, including both message sending (templates, interactive messages) and reaction sending for button clicks.

## Requirements

### Requirement 1

**User Story:** As a system administrator, I want the Dialogflow webhook to respond immediately to prevent timeouts, so that the conversation flow remains uninterrupted.

#### Acceptance Criteria

1. WHEN Dialogflow sends an intent request THEN the webhook SHALL respond with 200 OK within 2 seconds
2. WHEN the webhook receives a request THEN it SHALL NOT make direct calls to WhatsApp API
3. WHEN the webhook processes a request THEN it SHALL only queue tasks and return immediately

### Requirement 2

**User Story:** As a system administrator, I want all WhatsApp API communications to be handled asynchronously by a worker, so that message delivery is reliable and doesn't block the webhook response.

#### Acceptance Criteria

1. WHEN a task is queued THEN the worker SHALL process it asynchronously
2. WHEN the worker processes a message task THEN it SHALL send the appropriate message type (template or interactive) to WhatsApp API
3. WHEN the worker processes a reaction task THEN it SHALL send the emoji reaction to the specified message
4. IF WhatsApp API is temporarily unavailable THEN the worker SHALL retry the task according to configured retry policy

### Requirement 3

**User Story:** As a system administrator, I want the system to handle two distinct flows (intent responses and button reactions), so that both message sending and reaction functionality work seamlessly.

#### Acceptance Criteria

1. WHEN Dialogflow sends an intent request THEN the webhook SHALL create a 'sendMessage' task with intent mapping data
2. WHEN WhatsApp sends a button click event THEN the webhook SHALL create a 'sendReaction' task if a reaction is configured for that button
3. WHEN the worker processes a 'sendMessage' task THEN it SHALL determine message type (template/interactive) and send accordingly
4. WHEN the worker processes a 'sendReaction' task THEN it SHALL send the configured emoji as a reaction

### Requirement 4

**User Story:** As a system administrator, I want proper error handling and logging in the asynchronous system, so that I can monitor and troubleshoot issues effectively.

#### Acceptance Criteria

1. WHEN a worker task fails THEN it SHALL be logged with detailed error information
2. WHEN a worker task fails THEN it SHALL be retried according to the configured retry policy
3. WHEN maximum retries are reached THEN the task SHALL be moved to a dead letter queue
4. WHEN database queries fail in the webhook THEN it SHALL log the critical error internally AND still return 200 OK to Dialogflow

### Requirement 5

**User Story:** As a system administrator, I want the queue system to be scalable and maintainable, so that it can handle high message volumes without performance degradation.

#### Acceptance Criteria

1. WHEN multiple tasks are queued simultaneously THEN they SHALL be processed in order without blocking
2. WHEN the system is under high load THEN the queue SHALL maintain performance within acceptable limits
3. WHEN tasks are added to the queue THEN they SHALL be self-contained, including all data necessary for the worker to process them without needing further database lookups
4. WHEN the worker processes tasks THEN it SHALL use appropriate libraries for WhatsApp API communication