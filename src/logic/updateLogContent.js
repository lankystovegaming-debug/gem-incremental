const DIVIDER_LINE = /^[\s━─—═=_*]{3,}$/u;
const BULLET_LINE = /^[-•●▪◦*]\s*(.+)$/u;

function plainHeading(line, previousLine, nextLine, isFirstContent) {
  if (line.startsWith("## ")) return line.slice(3).trim();

  const words = line
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words || words.length > 80) return "";

  const bracketedByDividers = DIVIDER_LINE.test(previousLine ?? "") && DIVIDER_LINE.test(nextLine ?? "");
  const uppercase = words === words.toLocaleUpperCase("en-US") && /\p{L}/u.test(words);
  return bracketedByDividers || (uppercase && (isFirstContent || words.split(" ").length <= 8))
    ? line.trim()
    : "";
}

export function parseUpdateLogContent(value) {
  const lines = String(value ?? "").split(/\r?\n/).map((line) => line.trim());
  const sections = [];
  let current = null;
  let paragraph = [];
  let sawContent = false;

  const ensureSection = () => {
    if (!current) {
      current = { heading: "Overview", bullets: [] };
      sections.push(current);
    }
    return current;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    ensureSection().bullets.push(paragraph.join(" "));
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line || DIVIDER_LINE.test(line)) {
      flushParagraph();
      continue;
    }

    const heading = plainHeading(line, lines[index - 1], lines[index + 1], !sawContent);
    if (heading) {
      flushParagraph();
      current = { heading, bullets: [] };
      sections.push(current);
      sawContent = true;
      continue;
    }

    const bullet = line.match(BULLET_LINE);
    if (bullet) {
      flushParagraph();
      ensureSection().bullets.push(bullet[1].trim());
      sawContent = true;
      continue;
    }

    paragraph.push(line);
    sawContent = true;
  }

  flushParagraph();

  const populated = sections.filter((section) => section.bullets.length > 0);
  if (!populated.length) {
    throw new Error("Add at least one update section or paragraph.");
  }
  if (populated.length > 20) {
    throw new Error("Update logs can contain at most 20 sections.");
  }
  if (populated.some((section) => section.heading.length > 80)) {
    throw new Error("Section headings can contain at most 80 characters.");
  }
  if (populated.some((section) => section.bullets.length > 30)) {
    throw new Error("Each section can contain at most 30 entries.");
  }
  if (populated.some((section) => section.bullets.some((bullet) => bullet.length > 500))) {
    throw new Error("Individual update entries can contain at most 500 characters.");
  }

  return populated;
}

export function updateSectionsToText(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((section) => `## ${section.heading}\n${(section.bullets ?? []).map((bullet) => `- ${bullet}`).join("\n")}`)
    .join("\n\n");
}
