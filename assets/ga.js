/* ===========================================================
   Google アナリティクス（GA4）の呼び出し

   もともと各ページの <head> に直接書いていたものを、
   この 1 ファイルにまとめました。

   こうしておくと Content-Security-Policy（読み込みを許す先の
   制限）で「ページに直接書いたスクリプトは動かさない」という
   強い設定にでき、万一ページに不正な記述を差し込まれても
   実行されずに済みます。

   測定 ID を変えるときは、下の 2 か所と、各 HTML の
   googletagmanager.com の行にある id= を書き替えてください。
   =========================================================== */

window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("js", new Date());

gtag("config", "G-ECQSMP1XQQ");
