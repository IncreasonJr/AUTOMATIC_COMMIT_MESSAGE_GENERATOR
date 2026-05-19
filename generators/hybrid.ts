import { DiffContext } from '../git/diffAnalyzer';
import { ExtensionConfig } from '../config/settings';
import { generateRuleBased } from './ruleBased';
import { callAIProvider, AIResult } from './aiProvider';

export interface HybridResult {
  messages: string[];
  provider: string;
  model: string;
  usedFallback: boolean;
}

/**
 * Hybrid strategy:
 * 1. Always generate a rule-based message synchronously (fast fallback)
 * 2. Attempt AI enhancement in parallel
 * 3. Return AI result if successful, prepend rule-based message as first option
 * 4. If AI fails, return only the rule-based message (silent fallback)
 */
export async function generateHybrid(
  ctx: DiffContext,
  config: ExtensionConfig,
  onFallback?: (reason: string) => void
): Promise<HybridResult> {
  // Generate rule-based first (synchronous, always available)
  const rulesMessage = generateRuleBased(ctx, config.commitStyle);

  try {
    // Attempt AI with a shorter timeout in hybrid mode
    const aiConfig: ExtensionConfig = {
      ...config,
      provider: config.hybridProvider,
    };

    const aiResult = await Promise.race<AIResult>([
      callAIProvider(ctx, aiConfig),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`AI timed out after ${config.hybridTimeoutSeconds}s`)),
          Math.max(1, config.hybridTimeoutSeconds) * 1000
        )
      ),
    ]);

    // Merge: rule-based first, then AI suggestions (deduplicated)
    const aiMessages = aiResult.messages.filter(m => m.trim() !== rulesMessage.trim());
    const merged = [rulesMessage, ...aiMessages].slice(0, config.numSuggestions + 1);

    return {
      messages: merged,
      provider: `Hybrid (${aiResult.provider})`,
      model: aiResult.model,
      usedFallback: false,
    };
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    onFallback?.(reason);

    return {
      messages: [rulesMessage],
      provider: 'Rule-based (AI unavailable)',
      model: 'none',
      usedFallback: true,
    };
  }
}
