const NF_SEK = new Intl.NumberFormat('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export function fmtCurrency(n: number, valuta: string = 'kr'): string {
  return `${NF_SEK.format(Math.round(n))} ${valuta}`
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '—'
  return new Date(s).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })
}
