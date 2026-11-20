// Umschalter Automatisch → Hell → Dunkel (Paletten-Symbol in der Kopfzeile)
(function () {
  var NAMES = { auto: 'Automatisch', light: 'Hell', dark: 'Dunkel' };
  var NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  var root = document.documentElement;
  var button = document.querySelector('[data-mode-toggle]');
  if (!button) return;
  var current = function () { return root.dataset.mode || 'auto'; };
  var label = function () {
    var text = 'Darstellung: ' + NAMES[current()] + ' (klicken für ' + NAMES[NEXT[current()]] + ')';
    button.title = text;
    button.setAttribute('aria-label', text);
  };
  button.addEventListener('click', function () {
    var mode = NEXT[current()];
    if (mode === 'auto') delete root.dataset.mode;
    else root.dataset.mode = mode;
    try {
      if (mode === 'auto') localStorage.removeItem('rss-mode');
      else localStorage.setItem('rss-mode', mode);
    } catch (e) {}
    label();
  });
  label();
})();
