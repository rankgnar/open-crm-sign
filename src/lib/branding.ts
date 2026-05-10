import { useEffect } from 'react'
import { supabase } from './supabase'

interface BrandingRow {
  branding_favicon_16_url:       string | null
  branding_favicon_32_url:       string | null
  branding_apple_touch_icon_url: string | null
}

export function useBrandingInjector(): void {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('app_installningar')
        .select('branding_favicon_16_url, branding_favicon_32_url, branding_apple_touch_icon_url')
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      const row = data as BrandingRow | null
      if (!row) return
      injectIcon('icon',             '16x16',   'image/png', row.branding_favicon_16_url)
      injectIcon('icon',             '32x32',   'image/png', row.branding_favicon_32_url)
      injectIcon('apple-touch-icon', '180x180', 'image/png', row.branding_apple_touch_icon_url)
    })()
    return () => { cancelled = true }
  }, [])
}

function injectIcon(rel: string, sizes: string, type: string, href: string | null): void {
  if (!href) return
  const selector = `link[rel="${rel}"][sizes="${sizes}"]`
  let link = document.head.querySelector<HTMLLinkElement>(selector)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    link.setAttribute('sizes', sizes)
    document.head.appendChild(link)
  }
  link.type = type
  link.href = href
}
