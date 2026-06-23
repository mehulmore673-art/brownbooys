// src/components/OfferBanner.jsx
import React, { useState, useEffect, useCallback } from "react";
import { safeFetch } from "../utils/api";

export default function OfferBanner() {
  const [offers,  setOffers]  = useState([]);
  const [current, setCurrent] = useState(0);

  const load = useCallback(async () => {
    const data = await safeFetch("/api/offers");
    if (Array.isArray(data) && data.length > 0) {
      setOffers(data);
      // Reset to first banner if current index is now out of range
      setCurrent((c) => (c >= data.length ? 0 : c));
    }
  }, []);

  // Initial load + refresh every 30 s
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // Auto-rotate banners
  useEffect(() => {
    if (offers.length <= 1) return;
    const id = setInterval(() => setCurrent((c) => (c + 1) % offers.length), 5_000);
    return () => clearInterval(id);
  }, [offers.length]);

  /* ── Fallback: no banners uploaded yet ── */
  if (!offers.length) {
    return (
      <section className="offer-section">
        <div className="offer-banner offer-banner--primary shine">
          <div className="offer-banner__bg" />
          <div className="offer-banner__content">
            <div>
              <div className="offer-banner__badge">🔥 Limited Time</div>
              <h3 className="offer-banner__title">
                Free delivery on orders <span>over ₹400</span>
              </h3>
              <p className="offer-banner__desc">
                Place your order now and enjoy complimentary delivery
              </p>
            </div>
            <span className="offer-banner__cta">Order Now →</span>
          </div>
        </div>

        <div className="offer-row" role="list">
          {["🍔 Burgers", "🌯 Wraps", "🍟 Fries", "🥤 Drinks", "🫓 Vadapav", "🍽️ Dabeli"].map((chip) => (
            <button key={chip} className="offer-chip" role="listitem">{chip}</button>
          ))}
        </div>
      </section>
    );
  }

  const offer = offers[current];

  /* ── Live Cloudinary banner ── */
  return (
    <section className="offer-section">
      <div className="offer-banner shine" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ position: "relative" }}>
          <img
            src={offer.imageUrl}
            alt={offer.title || "Special offer"}
            className="offer-banner__img"
            loading="lazy"
          />

          {/* Gradient overlay + text */}
          {(offer.title || offer.ctaText) && (
            <div className="offer-banner__overlay">
              <div>
                {offer.title    && <h3 className="offer-banner__title" style={{ color: "#fff" }}>{offer.title}</h3>}
                {offer.subtitle && <p  className="offer-banner__desc">{offer.subtitle}</p>}
              </div>
              {offer.ctaText && (
                <span className="offer-banner__cta">{offer.ctaText} →</span>
              )}
            </div>
          )}

          {/* Pagination dots */}
          {offers.length > 1 && (
            <div className="offer-banner__dots">
              {offers.map((_, i) => (
                <button
                  key={i}
                  className={`offer-banner__dot${i === current ? " offer-banner__dot--active" : ""}`}
                  onClick={() => setCurrent(i)}
                  aria-label={`Banner ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="offer-row" role="list">
        {["🍔 Burgers", "🌯 Wraps", "🍟 Fries", "🥤 Drinks", "🫓 Vadapav", "🍽️ Dabeli"].map((chip) => (
          <button key={chip} className="offer-chip" role="listitem">{chip}</button>
        ))}
      </div>
    </section>
  );
}
