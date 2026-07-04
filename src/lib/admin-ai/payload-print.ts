/**
 * Dev-only request-payload printing, shared across admin-AI providers.
 *
 * Extracted verbatim from the OpenAI provider so the DeepSeek provider can reuse
 * the exact same lazy/gated instrumentation instead of copy-pasting it. Gated by
 * ADMIN_AI_PRINT_OPENAI_PAYLOAD (the historical flag name is kept so existing
 * dev workflows keep working); the token inspector is imported lazily so
 * `gpt-tokenizer` never ships in the production request path. Everything here is
 * wrapped so instrumentation can never break the actual request.
 */
import { parseOptionalBooleanEnv } from "./env";

function shouldPrintRequestPayload(): boolean {
  const explicit = parseOptionalBooleanEnv(
    process.env.ADMIN_AI_PRINT_OPENAI_PAYLOAD,
  );
  if (explicit !== null) return explicit;
  return false;
}

async function writeAdminAiPayloadDebugFiles(input: {
  provider: string;
  scope: string;
  systemPrompt: string;
  userPrompt: string;
  requestBodyJson: string;
  report: string;
  inspection: unknown;
}): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), ".admin-ai-debug");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(dir, `${stamp}-${input.scope}`);
  await Promise.all([
    writeFile(`${base}.system.txt`, input.systemPrompt, "utf8"),
    writeFile(`${base}.user.txt`, input.userPrompt, "utf8"),
    writeFile(`${base}.report.txt`, input.report, "utf8"),
    writeFile(
      `${base}.inspection.json`,
      JSON.stringify(input.inspection, null, 2),
      "utf8",
    ),
    writeFile(`${base}.request.raw.json`, input.requestBodyJson, "utf8"),
  ]);
  console.info(
    `[admin-ai][${input.provider}-request-payload] wrote ${base}.{system.txt,user.txt,report.txt,inspection.json,request.raw.json}`,
  );
}

// Runs immediately before the fetch, only when ADMIN_AI_PRINT_OPENAI_PAYLOAD is
// on. Prints an exact token/segment/cache-split breakdown of what we send and
// dumps the raw prompts to .admin-ai-debug/ for inspection. `provider` labels
// the console output so OpenAI and DeepSeek runs are distinguishable.
export async function printAdminAiRequestPayload(input: {
  provider: string;
  model: string;
  scope: string;
  includeEvidence: boolean;
  systemPrompt: string;
  userPrompt: string;
  schema: object;
  schemaName: string;
  requestBodyJson: string;
}): Promise<void> {
  if (!shouldPrintRequestPayload()) return;
  try {
    const { inspectAdminAiPayload, formatAdminAiPayloadReport } = await import(
      "./payload-inspect"
    );
    const inspection = inspectAdminAiPayload({
      model: input.model,
      scope: input.scope,
      includeEvidence: input.includeEvidence,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      schema: input.schema,
    });
    const report = formatAdminAiPayloadReport(inspection);
    console.info(`\n${report}\n`);
    await writeAdminAiPayloadDebugFiles({
      provider: input.provider,
      scope: input.scope,
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
      requestBodyJson: input.requestBodyJson,
      report,
      inspection,
    });
  } catch (error) {
    // Disclosed fallback (fail loud, never fake): still surface the raw size so
    // the send is observable even if tokenization or the file dump failed.
    console.warn(
      `[admin-ai][${input.provider}-request-payload] token inspection unavailable — raw size only`,
      {
        model: input.model,
        scope: input.scope,
        schemaName: input.schemaName,
        chars: input.requestBodyJson.length,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
}
