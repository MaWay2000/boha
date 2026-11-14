import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parsePie, serializePie } from "../src/pie-format.js";

const modelRoot = fileURLToPath(new URL("../../mapmaker/pies/", import.meta.url));
const sample = readFileSync(new URL("../samples/trlcan.pie", import.meta.url), "utf8").replaceAll("\r\n", "\n");

test("all bundled PIE files load, round-trip exactly, and retain their layout after a point edit", () => {
  const files = readdirSync(modelRoot, { recursive: true }).filter((name) => name.endsWith(".pie"));
  assert.ok(files.length > 1000);
  for (const name of files) {
    const original = readFileSync(join(modelRoot, name), "utf8");
    const model = parsePie(original, name);
    assert.equal(serializePie(model), original, name);
    const level = model.levels.find((item) => item.points.length);
    if (!level) continue;
    level.points[0].x += 0.125;
    const exported = serializePie(model);
    const newline = original.includes("\r\n") ? "\r\n" : "\n";
    const originalLines = original.split(newline);
    const changedLines = exported.split(newline).filter((line, index) => line !== originalLines[index]);
    assert.equal(changedLines.length, 1, `Only the edited point line should change: ${name}`);
    assert.equal(parsePie(exported).levels.find((item) => item.index === level.index).points[0].x, level.points[0].x, name);
  }
});

test("polygon animation fields precede the UVs and survive export", () => {
  const text = readFileSync(join(modelRoot, "blipart.pie"), "utf8");
  const model = parsePie(text);
  const polygon = model.levels[0].polygons[0];
  assert.equal(polygon.flags, 0x4200);
  assert.deepEqual(polygon.animation, { frames: 4, rate: 1, width: 27, height: 27 });
  assert.deepEqual(polygon.uvs[0], { u: 146, v: 207 });
  model.levels[0].points[0].y = 2.123456789;
  assert.deepEqual(parsePie(serializePie(model)).levels[0].polygons[0], polygon);
});

test("preserves CRLF, comments, unknown extensions, and untouched coordinate precision", () => {
  const text = sample.replace("TYPE 10200", "TYPE 10a00\nCUSTOM 2\n1 2 3\n4 5 6")
    .replace("-6 8 -9", "-6 8.00000000001 -9 // original point").replaceAll("\n", "\r\n").replace("LEVEL 1\r\n", "LEVEL 1\n");
  const model = parsePie(text);
  assert.equal(model.type, 0x10a00);
  assert.equal(serializePie(model), text);
  model.levels[0].points[0].x = -7.987654321;
  assert.equal(serializePie(model), text.replace("-6 8.00000000001", "-7.987654321 8.00000000001"));
});

test("PIE 4 supports comments and per-level texture/type overrides", () => {
  const text = sample.replace("PIE 2", "PIE 4 # modern format").replace("TEXTURE 0 page-17-droid-weapons.png 256 256", "TEXTURE 0 global.png")
    .replace("LEVEL 1", "LEVEL 1\nTYPE 200\nTEXTURE 0 local.png");
  const model = parsePie(text);
  assert.equal(model.texture.name, "global.png");
  assert.equal(model.levels[0].texture.name, "local.png");
  assert.equal(model.levels[0].type, 0x200);
  assert.equal(serializePie(model), text);
});

test("rejects malformed headers, counts, references and incomplete blocks with useful errors", () => {
  const invalid = [
    [sample.replace("PIE 2\n", ""), /Missing PIE/],
    [sample.replace("PIE 2", "PIE 99"), /versions/],
    [sample.replace("TYPE 10200", "TYPE xyz"), /TYPE flags/],
    [sample.replace("POINTS 8", "POINTS nope"), /POINTS count/],
    [sample.replace("POINTS 8", "POINTS -1"), /POINTS count/],
    [sample.replace("POINTS 8", "POINTS 2.5"), /POINTS count/],
    [sample.replace("POINTS 8", "POINTS 7"), /counted section/],
    [sample.replace("LEVELS 1", "LEVELS 2"), /declares 2/],
    [sample.replace("200 3 3 2 1", "200 3 999 2 1"), /missing point 999/],
    [sample.replace("200 3 3 2 1", "200 3 0.5 2 1"), /Point index/],
    [sample.replace("200 3 3 2 1", "4200 3 3 2 1"), /fields/],
    [sample.slice(0, sample.indexOf("POLYGONS")) + "POLYGONS 1\n", /Unexpected end/],
    [sample.replace("POLYGONS 12", "POINTS 0\nPOLYGONS 12"), /Duplicate POINTS/],
  ];
  for (const [text, pattern] of invalid) assert.throws(() => parsePie(text, "broken.pie"), pattern);
  const model = parsePie(sample);
  model.levels[0].points[0].x = Infinity;
  assert.throws(() => serializePie(model), /finite/);
});
