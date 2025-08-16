#!/usr/bin/env tsx

/**
 * Script para testar as otimizações de performance do SocialWise Flow
 * Testa: LLM warmup otimizado, embedding mais rápido, thresholds ajustados
 */

import { getRedisInstance } from '@/lib/connections';

async function testOptimizations() {
  console.log('🚀 Testando otimizações do SocialWise Flow...\n');

  try {
    const redis = getRedisInstance();
    
    // 1. Limpar cache de idempotência para testes
    console.log('1️⃣ Limpando cache de idempotência...');
    const patterns = ['sw:idem:*', 'out:*', 'idem:*'];
    let totalCleared = 0;
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        const deletedCount = await redis.del(...keys);
        totalCleared += deletedCount;
      }
    }
    console.log(`   ✅ ${totalCleared} chaves de idempotência removidas\n`);

    // 2. Desabilitar idempotência para testes
    console.log('2️⃣ Desabilitando idempotência para testes...');
    await redis.setex('test:disable_idempotency', 3600, 'true');
    console.log('   ✅ Idempotência desabilitada por 1 hora\n');

    // 3. Simular payload do webhook otimizado
    console.log('3️⃣ Preparando payload de teste...');
    const testPayload = {
      sessionId: 'test-session-' + Date.now(),
      accountId: '3',
      inboxId: '4',
      userId: 'cmedbsk8j0000lmdoeyfh0dep',
      text: 'Queria saber mais sobre o mandado de segurança da minha multa',
      channelType: 'Channel::Whatsapp',
      wamid: 'test-wamid-' + Date.now()
    };
    console.log(`   📝 Texto: "${testPayload.text}"`);
    console.log(`   🎯 Esperado: Promoção para SOFT band por keywords jurídicas\n`);

    // 4. Instruções para teste manual
    console.log('4️⃣ Instruções para teste:');
    console.log('   📋 Faça uma requisição POST para:');
    console.log('      http://localhost:3000/api/integrations/webhooks/socialwiseflow');
    console.log('   📦 Payload:');
    console.log('      ' + JSON.stringify(testPayload, null, 2));
    console.log('\n   🔍 Monitore os logs para:');
    console.log('      ✅ "Legal keywords detected - promoting to SOFT band"');
    console.log('      ✅ "SOFT band warmup buttons generated"');
    console.log('      ✅ Tempo total < 2s (vs 3s anterior)');
    console.log('      ✅ Sem alerta de threshold (novo: 1.5s)');

    // 5. Otimizações aplicadas
    console.log('\n5️⃣ Otimizações aplicadas:');
    console.log('   ⚡ LLM Warmup: Prompt reduzido de ~500 para ~50 chars');
    console.log('   ⚡ LLM Tokens: max_output_tokens reduzido de 768 para 256');
    console.log('   ⚡ Embedding: Timeout reduzido de 2000ms para 1000ms');
    console.log('   ⚡ Embedding: Dimensões reduzidas para 1536');
    console.log('   ⚡ APM Threshold: Aumentado de 100ms para 1500ms');
    console.log('   🎯 Keywords: "mandado de segurança" promove para SOFT');

    console.log('\n🎉 Teste configurado! Execute a requisição e monitore os logs.');

  } catch (error) {
    console.error('❌ Erro ao configurar teste:', error);
  }
}

testOptimizations();
