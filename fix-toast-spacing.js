const fs = require("fs");

const files = [
	"app/admin/leads-chatwit/components/lead-item/componentes-lead-item/hooks/useLeadHandlers.ts",
	"app/admin/leads-chatwit/components/lead-item/componentes-lead-item/hooks/useBatchProcessor.ts",
];

files.forEach((filePath) => {
	try {
		console.log(`Corrigindo: ${filePath}`);

		let content = fs.readFileSync(filePath, "utf8");

		// Corrigir espaços extras antes do fechamento
		content = content.replace(/description:\s*([^}]+?)\s{2,}\}/g, "description: $1 }");

		// Corrigir múltiplos espaços antes do });
		content = content.replace(/}\s{2,}\);/g, "});");

		// Corrigir padrões específicos problemáticos
		const fixes = [
			// Espaços extras na descrição
			{ from: /description:\s*"([^"]+)"\s{2,}\}/g, to: 'description: "$1" }' },
			{ from: /description:\s*([^"}]+)\s{2,}\}/g, to: "description: $1 }" },

			// Espaços extras antes do });
			{ from: /\s{3,}\}\);/g, to: " });" },
			{ from: /\s{2,}\}\);/g, to: " });" },

			// Remover espaços extras antes do fechamento da chamada toast
			{
				from: /toast\("([^"]+)",\s*\{\s*description:\s*"([^"]+)"\s*\}\s{2,}\);/g,
				to: 'toast("$1", { description: "$2" });',
			},
			{
				from: /toast\("([^"]+)",\s*\{\s*description:\s*([^}]+?)\s{2,}\}\s*\);/g,
				to: 'toast("$1", { description: $2 });',
			},

			// Corrigir toast.error e toast.success também
			{
				from: /toast\.error\("([^"]+)",\s*\{\s*description:\s*"([^"]+)"\s*\}\s{2,}\);/g,
				to: 'toast.error("$1", { description: "$2" });',
			},
			{
				from: /toast\.success\("([^"]+)",\s*\{\s*description:\s*"([^"]+)"\s*\}\s{2,}\);/g,
				to: 'toast.success("$1", { description: "$2" });',
			},
		];

		fixes.forEach((fix) => {
			content = content.replace(fix.from, fix.to);
		});

		fs.writeFileSync(filePath, content, "utf8");
		console.log(`✅ Corrigido: ${filePath}`);
	} catch (error) {
		console.error(`❌ Erro ao corrigir ${filePath}:`, error.message);
	}
});

console.log("Correção de espaçamento em toasts concluída!");
