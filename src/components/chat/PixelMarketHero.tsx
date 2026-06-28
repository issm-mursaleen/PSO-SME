'use client';

import styles from './PixelMarketHero.module.css';

export function PixelMarketHero() {
  return (
    <div className={styles.hero}>
      <div className={styles.marketViewport}>
        <div className={styles.marketTrack}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/alara-market/market-strip.png"
            className={styles.marketScene}
            alt=""
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/alara-market/market-strip.png"
            className={styles.marketScene}
            alt=""
            aria-hidden="true"
          />
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/alara-market/cat.gif"
        className={styles.cat}
        alt=""
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/alara-market/alara-logo.png"
        className={styles.logo}
        alt="Alara Agentic Copilot"
      />
    </div>
  );
}
