# MTF Diamante Components

This directory contains the frontend components for the MTF Diamante system, which is the refactored version of the old "atendimento" system.

## Components Overview

### Main Page
- `page.tsx` - Main MTF Diamante administration page with tabs for different functionalities

### Core Components
- `DialogflowCaixasAgentes.tsx` - Manages Dialogflow agents and inbox configurations
- `IntegracoesTab.tsx` - Wrapper component for integrations tab
- `TemplatesTab.tsx` - WhatsApp template management
- `MensagensInterativasTab.tsx` - Interactive message management with buttons
- `MapeamentoTab.tsx` - Intent mapping between Dialogflow and responses
- `ConfiguracoesLoteTab.tsx` - Global WhatsApp configuration settings

## API Endpoints Used

All components have been updated to use the MTF Diamante API endpoints:

- `/api/admin/mtf-diamante/dialogflow/caixas` - Inbox management
- `/api/admin/mtf-diamante/dialogflow/agentes` - Agent management
- `/api/admin/mtf-diamante/dialogflow/inboxes` - External inbox sync
- `/api/admin/mtf-diamante/templates/` - Template management
- `/api/admin/mtf-diamante/mensagens-interativas/` - Interactive messages
- `/api/admin/mtf-diamante/mapeamentos/` - Intent mapping
- `/api/admin/mtf-diamante/configuracoes` - Global configurations

## Key Changes from Atendimento

1. **API Routes**: All API calls updated from `/api/admin/atendimento/` to `/api/admin/mtf-diamante/`
2. **Branding**: Page title updated to "MTF Diamante - Configurações de Atendimento"
3. **Functionality**: All existing functionality preserved while using new route structure
4. **Components**: Complete component implementations with proper error handling and user feedback

## Features

- **Inbox Management**: Add, configure, and manage ChatWit inboxes
- **Dialogflow Integration**: Configure Dialogflow agents for each inbox
- **Template Management**: Create and manage WhatsApp message templates
- **Interactive Messages**: Create messages with up to 3 response buttons
- **Intent Mapping**: Map Dialogflow intents to templates or interactive messages
- **Global Configuration**: Set default WhatsApp API credentials

## Usage

The components are designed to work together as a complete WhatsApp automation management system under the MTF Diamante branding.