import { readFileSync } from 'fs';
import { parseGabaritoDeterministico, verificarPontuacao } from './lib/oab/gabarito-parser-deterministico.js';
import pdfParse from 'pdf-parse';

async function test() {
  const buffer = readFileSync('lib/oab/pdf-exemplos-gabaritos/direito ADM.pdf');
  const pdf = await pdfParse(buffer, { pagerender: undefined });
  const rawText = pdf.text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').replace(/\t+/g, ' ').replace(/[ \t]+\n/g, '\n');
  const meta = { exam: '43º Exame de Ordem Unificado', area: 'direito ADM', data_aplicacao: '2025-06-15', fonte: 'Padrão de Resposta da FGV' };
  
  const parsed = parseGabaritoDeterministico(rawText, meta);
  
  console.log('=== BUSCAR ITEM 3 ===');
  const item3 = parsed.itens.find(item => item.rotulo === '3');
  if (item3) {
    console.log('Item 3 encontrado:');
    console.log('- rotulo:', item3.rotulo);
    console.log('- peso:', item3.peso);
    console.log('- questao:', item3.questao);
    console.log('- ou_group_id:', item3.ou_group_id || 'nenhum');
    console.log('- descricao:', item3.descricao.substring(0, 100) + '...');
  } else {
    console.log('❌ Item 3 NÃO encontrado!');
  }
  
  // Verificar se há outros itens com descrição similar
  console.log('\n=== ITENS COM "RÉU" NA DESCRIÇÃO ===');
  const itensReu = parsed.itens.filter(item => 
    item.descricao && item.descricao.toLowerCase().includes('réu')
  );
  
  itensReu.forEach(item => {
    console.log(`- Item ${item.rotulo}: ${item.peso} | ${item.descricao.substring(0, 80)}...`);
  });
  
  const verificacao = verificarPontuacao(parsed.itens);
  console.log(`\nTotal final: ${verificacao.peca.total}`);
}

test().catch(console.error);