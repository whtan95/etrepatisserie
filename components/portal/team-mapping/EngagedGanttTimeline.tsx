"use client"

import type { ScheduledTask, TeamDaySchedule } from "@/lib/mapping-types"
import { cn } from "@/lib/utils"
import { getTeamDisplayName } from "@/lib/team-settings"
import { getLunchWindowFromLocalStorage, parseHHMMToMinutes } from "@/lib/time-window"

interface EngagedGanttTimelineProps {
  schedules: TeamDaySchedule[]
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}

const START_MINUTES = 6 * 60 + 30 // 06:30
const END_MINUTES = 21 * 60 // 21:00
const PIXELS_PER_MINUTE = 2
const LABEL_WIDTH_PX = 120

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

const toMinutes = (hhmm: string) => {
  if (!hhmm) return null
  const [h, m] = hhmm.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

const formatHourLabel = (mins: number) => {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const period = h >= 12 ? "pm" : "am"
  return `${hour12}.${m.toString().padStart(2, "0")}${period}`
}

const getTaskLabel = (task: ScheduledTask) => {
  if (task.taskType === "setup") return "Setup"
  if (task.taskType === "dismantle") return "Dismantle"
  return "Other"
}

const shortAddress = (address: string) => {
  if (!address) return ""
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean)
  const short = parts.slice(0, 2).join(", ")
  return short || address
}

const getEngagedStart = (task: ScheduledTask) =>
  task.departureTime || task.taskStartTime || ""

const getEngagedEnd = (task: ScheduledTask) =>
  task.hubArrivalTime || task.taskEndTime || task.returnDepartureTime || ""

function buildLanes(tasks: Array<{ start: number; end: number; task: ScheduledTask }>) {
  const lanes: { lastEnd: number }[] = []
  const placed: Array<{ lane: number; start: number; end: number; task: ScheduledTask }> = []

  for (const item of tasks) {
    let laneIndex = lanes.findIndex((l) => item.start >= l.lastEnd)
    if (laneIndex === -1) {
      lanes.push({ lastEnd: item.end })
      laneIndex = lanes.length - 1
    } else {
      lanes[laneIndex].lastEnd = item.end
    }
    placed.push({ lane: laneIndex, ...item })
  }

  return { laneCount: lanes.length, placed }
}

function Axis({ width }: { width: number }) {
  const ticks: Array<{ mins: number; isHour: boolean }> = []
  for (let t = START_MINUTES; t <= END_MINUTES; t += 30) {
    ticks.push({ mins: t, isHour: t % 60 === 0 })
  }

  return (
    <div className="flex items-stretch">
      <div
        className="shrink-0 px-2 py-2 text-[11px] font-medium text-muted-foreground border-r border-border"
        style={{ width: LABEL_WIDTH_PX }}
      >
        Team
      </div>
      <div className="relative" style={{ width }}>
        <div className="h-10 relative">
          {ticks.map((t) => {
            const left = (t.mins - START_MINUTES) * PIXELS_PER_MINUTE
            return (
              <div
                key={t.mins}
                className={cn(
                  "absolute top-0 h-full",
                  t.isHour ? "border-l border-border" : "border-l border-border/40"
                )}
                style={{ left }}
              >
                <div
                  className={cn(
                    "absolute top-1 text-[10px] text-muted-foreground whitespace-nowrap",
                    t.isHour ? "font-medium" : "opacity-80"
                  )}
                  style={{ left: 2 }}
                >
                  {formatHourLabel(t.mins)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TeamRow({
  schedule,
  selectedTask,
  onTaskSelect,
}: {
  schedule: TeamDaySchedule
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}) {
  const width = (END_MINUTES - START_MINUTES) * PIXELS_PER_MINUTE
  const { lunchStartTime, lunchEndTime } = getLunchWindowFromLocalStorage()
  const lunchStartMins = parseHHMMToMinutes(lunchStartTime)
  const lunchEndMins = parseHHMMToMinutes(lunchEndTime)
  const tasks = [...schedule.tasks]
    .map((task) => {
      const startStr = getEngagedStart(task)
      const endStr = getEngagedEnd(task)
      const start = toMinutes(startStr)
      const end = toMinutes(endStr)
      if (start === null || end === null) return null
      const clampedStart = clamp(start, START_MINUTES, END_MINUTES)
      const clampedEnd = clamp(end, START_MINUTES, END_MINUTES)
      if (clampedEnd <= clampedStart) return null
      return { start: clampedStart, end: clampedEnd, task }
    })
    .filter(Boolean) as Array<{ start: number; end: number; task: ScheduledTask }>

  tasks.sort((a, b) => a.start - b.start)
  const { laneCount, placed } = buildLanes(tasks)
  const rowHeight = Math.max(1, laneCount) * 20 + 10

  return (
    <div className="flex items-stretch border-b border-border last:border-b-0 bg-background">
      <div
        className="shrink-0 px-2 py-2 border-r border-border bg-background sticky left-0 z-10"
        style={{ width: LABEL_WIDTH_PX }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: schedule.color }}
          />
          <div className="text-xs font-semibold truncate max-w-[96px]">
            {getTeamDisplayName(schedule.team)}
          </div>
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground">
          {schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="relative" style={{ width, height: rowHeight }}>
        {/* lunch window band */}
        {lunchStartMins !== null && lunchEndMins !== null && lunchEndMins > lunchStartMins && (
          (() => {
            const ls = clamp(lunchStartMins, START_MINUTES, END_MINUTES)
            const le = clamp(lunchEndMins, START_MINUTES, END_MINUTES)
            if (le <= ls) return null
            const left = (ls - START_MINUTES) * PIXELS_PER_MINUTE
            const bandWidth = (le - ls) * PIXELS_PER_MINUTE
            return (
              <div
                className="absolute top-0 h-full bg-yellow-100/40 pointer-events-none"
                style={{ left, width: bandWidth }}
              />
            )
          })()
        )}

        {/* vertical grid lines */}
        {Array.from({ length: ((END_MINUTES - START_MINUTES) / 30) + 1 }).map((_, idx) => {
          const mins = START_MINUTES + idx * 30
          const left = (mins - START_MINUTES) * PIXELS_PER_MINUTE
          const isHour = mins % 60 === 0
          return (
            <div
              key={mins}
              className={cn(
                "absolute top-0 h-full",
                isHour ? "border-l border-border/70" : "border-l border-border/30"
              )}
              style={{ left }}
            />
          )
        })}

        {/* bars */}
        {placed.map(({ lane, start, end, task }) => {
          const left = (start - START_MINUTES) * PIXELS_PER_MINUTE
          const barWidth = Math.max(2, (end - start) * PIXELS_PER_MINUTE)
          const top = 5 + lane * 20
          const taskId = `${task.orderNumber}-${task.taskType}`
          const isSelected = selectedTask === taskId
          const addr = shortAddress(task.siteAddress)
          const taskStart = toMinutes(task.taskStartTime || task.arrivalTime || "")
          const taskEnd = toMinutes(task.taskEndTime || task.returnDepartureTime || "")
          const overlayStart = taskStart === null ? null : clamp(taskStart, START_MINUTES, END_MINUTES)
          const overlayEnd = taskEnd === null ? null : clamp(taskEnd, START_MINUTES, END_MINUTES)
          const overlayLeft =
            overlayStart === null ? 0 : (overlayStart - start) * PIXELS_PER_MINUTE
          const overlayWidth =
            overlayStart === null || overlayEnd === null
              ? 0
              : Math.max(0, (overlayEnd - overlayStart) * PIXELS_PER_MINUTE)

          const lunchOverlap =
            overlayStart !== null &&
            overlayEnd !== null &&
            lunchStartMins !== null &&
            lunchEndMins !== null
              ? {
                start: clamp(Math.max(overlayStart, lunchStartMins), START_MINUTES, END_MINUTES),
                end: clamp(Math.min(overlayEnd, lunchEndMins), START_MINUTES, END_MINUTES),
              }
              : null
          const lunchOverlapWidth =
            lunchOverlap && lunchOverlap.end > lunchOverlap.start
              ? (lunchOverlap.end - lunchOverlap.start) * PIXELS_PER_MINUTE
              : 0
          const lunchOverlapLeft =
            lunchOverlap && lunchOverlapWidth > 0 && overlayStart !== null
              ? (lunchOverlap.start - start) * PIXELS_PER_MINUTE
              : 0

          const titleParts = [
            task.orderNumber,
            getTaskLabel(task),
            task.siteAddress,
            `${formatHourLabel(start)} - ${formatHourLabel(end)}`,
          ].filter(Boolean)
          return (
            <a
              key={taskId}
              href={`/portal/scheduling/${task.orderNumber}`}
              title={titleParts.join(" | ")}
              onClick={() => onTaskSelect(isSelected ? null : taskId)}
              className={cn(
                "absolute rounded-md px-2 text-[11px] font-semibold text-black/90 truncate border focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-1 focus:ring-offset-background",
                isSelected ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : ""
              )}
              style={{
                left,
                top,
                width: barWidth,
                height: 18,
                backgroundColor: "rgba(148, 163, 184, 0.6)", // slate-400-ish
                borderColor: "rgba(100, 116, 139, 0.8)",
                opacity: isSelected ? 1 : 0.85,
              }}
            >
              {/* Task duration overlay (on-site) */}
              {overlayWidth > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-md"
                  style={{
                    left: overlayLeft,
                    width: overlayWidth,
                    backgroundColor: schedule.color,
                    opacity: 0.95,
                  }}
                />
              )}
              {/* Lunch overlap overlay (on-site) */}
              {lunchOverlapWidth > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-md pointer-events-none"
                  style={{
                    left: lunchOverlapLeft,
                    width: lunchOverlapWidth,
                    backgroundColor: "rgba(250, 204, 21, 0.55)", // yellow-400-ish
                  }}
                />
              )}
              <span className="relative z-10">
                {task.orderNumber}{addr ? ` - ${addr}` : ""}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

export default function EngagedGanttTimeline({
  schedules,
  selectedTask,
  onTaskSelect,
}: EngagedGanttTimelineProps) {
  if (schedules.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">No teams scheduled for this date</p>
          <p className="text-xs mt-1">Select a date with scheduled tasks</p>
        </div>
      </div>
    )
  }

  const width = (END_MINUTES - START_MINUTES) * PIXELS_PER_MINUTE
  const contentWidth = LABEL_WIDTH_PX + width

  return (
    <div className="overflow-auto">
      <div className="min-w-max" style={{ width: contentWidth }}>
        <div className="sticky top-0 z-20 bg-muted/30 border-b border-border">
          <Axis width={width} />
        </div>
        {schedules.map((schedule) => (
          <TeamRow
            key={schedule.team}
            schedule={schedule}
            selectedTask={selectedTask}
            onTaskSelect={onTaskSelect}
          />
        ))}
      </div>
    </div>
  )
}
