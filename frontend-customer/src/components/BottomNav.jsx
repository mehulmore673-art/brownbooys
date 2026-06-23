// src/components/BottomNav.jsx
import React from "react";

const TABS = [
  { key: "menu",    icon: "🍔", label: "Menu"    },
  { key: "orders",  icon: "📦", label: "Orders"  },
  { key: "profile", icon: "👤", label: "Profile" },
];

export default function BottomNav({ active, setActive, cartCount, onCartOpen, hasActiveOrder }) {
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Bottom navigation">
      <div className="bottom-nav__inner">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`bottom-nav__item${active === tab.key ? " active" : ""}`}
            onClick={() => setActive(tab.key)}
            aria-current={active === tab.key ? "page" : undefined}
          >
            <span className="bottom-nav__icon" aria-hidden="true">{tab.icon}</span>
            <span className="bottom-nav__label">{tab.label}</span>
            {tab.key === "orders" && hasActiveOrder && (
              <span className="bottom-nav__dot" aria-label="Active order" />
            )}
          </button>
        ))}

        {/* Cart tab */}
        <button
          className="bottom-nav__item"
          onClick={onCartOpen}
          aria-label={`Open cart, ${cartCount} items`}
        >
          <span className="bottom-nav__icon" aria-hidden="true">🛒</span>
          <span className="bottom-nav__label">Cart</span>
          {cartCount > 0 && <span className="bottom-nav__dot" aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );
}
