import type { Class } from '@types'

export const filterClassesBySchool = (classes: Class[], schoolId: number) => {
  return classes.filter((cls: Class) => cls.school_id === schoolId)
}

export const filterClassesByTeacher = (classes: Class[], teacherId: number) => {
  return classes.filter((cls: Class) => cls.teacher_id === teacherId)
}
