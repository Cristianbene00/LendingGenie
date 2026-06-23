import { getConfig } from './config.js';
import { logger } from './logger.js';

const config = getConfig();

export interface EmbeddingProvider {
  embed(texts: string[], inputType: 'document' | 'query'): Promise<number[][]>;
  dimensions(): number;
}

class OpenAIEmbeddings implements EmbeddingProvider {
  dimensions(): number { return config.EMBEDDING_DIMENSIONS; }

  async embed(texts: string[], _inputType: 'document' | 'query'): Promise<number[][]> {
    if (texts.length === 0) return [];
    const BATCH = 64;
    const out: number[][] = [];

    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH);
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.EMBEDDING_MODEL,
          input: batch,
          dimensions: config.EMBEDDING_DIMENSIONS,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        logger.error({ status: resp.status, err }, 'OpenAI embed fail');
        throw new Error(`OpenAI ${resp.status}: ${err}`);
      }
      const json = (await resp.json()) as { data: Array<{ embedding: number[]; index: number }> };
      for (const item of json.data.sort((a, b) => a.index - b.index)) out.push(item.embedding);
    }
    return out;
  }
}

let _p: EmbeddingProvider | null = null;
export function getEmbeddings(): EmbeddingProvider {
  if (!_p) _p = new OpenAIEmbeddings();
  return _p;
}
