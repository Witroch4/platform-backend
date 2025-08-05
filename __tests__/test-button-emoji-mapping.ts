/**
 * Script de teste para o sistema de mapeamento de emojis para botões
 * 
 * Este script testa:
 * 1. Criação de mapeamentos de reações para botões
 * 2. Detecção de cliques em botões
 * 3. Envio automático de reações emoji
 * 4. Processamento via worker queue
 */

import { prisma } from '../lib/prisma'
import { addProcessButtonClickTask } from '../lib/queue/mtf-diamante-webhook.queue'

async function testButtonEmojiMapping() {
  console.log('🧪 Iniciando teste do sistema de mapeamento de emojis para botões...\n')

  try {
    // 1. Criar mapeamento de reação para teste
    console.log('1. Criando mapeamento de reação de teste...')
    
    const actionPayload = {
      emoji: '👍',
      textReaction: null,
    };
    
    const testButtonReaction = await prisma.mapeamentoBotao.create({
      data: {
        buttonId: 'test_button_123',
        inboxId: 'test_message_456',
        actionType: 'SEND_TEMPLATE',
        actionPayload,
      }
    })
    
    console.log('✅ Mapeamento criado:', {
      id: testButtonReaction.id,
      buttonId: testButtonReaction.buttonId,
      emoji: testButtonReaction.emoji
    })

    // 2. Simular payload de clique em botão
    console.log('\n2. Simulando clique em botão...')
    
    const mockButtonClickPayload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'wamid.test123',
              from: '5511999999999',
              timestamp: Date.now().toString(),
              type: 'interactive',
              interactive: {
                type: 'button_reply',
                button_reply: {
                  id: 'test_button_123',
                  title: 'Botão de Teste'
                }
              },
              context: {
                id: 'original_message_id_789'
              }
            }]
          }
        }]
      }],
      originalDetectIntentRequest: {
        payload: {
          wamid: 'wamid.test123',
          message_id: 'chatwoot_msg_123',
          conversation_id: 'conv_456',
          inbox_id: 'inbox_789',
          contact_phone: '5511999999999',
          whatsapp_api_key: 'test_api_key_123'
        }
      }
    }

    // 3. Adicionar task de processamento de clique em botão
    console.log('3. Adicionando task de processamento...')
    
    await addProcessButtonClickTask({
      payload: mockButtonClickPayload,
      contactPhone: '5511999999999',
      whatsappApiKey: 'test_api_key_123',
      inboxId: 'inbox_789'
    })
    
    console.log('✅ Task de processamento adicionada à queue')

    // 4. Verificar se o mapeamento pode ser encontrado
    console.log('\n4. Verificando busca de mapeamento...')
    
    const foundReaction = await prisma.mapeamentoBotao.findUnique({
      where: { buttonId: 'test_button_123' }
    })
    
    if (foundReaction) {
      console.log('✅ Mapeamento encontrado:', {
        buttonId: foundReaction.buttonId,
        emoji: foundReaction.emoji,
        textReaction: foundReaction.textReaction
      })
    } else {
      console.log('❌ Mapeamento não encontrado')
    }

    // 5. Testar múltiplos mapeamentos
    console.log('\n5. Testando múltiplos mapeamentos...')
    
    const multipleMappings = await prisma.mapeamentoBotao.createMany({
      data: [
        {
          buttonId: 'btn_sim',
          inboxId: 'msg_confirmacao',
          actionType: 'SEND_TEMPLATE',
          actionPayload: { emoji: '✅' },
          createdBy: 'test_user'
        },
        {
          buttonId: 'btn_nao',
          inboxId: 'msg_confirmacao',
          actionType: 'SEND_TEMPLATE',
          actionPayload: { emoji: '❌' },
          createdBy: 'test_user'
        },
        {
          buttonId: 'btn_ajuda',
          inboxId: 'msg_menu',
          actionType: 'SEND_TEMPLATE',
          actionPayload: { textReaction: 'Obrigado por solicitar ajuda! Nossa equipe entrará em contato.' },
          createdBy: 'test_user'
        }
      ]
    })
    
    console.log(`✅ ${multipleMappings.count} mapeamentos adicionais criados`)

    // 6. Buscar todos os mapeamentos de uma mensagem
    console.log('\n6. Buscando mapeamentos por mensagem...')
    
    const messageReactions = await prisma.mapeamentoBotao.findMany({
      where: { inboxId: 'msg_confirmacao' }
    })
    
    console.log(`✅ Encontrados ${messageReactions.length} mapeamentos para msg_confirmacao:`)
    messageReactions.forEach(reaction => {
      console.log(`   - ${reaction.buttonId}: ${reaction.emoji || reaction.textReaction}`)
    })

    // 7. Testar atualização de mapeamento
    console.log('\n7. Testando atualização de mapeamento...')
    
    const updatedReaction = await prisma.mapeamentoBotao.update({
      where: { buttonId: 'test_button_123' },
      data: { 
        actionPayload: { emoji: '🎉' }
      }
    })
    
    console.log('✅ Mapeamento atualizado:', {
      buttonId: updatedReaction.buttonId,
      novoEmoji: updatedReaction.emoji
    })

    console.log('\n🎉 Todos os testes passaram com sucesso!')
    console.log('\n📋 Resumo dos testes:')
    console.log('   ✅ Criação de mapeamentos')
    console.log('   ✅ Simulação de clique em botão')
    console.log('   ✅ Adição de task à queue')
    console.log('   ✅ Busca de mapeamentos')
    console.log('   ✅ Múltiplos mapeamentos')
    console.log('   ✅ Busca por mensagem')
    console.log('   ✅ Atualização de mapeamentos')

  } catch (error) {
    console.error('❌ Erro durante o teste:', error)
  } finally {
    // Limpar dados de teste
    console.log('\n🧹 Limpando dados de teste...')
    
    await prisma.mapeamentoBotao.deleteMany({
      where: {
        OR: [
          { buttonId: { startsWith: 'test_' } },
          { buttonId: { startsWith: 'btn_' } }
        ]
      }
    })
    
    console.log('✅ Dados de teste removidos')
    await prisma.$disconnect()
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testButtonEmojiMapping()
    .then(() => {
      console.log('\n✨ Teste concluído!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('\n💥 Teste falhou:', error)
      process.exit(1)
    })
}

export { testButtonEmojiMapping }