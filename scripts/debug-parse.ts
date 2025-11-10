process.env.DEBUG_GABARITO = '1';
import * as fs from 'fs';
import * as path from 'path';
import pdfParse from 'pdf-parse';
import { parseGabaritoDeterministico } from '../lib/oab/gabarito-parser-deterministico';

async function main() {
  const buffer = fs.readFileSync(path.resolve('./lib/oab/pdf-exemplos-gabaritos/DIREITO DO TRABALHO.pdf'));
  const result = await pdfParse(buffer, { pagerender: undefined });
  const parsed = parseGabaritoDeterministico(result.text, {
    exam: '43º Exame de Ordem Unificado',
    area: 'DIREITO DO TRABALHO',
    data_aplicacao: '2025-06-15',
    fonte: 'Padrão de Resposta da FGV'
  });

  const gruposPeca = parsed.grupos.filter(g => g.questao === 'PEÇA');
  const gruposQ = parsed.grupos.filter(g => g.questao !== 'PEÇA');

  console.log('\n📊 Resumo de Grupos:');
  console.log('  Total:', parsed.grupos.length);
  console.log('  PEÇA:', gruposPeca.length);
  console.log('  Questões:', gruposQ.length);

  const familias = new Set(gruposPeca.map(g => g.variant_family).filter(Boolean));
  if (familias.size) {
    console.log('\n📚 Variantes na PEÇA:');
    familias.forEach(familia => {
      const variantesSet = new Set(gruposPeca.filter(g => g.variant_family === familia).map(g => g.variant_key));
      console.log(`  Família: ${familia}`);
      variantesSet.forEach(variant => {
        const count = gruposPeca.filter(g => g.variant_family === familia && g.variant_key === variant).length;
        console.log(`    - ${variant}: ${count} grupos`);
      });
    });
  }

  console.log('\n🔍 IDs dos grupos da PEÇA:');
  gruposPeca.forEach((g, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${g.id.padEnd(10, ' ')} | ${(g.variant_key || 'none').padEnd(25, ' ')} | ${g.rotulo}`);
  });

  console.log('\nItens:', parsed.itens.length, 'Grupos:', parsed.grupos.length);
}

main().catch(console.error);
