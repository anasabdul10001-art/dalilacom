import rude from "./rudeWords.json";
import { normalizeText } from "../services/category.service";

/**
 * A short, plain check for clear profanity, so an obviously rude name never depends on the AI being awake.
 * The AI still judges the doubtful cases; this only catches the clear ones.
 */
const PHRASES = (rude.words as string[]).map((w) => normalizeText(w)).filter(Boolean);

/** The rude words found in the text (as whole words or whole phrases), or an empty list. */
export function findRude(...texts: (string | null | undefined)[]): string[] {
  const hay = ` ${normalizeText(texts.filter(Boolean).join(" "))} `;
  return PHRASES.filter((p) => hay.includes(` ${p} `));
}
