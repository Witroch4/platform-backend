// patch-gpt5.mjs
import fs from "node:fs/promises";
import path from "node:path";

const filePath = path.join("app", "api", "chatwitia", "route.ts");

function log(msg) {
	console.log(msg);
}
function has(re, s) {
	return new RegExp(re, "s").test(s);
}
function rep(re, r, s) {
	return s.replace(new RegExp(re, "s"), r);
}

const DYNAMIC_CAT = String.raw`    // Categorização dinâmica — reconhece gpt-5, gpt-6… automaticamente
    const buildDynamicCategories = (list: any[]) => {
      const cats: Record<string, any[]> = {
        gpt4o: [],
        oSeries: [],
        embedding: [],
        audio: [],
        image: [],
        other: []
      };
      for (const m of list) {
        const id: string = m.id || '';
        if (/^o\d/.test(id)) { cats.oSeries.push(m); continue; }
        if (/embedding/.test(id)) { cats.embedding.push(m); continue; }
        if (/whisper/.test(id)) { cats.audio.push(m); continue; }
        if (/dall-e|^image-/.test(id)) { cats.image.push(m); continue; }
        if (/^gpt-4o/.test(id)) { cats.gpt4o.push(m); continue; }
        // gpt-N (pega 5,6,7…); mantém buckets separados: gpt5, gpt6, etc.
        const gptMajor = id.match(/^gpt-(\d)(?:[.-]|$)/);
        if (gptMajor) {
          const key = \`gpt\${gptMajor[1]}\`;
          (cats as any)[key] ||= [];
          (cats as any)[key].push(m);
          continue;
        }
        cats.other.push(m);
      }
      return cats;
    };
    const categorizedModels = buildDynamicCategories(modelsList.data);`;

const GETLATEST_BLOCK = String.raw`// Cache para resolver qualquer "*-latest" → ID mais novo (TTL 10 min)
const CACHE_TTL_MS = 10 * 60 * 1000;
async function getLatest(base: string): Promise<string> {
  try {
    const now = Date.now();
    global.modelIdCache ||= {};
    const cached = global.modelIdCache[base];
    if (cached && (now - cached.ts) < CACHE_TTL_MS) {
      return cached.id;
    }
    const list = await openai.models.list();
    const candidates = list.data.filter(m => m.id === base || m.id.startsWith(\`\${base}-\`));
    if (candidates.length === 0) {
      global.modelIdCache[base] = { id: base, ts: now };
      return base;
    }
    const withDate = candidates.map(m => {
      const d = m.id.match(/\\d{4}-\\d{2}-\\d{2}/)?.[0] ?? '0000-00-00';
      return { id: m.id, date: d };
    }).sort((a, b) => b.date.localeCompare(a.date));
    const resolved = withDate[0].id;
    global.modelIdCache[base] = { id: resolved, ts: now };
    return resolved;
  } catch {
    return base;
  }
}
`;

const GPT5_ALIASES = String.raw`let openaiModel = model;

// GPT-5 Series (aliases e latest)
if (model === 'gpt-5-latest' || model === 'GPT-5-latest') openaiModel = await getLatest('gpt-5');
if (model === 'gpt-5' || model === 'GPT-5') openaiModel = 'gpt-5';

// Genérico: qualquer "*-latest" cai na resolução dinâmica
if (/-latest$/.test(model) && !openaiModel.includes('-')) {
  const base = model.replace(/-latest$/, '');
  openaiModel = await getLatest(base);
}
`;

async function main() {
	const src = await fs.readFile(filePath, "utf8");
	let s = src;
	let changed = false;

	// 0) Backup
	await fs.writeFile(filePath + ".bak", src);
	log(`Backup criado: ${filePath}.bak`);

	// 1) declare global -> add modelIdCache
	if (!has(`var\\s+modelIdCache\\?\\:`, s)) {
		s = s.replace(
			/(declare\s+global\s*\{\s*)([\s\S]*?)(\s*\})/,
			(_m, a, b, c) => `${a}${b}\n  var modelIdCache?: { [base: string]: { id: string, ts: number } };\n${c}`,
		);
		log("✓ modelIdCache adicionado ao declare global");
		changed = true;
	} else {
		log("• modelIdCache já existe");
	}

	// 2) Categorias dinâmicas
	if (has(`const\\s+categorizedModels\\s*:\\s*\\{[\\s\\S]*?\\}\\s*=\\s*\\{[\\s\\S]*?\\n\\s*\\};`, s)) {
		s = rep(`const\\s+categorizedModels\\s*:\\s*\\{[\\s\\S]*?\\}\\s*=\\s*\\{[\\s\\S]*?\\n\\s*\\};`, DYNAMIC_CAT, s);
		log("✓ Categorização dinâmica aplicada");
		changed = true;
	} else if (!has(`buildDynamicCategories`, s)) {
		log("! Não achei o bloco fixo de categorização; pulei esta etapa.");
	} else {
		log("• Categorização dinâmica já existe");
	}

	// 3) Inserir getLatest() antes do comentário da Responses API
	if (!has(`async\\s+function\\s+getLatest\\(base:\\s*string\\)`, s)) {
		const marker = s.match(/^\s*\/\/ Função para processar requisições para a API do OpenAI.*/m);
		if (marker) {
			const idx = marker.index;
			s = s.slice(0, idx) + GETLATEST_BLOCK + s.slice(idx);
			log("✓ getLatest() inserida");
			changed = true;
		} else {
			log("! Marcador da Responses API não encontrado; pulei getLatest()");
		}
	} else {
		log("• getLatest() já existe");
	}

	// 4) Aliases gpt-5 e resolvedor genérico -latest (logo após let openaiModel = model;)
	if (!has(`GPT-5-latest|gpt-5-latest`, s)) {
		s = s.replace(/let\s+openaiModel\s*=\s*model\s*;/, GPT5_ALIASES);
		log("✓ Aliases gpt-5 e resolvedor -latest inseridos");
		changed = true;
	} else {
		log("• Aliases gpt-5 já existem");
	}

	// 5) isFileCompatibleModel -> aceitar gpt-5
	if (!has(`modelToUse\\.startsWith\\('gpt-5'\\)`, s)) {
		s = s.replace(
			/modelToUse\.includes\('gpt-4o'\)\s*\|\|/g,
			`modelToUse.includes('gpt-4o') ||\n      modelToUse.startsWith('gpt-5') ||`,
		);
		log("✓ gpt-5 marcado como compatível com arquivos");
		changed = true;
	} else {
		log("• isFileCompatibleModel já contempla gpt-5");
	}

	// 6) imageCompatibleModels -> incluir 'gpt-5'
	if (has(`const\\s+imageCompatibleModels\\s*=\\s*\\[`, s) && !has(`['"]gpt-5['"]`, s)) {
		s = s.replace(
			/const\s+imageCompatibleModels\s*=\s*\[\s*/,
			`const imageCompatibleModels = [\n      'gpt-5',\n      `,
		);
		log("✓ imageCompatibleModels inclui gpt-5");
		changed = true;
	} else if (!has(`const\\s+imageCompatibleModels\\s*=\\s*\\[`, s)) {
		log("! Não achei imageCompatibleModels; pulei esta etapa.");
	} else {
		log("• imageCompatibleModels já inclui gpt-5");
	}

	if (changed) {
		await fs.writeFile(filePath, s);
		log(`==== Concluído: ${filePath} atualizado ====`);
	} else {
		log("Nada a mudar — arquivo já está com o patch.");
	}
}

main().catch((e) => {
	console.error("Falhou:", e);
	process.exit(1);
});
