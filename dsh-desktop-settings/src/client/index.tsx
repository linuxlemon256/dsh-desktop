/**
 * dsh-desktop-settings — browser half. Registers one card into the Web UI
 * Plugins group (`web-ui.plugin.item` slot). The card drives the Electron
 * desktop host through the injected `window.__dshDesktop__` bridge (custom
 * port, port-occupancy scan, apply-and-restart). No host half.
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface SlotMap merge (the 'settings.section'
// entry) and the ctx.settingsScope Context merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { PortSettingsCard } from './PortSettingsCard.tsx'
import { en, zh } from './locales.ts'

/** Locale dictionary namespace owned by this plugin. */
const NS = 'dsh-desktop-settings'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop integration card copy. */
    'dsh-desktop-settings': Record<string, string>
  }

  interface SlotMap {
    /**
     * The child slot the Web UI plugin group declares; this card registers
     * into the group instead of the top-level `settings.plugin.item` list.
     */
    'web-ui.plugin.item': { kind: 'list'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the group card supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Required services. */
export const inject = ['slots', 'locale']

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-desktop-settings: dictionaries')

  ctx.slots.inject('web-ui.plugin.item', () =>
    ctx.slots.register({
      name: 'web-ui.plugin.item',
      id: 'dsh-desktop-settings',
      order: 120,
      locale: NS,
      inject: () => ({}),
    }, PortSettingsCard))
}
