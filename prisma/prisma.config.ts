// prisma.config.ts
import type { PrismaConfig } from "prisma";

const config: PrismaConfig = {
	// Aponta para o arquivo schema.prisma
	schema: "./schema.prisma",
};

export default config;
