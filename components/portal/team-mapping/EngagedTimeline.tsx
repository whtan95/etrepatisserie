"use client"

import type { ScheduledTask, TeamDaySchedule } from "@/lib/mapping-types"
import { formatTimeForDisplay } from "@/lib/mapping-utils"
import { getTeamColor } from "@/lib/mapping-types"
import { Clock, MapPin } from "lucide-react"

interface EngagedTimelineProps {
  schedules: TeamDaySchedule[]
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}

const getTaskLabel = (task: ScheduledTask) => {
  if (task.taskType === "setup") return "Setup"
  if (task.taskType === "dismantle") return "Dismantle"
  return "Other Adhoc"
}

const getEngagedStart = (task: ScheduledTask) =>
  task.departureTime || task.taskStartTime || ""

const getEngagedEnd = (task: ScheduledTask) => task.taskEndTime || ""

function TeamEngagedSection({
  schedule,
  selectedTask,
  onTaskSelect,
}: {
  schedule: TeamDaySchedule
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}) {
  const color = getTeamColor(schedule.team)
  const tasks = [...schedule.tasks].sort((a, b) => {
    const aStart = getEngagedStart(a) || "23:59"
    const bStart = getEngagedStart(b) || "23:59"
    return aStart.localeCompare(bStart)
  })

  return (
    <div className="p-4 border-b border-border last:border-b-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-semibold text-sm">{schedule.team}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="space-y-2">
        {tasks.map((task) => {
          const start = getEngagedStart(task)
          const end = getEngagedEnd(task)
          const taskId = `${task.orderNumber}-${task.taskType}`
          const isSelected = selectedTask === taskId

          return (
            <button
              type="button"
              key={taskId}
              onClick={() => onTaskSelect(isSelected ? null : taskId)}
              className={`w-full text-left rounded-md px-2 py-1 transition-colors ${
                isSelected ? "bg-accent/50" : "hover:bg-accent/30"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                    {start && end ? `${formatTimeForDisplay(start)}–${formatTimeForDisplay(end)}` : "-"}
                  </span>
                  <span className="text-xs font-semibold truncate" style={{ color }}>
                    {task.orderNumber}
                  </span>
                  <span className="text-xs text-foreground truncate">
                    {getTaskLabel(task)}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {task.customerName || ""}
                </span>
              </div>

              {task.siteAddress && (
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{task.siteAddress}</span>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EngagedTimeline({
  schedules,
  selectedTask,
  onTaskSelect,
}: EngagedTimelineProps) {
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

  return (
    <div className="h-full overflow-y-auto">
      {schedules.map((schedule) => (
        <TeamEngagedSection
          key={schedule.team}
          schedule={schedule}
          selectedTask={selectedTask}
          onTaskSelect={onTaskSelect}
        />
      ))}
    </div>
  )
}

