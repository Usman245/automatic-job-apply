import { z } from 'zod'

const schema = z.object({
  DATABASE_URL:         z.string().min(1),
  REDIS_URL:            z.string().min(1),
  ANTHROPIC_API_KEY:    z.string().min(1),

  GMAIL_CLIENT_ID:      z.string().optional(),
  GMAIL_CLIENT_SECRET:  z.string().optional(),
  GMAIL_REFRESH_TOKEN:  z.string().optional(),
  GMAIL_USER_EMAIL:     z.string().email().optional(),

  LINKEDIN_COOKIE:      z.string().optional(),

  NEXTAUTH_SECRET:      z.string().min(1).default('dev-secret-change-me'),
  NEXT_PUBLIC_APP_URL:  z.string().url().default('http://localhost:3000'),

  LOG_LEVEL:              z.string().default('info'),
  MAX_DAILY_APPLICATIONS: z.coerce.number().int().default(20),
  MIN_FIT_SCORE:          z.coerce.number().default(0.60),
  FOLLOWUP_DELAY_DAYS:    z.coerce.number().int().default(7),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

export type Env = z.infer<typeof schema>

let _parsed: Env | null = null

export function getEnv(): Env {
  if (_parsed) return _parsed
  const result = schema.safeParse(process.env)
  if (!result.success) {
    const errors = Object.entries(result.error.flatten().fieldErrors)
      .map(([k, v]) => `  ${k}: ${v?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment variables:\n${errors}`)
  }
  _parsed = result.data
  return _parsed
}

export const env = new Proxy({} as Env, {
  get(_, key: string) {
    return getEnv()[key as keyof Env]
  },
})
