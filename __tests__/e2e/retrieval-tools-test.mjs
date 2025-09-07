// __tests__/e2e/retrieval-tools-test.mjs
// Teste prático das retrieval tools - busca de intents

import { executeRetrievalTool } from '../../lib/ai-tools/retrieval-tools.js';
import { getPrismaInstance } from '../../lib/connections.js';

async function findUserContext() {
  try {
    const prisma = getPrismaInstance();
    
    console.log('🔍 Buscando contexto do usuário automaticamente...');
    
    // Busca usuário com intents relacionados ao Witalo
    const userWithIntents = await prisma.user.findFirst({
      where: {
        intents: {
          some: {
            isActive: true,
            OR: [
              {
                name: {
                  contains: 'Witalo',
                  mode: 'insensitive'
                }
              },
              {
                description: {
                  contains: 'Witalo',
                  mode: 'insensitive'
                }
              },
              {
                name: {
                  contains: 'lingua',
                  mode: 'insensitive'
                }
              },
              {
                name: {
                  contains: 'idioma',
                  mode: 'insensitive'
                }
              }
            ]
          }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        accounts: {
          select: {
            id: true
          },
          take: 1
        },
        intents: {
          where: {
            isActive: true
          },
          select: {
            id: true,
            name: true,
            description: true,
            slug: true,
            accountId: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10
        }
      }
    });
    
    if (userWithIntents && userWithIntents.intents.length > 0) {
      console.log('✅ Contexto encontrado:');
      console.log(`   - Usuário: ${userWithIntents.name} (${userWithIntents.email})`);
      console.log(`   - User ID: ${userWithIntents.id}`);
      console.log(`   - Account ID: ${userWithIntents.accounts[0]?.id || 'N/A'}`);
      console.log('');
      console.log('📋 Intents encontrados:');
      userWithIntents.intents.forEach((intent, index) => {
        console.log(`   ${index + 1}. ${intent.name} (@${intent.slug})`);
        console.log(`      Descrição: ${intent.description || 'Sem descrição'}`);
        console.log(`      Account: ${intent.accountId || 'N/A'}`);
        console.log('');
      });
      
      return {
        userId: userWithIntents.id,
        accountId: userWithIntents.accounts[0]?.id || userWithIntents.intents[0]?.accountId,
        intents: userWithIntents.intents
      };
    } else {
      console.log('⚠️  Nenhum usuário com intents encontrado');
      
      // Busca qualquer usuário com intents
      const anyUserWithIntents = await prisma.user.findFirst({
        where: {
          intents: {
            some: {
              isActive: true
            }
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          intents: {
            where: {
              isActive: true
            },
            select: {
              id: true,
              name: true,
              description: true,
              slug: true,
              accountId: true
            },
            take: 5
          }
        }
      });
      
      if (anyUserWithIntents) {
        console.log('📋 Encontrei intents de outro usuário para teste:');
        anyUserWithIntents.intents.forEach((intent, index) => {
          console.log(`   ${index + 1}. ${intent.name} (@${intent.slug})`);
          console.log(`      Descrição: ${intent.description || 'Sem descrição'}`);
        });
        
        return {
          userId: anyUserWithIntents.id,
          accountId: anyUserWithIntents.intents[0]?.accountId,
          intents: anyUserWithIntents.intents
        };
      }
      
      return null;
    }
    
  } catch (error) {
    console.error('❌ Erro ao buscar contexto:', error.message);
    return null;
  }
}

async function testIntentSearch(context) {
  console.log('🔍 TESTE PRÁTICO: Busca de Intents com "Qual lingua o Witalo Rocha fala?"');
  console.log('=' .repeat(70));
  
  try {
    // Teste com diferentes variações da pergunta
    const queries = [
      'lingua idioma Witalo Rocha fala',
      'Witalo idioma',
      'Qual lingua o Witalo fala',
      'idioma Witalo Rocha',
      'Witalo linguagem'
    ];
    
    for (const query of queries) {
      console.log(`🔍 Testando busca: "${query}"`);
      console.log('-'.repeat(50));
      
      const result = await executeRetrievalTool(
        'search_intents',
        {
          query: query,
          accountId: context.accountId
        },
        context
      );
      
      console.log('📊 Resultado:');
      console.log(result);
      console.log('');
      
      // Analisa quantos intents foram encontrados
      const intentMatches = result.match(/• (.*?):/g);
      if (intentMatches) {
        console.log(`✅ Encontrou ${intentMatches.length} intent(s) relevante(s)`);
        console.log('🎯 Intents encontrados:');
        intentMatches.forEach((match, index) => {
          const intentName = match.replace('• ', '').replace(':', '');
          console.log(`   ${index + 1}. ${intentName}`);
        });
      } else {
        console.log('❌ Nenhum intent específico encontrado');
      }
      
      console.log('');
      console.log('═'.repeat(70));
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    
    if (error.message.includes('connect') || error.message.includes('database')) {
      console.log('');
      console.log('⚠️  DICA: Certifique-se que o banco está rodando (docker-compose up)');
    }
  }
}

// Função principal
async function main() {
  console.log('🚀 TESTE DE RETRIEVAL TOOLS - BUSCA DE INTENTS');
  console.log('');
  console.log('🎯 Objetivo: Testar busca inteligente para "Qual lingua o Witalo Rocha fala?"');
  console.log('   Queremos ver qual dos seus 3 intents parecidos será encontrado');
  console.log('');
  
  // Busca contexto automaticamente
  const context = await findUserContext();
  
  if (context) {
    console.log('▶️  Executando teste...');
    console.log('');
    await testIntentSearch(context);
    
    console.log('🎉 TESTE CONCLUÍDO!');
    console.log('');
    console.log('📋 ANÁLISE:');
    console.log('   - Verifique quais intents foram encontrados para cada variação da pergunta');
    console.log('   - O sistema deve encontrar os mais relevantes baseado no nome e descrição');
    console.log('   - Intents com descrições mais detalhadas tendem a ter melhor ranking');
    
  } else {
    console.log('❌ Não foi possível encontrar contexto para o teste');
    console.log('');
    console.log('💡 SUGESTÕES:');
    console.log('   1. Certifique-se que criou os 3 intents sobre Witalo/idiomas');
    console.log('   2. Verifique se estão ativos (isActive = true)');
    console.log('   3. Confirme que o banco está rodando');
  }
  
  process.exit(0);
}

// Executar teste
main().catch((error) => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
});
