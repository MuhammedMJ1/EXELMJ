// EXELMJ web edition entry.
//
// Imports run in order: the browser bridge installs window.exelmj first, then
// the very same app as the desktop boots on top of it.
import './webBridge'
import '../main'
import { installPhoneLayout } from './phoneLayout'

installPhoneLayout()

// Offline and installable: the service worker is written by the web build
// (vite.web.config.ts), so the dev server has none.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[web] service worker', err))
  })
}
