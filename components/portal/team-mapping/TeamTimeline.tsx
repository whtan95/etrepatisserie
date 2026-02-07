"use client"

import type { TeamDaySchedule, TimelineEvent } from "@/lib/mapping-types"
import { buildTimelineEvents, formatTimeForDisplay } from "@/lib/mapping-utils"
import { getTeamColor } from "@/lib/mapping-types"
import { MapPin, Clock, Truck, CheckCircle2, ArrowRight, Home } from "lucide-react"
import { getTeamDisplayName } from "@/lib/team-settings"

interface TeamTimelineProps {
  schedules: TeamDaySchedule[]
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}

function TimelineIcon({ type, color }: { type: TimelineEvent["type"]; color: string }) {
  const iconClass = "h-4 w-4"

  switch (type) {
    case "depart-hub":
      return <Truck className={iconClass} style={{ color }} />
    case "arrive-site":
      return <MapPin className={iconClass} style={{ color }} />
    case "task-start":
      return <Clock className={iconClass} style={{ color }} />
    case "task-end":
      return <CheckCircle2 className={iconClass} style={{ color }} />
    case "depart-site":
      return <ArrowRight className={iconClass} style={{ color }} />
    case "arrive-hub":
      return <Home className={iconClass} style={{ color }} />
    default:
      return <Clock className={iconClass} style={{ color }} />
  }
}

function TeamSection({
  schedule,
  selectedTask,
  onTaskSelect,
}: {
  schedule: TeamDaySchedule
  selectedTask: string | null
  onTaskSelect: (taskId: string | null) => void
}) {
  const events = buildTimelineEvents(schedule)
  const color = getTeamColor(schedule.team)

  if (events.length === 0) {
    return (
      <div className="p-4 border-b border-border last:border-b-0">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold">{getTeamDisplayName(schedule.team)}</span>
        </div>
        <p className="text-sm text-muted-foreground">No tasks scheduled</p>
      </div>
    )
  }

  return (
    <div className="p-4 border-b border-border last:border-b-0">
      {/* Team header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="font-semibold">{getTeamDisplayName(schedule.team)}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {schedule.tasks.length} task{schedule.tasks.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-6">
        {/* Vertical line */}
        <div
          className="absolute left-[7px] top-2 bottom-2 w-0.5"
          style={{ backgroundColor: color }}
        />

        {/* Events */}
        <div className="space-y-3">
          {events.map((event, index) => {
            const isSelected = event.orderNumber
              ? selectedTask === `${event.orderNumber}-setup` ||
                selectedTask === `${event.orderNumber}-dismantle` ||
                selectedTask === `${event.orderNumber}-other-adhoc`
              : false

            const isClickable = event.orderNumber && (
              event.type === "arrive-site" ||
              event.type === "task-start" ||
              event.type === "task-end"
            )

            return (
              <div
                key={`${event.id}-${index}`}
                className={`relative flex items-start gap-3 ${
                  isClickable ? "cursor-pointer hover:bg-accent/50 -mx-2 px-2 py-1 rounded" : ""
                } ${isSelected ? "bg-accent/50 -mx-2 px-2 py-1 rounded" : ""}`}
                onClick={() => {
                  if (isClickable && event.orderNumber) {
                    const taskId = events.find(
                      e => e.orderNumber === event.orderNumber && e.type === "task-start"
                    )
                    if (taskId) {
                      const taskType = taskId.label.includes("Setup") ? "setup"
                        : taskId.label.includes("Dismantle") ? "dismantle"
                        : "other-adhoc"
                      onTaskSelect(
                        selectedTask === `${event.orderNumber}-${taskType}`
                          ? null
                          : `${event.orderNumber}-${taskType}`
                      )
                    }
                  }
                }}
              >
                {/* Dot */}
                <div
                  className="absolute left-[-17px] mt-0.5 w-3 h-3 rounded-full border-2 bg-background z-10"
                  style={{ borderColor: color }}
                />

                {/* Icon and content */}
                <div className="flex items-start gap-2 flex-1">
                  <TimelineIcon type={event.type} color={color} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {formatTimeForDisplay(event.time)}
                      </span>
                      <span className="text-sm font-medium">{event.label}</span>
                    </div>

                    {/* Show details for key events */}
                    {(event.orderNumber && (event.type === "arrive-site" || event.type === "task-start" || event.type === "depart-hub")) && (
                      <div className="mt-1 text-xs space-y-0.5">
                        <div className="font-medium" style={{ color }}>
                          {event.orderNumber}
                        </div>
                        {event.customerName && (
                          <div className="text-muted-foreground">{event.customerName}</div>
                        )}
                        {event.address && (
                          <div className="text-muted-foreground truncate max-w-[200px]">
                            {event.address}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      {schedule.journey && (
        <div className="mt-4 pt-3 border-t border-border/50 text-xs text-muted-foreground flex gap-4">
          <span>Total: {schedule.journey.totalDistanceKm.toFixed(1)} km</span>
          <span>{Math.round(schedule.journey.totalDurationMins)} mins travel</span>
        </div>
      )}
    </div>
  )
}

export default function TeamTimeline({
  schedules,
  selectedTask,
  onTaskSelect,
}: TeamTimelineProps) {
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
      {schedules.map(schedule => (
        <TeamSection
          key={schedule.team}
          schedule={schedule}
          selectedTask={selectedTask}
          onTaskSelect={onTaskSelect}
        />
      ))}
    </div>
  )
}
