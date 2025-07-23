import { type NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { text, maxTokens = 10 } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Texto é obrigatório' },
        { status: 400 }
      );
    }

    // Usar GPT-4o-mini para classificação rápida e barata
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-nano',
      messages: [
        {
          role: 'system',
          content: `Você é um classificador de intenções. Analise se o usuário quer gerar uma imagem, desenho ou ilustração visual.

REGRAS:
- Responda apenas "SIM" se o usuário claramente quer gerar/criar uma imagem visual
- Responda "NÃO" para qualquer outra coisa
- Considere contexto e intenção, não apenas palavras-chave

EXEMPLOS:
"crie uma imagem de uma bola" → SIM
"crie a imagem de um lápis" → SIM  
"desenhe um gato" → SIM
"como funciona uma bola" → NÃO
"explique sobre imagens" → NÃO
"crie um texto sobre bolas" → NÃO
"visualize o relatório" → NÃO
"vamos imaginar uma situação" → NÃO

Responda apenas SIM ou NÃO:`
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: maxTokens,
      temperature: 0, // Determinístico para classificação
    });

    const classification = response.choices[0]?.message?.content?.trim().toUpperCase();
    const isImageGeneration = classification === 'SIM';

    console.log(`🤖 Classificação LLM: "${text}" → ${classification} (${isImageGeneration})`);

    return NextResponse.json({
      isImageGeneration,
      classification,
      confidence: isImageGeneration ? 'high' : 'medium'
    });

  } catch (error) {
    console.error('Erro na classificação de intenção:', error);
    
    // Fallback em caso de erro
    return NextResponse.json({
      isImageGeneration: false,
      classification: 'ERROR',
      confidence: 'low',
      error: 'Erro na classificação'
    }, { status: 500 });
  }
} 