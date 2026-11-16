/**
 * Назва категорії береться з файлу бази, наприклад «Медична хімія (тести)».
 * Для карток розділяємо на предмет і назву розділу: subject = «Медична хімія», main = «Тести».
 */
export function splitTitle(title: string): { main: string; subject: string } {
  const m = title.match(/^(.*?)\s*\(([^()]+)\)\s*$/)
  if (!m) return { main: title, subject: '' }
  const inner = m[2].trim()
  return { main: inner.charAt(0).toLocaleUpperCase('uk') + inner.slice(1), subject: m[1].trim() }
}

/** Групи тем за предметом (subject з назви), у порядку першої появи. */
export function groupBySubject<T extends { title: string }>(items: T[]): { subject: string; items: T[] }[] {
  const groups: { subject: string; items: T[] }[] = []
  for (const it of items) {
    const subject = splitTitle(it.title).subject
    const last = groups[groups.length - 1]
    if (last && last.subject === subject) last.items.push(it)
    else groups.push({ subject, items: [it] })
  }
  return groups
}

/** Біологія — інша іконка на картках тем */
export const isBiology = (title: string) => title.startsWith('Медична біологія')
