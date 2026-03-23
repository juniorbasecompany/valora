import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDirectory, "../src");
const styleRoot = path.resolve(scriptDirectory, "../src/app/styles");
const sourceExtensionSet = new Set([".js", ".jsx", ".ts", ".tsx"]);
const styleExtensionSet = new Set([".css"]);
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

async function walk(directoryPath, allowedExtensionSet) {
  const entryList = await readdir(directoryPath, { withFileTypes: true });
  const resultList = [];

  for (const entry of entryList) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      resultList.push(...(await walk(entryPath, allowedExtensionSet)));
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

function getClassTokenList(raw) {
  return raw
    .replace(/\$\{[^}]*\}/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isSemanticToken(token) {
  return token.startsWith("ui-") || token.startsWith("is-");
}

function getUnexpectedTokenList(raw) {
  return getClassTokenList(raw).filter((token) => !isSemanticToken(token));
}

async function collectDefinedTokenSet() {
  const stylePathList = await walk(styleRoot, styleExtensionSet);
  const definedTokenSet = new Set();

  for (const stylePath of stylePathList) {
    const source = await readFile(stylePath, "utf8");

    for (const match of source.matchAll(/\.((?:ui|is)-[A-Za-z0-9-]+)/g)) {
      definedTokenSet.add(match[1]);
    }
  }

  return definedTokenSet;
}

function collectFindingList(filePath, source, definedTokenSet) {
  const findingList = [];

  for (const pattern of classPatternList) {
    let match;

    while ((match = pattern.regex.exec(source))) {
      const raw = match[1]?.trim() ?? "";
      if (!raw) {
        continue;
      }

      if (pattern.requiresUiToken && !/(?:^|\s)(?:ui-|is-)/.test(raw)) {
        continue;
      }

      const unexpectedTokenList = getUnexpectedTokenList(raw);
      if (unexpectedTokenList.length > 0) {
        const lineNumber = getLineNumber(source, match.index);
        findingList.push({
          filePath,
          lineNumber,
          label: pattern.label,
          kind: "non-semantic tokens",
          tokenList: unexpectedTokenList,
          line: getLineText(source, lineNumber)
        });
      }

      const undefinedSemanticTokenList = getClassTokenList(raw)
        .filter(isSemanticToken)
        .filter((token) => !definedTokenSet.has(token));

      if (undefinedSemanticTokenList.length > 0) {
        const lineNumber = getLineNumber(source, match.index);
        findingList.push({
          filePath,
          lineNumber,
          label: pattern.label,
          kind: "undefined semantic tokens",
          tokenList: undefinedSemanticTokenList,
          line: getLineText(source, lineNumber)
        });
      }
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
  const filePathList = await walk(sourceRoot, sourceExtensionSet);
  const definedTokenSet = await collectDefinedTokenSet();
  const findingList = [];

  for (const filePath of filePathList) {
    const source = await readFile(filePath, "utf8");
    findingList.push(...collectFindingList(filePath, source, definedTokenSet));
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
    console.error(`- ${relativePath}:${finding.lineNumber} uses ${finding.kind}: ${finding.tokenList.join(", ")}`);
    console.error(`  ${finding.line}`);
  }

  process.exitCode = 1;
}

await main();
