import type { AnnoPulseAnnotation } from '../../types/annotation'
import { compareAnnoPulseAnnotations } from '../explorer/filter'

export type AnnoPulseQualityLevel = 'good' | 'needsAttention' | 'poor'

export type AnnoPulseQualityIssueCode =
  | 'emptyMessage'
  | 'vagueMessage'
  | 'missingAction'
  | 'missingContext'
  | 'missingOwner'
  | 'invalidDueDate'
  | 'invalidExpiresDate'
  | 'overdue'
  | 'expired'

export interface AnnoPulseQualityIssue {
  readonly code: AnnoPulseQualityIssueCode
  readonly message: string
  readonly penalty: number
}

export interface AnnoPulseAnnotationQuality {
  readonly annotationId: string
  readonly issues: readonly AnnoPulseQualityIssue[]
  readonly level: AnnoPulseQualityLevel
  readonly score: number
}

export interface AnnoPulseQualityReport {
  readonly annotations: readonly AnnoPulseAnnotationQuality[]
  readonly counts: Readonly<Record<AnnoPulseQualityLevel, number>>
}

export interface ScoreAnnoPulseAnnotationsOptions {
  readonly includeIgnored?: boolean
  readonly includeResolved?: boolean
  readonly now: Date
}

interface CalendarDate {
  readonly day: number
  readonly month: number
  readonly year: number
}

const datePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u
const vagueMessages = new Set([
  'fixme',
  'later',
  'something',
  'tbd',
  'todo',
  'xxx',
  '以后',
  '处理',
])
const englishActionPattern =
  /\b(?:add|adds|added|adding|remove|removes|removed|removing|fix|fixes|fixed|fixing|replace|replaces|replaced|replacing|refactor|refactors|refactored|refactoring|investigate|investigates|investigated|investigating|document|documents|documented|documenting|update|updates|updated|updating|verify|verifies|verified|verifying)\b/u
const chineseActionPattern = /添加|删除|修复|重构|检查|更新|处理|补充|验证/u

const issueDefinitions: Readonly<
  Record<AnnoPulseQualityIssueCode, Omit<AnnoPulseQualityIssue, 'code'>>
> = {
  emptyMessage: {
    message: 'Add a descriptive message.',
    penalty: 45,
  },
  vagueMessage: {
    message: 'Replace the placeholder with a specific description.',
    penalty: 25,
  },
  missingAction: {
    message: 'Describe the action to take.',
    penalty: 15,
  },
  missingContext: {
    message: 'Add enough context to make the action clear.',
    penalty: 15,
  },
  missingOwner: {
    message: 'Assign an owner.',
    penalty: 15,
  },
  invalidDueDate: {
    message: 'Use a real due date in YYYY-MM-DD format.',
    penalty: 10,
  },
  invalidExpiresDate: {
    message: 'Use a real expiry date in YYYY-MM-DD format.',
    penalty: 10,
  },
  overdue: {
    message: 'Update the overdue due date.',
    penalty: 20,
  },
  expired: {
    message: 'Update or remove the expired annotation.',
    penalty: 25,
  },
}

function normalizeMessage(message: string): string {
  return message
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[\p{P}\p{Z}\s]+/gu, ' ')
    .trim()
}

function parseCalendarDate(value: string): CalendarDate | undefined {
  const match = datePattern.exec(value)
  if (!match) {
    return undefined
  }

  if (!match.groups) {
    return undefined
  }

  const { day: dayText, month: monthText, year: yearText } = match.groups
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }

  return { day, month, year }
}

function currentCalendarDate(now: Date): CalendarDate {
  return {
    day: now.getDate(),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  }
}

function isBefore(left: CalendarDate, right: CalendarDate): boolean {
  return (
    left.year < right.year ||
    (left.year === right.year && left.month < right.month) ||
    (left.year === right.year &&
      left.month === right.month &&
      left.day < right.day)
  )
}

function addIssue(
  issues: AnnoPulseQualityIssue[],
  code: AnnoPulseQualityIssueCode,
): void {
  issues.push({ code, ...issueDefinitions[code] })
}

function hasAction(message: string): boolean {
  return (
    englishActionPattern.test(message) || chineseActionPattern.test(message)
  )
}

function qualityLevel(score: number): AnnoPulseQualityLevel {
  if (score >= 80) {
    return 'good'
  }

  if (score >= 50) {
    return 'needsAttention'
  }

  return 'poor'
}

function addMessageIssues(
  issues: AnnoPulseQualityIssue[],
  message: string,
  taskOriented: boolean,
): void {
  if (message === '') {
    addIssue(issues, 'emptyMessage')
    return
  }

  if (!taskOriented) {
    return
  }

  if (vagueMessages.has(message)) {
    addIssue(issues, 'vagueMessage')
    return
  }

  if (!hasAction(message)) {
    addIssue(issues, 'missingAction')
    return
  }

  if (message.split(' ').length < 2) {
    addIssue(issues, 'missingContext')
  }
}

function addDateIssues(
  issues: AnnoPulseQualityIssue[],
  annotation: AnnoPulseAnnotation,
  today: CalendarDate,
): void {
  const dueDate = parseCalendarDate(annotation.dueDate ?? '')
  const expiresDate = parseCalendarDate(annotation.expiresDate ?? '')

  if (annotation.dueDate !== undefined && dueDate === undefined) {
    addIssue(issues, 'invalidDueDate')
  }

  if (annotation.expiresDate !== undefined && expiresDate === undefined) {
    addIssue(issues, 'invalidExpiresDate')
  }

  if (dueDate !== undefined && isBefore(dueDate, today)) {
    addIssue(issues, 'overdue')
  }

  if (expiresDate !== undefined && isBefore(expiresDate, today)) {
    addIssue(issues, 'expired')
  }
}

export function scoreAnnoPulseAnnotation(
  annotation: AnnoPulseAnnotation,
  now: Date,
): AnnoPulseAnnotationQuality {
  const issues: AnnoPulseQualityIssue[] = []
  const message = normalizeMessage(annotation.message)
  const taskOriented = annotation.category !== 'note'

  addMessageIssues(issues, message, taskOriented)

  if (taskOriented && (annotation.owner?.trim() ?? '') === '') {
    addIssue(issues, 'missingOwner')
  }

  addDateIssues(issues, annotation, currentCalendarDate(now))

  const score = Math.max(
    0,
    100 - issues.reduce((total, issue) => total + issue.penalty, 0),
  )

  return {
    annotationId: annotation.id,
    issues,
    level: qualityLevel(score),
    score,
  }
}

export function scoreAnnoPulseAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  options: ScoreAnnoPulseAnnotationsOptions,
): AnnoPulseQualityReport {
  const qualities = annotations
    .filter(annotation => {
      if (annotation.resolved && !options.includeResolved) {
        return false
      }

      return !annotation.ignored || options.includeIgnored === true
    })
    .toSorted(compareAnnoPulseAnnotations)
    .map(annotation => scoreAnnoPulseAnnotation(annotation, options.now))
  const counts: Record<AnnoPulseQualityLevel, number> = {
    good: 0,
    needsAttention: 0,
    poor: 0,
  }

  for (const quality of qualities) {
    counts[quality.level]++
  }

  return { annotations: qualities, counts }
}
