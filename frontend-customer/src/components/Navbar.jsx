// src/components/Navbar.jsx
import React from "react";
import logo from "../logo.png";

export default function Navbar({ lang, setLang, search, setSearch, onLogout, filteredCount, user }) {
  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      <div className="navbar__inner">

        {/* Logo */}
        <div className="navbar__left">
          <div className="logo">
            <div className="logo__icon">
              <img
                src={logo}
                alt="Brown Booys logo"
                style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
              />
            </div>
            <div className="logo__text">
              <span className="logo__name">Brown Booys</span>
              <span className="logo__tagline">Premium Bites</span>
            </div>
          </div>
        </div>

        {/* Desktop search */}
        <div className="navbar__center">
          <div className="search-wrapper">
            <span className="search-icon" aria-hidden="true">🔍</span>
            <input
              className="search-bar"
              placeholder="Search menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search menu items"
            />
            {search && (
              <button
                className="search-clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right controls */}
        <div className="navbar__right">
          <div className="lang-switcher" role="group" aria-label="Language selector">
            {["en", "hi", "gu"].map((l) => (
              <button
                key={l}
                className={`lang-btn${lang === l ? " active" : ""}`}
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {user && (
            <button className="navbar__logout-btn" onClick={onLogout} aria-label="Logout">
              Logout
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
