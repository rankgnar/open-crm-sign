import type { SigningPayload } from '../types'
import { fmtCurrency, fmtDate } from '../lib/format'

interface Props { payload: SigningPayload }

function s(v: unknown): string { return v == null ? '' : String(v) }

export function DocumentRender({ payload }: Props) {
  const { doc, lines, kund, projekt, foretag, doc_typ } = payload
  const valuta = foretag.valuta || 'kr'

  const totals = doc_typ === 'forslag'
    ? computeForslagTotals(lines as ForslagFas[], Number(doc.moms_procent ?? 25))
    : {
        netto: Number(doc.belopp_netto ?? 0),
        moms:  Number(doc.belopp_moms  ?? 0),
        total: Number(doc.belopp_total ?? 0),
      }

  const docNummer    = s(doc.forslag_nummer ?? doc.order_nummer)
  const docTitel     = s(doc.titel)
  const docBesk      = s(doc.beskrivning)
  const docGiltigTill = s(doc.giltig_till)
  const projektNamn  = projekt ? s(projekt.namn) : ''
  const projektNummer = projekt ? s(projekt.projekt_nummer) : ''

  return (
    <article className="card p-6 sm:p-8 space-y-6">
      {/* Header — företag + dokumentnummer */}
      <header className="flex items-start justify-between gap-6 pb-5 border-b border-border">
        <div className="flex items-center gap-4 min-w-0">
          {foretag.foretag_logo_url ? (
            <img
              src={foretag.foretag_logo_url}
              alt={foretag.foretag_namn || ''}
              className="h-12 max-w-[180px] object-contain"
            />
          ) : (
            <span className="text-xl font-semibold text-fg">{foretag.foretag_namn}</span>
          )}
          <div className="text-[11px] text-subtle leading-tight hidden sm:block">
            {foretag.foretag_org_nummer && <p>Org. {foretag.foretag_org_nummer}</p>}
            {foretag.foretag_email && <p>{foretag.foretag_email}</p>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] uppercase tracking-widest text-subtle">
            {doc_typ === 'forslag' ? 'Offert' : 'Order'}
          </p>
          <p className="text-base font-mono font-semibold text-fg">{docNummer}</p>
          {docGiltigTill && (
            <p className="text-[11px] text-subtle mt-0.5">Giltig till {fmtDate(docGiltigTill)}</p>
          )}
        </div>
      </header>

      {/* Title */}
      <section>
        <h1 className="text-2xl font-semibold text-fg leading-tight">{docTitel}</h1>
        {docBesk && (
          <p className="text-sm text-muted mt-2 whitespace-pre-line">{docBesk}</p>
        )}
      </section>

      {/* Customer + project */}
      <section className="grid sm:grid-cols-2 gap-5">
        {kund && (
          <div>
            <p className="text-[11px] uppercase tracking-widest text-subtle mb-1.5">Kund</p>
            <p className="text-sm text-fg font-medium">{kund.namn}</p>
            {kund.org_nummer && <p className="text-xs text-muted">Org. {kund.org_nummer}</p>}
            {kund.email && <p className="text-xs text-muted">{kund.email}</p>}
            {kund.telefon && <p className="text-xs text-muted">{kund.telefon}</p>}
          </div>
        )}
        {projektNamn && (
          <div>
            <p className="text-[11px] uppercase tracking-widest text-subtle mb-1.5">Projekt</p>
            <p className="text-sm text-fg font-medium">{projektNamn}</p>
            {projektNummer && (
              <p className="text-xs text-muted font-mono">{projektNummer}</p>
            )}
          </div>
        )}
      </section>

      {/* Lines */}
      <section>
        <p className="text-[11px] uppercase tracking-widest text-subtle mb-2.5">
          {doc_typ === 'forslag' ? 'Specifikation' : 'Rader'}
        </p>
        {doc_typ === 'forslag'
          ? <ForslagLines faser={lines as ForslagFas[]} valuta={valuta} />
          : <OrderRows rader={lines as OrderRad[]} valuta={valuta} />
        }
      </section>

      {/* Totals */}
      <section className="border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-x-6 max-w-md ml-auto text-sm">
          <span className="text-muted py-1">Netto</span>
          <span className="text-right font-mono text-fg py-1">{fmtCurrency(totals.netto, valuta)}</span>
          <span className="text-muted py-1">Moms</span>
          <span className="text-right font-mono text-fg py-1">{fmtCurrency(totals.moms, valuta)}</span>
          <span className="text-fg font-semibold border-t border-border pt-2 mt-1">Att betala</span>
          <span className="text-right font-mono text-fg font-semibold border-t border-border pt-2 mt-1 text-lg">
            {fmtCurrency(totals.total, valuta)}
          </span>
        </div>
      </section>
    </article>
  )
}

interface ForslagArbete { id: string; beskrivning: string; antal_timmar: number; timpris: number }
interface ForslagMaterial { id: string; beskrivning: string; enhet: string; antal: number; a_pris: number }
interface ForslagUE { id: string; namn: string; beskrivning: string | null; kostnad: number; inkl_material: boolean }
interface ForslagSubfas {
  id: string; namn: string; beskrivning: string | null
  arbete: ForslagArbete[]; material: ForslagMaterial[]; underentreprenorer: ForslagUE[]
}
interface ForslagFas { id: string; namn: string; beskrivning: string | null; subfaser: ForslagSubfas[] }
interface OrderRad { id: string; beskrivning: string; antal: number; enhet: string; a_pris: number; belopp: number }

function subfasSum(sf: ForslagSubfas): number {
  let s = 0
  for (const a of sf.arbete)              s += Number(a.antal_timmar) * Number(a.timpris)
  for (const m of sf.material)            s += Number(m.antal) * Number(m.a_pris)
  for (const u of sf.underentreprenorer)  s += Number(u.kostnad)
  return s
}

function computeForslagTotals(faser: ForslagFas[], momsProcent: number) {
  let netto = 0
  for (const f of faser) for (const sf of f.subfaser) netto += subfasSum(sf)
  const moms = netto * (momsProcent / 100)
  return { netto, moms, total: netto + moms }
}

function ForslagLines({ faser, valuta }: { faser: ForslagFas[]; valuta: string }) {
  if (faser.length === 0) return <p className="text-sm text-muted">Inga rader</p>
  return (
    <div className="space-y-4">
      {faser.map(fas => {
        const fasSum = fas.subfaser.reduce((s, sf) => s + subfasSum(sf), 0)
        return (
          <div key={fas.id} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-elevated/50 border-b border-border">
              <div className="min-w-0 pr-3">
                <p className="text-sm font-semibold text-fg">{fas.namn || '—'}</p>
                {fas.beskrivning && <p className="text-[11px] text-subtle">{fas.beskrivning}</p>}
              </div>
              <span className="text-sm font-mono font-semibold text-fg shrink-0">{fmtCurrency(fasSum, valuta)}</span>
            </div>
            {fas.subfaser.map((sf, idx) => {
              const sfSum = subfasSum(sf)
              const isEmpty = sf.arbete.length === 0 && sf.material.length === 0 && sf.underentreprenorer.length === 0
              if (isEmpty) return null
              return (
                <div key={sf.id} className={idx > 0 ? 'border-t border-border' : ''}>
                  <div className="flex items-center justify-between px-4 py-2 bg-elevated/20">
                    <p className="text-xs font-medium text-fg">{sf.namn || '—'}</p>
                    <span className="text-xs font-mono text-muted shrink-0">{fmtCurrency(sfSum, valuta)}</span>
                  </div>
                  {sf.arbete.length > 0 && (
                    <ul className="divide-y divide-border/60">
                      {sf.arbete.map(a => (
                        <li key={a.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                          <span className="text-muted truncate pr-3">{a.beskrivning || 'Arbete'}</span>
                          <span className="text-subtle font-mono shrink-0">
                            {a.antal_timmar} h × {fmtCurrency(a.timpris, valuta)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sf.material.length > 0 && (
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                      {sf.material.map(m => (
                        <li key={m.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                          <span className="text-muted truncate pr-3">{m.beskrivning || 'Material'}</span>
                          <span className="text-subtle font-mono shrink-0">
                            {m.antal} {m.enhet} × {fmtCurrency(m.a_pris, valuta)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {sf.underentreprenorer.length > 0 && (
                    <ul className="divide-y divide-border/60 border-t border-border/60">
                      {sf.underentreprenorer.map(u => (
                        <li key={u.id} className="px-4 py-1.5 flex items-center justify-between text-xs">
                          <span className="text-muted truncate pr-3">UE: {u.namn || '—'}</span>
                          <span className="text-subtle font-mono shrink-0">{fmtCurrency(u.kostnad, valuta)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function OrderRows({ rader, valuta }: { rader: OrderRad[]; valuta: string }) {
  if (rader.length === 0) return <p className="text-sm text-muted">Inga rader</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-[10px] uppercase tracking-wider text-subtle">
          <th className="text-left pb-2 font-medium">Beskrivning</th>
          <th className="text-right pb-2 font-medium w-16">Antal</th>
          <th className="text-left pb-2 font-medium w-16">Enhet</th>
          <th className="text-right pb-2 font-medium w-24">À-pris</th>
          <th className="text-right pb-2 font-medium w-28">Belopp</th>
        </tr>
      </thead>
      <tbody>
        {rader.map(r => (
          <tr key={r.id} className="border-b border-border/40">
            <td className="py-2 text-fg">{r.beskrivning}</td>
            <td className="py-2 text-right font-mono text-muted">{r.antal}</td>
            <td className="py-2 text-muted">{r.enhet}</td>
            <td className="py-2 text-right font-mono text-muted">{fmtCurrency(r.a_pris, valuta)}</td>
            <td className="py-2 text-right font-mono text-fg">{fmtCurrency(r.belopp, valuta)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
