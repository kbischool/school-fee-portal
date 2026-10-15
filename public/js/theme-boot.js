// Runs before first paint so the page never flashes the wrong theme.
(function () {
  try {
    var t = localStorage.getItem('kbis-theme');
    if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { document.documentElement.setAttribute('data-theme', 'light'); }
})();
