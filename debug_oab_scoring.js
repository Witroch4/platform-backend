const fs = require("fs");

// Extrair todos os valores de pontuação do texto
const textoCompleto = `
1. Interposição da apelação por petição dirigida à Vara Única da Comarca do Município Alfa (0,10) 0,00/0,10
2. Endereçamento das razões recursais ao Desembargador Relator da Apelação no Tribunal de
Justiça do Estado Beta (0,10).
0,00/0,10
3. Apelante: Informática Tudo Certo Ltda. (0,10). 0,00/0,10
4. Apelado: Município Alfa (0,10). 0,00/0,10

5. Cabimento: recurso cabível para a reforma de sentença é a apelação (0,30), nos termos do Art.
1009, caput, do CPC (0,10).
0,00/0,30/0,40
6. Tempestividade: apelação interposta tempestivamente, a saber, dentro do prazo de 15 dias
úteis (0,30), nos termos do Art. 1.003, §5º, do CPC (0,10).
0,00/0,30/0,40
7. Recolhimento do devido preparo recursal (0,20), na forma do Art. 1.007, caput, do CPC (0,10). 0,00/0,20/0,30
8. Descrição dos Fatos (0,10). 0,00/0,10

9. Ausente lei municipal específica de parcelamento para devedores em recuperação judicial,
deve-se conceder ao devedor em recuperação judicial o prazo de parcelamento em 120 parcelas,
isto é, não inferior ao concedido em lei específica que trata do parcelamento de débitos de
devedor em recuperação judicial (0,70), nos termos do Art. 155-A, § 4º, do CTN (0,10).
0,00/0,70/0,80
10. A suspensão da exigibilidade do crédito tributário se dá com a simples adesão ao
parcelamento, não estando condicionada ao depósito prévio de, ao menos, 20% do valor total da
dívida (0,70), segundo o Art. 151, inciso VI, do CTN (0,10).
0,00/0,70/0,80
11. A exigência de depósito prévio de 20% do valor total da dívida como requisito de
admissibilidade do recurso administrativo é inconstitucional, por violar o direito de petição e o
direito ao contraditório e ampla defesa, com os meios e recursos a ela inerentes (0,70), nos
termos do Art. 5º, incisos XXIV ou LV, da CRFB/88, ou da Súmula Vinculante 21 do STF, ou Súmula
373 do STJ (0,10).
0,00/0,70/0,80

12. Dar provimento ao recurso para reformar a sentença, concedendo o parcelamento em 120
(cento e vinte) parcelas (0,20) e a suspensão da exigibilidade do crédito tributário (0,20).
0,00/0,20/0,40
13. Intimação do apelado, para, querendo, apresentar contrarrazões (0,20), nos termos do Art.
1.010, § 1º, do CPC (0,10);
0,00/0,20/0,30
14. Condenação do apelado ao ressarcimento das custas processuais (0,10) e ao pagamento dos
honorários advocatícios (0,10) ou reversão dos ônus de sucumbência (0,20).
0,00/0,10/0,20

15. Data, local, advogado, OAB. (0,10). 0,00/0,10
`;

console.log("=== ANÁLISE MANUAL DOS PONTOS DA PEÇA ===");

// Lista esperada de pontos da PEÇA
const pontosEsperados = [
	{ item: "1", pontos: [0.1], esperado: 0.1, descricao: "Interposição apelação" },
	{ item: "2", pontos: [0.1], esperado: 0.1, descricao: "Endereçamento razões" },
	{ item: "3", pontos: [0.1], esperado: 0.1, descricao: "Apelante" },
	{ item: "4", pontos: [0.1], esperado: 0.1, descricao: "Apelado" },
	{ item: "5", pontos: [0.3, 0.1], esperado: 0.4, descricao: "Cabimento + art CPC" },
	{ item: "6", pontos: [0.3, 0.1], esperado: 0.4, descricao: "Tempestividade + art CPC" },
	{ item: "7", pontos: [0.2, 0.1], esperado: 0.3, descricao: "Preparo + art CPC" },
	{ item: "8", pontos: [0.1], esperado: 0.1, descricao: "Descrição fatos" },
	{ item: "9", pontos: [0.7, 0.1], esperado: 0.8, descricao: "Lei municipal + art CTN" },
	{ item: "10", pontos: [0.7, 0.1], esperado: 0.8, descricao: "Suspensão + art CTN" },
	{ item: "11", pontos: [0.7, 0.1], esperado: 0.8, descricao: "Depósito inconst + art" },
	{ item: "12", pontos: [0.2, 0.2], esperado: 0.4, descricao: "Parcelamento + suspensão" },
	{ item: "13", pontos: [0.2, 0.1], esperado: 0.3, descricao: "Intimação + art CPC" },
	{ item: "14", pontos: [0.1, 0.1, 0.2], esperadoOU: 0.2, descricao: "Custas+honorários OU reversão" },
	{ item: "15", pontos: [0.1], esperado: 0.1, descricao: "Fechamento" },
];

let somaTotal = 0;
let somaEsperada = 0;

pontosEsperados.forEach((item) => {
	const valor = item.esperadoOU || item.esperado;
	somaTotal += valor;
	somaEsperada += valor;
	console.log(`Item ${item.item}: ${valor.toFixed(2)} pts - ${item.descricao}`);
});

console.log(`\nSOMA ESPERADA TOTAL: ${somaEsperada.toFixed(2)} pts`);

// Item 14 especial (OU)
console.log("\n=== ANÁLISE ITEM 14 (OU) ===");
console.log("Opção A: custas (0,10) + honorários (0,10) = 0,20");
console.log("Opção B: reversão (0,20) = 0,20");
console.log("Como é OU, deve contar apenas 0,20 (máximo)");

console.log(`\nRESULTADO: PEÇA deve somar exatamente ${somaEsperada.toFixed(2)} pontos`);
