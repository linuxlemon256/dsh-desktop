/**
 * dsh-desktop-settings — host half. Intentionally empty: the whole plugin is
 * browser-only (a settings card driven by the Electron bridge). The host half
 * exists so the cordis loader can import a Node-safe main entry; all logic
 * lives in the browser bundle (exports "./client").
 */

import type { Context } from '@deepseek-ai/cordis'

/** Required services: none. */
export const inject = [] as string[]

/** No host-side work. */
export function apply(_ctx: Context): void {
  /* intentionally empty */
}
