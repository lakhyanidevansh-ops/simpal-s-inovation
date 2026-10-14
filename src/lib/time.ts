/** CME Globex exchange clock */
export const EXCHANGE_TZ = 'America/Chicago'
/** Common US label the app also shows */
export const DISPLAY_ET = 'America/New_York'

export const BAR_SEC = 300

/** Floor unix seconds to exact 5m boundary (CME 5m bars share these epochs). */
export function alignBarOpen(tsSec: number): number {
  return Math.floor(tsSec / BAR_SEC) * BAR_SEC
}

export function barCloseTime(openSec: number): number {
  return openSec + BAR_SEC
}

export function formatInZone(
  tsSec: number,
  timeZone: string,
  withSeconds = false,
): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false,
    }).format(new Date(tsSec * 1000))
  } catch {
    return new Date(tsSec * 1000).toISOString()
  }
}

export function formatClock(
  tsSec: number,
  timeZone: string,
  withSeconds = false,
): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: withSeconds ? '2-digit' : undefined,
      hour12: false,
    }).format(new Date(tsSec * 1000))
  } catch {
    return new Date(tsSec * 1000).toISOString().slice(11, withSeconds ? 19 : 16)
  }
}

export function formatAxisTick(tsSec: number): string {
  // Exchange (CME) time on the axis
  return formatClock(tsSec, EXCHANGE_TZ, false)
}

/** True if bar open is an exact 5m epoch. */
export function isAligned5m(tsSec: number): boolean {
  return tsSec % BAR_SEC === 0
}
