#!/usr/bin/env tsx

import { createReadStream } from 'fs';
import { join } from 'path';
import readline from 'readline';

const backupPath = join(process.cwd(), 'backups', 'backup_simple_2025-07-13_15-40-53.json');

async function main() {
  const stream = createReadStream(backupPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let inUsuarios = false;
  let buffer = '';
  let count = 0;

  for await (const line of rl) {
    if (!inUsuarios && line.includes('"usuariosChatwit"')) {
      inUsuarios = true;
      // Pode estar assim: "usuariosChatwit": [
      buffer = '';
      continue;
    }
    if (inUsuarios) {
      if (line.includes('],')) break; // Fim do array
      buffer += line.trim();
      if (line.trim().endsWith('},') || line.trim().endsWith('}')) {
        // Tenta parsear o objeto
        let objStr = buffer;
        if (objStr.endsWith(',')) objStr = objStr.slice(0, -1);
        try {
          const obj = JSON.parse(objStr);
          console.log({
            id: obj.id,
            name: obj.name,
            accountName: obj.accountName,
            channel: obj.channel,
            chatwitAccountId: obj.chatwitAccountId,
            appUserId: obj.appUserId
          });
          count++;
          if (count >= 3) break;
        } catch (e) {
          // ignora parse error, pode ser linha incompleta
        }
        buffer = '';
      }
    }
  }
  rl.close();
}

main().catch(console.error); 