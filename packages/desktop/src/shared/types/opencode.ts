export interface OpenCodeModel {
  id: string
  name: string
  provider: string
}

export interface OpenCodeStatus {
  state: 'missing' | 'upgrade' | 'ready' | 'error'
  platform: string
  arch: string
  command?: string
  version?: string
  authentication: 'signed-in' | 'not-signed-in' | 'unknown'
  providers: string[]
  freeModels: OpenCodeModel[]
  error?: string
}

export interface OpenCodeViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export type OpenCodeViewResult = { ok: true } | { ok: false; error: string }

export interface OpenCodeTranslationRequest {
  source: string
  target: string
  model: string
}

export type OpenCodeTranslationResult =
  | { ok: true; text: string }
  | { ok: false; code: 'restricted' | 'failed' | 'cancelled' | 'timeout' | 'unavailable'; error: string }
