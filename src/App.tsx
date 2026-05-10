import { useEffect, useState } from 'react'
import { Sun, Moon, Check, AlertCircle, ShieldCheck, Loader2, FileDown, ChevronDown, MessageSquarePlus, Edit3, Send } from 'lucide-react'
import { supabase } from './lib/supabase'
import { useTheme } from './lib/theme'
import { useBrandingInjector } from './lib/branding'
import { fmtDate, fmtDateTime } from './lib/format'
import { DocumentRender } from './components/DocumentRender'
import { SignaturePad } from './components/SignaturePad'
import { PdfViewer } from './components/PdfViewer'
import { appendSignaturePage, sha256Hex } from './lib/pdf'
import type { SigningPayload, SigningStatus } from './types'

type ViewState =
  | { kind: 'loading' }
  | { kind: 'no_token' }
  | { kind: 'error'; status: SigningStatus; payload?: SigningPayload }
  | { kind: 'ready'; payload: SigningPayload }
  | { kind: 'signed_local'; payload: SigningPayload; namn: string; pdfUrl: string | null }
  | { kind: 'andring_submitted'; payload: SigningPayload }

function tokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const u = new URL(window.location.href)
  return u.searchParams.get('t')
}

// Swedish personnummer: 10 or 12 digits with a '-' separator. The input
// strips non-digits and inserts the hyphen so the user always sees
// YYMMDD-XXXX (or YYYYMMDD-XXXX when more than 10 digits are entered).
function formatPersonnummer(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 12)
  if (digits.length <= 6) return digits
  if (digits.length <= 10) return `${digits.slice(0, 6)}-${digits.slice(6)}`
  return `${digits.slice(0, 8)}-${digits.slice(8)}`
}

function isValidPersonnummer(input: string): boolean {
  return /^(\d{6}|\d{8})-\d{4}$/.test(input.trim())
}

export function App() {
  useBrandingInjector()
  const [state, setState] = useState<ViewState>({ kind: 'loading' })
  const { theme, toggle } = useTheme()
  const [namn, setNamn] = useState('')
  const [personnummer, setPersonnummer] = useState('')
  const [signature, setSignature] = useState<string | null>(null)
  const [intygar, setIntygar] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [andringSheetOpen, setAndringSheetOpen] = useState(false)
  const [andringReason, setAndringReason] = useState('')
  const [andringError, setAndringError] = useState('')
  const [andringSubmitting, setAndringSubmitting] = useState(false)
  const [showHistorik, setShowHistorik] = useState(false)

  useEffect(() => {
    const token = tokenFromUrl()
    if (!token) { setState({ kind: 'no_token' }); return }
    void (async () => {
      const { data, error } = await supabase.rpc('get_signing_doc', { p_token: token })
      if (error || !data) {
        setState({ kind: 'error', status: 'not_found' })
        return
      }
      const payload = data as SigningPayload
      if (payload.status === 'ok') {
        setState({ kind: 'ready', payload })
      } else {
        setState({ kind: 'error', status: payload.status, payload })
      }
    })()
  }, [])

  async function handleSign() {
    const token = tokenFromUrl()
    if (!token) return
    setSubmitError('')
    if (!namn.trim())         { setSubmitError('Ange ditt fullständiga namn'); return }
    if (!isValidPersonnummer(personnummer)) {
      setSubmitError('Ange ett giltigt personnummer (YYYYMMDD-XXXX)'); return
    }
    if (!signature)           { setSubmitError('Signera först i rutan ovan'); return }
    if (!intygar)             { setSubmitError('Du måste intyga att du är behörig'); return }
    if (state.kind !== 'ready') return
    setSubmitting(true)
    try {
      // 1. Build the signed PDF: stamp a legal audit block on the official
      //    document PDF and upload to signed-docs. The hash is computed from
      //    the source bytes so the stamp asserts integrity at sign time.
      let pdfUrl: string | null = null
      let documentHash = ''
      // Prefer the Slutlig (final) version when the admin pre-rendered it.
      // Falls back to document_pdf_url for older links and tenants whose mall
      // has no second portada title configured.
      const documentPdfUrl = state.payload.final_document_pdf_url ?? state.payload.document_pdf_url
      if (documentPdfUrl) {
        try {
          const sourceBuf = await fetch(documentPdfUrl).then(r => r.arrayBuffer())
          documentHash = await sha256Hex(sourceBuf)

          const signedBlob = await appendSignaturePage({
            documentPdfUrl,
            signature,
            signerName:         namn.trim(),
            signerPersonnummer: personnummer.trim(),
            signerEmail:        state.payload.kund_email ?? state.payload.kund?.email ?? '',
            signerIp:           state.payload.request_ip ?? '',
            signedAt:           new Date(),
            docCode:            token,
            documentHash,
            metod:              'Signerad via e-postlänk',
          })
          const path = `${token}/signed.pdf`
          const { error: upErr } = await supabase.storage
            .from('signed-docs')
            .upload(path, signedBlob, { contentType: 'application/pdf', upsert: true })
          if (upErr) {
            console.error('Signed PDF upload failed:', upErr)
          } else {
            const { data: { publicUrl } } = supabase.storage.from('signed-docs').getPublicUrl(path)
            pdfUrl = publicUrl
          }
        } catch (err) {
          console.error('Signed PDF generation failed:', err)
        }
      } else {
        console.warn('document_pdf_url saknas — signed PDF skapas inte')
      }

      // 2. Submit signature with the (optional) PDF URL.
      const { data, error } = await supabase.rpc('submit_signature', {
        p_token:         token,
        p_namn:          namn.trim(),
        p_signatur:      signature,
        p_ua:            navigator.userAgent,
        p_pdf_url:       pdfUrl,
        p_personnummer:  personnummer.trim(),
        p_dokument_hash: documentHash || null,
      })
      if (error) { setSubmitError(error.message); return }
      const result = data as { status: SigningStatus }
      if (result.status === 'signed') {
        setState({ kind: 'signed_local', payload: state.payload, namn: namn.trim(), pdfUrl })
      } else {
        setSubmitError(`Kunde inte slutföra signaturen (${result.status})`)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAndringSubmit() {
    const token = tokenFromUrl()
    if (!token) return
    setAndringError('')
    if (andringReason.trim().length < 5) {
      setAndringError('Beskriv minst kort vad du vill ändra (minst 5 tecken).')
      return
    }
    if (state.kind !== 'ready') return
    setAndringSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('request_signature_changes', {
        p_token:  token,
        p_reason: andringReason.trim(),
        p_ua:     navigator.userAgent,
      })
      if (error) { setAndringError(error.message); return }
      const result = data as { status: string }
      if (result.status === 'received') {
        setState({ kind: 'andring_submitted', payload: state.payload })
      } else if (result.status === 'invalid_reason') {
        setAndringError('Beskriv minst kort vad du vill ändra (minst 5 tecken).')
      } else {
        setAndringError(`Kunde inte skicka begäran (${result.status})`)
      }
    } finally {
      setAndringSubmitting(false)
    }
  }

  const payload =
    state.kind === 'ready' || state.kind === 'signed_local' || state.kind === 'andring_submitted'
      ? state.payload
      : state.kind === 'error'
      ? state.payload
      : null
  const logoSrc = payload?.foretag?.foretag_logo_url || null
  const foretagNamn = payload?.foretag?.foretag_namn || null

  return (
    <div className="min-h-screen bg-bg text-fg flex flex-col">
      <header className="px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center min-w-0">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={foretagNamn ?? 'Logotyp'}
              className="max-h-8 max-w-[180px] object-contain"
            />
          ) : foretagNamn ? (
            <span className="text-sm font-semibold text-fg truncate">{foretagNamn}</span>
          ) : (
            <img
              src="/branding/logo-opencrm-icon.png"
              alt="OpenCRM"
              className="max-h-8 w-auto object-contain"
            />
          )}
        </div>
        <button
          onClick={toggle}
          className="text-muted hover:text-fg transition-colors p-1.5"
          title={theme === 'dark' ? 'Ljust läge' : 'Mörkt läge'}
          aria-label="Tema"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        {state.kind === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-muted py-20">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Laddar dokument…</span>
          </div>
        )}

        {state.kind === 'no_token' && <ErrorCard title="Saknar länk" body="Den här sidan kan endast nås via en signaturlänk från avsändaren." />}

        {state.kind === 'error' && state.status === 'not_found' && (
          <ErrorCard title="Länken hittades inte" body="Kontrollera adressen eller be avsändaren skicka en ny länk." />
        )}
        {state.kind === 'error' && state.status === 'expired' && (
          <ErrorCard title="Länken har gått ut" body="Be avsändaren skicka en ny länk." />
        )}
        {state.kind === 'error' && state.status === 'revoked' && (
          <ErrorCard title="Länken är återkallad" body="Den här signaturlänken är inte längre giltig." />
        )}
        {state.kind === 'error' && state.status === 'signed' && state.payload && (
          <SuccessCard
            title="Redan signerad"
            body={`Dokumentet signerades av ${state.payload.signerad_namn ?? '—'} den ${fmtDateTime(state.payload.signerad_at)}.`}
          />
        )}

        {state.kind === 'signed_local' && (
          <SuccessCard
            title="Tack — signaturen har registrerats"
            body={`Vi har skickat en bekräftelse till din e-post. ${state.namn}, du har signerat ${
              state.payload.doc_typ === 'forslag' ? 'offerten' :
              state.payload.doc_typ === 'ata'     ? 'ÄTA-arbetet' :
              'ordern'
            } ${(state.payload.doc.forslag_nummer ?? state.payload.doc.order_nummer ?? state.payload.doc.ata_nummer) as string}.`}
            pdfUrl={state.pdfUrl}
          />
        )}

        {state.kind === 'andring_submitted' && (
          <SuccessCard
            title="Tack — vi har mottagit dina synpunkter"
            body="Vi går igenom dina ändringar och återkommer med en uppdaterad version. Du behöver inte göra något mer just nu."
          />
        )}

        {state.kind === 'ready' && (
          <div className="space-y-6 pb-24">
            {(state.payload.doc_typ === 'forslag' || state.payload.doc_typ === 'fritt') && state.payload.andring_historik.length > 0 && (
              <section className="card p-4 bg-warn-soft border border-warn/30">
                <button
                  type="button"
                  onClick={() => setShowHistorik(s => !s)}
                  className="w-full flex items-center justify-between gap-2 text-left"
                >
                  <div className="flex items-center gap-2 text-warn">
                    <Edit3 size={14} />
                    <span className="text-xs font-medium">
                      {state.payload.andring_begard_at
                        ? 'Du har begärt ändringar — vi arbetar på en uppdaterad version'
                        : `Tidigare begäran om ändring (${state.payload.andring_historik.length})`}
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-warn transition-transform ${showHistorik ? 'rotate-180' : ''}`} />
                </button>
                {showHistorik && (
                  <ul className="mt-3 space-y-3 border-t border-warn/20 pt-3">
                    {[...state.payload.andring_historik].reverse().map((entry, i) => (
                      <li key={i} className="text-xs text-fg">
                        <p className="text-[11px] text-muted mb-1">{fmtDateTime(entry.at)}</p>
                        <p className="whitespace-pre-wrap">{entry.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {state.payload.document_pdf_url ? (
              <section className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-elevated/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-subtle">Dokument att signera</p>
                  <a
                    href={state.payload.document_pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted hover:text-fg transition-colors inline-flex items-center gap-1"
                  >
                    <FileDown size={12} />Öppna i nytt fönster
                  </a>
                </div>
                <PdfViewer url={state.payload.document_pdf_url} />
              </section>
            ) : (
              <div className="card p-4 text-xs text-muted bg-warn-soft border border-warn/30">
                <p className="font-medium text-warn mb-1">Dokumentet förbereds…</p>
                <p>Vänta några sekunder och ladda om sidan. Om problemet kvarstår, kontakta avsändaren.</p>
                <DocumentRender payload={state.payload} />
              </div>
            )}
          </div>
        )}
      </main>

      {state.kind === 'ready' && (
        <>
          {(state.payload.doc_typ === 'forslag' || state.payload.doc_typ === 'fritt') && (
            <button
              type="button"
              onClick={() => setAndringSheetOpen(true)}
              aria-expanded={andringSheetOpen}
              aria-controls="andring-sheet"
              className={`fixed bottom-[5.25rem] right-4 sm:bottom-[5.75rem] sm:right-6 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-elevated/80 backdrop-blur text-muted hover:text-fg text-xs font-medium border border-border transition-all ${(sheetOpen || andringSheetOpen) ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100'}`}
            >
              <MessageSquarePlus size={13} />
              Begär ändring istället
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (state.payload.andring_begard_at) return
              setSheetOpen(true)
            }}
            aria-expanded={sheetOpen}
            aria-controls="signatur-sheet"
            disabled={!!state.payload.andring_begard_at}
            title={state.payload.andring_begard_at ? 'Vi arbetar på dina ändringar — uppdaterad version skickas snart' : undefined}
            className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-30 inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-semibold shadow-lg shadow-black/30 transition-all ${
              state.payload.andring_begard_at
                ? 'bg-elevated text-subtle cursor-not-allowed border border-border'
                : 'bg-accent text-accent-fg hover:bg-accent-hover'
            } ${sheetOpen || andringSheetOpen ? 'opacity-0 pointer-events-none translate-y-2' : 'opacity-100'}`}
          >
            <ShieldCheck size={16} />
            Signera digitalt
          </button>

          <div
            aria-hidden
            onClick={() => setSheetOpen(false)}
            className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${sheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          />

          <div
            id="signatur-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Signera dokumentet"
            className={`fixed bottom-0 inset-x-0 z-50 max-w-2xl mx-auto bg-bg border-t border-x border-border rounded-t-2xl shadow-2xl shadow-black/40 max-h-[90vh] flex flex-col transition-transform duration-200 ${sheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
              <div>
                <h2 className="text-sm font-semibold text-fg">Signera digitalt</h2>
                <p className="text-[11px] text-muted mt-0.5">
                  Giltigt till {fmtDate(state.payload.gar_ut_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="p-2 -mr-2 text-muted hover:text-fg transition-colors"
                aria-label="Minimera"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
              <p className="text-xs text-muted">
                Genom att signera bekräftar du att du har granskat och godkänner dokumentet.
              </p>

              <div>
                <label className="text-xs text-muted block mb-1.5">Fullständigt namn</label>
                <input
                  type="text"
                  className="input"
                  value={namn}
                  onChange={(e) => setNamn(e.target.value)}
                  placeholder="För- och efternamn"
                  autoComplete="name"
                />
              </div>

              <div>
                <label className="text-xs text-muted block mb-1.5">Personnummer</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input"
                  value={personnummer}
                  onChange={(e) => setPersonnummer(formatPersonnummer(e.target.value))}
                  placeholder="YYMMDD-XXXX"
                  autoComplete="off"
                  maxLength={13}
                />
              </div>

              <SignaturePad onChange={setSignature} />

              <label className="flex items-start gap-2 text-xs text-muted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={intygar}
                  onChange={(e) => setIntygar(e.target.checked)}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  Jag intygar att jag är behörig att signera detta dokument för
                  {state.payload.kund?.namn ? ` ${state.payload.kund.namn}` : ' kunden'} och
                  godkänner innehållet.
                </span>
              </label>

              {submitError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger-soft text-danger text-xs">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <button
                onClick={handleSign}
                disabled={submitting || !namn.trim() || !isValidPersonnummer(personnummer) || !signature || !intygar}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {submitting ? 'Registrerar…' : 'Signera digitalt'}
              </button>

              <p className="text-[11px] text-subtle text-center">
                IP-adress, tidpunkt och webbläsarinformation registreras som en del av audit-spåret.
              </p>
            </div>
          </div>

          {(state.payload.doc_typ === 'forslag' || state.payload.doc_typ === 'fritt') && (
            <>
              <div
                aria-hidden
                onClick={() => setAndringSheetOpen(false)}
                className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity ${andringSheetOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              />

              <div
                id="andring-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Begär ändring"
                className={`fixed bottom-0 inset-x-0 z-50 max-w-2xl mx-auto bg-bg border-t border-x border-border rounded-t-2xl shadow-2xl shadow-black/40 max-h-[90vh] flex flex-col transition-transform duration-200 ${andringSheetOpen ? 'translate-y-0' : 'translate-y-full'}`}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                  <div>
                    <h2 className="text-sm font-semibold text-fg">Begär ändring</h2>
                    <p className="text-[11px] text-muted mt-0.5">
                      Beskriv vad du vill ändra. Vi återkommer med en uppdaterad version.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAndringSheetOpen(false)}
                    className="p-2 -mr-2 text-muted hover:text-fg transition-colors"
                    aria-label="Minimera"
                  >
                    <ChevronDown size={18} />
                  </button>
                </div>

                <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
                  <div>
                    <label className="text-xs text-muted block mb-1.5">Vad vill du ändra?</label>
                    <textarea
                      className="input min-h-[140px] resize-y"
                      value={andringReason}
                      onChange={(e) => setAndringReason(e.target.value)}
                      placeholder="T.ex. ändra kvantitet på material, justera tidsplan, korrigera adress…"
                      maxLength={2000}
                    />
                    <p className="text-[11px] text-subtle mt-1.5">
                      {andringReason.trim().length}/2000 tecken
                    </p>
                  </div>

                  {andringError && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger-soft text-danger text-xs">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      <span>{andringError}</span>
                    </div>
                  )}

                  <button
                    onClick={handleAndringSubmit}
                    disabled={andringSubmitting || andringReason.trim().length < 5}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {andringSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {andringSubmitting ? 'Skickar…' : 'Skicka begäran'}
                  </button>

                  <p className="text-[11px] text-subtle text-center">
                    Endast avsändaren får ditt meddelande. Du behöver inte signera nu.
                  </p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card p-8 text-center space-y-3">
      <AlertCircle size={32} className="mx-auto text-warn" />
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
    </div>
  )
}

function SuccessCard({ title, body, pdfUrl }: { title: string; body: string; pdfUrl?: string | null }) {
  return (
    <div className="card p-8 text-center space-y-4">
      <div className="mx-auto h-12 w-12 rounded-full bg-success-soft text-success flex items-center justify-center">
        <Check size={24} />
      </div>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="text-sm text-muted">{body}</p>
      {pdfUrl ? (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          download
          className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-lg bg-accent text-accent-fg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          <FileDown size={15} />
          Ladda ner signerat PDF
        </a>
      ) : pdfUrl === null ? (
        <p className="text-[11px] text-subtle italic">
          Det signerade dokumentet är registrerat i CRM:et men PDF-kopian kunde inte genereras.
        </p>
      ) : null}
    </div>
  )
}
