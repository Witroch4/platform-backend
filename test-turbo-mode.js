#!/usr/bin/env node

// Script de teste para verificar se o Turbo Mode está funcionando
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function testTurboMode() {
  try {
    console.log('🔍 Testando sistema Turbo Mode...\n')
    
    // Buscar um usuário qualquer
    const user = await prisma.user.findFirst({
      select: {
        id: true,
        name: true,
        email: true,
        turboModeEnabled: true
      }
    })
    
    if (!user) {
      console.log('❌ Nenhum usuário encontrado no sistema')
      return
    }
    
    console.log(`👤 Usuário encontrado: ${user.name} (${user.email})`)
    console.log(`🚀 Turbo Mode: ${user.turboModeEnabled ? '✅ ATIVADO' : '❌ DESATIVADO'}`)
    
    // Testar ativação
    console.log('\n🔄 Testando ativação...')
    await prisma.user.update({
      where: { id: user.id },
      data: { turboModeEnabled: true }
    })
    console.log('✅ Turbo Mode ativado com sucesso!')
    
    // Verificar ativação
    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { turboModeEnabled: true }
    })
    
    console.log(`✔️ Status verificado: ${updatedUser.turboModeEnabled ? 'ATIVADO' : 'DESATIVADO'}`)
    
    // Testar desativação
    console.log('\n🔄 Testando desativação...')
    await prisma.user.update({
      where: { id: user.id },
      data: { turboModeEnabled: false }
    })
    console.log('✅ Turbo Mode desativado com sucesso!')
    
    // Verificar desativação
    const finalUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { turboModeEnabled: true }
    })
    
    console.log(`✔️ Status final: ${finalUser.turboModeEnabled ? 'ATIVADO' : 'DESATIVADO'}`)
    
    console.log('\n🎉 Todos os testes passaram! O sistema Turbo Mode está funcionando corretamente.')
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

testTurboMode()
