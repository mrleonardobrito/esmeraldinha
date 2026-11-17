/** Removes text appended after an uppercase estudante name by the portal. */
export function limparNomeDoEstudante(nome: string): string {
  const trimmed = nome.trim();
  if (!/^[A-ZÀ-ÖØ-Þ]{2}/u.test(trimmed)) return trimmed;
  return trimmed.replace(/(?<=[A-ZÀ-ÖØ-Þ])(?:[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ]|\s+[A-ZÀ-ÖØ-Þ]?[a-zà-öø-ÿ]|[a-zà-öø-ÿ]|[^A-ZÀ-ÖØ-Þ\s'\-]).*$/u, '').trim();
}
