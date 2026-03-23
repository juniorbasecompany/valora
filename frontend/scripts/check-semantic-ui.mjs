import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDirectory, "../src");
const allowedExtensionSet = new Set([".js", ".jsx", ".ts", ".tsx"]);
const classPatternList = [
  {
    label: "className string",
    regex: /className\s*=\s*"([^"]*)"/g,
    requiresUiToken: false
  },
  {
    label: "className template",
    regex: /className\s*=\s*\{`([^`]*)`\}/g,
    requiresUiToken: false
  },
  {
    label: "class helper string",
    regex: /(?:const|let|var)\s+[A-Za-z0-9_]*class[A-Za-z0-9_]*\s*=\s*"([^"]*)"/gi,
    requiresUiToken: false
  },
  {
    label: "class helper template",
    regex: /(?:const|let|var)\s+[A-Za-z0-9_]*class[A-Za-z0-9_]*\s*=\s*`([^`]*)`/gi,
    requiresUiToken: false
  },
  {
    label: "returned class template",
    regex: /return\s+`([^`]*)`/g,
    requiresUiToken: true
  }
];

async function walk(directoryPath) {
  const entryList = await readdir(directoryPath, { withFileTypes: true });
  const resultList = [];

  for (const entry of entryList) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      resultList.push(...(await walk(entryPath)));
      continue;
    }

    if (allowedExtensionSet.has(path.extname(entry.name))) {
      resultList.push(entryPath);
    }
  }

  return resultList;
}

function getLineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function getLineText(source, lineNumber) {
  return source.split(/\r?\n/)[lineNumber - 1]?.trim() ?? "";
}

function getUnexpectedTokenList(raw) {
  return raw
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !token.startsWith("ui-"));
}

function collectFindingList(filePath, source) {
  const findingList = [];

  for (const pattern of classPatternList) {
    let match;

    while ((match = pattern.regex.exec(source))) {
      const raw = match[1]?.trim() ?? "";
      if (!raw) {
        continue;
      }

      if (pattern.requiresUiToken && !raw.includes("ui-")) {
        continue;
      }

      const unexpectedTokenList = getUnexpectedTokenList(raw);
      if (unexpectedTokenList.length === 0) {
        continue;
      }

      const lineNumber = getLineNumber(source, match.index);
      findingList.push({
        filePath,
        lineNumber,
        label: pattern.label,
        tokenList: unexpectedTokenList,
        line: getLineText(source, lineNumber)
      });
    }

    pattern.regex.lastIndex = 0;
  }

  const styleLineList = source.split(/\r?\n/);
  styleLineList.forEach((line, index) => {
    if (!line.includes("style={{")) {
      return;
    }

    if (line.includes("--ui-")) {
      return;
    }

    findingList.push({
      filePath,
      lineNumber: index + 1,
      label: "inline style",
      tokenList: ["style={{...}}"],
      line: line.trim()
    });
  });

  return findingList;
}

async function main() {
  const filePathList = await walk(sourceRoot);
  const findingList = [];

  for (const filePath of filePathList) {
    const source = await readFile(filePath, "utf8");
    findingList.push(...collectFindingList(filePath, source));
  }

  if (findingList.length === 0) {
    console.log("Semantic UI check passed.");
    return;
  }

  console.error(
    "Semantic UI check failed. Move all JSX/TSX class composition to ui-* primitives/components in frontend/src/app/styles/ (see .cursor/skills/interface-product-direction/SKILL.md)."
  );

  for (const finding of findingList) {
    const relativePath = path.relative(path.resolve(scriptDirectory, ".."), finding.filePath);
    console.error(`- ${relativePath}:${finding.lineNumber} uses non-semantic tokens: ${finding.tokenList.join(", ")}`);
    console.error(`  ${finding.line}`);
  }

  process.exitCode = 1;
}

await main();
