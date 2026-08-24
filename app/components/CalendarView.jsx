"use client";

import { useState } from "react";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiClock, FiPlus } from "react-icons/fi";
import { isApprovalVideoPath } from "../../lib/approvalMedia";
import { formatScheduleTime, getZonedParts } from "../../lib/timezone";

export default function CalendarView({
  approvals,
  canManage = false,
  onDayClick,
  onPostClick,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const scheduledPosts = approvals.filter((a) => a.scheduledFor);

  const getPostsForDay = (day) => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    return scheduledPosts.filter((post) => {
      const parts = getZonedParts(post.scheduledFor);
      return parts && parts.year === y && parts.month === m && parts.day === day;
    });
  };

  const openDay = (day) => {
    if (!onDayClick) return;
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day, 10, 0, 0, 0);
    onDayClick(date, getPostsForDay(day));
  };

  let firstScheduledId = null;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const hit = getPostsForDay(d)[0];
    if (hit?.id) {
      firstScheduledId = hit.id;
      break;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <FiCalendar className="text-[#1d9c35]" />
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={prevMonth}
            className="rounded-md p-2 hover:bg-gray-100 transition-colors"
          >
            <FiChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="rounded-md p-2 hover:bg-gray-100 transition-colors"
          >
            <FiChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>

      {canManage && (
        <p className="mt-3 text-xs text-gray-500">
          Click a day to schedule a post, or click a scheduled item to unschedule or remove it.
        </p>
      )}

      <div className="mt-4 grid grid-cols-7 gap-px rounded-lg bg-gray-200 ring-1 ring-gray-200 overflow-visible">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="bg-gray-50 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500"
          >
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[120px]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday =
            new Date().getDate() === day &&
            new Date().getMonth() === currentDate.getMonth() &&
            new Date().getFullYear() === currentDate.getFullYear();
          const posts = getPostsForDay(day);

          return (
            <button
              key={day}
              type="button"
              onClick={() => openDay(day)}
              data-guide={day === 1 ? "cal-day" : undefined}
              className="bg-white min-h-[120px] p-2 text-left transition-colors hover:bg-[#f4fbf4] relative group focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1d9c35]"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                    isToday ? "bg-[#00A3FF] text-gray-900 shadow-md" : "text-gray-900"
                  }`}
                >
                  {day}
                </div>
                {canManage && (
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold uppercase tracking-wide text-[#1d9c35] inline-flex items-center gap-0.5">
                    <FiPlus className="w-3 h-3" />
                    Add
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-col gap-1.5">
                {posts.map((post) => {
                  const postTime = formatScheduleTime(post.scheduledFor);
                  const isPublished = post.publishStatus === "published";

                  return (
                    <div
                      key={post.id}
                      role="button"
                      tabIndex={0}
                      data-guide={post.id === firstScheduledId ? "cal-item" : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPostClick?.(post);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onPostClick?.(post);
                        }
                      }}
                      className={`group/item relative flex flex-col gap-1 rounded-md border p-1.5 text-xs transition-shadow hover:shadow-sm cursor-pointer ${
                        isPublished
                          ? "border-[#00A3FF] bg-green-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-1 font-medium text-gray-700">
                        <FiClock className="text-gray-400 shrink-0" />
                        <span className="truncate">{postTime}</span>
                        {isPublished && (
                          <span className="ml-auto flex h-2 w-2 rounded-full bg-[#00A3FF]" />
                        )}
                      </div>
                      <div className="truncate text-gray-500 font-medium">
                        {post.itemType === "blog" ? (
                          <span className="text-[10px] font-bold uppercase text-indigo-600 mr-1">Blog</span>
                        ) : null}
                        {post.userEditedTitle || post.title}
                      </div>

                      <div className="absolute z-50 bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 flex-col gap-2 rounded-lg bg-gray-900 p-3 text-sm text-white shadow-xl group-hover/item:flex pointer-events-none">
                        <div className="font-semibold truncate">
                          {post.userEditedTitle || post.title}
                        </div>
                        {post.imagePath && (
                          <div className="relative h-24 w-full overflow-hidden rounded-md bg-gray-800">
                            {isApprovalVideoPath(post.imagePath) ? (
                              <video src={post.imagePath} className="h-full w-full object-cover" />
                            ) : (
                              <img
                                src={post.imagePath}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                        )}
                        <div className="line-clamp-2 text-xs text-gray-300">
                          {post.itemType === "blog"
                            ? post.userEditedExcerpt || post.excerpt || "Blog post"
                            : post.userEditedCaption || post.caption || "No caption"}
                        </div>
                        <div className="text-xs font-medium mt-1 flex justify-between">
                          <span>
                            Status:{" "}
                            <span
                              className={
                                post.status === "approved" ? "text-[#00A3FF]" : "text-amber-400"
                              }
                            >
                              {String(post.status || "").toUpperCase()}
                            </span>
                          </span>
                          {isPublished && <span className="text-[#00A3FF]">Published</span>}
                        </div>
                        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
