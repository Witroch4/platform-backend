# Project Structure

## Root Directory Organization

```
/
├── app/                    # Next.js App Router (main application)
├── components/             # Reusable React components
├── lib/                   # Core libraries and utilities
├── worker/                # Background job processors
├── scripts/               # Database and deployment scripts
├── prisma/                # Database schema and migrations
├── types/                 # TypeScript type definitions
├── hooks/                 # Custom React hooks
├── public/                # Static assets
├── docs/                  # Documentation
└── __tests__/             # Test files
```

## App Directory Structure (Next.js App Router)

```
app/
├── api/                   # API routes
│   ├── admin/            # Admin-only endpoints
│   ├── chatwitia/        # AI chat endpoints
│   └── [feature]/        # Feature-specific APIs
├── admin/                # Admin dashboard pages
├── [accountid]/          # Dynamic account routes
│   └── dashboard/        # User dashboard
├── auth/                 # Authentication pages
├── components/           # App-specific components
├── globals.css           # Global styles
└── layout.tsx           # Root layout
```

## Library Organization

```
lib/
├── ai-integration/       # AI service integrations
├── auth/                # Authentication utilities
├── cache/               # Caching mechanisms
├── queue/               # Job queue management
├── webhook/             # Webhook processing
├── whatsapp/            # WhatsApp API integration
├── instagram/           # Instagram API integration
├── connections.ts       # Database connections
├── redis.ts            # Redis configuration
└── utils.ts            # General utilities
```

## Component Structure

```
components/
├── ui/                  # Base UI components (Shadcn/UI)
├── admin/              # Admin-specific components
├── auth/               # Authentication components
├── chatwitia/          # AI chat components
├── custom/             # Custom business components
├── icons/              # Icon components
├── providers/          # React context providers
└── [feature]/          # Feature-specific components
```

## Worker Architecture

```
worker/
├── webhook.worker.ts           # Main webhook processor
├── automacao.worker.ts         # Automation worker
├── ai-integration.worker.ts    # AI processing worker
├── processors/                 # Individual job processors
└── WebhookWorkerTasks/        # Webhook-specific tasks
```

## Key Conventions

### File Naming
- **Components**: PascalCase (e.g., `UserProfile.tsx`)
- **Pages**: kebab-case (e.g., `user-settings/page.tsx`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Types**: PascalCase with `.ts` extension
- **API Routes**: `route.ts` for App Router endpoints

### Import Patterns
- Use `@/` alias for root-level imports
- Group imports: external libraries, internal modules, relative imports
- Prefer named exports over default exports for utilities

### Directory Patterns
- **Feature-based**: Group related files by feature/domain
- **Layered**: Separate concerns (components, services, types)
- **Co-location**: Keep related files close (tests, types, components)

### Database Patterns
- **Prisma Schema**: Single source of truth in `prisma/schema.prisma`
- **Migrations**: Versioned in `prisma/migrations/`
- **Seeds**: Development data in `prisma/seed.ts`
- **Connections**: Singleton pattern in `lib/connections.ts`

### API Route Structure
```
app/api/[feature]/
├── route.ts              # GET, POST for collection
├── [id]/
│   └── route.ts         # GET, PUT, DELETE for item
└── [id]/[action]/
    └── route.ts         # Custom actions
```

### Testing Structure
```
__tests__/
├── unit/                # Unit tests
├── integration/         # Integration tests
├── e2e/                # End-to-end tests
├── contracts/          # API contract tests
├── setup/              # Test configuration
└── __mocks__/          # Mock implementations
```

## Environment Configuration

- **Development**: `.env.development`
- **Production**: `.env.production`
- **Local**: `.env.local` (gitignored)
- **Docker**: `.env.docker.example`

## Build Artifacts

- **Next.js**: `.next/` directory
- **Workers**: `dist/worker/` compiled TypeScript
- **Coverage**: `coverage/` test coverage reports
- **Backups**: `backups/` database backups