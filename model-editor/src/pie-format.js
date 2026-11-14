// Preserve sections we do not interpret, along with original precision and layout.
const sourceDocuments = new WeakMap();

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error("Cannot export a non-finite number.");
  return String(Object.is(value, -0) ? 0 : value);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer of at least ${minimum}.`);
  return value;
}

function hex(token, label) {
  if (!/^(?:0x)?[\da-f]+$/i.test(token ?? "")) throw new Error(`Invalid ${label}.`);
  return integer(Number.parseInt(token.replace(/^0x/i, ""), 16), label);
}

function numbers(tokens, count, label) {
  const values = tokens.map(Number);
  if (values.length !== count || values.some((value) => !Number.isFinite(value))) throw new Error(`${label} requires ${count} finite numbers.`);
  return values;
}

function triplet(tokens, label) {
  const [x, y, z] = numbers(tokens, 3, label);
  return { x, y, z };
}

function parsePolygon(tokens) {
  const flags = hex(tokens[0], "polygon flags");
  const vertexCount = integer(Number(tokens[1]), "Polygon vertex count", 3);
  const animated = Boolean(flags & 0x4000);
  const textured = Boolean(flags & 0x200);
  const expected = 2 + vertexCount + (animated ? 4 : 0) + (textured ? vertexCount * 2 : 0);
  if (tokens.length !== expected) throw new Error(`Polygon requires ${expected} fields, got ${tokens.length}.`);
  const indices = tokens.slice(2, 2 + vertexCount).map((token) => integer(Number(token), "Point index"));
  let cursor = 2 + vertexCount;
  let animation = null;
  if (animated) {
    const [frames, rate, width, height] = numbers(tokens.slice(cursor, cursor + 4), 4, "Polygon animation");
    integer(frames, "Animation frame count", 1);
    if (rate < 0 || width <= 0 || height <= 0) throw new Error("Invalid polygon animation dimensions or rate.");
    animation = { frames, rate, width, height };
    cursor += 4;
  }
  const uvValues = numbers(tokens.slice(cursor), textured ? vertexCount * 2 : 0, "Polygon UVs");
  const uvs = [];
  for (let index = 0; index < uvValues.length; index += 2) uvs.push({ u: uvValues[index], v: uvValues[index + 1] });
  return { flags, vertexCount, indices, animation, uvs };
}

function serializePolygon(polygon) {
  return [polygon.flags.toString(16), polygon.vertexCount, ...polygon.indices,
    ...(polygon.animation ? [polygon.animation.frames, polygon.animation.rate, polygon.animation.width, polygon.animation.height] : []),
    ...polygon.uvs.flatMap(({ u, v }) => [u, v]),
  ].map((value) => typeof value === "number" ? formatNumber(value) : value).join(" ");
}

function validateLevel(level) {
  integer(level.index, "LEVEL number", 1);
  for (const point of [...level.points, ...level.connectors]) numbers([point.x, point.y, point.z], 3, "Coordinates");
  for (const polygon of level.polygons) {
    parsePolygon(serializePolygon(polygon).split(/\s+/));
    for (const index of polygon.indices) {
      if (index >= level.points.length) throw new Error(`Polygon references missing point ${index} in level ${level.index}.`);
    }
  }
}

export function parsePie(text, sourceName = "model.pie") {
  const lines = text.split(/\r\n|\n|\r/);
  const lineEndings = text.match(/\r\n|\n|\r/g) ?? [];
  const entries = [];
  const model = { sourceName, version: 0, type: null, texture: null, events: [], levelsExpected: null, levels: [], topLevelExtras: [] };
  let pointer = 0;
  let level = null;
  const seenModel = new Set();
  let seenLevel = new Set();
  let inUnknownSection = false;
  const opaqueBlocks = new Map();
  const tokensAt = (index) => lines[index].replace(/(?:\/\/|#).*$/, "").trim().replace(/^\uFEFF/, "").split(/\s+/).filter(Boolean);
  const fail = (message, line = pointer) => new Error(`${sourceName}:${line + 1}: ${message}`);
  const unique = (set, key) => {
    if (set.has(key)) throw new Error(`Duplicate ${key} section.`);
    set.add(key);
  };
  const countFrom = (tokens, label) => {
    if (tokens.length !== 2) throw new Error(`${label} requires a count.`);
    return integer(Number(tokens[1]), `${label} count`);
  };
  function readBlock(count, label, parse) {
    const values = [];
    const rowLines = [];
    for (let index = 0; index < count; index += 1) {
      while (pointer < lines.length && !tokensAt(pointer).length) pointer += 1;
      if (pointer >= lines.length) throw new Error(`Unexpected end of file in ${label}.`);
      rowLines.push(pointer);
      values.push(parse(tokensAt(pointer)));
      pointer += 1;
    }
    return { values, rowLines };
  }
  function record(start, kind, target, key, read, render, rowLines = []) {
    entries.push({ start, end: pointer, kind, target, key, read, render, rowLines, original: JSON.stringify(read()) });
  }
  while (pointer < lines.length) {
    const start = pointer;
    const tokens = tokensAt(pointer);
    if (!tokens.length) { pointer += 1; continue; }
    const keyword = tokens[0];
    try {
      if (!model.version && keyword !== "PIE") throw new Error("Missing PIE header before model data.");
      if (["PIE", "TYPE", "TEXTURE", "EVENT", "LEVELS", "LEVEL", "POINTS", "POLYGONS", "CONNECTORS", "ANIMOBJECT"].includes(keyword)) inUnknownSection = false;
      if (keyword === "PIE") {
        unique(seenModel, keyword);
        if (tokens.length !== 2 || ![2, 3, 4].includes(Number(tokens[1]))) throw new Error("Only PIE versions 2, 3 and 4 are supported.");
        model.version = Number(tokens[1]); pointer += 1;
        record(start, keyword, model, "version", () => model.version, (value) => [`PIE ${value}`]);
      } else if (keyword === "TYPE") {
        unique(level && model.version === 4 ? seenLevel : seenModel, keyword);
        if (tokens.length !== 2) throw new Error("TYPE requires hexadecimal flags.");
        const target = level && model.version === 4 ? level : model;
        target.type = hex(tokens[1], "TYPE flags"); pointer += 1;
        record(start, keyword, target, "type", () => target.type, (value) => [`TYPE ${value.toString(16)}`]);
      } else if (keyword === "TEXTURE") {
        unique(level && model.version === 4 ? seenLevel : seenModel, keyword);
        if (tokens.length !== 5 && !(model.version === 4 && tokens.length === 3)) throw new Error("TEXTURE requires an index, filename and (for PIE 2/3) width and height.");
        const target = level && model.version === 4 ? level : model;
        target.texture = { index: integer(Number(tokens[1]), "Texture index"), name: tokens[2], width: integer(Number(tokens[3] ?? 0), "Texture width"), height: integer(Number(tokens[4] ?? 0), "Texture height") };
        pointer += 1;
        record(start, keyword, target, "texture", () => target.texture, (value) => [`TEXTURE ${value.index} ${value.name}${model.version === 4 ? "" : ` ${value.width} ${value.height}`}`]);
      } else if (keyword === "EVENT") {
        if (tokens.length < 3) throw new Error("EVENT requires an index and filename.");
        const eventIndex = model.events.length;
        model.events.push({ index: integer(Number(tokens[1]), "Event index"), name: tokens.slice(2).join(" ") });
        pointer += 1;
        record(start, keyword, model, "events", () => model.events[eventIndex], (value) => [`EVENT ${value.index} ${value.name}`]);
      } else if (keyword === "LEVELS") {
        unique(seenModel, keyword);
        model.levelsExpected = countFrom(tokens, keyword); pointer += 1;
        record(start, keyword, model, "levelsExpected", () => model.levels.length, (value) => [`LEVELS ${value}`]);
      } else if (keyword === "LEVEL") {
        if (tokens.length !== 2) throw new Error("LEVEL requires an index.");
        level = { index: integer(Number(tokens[1]), "LEVEL number", 1), points: [], polygons: [], connectors: [], animObject: null, extraLines: [] };
        model.levels.push(level); seenLevel = new Set(); pointer += 1;
        const current = level;
        record(start, keyword, current, "index", () => current.index, (value) => [`LEVEL ${value}`]);
      } else if (["POINTS", "POLYGONS", "CONNECTORS", "ANIMOBJECT"].includes(keyword)) {
        if (!level) throw new Error(`${keyword} must be inside a LEVEL.`);
        unique(seenLevel, keyword);
        const current = level;
        let count, key, parser, render;
        if (keyword === "ANIMOBJECT") {
          const header = numbers(tokens.slice(1), 3, keyword);
          integer(header[0], "Animation time"); integer(header[1], "Animation cycles");
          count = integer(header[2], "Animation frames"); key = "animObject";
          parser = (row) => numbers(row, 10, "Animation frame");
          render = (value) => [`ANIMOBJECT ${value.headerTokens.join(" ")}`, ...value.frames.map((row) => `\t\t${row.map(formatNumber).join("\t")}`)];
        } else {
          count = countFrom(tokens, keyword);
          key = { POINTS: "points", POLYGONS: "polygons", CONNECTORS: "connectors" }[keyword];
          parser = keyword === "POLYGONS" ? parsePolygon : (row) => triplet(row, keyword);
          render = (value) => [`${keyword} ${value.length}`, ...value.map((row) => `\t${keyword === "POLYGONS" ? serializePolygon(row) : [row.x, row.y, row.z].map(formatNumber).join(" ")}`)];
        }
        pointer += 1;
        const block = readBlock(count, keyword, parser);
        current[key] = keyword === "ANIMOBJECT" ? { headerTokens: tokens.slice(1), frames: block.values } : block.values;
        record(start, keyword, current, key, () => current[key], render, block.rowLines);
      } else if (["NORMALS", "SHADOWPOINTS", "SHADOWPOLYGONS"].includes(keyword)) {
        if (!level) throw new Error(`${keyword} must be inside a LEVEL.`);
        unique(seenLevel, keyword);
        const count = countFrom(tokens, keyword);
        pointer += 1;
        const parser = keyword === "NORMALS" ? (row) => numbers(row, 9, "Normals")
          : keyword === "SHADOWPOINTS" ? (row) => triplet(row, "Shadow point") : parsePolygon;
        const block = readBlock(count, keyword, parser);
        if (!opaqueBlocks.has(level)) opaqueBlocks.set(level, {});
        opaqueBlocks.get(level)[keyword] = block.values;
        level.extraLines.push(...lines.slice(start, pointer));
        inUnknownSection = false;
      } else {
        if (Number.isFinite(Number(keyword)) && !inUnknownSection) throw new Error("Unexpected data outside a counted section.");
        (level ? level.extraLines : model.topLevelExtras).push(lines[pointer]); pointer += 1;
        if (/^[A-Za-z]/.test(keyword)) inUnknownSection = !["NORMALMAP", "SPECULARMAP", "TCMASK", "INTERPOLATE"].includes(keyword);
      }
    } catch (error) { throw fail(error.message); }
  }
  for (const keyword of ["PIE", "TYPE", "LEVELS"]) {
    if (!seenModel.has(keyword)) throw fail(`Missing ${keyword} header.`, 0);
  }
  if (!model.levels.length || model.levelsExpected !== model.levels.length) throw fail(`LEVELS declares ${model.levelsExpected}, but found ${model.levels.length} levels.`, 0);
  const levelNumbers = new Set();
  for (const current of model.levels) {
    if (levelNumbers.has(current.index)) throw fail(`Duplicate LEVEL ${current.index}.`, 0);
    levelNumbers.add(current.index);
    if (!entries.some((entry) => entry.target === current && entry.kind === "POINTS") || !entries.some((entry) => entry.target === current && entry.kind === "POLYGONS")) throw fail(`LEVEL ${current.index} requires POINTS and POLYGONS.`, 0);
    try { validateLevel(current); } catch (error) { throw fail(error.message, 0); }
    const blocks = opaqueBlocks.get(current);
    if (blocks?.NORMALS && blocks.NORMALS.length !== current.polygons.length) throw fail(`NORMALS count must match POLYGONS in level ${current.index}.`, 0);
    for (const polygon of blocks?.SHADOWPOLYGONS ?? []) {
      if (polygon.indices.some((index) => index >= (blocks.SHADOWPOINTS?.length ?? 0))) throw fail(`Shadow polygon references a missing point in level ${current.index}.`, 0);
    }
  }
  // The LEVELS baseline is only known after reading all levels.
  for (const entry of entries) entry.original = JSON.stringify(entry.read());
  sourceDocuments.set(model, { text, lines, lineEndings, entries, levels: [...model.levels], newline: lineEndings[0] ?? "\n" });
  return model;
}

export function serializePie(model) {
  for (const level of model.levels) validateLevel(level);
  const source = sourceDocuments.get(model);
  if (source) {
    if (source.levels.length !== model.levels.length || source.levels.some((level, index) => model.levels[index] !== level)) throw new Error("Changing the level structure is not supported by this vertex editor.");
    const changes = source.entries.filter((entry) => JSON.stringify(entry.read()) !== entry.original);
    if (!changes.length) return source.text;
    const lines = [...source.lines];
    const endings = [...source.lineEndings];
    for (const entry of changes.reverse()) {
      // Only rewrite changed coordinates; keep all other tokens and comments.
      if (["POINTS", "CONNECTORS"].includes(entry.kind) && entry.read().length === entry.rowLines.length) {
        const original = JSON.parse(entry.original);
        entry.read().forEach((point, index) => {
          if (JSON.stringify(point) === JSON.stringify(original[index])) return;
          const rowIndex = entry.rowLines[index];
          let coordinate = 0;
          lines[rowIndex] = lines[rowIndex].replace(/\S+/g, (token) => {
            if (coordinate >= 3) return token;
            const axis = ["x", "y", "z"][coordinate++];
            return point[axis] === original[index][axis] ? token : formatNumber(point[axis]);
          });
        });
      } else {
        const replacement = entry.render(entry.read());
        const replacementEndings = replacement.map((_, index) => index === replacement.length - 1 ? (endings[entry.end - 1] ?? "") : source.newline);
        lines.splice(entry.start, entry.end - entry.start, ...replacement);
        endings.splice(entry.start, entry.end - entry.start, ...replacementEndings);
      }
    }
    return lines.map((line, index) => line + (endings[index] ?? "")).join("");
  }
  const lines = [`PIE ${model.version}`, `TYPE ${model.type.toString(16)}`];
  if (model.texture) {
    const { index, name, width, height } = model.texture;
    lines.push(`TEXTURE ${index} ${name} ${width} ${height}`);
  }
  for (const event of model.events ?? []) lines.push(`EVENT ${event.index} ${event.name}`);
  lines.push(...(model.topLevelExtras ?? []), `LEVELS ${model.levels.length}`);
  for (const level of model.levels) {
    lines.push(`LEVEL ${level.index}`, `POINTS ${level.points.length}`, ...level.points.map(({ x, y, z }) => `\t${[x, y, z].map(formatNumber).join(" ")}`),
      `POLYGONS ${level.polygons.length}`, ...level.polygons.map((polygon) => `\t${serializePolygon(polygon)}`));
    if (level.connectors.length) lines.push(`CONNECTORS ${level.connectors.length}`, ...level.connectors.map(({ x, y, z }) => `\t${[x, y, z].map(formatNumber).join(" ")}`));
    if (level.animObject) lines.push(`ANIMOBJECT ${level.animObject.headerTokens.join(" ")}`, ...level.animObject.frames.map((row) => `\t\t${row.map(formatNumber).join("\t")}`));
    lines.push(...(level.extraLines ?? []));
  }
  return `${lines.join("\n")}\n`;
}

export function getUvMode(model) {
  if (!model.texture) return "No texture info";
  if (model.version >= 3 || model.texture.width === 0 || model.texture.height === 0) return "Normalized UVs";
  return `${model.texture.width}x${model.texture.height} texture page`;
}

export function summarizeLevel(level) {
  return { points: level.points.length, polygons: level.polygons.length, connectors: level.connectors?.length ?? 0, frames: level.animObject?.frames.length ?? 0 };
}
