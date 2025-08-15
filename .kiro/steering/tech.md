# Technology Stack

## Core Technologies

- **Frontend**: Next.js 15+ (App Router), React 18+, TypeScript
- **Backend**: Node.js, Express.js, Prisma ORM
- **Database**: PostgreSQL 17 with pgvector extension
- **Cache/Queue**: Redis 7+ with BullMQ for job processing
- **UI Framework**: Tailwind CSS, Shadcn/UI components, Framer Motion
- **Authentication**: NextAuth.js v5 with Prisma adapter
- **File Storage**: MinIO (S3-compatible) for document management

## AI & External Integrations

- **AI Services**: OpenAI (GPT-4, DALL-E, Whisper), Anthropic Claude
- **Social Media**: Instagram Graph API, WhatsApp Business API
- **Payments**: Stripe for subscriptions and billing
- **Email**: Resend for transactional emails
- **Monitoring**: Prometheus metrics, Grafana dashboards

## Development Tools

- **Code Quality**: Biome (linting/formatting), TypeScript strict mode
- **Testing**: Jest with React Testing Library, Supertest for API testing
- **Build**: Next.js build system, Docker multi-stage builds
- **Package Manager**: npm with lock file

## Development Guidelines
- npx tsc --noEmit sempre rodar apos qualquer edição ou criação de arquivos.
- All new code must be written in TypeScript.
- User-facing strings are written in Brazilian Portuguese while identifiers remain in English.
- Prefer optimistic UI updates on the frontend.
- Use Shadcn/UI `Dialog` components instead of native `confirm()` or `alert()` dialogs.
- All database interactions should use Prisma, and `Prisma.JsonNull` when clearing JSON fields.
- Authentication is handled by NextAuth.js v5; API routes should call `const session = await auth();` and verify `session?.user?.id`, returning `NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 })` when absent.
- In the App Router, route `params` are Promises and must be awaited.
- Styling is managed with Tailwind CSS.

## Common Commands

### Development
```bash
docker-compose -f docker-compose-dev.yml up # conteiner de desenvolvimento com os workes conteiner pricipal e banco de dados
npm run dev          # Start development server
npm run build        # Production build

```

### Database
```bash
npm run db:push # super script faz o reset ativa o pgvector faz a migração e o seed em dev usar esse comamndo precisa de docker-compose -f docker-compose-dev.yml up
npm run db:migrate   # Run Prisma migrations
npm run db:generate  # Generate Prisma client
npm run db:seed      # Seed database
npm run db:studio    # Open Prisma Studio
npm run db:push      # Push schema changes (dev)
```

### Testing
```bash
npm run test                    # Run all tests
npm run test:unit              # Unit tests only
npm run test:integration       # Integration tests only
npm run test:comprehensive     # Full test suite
npm run test:coverage          # With coverage report
```

### Workers & Background Jobs
```bash
npm run start:worker           # Start webhook worker
npm run start:ai-worker        # Start AI integration worker
npm run build:workers          # Build worker files
```

### Code Quality
```bash
npx tsc --noEmit # sempre rodar apos qualquer edição ou criação de arquivos
npx tsc --project tsconfig.worker.json --noEmit  
npm run lint           # Check linting with Biome
npm run lint-apply     # Auto-fix linting issues
npm run format         # Check formatting
npm run format-apply   # Auto-format code
npm run check          # Check both lint and format
npm run check-apply    # Auto-fix both
```

### Database Management
```bash
npm run backup         # Create database backup
npm run backup:simple  # Simple backup format
npm run restore        # Restore from backup
npm run backup:list    # List available backups
```

## Architecture Patterns

- **App Router**: Next.js 13+ file-based routing with server components
- **API Routes**: RESTful endpoints in `/app/api/` directory
- **Middleware**: Route protection and request processing
- **Worker Pattern**: Background job processing with BullMQ
- **Singleton Connections**: Reusable database and Redis connections
- **Type Safety**: Strict TypeScript with Zod validation schemas
