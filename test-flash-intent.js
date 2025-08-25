#!/usr/bin/env node

// Script para testar Flash Intent status
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function testFlashIntentStatus() {
  try {
    const userId = 'cmeq2s5pv0000lmcgk5jmzcik';
    const userFlagPrefix = `USER_${userId}_FLASH_INTENT`;
    
    console.log('🔍 Verificando status do Flash Intent...\n')
    console.log(`👤 UserId: ${userId}`)
    console.log(`🏷️ Flag prefix: ${userFlagPrefix}\n`)
    
    // Buscar todos os overrides do usuário
    const allOverrides = await prisma.userFeatureFlagOverride.findMany({
      where: { userId },
      include: { flag: true }
    })
    
    console.log(`📊 Total de overrides para o usuário: ${allOverrides.length}`)
    
    // Filtrar apenas os do Flash Intent
    const flashIntentOverrides = allOverrides.filter(override => 
      override.flagId.startsWith(userFlagPrefix) && override.enabled
    )
    
    console.log(`⚡ Overrides do Flash Intent ativos: ${flashIntentOverrides.length}`)
    
    console.log('\n📋 Detalhes dos overrides:')
    flashIntentOverrides.forEach(override => {
      console.log(`  ✅ ${override.flagId} = ${override.enabled}`)
    })
    
    if (flashIntentOverrides.length < 5) {
      console.log('\n❌ Flash Intent DESATIVADO - Nem todas as 5 funcionalidades estão ativas')
      console.log('🔧 Funcionalidades necessárias:')
      const requiredFlags = [
        '_WEBHOOK',
        '_HIGH_PRIORITY_QUEUE', 
        '_LOW_PRIORITY_QUEUE',
        '_UNIFIED_MODEL',
        '_CACHING'
      ]
      
      requiredFlags.forEach(suffix => {
        const flagId = userFlagPrefix + suffix
        const found = flashIntentOverrides.find(o => o.flagId === flagId)
        console.log(`  ${found ? '✅' : '❌'} ${flagId}`)
      })
    } else {
      console.log('\n✅ Flash Intent ATIVADO - Todas as 5 funcionalidades estão ativas!')
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

testFlashIntentStatus()
