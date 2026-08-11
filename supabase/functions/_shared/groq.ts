const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_REQUEST_TIMEOUT_MS = 20_000;
export const GROQ_TEXT_MODEL = 'openai/gpt-oss-20b';

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
}

export interface JsonSchemaDefinition {
  name: string;
  schema: Record<string, unknown>;
}

export async function requestGroqStructured<T>(input: {
  system: string;
  user: string;
  schema: JsonSchemaDefinition;
  model?: string;
  maxCompletionTokens?: number;
}): Promise<T> {
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('Household AI is not configured yet.');
  }

  let response: Response;
  try {
    response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(GROQ_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: input.model ?? GROQ_TEXT_MODEL,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: input.schema.name,
            strict: true,
            schema: input.schema.schema,
          },
        },
        reasoning_effort: 'low',
        temperature: 0.2,
        max_completion_tokens: input.maxCompletionTokens ?? 1800,
      }),
    });
  } catch (error) {
    console.error(
      'Groq request failed before receiving a response',
      error instanceof Error ? error.name : 'Unknown network error',
    );
    throw new Error('Household AI is temporarily unavailable.');
  }

  let payload: GroqChatResponse;
  try {
    payload = (await response.json()) as GroqChatResponse;
  } catch {
    throw new Error('The AI provider returned an unreadable response.');
  }

  if (!response.ok) {
    const providerMessage =
      typeof payload.error?.message === 'string' ? payload.error.message.slice(0, 300) : null;
    console.error('Groq request failed', response.status, providerMessage ?? 'Unknown provider error');
    throw new Error('Household AI is temporarily unavailable.');
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('The AI provider returned an empty response.');
  }

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error('The AI provider returned invalid structured data.');
  }
}
