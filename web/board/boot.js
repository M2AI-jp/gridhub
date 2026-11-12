// ことば（冒険 / 開発。CONTRACTS §75）の下ごしらえ。盤面とはじめの画面の <head> で、描く前に読む（module ではない。外のファイルなので CSP と §29.1 の約束のまま）。
// <html data-words="game|dev"> を決めて、2つの言い方を両方書いた HTML（[data-say]）のうち、合うほうだけが最初から見えるようにする。
// 描画前の値を決める: URL の ?words= → Mac のアプリが覚えていることば（window.__gridhubWords。§76.7）→ localStorage の gridhub.words → dev。
(function () {
  var mode = 'dev';
  try {
    var q = new URLSearchParams(location.search).get('words');
    var app = window.__gridhubWords;
    if (q === 'dev' || q === 'game') mode = q;
    else if (app === 'dev' || app === 'game') mode = app;
    else {
      var saved = localStorage.getItem('gridhub.words');
      if (saved === 'dev' || saved === 'game') mode = saved;
    }
  } catch (e) {
    /* URL や localStorage が読めなければ既定 */
  }
  document.documentElement.setAttribute('data-words', mode);
})();
