/*import SeatMap from "@/components/SeatMap";

export default function Home() {
  return (
    <main>
      <SeatMap
        showTitle="Ponniyin Selvan: Karikala Yugam"
        showSubtitle="Wed 28 Oct 2026, 6:00 PM · EEE Auditorium"
      />
    </main>
  );
}*/


"use client";

import { useState } from "react";
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

export default function Home() {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedShow, setSelectedShow] = useState(null);

  // Show the existing seat booking page after a show is selected.
  if (selectedShow) {
    return (
      <main>
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
      <header className={styles.navbar}>
        <a href="#home" className={styles.logo}>
          <span>🎭</span> THESPIAN TICKETS
        </a>

        <span className={styles.navLabel}>
          THEATRE EXPERIENCE
        </span>
      </header>

      <section className={styles.hero} id="home">
        <div
          className={`${styles.curtain} ${styles.curtainLeft}`}
        />
        <div
          className={`${styles.curtain} ${styles.curtainRight}`}
        />

        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            AN EPIC THEATRICAL EXPERIENCE
          </p>

          <div className={styles.ornament}>
            ✦ ━━━━━ ✦
          </div>

          <h1>
            PONNIYIN SELVAN
            <span>KARIKALA YUGAM</span>
          </h1>

          <p className={styles.description}>
            Witness the legend. Experience the grandeur.
          </p>

          <button
            type="button"
            className={styles.bookButton}
            onClick={() => setShowPicker(true)}
          >
            BOOK TICKETS <span>→</span>
          </button>

          <p className={styles.hint}>
            SELECT YOUR SHOW · RESERVE YOUR SEATS
          </p>
        </div>

        <div className={styles.stageFloor} />
      </section>

      <section className={styles.eventInfo}>
        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>▦</span>
          <div>
            <p className={styles.infoLabel}>SHOW DATES</p>
            <p className={styles.infoValue}>
              28 &amp; 29 October 2026
            </p>
          </div>
        </div>

        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>◷</span>
          <div>
            <p className={styles.infoLabel}>SHOW TIME</p>
            <p className={styles.infoValue}>6:00 PM</p>
          </div>
        </div>

        <div className={styles.infoItem}>
          <span className={styles.infoIcon}>⌖</span>
          <div>
            <p className={styles.infoLabel}>VENUE</p>
            <p className={styles.infoValue}>EEE Auditorium</p>
          </div>
        </div>
      </section>

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
              Your show selection comes before seat selection.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}

