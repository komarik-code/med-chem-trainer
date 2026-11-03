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
