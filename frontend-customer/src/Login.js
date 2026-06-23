// src/Login.js
import React, { useState } from "react";

export default function Login({ setUser }) {
  const [phone, setPhone] = useState("");
  const [name,  setName]  = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setError("");

    const userId   = digits;
    const userName = name.trim() || digits;

    localStorage.setItem("userId", userId);
    localStorage.setItem("userName", userName);

    setUser({ id: userId, name: userName, phone: digits });
  };

  return (
    <div className="page-container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="glass-panel fade-in-up" style={{ width: "100%", maxWidth: 400, padding: "40px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 16px", background: "var(--gradient-orange)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", boxShadow: "var(--shadow-orange)" }}>
            📱
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--text-white)", marginBottom: 6 }}>Welcome to Brown Booys</h1>
          <p style={{ fontSize: ".88rem", color: "var(--muted-gray)" }}>Enter your details to start ordering</p>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="login-name">Name (optional)</label>
          <input
            id="login-name"
            className="form-input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="login-phone">Phone Number</label>
          <input
            id="login-phone"
            type="tel"
            inputMode="numeric"
            className={`form-input${error ? " form-input--error" : ""}`}
            placeholder="10-digit mobile number"
            value={phone}
            maxLength={10}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {error && <p className="form-error">{error}</p>}
        </div>

        <button className="btn-checkout shine" style={{ width: "100%", marginTop: 8 }} onClick={handleLogin}>
          Continue 🚀
        </button>
      </div>
    </div>
  );
}
