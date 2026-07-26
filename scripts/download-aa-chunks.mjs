import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const input = process.argv[2] ?? "/tmp/artificial-analysis-home.html";
const output = process.argv[3] ?? "/tmp/artificial-analysis-chunks";
const html = await readFile(input, "utf8");
const paths = [
  ...new Set(
    [...html.matchAll(/src="([^"]+\.js[^"]*)"/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith("/_next/static/chunks/")),
  ),
];

await mkdir(output, { recursive: true });

let cursor = 0;
const workers = Array.from({ length: 8 }, async () => {
  while (cursor < paths.length) {
    const path = paths[cursor];
    cursor += 1;
    const response = await fetch(new URL(path, "https://artificialanalysis.ai/"));
    if (!response.ok) throw new Error(`Failed ${response.status}: ${path}`);
    const fileName = basename(new URL(path, "https://artificialanalysis.ai/").pathname);
    await writeFile(`${output}/${fileName}`, Buffer.from(await response.arrayBuffer()));
  }
});

await Promise.all(workers);
console.log(`Downloaded ${paths.length} public chunks to ${output}`);
