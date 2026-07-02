import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Guards .claude/skills/ and CLAUDE.md against reference rot: every repo path
 * they cite must exist, and every "`<name>` skill" cross-reference must point
 * at a real skill. Catches renames/deletions that would otherwise leave the
 * docs pointing at dead files. Semantic drift (a doc describing outdated
 * behavior) still needs a human/agent re-read — this only checks references.
 */

const REPO_ROOT = resolve(__dirname, '../..');
const SKILLS_DIR = join(REPO_ROOT, '.claude/skills');

// Repo-relative paths starting with a known top-level dir. Brackets are literal
// in Next.js route dirs (e.g. src/app/api/episodes/[id]/segment).
const PATH_RE = /\b(?:src|fixtures|scripts|evals|drizzle|public)\/[\w\-./[\]]+/g;

// "see the `resegment-episode` skill" style cross-references.
const SKILL_REF_RE = /`([a-z][a-z0-9-]*)` skill/g;

function isPlaceholderOrGlob(path: string): boolean {
  return path.includes('*') || path.includes('<') || path.includes('path/to');
}

function extractPaths(text: string): string[] {
  const matches = text.match(PATH_RE) ?? [];
  return matches
    .map((raw) => raw.replace(/[.,:]+$/, '')) // trailing sentence punctuation
    .filter((path) => !isPlaceholderOrGlob(path));
}

interface DocFile {
  readonly label: string;
  readonly absolutePath: string;
}

function collectDocFiles(): DocFile[] {
  const skillDocs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      label: `.claude/skills/${entry.name}/SKILL.md`,
      absolutePath: join(SKILLS_DIR, entry.name, 'SKILL.md'),
    }));

  return [{ label: 'CLAUDE.md', absolutePath: join(REPO_ROOT, 'CLAUDE.md') }, ...skillDocs];
}

const docs = collectDocFiles();

describe('skill and CLAUDE.md references', () => {
  it('found the skills directory and at least one skill', () => {
    expect(docs.length).toBeGreaterThan(1);
  });

  it.each(docs.map((doc) => [doc.label, doc] as const))(
    '%s cites only paths that exist',
    (_label, doc) => {
      expect(existsSync(doc.absolutePath)).toBe(true);
      const text = readFileSync(doc.absolutePath, 'utf8');

      const missing = [...new Set(extractPaths(text))].filter(
        (path) => !existsSync(join(REPO_ROOT, path))
      );

      expect(missing, `dead path reference(s): ${missing.join(', ')}`).toEqual([]);
    }
  );

  it.each(docs.map((doc) => [doc.label, doc] as const))(
    '%s cross-references only skills that exist',
    (_label, doc) => {
      const text = readFileSync(doc.absolutePath, 'utf8');

      const missing = [...text.matchAll(SKILL_REF_RE)]
        .map((match) => match[1])
        .filter((name) => !existsSync(join(SKILLS_DIR, name, 'SKILL.md')));

      expect(missing, `dead skill reference(s): ${missing.join(', ')}`).toEqual([]);
    }
  );
});
