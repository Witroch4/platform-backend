import { getPrismaInstance } from "../lib/connections";

async function main() {
	const prisma = getPrismaInstance();
	const id = process.argv[2]!;
	const verbose = process.argv.includes("--verbose");
	const rubric = await prisma.oabRubric.findUnique({ where: { id } });
	if (!rubric) {
		console.log("Rubric not found");
		return;
	}
	const schema: any = rubric.schema;
	const grupos = schema?.grupos || [];
	const pecaGroups = grupos.filter((g: any) => g.escopo === "Peça");
	console.log("Total grupos peça:", pecaGroups.length);
	pecaGroups.forEach((g: any) => {
		console.log(g.id, g.rotulo, g.subitens, g.variant_family, g.variant_key, g.segmento);
		if (verbose) {
			console.log("  descricao:", g.descricao);
		}
	});
}

main()
	.catch((err) => {
		console.error(err);
	})
	.finally(() => process.exit(0));
