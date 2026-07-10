"use client";

import { useState } from "react";
import { FiChevronLeft, FiChevronRight, FiCalendar, FiClock } from "react-icons/fi";
import { isApprovalVideoPath } from "../../lib/approvalMedia";

export default function CalendarView({ approvals }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const scheduledPosts = approvals.filter(a => a.scheduledFor);

  const getPostsForDay = (day) => {
    return scheduledPosts.filter(post => {
      const postDate = new Date(post.scheduledFor);
      return postDate.getDate() === day &&
             postDate.getMonth() === currentDate.getMonth() &&
             postDate.getFullYear() === currentDate.getFullYear();
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FiCalendar className="text-[#0EFF2A]" />
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <FiChevronLeft className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors">
            Today
          </button>
          <button onClick={nextMonth} className="rounded-md p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <FiChevronRight className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-px rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="bg-gray-50 py-2 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            {day}
          </div>
        ))}

        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className="bg-gray-50/50 min-h-[120px] dark:bg-gray-800/30"></div>
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
          const posts = getPostsForDay(day);

          return (
            <div key={day} className={`bg-white min-h-[120px] p-2 transition-colors dark:bg-gray-800 relative group hover:bg-gray-50 dark:hover:bg-gray-700/50`}>
              <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${isToday ? 'bg-[#0EFF2A] text-white shadow-md' : 'text-gray-900 dark:text-gray-200'}`}>
                {day}
              </div>

              <div className="mt-2 flex flex-col gap-1.5">
                {posts.map(post => {
                  const postTime = new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const isPublished = post.publishStatus === 'published';

                  return (
                    <div key={post.id} className={`group/item relative flex flex-col gap-1 rounded-md border p-1.5 text-xs transition-shadow hover:shadow-sm cursor-pointer ${isPublished ? 'border-[#0EFF2A] bg-green-50 dark:border-green-900 dark:bg-green-900/10' : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}>
                      <div className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200">
                        <FiClock className="text-gray-400 shrink-0" />
                        <span className="truncate">{postTime}</span>
                        {isPublished && <span className="ml-auto flex h-2 w-2 rounded-full bg-[#0EFF2A]"></span>}
                      </div>
                      <div className="truncate text-gray-500 dark:text-gray-400 font-medium">
                        {post.userEditedTitle || post.title}
                      </div>

                      <div className="absolute z-50 bottom-full left-1/2 mb-2 hidden w-48 -translate-x-1/2 flex-col gap-2 rounded-lg bg-gray-900 p-3 text-sm text-white shadow-xl group-hover/item:flex dark:bg-gray-700">
                        <div className="font-semibold truncate">{post.userEditedTitle || post.title}</div>
                        {post.imagePath && (
                          <div className="relative h-24 w-full overflow-hidden rounded-md bg-gray-800">
                            {isApprovalVideoPath(post.imagePath) ? (
                              <video src={post.imagePath} className="h-full w-full object-cover" />
                            ) : (
                              <img src={post.imagePath} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                        )}
                        <div className="line-clamp-2 text-xs text-gray-300">
                          {post.userEditedCaption || post.caption || "No caption"}
                        </div>
                        <div className="text-xs font-medium mt-1 flex justify-between">
                          <span>Status: <span className={post.status === 'approved' ? 'text-[#0EFF2A]' : 'text-amber-400'}>{post.status.toUpperCase()}</span></span>
                          {isPublished && <span className="text-[#0EFF2A]">Published</span>}
                        </div>
                        <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900 dark:bg-gray-700"></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}