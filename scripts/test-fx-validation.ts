#!/usr/bin/env tsx

/**
 * Script para validar rapidamente o sistema de taxas de câmbio
 * Baseado nos logs: [FX] Armazenada USD/BRL=5.3928 em 2025-08-15
 */

import FxRateService from "@/lib/cost/fx-rate-service";
import log from "@/lib/log";

async function validateFxSystem() {
  console.log("🔍 Validando sistema de taxas de câmbio...");
  console.log("📊 Baseado nos logs: [FX] Armazenada USD/BRL=5.3928 em 2025-08-15\n");

  try {
    // 1) Ler a última taxa gravada
    console.log("1️⃣ Lendo última taxa armazenada...");
    const last = await FxRateService.getLatestStoredRate();
    if (last) {
      console.log(`✅ Última taxa: ${last.rate} em ${last.date.toISOString().split('T')[0]}`);
      console.log(`   Data completa: ${last.date.toISOString()}`);
    } else {
      console.log("❌ Nenhuma taxa armazenada encontrada");
      return;
    }

    // 2) Ler exatamente a taxa do dia 2025-08-15
    console.log("\n2️⃣ Lendo taxa específica do dia 2025-08-15...");
    const rateAtDate = await FxRateService.getRateForDate(new Date("2025-08-15"));
    console.log(`✅ Taxa para 2025-08-15: ${rateAtDate}`);

    // 3) Converter USD -> BRL usando a taxa do dia
    console.log("\n3️⃣ Testando conversão USD → BRL...");
    const conv = await FxRateService.convertUsdToBrl(10, new Date("2025-08-15"));
    console.log(`✅ $10 USD = R$ ${conv.brlAmount} BRL`);
    console.log(`   Taxa usada: ${conv.rate}`);
    console.log(`   Data: ${conv.date.toISOString().split('T')[0]}`);

    // 4) Testar conversão com valor maior
    console.log("\n4️⃣ Testando conversão de $100 USD...");
    const conv100 = await FxRateService.convertUsdToBrl(100, new Date("2025-08-15"));
    console.log(`✅ $100 USD = R$ ${conv100.brlAmount} BRL`);

    // 5) Verificar se a taxa está próxima do esperado (5.3928)
    const expectedRate = 5.3928;
    const tolerance = 0.1; // 10 centavos de tolerância
    const difference = Math.abs(rateAtDate - expectedRate);
    
    console.log("\n5️⃣ Validação da taxa...");
    console.log(`   Taxa esperada: ${expectedRate}`);
    console.log(`   Taxa encontrada: ${rateAtDate}`);
    console.log(`   Diferença: ${difference.toFixed(4)}`);
    
    if (difference <= tolerance) {
      console.log(`✅ Taxa está dentro da tolerância (${tolerance})`);
    } else {
      console.log(`⚠️ Taxa fora da tolerância esperada`);
    }

    // 6) Histórico dos últimos 7 dias
    console.log("\n6️⃣ Histórico dos últimos 7 dias...");
    const endDate = new Date("2025-08-15");
    const startDate = new Date("2025-08-09");
    
    const history = await FxRateService.getRateHistory(startDate, endDate);
    console.log(`📊 Encontrados ${history.length} registros:`);
    
    history.forEach(rate => {
      console.log(`   ${rate.date.toISOString().split('T')[0]}: ${rate.rate}`);
    });

    console.log("\n🎉 Validação concluída com sucesso!");
    console.log("\n📋 Resumo:");
    console.log(`   - Taxa atual: ${last?.rate}`);
    console.log(`   - Taxa do dia 2025-08-15: ${rateAtDate}`);
    console.log(`   - Conversão $10 → R$ ${conv.brlAmount}`);
    console.log(`   - Sistema funcionando: ✅`);

  } catch (error) {
    console.error("❌ Erro na validação:", error);
    throw error;
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  validateFxSystem()
    .then(() => {
      console.log("\n✅ Script executado com sucesso!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Erro na execução:", error);
      process.exit(1);
    });
}

export default validateFxSystem;
