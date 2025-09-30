import { readFileSync } from 'fs';
import { parseGabaritoDeterministico, verificarPontuacao } from './lib/oab/gabarito-parser-deterministico.js';
import pdfParse from 'pdf-parse';

async function test() {
  const buffer = readFileSync('lib/oab/pdf-exemplos-gabaritos/direito ADM.pdf');
  const pdf = await pdfParse(buffer, { pagerender: undefined });
  const rawText = pdf.text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').replace(/\t+/g, ' ').replace(/[ \t]+\n/g, '\n');
  const meta = { exam: '43º Exame de Ordem Unificado', area: 'direito ADM', data_aplicacao: '2025-06-15', fonte: 'Padrão de Resposta da FGV' };
  
  const parsed = parseGabaritoDeterministico(rawText, meta);
  const verificacao = verificarPontuacao(parsed.itens);
  
  console.log('=== ANÁLISE DETALHADA DOS PESOS ===');
  console.log('Total calculado:', verificacao.peca.total);
  console.log('Total esperado:', verificacao.peca.esperado);
  
  // Agrupar por item e somar pesos
  const itensPorRotulo = new Map();
  parsed.itens.forEach(item => {
    const rotulo = item.questao + '-' + (item.rotulo || 'sem-rotulo');
    if (!itensPorRotulo.has(rotulo)) {
      itensPorRotulo.set(rotulo, { peso: 0, count: 0, descricoes: [] });
    }
    const grupo = itensPorRotulo.get(rotulo);
    grupo.peso += item.peso || 0;
    grupo.count += 1;
    grupo.descricoes.push((item.descricao || '').substring(0, 60) + '...');
  });
  
  console.log('\n=== PESO POR ITEM ===');
  const itensPeca = Array.from(itensPorRotulo.entries())
    .filter(([rotulo]) => rotulo.startsWith('PEÇA-'))
    .sort(([a], [b]) => {
      const numA = parseInt(a.split('-')[1]) || 0;
      const numB = parseInt(b.split('-')[1]) || 0;
      return numA - numB;
    });
    
  itensPeca.forEach(([rotulo, dados]) => {
    console.log(`${rotulo}: ${dados.peso.toFixed(2)} (${dados.count} subitens)`);
  });
  
  const somaCalculada = itensPeca.reduce((acc, [, dados]) => acc + dados.peso, 0);
  console.log(`\nSOMA VERIFICAÇÃO: ${somaCalculada.toFixed(2)}`);
}

test().catch(console.error);