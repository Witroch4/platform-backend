// Teste End-to-End: Router LLM funcionando
import { test, expect } from '@jest/globals';

describe('SocialWise Flow Router LLM E2E', () => {
  test('should call LLM Router when band is ROUTER', async () => {
    const payload = {
      chatwit_account_id: "3",
      inbox_id: "4", 
      message_type: "incoming",
      content: "qual seu nome?", // Mesma mensagem que funcionou
      contact_name: "Test User",
      contact_phone: "+5511999999999",
      wamid: "test-wamid-router",
      channel_type: "Channel::Whatsapp",
      timestamp: new Date().toISOString()
    };

    const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(response.status).toBe(200);
    
    const result = await response.json();
    
    // Verificar que a resposta veio da LLM Router
    expect(result.whatsapp).toBeDefined();
    expect(result.whatsapp.type).toBe('text');
    expect(result.whatsapp.text.body).toContain('Zézinho'); // Nome do assistant
    
    // Verificar que não é resposta de fallback
    expect(result.whatsapp.text.body).not.toBe('Como posso ajudar você hoje?');
    
    console.log('✅ Router LLM Response:', result.whatsapp.text.body);
  });

  test('should have proper performance metrics for Router LLM', async () => {
    const payload = {
      chatwit_account_id: "3",
      inbox_id: "4",
      message_type: "incoming", 
      content: "me explique sobre direito",
      contact_name: "Test User",
      contact_phone: "+5511999999999",
      wamid: "test-wamid-router-performance",
      channel_type: "Channel::Whatsapp",
      timestamp: new Date().toISOString()
    };

    const startTime = Date.now();
    
    const response = await fetch('http://localhost:3002/api/integrations/webhooks/socialwiseflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    expect(response.status).toBe(200);
    
    // Router LLM deve levar mais tempo que fallback (indica que LLM foi chamada)
    expect(totalTime).toBeGreaterThan(1000); // Mais de 1s indica LLM processamento
    expect(totalTime).toBeLessThan(30000); // Menos de 30s (timeout)
    
    console.log('⏱️ Router LLM Processing Time:', totalTime + 'ms');
  });
});
