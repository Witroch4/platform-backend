import { parseGabaritoDeterministico } from './lib/oab/gabarito-parser-deterministico';
import { execSync } from 'child_process';

const pdfPath = 'lib/oab/pdf-exemplos-gabaritos/DIREITO DO TRABALHO.pdf';
const text = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf-8' });

const resultado = parseGabaritoDeterministico(text, {
  exam: '43º Exame de Ordem Unificado',
  area: 'DIREITO DO TRABALHO',
  data_aplicacao: '2025-06-15',
  fonte: 'Padrão de Resposta da FGV'
});

const gruposPeca = resultado.grupos.filter(g => g.questao === 'PEÇA');

console.log(`\n📊 Total de grupos da PEÇA: ${gruposPeca.length}`);
console.log(`\n🔍 IDs dos grupos:`);
gruposPeca.forEach((g, idx) => {
  console.log(`   ${String(idx + 1).padStart(2, ' ')}. ${g.id} | variant: ${g.variant_key || 'none'}`);
});

const familias = new Set(gruposPeca.map(g => g.variant_family).filter(Boolean));
console.log(`\n📚 Famílias: ${familias.size}`, Array.from(familias).slice(0, 2));
