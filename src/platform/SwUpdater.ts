/**
 * Ensures immediate Service Worker activation & single clean reload when a new
 * deployment takes control (especially important for iOS Safari / Home Screen PWA).
 */
export function mountSwAutoRefresh(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) {
      return;
    }
    reloading = true;
    window.location.reload();
  });

  const checkForSwUpdate = (): void => {
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) => {
        if (!reg) return;
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        return reg.update();
      })
      .catch(() => {
        // Ignore offline / transient network errors
      });
  };

  window.addEventListener('load', checkForSwUpdate, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForSwUpdate();
    }
  });
}
