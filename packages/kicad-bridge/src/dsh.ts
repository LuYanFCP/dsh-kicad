/**
 * The only module in this package that touches dsh / Cordis APIs. Keep the
 * surface small: when dsh changes, this file is where the adaptation happens.
 */
export { Service } from '@deepseek-ai/cordis'
export type { Context, Volatile } from '@deepseek-ai/cordis'
export { default as z } from '@deepseek-ai/schemastery'
export type { SubprocessHandle, SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-subprocess'
