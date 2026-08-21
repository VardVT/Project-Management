/** Project workload + S-curve helpers (no PIC split). 9h / calendar day. */

export const HOURS_PER_DAY = 9

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function parseIsoDate(s) {
  if (!s) return null
  const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function toIsoDate(d) {
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Inclusive calendar days between two dates; 0 if invalid. */
export function daysInclusive(a, b) {
  if (!a || !b) return 0
  const A = startOfDay(a)
  const B = startOfDay(b)
  if (B < A) return 0
  return Math.round((B - A) / 86400000) + 1
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function isTaskClosed(t) {
  const st = String(t.status || '').trim()
  if (st === 'Completed') return true
  const p = Number(t.percent_complete)
  if (Number.isFinite(p) && p >= 100 && st !== 'On Hold') return true
  return false
}

/** Actual close date: completed_at → finish_date fallback if already closed. */
export function actualCloseDate(t, today = startOfDay(new Date())) {
  if (t.completed_at) {
    const d = parseIsoDate(String(t.completed_at).slice(0, 10))
    if (d) return d
  }
  if (isTaskClosed(t)) {
    return parseIsoDate(t.finish_date) || parseIsoDate(t.late_date) || today
  }
  return today
}

export function planRange(t) {
  const s = parseIsoDate(t.start_date)
  const f = parseIsoDate(t.finish_date) || parseIsoDate(t.late_date) || s
  if (!s) return null
  if (f < s) return { start: f, finish: s }
  return { start: s, finish: f }
}

export function actualRange(t, today = startOfDay(new Date())) {
  const s = parseIsoDate(t.start_date)
  if (!s) return null
  let end = actualCloseDate(t, today)
  if (end < s) end = s
  return { start: s, finish: end, closed: isTaskClosed(t) }
}

/**
 * When patching a task, set/clear completed_at around Completed transitions.
 */
export function withCompletionTimestamps(patch, current = {}) {
  const next = { ...patch }
  const merged = { ...current, ...next }
  const nowClosed = isTaskClosed(merged)
  const wasClosed = isTaskClosed(current)
  if (nowClosed && !wasClosed) {
    next.completed_at = new Date().toISOString()
  } else if (!nowClosed && wasClosed) {
    next.completed_at = null
  }
  return next
}

function eachDay(start, finish, fn) {
  let d = startOfDay(start)
  const end = startOfDay(finish)
  while (d <= end) {
    fn(d)
    d = addDays(d, 1)
  }
}

/**
 * Build daily + cumulative Plan/Actual series for a task list (project workload).
 * @param {Array} tasks
 * @param {{ from?: Date, to?: Date, today?: Date, hoursPerDay?: number }} opts
 */
export function buildWorkloadSeries(tasks, opts = {}) {
  const today = startOfDay(opts.today || new Date())
  const H = opts.hoursPerDay ?? HOURS_PER_DAY

  let rangeStart = opts.from ? startOfDay(opts.from) : null
  let rangeEnd = opts.to ? startOfDay(opts.to) : null

  const usable = []
  for (const t of tasks || []) {
    const plan = planRange(t)
    const actual = actualRange(t, today)
    if (!plan && !actual) continue
    usable.push({ t, plan, actual })
    const candidates = []
    if (plan) {
      candidates.push(plan.start, plan.finish)
    }
    if (actual) {
      candidates.push(actual.start, actual.finish)
    }
    candidates.push(today)
    for (const c of candidates) {
      if (!rangeStart || c < rangeStart) rangeStart = c
      if (!rangeEnd || c > rangeEnd) rangeEnd = c
    }
  }

  if (!rangeStart || !rangeEnd) {
    return {
      hoursPerDay: H,
      days: [],
      planDaily: [],
      actualDaily: [],
      planCumulative: [],
      actualCumulative: [],
      totals: {
        planHours: 0,
        actualHoursToDate: 0,
        openTaskCount: 0,
        closedTaskCount: 0,
        planHoursToDate: 0,
      },
    }
  }

  // Cap chart end at today + 14 for readability if plan stretches far
  const softEnd = addDays(today, 14)
  if (rangeEnd > softEnd) rangeEnd = softEnd

  const dayList = []
  eachDay(rangeStart, rangeEnd, (d) => dayList.push(d))

  const planDaily = dayList.map(() => 0)
  const actualDaily = dayList.map(() => 0)
  const index = new Map(dayList.map((d, i) => [toIsoDate(d), i]))

  let planHours = 0
  let actualHoursToDate = 0
  let planHoursToDate = 0
  let openTaskCount = 0
  let closedTaskCount = 0

  for (const { t, plan, actual } of usable) {
    if (isTaskClosed(t)) closedTaskCount += 1
    else openTaskCount += 1

    if (plan) {
      const n = daysInclusive(plan.start, plan.finish)
      planHours += n * H
      eachDay(plan.start, plan.finish, (d) => {
        const i = index.get(toIsoDate(d))
        if (i != null) planDaily[i] += H
        if (d <= today) planHoursToDate += H
      })
    }

    if (actual) {
      const end = actual.finish > today ? today : actual.finish
      if (end >= actual.start) {
        eachDay(actual.start, end, (d) => {
          if (d > today) return
          const i = index.get(toIsoDate(d))
          if (i != null) actualDaily[i] += H
          actualHoursToDate += H
        })
      }
    }
  }

  let pRun = 0
  let aRun = 0
  const planCumulative = planDaily.map((v) => {
    pRun += v
    return pRun
  })
  const actualCumulative = actualDaily.map((v) => {
    aRun += v
    return aRun
  })

  const days = dayList.map((d) => toIsoDate(d))

  return {
    hoursPerDay: H,
    days,
    planDaily,
    actualDaily,
    planCumulative,
    actualCumulative,
    totals: {
      planHours,
      actualHoursToDate,
      planHoursToDate,
      openTaskCount,
      closedTaskCount,
      varianceHours: actualHoursToDate - planHoursToDate,
    },
  }
}
