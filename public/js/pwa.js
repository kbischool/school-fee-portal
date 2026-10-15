// Lets the portal be added to a phone's home screen and keeps it working offline-ish.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
