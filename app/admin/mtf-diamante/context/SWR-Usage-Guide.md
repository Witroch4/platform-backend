# MTF Data Provider - SWR Configuration Guide

## Overview

The MTF Data Provider now includes comprehensive SWR configuration with support for:
- Server-Side Rendering (SSR) with fallback data
- Centralized error handling and logging
- Intelligent retry strategies
- Global configuration for all hooks

## Basic Usage

```tsx
import MtfDataProvider from './context/MtfDataProvider';

function MyApp() {
  return (
    <MtfDataProvider>
      <YourComponents />
    </MtfDataProvider>
  );
}
```

## SSR Support

### With Initial Data

```tsx
import MtfDataProvider from './context/MtfDataProvider';
import { prefetchInboxData } from './lib/ssr-helpers';

// In your page component
export async function getServerSideProps(context) {
  const inboxId = context.params.inboxId;
  const initialData = await prefetchInboxData(inboxId);
  
  return {
    props: {
      initialData,
    },
  };
}

function InboxPage({ initialData }) {
  return (
    <MtfDataProvider initialData={initialData}>
      <InboxComponents />
    </MtfDataProvider>
  );
}
```

### Manual Initial Data

```tsx
import MtfDataProvider from './context/MtfDataProvider';

function MyPage() {
  const initialData = {
    interactiveMessages: [/* your messages */],
    caixas: [/* your caixas */],
    lotes: [/* your lotes */],
    variaveis: [/* your variaveis */],
    apiKeys: [/* your api keys */],
  };

  return (
    <MtfDataProvider initialData={initialData}>
      <YourComponents />
    </MtfDataProvider>
  );
}
```

## Error Handling

The provider includes centralized error handling:

### Automatic Features
- **Retry Strategy**: Automatically retries server errors (5xx) up to 3 times
- **Client Error Handling**: Doesn't retry client errors (4xx)
- **Structured Logging**: All errors are logged with context
- **User Notifications**: Critical errors show user-friendly messages

### Custom Error Handling

Individual hooks can still override error handling:

```tsx
const { messages, error } = useInteractiveMessages(inboxId, false, {
  onError: (error) => {
    // Custom error handling for this specific hook
    console.error('Custom error handler:', error);
  }
});
```

## Configuration Options

### Global Configuration

The provider sets these global defaults:

```tsx
{
  // Retry configuration
  errorRetryCount: 3,
  errorRetryInterval: 2000, // 2 seconds
  
  // Revalidation settings
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  
  // Deduplication
  dedupingInterval: 2000, // 2 seconds
  
  // Timeouts
  loadingTimeout: 10000, // 10 seconds
}
```

### Hook-Level Overrides

Individual hooks can override global settings:

```tsx
const { messages } = useInteractiveMessages(inboxId, false, {
  refreshInterval: 10000, // Override to 10 seconds
  revalidateOnFocus: false, // Disable focus revalidation
});
```

## Fallback Data Structure

The fallback data maps to SWR keys used by hooks:

```tsx
{
  'interactive-messages': [...], // For useInteractiveMessages
  'caixas': [...],              // For useCaixas
  'lotes': [...],               // For useLotes
  'variaveis': [...],           // For useVariaveis
  'api-keys': [...],            // For useApiKeys
}
```

## Development vs Production

### Development Mode
- Detailed console logging
- Success/error callbacks with timing info
- Deprecation warnings for legacy functions

### Production Mode
- Minimal logging
- External error reporting (ready for Sentry integration)
- Optimized performance settings

## Migration from Legacy Provider

The new provider maintains full backward compatibility:

### Still Works (Deprecated)
```tsx
const { saveMessage, updateMessagesCache } = useMtfData();
```

### Recommended New Approach
```tsx
const { addMessage, updateMessage, deleteMessage } = useMtfData();
// Or use hooks directly:
const { addMessage } = useInteractiveMessages(inboxId);
```

## Performance Benefits

1. **Granular Caching**: Each data type has independent cache
2. **Reduced Requests**: SWR deduplication prevents duplicate requests
3. **Optimistic Updates**: Instant UI feedback with automatic rollback
4. **Smart Revalidation**: Only revalidates when necessary
5. **Pause Support**: Prevents updates during form editing

## Troubleshooting

### Common Issues

1. **Data Not Loading**: Check browser network tab for API errors
2. **Stale Data**: Verify revalidation settings aren't disabled
3. **Memory Leaks**: Ensure components unmount properly
4. **SSR Hydration**: Verify initial data structure matches expected format

### Debug Mode

Enable detailed logging in development:

```tsx
// The provider automatically enables debug logging in development
// Check browser console for detailed SWR operation logs
```

### Error Monitoring

In production, integrate with error monitoring:

```tsx
// In the global onError handler, add your monitoring service:
if (process.env.NODE_ENV === 'production') {
  Sentry.captureException(error, { extra: { swrKey: key } });
}
```