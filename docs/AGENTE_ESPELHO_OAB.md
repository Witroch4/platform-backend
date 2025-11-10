# Agente de Espelho OAB

- `lib/oab-eval/mirror-generator-agent.ts`: orquestra a geração local (carrega rubrica `OabRubric`, coleta imagens, chama o modelo de visão e monta o resultado estruturado).
- `lib/oab-eval/mirror-formatter.ts`: converte a extração em
  - markdown legível (para visualização) e
  - JSON `StudentMirrorPayload` compatível com a rubrica (tota listo por item, totais de peça/questões e metadados do lead).
- `lib/oab-eval/mirror-queue.ts` + `worker/WebhookWorkerTasks/mirror-generation.task.ts`: enfileiram e processam os jobs, notificando o webhook interno.
- `app/api/admin/leads-chatwit/webhook/route.ts`: recebe o payload final e persiste `textoDOEspelho` com o JSON estruturado.

Use este fluxo quando precisar integrar novos formatos de rubrica, ajustar prompts de extração ou inspecionar resultados salvos para o lead.
