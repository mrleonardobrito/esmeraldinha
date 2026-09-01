import { OpenRouterError, OpenRouterNotConfiguredError } from './errors';
import { env } from '../env';

export interface TextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface ImagePart {
  readonly type: 'image_url';
  readonly image_url: { readonly url: string };
}

export interface FilePart {
  readonly type: 'file';
  readonly file: { readonly filename: string; readonly file_data: string };
}

export type ContentPart = TextPart | ImagePart | FilePart;

export interface JsonSchemaFormat {
  readonly name: string;
  readonly schema: Record<string, unknown>;
}

export interface ChatCompletionRequest {
  readonly system: string;
  readonly content: readonly ContentPart[];
  readonly format: JsonSchemaFormat;
  /** O plugin que extrai texto de PDF só é enviado quando há um PDF. */
  readonly parsePdf?: boolean;
  readonly signal?: AbortSignal;
}

interface CompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Uma chamada HTTP só — não vale uma dependência. A saída vem travada por
 * json_schema, o que não dispensa revalidar do nosso lado.
 */
export async function chatCompletion({
  system,
  content,
  format,
  parsePdf = false,
  signal,
}: ChatCompletionRequest): Promise<string> {
  if (!env.openrouter.apiKey) {
    throw new OpenRouterNotConfiguredError();
  }

  const response = await fetch(`${env.openrouter.baseUrl}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${env.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Esmeraldinha',
    },
    body: JSON.stringify({
      model: env.openrouter.model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content },
      ],
      response_format: { type: 'json_schema', json_schema: { ...format, strict: true } },
      ...(parsePdf
        ? { plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] }
        : {}),
    }),
  });

  const body = (await response.json().catch(() => null)) as CompletionResponse | null;

  if (!response.ok) {
    throw new OpenRouterError(
      response.status,
      body?.error?.message ?? `OpenRouter respondeu HTTP ${response.status}.`,
    );
  }

  const text = body?.choices?.[0]?.message?.content;

  if (!text) {
    throw new OpenRouterError(502, 'OpenRouter respondeu sem conteúdo.');
  }

  return text;
}
