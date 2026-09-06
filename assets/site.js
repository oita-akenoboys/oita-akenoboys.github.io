/* ===========================================================
   大分明野ボーイズ 共通スクリプト

   data/*.txt を読み込んでページに描画します。
   テキストの書き方は data/README.txt を参照してください。
   =========================================================== */

(function () {
  "use strict";

  /* ---------- ハンバーガーメニュー ---------- */

  var toggle = document.querySelector(".nav__toggle");
  var nav = document.getElementById("nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.setAttribute("data-open", String(!open));
    });

    // メニュー内のリンクを押したら閉じる
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.setAttribute("data-open", "false");
      }
    });
  }

  /* ---------- テキストデータの読み込み ---------- */

  // 更新がすぐ反映されるようキャッシュを避ける
  function loadText(path) {
    return fetch(path + "?t=" + Date.now(), { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path + " が読み込めませんでした (" + res.status + ")");
      return res.text();
    });
  }

  /* ---------- パーサ ----------
     # 見出し | 補足   … ブロックの始まり
     > コメント        … 注記
     A | B | C        … データ行（項目は「 | 」区切り）
     //で始まる行と空行は無視
  --------------------------------------------------------- */

  function parse(text) {
    var lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
    var blocks = [];
    var current = null;

    function ensure() {
      if (!current) {
        current = { title: "", sub: "", notes: [], rows: [] };
        blocks.push(current);
      }
      return current;
    }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (line === "" || line.indexOf("//") === 0) return;

      if (line.charAt(0) === "#") {
        var head = line.slice(1).split("|");
        current = {
          title: head[0] ? head[0].trim() : "",
          sub: head[1] ? head[1].trim() : "",
          notes: [],
          rows: []
        };
        blocks.push(current);
        return;
      }

      if (line.charAt(0) === ">") {
        ensure().notes.push(line.slice(1).trim());
        return;
      }

      ensure().rows.push(
        line.split("|").map(function (v) {
          return v.trim();
        })
      );
    });

    return blocks;
  }

  /* ---------- DOM 生成のヘルパ ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== "") node.textContent = text;
    return node;
  }

  function showError(target, message) {
    target.textContent = "";
    var box = el("p", "note", message);
    target.appendChild(box);
  }

  function render(targetId, dataPath, renderer) {
    var target = document.getElementById(targetId);
    if (!target) return;

    loadText(dataPath)
      .then(function (text) {
        var blocks = parse(text);
        target.textContent = "";
        renderer(target, blocks);
      })
      .catch(function (err) {
        showError(
          target,
          "データを読み込めませんでした。しばらくしてから再度お試しください。（" +
            err.message +
            "）"
        );
      });
  }

  /* ---------- URL の ?term=21 などを取り出す ---------- */

  function queryParam(name) {
    var m = new RegExp("[?&]" + name + "=([^&]*)").exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }

  /* ---------- 値の判定 ---------- */

  var WIN = /^(〇|○|◯|o|O|勝)$/;
  var LOSE = /^(×|✕|●|x|X|負|敗)$/;
  var SCORE = /^[0-9]+[^0-9]?\s*[-−ー]\s*[0-9]+/;

  function isDate(v) {
    return /^[0-9]{1,4}[.\/年]/.test(v);
  }

  /* ---------- 日付の整形 ---------- */

  function formatDate(v) {
    var m = v.match(/^([0-9]{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
    if (m) return m[1] + "." + m[2] + "." + m[3];
    return v;
  }

  /* =========================================================
     新着情報
     形式: 日付 | 本文 | リンク先（省略可）
     ========================================================= */

  function renderNews(target, blocks, limit) {
    var rows = [];
    blocks.forEach(function (b) {
      rows = rows.concat(b.rows);
    });

    if (!rows.length) {
      target.appendChild(el("p", "empty", "新着情報はまだありません。"));
      return;
    }

    var list = el("ul", "news");
    list.style.listStyle = "none";

    rows.slice(0, limit || rows.length).forEach(function (f) {
      var item = el("li", "news__item");
      item.appendChild(el("time", "news__date", formatDate(f[0] || "")));

      // リンク先が書かれている行だけ本文をリンクにする
      var text = el("p", "news__text");
      if (f[2]) {
        var link = el("a", "news__link", f[1] || "");
        link.setAttribute("href", f[2]);
        text.appendChild(link);
      } else {
        text.textContent = f[1] || "";
      }
      item.appendChild(text);

      list.appendChild(item);
    });

    target.appendChild(list);
  }

  /* =========================================================
     試合速報
     形式: 日付 | 会場 | 試合 | 相手 | スコア | 結果 | 備考
     ========================================================= */

  function buildMatchRow(f) {
    var row = el("div", "match__row");

    // 日付・会場
    var meta = el("div", "match__meta");
    meta.appendChild(el("span", "match__date", formatDate(f[0] || "")));
    if (f[1]) meta.appendChild(el("span", "match__place", f[1]));
    row.appendChild(meta);

    if (f[2]) row.appendChild(el("span", "match__round", f[2]));
    if (f[3]) row.appendChild(el("span", "match__vs", f[3]));

    // 5項目目以降からスコア・勝敗・備考を拾う
    var score = "";
    var result = "";
    var notes = [];

    for (var i = 4; i < f.length; i++) {
      var v = f[i];
      if (!v) continue;
      if (!result && (WIN.test(v) || LOSE.test(v))) result = v;
      else if (!score && SCORE.test(v)) score = v;
      else notes.push(v);
    }

    if (score) row.appendChild(el("span", "match__score", score));

    // 結果もスコアも無い行は「これからの試合」とみなす。
    // スコアだけある行（チーム内対戦など）はバッジを出さない。
    if (result && WIN.test(result)) row.appendChild(el("span", "badge badge--win", "勝"));
    else if (result && LOSE.test(result)) row.appendChild(el("span", "badge badge--lose", "敗"));
    else if (!score) row.appendChild(el("span", "badge badge--tbd", "予定"));

    if (notes.length) row.appendChild(el("span", "match__note", notes.join(" / ")));

    return row;
  }

  function renderLive(target, blocks, limit) {
    var shown = 0;

    blocks.forEach(function (b) {
      if (limit && shown >= limit) return;
      if (!b.title && !b.rows.length) return;

      var card = el("article", "match");
      card.appendChild(el("h3", "match__title", b.title || "試合結果"));

      var body = el("div", "match__body");
      b.rows.forEach(function (f) {
        body.appendChild(buildMatchRow(f));
      });
      b.notes.forEach(function (n) {
        body.appendChild(el("p", "match__comment", n));
      });

      card.appendChild(body);
      target.appendChild(card);
      shown++;
    });

    if (!shown) target.appendChild(el("p", "empty", "試合結果はまだありません。"));
  }

  /* =========================================================
     主な戦績
     形式: # 年 → 大会名 | 成績
     ========================================================= */

  // 区分ごとに色を変えるため、書かれた語をクラス名に置き換える
  var CATEGORIES = {
    県大会: "record__cat--ken",
    九州大会: "record__cat--kyushu",
    全国大会: "record__cat--japan"
  };

  /* compact を立てると行を詰めた表示になる。
     戦績ページは一覧そのものが主役なので通常表示、
     卒団生・選手紹介では名簿への通り道なので詰めた表示にする。 */
  function buildRecordList(rows, compact) {
    var list = el("ul", "record__list" + (compact ? " record__list--compact" : ""));

    rows.forEach(function (f) {
      var name = f[0] || "";
      var result = f[1] || "";
      var category = f[2] || "";
      var cls = "record__item";
      if (/^優勝/.test(result)) cls += " record__item--gold";
      else if (/^準優勝/.test(result)) cls += " record__item--silver";

      var item = el("li", cls);
      if (category) {
        var catCls = "record__cat";
        if (CATEGORIES[category]) catCls += " " + CATEGORIES[category];
        item.appendChild(el("span", catCls, category));
      }
      item.appendChild(el("span", "record__name", name));
      if (result) item.appendChild(el("span", "record__result", result));
      list.appendChild(item);
    });

    return list;
  }

  function renderResults(target, blocks) {
    var count = 0;

    blocks.forEach(function (b) {
      if (!b.rows.length) return;

      var section = el("section", "record");

      if (b.title) {
        var head = el("h3", "record__year", b.title);
        if (b.sub) head.appendChild(el("span", "record__term", b.sub));
        section.appendChild(head);
      }

      section.appendChild(buildRecordList(b.rows));
      target.appendChild(section);
      count += b.rows.length;
    });

    if (!count) target.appendChild(el("p", "empty", "戦績はまだ登録されていません。"));
  }

  /* 戦績は results.txt にまとめてある。
     見出しに「# 2023年 | 18期生」と期を書いておくと、
     卒団生のページからも同じ内容を読み出せる。
     同じ戦績を 2 か所に書かなくて済むようにするための決まりごと。 */
  var awardsCache = null;

  function loadAwards() {
    if (!awardsCache) {
      awardsCache = loadText("data/results.txt")
        .then(function (text) {
          var byTerm = {};
          parse(text).forEach(function (b) {
            var no = b.sub.match(/^([0-9]+)/);
            if (no && b.rows.length) byTerm[no[1]] = { year: b.title, rows: b.rows };
          });
          return byTerm;
        })
        .catch(function () {
          // 戦績が読めなくても、名簿だけは表示できるようにする
          return {};
        });
    }
    return awardsCache;
  }

  /* =========================================================
     スケジュール
     形式: 年.月 | PDFのパス
     ========================================================= */

  function renderSchedule(target, blocks, limit) {
    var rows = [];
    blocks.forEach(function (b) {
      rows = rows.concat(b.rows);
    });

    if (!rows.length) {
      target.appendChild(el("p", "empty", "スケジュールはまだ登録されていません。"));
      return;
    }

    var list = el("ul", "schedule");

    rows.slice(0, limit || rows.length).forEach(function (f) {
      var label = f[0] || "";
      var href = f[1] || "";
      var m = label.match(/^([0-9]{4})[.\/年]\s*([0-9]{1,2})/);

      var link = el("a", "schedule__card");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";

      link.appendChild(el("span", "schedule__icon", "PDF"));

      var box = el("span");
      var month = el("span", "schedule__month", m ? m[2] + "月" : label);
      if (m) month.appendChild(el("span", "schedule__year", m[1] + "年"));
      box.appendChild(month);
      link.appendChild(box);

      var item = el("li");
      item.appendChild(link);
      list.appendChild(item);
    });

    target.appendChild(list);
  }

  /* =========================================================
     期の一覧（選手紹介・卒団生）

     一覧ファイル（players.txt / graduates.txt）には
     「# ○期生 | 補足」の見出しだけを書く。
     戦績と名簿は data/terms/21.txt のように期ごとのファイルに置く。
     こうしておくと、卒団のときは見出し 1 行を players.txt から
     graduates.txt へ移すだけでよく、名簿も写真も動かさずに済む。
     ========================================================= */

  function termPath(no) {
    return "data/terms/" + (no.length < 2 ? "0" + no : no) + ".txt";
  }

  // 期のファイルには見出しを書かないので、名簿の行をひとつにまとめて返す
  function loadTerm(no) {
    return loadText(termPath(no))
      .then(function (text) {
        var rows = [];
        parse(text).forEach(function (b) {
          rows = rows.concat(b.rows);
        });
        return rows;
      })
      .catch(function () {
        // その期のファイルがまだ無いときは、名簿なしとして扱う
        return [];
      });
  }

  function readIndex(blocks) {
    var terms = [];
    blocks.forEach(function (b) {
      if (!b.title) return;
      var no = b.title.match(/^([0-9]+)/);
      if (!no) return;
      terms.push({ no: no[1], title: b.title, sub: b.sub });
    });
    return terms;
  }

  function renderTerms(target, blocks) {
    var terms = readIndex(blocks);

    if (!terms.length) {
      target.appendChild(el("p", "empty", "まだ登録されていません。"));
      return;
    }

    // 人数は期ごとのファイル、戦績は results.txt にあるので、そろってから並べる
    target.appendChild(el("p", "loading", "読み込み中…"));

    Promise.all([
      Promise.all(
        terms.map(function (t) {
          return loadTerm(t.no);
        })
      ),
      loadAwards()
    ]).then(function (res) {
      var list = res[0];
      var awards = res[1];
      target.textContent = "";

      terms.forEach(function (t, i) {
        var roster = list[i];
        var wrap = el("section", "term");

        var link = el("a", "term__head term__head--link");
        link.href = "player.html?term=" + encodeURIComponent(t.no);
        link.appendChild(el("span", "term__no", t.no + "期"));

        var label = el("span", "term__label", t.title);
        if (t.sub) label.appendChild(el("span", "term__year", t.sub));
        link.appendChild(label);

        if (roster.length) {
          link.appendChild(el("span", "term__count", roster.length + "名"));
        }
        link.appendChild(el("span", "term__arrow"));
        wrap.appendChild(link);

        var award = awards[t.no];
        if (award) {
          var body = el("div", "term__body");
          body.appendChild(buildRecordList(award.rows, true));
          wrap.appendChild(body);
        }

        target.appendChild(wrap);
      });
    });
  }

  /* =========================================================
     期の詳細（選手一人ずつを写真付きで並べる）
     形式: 名前 | 中学 | 出身チーム | 背番号 | 写真
     背番号と写真は 4 項目目以降のどこに書いてもよい
     ========================================================= */

  var IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i;

  function playerFields(f) {
    var p = { name: f[0] || "", school: f[1] || "", from: f[2] || "", no: "", photo: "" };

    for (var i = 3; i < f.length; i++) {
      var v = f[i];
      if (!v) continue;
      if (!p.photo && (IMAGE.test(v) || v.indexOf("/") >= 0)) p.photo = v;
      else if (!p.no) p.no = v;
    }

    return p;
  }

  function buildPlayerCard(p) {
    var item = el("li", "pcard");

    var figure = el("div", "pcard__photo");
    if (p.photo) {
      var img = document.createElement("img");
      img.src = p.photo;
      img.alt = p.name;
      img.loading = "lazy";
      img.decoding = "async";
      figure.appendChild(img);
    } else {
      figure.appendChild(el("span", "pcard__noimage", "NO PHOTO"));
    }
    item.appendChild(figure);

    var body = el("div", "pcard__body");

    var name = el("p", "pcard__name");
    if (p.no) name.appendChild(el("span", "pcard__no", p.no));
    name.appendChild(el("span", "pcard__namestr", p.name));
    body.appendChild(name);

    var meta = el("dl", "pcard__meta");
    [["中学", p.school], ["出身チーム", p.from]].forEach(function (pair) {
      if (!pair[1]) return;
      meta.appendChild(el("dt", null, pair[0]));
      meta.appendChild(el("dd", null, pair[1]));
    });
    if (meta.childNodes.length) body.appendChild(meta);

    item.appendChild(body);
    return item;
  }

  /* 詳細ページ player.html?term=21 は、選手紹介と卒団生の両方を兼ねている。
     どちらの一覧に載っている期かで、見出しと戻り先を切り替える。
     こうしておくと、卒団してもその期のアドレスが変わらない。 */
  var SECTIONS = [
    {
      file: "data/players.txt",
      name: "選手紹介",
      en: "Players",
      href: "players.html",
      lead: "大分明野ボーイズの選手紹介です。氏名・背番号・出身中学・出身チームを、顔写真とあわせて掲載しています。",
      about: " の選手紹介。氏名・背番号・出身中学・出身チームを、顔写真とあわせて掲載しています。"
    },
    {
      file: "data/graduates.txt",
      name: "卒団生",
      en: "Graduates",
      href: "graduates.html",
      lead: "大分明野ボーイズを巣立った卒団生の紹介です。氏名・出身中学・出身チームを、顔写真とあわせて掲載しています。",
      about: " の卒団生。氏名・出身中学・出身チームを、顔写真とあわせて掲載しています。"
    }
  ];

  function buildBackLink(section) {
    var box = el("p", "backlink");
    var link = el("a", null, section.name + "の一覧へ戻る");
    link.href = section.href;
    box.appendChild(link);
    return box;
  }

  /* 検索エンジンには期ごとに別ページとして扱ってほしいので、
     canonical・説明文・パンくずを表示中の期に合わせて書き換える */
  function applySection(section, heading, term) {
    var en = document.getElementById("js-term-en");
    if (en) en.textContent = section.en;

    var lead = document.getElementById("js-term-lead");
    if (lead) lead.textContent = section.lead;

    var parent = document.getElementById("js-crumb-parent");
    if (parent) {
      parent.textContent = section.name;
      parent.href = section.href;
    }

    // ヘッダーで今いる場所を示す印も、表示中の期に合わせて付け替える
    var navLinks = document.querySelectorAll(".nav__link");
    for (var n = 0; n < navLinks.length; n++) {
      if (navLinks[n].getAttribute("href") === section.href) {
        navLinks[n].setAttribute("aria-current", "page");
      } else {
        navLinks[n].removeAttribute("aria-current");
      }
    }

    var now = document.querySelector(".crumb__now");
    if (now) now.textContent = heading;

    var canonical = document.querySelector('link[rel="canonical"]');
    var url = "";
    var origin = "";
    if (canonical) {
      url = canonical.href.split("?")[0] + "?term=" + encodeURIComponent(term);
      canonical.href = url;
      origin = url.split("/").slice(0, 3).join("/") + "/";
    }

    var text = "大分明野ボーイズ " + heading + section.about;

    [
      ['meta[name="description"]', text],
      ['meta[property="og:description"]', text],
      ['meta[property="og:title"]', document.title],
      ['meta[property="og:url"]', url]
    ].forEach(function (pair) {
      var node = document.querySelector(pair[0]);
      if (node && pair[1]) node.setAttribute("content", pair[1]);
    });

    var ld = document.querySelector('script[type="application/ld+json"]');
    if (ld && url) {
      try {
        var data = JSON.parse(ld.textContent);
        var items = data.itemListElement;
        items[1].name = section.name;
        items[1].item = origin + section.href;
        items[2].name = heading;
        items[2].item = url;
        ld.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        /* 構造化データの書き換えに失敗しても表示には影響させない */
      }
    }
  }

  function showTermMissing(target) {
    target.textContent = "";
    target.appendChild(el("p", "note", "この期のページは見つかりませんでした。"));
    target.appendChild(buildBackLink(SECTIONS[0]));
  }

  function renderTermDetail(target, term) {
    if (!term) {
      showTermMissing(target);
      return;
    }

    var jobs = SECTIONS.map(function (s) {
      return loadText(s.file)
        .then(parse)
        .catch(function () {
          return [];
        });
    });
    jobs.push(loadTerm(term));

    Promise.all(jobs).then(function (res) {
      var roster = res[res.length - 1];
      var section = null;
      var info = null;

      for (var i = 0; i < SECTIONS.length && !info; i++) {
        readIndex(res[i]).forEach(function (t) {
          if (!info && t.no === term) {
            info = t;
            section = SECTIONS[i];
          }
        });
      }

      if (!info) {
        showTermMissing(target);
        return;
      }

      target.textContent = "";

      var heading = info.title + (info.sub ? "（" + info.sub + "）" : "");
      var titleBox = document.getElementById("js-term-title");
      if (titleBox) titleBox.textContent = heading;
      document.title = heading + " | 大分明野ボーイズ";
      applySection(section, heading, term);

      if (!roster.length) {
        target.appendChild(el("p", "empty", "名簿は準備中です。"));
      } else {
        var cards = el("ul", "pcards");
        roster.forEach(function (f) {
          cards.appendChild(buildPlayerCard(playerFields(f)));
        });
        target.appendChild(cards);
      }

      target.appendChild(buildBackLink(section));
    });
  }

  /* =========================================================
     球団・保護者会
     形式: # 区分 → 役職 | 氏名
     ========================================================= */

  function renderClub(target, blocks) {
    var count = 0;

    blocks.forEach(function (b) {
      if (!b.rows.length) return;

      var card = el("section", "staff");
      if (b.title) card.appendChild(el("h3", "staff__title", b.title));

      var list = el("div", "staff__list");
      var prevRole = null;

      b.rows.forEach(function (f) {
        var role = f[0] || "";
        var name = f[1] || "";
        var row = el("div", "staff__row");
        // 同じ役職が続くときは 2 人目以降の役職名を省く
        row.appendChild(el("span", "staff__role", role === prevRole ? "" : role));
        row.appendChild(el("span", "staff__name", name));
        list.appendChild(row);
        prevRole = role;
        count++;
      });

      card.appendChild(list);
      target.appendChild(card);
    });

    if (!count) target.appendChild(el("p", "empty", "まだ登録されていません。"));
  }

  /* =========================================================
     入団案内
     形式: # 見出し | 種類   種類は 文章 / 日程 / 項目 / PDF
           先頭の「# 公開 | ON」があるときだけ本文を表示する
     ========================================================= */

  var JOIN_SWITCH = /^公開/;

  // 書き忘れ・書き間違いのときは伏せる（募集を止めたい側に倒す）
  function joinIsOpen(blocks) {
    var value = "";
    blocks.forEach(function (b) {
      if (JOIN_SWITCH.test(b.title)) value = b.sub;
    });
    return /^(ON|公開)$/i.test(value);
  }

  function joinParagraphs(box, rows) {
    rows.forEach(function (f) {
      box.appendChild(el("p", "joinsec__p", f.join(" | ")));
    });
  }

  function joinSchedule(box, rows) {
    var list = el("ul", "trial");

    rows.forEach(function (f) {
      var item = el("li", "trial__row");
      item.appendChild(el("span", "trial__date", formatDate(f[0] || "")));
      if (f[1]) item.appendChild(el("span", "trial__time", f[1]));
      if (f[2]) item.appendChild(el("span", "trial__place", f[2]));
      if (f[3]) item.appendChild(el("span", "trial__note", f[3]));
      list.appendChild(item);
    });

    box.appendChild(list);
  }

  // スマホからそのまま発信・送信できるようにする
  function contactHref(v) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "mailto:" + v;
    if (/^[0-9][0-9\-()\s]{8,}$/.test(v)) return "tel:" + v.replace(/[^0-9+]/g, "");
    return "";
  }

  function joinContact(box, rows) {
    var list = el("dl", "contact");

    rows.forEach(function (f) {
      var value = f[1] || "";
      var href = contactHref(value);
      var row = el("div", "contact__row");

      row.appendChild(el("dt", "contact__label", f[0] || ""));

      var dd = el("dd", "contact__value");
      if (href) {
        var link = el("a", "contact__link", value);
        link.setAttribute("href", href);
        dd.appendChild(link);
      } else {
        dd.textContent = value;
      }
      row.appendChild(dd);

      list.appendChild(row);
    });

    box.appendChild(list);
  }

  function joinDocs(box, rows) {
    var count = 0;

    rows.forEach(function (f) {
      var href = f[1] || "";
      // 置き場所が空の書類は、まだ用意できていないものとして出さない
      if (!href) return;

      var link = el("a", "joindoc", f[0] || "");
      link.setAttribute("href", href);
      link.target = "_blank";
      link.rel = "noopener";
      link.appendChild(el("span", "joindoc__ext", "PDF"));
      box.appendChild(link);
      count++;
    });

    if (!count) box.appendChild(el("p", "empty", "書類は準備中です。"));
  }

  function renderJoin(target, blocks) {
    if (!joinIsOpen(blocks)) {
      var prep = el("div", "prep");
      prep.appendChild(el("p", "prep__title", "ただいま準備中です"));
      prep.appendChild(
        el("p", "prep__text", "入団案内は準備中です。公開までしばらくお待ちください。")
      );
      target.appendChild(prep);
      return;
    }

    var count = 0;

    blocks.forEach(function (b) {
      if (JOIN_SWITCH.test(b.title)) return;
      if (!b.rows.length && !b.notes.length) return;

      var sec = el("section", "joinsec");
      if (b.title) sec.appendChild(el("h2", "joinsec__title", b.title));

      var box = el("div", "joinsec__body");

      switch ((b.sub || "").toUpperCase()) {
        case "日程":
          joinSchedule(box, b.rows);
          break;
        case "項目":
          joinContact(box, b.rows);
          break;
        case "PDF":
          joinDocs(box, b.rows);
          break;
        default:
          joinParagraphs(box, b.rows);
      }

      b.notes.forEach(function (n) {
        box.appendChild(el("p", "joinsec__note", n));
      });

      sec.appendChild(box);
      target.appendChild(sec);
      count++;
    });

    if (!count) target.appendChild(el("p", "empty", "入団案内はまだ登録されていません。"));
  }

  /* =========================================================
     球団方針
     形式: 画像 | 場所 | 読み  … スローガンの画像
           それ以外の行      … 1 行が 1 段落
     ========================================================= */

  function renderPolicy(target, blocks) {
    var card = el("div", "policy");
    var count = 0;

    blocks.forEach(function (b) {
      if (b.title) card.appendChild(el("h3", "policy__title", b.title));

      b.rows.forEach(function (f) {
        if (f[0] === "画像") {
          // 置き場所が空なら、まだ用意できていないものとして出さない
          if (!f[1]) return;

          var fig = el("figure", "slogan");
          var img = el("img", "slogan__img");
          img.setAttribute("src", f[1]);
          img.setAttribute("alt", f[2] || "");
          img.setAttribute("loading", "lazy");
          fig.appendChild(img);
          // 崩し字は読み取りにくいので、読みを添える
          if (f[2]) fig.appendChild(el("figcaption", "slogan__cap", f[2]));
          card.appendChild(fig);
        } else if (f.length > 1 && f[1]) {
          // 「ラベル | 説明」の行は、ラベルを見出しのように立てる
          var para = el("p", "policy__p");
          para.appendChild(el("b", "policy__label", f[0] || ""));
          para.appendChild(document.createTextNode(f.slice(1).join(" | ")));
          card.appendChild(para);
        } else {
          card.appendChild(el("p", "policy__p", f[0] || ""));
        }
        count++;
      });

      b.notes.forEach(function (n) {
        card.appendChild(el("p", "policy__note", n));
        count++;
      });
    });

    if (!count) {
      target.appendChild(el("p", "empty", "球団方針はまだ登録されていません。"));
      return;
    }

    target.appendChild(card);
  }

  /* =========================================================
     お知らせ
     形式: # タイトル | ON     … 1 件のはじまり（OFF なら出さない）
           本文               … 1 行が 1 段落
           画像 | 場所 | 説明  … 添付画像
     ========================================================= */

  function renderInformation(target, blocks) {
    var count = 0;

    blocks.forEach(function (b) {
      // 書き忘れ・書き間違いのときは出さない（意図せず公開されないように）
      if (!/^(ON|公開)$/i.test(b.sub)) return;
      if (!b.rows.length && !b.notes.length) return;

      var item = el("article", "info");
      if (b.title) item.appendChild(el("h2", "info__title", b.title));

      var body = el("div", "info__body");

      b.rows.forEach(function (f) {
        if (f[0] === "画像") {
          // 置き場所が空なら、まだ用意できていないものとして出さない
          if (!f[1]) return;

          var fig = el("figure", "info__figure");
          var img = el("img", "info__img");
          img.setAttribute("src", f[1]);
          img.setAttribute("alt", f[2] || "");
          img.setAttribute("loading", "lazy");
          fig.appendChild(img);
          if (f[2]) fig.appendChild(el("figcaption", "info__cap", f[2]));
          body.appendChild(fig);
        } else {
          body.appendChild(el("p", "info__p", f.join(" | ")));
        }
      });

      b.notes.forEach(function (n) {
        body.appendChild(el("p", "info__note", n));
      });

      item.appendChild(body);
      target.appendChild(item);
      count++;
    });

    if (!count) {
      var box = el("div", "prep");
      box.appendChild(el("p", "prep__title", "ただいまお知らせはありません"));
      target.appendChild(box);
    }
  }

  /* =========================================================
     ページごとの実行
     ========================================================= */

  render("js-news", "data/news.txt", function (t, b) {
    renderNews(t, b, 8);
  });

  render("js-news-all", "data/news.txt", function (t, b) {
    renderNews(t, b);
  });

  render("js-live-latest", "data/live.txt", function (t, b) {
    renderLive(t, b, 2);
  });

  render("js-live", "data/live.txt", function (t, b) {
    renderLive(t, b);
  });

  render("js-results", "data/results.txt", renderResults);

  render("js-schedule-latest", "data/schedule.txt", function (t, b) {
    renderSchedule(t, b, 3);
  });

  render("js-schedule", "data/schedule.txt", function (t, b) {
    renderSchedule(t, b);
  });

  render("js-players", "data/players.txt", renderTerms);

  render("js-graduates", "data/graduates.txt", renderTerms);

  // 詳細ページは一覧ファイルと期のファイルの両方を読むので、ここで直接呼ぶ
  var termBox = document.getElementById("js-player");
  if (termBox) renderTermDetail(termBox, queryParam("term"));

  render("js-information", "data/information.txt", renderInformation);

  render("js-policy", "data/policy.txt", renderPolicy);

  render("js-club", "data/club.txt", renderClub);

  render("js-join", "data/join.txt", renderJoin);
})();
