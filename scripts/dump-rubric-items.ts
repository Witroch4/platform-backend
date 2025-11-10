import { getPrismaInstance } from "../lib/connections";

async function main() {
  const prisma = getPrismaInstance();
  const id = process.argv[2]!;
  const limit = Number(process.argv[3] || 10);
  const rubric = await prisma.oabRubric.findUnique({ where: { id } });
  const itens = (rubric?.schema as any)?.itens || [];
  console.log(`Total itens: ${itens.length}`);
  itens.slice(0, limit).forEach((item: any, idx: number) => {
    console.log(idx + 1, item.id, item.peso, item.descricao);
  });
}

main().catch((err) => console.error(err)).finally(() => process.exit(0));
