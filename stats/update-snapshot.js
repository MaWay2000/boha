const fs = require("fs");
const path = require("path");

async function main() {
  const response = await fetch("https://warzone2100.retropaganda.info/results.json?id=0%200%200", {
    headers: { Accept: "text/event-stream" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot source: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const payload = { format: 0, results: [] };
  let buffer = "";
  let currentEvent = "message";
  let currentData = [];
  let synced = false;

  function flushEvent() {
    if (!currentData.length) {
      currentEvent = "message";
      return;
    }

    const data = currentData.join("\n");
    if (currentEvent === "reset") {
      payload.format = Number(data);
      payload.results = [];
    } else if (currentEvent === "message") {
      payload.results.push(JSON.parse(data));
    } else if (currentEvent === "synced") {
      synced = true;
    }

    currentEvent = "message";
    currentData = [];
  }

  while (!synced) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.replace(/\r$/, "");

      if (!line) {
        flushEvent();
      } else if (line.startsWith("event: ")) {
        currentEvent = line.slice(7);
      } else if (line.startsWith("data: ")) {
        currentData.push(line.slice(6));
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  const outputPath = path.join(__dirname, "results-snapshot.json");
  fs.writeFileSync(outputPath, JSON.stringify(payload));
  console.log(`Wrote ${payload.results.length} results to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
