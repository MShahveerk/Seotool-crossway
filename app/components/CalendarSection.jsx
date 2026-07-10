import { useState, useEffect } from "react";
import CalendarView from "./CalendarView";

export default function CalendarSection() {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calendar")
      .then((res) => res.json())
      .then((data) => {
        if (data.approvals) {
          setApprovals(data.approvals);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load calendar", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Content Calendar</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          View your upcoming scheduled posts and content pipeline.
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <CalendarView approvals={approvals} />
      </div>
    </div>
  );
}