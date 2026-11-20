// Hell/Dunkel vor dem ersten Zeichnen setzen (Wahl im Browser gespeichert, wie in Books)
(function () {
  var m = null;
  try { m = localStorage.getItem('rss-mode'); } catch (e) {}
  if (m === 'light' || m === 'dark') document.documentElement.dataset.mode = m;
})();
