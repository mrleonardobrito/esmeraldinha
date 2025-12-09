import type { SelectMenuItem } from '@nuxt/ui'
import type { Class, ClassResumed, Teacher } from '@types'
import { DiaryType, ReductionDay } from '@types'

const reductionDayLabels: Record<ReductionDay, string> = {
  [ReductionDay.MONDAY]: 'Segunda-feira',
  [ReductionDay.TUESDAY]: 'Terça-feira',
  [ReductionDay.WEDNESDAY]: 'Quarta-feira',
  [ReductionDay.THURSDAY]: 'Quinta-feira',
  [ReductionDay.FRIDAY]: 'Sexta-feira',
}

const defaultReductionDayLabel = 'Não informado'

export const getReductionDayLabel = (value: number): string => {
  if (Object.values(ReductionDay).includes(value)) {
    return reductionDayLabels[value as ReductionDay] || defaultReductionDayLabel
  }

  console.error('Invalid reduction day value', { value })

  return defaultReductionDayLabel
}

export const getReductionDayOptions = (): SelectMenuItem[] => {
  return Object.values(ReductionDay)
    .filter((value): value is ReductionDay => typeof value === 'number')
    .map(value => ({
      label: reductionDayLabels[value],
      value,
    }))
}

const diaryTypeLabels: Record<DiaryType, string> = {
  [DiaryType.C1]: 'C1',
  [DiaryType.C2]: 'C2',
}
const defaultDiaryTypeLabel = 'Não informado'

export const getDiaryTypeLabel = (value: string): string => {
  if (Object.values(DiaryType).includes(value as DiaryType)) {
    return diaryTypeLabels[value as DiaryType] || defaultDiaryTypeLabel
  }

  console.error('Invalid diary type value', { value })

  return defaultDiaryTypeLabel
}

export const getDiaryTypeOptions = (): SelectMenuItem[] => {
  return Object.values(DiaryType).map((value: DiaryType): SelectMenuItem => ({
    label: diaryTypeLabels[value],
    value: value,
  }))
}

export const getTeacherAvatarUrl = (seed: string | number, withBackground: boolean = true) => {
  const seedEncoded = encodeURIComponent(seed.toString())
  return `https://api.dicebear.com/9.x/dylan/svg?seed=teacher-${seedEncoded}${
    withBackground
      ? '&backgroundType=gradientLinear&backgroundColor=faf0c3,b6e3f4&mood=confused,happy,hopeful,superHappy'
      : '&backgroundType=solid&backgroundColor=transparent&mood=confused,happy,hopeful,superHappy'
  }`
}

export const getTeacherDisplayName = (teacher: Teacher) =>
  teacher.name?.trim() || `Professor ${teacher.code}`

export interface GroupedClassOption {
  school: {
    id: string | number
    name: string
    code: number
  }
  classes: {
    label: string
    fullLabel: string
    value: number
  }[]
}

export const groupClassesBySchool = (classes: (Class | ClassResumed)[]): GroupedClassOption[] => {
  const grouped = classes.reduce((acc, classItem) => {
    const schoolKey = classItem.school?.id || 'unknown'
    const schoolName = classItem.school?.name || 'Escola não informada'
    const schoolCode = classItem.school?.code || 0

    if (!acc[schoolKey]) {
      acc[schoolKey] = {
        school: {
          id: typeof schoolKey === 'number' ? schoolKey : 0,
          name: schoolName,
          code: schoolCode,
        },
        classes: [],
      }
    }

    acc[schoolKey]!.classes.push({
      label: `${classItem.label} (${classItem.code})`,
      fullLabel: `${schoolName} · ${classItem.label} (${classItem.code})`,
      value: classItem.id,
    })

    return acc
  }, {} as Record<string | number, GroupedClassOption>)

  return (Object.values(grouped) as GroupedClassOption[]).sort((a, b) => a.school.name.localeCompare(b.school.name))
}
