"use client";

import AutoschedulePanel from "./contentAutoschedule/AutoschedulePanel";

export default function PostAutoscheduleSection({ selectedSite = "" }) {
  return (
    <AutoschedulePanel
      kind="post"
      selectedSite={selectedSite}
      title="Watchful post calendar"
      subtitle="Place unscheduled drafts and pending posts onto free weekdays — one per day by default. Always overridable in Content Calendar."
    />
  );
}
