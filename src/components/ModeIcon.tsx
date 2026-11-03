import { BookOpen, Dices, GraduationCap, Layers, RotateCcw, Target, type LucideProps } from 'lucide-react'
import type { Mode } from '../lib/types'

const ICONS = { all: Layers, learn: BookOpen, exam: GraduationCap, mistakes: RotateCcw, weak: Target, random: Dices }

export const MODE_TONE: Record<Mode, string> = {
  learn: 'bg-accent-soft text-accent',
  exam: 'bg-[#e8f1fe] text-[#2f6fd6] dark:bg-[#172843] dark:text-[#7cb0ff]',
  all: 'bg-[#eaf6f4] text-[#138a7a] dark:bg-[#122c29] dark:text-[#4fd1bd]',
  random: 'bg-[#f6eefc] text-[#9146c9] dark:bg-[#2a1b38] dark:text-[#c792f2]',
  mistakes: 'bg-bad-soft text-bad',
  weak: 'bg-warn-soft text-warn',
}

export function ModeIcon({ mode, ...props }: { mode: Mode } & LucideProps) {
  const Icon = ICONS[mode]
  return <Icon {...props} />
}
