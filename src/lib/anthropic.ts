import Anthropic from '@anthropic-ai/sdk'
import { getEnv } from './env'

let _client: Anthropic | null = null

export function getAnthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY })
  return _client
}
