"use client";

import { useState } from "react";
import Image from "next/image";
import SeatMap from "@/components/SeatMap";
import styles from "./page.module.css";

const SHOWS = [
  {
    id: "show-1",
    date: "Wed, 28 Oct 2026",
    time: "6:00 PM",
    venue: "EEE Auditorium",
  },
  {
    id: "show-2",
    date: "Thu, 29 Oct 2026",
    time: "6:00 PM",
    venue: "EEE Auditorium",
  },
];

const FEATURES = [
  {
    icon: "♜",
    title: "TIMELESS STORY",
    description: "A tale of courage, power and an empire.",
  },
  {
    icon: "⚜",
    title: "LIVE PERFORMANCE",
    description: "Feel every emotion. Witness history unfold on stage.",
  },
  {
    icon: "♛",
    title: "THE RISE OF A KINGDOM",
    description: "Valour, ambition and the legacy of the Cholas.",
  },
  {
    icon: "✦",
    title: "A SYMPHONY OF EXPRESSION",
    description: "Collaboration of Music Troupe, Streaks and The Thespians' Society.",
  },
];

export default function Home() {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);

  if (selectedShow) {
    return (
      <main className={styles.bookingPage}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => setSelectedShow(null)}
        >
          ← Back to Home
        </button>

        <SeatMap
          key={selectedShow.id}
          showId={selectedShow.id}
          showTitle="Ponniyin Selvan: Karikala Yugam"
          showSubtitle={`${selectedShow.date}, ${selectedShow.time} · ${selectedShow.venue}`}
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* Desktop poster — unchanged */}
      <section className={styles.hero} id="home">
        <div className={styles.poster}>
          <Image
            src="/images/ponniyin-selvan-hero.png"
            alt="Ponniyin Selvan: Karikala Yugam theatrical poster"
            fill
            priority
            sizes="100vw"
            className={styles.posterImage}
          />

          <button
            type="button"
            className={styles.posterBookButton}
            aria-label="Book your seats"
            onClick={() => setShowPicker(true)}
          />
        </div>

        {/* Mobile-only front page */}
        <div className={styles.mobileLanding}>
          <div className={styles.mobilePoster}>
            <Image
              src="/images/mobile-front-cover.png"
              alt="Ponniyin Selvan: Karikala Yugam mobile poster"
              fill
              priority
              sizes="100vw"
              className={styles.mobilePosterImage}
            />
            <button
              type="button"
              className={styles.mobilePosterBookButton}
              aria-label="Book your seats"
              onClick={() => setShowPicker(true)}
            />
          </div>
        </div>
      </section>

      {/* Existing feature strip */}
      <section
        className={styles.features}
        aria-label="About the theatrical experience"
      >
        {FEATURES.map((feature) => (
          <article className={styles.featureCard} key={feature.title}>
            <span className={styles.featureIcon} aria-hidden="true">
              {feature.icon}
            </span>
            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
          </article>
        ))}
      </section>

      {/* Existing show-selection popup */}
      {showPicker && (
        <div
          className={styles.overlay}
          onClick={() => setShowPicker(false)}
        >
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="show-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => setShowPicker(false)}
              aria-label="Close show selection"
            >
              ×
            </button>

            <p className={styles.modalEyebrow}>
              CHOOSE YOUR EXPERIENCE
            </p>

            <h2 id="show-title">Select Your Show</h2>

            <p className={styles.modalDescription}>
              Choose the date you wish to attend.
            </p>

            <div className={styles.showList}>
              {SHOWS.map((show, index) => (
                <button
                  type="button"
                  key={show.id}
                  className={styles.showCard}
                  onClick={() => {
                    setSelectedShow(show);
                    setShowPicker(false);
                  }}
                >
                  <span className={styles.showNumber}>
                    0{index + 1}
                  </span>

                  <span className={styles.showDetails}>
                    <strong>{show.date}</strong>
                    <span>
                      {show.time} · {show.venue}
                    </span>
                  </span>

                  <span className={styles.showArrow}>→</span>
                </button>
              ))}
            </div>

            <p className={styles.modalFootnote}>
              Select a performance to continue to seat selection.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}