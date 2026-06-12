import { useEffect } from 'react'

// Swaps the browser tab favicon + title to the Super Admin identity while a
// super-admin page is mounted, then restores the originals on unmount.
export function useAdminTab() {
  useEffect(() => {
    let link = document.querySelector("link[rel='icon']")
    const created = !link
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'icon')
      document.head.appendChild(link)
    }
    const prevHref = link.getAttribute('href')
    const prevType = link.getAttribute('type')
    const prevTitle = document.title

    link.setAttribute('type', 'image/svg+xml')
    link.setAttribute('href', '/favicon-admin.svg')
    document.title = 'Super Admin — RetailPOS'

    return () => {
      document.title = prevTitle
      if (created) {
        link.remove()
      } else {
        if (prevHref) link.setAttribute('href', prevHref); else link.removeAttribute('href')
        if (prevType) link.setAttribute('type', prevType); else link.removeAttribute('type')
      }
    }
  }, [])
}
