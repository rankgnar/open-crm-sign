import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

interface Args {
  documentPdfUrl: string
  signature:      string         // data URL of the canvas
  signerName:     string
  signerPersonnummer: string     // Swedish personal ID, may be empty
  signerEmail:    string         // recipient email the link was sent to
  signerIp:       string         // client IP — '—' if not available
  signedAt:       Date
  docCode:        string         // short code printed on every page footer
  documentHash:   string         // SHA-256 hex of the source PDF bytes
  metod:          string         // e.g. 'Signerad via e-postlänk'
}

/**
 * Stamp the customer's signature + legal audit block on the bottom of the
 * document's existing last page, add a "Sida X av Y · DOC-..." footer on every
 * page, and return the resulting Blob. The original pages are preserved
 * unchanged — we only OVERLAY on top.
 */
export async function appendSignaturePage({
  documentPdfUrl, signature, signerName, signerPersonnummer, signerEmail, signerIp,
  signedAt, docCode, documentHash, metod,
}: Args): Promise<Blob> {
  const sourceBytes = await fetch(documentPdfUrl).then(r => {
    if (!r.ok) throw new Error(`Kunde inte hämta dokumentet: ${r.status}`)
    return r.arrayBuffer()
  })

  const pdfDoc = await PDFDocument.load(sourceBytes, { updateMetadata: true })
  const helv     = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const sigBase64 = signature.split(',')[1] ?? ''
  const sigBytes = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0))
  const sigImage = await pdfDoc.embedPng(sigBytes)

  const pages = pdfDoc.getPages()
  const pageCount = pages.length
  const margin = 36

  // ── Footer "Sida X av Y · DOC-XXXX" on every page ────────────────────────
  const cleanCode = (docCode || 'DOC').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()
  for (let i = 0; i < pageCount; i++) {
    const page = pages[i]
    const { width } = page.getSize()
    const txt = `Sida ${i + 1} av ${pageCount} · DOC-${cleanCode}`
    const w = helv.widthOfTextAtSize(txt, 7)
    page.drawText(txt, {
      x: width - margin - w, y: 14,
      size: 7, font: helv, color: rgb(0.55, 0.55, 0.6),
    })
  }

  // ── Signature stamp at the bottom of the LAST existing page ──────────────
  const last = pages[pageCount - 1]
  const { width: PW } = last.getSize()
  const blockH = 130                              // taller block to fit legal lines
  const yBase = margin + 8
  const yTop  = yBase + blockH

  last.drawLine({
    start: { x: margin, y: yTop },
    end:   { x: PW - margin, y: yTop },
    thickness: 0.5, color: rgb(0.78, 0.82, 0.85),
  })

  const grey = rgb(0.4, 0.4, 0.45)
  const subtle = rgb(0.55, 0.55, 0.6)
  const ink = rgb(0.1, 0.1, 0.12)

  // Heading
  last.drawText('Digital signatur', {
    x: margin, y: yTop - 14,
    size: 9, font: helvBold, color: rgb(0.06, 0.68, 0.5),
  })

  // Signer name
  last.drawText(signerName, {
    x: margin, y: yTop - 32,
    size: 11, font: helvBold, color: ink,
  })

  // Personnummer (only if provided)
  let cursorY = yTop - 48
  if (signerPersonnummer && signerPersonnummer.trim()) {
    last.drawText(`Personnummer: ${signerPersonnummer.trim()}`, {
      x: margin, y: cursorY,
      size: 9, font: helv, color: grey,
    })
    cursorY -= 14
  }

  // Date + time
  last.drawText(
    signedAt.toLocaleString('sv-SE', { dateStyle: 'long', timeStyle: 'short' }) + ' (CET)',
    { x: margin, y: cursorY, size: 9, font: helv, color: grey }
  )
  cursorY -= 14

  // Email · IP
  last.drawText(
    `E-post: ${signerEmail || '—'}   ·   IP: ${signerIp || '—'}`,
    { x: margin, y: cursorY, size: 8, font: helv, color: grey }
  )
  cursorY -= 12

  // Method
  last.drawText(`Metod: ${metod}`, {
    x: margin, y: cursorY,
    size: 8, font: helv, color: grey,
  })
  cursorY -= 12

  // Document hash (truncated to 16 chars to fit on one line)
  if (documentHash) {
    const shortHash = documentHash.length > 32
      ? `${documentHash.slice(0, 16)}…${documentHash.slice(-8)}`
      : documentHash
    last.drawText(`Hash (SHA-256): ${shortHash}`, {
      x: margin, y: cursorY,
      size: 7.5, font: helv, color: subtle,
    })
  }

  // ── Right column: signature image with "Underskrift" caption ─────────────
  const targetW = 160, targetH = 60
  const scale = Math.min(targetW / sigImage.width, targetH / sigImage.height)
  const sigW = sigImage.width * scale, sigH = sigImage.height * scale
  const sigX = PW - margin - sigW
  const sigY = yBase + 30
  last.drawImage(sigImage, { x: sigX, y: sigY, width: sigW, height: sigH })
  last.drawLine({
    start: { x: PW - margin - targetW, y: sigY - 2 },
    end:   { x: PW - margin, y: sigY - 2 },
    thickness: 0.4, color: rgb(0.7, 0.7, 0.74),
  })
  last.drawText('Underskrift', {
    x: PW - margin - 60, y: sigY - 12,
    size: 7, font: helv, color: subtle,
  })

  const out = await pdfDoc.save()
  return new Blob([out], { type: 'application/pdf' })
}

/** SHA-256 hex digest of an ArrayBuffer using the browser SubtleCrypto API. */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
