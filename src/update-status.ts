import { getProjects } from './api/forecast'
import { getHarvestUserId, getTimeEntries } from './api/harvest'
import {
  Assignment,
  HoursSchedule,
  Project,
  Settings,
  StartEndDates,
  TimeEntry,
} from './types'

/**
 * Callback for Stream Deck action.
 *
 * @param {Settings} settings
 */
export const updateStatus = async (settings: Settings) => {
  const data = {}
  try {
    const startEnd: StartEndDates = getStartEndDates()
    const userId: number = await getHarvestUserId(settings)
    const timeEntries: TimeEntry[] = await getTimeEntries(
      settings,
      userId,
      startEnd
    )
    const projects: Project[] = await getProjects(settings)

    projects.forEach((project: Project, id: number) => {
      projects[id].hours_logged = getTotalLoggedHours(timeEntries, id, true)
      projects[id].hours_schedule = getLoggedHoursSchedule(
        timeEntries,
        id,
        true
      )
    })
  } catch (e) {
    // @todo Handle errors.
    console.error(e)
  }

  // do things
}

/**
 * Get start and end dates of current week in ISO 8601.
 *
 * @returns {StartEndDates}
 */
export const getStartEndDates = (): StartEndDates => {
  let currentDate = new Date()
  // first day of the week = current day of the month - current day of the week
  const firstDay = currentDate.getDate() - currentDate.getDay()
  const lastDay = firstDay + 6

  let start = new Date(currentDate)
  let end = new Date(currentDate)
  start.setDate(firstDay)
  end.setDate(lastDay)

  return {
    start: {
      date: start,
      iso: start.toISOString(),
    },
    end: {
      date: end,
      iso: end.toISOString(),
    },
  }
}

/**
 * Get total logged hours for a project from a list of time entries.
 *
 * @param {TimeEntry[]} timeEntries
 * @param {number} projectId
 * @param {boolean} billable null = all entries, true = billable entries only, false = non-billable
 * @returns {number}
 */
export const getTotalLoggedHours = (
  timeEntries: TimeEntry[],
  projectId: number = 0,
  billable: boolean = null
): number => {
  let hours: number = 0
  timeEntries.forEach((timeEntry: TimeEntry) => {
    if (projectId && timeEntry.project.id !== projectId) {
      return
    }
    if (billable !== null && billable !== timeEntry.billable) {
      return
    }
    hours += timeEntry.hours
  })
  return hours
}

/**
 * Get total assigned hours for a project from a list of time entries.
 *
 * @param {HoursSchedule} schedule
 * @returns {number} hours
 */
export const getHoursToTodayFromSchedule = (schedule: HoursSchedule): number => {
  let hours: number = 0
  const currentDayOfWeek = new Date().getDay()
  for (let i = 0; i <= currentDayOfWeek; i++) {
    hours += schedule[i]
  }
  return hours
}

/**
 * Get a week's schedule of logged hours for a project from a list of time entries.
 *
 * This function only sorts data by day of the week. All data must be from the same week
 * for an accurate schedule.
 *
 * @param {TimeEntry[]} timeEntries
 * @param {number} projectId
 * @param {boolean} billable null = all entries, true = billable entries only, false = non-billable
 * @returns {HoursSchedule}
 */
export const getLoggedHoursSchedule = (
  timeEntries: TimeEntry[],
  projectId: number = 0,
  billable: boolean = null
): HoursSchedule => {
  let schedule: HoursSchedule = Array(7).fill(0)
  timeEntries.forEach((timeEntry: TimeEntry) => {
    if (projectId && timeEntry.project.id !== projectId) {
      return
    }
    if (billable !== null && billable !== timeEntry.billable) {
      return
    }

    let day: number = new Date(timeEntry.created_at).getDay()
    schedule[day] += timeEntry.hours
  })
  return schedule
}

/**
 * Get a week's schedule of assigned hours for a project from a list of assignments.
 *
 * This function only sorts data by day of the week. All data must be from the same week
 * for an accurate schedule.
 *
 * @param {Assignment[]} assignments
 * @param {number} projectId
 * @param {boolean} billable null = all entries, true = billable entries only, false = non-billable
 * @returns {HoursSchedule}
 */
export const getAssignedHoursSchedule = (
  assignments: Assignment[],
  startEnd: StartEndDates,
  projects: Project[],
  projectId: number = 0,
  billable: boolean = null
): HoursSchedule => {
  let schedule: HoursSchedule = Array(7).fill(0)
  assignments.forEach((assignment: Assignment) => {
    if (projectId && assignment.project_id !== projectId) {
      return
    }
    if (
      billable !== null &&
      billable !== projects[assignment.project_id].billable
    ) {
      return
    }

    const assignmentDays = getAssignmentDays(assignment, startEnd)

    // Loop each assigned day, adding hours per day to that day of the week in the schedule.
    for (let i = 0; i < assignmentDays.days; i++) {
      let cDate = new Date(assignmentDays.start)
      cDate.setDate(cDate.getDate() + i)
      schedule[cDate.getDay()] += assignment.allocationHours
    }
  })

  return schedule
}

export const getAssignmentDays = (
  assignment: Assignment,
  startEnd: StartEndDates
): { start: Date; days: number } => {
  // If the assignment start date is before the current week's start date, then
  // we count only beginning at startEnd.start and not assignment.start_date
  let startDate = new Date(assignment.start_date)
  if (startEnd.start.date > startDate) {
    startDate = startEnd.start.date
  }
  // Don't count Sunday.
  if (startDate.getDay() === 0) {
    startDate.setDate(startDate.getDate() + 1)
  }
  // If the start date is in the future, don't count this assignment.
  if (startDate >= startEnd.end.date) {
    return
  }

  // If the assignment end date is after the current week's end date, then
  // we count ending at startEnd.end and not assignment.end_date
  let endDate = new Date(assignment.end_date)
  if (endDate > startEnd.end.date) {
    endDate = startEnd.end.date
  }
  // Don't count Saturday.
  if (endDate.getDay() === 6) {
    endDate.setDate(endDate.getDate() - 1)
  }
  // If the end date is in the past, don't count this assignment.
  if (endDate <= startEnd.start.date) {
    return
  }

  // Get the total number of workdays for this assignment to look at.
  const timeRange = endDate.getTime() - startDate.getTime()
  const days = Math.ceil(timeRange / (1000 * 3600 * 24) + 1)

  return {
    start: startDate,
    days: days,
  }
}
