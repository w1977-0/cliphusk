// cliplib.js — cliphusk pure logic core. Zero dependencies, browser + Node.
//
// Everything that can be tested without a live clipboard lives here:
// history ring, dedup-to-top, cap eviction, pinning, search, preview text.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.cliplib = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_CAP = 500;      // history entries kept (Maccy-ish)
  var TEXT_PREVIEW_LEN = 120; // what shows in the list row

  // ---- history ------------------------------------------------------------
  // entry: { id, kind: "text"|"image", text?, image?, ts, pinned? }
  // Invariants enforced by push():
  //   - newest first
  //   - duplicate content moves to top (Maccy semantics), keeping its pin
  //   - pinned entries are exempt from cap eviction
  //   - ids are monotonically increasing strings

  var idCounter = 0;
  function newId() {
    idCounter += 1;
    return "c" + idCounter + "-" + Date.now().toString(36);
  }

  function sameContent(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "image") return a.image === b.image;
    return a.text === b.text;
  }

  function push(history, item, opts) {
    opts = opts || {};
    var cap = opts.cap || DEFAULT_CAP;
    var entry = {
      id: item.id || newId(),
      kind: item.kind,
      text: item.text || null,
      image: item.image || null,   // dataURL for images
      ts: item.ts || Date.now(),
      pinned: !!item.pinned
    };
    // dedup-to-top: remove an equal existing entry first
    for (var i = 0; i < history.length; i++) {
      if (sameContent(history[i], entry)) {
        entry.pinned = entry.pinned || history[i].pinned; // keep the pin
        history.splice(i, 1);
        break;
      }
    }
    history.unshift(entry);
    // cap eviction: keep the newest `cap` unpinned entries, drop the excess
    // (oldest) ones; pinned entries never count against the cap.
    // Walking tail-first and counting "seen" (the original version) drops
    // the NEWEST overflow entry instead — the excess walk below deletes
    // exactly the oldest `excess` unpinned items.
    var unpinned = 0;
    for (var k = 0; k < history.length; k++) if (!history[k].pinned) unpinned += 1;
    var excess = unpinned - cap;
    var removed = 0;
    for (var j = history.length - 1; j >= 0 && removed < excess; j--) {
      if (!history[j].pinned) { history.splice(j, 1); removed += 1; }
    }
    return entry;
  }

  function togglePin(history, id) {
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === id) {
        history[i].pinned = !history[i].pinned;
        return history[i].pinned;
      }
    }
    return null;
  }

  function remove(history, id) {
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === id) { history.splice(i, 1); return true; }
    }
    return false;
  }

  function getById(history, id) {
    for (var i = 0; i < history.length; i++) if (history[i].id === id) return history[i];
    return null;
  }

  // ---- search ---------------------------------------------------------------
  // Case-insensitive substring match over visible text (title+content).
  // Image entries match on "(图片)" marker only when the query is empty.
  function search(history, query) {
    query = (query || "").trim().toLowerCase();
    if (!query) return history.slice();
    return history.filter(function (e) {
      var hay = (e.kind === "image" ? "图片 image " : e.text) || "";
      return hay.toLowerCase().indexOf(query) !== -1;
    });
  }

  // ---- preview row text -----------------------------------------------------
  // First line, whitespace-collapsed, truncated; images get a size descriptor.
  function previewOf(entry) {
    if (entry.kind === "image") return "图片 image";
    var t = (entry.text || "").replace(/\s+/g, " ").trim();
    if (t.length > TEXT_PREVIEW_LEN) return t.slice(0, TEXT_PREVIEW_LEN - 1) + "…";
    return t;
  }

  // relative time for the row's right edge
  function timeAgo(ts, now) {
    now = now || Date.now();
    var s = Math.max(0, Math.floor((now - ts) / 1000));
    if (s < 10) return "刚刚 now";
    if (s < 60) return s + "s";
    var m = Math.floor(s / 60);
    if (m < 60) return m + "m";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h";
    return Math.floor(h / 24) + "d";
  }

  return {
    DEFAULT_CAP: DEFAULT_CAP,
    newId: newId,
    sameContent: sameContent,
    push: push,
    togglePin: togglePin,
    remove: remove,
    getById: getById,
    search: search,
    previewOf: previewOf,
    timeAgo: timeAgo
  };
});
