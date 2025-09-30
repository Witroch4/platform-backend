import { readFileSync } from 'fs';
import pdfParse from 'pdf-parse';

async function test() {
  const buffer = readFileSync('lib/oab/pdf-exemplos-gabaritos/direito ADM.pdf');
  const pdf = await pdfParse(buffer, { pagerender: undefined });
  const rawText = pdf.text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').replace(/\t+/g, ' ').replace(/[ \t]+\n/g, '\n');
  
  console.log('=== BUSCA POR MATRIZ DE PONTUAÇÃO PEÇA ===');
  
  // Buscar pela seção da PEÇA
  const pecaMatch = rawText.match(/PEÇA\s+PRÁTICO-PROFISSIONAL[\s\S]*?(?=Q1\s|Questão\s1|$)/i);
  if (!pecaMatch) {
    console.log('❌ Seção PEÇA não encontrada');
    return;
  }
  
  const pecaText = pecaMatch[0];
  console.log('Texto da PEÇA encontrado, length:', pecaText.length);
  
  // Buscar por matrizes de pontuação (formato: 0,00/X,XX)
  const matricesPontuacao = pecaText.match(/0[,\.]00\s*\/\s*\d{1,2}[,\.]\d{2}/g);
  if (matricesPontuacao) {
    console.log('\n=== MATRIZES DE PONTUAÇÃO ENCONTRADAS ===');
    matricesPontuacao.forEach((matriz, idx) => {
      console.log(`${idx + 1}. ${matriz}`);
    });
    
    // Somar os valores esperados (depois da barra)
    let somaEsperada = 0;
    matricesPontuacao.forEach(matriz => {
      const valorMatch = matriz.match(/\/\s*(\d{1,2})[,\.](\d{2})/);
      if (valorMatch) {
        const valor = parseFloat(`${valorMatch[1]}.${valorMatch[2]}`);
        somaEsperada += valor;
      }
    });
    
    console.log(`\nSOMA ESPERADA DAS MATRIZES: ${somaEsperada.toFixed(2)}`);
  } else {
    console.log('❌ Nenhuma matriz de pontuação encontrada');
  }
  
  // Buscar por pontuações individuais (0,XX)
  const pontuacoesIndividuais = pecaText.match(/\(\s*0[,\.]\d{2}\s*\)/g);
  if (pontuacoesIndividuais) {
    console.log('\n=== PONTUAÇÕES INDIVIDUAIS ===');
    console.log(`Total encontradas: ${pontuacoesIndividuais.length}`);
    
    let somaIndividual = 0;
    pontuacoesIndividuais.forEach(pont => {
      const valorMatch = pont.match(/0[,\.](\d{2})/);
      if (valorMatch) {
        const valor = parseFloat(`0.${valorMatch[1]}`);
        somaIndividual += valor;
      }
    });
    
    console.log(`SOMA DAS PONTUAÇÕES INDIVIDUAIS: ${somaIndividual.toFixed(2)}`);
  }
}

test().catch(console.error);