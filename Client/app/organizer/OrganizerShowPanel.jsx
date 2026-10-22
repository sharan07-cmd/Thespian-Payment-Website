
"use client";

import { useState } from "react";
import OrganizerDashboard from "./OrganizerDashboard";
import OrganizerCheckIn from "./OrganizerCheckIn";

export default function OrganizerShowPanel() {
  const [showId, setShowId] = useState("show-1");

  const shows = [
    {
      id: "show-1",
      title: "Show 1",
      date: "Wednesday, 28 October 2026",
      time: "6:00 PM",
    },
    {
      id: "show-2",
      title: "Show 2",
      date: "Thursday, 29 October 2026",
      time: "6:00 PM",
    },
  ];

  const selectedShow = shows.find((show) => show.id === showId);

  return (
    <div className="space-y-8">
      {/* Show selector */}
      <section className="rounded-2xl border border-[#443a27] bg-[#171612] p-5">
        <label
          htmlFor="organizer-show"
          className="mb-3 block text-sm font-semibold text-[#e4c779]"
        >
          Select event
        </label>

        <select
          id="organizer-show"
          value={showId}
          onChange={(event) => setShowId(event.target.value)}
          className="w-full rounded-xl border border-[#443a27] bg-[#10100e] p-3 text-white"
        >
          {shows.map((show) => (
            <option key={show.id} value={show.id}>
              {show.title} — {show.date}
            </option>
          ))}
        </select>

        <p className="mt-3 text-sm text-stone-400">
          {selectedShow.date} · {selectedShow.time}
        </p>
      </section>

      {/* Attendance dashboard for the selected show */}
      <OrganizerDashboard showId={showId} />

      {/* Ticket scanner for the selected show */}
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">
            Ticket verification
          </h3>

          <p className="mt-1 text-sm text-stone-500">
            Scan a ticket QR code to check attendees in or out.
          </p>
        </div>

        <OrganizerCheckIn showId={showId} />
      </section>
    </div>
  );
}
