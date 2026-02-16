import { readFileSync } from "fs";
import pdfParse from "pdf-parse";
import { parseGabaritoDeterministico, verificarPontuacao } from "../lib/oab/gabarito-parser-deterministico";

async function inspect(file: string) {
	const buffer = readFileSync(`lib/oab/pdf-exemplos-gabaritos/${file}`);
	const pdf = await pdfParse(buffer, { pagerender: undefined });
	const text = pdf.text
		.replace(/\r\n/g, "\n")
		.replace(/\u0000/g, "")
		.replace(/\t+/g, " ")
		.replace(/[ \t]+\n/g, "\n");
	const meta = {
		exam: "43º Exame de Ordem Unificado",
		area: file.replace(".pdf", ""),
		data_aplicacao: "2025-06-15",
		fonte: "Padrão de Resposta da FGV",
	};
	const parsed = parseGabaritoDeterministico(text, meta);
	const verificacao = verificarPontuacao(parsed.itens);
	console.log("verificacao", file, verificacao);
	parsed.itens
		.filter((it) => it.questao === "PEÇA")
		.forEach((it) => {
			console.log(`${it.id} | peso=${it.peso} | grupo=${it.ou_group_id ?? "-"} | desc=${it.descricao}`);
		});
}

inspect(process.argv[2] ?? "DIREITO CIVIL.pdf").catch((err) => {
	console.error(err);
	process.exit(1);
});
