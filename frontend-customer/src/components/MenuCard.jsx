// src/components/MenuCard.jsx
import React from "react";

export default function MenuCard({ item, lang, openItem, setOpenItem, onAdd }) {
  const itemKey = item.id ?? item._id;
  const isOpen = openItem === itemKey;
  const hasVariants = item.variants?.length > 0;

  return (
    <article className="menu-card shine">
      {/* ── Image ── */}
      <div className="menu-card__image-wrap">
        {item.image ? (
          <img
            className="menu-card__image"
            src={item.image}
            alt={item.title?.en || "Menu item"}
            loading="lazy"
          />
        ) : (
          <div className="menu-card__image-placeholder" aria-hidden="true">🍽️</div>
        )}
        <div className="menu-card__image-overlay" aria-hidden="true" />

        {/* Badges */}
        {item.isNew        && <span className="menu-card__badge menu-card__badge--new">✨ New</span>}
        {item.isBestseller && <span className="menu-card__badge menu-card__badge--bestseller">⭐ Best</span>}
        {item.isHot        && <span className="menu-card__badge menu-card__badge--hot">🔥 Hot</span>}

        <button className="menu-card__fav" aria-label="Add to favourites">♡</button>
      </div>

      {/* ── Body ── */}
      <div className="menu-card__body">
        {/* Title / variant toggle */}
        <button
          className="menu-card__name"
          onClick={() => hasVariants && setOpenItem(isOpen ? null : itemKey)}
          aria-expanded={isOpen}
          aria-label={item.title?.[lang] || item.title?.en}
        >
          <span className="menu-card__name-text">{item.title?.[lang] || item.title?.en}</span>
          {hasVariants && (
            <span className="menu-card__variant-hint">
              {isOpen ? "▲" : "▼"} {item.variants.length} options
            </span>
          )}
        </button>

        {item.description && (
          <p className="menu-card__desc">{item.description}</p>
        )}

        {/* Meta */}
        <div className="menu-card__meta">
          {item.rating   && <span className="menu-card__rating">⭐ {item.rating}</span>}
          {item.prepTime && <span className="menu-card__time">🕐 {item.prepTime}</span>}
          {item.isVeg    && <span className="menu-card__veg">🟢 Veg</span>}
        </div>

        {/* ── Variants (expanded) ── */}
        {hasVariants && isOpen && (
          <ul className="menu-card__variants">
            {item.variants.map((v, i) => (
              <li key={i} className="menu-card__variant-row">
                <span className="menu-card__variant-name">
                  {v.name?.[lang] || v.name?.en}
                </span>
                <span className="menu-card__price gradient-text">₹{v.price}</span>
                <button
                  className="btn-add btn-add--icon-only"
                  onClick={() => onAdd(item, v)}
                  aria-label={`Add ${v.name?.en}`}
                >
                  +
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* ── Single price + Add ── */}
        {!hasVariants && (
          <div className="menu-card__footer">
            <div className="menu-card__price-wrap">
              <span className="menu-card__price">₹{item.price}</span>
            </div>
            <button
              className="btn-add"
              onClick={() => onAdd(item, null)}
              aria-label={`Add ${item.title?.en} to cart`}
            >
              + Add
            </button>
          </div>
        )}
      </div>
    </article>
  );
}