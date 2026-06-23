// src/AdminPanel.jsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import "./App.css";
import { useToasts }       from "./hooks/useToasts";
import { usePolling }      from "./hooks/usePolling";
import ToastContainer      from "./components/ToastContainer";
import { API_BASE }        from "./utils/constants";
import { mapsLink }        from "./utils/geo";
import { adminFetch }      from "./admin/adminFetch";
import { useSound }        from "./admin/useSound";
import { useShopControls } from "./admin/useShopControls";
import { useMenuActions }  from "./admin/useMenuActions";

// ── Status helper ─────────────────────────────────────────────
function statusClass(s) {
  if (s === "Completed") return "status-badge--ready";
  if (s === "Paid")      return "status-badge--delivered";
  if (s === "Pending")   return "status-badge--pending";
  if (s === "Cancelled") return "status-badge--cancelled";
  return "status-badge--preparing";
}

// ── Format order timestamp ────────────────────────────────────
function formatOrderTime(o) {
  if (o.createdAt) {
    const d    = new Date(o.createdAt);
    const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${date} · ${time}`;
  }
  if (o.date) return `${o.date} · ${o.time}`;
  return o.time || "—";
}

// ── Empty form constant ───────────────────────────────────────
const EMPTY_FORM = {
  en: "", hi: "", gu: "", description: "", price: "",
  imageFile: null, imageUrl: "",
  isNew: false, isBestseller: false, isHot: false, isVeg: true,
  rating: "", prepTime: "", category: "", variantsRaw: [],
};

// ════════════════════════════════════════════════════════════
// ADMIN LOGIN GATE
// ════════════════════════════════════════════════════════════
function AdminLogin({ onLogin, addToast }) {
  const [pw,      setPw]      = useState("");
  const [loading, setLoading] = useState(false);

  const attempt = async () => {
    if (!pw.trim()) { addToast("⚠️ Enter admin password.", "warning"); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API_BASE}/api/admin/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (!res.ok) { addToast("❌ " + (data.error || "Wrong password."), "error"); return; }
      // FIX (security) — store the signed JWT the server issues, not
      // the password itself. The password is never persisted client-side
      // after this point, so an XSS/extension/localStorage leak only
      // exposes a token that expires in 12h and reveals nothing about
      // the actual admin password.
      localStorage.setItem("adminToken", data.token);
      onLogin();
    } catch {
      addToast("📡 Cannot reach server.", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="glass-panel fade-in-up" style={{ width: "100%", maxWidth: 420, padding: "40px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, margin: "0 auto 16px", background: "var(--gradient-orange)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2rem", boxShadow: "var(--shadow-orange)" }}>
            🛠️
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--text-white)", marginBottom: 6 }}>Admin Access</h1>
          <p style={{ fontSize: ".88rem", color: "var(--muted-gray)" }}>Enter your admin password to continue</p>
        </div>

        <div className="section-divider" style={{ margin: "0 0 20px" }}>
          <span className="section-divider__label">Credentials</span>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="admin-pw">Password</label>
          <input
            id="admin-pw"
            type="password"
            className="form-input"
            placeholder="Admin password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && attempt()}
            autoFocus
          />
        </div>

        <button className="btn-checkout shine" style={{ width: "100%", marginTop: 8 }} onClick={attempt} disabled={loading}>
          {loading ? <><span className="spinner spinner--sm" /> Verifying…</> : "Access Admin Panel →"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MAIN ADMIN PANEL
// ════════════════════════════════════════════════════════════
export default function AdminPanel() {
  const { toasts, add: addToast, remove: removeToast } = useToasts();
  const [authed, setAuthed] = useState(!!localStorage.getItem("adminToken"));

  // FIX #8 — listen for global 401/403 auto-logout event from adminFetch
  useEffect(() => {
    const handleUnauth = () => {
      setAuthed(false);
      addToast("⚠️ Session expired. Please log in again.", "warning");
    };
    window.addEventListener("admin:unauthorized", handleUnauth);
    return () => window.removeEventListener("admin:unauthorized", handleUnauth);
  }, [addToast]);

  // ── Data state ────────────────────────────────────────────
  const [orders,       setOrders]       = useState([]);
  const [menu,         setMenu]         = useState([]);
  const [offers,       setOffers]       = useState([]);
  const [analytics,    setAnalytics]    = useState(null);
  const [shopSettings, setShopSettings] = useState({
    shopOpen: true, deliveryOn: true,
    freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5,
    shopLatitude: 0, shopLongitude: 0,
  });

  // ── UI state ──────────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState("orders");
  const [orderSearch,  setOrderSearch]  = useState("");
  const [menuSearch,   setMenuSearch]   = useState("");
  const [soundMuted,   setSoundMuted]   = useState(false);
  const [editingItem,  setEditingItem]  = useState(null);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [addForm,      setAddForm]      = useState(EMPTY_FORM);
  const [variantName,  setVariantName]  = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [offerFile,    setOfferFile]    = useState(null);
  const [offerTitle,   setOfferTitle]   = useState("");
  const [offerSubtitle,setOfferSubtitle]= useState("");
  const offerFileRef = useRef(null);

  // FIX #9 — manage offerPreview URL via useEffect to avoid memory leak
  const [offerPreview, setOfferPreview] = useState(null);
  useEffect(() => {
    if (!offerFile) { setOfferPreview(null); return; }
    const url = URL.createObjectURL(offerFile);
    setOfferPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [offerFile]);

  // ── Sound (separated hook) ────────────────────────────────
  const { playBeep, startRepeating, stopRepeating } = useSound(soundMuted);

  // ── Polling refs ──────────────────────────────────────────
  const prevCount    = useRef(null);
  const prevStatuses = useRef({});
  const loadingRef   = useRef(false);   // FIX A — prevent overlapping poll calls

  // ── Load all data ─────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!authed) return;
    if (loadingRef.current) return;     // FIX A — skip if previous fetch still running
    loadingRef.current = true;
    try {
      const [oRes, mRes, sRes, aRes, offRes] = await Promise.all([
        adminFetch("/api/orders?admin=true"),
        fetch(`${API_BASE}/api/menu`),
        fetch(`${API_BASE}/api/shop`),
        adminFetch("/api/orders/analytics"),
        adminFetch("/api/offers/all"),
      ]);

      if (oRes.ok) {
        const raw = await oRes.json();

        // FIX #2 — normalise id: always prefer _id (MongoDB) but fall back to id
        const data = raw
          .map((o) => ({ ...o, id: o._id || o.id }))
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (prevCount.current !== null && data.length > prevCount.current) {
          const n = data.length - prevCount.current;
          addToast(`🆕 ${n} new order${n > 1 ? "s" : ""} received!`, "info", 6000);
          // FEATURE — keep alerting (not just one beep) until the admin
          // accepts the order, i.e. moves it off Pending/Paid. The
          // useEffect below (watching `orders`) is what actually stops
          // it once there's nothing left awaiting acceptance.
          startRepeating();
        }
        prevCount.current = data.length;
        data.forEach((o) => {
          const prev = prevStatuses.current[o.id];
          if (prev && prev !== o.status) {
            addToast(`🔄 Order #${String(o.id).slice(-4)}: ${prev} → ${o.status}`, "info", 5000);
          }
          prevStatuses.current[o.id] = o.status;
        });
        setOrders(data);
      }

      if (mRes.ok)   setMenu(await mRes.json());
      if (sRes.ok)   setShopSettings(await sRes.json());
      if (aRes.ok)   setAnalytics(await aRes.json());
      if (offRes.ok) setOffers(await offRes.json());
    } catch (err) {
      console.error("Admin loadAll:", err.message);
    } finally {
      loadingRef.current = false;       // FIX A — always release guard
    }
  }, [authed, addToast, startRepeating]);

  // FEATURE — continuous new-order alert: as long as ANY order is still
  // "Pending" or "Paid" (i.e. not yet acted on by the admin — not moved
  // to Preparing/Ready/Completed/Cancelled), keep the repeating alert
  // going. The moment the admin updates every such order's status (via
  // the existing status dropdown / updateStatus()), this effect notices
  // on the next render and stops the alert automatically — no separate
  // "Accept" button needed, it reuses the existing action.
  useEffect(() => {
    const hasUnaccepted = orders.some((o) => o.status === "Pending" || o.status === "Paid");
    if (hasUnaccepted) {
      startRepeating();
    } else {
      stopRepeating();
    }
  }, [orders, startRepeating, stopRepeating]);

  // FIX — was polling every 3s. On Render's free tier this keeps the
  // instance under near-constant load, which contributes to the
  // "server keeps restarting" symptom (memory pressure / platform
  // recycling) and burns through free instance-hours faster. 6s still
  // feels live for an admin dashboard but roughly halves request volume.
  usePolling(loadAll, 6000, [authed]);

  // ── Shop controls (separated hook) ───────────────────────
  const { toggleShop, toggleDelivery, saveSettings } = useShopControls({
    shopSettings, setShopSettings, addToast,
  });

  // ── Order actions ─────────────────────────────────────────
  // FIX B — wrap in useCallback so function refs are stable across 3s re-renders
  const updateStatus = useCallback(async (id, status) => {
    try {
      const res = await adminFetch(`/api/orders/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ status }),
      });
      if (!res.ok) { addToast("❌ Could not update order.", "error"); return; }
      addToast(`✅ Order updated to ${status}.`, "success");
      loadAll();
    } catch (err) { addToast("📡 " + (err.message || "Server unreachable."), "error", 6000); }
  }, [addToast, loadAll]);

  const deleteOrder = useCallback(async (id) => {
    if (!window.confirm("Delete this order? This cannot be undone.")) return;
    try {
      const res = await adminFetch(`/api/orders/${id}`, { method: "DELETE" });
      if (!res.ok) { addToast("❌ Could not delete order.", "error"); return; }
      addToast("🗑️ Order removed.", "warning");
      loadAll();
    } catch (err) { addToast("📡 " + (err.message || "Server unreachable."), "error", 6000); }
  }, [addToast, loadAll]);

  // ── Menu actions (separated hook) ────────────────────────
  const { submitAddItem, submitEditItem, deleteItem } = useMenuActions({
    addToast, loadAll, setAddForm, setShowAddForm, setEditingItem, setVariantName, setVariantPrice, EMPTY_FORM,
  });

  // ── Offer actions ─────────────────────────────────────────
  // FIX B — useCallback for stable refs
  const uploadOffer = useCallback(async () => {
    if (!offerFile) { addToast("⚠️ Select an image first.", "warning"); return; }
    const fd = new FormData();
    fd.append("image",    offerFile);
    fd.append("title",    offerTitle);
    fd.append("subtitle", offerSubtitle);
    try {
      const res = await adminFetch("/api/offers", { method: "POST", body: fd });
      if (!res.ok) { const b = await res.json(); addToast("❌ " + (b.error || "Upload failed."), "error"); return; }
      addToast("✅ Banner uploaded.", "success");
      setOfferFile(null);   // triggers useEffect → revokes URL + clears preview
      setOfferTitle("");
      setOfferSubtitle("");
      if (offerFileRef.current) offerFileRef.current.value = "";
      loadAll();
    } catch (err) { addToast("📡 " + (err.message || "Server unreachable."), "error", 6000); }
  }, [offerFile, offerTitle, offerSubtitle, addToast, loadAll]);

  const deleteOffer = useCallback(async (id) => {
    if (!window.confirm("Delete this banner?")) return;
    try {
      const res = await adminFetch(`/api/offers/${id}`, { method: "DELETE" });
      if (!res.ok) { addToast("❌ Failed to delete banner.", "error"); return; }
      addToast("🗑️ Banner removed.", "warning");
      loadAll();
    } catch (err) { addToast("📡 " + (err.message || "Server unreachable."), "error", 6000); }
  }, [addToast, loadAll]);

  const toggleOffer = useCallback(async (id, currentActive) => {
    try {
      const res = await adminFetch(`/api/offers/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ active: !currentActive }),
      });
      if (!res.ok) { addToast("❌ Failed to update banner.", "error"); return; }
      addToast(`✅ Banner ${currentActive ? "hidden" : "made active"}.`, "success");
      loadAll();
    } catch (err) { addToast("📡 " + (err.message || "Server unreachable."), "error", 6000); }
  }, [addToast, loadAll]);

  // ── Derived data ──────────────────────────────────────────
  // Recalculate cutoff once per minute — cheap, always accurate after midnight,
  // and won't cause every render to re-run filteredOrders useMemo.
  const CUTOFF = useMemo(() => Date.now() - 24 * 60 * 60 * 1000, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Math.floor(Date.now() / 60_000), // changes every minute
  ]);

  const filteredOrders = useMemo(() => orders.filter((o) => {
    if ((o.createdAt ? new Date(o.createdAt).getTime() : 0) < CUTOFF) return false;
    if (!orderSearch.trim()) return true;
    const q = orderSearch.toLowerCase();
    return (
      String(o.id).includes(q) ||
      o.status?.toLowerCase().includes(q) ||
      o.orderType?.toLowerCase().includes(q) ||
      o.userName?.toLowerCase().includes(q) ||
      o.userPhone?.includes(q) ||
      o.items?.some((i) => i.name?.toLowerCase().includes(q))
    );
  }), [orders, orderSearch, CUTOFF]);

  const filteredMenu = useMemo(() => menu.filter((item) => {
    if (!menuSearch.trim()) return true;
    const q = menuSearch.toLowerCase();
    return (
      item.title?.en?.toLowerCase().includes(q) ||
      item.title?.hi?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q)
    );
  }), [menu, menuSearch]);

  const pendingCount = useMemo(() =>
    orders.filter((o) => ["Pending", "Paid", "Preparing"].includes(o.status)).length,
  [orders]);

  // ── Auth gate ─────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="page-container">
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <AdminLogin onLogin={() => setAuthed(true)} addToast={addToast} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════
  const TABS = [
    { key: "orders",   label: "📦 Orders",   badge: pendingCount  },
    { key: "menu",     label: "🍽️ Menu",     badge: menu.length   },
    { key: "offers",   label: "🖼️ Banners",  badge: offers.length },
    { key: "settings", label: "⚙️ Settings", badge: null          },
  ];

  return (
    <div className="page-container">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* ── NAVBAR ── */}
      <nav className="navbar">
        <div className="navbar__inner">
          <div className="navbar__left">
            <div className="logo">
              <div className="logo__icon" style={{ fontSize: "1rem" }}>🛠️</div>
              <div className="logo__text">
                <span className="logo__name">Admin Panel</span>
                <span className="logo__tagline">Brown Booys</span>
              </div>
            </div>
          </div>
          <div className="navbar__right">
            <button
              className="lang-btn"
              style={{
                background:   soundMuted ? "rgba(100,100,100,0.18)" : "var(--accent-orange-dim)",
                color:        soundMuted ? "var(--soft-gray)" : "var(--accent-orange)",
                border:       `1px solid ${soundMuted ? "rgba(100,100,100,0.2)" : "rgba(255,122,0,0.25)"}`,
                borderRadius: "var(--radius-full)", padding: "6px 13px",
              }}
              onClick={() => {
                if (soundMuted) {
                  // Unmute first, then play test beep via a short delay
                  // so the ref syncs before playBeep reads it.
                  setSoundMuted(false);
                  setTimeout(() => playBeep(), 50);
                } else {
                  // Already unmuted — play a test beep
                  playBeep();
                }
              }}
              title="Click to test the notification sound"
            >
              {soundMuted ? "🔇 Muted" : "🔔 Sound"}
            </button>
            <button
              className="lang-btn"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--soft-gray)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-full)", padding: "6px 10px", fontSize: ".72rem" }}
              onClick={() => setSoundMuted((m) => !m)}
              title={soundMuted ? "Unmute notifications" : "Mute notifications"}
            >
              {soundMuted ? "Unmute" : "Mute"}
            </button>
            <button
              className="lang-btn"
              style={{ background: "rgba(220,60,60,0.15)", color: "#f07070", border: "1px solid rgba(220,60,60,0.2)", borderRadius: "var(--radius-full)", padding: "6px 14px" }}
              onClick={() => { localStorage.removeItem("adminToken"); setAuthed(false); }}
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div style={{ padding: "clamp(16px,3vw,32px) clamp(14px,4vw,40px)", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── ANALYTICS CARDS ── */}
        {analytics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 13, marginBottom: 22 }}>
            {[
              { icon: "📦", label: "Today's Orders",  value: analytics.todayOrders,        color: "var(--accent-orange)" },
              { icon: "💰", label: "Today's Revenue", value: `₹${analytics.todayRevenue}`, color: "#3dc96e"              },
              { icon: "📊", label: "Total Orders",    value: analytics.totalOrders,        color: "#6aacff"              },
              { icon: "💎", label: "Total Revenue",   value: `₹${analytics.totalRevenue}`, color: "var(--accent-gold)"  },
            ].map((s, i) => (
              <div key={i} className={`glass-panel fade-in-up delay-${i + 1}`}
                style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, transition: "transform 0.3s, box-shadow 0.3s" }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "var(--shadow-md)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
              >
                <div style={{ width: 46, height: 46, borderRadius: "var(--radius-md)", background: `${s.color}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0, border: `1px solid ${s.color}33` }}>
                  {s.icon}
                </div>
                <div>
                  <div style={{ fontSize: "1.45rem", fontWeight: 900, color: s.color, letterSpacing: "-.02em", lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: ".74rem", color: "var(--muted-gray)", marginTop: 3 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SHOP CONTROLS ── */}
        <div className="glass-panel" style={{ padding: "14px 18px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: ".82rem", fontWeight: 700, color: "var(--soft-gray)", marginRight: 4 }}>Controls:</span>
          <button className="btn-add"
            style={{ background: shopSettings.shopOpen ? "linear-gradient(135deg,#1a5c2e,#2a8a44)" : "linear-gradient(135deg,#6b1414,#c62828)", boxShadow: shopSettings.shopOpen ? "0 4px 14px rgba(42,138,68,.35)" : "0 4px 14px rgba(198,40,40,.35)" }}
            onClick={toggleShop}>
            🏪 {shopSettings.shopOpen ? "Shop: OPEN" : "Shop: CLOSED"}
          </button>
          <button className="btn-add"
            style={{ background: shopSettings.deliveryOn ? "linear-gradient(135deg,#1a2d5c,#2a4a8a)" : "linear-gradient(135deg,#3a0a5e,#6a1a9e)", boxShadow: shopSettings.deliveryOn ? "0 4px 14px rgba(42,74,138,.35)" : "0 4px 14px rgba(106,26,158,.35)" }}
            onClick={toggleDelivery}>
            🛵 {shopSettings.deliveryOn ? "Delivery: ON" : "Delivery: OFF"}
          </button>
          <span style={{ marginLeft: "auto", fontSize: ".72rem", color: "var(--muted-gray)" }}>Live · 6s refresh</span>
        </div>

        {/* ── TAB BAR ── */}
        <div className="lang-switcher" style={{ marginBottom: 18, padding: 5, borderRadius: "var(--radius-lg)", width: "fit-content" }}>
          {TABS.map((t) => (
            <button key={t.key} className={`lang-btn${activeTab === t.key ? " active" : ""}`}
              style={{ padding: "8px 16px", fontSize: ".82rem" }}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
              {t.badge > 0 && (
                <span style={{ marginLeft: 5, background: activeTab === t.key ? "rgba(255,255,255,.25)" : "var(--accent-orange)", color: "#fff", fontSize: ".62rem", fontWeight: 800, borderRadius: "var(--radius-full)", padding: "1px 5px" }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════ ORDERS TAB ════════════════ */}
        {activeTab === "orders" && (
          <>
            <div className="section-header" style={{ marginBottom: 13 }}>
              <h2 className="section-title">Live Orders</h2>
              <span className="section-view-all">{filteredOrders.length} in last 24h</span>
            </div>

            <div className="search-wrapper" style={{ marginBottom: 14 }}>
              <span className="search-icon">🔍</span>
              <input className="search-bar" placeholder="Search by name, phone, status, item…"
                value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
              {orderSearch && <button className="search-clear" onClick={() => setOrderSearch("")}>✕</button>}
            </div>

            {filteredOrders.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon">📦</span>
                <p className="empty-state__title">No orders in the last 24 hours</p>
              </div>
            ) : (
              <div className="order-grid">
                {filteredOrders.map((o, idx) => (
                  <div key={o.id} className={`order-card fade-in-up delay-${Math.min(idx + 1, 6)}`}>

                    {/* Header — ID + date/time */}
                    <div className="order-card__header">
                      <span className="order-card__id">#{String(o.id).slice(-6)}</span>
                      <span className="order-card__time">🕐 {formatOrderTime(o)}</span>
                    </div>

                    {/* Customer */}
                    <div className="order-card__customer">{o.userName || "Guest"}</div>
                    <div style={{ fontSize: ".75rem", color: "var(--soft-gray)", marginBottom: 8 }}>
                      📞 {o.userPhone || "N/A"}
                      {o.paymentId && <span style={{ marginLeft: 8, color: "#6aacff" }}>💳 {o.paymentId.slice(-8)}</span>}
                    </div>

                    {/* Type + Status */}
                    <div className="order-card__meta-row">
                      <span className="tag">
                        {o.orderType === "delivery" ? "🛵 Delivery" : o.orderType === "dinein" ? "🍽️ Dine-In" : "🥡 Pickup"}
                      </span>
                      <span className={`status-badge ${statusClass(o.status)}`}>
                        <span className="status-badge__dot" />{o.status}
                      </span>
                    </div>

                    {/* Delivery address + maps link */}
                    {o.delivery?.address && (
                      <div style={{ background: "rgba(0,0,0,0.22)", borderRadius: "var(--radius-sm)", padding: "8px 10px", marginBottom: 9, marginTop: 6, fontSize: ".74rem" }}>
                        <div style={{ color: "var(--muted-gray)", marginBottom: 3 }}>📍 Delivery address</div>
                        <div style={{ color: "var(--soft-gray)", lineHeight: 1.5, marginBottom: 5 }}>{o.delivery.address}</div>
                        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ color: "var(--accent-orange)", fontWeight: 700 }}>{o.delivery.distanceKm} km</span>
                          {o.delivery.charge > 0 && <span className="tag">₹{o.delivery.charge} charge</span>}
                          {o.delivery.latitude && (
                            <a href={mapsLink(o.delivery.latitude, o.delivery.longitude)}
                              target="_blank" rel="noopener noreferrer"
                              className="tag tag--orange" style={{ textDecoration: "none" }}>
                              🗺️ Maps
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Items list */}
                    <ul className="order-card__items">
                      {(o.items || []).map((item, i) => (
                        <li key={i} className="order-card__item-row">
                          <span className="order-card__item-name">{item.name}</span>
                          <span className="order-card__item-qty">×{item.qty}</span>
                          {item.price && <span className="order-card__item-price">₹{item.price * item.qty}</span>}
                        </li>
                      ))}
                    </ul>

                    {/* Total */}
                    <div className="order-card__footer" style={{ marginBottom: 10 }}>
                      <span className="order-card__total">₹{o.total}</span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {o.status !== "Completed" && o.status !== "Cancelled" && (
                        <>
                          <button className="btn-add"
                            style={{ fontSize: ".74rem", padding: "7px 11px", borderRadius: "var(--radius-sm)" }}
                            onClick={() => updateStatus(o.id, "Completed")}>
                            ✅ Done
                          </button>
                          <select className="form-input"
                            style={{ padding: "6px 9px", fontSize: ".74rem", borderRadius: "var(--radius-sm)", height: "auto", flex: 1, minWidth: 100 }}
                            value={o.status}
                            onChange={(e) => updateStatus(o.id, e.target.value)}>
                            {["Pending","Paid","Preparing","Ready","Completed","Cancelled"].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </>
                      )}
                      <button
                        style={{ padding: "7px 11px", fontSize: ".74rem", borderRadius: "var(--radius-sm)", background: "rgba(220,60,60,0.14)", border: "1px solid rgba(220,60,60,0.24)", color: "#f07070", cursor: "pointer" }}
                        onClick={() => deleteOrder(o.id)} aria-label="Delete order">
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════ MENU TAB ════════════════ */}
        {activeTab === "menu" && (
          <>
            <div className="section-header" style={{ marginBottom: 13 }}>
              <h2 className="section-title">Menu Management</h2>
              <button className="btn-add" style={{ fontSize: ".8rem" }}
                onClick={() => {
                  setShowAddForm((v) => !v);
                  // FIX #6 — close edit form when opening add form
                  setEditingItem(null);
                }}>
                {showAddForm ? "✕ Cancel" : "+ Add Item"}
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="glass-panel fade-in-up" style={{ padding: "22px 24px", marginBottom: 18, border: "1px solid rgba(255,122,0,0.25)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: "var(--accent-orange-dim)", border: "1px solid rgba(255,122,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.1rem" }}>➕</div>
                  <div>
                    <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "var(--accent-orange)", margin: 0 }}>Add New Item</h3>
                    <p style={{ fontSize: ".72rem", color: "var(--muted-gray)", margin: 0 }}>Fields marked * are required.</p>
                  </div>
                </div>
                <AdminItemForm
                  form={addForm} setForm={setAddForm}
                  variantName={variantName} setVariantName={setVariantName}
                  variantPrice={variantPrice} setVariantPrice={setVariantPrice}
                  addToast={addToast}
                />
                <div style={{ display: "flex", gap: 9, marginTop: 6 }}>
                  <button className="btn-checkout shine" style={{ flex: 1 }} onClick={() => submitAddItem(addForm)}>✅ Add to Menu</button>
                  <button className="btn-add" style={{ background: "rgba(255,255,255,0.06)", boxShadow: "none", border: "1px solid var(--glass-border)" }}
                    onClick={() => { setShowAddForm(false); setAddForm(EMPTY_FORM); setVariantName(""); setVariantPrice(""); }}>Cancel</button>
                </div>
              </div>
            )}

            {/* Edit form */}
            {editingItem && (
              <div className="glass-panel fade-in-up" style={{ padding: "18px 22px", marginBottom: 18, border: "1px solid rgba(255,179,71,0.22)" }}>
                <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "var(--accent-gold)", marginBottom: 14 }}>✏️ Editing: {editingItem.title?.en}</h3>
                <AdminEditForm item={editingItem} setItem={setEditingItem} />
                <div style={{ display: "flex", gap: 9 }}>
                  <button className="btn-checkout shine" style={{ flex: 1 }} onClick={() => submitEditItem(editingItem)}>💾 Save Changes</button>
                  <button className="btn-add" style={{ background: "rgba(255,255,255,0.06)", boxShadow: "none", border: "1px solid var(--glass-border)" }}
                    onClick={() => setEditingItem(null)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="search-wrapper" style={{ marginBottom: 13 }}>
              <span className="search-icon">🔍</span>
              <input className="search-bar" placeholder="Search menu items…"
                value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} />
              {menuSearch && <button className="search-clear" onClick={() => setMenuSearch("")}>✕</button>}
            </div>

            {/* List */}
            {filteredMenu.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon">🍽️</span>
                <p className="empty-state__title">No items found</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredMenu.map((item) => (
                  <div key={item.id || item._id} className="glass-panel fade-in-up" style={{ padding: "12px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                    {item.image
                      ? <img src={item.image} alt="" style={{ width: 58, height: 46, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} loading="lazy" />
                      : <div style={{ width: 58, height: 46, background: "var(--card-elevated)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>🍽️</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--text-white)", marginBottom: 1 }}>
                        {item.title?.en}
                        {item.isNew        && <span className="menu-card__badge menu-card__badge--new"        style={{ fontSize: ".58rem", padding: "2px 5px", marginLeft: 5 }}>New</span>}
                        {item.isBestseller && <span className="menu-card__badge menu-card__badge--bestseller" style={{ fontSize: ".58rem", padding: "2px 5px", marginLeft: 5 }}>Best</span>}
                        {item.isHot        && <span className="menu-card__badge menu-card__badge--hot"        style={{ fontSize: ".58rem", padding: "2px 5px", marginLeft: 5 }}>Hot</span>}
                      </div>
                      {item.category && <div style={{ fontSize: ".68rem", color: "var(--accent-orange)", fontWeight: 600, marginBottom: 2, opacity: 0.8 }}>📂 {item.category}</div>}
                      <div style={{ fontSize: ".74rem", color: "var(--muted-gray)" }}>
                        {item.available === false
                          ? <span style={{ color: "#f07070" }}>● Unavailable</span>
                          : <span style={{ color: "#3dc96e" }}>● Available</span>
                        }
                        {item.isVeg !== false
                          ? <span style={{ marginLeft: 8 }}>🟢 Veg</span>
                          : <span style={{ marginLeft: 8 }}>🔴 Non-veg</span>
                        }
                      </div>
                      {item.price
                        ? <div style={{ fontSize: ".78rem", color: "var(--accent-orange)", fontWeight: 700 }}>₹{item.price}</div>
                        : item.variants?.slice(0, 2).map((v) => (
                            <div key={v.name?.en} style={{ fontSize: ".7rem", color: "var(--muted-gray)" }}>{v.name?.en} — ₹{v.price}</div>
                          ))
                      }
                    </div>
                    <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                      <button className="btn-add" style={{ padding: "7px 11px", fontSize: ".76rem", borderRadius: "var(--radius-sm)" }}
                        onClick={() => {
                          // FIX #6 — close add form when opening edit form
                          setShowAddForm(false);
                          setEditingItem({ ...item, id: item.id || item._id });
                        }}>✏️</button>
                      <button style={{ padding: "7px 11px", background: "rgba(220,60,60,0.14)", border: "1px solid rgba(220,60,60,0.24)", color: "#f07070", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: ".76rem" }}
                        onClick={() => deleteItem(item.id || item._id, item.title?.en)}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════ BANNERS TAB ════════════════ */}
        {activeTab === "offers" && (
          <>
            <div className="section-header" style={{ marginBottom: 13 }}>
              <h2 className="section-title">Offer Banners</h2>
            </div>

            <div className="glass-panel fade-in-up" style={{ padding: "18px 22px", marginBottom: 18, border: "1px solid rgba(255,122,0,0.2)" }}>
              <h3 style={{ fontSize: ".95rem", fontWeight: 800, color: "var(--accent-orange)", marginBottom: 14 }}>📤 Upload New Banner</h3>
              <div className="form-group">
                <label className="form-label">Banner Image (JPG / PNG / WebP)</label>
                <input type="file" accept="image/*" className="form-input" ref={offerFileRef}
                  onChange={(e) => setOfferFile(e.target.files[0] || null)} />
              </div>
              {/* FIX #9 — preview is driven by useEffect, no inline createObjectURL */}
              {offerPreview && (
                <div style={{ marginBottom: 12 }}>
                  <img src={offerPreview} alt="Preview" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: "var(--radius-md)" }} />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Title (optional)</label>
                  <input className="form-input" placeholder="e.g. Weekend Offer" value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Subtitle (optional)</label>
                  <input className="form-input" placeholder="e.g. 20% off wraps" value={offerSubtitle} onChange={(e) => setOfferSubtitle(e.target.value)} />
                </div>
              </div>
              <button className="btn-checkout shine" onClick={uploadOffer}>📤 Upload Banner</button>
            </div>

            {offers.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon">🖼️</span>
                <p className="empty-state__title">No banners yet</p>
                <p className="empty-state__desc">Upload your first offer banner above.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {offers.map((o) => (
                  <div key={o._id} className="glass-panel fade-in-up" style={{ padding: "12px 15px", display: "flex", gap: 13, alignItems: "center" }}>
                    <img src={o.imageUrl} alt={o.title} style={{ width: 96, height: 62, objectFit: "cover", borderRadius: "var(--radius-sm)", flexShrink: 0 }} loading="lazy" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {o.title    && <div style={{ fontWeight: 700, fontSize: ".88rem", marginBottom: 2 }}>{o.title}</div>}
                      {o.subtitle && <div style={{ fontSize: ".76rem", color: "var(--muted-gray)" }}>{o.subtitle}</div>}
                      <span className={`status-badge ${o.active ? "status-badge--ready" : "status-badge--cancelled"}`} style={{ marginTop: 6, display: "inline-flex" }}>
                        <span className="status-badge__dot" />{o.active ? "Active" : "Hidden"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                    <button style={{ padding: "8px 12px", background: o.active ? "rgba(60,100,220,0.14)" : "rgba(42,138,68,0.14)", border: `1px solid ${o.active ? "rgba(60,100,220,0.24)" : "rgba(42,138,68,0.24)"}`, color: o.active ? "#6aacff" : "#3dc96e", borderRadius: "var(--radius-sm)", cursor: "pointer", flexShrink: 0, fontSize: ".8rem" }}
                      onClick={() => toggleOffer(o._id, o.active)}>
                      {o.active ? "🙈 Hide" : "👁️ Show"}
                    </button>
                    <button style={{ padding: "8px 12px", background: "rgba(220,60,60,0.14)", border: "1px solid rgba(220,60,60,0.24)", color: "#f07070", borderRadius: "var(--radius-sm)", cursor: "pointer", flexShrink: 0, fontSize: ".8rem" }}
                      onClick={() => deleteOffer(o._id)}>
                      🗑️ Delete
                    </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ════════════════ SETTINGS TAB ════════════════ */}
        {activeTab === "settings" && (
          <>
            <div className="section-header" style={{ marginBottom: 13 }}>
              <h2 className="section-title">Shop Settings</h2>
            </div>
            <div className="glass-panel fade-in-up" style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: ".8rem", color: "var(--muted-gray)", marginBottom: 16 }}>
                These values control delivery eligibility and charges for all customers.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 18 }}>
                {[
                  { key: "freeDeliveryAbove", label: "Min order for free delivery (₹)" },
                  { key: "deliveryBaseKm",    label: "Free delivery radius (km)"        },
                  { key: "deliveryRatePerKm", label: "Charge per km beyond base (₹)"   },
                ].map(({ key, label }) => (
                  <div key={key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{label}</label>
                    <input type="number" className="form-input"
                      value={shopSettings[key] || ""}
                      onChange={(e) => setShopSettings((s) => ({ ...s, [key]: Number(e.target.value) }))} />
                  </div>
                ))}
              </div>
              <button className="btn-checkout shine" onClick={saveSettings}>💾 Save Settings</button>
            </div>

            {/* FIX — shop coordinates, used by the customer app to compute
                delivery distance via Haversine. Without these set,
                distanceKm always comes out as 0. */}
            <div className="glass-panel fade-in-up" style={{ padding: "20px 24px", marginTop: 16 }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 6 }}>📍 Shop Location</h3>
              <p style={{ fontSize: ".8rem", color: "var(--muted-gray)", marginBottom: 16 }}>
                Used to calculate delivery distance and charges for customers.
                Open your shop in Google Maps, right-click the pin, and copy the
                coordinates shown (latitude, longitude).
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginBottom: 18 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Shop Latitude</label>
                  <input type="number" step="any" className="form-input"
                    value={shopSettings.shopLatitude ?? ""}
                    onChange={(e) => setShopSettings((s) => ({ ...s, shopLatitude: Number(e.target.value) }))} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Shop Longitude</label>
                  <input type="number" step="any" className="form-input"
                    value={shopSettings.shopLongitude ?? ""}
                    onChange={(e) => setShopSettings((s) => ({ ...s, shopLongitude: Number(e.target.value) }))} />
                </div>
              </div>
              <button className="btn-checkout shine" onClick={saveSettings}>💾 Save Location</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════════

function FlagToggles({ form, setForm, showAvailable }) {
  const flags = [
    ["isNew","✨ New"], ["isBestseller","⭐ Bestseller"],
    ["isHot","🔥 Hot"], ["isVeg","🟢 Veg"],
    ...(showAvailable ? [["available","✅ Available"]] : []),
  ];
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      {flags.map(([k, label]) => (
        <label key={k} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: ".8rem", color: "var(--soft-gray)" }}>
          <div className="toggle-switch" style={{ transform: "scale(0.84)" }}>
            <input type="checkbox" checked={!!form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.checked }))} />
            <div className="toggle-track" />
          </div>
          {label}
        </label>
      ))}
    </div>
  );
}

function VariantBuilder({ variants, setVariants, variantName, setVariantName, variantPrice, setVariantPrice, addToast }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label className="form-label" style={{ marginBottom: 7 }}>Variants (optional — replaces flat price)</label>
      <div style={{ display: "flex", gap: 7, marginBottom: 8 }}>
        <input className="form-input" placeholder="Variant name (e.g. Large)" style={{ flex: 2, margin: 0 }}
          value={variantName} onChange={(e) => setVariantName(e.target.value)} />
        <input type="number" className="form-input" placeholder="₹ Price" style={{ flex: 1, margin: 0 }}
          value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} />
        <button className="btn-add" style={{ flexShrink: 0, padding: "10px 13px", borderRadius: "var(--radius-sm)" }}
          onClick={() => {
            if (!variantName.trim() || !variantPrice) { addToast("⚠️ Fill variant name and price.", "warning"); return; }
            setVariants([...variants, { name: { en: variantName, hi: variantName, gu: variantName }, price: Number(variantPrice) }]);
            setVariantName(""); setVariantPrice("");
          }}>+ Add</button>
      </div>
      {variants.map((v, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, padding: "5px 9px", background: "var(--accent-orange-dim)", borderRadius: "var(--radius-sm)" }}>
          <span style={{ flex: 1, fontSize: ".8rem", color: "var(--soft-gray)" }}>{v.name.en} — ₹{v.price}</span>
          <button style={{ background: "rgba(220,60,60,0.14)", border: "none", color: "#f07070", borderRadius: "var(--radius-xs)", padding: "2px 7px", cursor: "pointer", fontSize: ".7rem" }}
            onClick={() => setVariants(variants.filter((_, k) => k !== i))}>✕</button>
        </div>
      ))}
    </div>
  );
}

function AdminItemForm({ form, setForm, variantName, setVariantName, variantPrice, setVariantPrice, addToast }) {
  const CATEGORIES = ["Burgers","Wraps","Sides","Beverages","Desserts","Combos","Breakfast","Specials","Other"];

  // FIX #3 — manage add-form image preview via useEffect (no inline createObjectURL)
  const [addPreviewUrl, setAddPreviewUrl] = useState(null);
  useEffect(() => {
    if (!form.imageFile) { setAddPreviewUrl(null); return; }
    const url = URL.createObjectURL(form.imageFile);
    setAddPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [form.imageFile]);

  return (
    <>
      {/* Basic Info */}
      <div style={{ marginBottom: 16 }}>
        <SectionDivider label="Basic Info" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {[["en","Name (English) *"],["hi","Name (Hindi)"],["gu","Name (Gujarati)"],["description","Description"]].map(([k, ph]) => (
            <div key={k} className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{ph}</label>
              <input className="form-input" placeholder={ph} value={form[k] || ""}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
      </div>

      {/* Pricing & Details */}
      <div style={{ marginBottom: 16 }}>
        <SectionDivider label="Pricing & Details" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9 }}>
          {!form.variantsRaw?.length && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Price (₹) *</label>
              <input type="number" className="form-input" placeholder="e.g. 99" value={form.price || ""}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} />
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Rating (0–5)</label>
            <input type="number" className="form-input" placeholder="e.g. 4.2" min="0" max="5" step="0.1"
              value={form.rating || ""} onChange={(e) => setForm((f) => ({ ...f, rating: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Prep Time (mins)</label>
            <input type="number" className="form-input" placeholder="e.g. 15" min="1"
              value={form.prepTime || ""} onChange={(e) => setForm((f) => ({ ...f, prepTime: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Category</label>
            <select className="form-input" value={form.category || ""} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              <option value="">— Select —</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Image */}
      <div style={{ marginBottom: 16 }}>
        <SectionDivider label="Image" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, alignItems: "start" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Upload File</label>
            <input type="file" accept="image/*" className="form-input"
              key={form.imageFile ? "has-file" : "empty"}
              onChange={(e) => setForm((f) => ({ ...f, imageFile: e.target.files[0] || null, imageUrl: "" }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Or Paste URL</label>
            <input className="form-input" placeholder="https://…" value={form.imageUrl || ""}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value, imageFile: null }))} />
          </div>
        </div>
        {/* FIX #3 — use stable preview URL from useEffect, not inline createObjectURL */}
        {(addPreviewUrl || form.imageUrl) && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={addPreviewUrl || form.imageUrl}
              alt="Preview"
              style={{ width: 80, height: 60, objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--glass-border)" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
            <span style={{ fontSize: ".72rem", color: "var(--muted-gray)" }}>
              {form.imageFile ? `📎 ${form.imageFile.name}` : "🔗 URL preview"}
            </span>
          </div>
        )}
      </div>

      {/* Flags */}
      <div style={{ marginBottom: 16 }}>
        <SectionDivider label="Tags & Flags" />
        <FlagToggles form={form} setForm={setForm} />
      </div>

      {/* Variants */}
      <div>
        <SectionDivider label="Variants" />
        <VariantBuilder
          variants={form.variantsRaw || []}
          setVariants={(v) => setForm((f) => ({ ...f, variantsRaw: v }))}
          variantName={variantName} setVariantName={setVariantName}
          variantPrice={variantPrice} setVariantPrice={setVariantPrice}
          addToast={addToast}
        />
      </div>
    </>
  );
}

function AdminEditForm({ item, setItem }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 10 }}>
        {["en","hi","gu"].map((l) => (
          <div key={l} className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Name ({l.toUpperCase()})</label>
            <input className="form-input" value={item.title?.[l] || ""}
              onChange={(e) => setItem((i) => ({ ...i, title: { ...i.title, [l]: e.target.value } }))} />
          </div>
        ))}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Description</label>
          <input className="form-input" value={item.description || ""}
            onChange={(e) => setItem((i) => ({ ...i, description: e.target.value }))} />
        </div>
      </div>

      {!item.variants?.length && (
        <div className="form-group">
          <label className="form-label">Price (₹)</label>
          <input type="number" className="form-input" value={item.price || ""}
            onChange={(e) => setItem((i) => ({ ...i, price: e.target.value }))} />
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Upload New Image (optional)</label>
        <input type="file" accept="image/*" className="form-input"
          onChange={(e) => setItem((i) => ({ ...i, imageFile: e.target.files[0] || null, image: "" }))} />
        <label className="form-label" style={{ marginTop: 8 }}>Or paste an Image URL</label>
        <input className="form-input" placeholder="https:// (leave blank to keep current image)"
          value={item.image || ""}
          onChange={(e) => setItem((i) => ({ ...i, image: e.target.value, imageFile: null }))} />
        {item.imageFile && (
          <p style={{ fontSize: ".75rem", color: "var(--accent-gold)", marginTop: 6 }}>
            📎 {item.imageFile.name} selected — this will replace the current image on save.
          </p>
        )}
        {!item.imageFile && item.image && (
          <img src={item.image} alt="" style={{ width: 70, height: 52, objectFit: "cover", borderRadius: "var(--radius-sm)", marginTop: 7 }} />
        )}
      </div>

      {/* FIX #7 — safe FlagToggles adapter: only spreads flag keys, never clobbers full item */}
      <FlagToggles
        form={{ isNew: item.isNew, isBestseller: item.isBestseller, isHot: item.isHot, isVeg: item.isVeg, available: item.available }}
        setForm={(updater) => setItem((i) => {
          const currentFlags = { isNew: i.isNew, isBestseller: i.isBestseller, isHot: i.isHot, isVeg: i.isVeg, available: i.available };
          const updatedFlags = updater(currentFlags);
          return { ...i, ...updatedFlags };
        })}
        showAvailable
      />

      {item.variants?.map((v, idx) => (
        // FIX D — key combines name+price so React correctly reconciles on delete/reorder
        <div key={`${v.name?.en}-${idx}`} style={{ display: "flex", gap: 7, marginBottom: 6 }}>
          <input className="form-input" style={{ flex: 2, margin: 0 }} value={v.name?.en || ""}
            onChange={(e) => {
              const upd = [...item.variants];
              upd[idx] = { ...upd[idx], name: { en: e.target.value, hi: e.target.value, gu: e.target.value } };
              setItem((i) => ({ ...i, variants: upd }));
            }} />
          <input type="number" className="form-input" style={{ flex: 1, margin: 0 }} value={v.price}
            onChange={(e) => {
              const upd = [...item.variants];
              upd[idx] = { ...upd[idx], price: Number(e.target.value) };
              setItem((i) => ({ ...i, variants: upd }));
            }} />
          <button style={{ padding: "0 12px", background: "rgba(220,60,60,0.14)", border: "1px solid rgba(220,60,60,0.24)", color: "#f07070", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
            onClick={() => setItem((i) => ({ ...i, variants: i.variants.filter((_, k) => k !== idx) }))}>✕</button>
        </div>
      ))}
      <button className="lang-btn" style={{ marginBottom: 14, background: "var(--accent-orange-dim)", color: "var(--accent-orange)", borderRadius: "var(--radius-full)", padding: "6px 13px" }}
        onClick={() => setItem((i) => ({ ...i, variants: [...(i.variants || []), { name: { en: "", hi: "", gu: "" }, price: 0 }] }))}>
        + Add Variant
      </button>
    </>
  );
}

// Small helper for section divider labels inside forms
function SectionDivider({ label }) {
  return (
    <div style={{ fontSize: ".72rem", fontWeight: 800, letterSpacing: ".08em", color: "var(--muted-gray)", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
      {label}
      <span style={{ flex: 1, height: 1, background: "var(--glass-border)" }} />
    </div>
  );
}
