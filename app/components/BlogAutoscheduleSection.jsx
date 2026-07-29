"use client";

import AutoschedulePanel from "./contentAutoschedule/AutoschedulePanel";

export default function BlogAutoscheduleSection({ selectedSite = "" }) {
  return (
    <AutoschedulePanel
      kind="blog"
      selectedSite={selectedSite}
      title="Watchful blog calendar"
      subtitle="Place unscheduled draft and pending blogs onto free weekdays — one per day by default. Always overridable in Content Calendar."
    />
  );
}
