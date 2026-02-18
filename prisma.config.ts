import * as dotenv from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// Carrega na ordem: .env → .env.local sobrescreve (convenção Next.js)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, ".env.local"), override: true });

export default defineConfig({
	schema: path.join(__dirname, "prisma", "schema.prisma"),
	migrations: {
		path: path.join(__dirname, "prisma", "migrations"),
	},

});
