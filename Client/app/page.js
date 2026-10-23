
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
    title: "A LEGACY IMMORTALISED",
    description: "A tribute to Tamil history and heritage.",
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
          <header className={styles.mobileHeader}>
            <span className={styles.mobileLogo} aria-hidden="true">
              ♜
            </span>
            <span className={styles.mobileBrand}>
              THESPIANS’
              <br />
              SOCIETY
            </span>
          </header>

          <div className={styles.mobileArtwork}>
            <Image
              src="/images/karikala-mobile.jpg"
              alt="Karikala Chola standing proudly against a golden sunset"
              fill
              priority
              sizes="100vw"
              className={styles.mobileArtworkImage}
            />
          </div>

          <div className={styles.mobileContent}>
            <p className={styles.mobileEyebrow}>
              ✦ &nbsp; A LEGEND RETURNS TO THE STAGE &nbsp; ✦
            </p>

            <h1 className={styles.mobileTitle}>
              PONNIYIN SELVAN
              <span>KARIKALA YUGAM</span>
            </h1>

            <p className={styles.mobileTagline}>
              AN EMPIRE. A LEGACY.
              <br />
              AN EPIC BROUGHT TO LIFE.
            </p>

            <div className={styles.mobileDetails}>
              <div className={styles.mobileDetail}>
                <span className={styles.mobileDetailIcon} aria-hidden="true">
                  ▦
                </span>
                <div>
                  <strong>28 &amp; 29 OCTOBER 2026</strong>
                  <span>PERFORMANCE DATES</span>
                </div>
              </div>

              <div className={styles.mobileDetail}>
                <span className={styles.mobileDetailIcon} aria-hidden="true">
                  ◷
                </span>
                <div>
                  <strong>6:00 PM</strong>
                  <span>CURTAIN RISES</span>
                </div>
              </div>

              <div className={styles.mobileDetail}>
                <span className={styles.mobileDetailIcon} aria-hidden="true">
                  ♧
                </span>
                <div>
                  <strong>EEE AUDITORIUM</strong>
                  <span>THE VENUE</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              className={styles.mobileBookButton}
              onClick={() => setShowPicker(true)}
            >
              BOOK YOUR SEATS <span aria-hidden="true">→</span>
            </button>

            <p className={styles.mobileFootnote}>
              CHOOSE YOUR SHOW · EXPERIENCE THE EPIC
            </p>
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
