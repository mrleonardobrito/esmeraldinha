// Enums baseados nos choices do Django
export enum ReductionDay {
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
}

export enum DiaryType {
  C1 = "c1",
  C2 = "c2",
}

export interface School {
  readonly id: number;
  readonly name: string;
  readonly code: number;
}

export interface Gradebook {
  readonly id: number;
  readonly title: string;
  readonly status: GradebookStatus;
  readonly teacher: Teacher;
  readonly calendar: AcademicCalendar;
  readonly progress: number;
  readonly created_at: string;
}

export interface GradebookCreate {
  readonly teacher_id: number;
  readonly calendar_id: number;
  readonly title: string;
  readonly progress?: number;
}

export interface GradebookUpdate {
  readonly teacher_id?: number;
  readonly calendar_id?: number;
  readonly status?: GradebookStatus;
  readonly title?: string;
  readonly progress?: number;
}

export enum GradebookStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export interface Teacher {
  readonly id: number;
  readonly code: string;
  readonly reduction_day: number;
  readonly diary_type: string;
  readonly school: School;
}

export interface TeacherCreate {
  readonly code: string;
  readonly reduction_day: ReductionDay;
  readonly diary_type: DiaryType;
  readonly school_id: number;
}

export interface TeacherUpdate {
  readonly code?: string;
  readonly reduction_day?: ReductionDay;
  readonly diary_type?: DiaryType;
  readonly school_id?: number;
}

export interface AcademicCalendar {
  readonly id: number;
  readonly year: number;
  readonly calendar_data: Record<string, unknown>;
  readonly processed_at: string;
}
