import Anthropic from '@anthropic-ai/sdk';
import { AiError } from './index.js';
import { trackExternal } from '../monitoring.js';

/**
 * Claude (Anthropic) sağlayıcısı. Yanıt, verilen JSON şemasına uyacak şekilde yapılandırılmış çıktı ile istenir;
 * yine de çağıran taraf sonucu ayrıca doğrular.
 */
export const createProvider = ({ apiKey }) => {
  const client = new Anthropic({
    apiKey,
    timeout: parseInt(process.env.AI_TIMEOUT_MS || '60000', 10),
    maxRetries: 1
  });
  const model = process.env.AI_MODEL || 'claude-opus-5-5';
  const effort = ['low', 'medium', 'high'].includes(process.env.AI_EFFORT) ? process.env.AI_EFFORT : 'medium';

  const generateJson = async ({ system, prompt, schema, maxTokens = 16000 }) => {
    let response;
    try {
      response = await trackExternal('Yapay zekâ', model, () => client.beta.messages.create({
        model,
        max_tokens: maxTokens,
        // Güvenlik sınıflandırıcısı reddederse istek, sağlayıcının önerdiği modelde otomatik tekrarlanır
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages: [{ role: 'user', content: prompt }],
        output_config: { effort, format: { type: 'json_schema', schema } }
      }));
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionTimeoutError) throw new AiError('TIMEOUT');
      if (error instanceof Anthropic.RateLimitError) throw new AiError('RATE_LIMIT');
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new AiError('AUTH');
      if (error instanceof Anthropic.APIError) throw new AiError('UNAVAILABLE', `${error.status} ${error.message}`);
      throw new AiError('UNAVAILABLE', error.message);
    }

    if (response.stop_reason === 'refusal') throw new AiError('REFUSAL', response.stop_details?.category);
    if (response.stop_reason === 'max_tokens') throw new AiError('INVALID_RESPONSE', 'max_tokens');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError('INVALID_RESPONSE', 'JSON ayrıştırılamadı');
    }
  };

  return { name: 'anthropic', mock: false, generateJson };
};
