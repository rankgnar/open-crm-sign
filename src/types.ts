export type SigningStatus = 'ok' | 'expired' | 'revoked' | 'signed' | 'not_found'
export type DokumentTyp = 'forslag' | 'order' | 'ata' | 'fritt'

export interface AndringEntry {
  at:     string
  reason: string
}

export interface SigningPayload {
  status:        SigningStatus
  doc_typ:       DokumentTyp
  doc:           Record<string, unknown>
  lines:         unknown[]
  kund:          { namn: string; org_nummer: string | null; email: string | null; telefon: string | null } | null
  projekt:       Record<string, unknown> | null
  foretag: {
    foretag_namn:        string | null
    foretag_org_nummer:  string | null
    foretag_adress:      string | null
    foretag_postnummer:  string | null
    foretag_stad:        string | null
    foretag_telefon:     string | null
    foretag_email:       string | null
    foretag_webbadress:  string | null
    foretag_logo_url:    string | null
    valuta:              string | null
  }
  gar_ut_at:        string
  kund_email:             string | null
  request_ip:             string | null
  signerad_at:            string | null
  signerad_namn:          string | null
  signerad_ip:            string | null
  signerad_personnummer:  string | null
  signerad_metod:         string | null
  signerad_dokument_hash: string | null
  andring_begard_at:      string | null
  andring_historik:       AndringEntry[]
  document_pdf_url:       string | null
  final_document_pdf_url: string | null
  signed_pdf_url:         string | null
}
