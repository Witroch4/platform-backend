import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: path.join(__dirname, "prisma", "schema.prisma"),
	migrations: {
		path: path.join(__dirname, "prisma", "migrations"),
	},
    // Nota: preferimos chamar o seed direto no script db-push-dev.mjs com `tsx prisma/seed.ts`
});



