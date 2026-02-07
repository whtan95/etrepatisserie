# AI Assistant (AI Scheduler) Rules & Examples

This document explains the rules used by the **AI Schedule** feature (co-join, timing flexibility, and OT handling).

## Terms

- **Time Slot**: Customer preferred window, e.g. `15:00–16:30`.
- **Waiting Threshold** (`waitingHours`): Flexibility around the time slot.  
  Example: `1.5h` means the acceptable window is **slot start - 1.5h** to **slot end + 1.5h**.
- **Ops Start Rule** (`workStartTime`): Operations start at `08:00`. If travel would require departing earlier, clamp departure to `08:00` and accept a later ETA (arrival may not match the exact slot start).
- **Co-Join**: Reuse the **same team** to chain two nearby jobs without returning to hub.
  - **Tail Co-Join**: New job goes **after** an earlier job.
  - **Head Co-Join**: New job goes **before** a later job (allowed when the order sequence can swap).
- **OT (Overtime)**: A task **ends after** `workEndTime` (default `16:30`).

## Optimize Priority (high → low)

1. **Avoid OT** (company policy: OT is discouraged)
2. **Co-Join** (reduce travel + avoid deploying a new team)  
   - Must satisfy radius + waiting threshold
3. **Customer Time Window** (slot ± waiting threshold)
4. **Workload Balance** (pick least busy available team)

## Constraints

### Sales Order time rule (same-day)

If the **Sales Order is created at time `T`** and the **setup is on the same calendar day**, the AI must **not** schedule:

- Setup **departure** time earlier than `T`, or
- Setup **arrival/confirmed** time earlier than `T`

If this happens, the Scheduling UI must **block saving**.

Example:

- Sales Order created: **02/02 16:00**
- Customer preferred setup slot: **15:30–16:00**

AI must schedule setup **from 16:00 onwards** (even if the preferred slot becomes impossible).

### Preferred time = NONE (no time window)

If **preferred setup time** and **preferred dismantle time** are both `NONE`, treat the job as fully flexible (no customer time window).

Priority order becomes:

1. **Avoid OT by deploying any free team first**
2. **Co-join second** (even if it may trigger OT)
3. **Workload balance** (pick least busy available team)

### Co-Join constraints

Co-Join is allowed only when **all** are true:

- Sites are within `radiusKm`
- Waiting between tasks is within `waitingHours`
- Both orders stay within their **own** acceptable window: `time slot ± waitingHours`

### OT policy (Prompt)

If the AI schedule results in OT, the UI will prompt you to choose:

- **Allow OT** (continue with current schedule), or
- **Deploy another team** (re-run scheduling with co-join disabled and avoid OT when possible)

### OT vs Co-Join Outcomes (What You Will See)

Use these cases to validate behavior during testing:

**Case A: Co-join = NO OT, and No co-join = NO OT**
- **Prompt(s)**: Co-join Yes/No prompt may appear (tail co-join scenario).
- **OT prompt**: **No** (because no OT is detected).
- **Impact**: Accepting co-join just reduces travel; no overtime in either option.

**Case B: Co-join = OT, but No co-join = NO OT**
- **Prompt(s)**: OT prompt appears.
- **Recommendation**: **Deploy another team** (disables co-join).
- **Impact**: Choosing **Allow OT** keeps the co-join schedule (OT happens). Choosing **Deploy another team** removes OT.

**Case C: Co-join = OT, and No co-join = OT (unavoidable)**
- **Prompt(s)**: OT prompt appears.
- **Recommendation**: **Allow OT** (disabling co-join does not avoid OT).
- **Impact**: Either choice still results in OT; deploying another team only changes which team absorbs OT or the finish time.

## Example: Dismantle Slot `15:00–16:30` with `waitingHours = 1.5`

- Acceptable window becomes `13:30–18:00`.

Scenario:

- `Case A` dismantle ends at `16:00`
- New `Case B` dismantle also needs to happen the same day

If **tail co-join** makes `Case B` start too late and pushes its end time past `16:30` (OT):

- The AI will try **head co-join** first (schedule `Case B` earlier, then proceed to `Case A`) **if feasible** within both orders’ windows.
- If OT still cannot be avoided, the UI will prompt:
  - **Allow OT**, or
  - **Deploy another team** to avoid OT
