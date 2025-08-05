// Exportar funções do módulo de configurações do WhatsApp
export * from './whatsapp-config';

// Exportar outras funções conforme necessário
// Use getPrismaInstance from connections instead
export { getPrismaInstance as prisma } from '@/lib/connections';

// Exportar funções úteis da lib
import { getWhatsAppConfig, getWhatsAppApiUrl, getWhatsAppTemplatesUrl, getApiVersion } from './whatsapp-config';

export {
  getWhatsAppConfig,
  getWhatsAppApiUrl,
  getWhatsAppTemplatesUrl,
  getApiVersion
}; 