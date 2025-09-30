//temp/check_oab.ts
import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { parseGabaritoDeterministico, verificarPontuacao } from '../lib/oab/gabarito-parser-deterministico';
import pdfParse from 'pdf-parse';

const dir = 'lib/oab/pdf-exemplos-gabaritos';

process.env.DEBUG_GABARITO = process.env.DEBUG_GABARITO ?? '0';

async function run() {
  const files = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
  const stats: Array<{
    name: string;
    peca: number;
    questoes: number;
    geral: number;
    ok: boolean;
    verificacao: ReturnType<typeof verificarPontuacao>;
    parsed: ReturnType<typeof parseGabaritoDeterministico>;
  }>= [];

  for (const file of files) {
    const full = join(dir, file);
    const buffer = readFileSync(full);
    const pdf = await pdfParse(buffer, { pagerender: undefined });
    const rawText = pdf.text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').replace(/\t+/g, ' ').replace(/[ \t]+\n/g, '\n');
    const meta = { exam: '43º Exame de Ordem Unificado', area: file.replace('.pdf', ''), data_aplicacao: '2025-06-15', fonte: 'Padrão de Resposta da FGV' };
    const parsed = parseGabaritoDeterministico(rawText, meta);
    const verificacao = verificarPontuacao(parsed.itens);
    const ok = verificacao.peca.ok && verificacao.questoes.ok && verificacao.geral.ok;
    stats.push({
      name: basename(file),
      peca: verificacao.peca.total,
      questoes: verificacao.questoes.total,
      geral: verificacao.geral.total,
      ok,
      verificacao,
      parsed,
    });
  }

  console.table(stats.map(({ name, peca, questoes, geral, ok }) => ({ name, peca, questoes, geral, ok })));
  for (const { name, verificacao, ok, parsed } of stats) {
    if (ok) continue;
    console.log('\n====', name, '====');
    console.dir(verificacao, { depth: 4 });
    const variants = parsed.itens
      .filter((it) => it.variant_family)
      .reduce<Record<string, { key: string; total: number }>>((acc, it) => {
        const fam = it.variant_family!;
        const key = it.variant_key ?? 'default';
        const compound = `${fam}::${key}`;
        if (!acc[compound]) acc[compound] = { key: compound, total: 0 };
        acc[compound].total += it.peso ?? 0;
        return acc;
      }, {});
    if (Object.keys(variants).length) {
      console.log('Variants totals:', variants);
    }
  }

  for (const { name, ok, parsed } of stats) {
    if (ok) continue;
    console.log('\n-- Itens PEÇA', name, '--');
    const pecaItens = parsed.itens.filter((it) => it.questao === 'PEÇA');
    for (const it of pecaItens) {
      const variant = it.variant_key ? ` seg=${it.variant_key}` : '';
      console.log(`${it.id} | peso=${it.peso} | grupo=${it.ou_group_id ?? '-'}${variant ? ` |${variant}` : ''} | ${it.descricao}`);
    }
    console.log('\n-- Itens Questões', name, '--');
    const questoes = parsed.itens.filter((it) => it.questao !== 'PEÇA');
    for (const it of questoes) {
      const variant = it.variant_key ? ` seg=${it.variant_key}` : '';
      console.log(`${it.id} | ${it.questao} | peso=${it.peso} | grupo=${it.ou_group_id ?? '-'}${variant ? ` |${variant}` : ''} | ${it.descricao}`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
