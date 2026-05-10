# open-crm-sign

> Digital signing portal for open-crm — customer document signing flow with PDF stamping.

Part of the [open-crm](https://github.com/rankgnar/open-crm) ecosystem. A lightweight web app that handles the complete digital signature flow: the customer opens a signing link, reviews the document, signs, and receives a stamped PDF.

**Website:** [open-crm.org](https://open-crm.org)  
**License:** [MIT](LICENSE)

---

## Features

- Token-based signing links (no account required)
- In-browser signature capture
- PDF stamping with signature and timestamp
- Signature status tracking (pending / signed / expired)
- Works on mobile and desktop

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5 |
| Build | Vite 6 |
| Styling | Tailwind CSS v4 |
| Data | Supabase (`@supabase/supabase-js`) |
| Hosting | Vercel |

---

## Getting started

```bash
git clone https://github.com/rankgnar/open-crm-sign.git
cd open-crm-sign
npm install
```

Copy `.env.example` to `.env`:

```
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

```bash
npm run dev       # http://localhost:5173
npm run build
npm run typecheck
```

---

## How it works

1. The desktop CRM ([open-crm](https://github.com/rankgnar/open-crm)) generates a unique signing token and sends the link to the customer by email.
2. The customer opens the link in this portal, which validates the token against Supabase.
3. After signing, the portal stamps the PDF and records the signature.
4. The admin sees the updated status in the desktop app.

---

## License

[MIT](LICENSE)
