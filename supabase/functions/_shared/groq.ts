export const GROQ_TEXT_MODEL = 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 20_000;

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
}

export async function requestGroqStructured<T>(input: {
  system: string;
  user: string;
  schema: JsonSchemaDefinition;
  maxCompletionTokens?: number;
}): Promise<T> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) throw new Error('Household AI is not configured yet.');

  let response: Response;
  try {
    response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: GROQ_TEXT_MODEL,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: input.schema.name, strict: true, schema: input.schema.schema },
        },
        reasoning_effort: 'low',
        temperature: 0.2,
        max_completion_tokens: input.maxCompletionTokens ?? 1800,
      }),
    });
  } catch (error) {
    console.error('Groq network request failed', error instanceof Error ? error.name : error);
    throw new Error('Household AI is temporarily unavailable.');
  }

  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error('The AI provider returned an unreadable response.');
  }
  if (!response.ok) {
    console.error('Groq request failed', response.status);
    throw new Error('Household AI is temporarily unavailable.');
  }

  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content !== 'string' || !content) throw new Error('The AI provider returned an empty response.');
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('The AI provider returned invalid structured data.');
  }
}
