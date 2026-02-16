#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Arquivo a ser modificado
const filePath = "d:\\nextjs\\Chatwit-Social-dev\\app\\admin\\mtf-diamante\\components\\shared\\InteractivePreview.tsx";

// Ler o arquivo
let content = fs.readFileSync(filePath, "utf8");

// Substituir todas as ocorrências do padrão
const pattern =
	/(\s+)({reaction\?\.\textResponse && \(\s+<Badge variant="secondary" className="text-xs">\s+Texto\s+<\/Badge>\s+\)\})/g;

const replacement = `$1$2
$1{reaction?.action === "handoff" && (
$1  <Badge variant="destructive" className="text-xs">
$1    🚨 Handoff
$1  </Badge>
$1)}`;

content = content.replace(pattern, replacement);

// Escrever o arquivo atualizado
fs.writeFileSync(filePath, content, "utf8");

console.log("✅ Arquivo atualizado com sucesso! Adicionado badge para ação Handoff.");
