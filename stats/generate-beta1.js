"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { calculateBeta1 } = require("./beta1-rating");

const directory = path.join(__dirname, "published");
const leaderboards = JSON.parse(fs.readFileSync(path.join(directory, "leaderboards.json"), "utf8"));
const matches = JSON.parse(fs.readFileSync(path.join(directory, "matches.json"), "utf8"));
const result = calculateBeta1(leaderboards, matches);
const outputPath = path.join(directory, "beta1.json");
const output = `${JSON.stringify(result)}\n`;
if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) {
  fs.writeFileSync(outputPath, output);
}
console.log(`Beta 1: ${result.coverage.rated}/${result.coverage.considered} matches, ${result.players.length} visible players, ${result.coverage.withPersonal} personal-score matches.`);
