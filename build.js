// build.js — zero-dependency build: inline cliplib.js into renderer.html.
// The renderer runs with contextIsolation, so it needs the core inlined.
const fs = require("node:fs");
let html = fs.readFileSync("renderer.html", "utf8");
const lib = fs.readFileSync("cliplib.js", "utf8");
const marker = "<script>";
const idx = html.indexOf(marker) + marker.length;
html = html.slice(0, idx) + "\n" + lib + "\n" + html.slice(idx);
fs.writeFileSync("renderer.html", html);
console.log("renderer built:", html.length, "bytes");
