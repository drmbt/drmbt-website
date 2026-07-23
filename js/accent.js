// Persisted accent color applied before first paint (falls back to the CSS default).
(() => {
  try {
    const c = localStorage.getItem('drmbt-accent');
    if (c) document.documentElement.style.setProperty('--accent', c);
  } catch {}
})();
