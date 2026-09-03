// test/cliplib.test.js — cliphusk pure-core tests (Node built-in runner).
//   node --test test/cliplib.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const L = require(path.join(__dirname, "..", "cliplib.js"));

test("push: newest first, ids unique, keeps order of arrival", () => {
  const h = [];
  L.push(h, { kind: "text", text: "a" });
  L.push(h, { kind: "text", text: "b" });
  L.push(h, { kind: "text", text: "c" });
  assert.deepEqual(h.map((e) => e.text), ["c", "b", "a"]);
  assert.equal(new Set(h.map((e) => e.id)).size, 3);
});

test("push: duplicate content moves to top instead of duplicating", () => {
  const h = [];
  L.push(h, { kind: "text", text: "a" });
  L.push(h, { kind: "text", text: "b" });
  L.push(h, { kind: "text", text: "c" });
  L.push(h, { kind: "text", text: "a" });
  assert.equal(h.length, 3);
  assert.equal(h[0].text, "a", "moved to top");
  assert.deepEqual(h.slice(1).map((e) => e.text), ["c", "b"]);
});

test("push: re-copying a pinned entry keeps the pin", () => {
  const h = [];
  L.push(h, { kind: "text", text: "server ip" });
  L.togglePin(h, h[0].id);
  L.push(h, { kind: "text", text: "b" });
  L.push(h, { kind: "text", text: "server ip" }); // re-copy
  assert.equal(h[0].text, "server ip");
  assert.equal(h[0].pinned, true, "pin survives the move");
});

test("push: images dedupe by dataURL, kind-mismatched never equal", () => {
  const h = [];
  L.push(h, { kind: "image", image: "data:image/png;base64,AAAA" });
  L.push(h, { kind: "image", image: "data:image/png;base64,BBBB" });
  L.push(h, { kind: "image", image: "data:image/png;base64,AAAA" });
  assert.equal(h.length, 2);
  assert.equal(h[0].image, "data:image/png;base64,AAAA");
  assert.equal(L.sameContent({ kind: "text", text: "x" }, { kind: "image", image: "x" }), false);
});

test("cap eviction: oldest unpinned dropped, pinned survive", () => {
  const h = [];
  const cap = { cap: 5 };
  for (let i = 0; i < 5; i++) L.push(h, { kind: "text", text: "t" + i }, cap);
  L.togglePin(h, h[4].id); // pin the OLDEST (t0)
  for (let i = 5; i < 10; i++) L.push(h, { kind: "text", text: "t" + i }, cap);
  assert.equal(h.length, 5 + 1, "cap + one pinned survivor");
  assert.ok(h.some((e) => e.text === "t0" && e.pinned), "pinned t0 survived");
  assert.ok(!h.some((e) => e.text === "t1"), "t1 evicted as oldest unpinned");
});

test("search: case-insensitive substring over text", () => {
  const h = [];
  L.push(h, { kind: "text", text: "Zhang San's API key" });
  L.push(h, { kind: "text", text: "shopping list: milk" });
  L.push(h, { kind: "text", text: "api docs link" });
  const r = L.search(h, "API");
  assert.equal(r.length, 2);
  // results preserve history order (newest first), no re-sorting
  // newest-first history order: "api docs link" was pushed last
  assert.deepEqual(r.map((e) => e.text), ["api docs link", "Zhang San's API key"]);
  assert.equal(L.search(h, "").length, 3, "empty query = everything");
});

test("previewOf: collapses whitespace, truncates with ellipsis, images labelled", () => {
  assert.equal(L.previewOf({ kind: "text", text: "  a\n\n  b  \t c  " }), "a b c");
  const long = "x".repeat(200);
  const p = L.previewOf({ kind: "text", text: long });
  assert.equal(p.length, 120);
  assert.ok(p.endsWith("…"));
  assert.equal(L.previewOf({ kind: "image" }), "图片 image");
});

test("timeAgo buckets", () => {
  const now = Date.now();
  assert.equal(L.timeAgo(now - 0, now), "刚刚 now");
  assert.equal(L.timeAgo(now - 30 * 1000, now), "30s");
  assert.equal(L.timeAgo(now - 5 * 60000, now), "5m");
  assert.equal(L.timeAgo(now - 3 * 3600000, now), "3h");
  assert.equal(L.timeAgo(now - 2 * 86400000, now), "2d");
  // clock skew must not produce negatives
  assert.equal(L.timeAgo(now + 5000, now), "刚刚 now");
});

test("togglePin/remove round-trip on ids", () => {
  const h = [];
  L.push(h, { kind: "text", text: "x" });
  const id = h[0].id;
  assert.equal(L.togglePin(h, id), true);
  assert.equal(L.togglePin(h, id), false);
  assert.equal(L.remove(h, id), true);
  assert.equal(L.remove(h, id), false);
  assert.equal(L.getById(h, id), null);
});

test("pinned entries stay at their position when new items arrive (no forced reorder)", () => {
  const h = [];
  L.push(h, { kind: "text", text: "keep-me" });
  L.togglePin(h, h[0].id);
  L.push(h, { kind: "text", text: "new1" });
  L.push(h, { kind: "text", text: "new2" });
  // pinned stays where it was in history order; UI renders pinned section
  // separately — the data model keeps strict recency order
  assert.deepEqual(h.map((e) => e.text), ["new2", "new1", "keep-me"]);
});
