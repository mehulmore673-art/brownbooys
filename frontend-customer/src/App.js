// src/App.js
import React, { useState, useEffect, useMemo, useCallback } from "react";
import "./App.css";

import Login          from "./Login";
import Navbar         from "./components/Navbar";
import OfferBanner    from "./components/OfferBanner";
import MenuCard       from "./components/MenuCard";
import CartModal      from "./components/CartModal";
import BottomNav      from "./components/BottomNav";
import ToastContainer from "./components/ToastContainer";

import { useToasts }  from "./hooks/useToasts";
import { usePolling } from "./hooks/usePolling";
import { apiFetch, safeFetch } from "./utils/api";
import { calcDeliveryCharge } from "./utils/geo";
import { loadRazorpayScript } from "./utils/razorpay";

const CATEGORY_CHIPS = [
  { key: "",          emoji: "🍴", label: "All"      },
  { key: "Burgers",    emoji: "🍔", label: "Burgers"  },
  { key: "Wraps",      emoji: "🌯", label: "Wraps"    },
  { key: "Sides",      emoji: "🍟", label: "Sides"    },
  { key: "Beverages",  emoji: "🥤", label: "Drinks"   },
  { key: "Desserts",   emoji: "🍰", label: "Desserts" },
  { key: "Combos",     emoji: "🍽️", label: "Combos"   },
  { key: "Breakfast",  emoji: "🥞", label: "Breakfast"},
  { key: "Specials",   emoji: "⭐", label: "Specials" },
];

const DEFAULT_SHOP = {
  shopOpen: true, deliveryOn: true,
  freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5,
  shopLatitude: 0, shopLongitude: 0,
};

const DEFAULT_DELIVERY = { latitude: null, longitude: null, address: "", distanceKm: 0, charge: 0 };

// FIX — prefer the server-generated `createdAt` timestamp (always
// present, reliable, timezone-correct) over the client-supplied
// `date`/`time` strings (depend on the customer's device clock at
// checkout, and are missing on any order placed before this field
// existed). Falls back gracefully so older orders still show
// something instead of "undefined · undefined".
function formatOrderTime(o) {
  if (o.createdAt) {
    const d = new Date(o.createdAt);
    const date = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    return `${date} · ${time}`;
  }
  if (o.date) return `${o.date}${o.time ? " · " + o.time : ""}`;
  return o.time || "—";
}

function App() {
  const { toasts, add: addToast, remove: removeToast } = useToasts();

  // ── Auth (simple phone-based identity, no backend account system) ──
  const [user, setUser] = useState(() => {
    const id   = localStorage.getItem("userId");
    const name = localStorage.getItem("userName");
    return id ? { id, name: name || id } : null;
  });

  const handleLogout = useCallback(() => {
    const uid = localStorage.getItem("userId");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    if (uid) localStorage.removeItem(`cart_${uid}`); // clear this user's saved cart
    setUser(null);
    setCart([]);      // clear in-memory cart immediately
    setOrders([]);    // clear orders so previous user's orders don't flash
    setActiveTab("menu");
  }, []);

  // ── Core data ──────────────────────────────────────────────
  const [menu,         setMenu]         = useState([]);
  const [shopSettings, setShopSettings] = useState(DEFAULT_SHOP);
  const [orders,       setOrders]       = useState([]);
  const [menuLoading,  setMenuLoading]  = useState(true);

  // ── UI state ───────────────────────────────────────────────
  const [lang,       setLang]       = useState(() => localStorage.getItem("lang") || "en");
  const [search,     setSearch]     = useState("");
  const [category,   setCategory]   = useState("");
  const [openItem,   setOpenItem]   = useState(null);
  const [activeTab,  setActiveTab]  = useState("menu"); // menu | orders | profile
  const [showCart,   setShowCart]   = useState(false);

  // ── Cart (keyed to userId; guests use cart_guest so items added
  //    before login survive a page refresh and auto-migrate on login) ──
  const GUEST_CART_KEY = "cart_guest";
  const cartKey = user ? `cart_${user.id}` : GUEST_CART_KEY;
  const [cart, setCart] = useState(() => {
    try {
      const uid = localStorage.getItem("userId");
      if (uid) {
        const userRaw  = localStorage.getItem(`cart_${uid}`);
        const guestRaw = localStorage.getItem(GUEST_CART_KEY);
        const userCart  = userRaw  ? JSON.parse(userRaw)  : [];
        const guestCart = guestRaw ? JSON.parse(guestRaw) : [];
        // First login after adding guest items — migrate guest cart
        if (guestCart.length && !userRaw) {
          localStorage.removeItem(GUEST_CART_KEY);
          return guestCart;
        }
        return userCart;
      }
      // Not logged in — load guest cart so browsing/adding is preserved
      const raw = localStorage.getItem(GUEST_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch {}
  }, [cart, cartKey]);

  // ── Checkout state ─────────────────────────────────────────
  const [orderType, setOrderType] = useState("pickup");
  const [delivery,  setDelivery]  = useState(DEFAULT_DELIVERY);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  useEffect(() => { localStorage.setItem("lang", lang); }, [lang]);

  /* ────────────────────────────────────────────────────────
     LOAD MENU + SHOP SETTINGS
  ──────────────────────────────────────────────────────── */
  const loadMenu = useCallback(async () => {
    try {
      const data = await apiFetch("/api/menu");
      setMenu(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load menu:", err.message);
      addToast("📡 Could not load menu. Pull to refresh.", "error");
    } finally {
      setMenuLoading(false);
    }
  }, [addToast]);

  const loadShop = useCallback(async () => {
    const data = await safeFetch("/api/shop");
    if (data) setShopSettings((prev) => ({ ...prev, ...data }));
  }, []);

  useEffect(() => {
    loadMenu();
    loadShop();
    // FIX — refresh shop settings periodically so shopOpen/deliveryOn
    // toggles from the admin reach the customer without a page reload.
    const id = setInterval(loadShop, 30_000);
    return () => clearInterval(id);
  }, [loadMenu, loadShop]);

  /* ────────────────────────────────────────────────────────
     LOAD CUSTOMER'S ORDERS (poll while on Orders tab / logged in)
  ──────────────────────────────────────────────────────── */
  const loadOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await apiFetch(`/api/orders?userId=${encodeURIComponent(user.id)}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load orders:", err.message);
    }
  }, [user?.id]);

  // Poll every 8s while logged in — lighter than admin's 3s, customers
  // don't need sub-second updates.
  // FIX — depend on the actual user id, not just its truthiness. If a
  // customer logs out and a different customer logs in on the same
  // device without a page reload, [!!user?.id] stays `[true] -> [true]`
  // and this effect wouldn't restart, delaying the new user's first
  // order fetch by up to 8s (the stale-ref still eventually picks up
  // the right data on the next tick, so nothing was actually lost —
  // but this makes the switch immediate instead of delayed).
  usePolling(loadOrders, 8000, [user?.id || null]);

  const hasActiveOrder = useMemo(
    () => orders.some((o) => !["Completed", "Cancelled"].includes(o.status)),
    [orders]
  );

  /* ────────────────────────────────────────────────────────
     CART HELPERS
  ──────────────────────────────────────────────────────── */
  const addToCart = useCallback((item, variant = null) => {
    const itemId = item.id ?? item._id;
    const key = variant ? `${itemId}-${variant.name?.en || variant.name}` : String(itemId);
    const price = variant ? variant.price : item.price;

    setCart((prev) => {
      const exist = prev.find((i) => i.key === key);
      if (exist) {
        return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          key,
          itemId,
          item: { id: itemId, title: item.title, image: item.image },
          variant: variant ? { name: variant.name } : null,
          price,
          qty: 1,
        },
      ];
    });
    addToast(`✅ Added to cart`, "success", 1800);
  }, [addToast]);

  const changeQty = useCallback((key, type) => {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, qty: type === "inc" ? i.qty + 1 : i.qty - 1 } : i))
        .filter((i) => i.qty > 0)
    );
  }, []);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.qty, 0), [cart]);
  const subtotal  = useMemo(() => cart.reduce((s, i) => s + i.price * i.qty, 0), [cart]);

  const deliveryFee = useMemo(() => {
    if (orderType !== "delivery") return 0;
    if (subtotal >= (shopSettings.freeDeliveryAbove || 400)) return 0;
    return delivery.charge || 0;
  }, [orderType, subtotal, delivery.charge, shopSettings.freeDeliveryAbove]);

  const grandTotal = subtotal + deliveryFee;

  // FIX — when subtotal crosses the free-delivery threshold, recompute
  // delivery.charge to reflect "Free" immediately (CartModal reads
  // delivery.charge directly for its own row).
  useEffect(() => {
    if (orderType !== "delivery" || !delivery.latitude) return;
    const recalculated = calcDeliveryCharge(delivery.distanceKm, shopSettings);
    if (recalculated !== delivery.charge) {
      setDelivery((d) => ({ ...d, charge: recalculated }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSettings.deliveryBaseKm, shopSettings.deliveryRatePerKm]);

  /* ────────────────────────────────────────────────────────
     CHECKOUT
  ──────────────────────────────────────────────────────── */
  const resetCartAndCheckout = useCallback(() => {
    setCart([]);
    setShowCart(false);
    setOrderType("pickup");
    setDelivery(DEFAULT_DELIVERY);
  }, []);

  const buildOrderPayload = useCallback((status, paymentId = "") => {
    const now = new Date();
    return {
      items: cart.map((i) => ({
        name: i.variant
          ? `${i.item.title?.en || i.item.title} - ${i.variant.name?.en || i.variant.name}`
          : (i.item.title?.en || i.item.title),
        qty: i.qty,
        price: i.price,
        variant: i.variant ? (i.variant.name?.en || i.variant.name) : undefined,
      })),
      total: grandTotal,
      orderType,
      userId: user.id,
      userName: user.name,
      userPhone: user.phone || user.id,
      status,
      paymentId,
      time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
      date: now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      delivery: orderType === "delivery" ? {
        address:    delivery.address,
        latitude:   delivery.latitude,
        longitude:  delivery.longitude,
        distanceKm: delivery.distanceKm,
        charge:     deliveryFee,
      } : undefined,
    };
  }, [cart, grandTotal, orderType, user, delivery, deliveryFee]);

  const placeOrder = useCallback(async (status, paymentId = "") => {
    try {
      const payload = buildOrderPayload(status, paymentId);
      await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      addToast("🎉 Order placed successfully!", "success", 5000);
      resetCartAndCheckout();
      setActiveTab("orders");
      loadOrders();
    } catch (err) {
      addToast("❌ " + (err.message || "Failed to place order."), "error");
    }
  }, [buildOrderPayload, addToast, resetCartAndCheckout, loadOrders]);

  const handleCheckout = useCallback(async () => {
    if (!user) {
      addToast("⚠️ Please log in to place an order.", "warning");
      setActiveTab("profile");
      return;
    }
    if (cart.length === 0) return;

    // ── Validation before hitting payment ──
    if (!shopSettings.shopOpen) {
      addToast("🏪 The shop is currently closed. Please try again later.", "error");
      return;
    }
    if (orderType === "delivery") {
      if (!shopSettings.deliveryOn) {
        addToast("🛵 Delivery is currently unavailable.", "error");
        return;
      }
      if (!delivery.latitude || !delivery.longitude) {
        addToast("📍 Please use 'Auto-detect my location' to set your delivery coordinates, or allow location access in your browser.", "warning", 6000);
        return;
      }
    }

    setIsPlacingOrder(true);
    try {
      // ── Load Razorpay checkout script ──
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        addToast("📡 Could not load payment gateway. Check your connection.", "error");
        setIsPlacingOrder(false); // FIX — reset spinner on early exit
        return;
      }
      // FIX — loadRazorpayScript() can resolve true even when the script
      // tag exists but checkout.js was blocked (ad-blockers / privacy
      // extensions commonly block checkout.razorpay.com). Without this
      // check, `new window.Razorpay(...)` below throws a cryptic
      // "Razorpay is not a constructor" TypeError instead of a clear
      // message to the customer.
      if (typeof window.Razorpay !== "function") {
        addToast("⚠️ Payment gateway blocked by your browser. Please disable ad-blockers/privacy extensions for this site and try again.", "error", 7000);
        setIsPlacingOrder(false); // FIX — reset spinner on early exit
        return;
      }

      // ── Create order on backend ──
      // FIX — on a Render free-tier cold start, the FIRST request after
      // idle is the one that wakes the server up and can time out or
      // 502 even though the server comes online seconds later. We retry
      // once automatically after a short delay before surfacing an
      // error, so customers don't have to manually retry for what is
      // really just "the server was asleep."
      let createRes;
      try {
        createRes = await apiFetch("/api/payment/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: grandTotal }),
        });
      } catch (firstErr) {
        addToast("⏳ Server is waking up, retrying…", "info", 4000);
        await new Promise((r) => setTimeout(r, 3000));
        try {
          createRes = await apiFetch("/api/payment/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: grandTotal }),
          });
        } catch (secondErr) {
          addToast("❌ " + (secondErr.message || "Could not initiate payment. Please try again."), "error", 6000);
          setIsPlacingOrder(false); // FIX — reset spinner on early exit
          return;
        }
      }

      if (!createRes?.success) {
        addToast("❌ Could not initiate payment.", "error");
        setIsPlacingOrder(false); // FIX — reset spinner on early exit
        return;
      }

      // ── Open Razorpay checkout ──
      const options = {
        key: createRes.keyId,
        amount: createRes.amount,
        currency: createRes.currency,
        name: "Brown Booys",
        description: "Food order payment",
        order_id: createRes.orderId,
        prefill: {
          name: user.name || "",
          contact: user.phone || user.id || "",
        },
        theme: { color: "#ff7a00" },
        handler: async (response) => {
          try {
            const verifyRes = await apiFetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              }),
            });
            if (verifyRes?.success) {
              await placeOrder("Paid", response.razorpay_payment_id);
            } else {
              addToast("❌ Payment verification failed. If money was deducted, contact support.", "error");
            }
          } catch (err) {
            addToast("❌ " + (err.message || "Payment verification failed."), "error");
          } finally {
            setIsPlacingOrder(false);
          }
        },
        modal: {
          // FIX — re-enable checkout button if user closes the Razorpay
          // modal without paying, instead of leaving it stuck spinning.
          ondismiss: () => {
            setIsPlacingOrder(false);
            addToast("ℹ️ Payment cancelled.", "info", 3000);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        setIsPlacingOrder(false);
        addToast("❌ Payment failed. Please try again.", "error");
      });
      rzp.open();
      // Note: setIsPlacingOrder(false) is handled by handler/ondismiss/failed above.
      return;
    } catch (err) {
      addToast("❌ " + (err.message || "Checkout failed."), "error");
      setIsPlacingOrder(false);
    }
  }, [user, cart, shopSettings, orderType, delivery, grandTotal, addToast, placeOrder]);

  /* ────────────────────────────────────────────────────────
     FILTERED MENU
  ──────────────────────────────────────────────────────── */
  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      if (item.available === false) return false;
      if (category && item.category !== category) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch =
          item.title?.en?.toLowerCase().includes(q) ||
          item.title?.hi?.toLowerCase().includes(q) ||
          item.title?.gu?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q);
        if (!nameMatch) return false;
      }
      return true;
    });
  }, [menu, category, search]);

  /* ────────────────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────────────────── */
  return (
    <div className="page-container">
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <Navbar
        lang={lang} setLang={setLang}
        search={search} setSearch={setSearch}
        onLogout={handleLogout}
        filteredCount={filteredMenu.length}
        user={user}
      />

      {!shopSettings.shopOpen && (
        <div className="alert alert--error" style={{ margin: "12px clamp(16px,4vw,40px) 0" }}>
          <span className="alert__icon">🏪</span>
          <span className="alert__text">We're currently closed. You can browse the menu, but ordering is disabled.</span>
        </div>
      )}

      {activeTab === "menu" && (
        <>
          <div className="restaurant-header">
            <h1 className="restaurant-title">Brown Booys</h1>
            <p className="restaurant-tagline">The Food Trailer Shop — Premium street food, made fresh.</p>
          </div>

          <div className="menu-section">
            <OfferBanner />

            <div className="category-scroll" style={{ margin: "16px 0" }} role="tablist" aria-label="Categories">
              {CATEGORY_CHIPS.map((c) => (
                <button
                  key={c.key || "all"}
                  className={`category-pill${category === c.key ? " active" : ""}`}
                  onClick={() => setCategory(c.key)}
                  role="tab"
                  aria-selected={category === c.key}
                >
                  <span className="category-pill__emoji">{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>

            <div className="section-header">
              <h2 className="section-title">{category || "Full Menu"}</h2>
              <span className="section-view-all">{filteredMenu.length} items</span>
            </div>

            {menuLoading ? (
              <div className="menu-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton-card">
                    <div className="skeleton skeleton-img" />
                    <div className="skeleton skeleton-line skeleton-line--lg" />
                    <div className="skeleton skeleton-line skeleton-line--md" />
                    <div className="skeleton skeleton-btn" />
                  </div>
                ))}
              </div>
            ) : filteredMenu.length === 0 ? (
              <div className="empty-state">
                <span className="empty-state__icon" aria-hidden="true">🔍</span>
                <p className="empty-state__title">No items found</p>
                <p className="empty-state__desc">Try a different search or category.</p>
              </div>
            ) : (
              <div className="menu-grid">
                {filteredMenu.map((item) => (
                  <MenuCard
                    key={item.id || item._id}
                    item={item}
                    lang={lang}
                    openItem={openItem}
                    setOpenItem={setOpenItem}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === "orders" && (
        <div className="menu-section" style={{ paddingTop: "calc(var(--navbar-height) + 20px)" }}>
          <div className="section-header">
            <h2 className="section-title">My Orders</h2>
          </div>

          {!user ? (
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true">👤</span>
              <p className="empty-state__title">Please log in to view your orders</p>
              <button className="btn-checkout shine" style={{ marginTop: 12 }} onClick={() => setActiveTab("profile")}>
                Go to Profile
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true">📦</span>
              <p className="empty-state__title">No orders yet</p>
              <p className="empty-state__desc">Your placed orders will show up here.</p>
            </div>
          ) : (
            <div className="order-grid">
              {orders.map((o) => (
                <div key={o._id} className="order-card fade-in-up">
                  <div className="order-card__header">
                    <span className="order-card__id">#{String(o._id).slice(-6)}</span>
                    <span className="order-card__time">🕐 {formatOrderTime(o)}</span>
                  </div>
                  <div className="order-card__meta-row">
                    <span className="tag">
                      {o.orderType === "delivery" ? "🛵 Delivery" : o.orderType === "dinein" ? "🍽️ Dine-In" : "🥡 Pickup"}
                    </span>
                    <span className={`status-badge status-badge--${
                      o.status === "Completed" ? "ready" :
                      o.status === "Cancelled" ? "cancelled" :
                      o.status === "Paid" ? "delivered" :
                      o.status === "Pending" ? "pending" : "preparing"
                    }`}>
                      <span className="status-badge__dot" />{o.status}
                    </span>
                  </div>
                  <ul className="order-card__items">
                    {(o.items || []).map((it, i) => (
                      <li key={i} className="order-card__item-row">
                        <span className="order-card__item-name">{it.name}</span>
                        <span className="order-card__item-qty">×{it.qty}</span>
                        <span className="order-card__item-price">₹{it.price * it.qty}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="order-card__footer">
                    <span className="order-card__total">₹{o.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="menu-section" style={{ paddingTop: "calc(var(--navbar-height) + 20px)" }}>
          {!user ? (
            <Login setUser={setUser} />
          ) : (
            <div className="profile-page fade-in-up">
              <div className="profile-header">
                <div className="profile-avatar profile-avatar--placeholder">
                  {(user.name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="profile-info__name">{user.name}</div>
                  <div className="profile-info__email">📞 {user.phone || user.id}</div>
                </div>
              </div>

              <div className="profile-menu">
                <button className="profile-menu__item" onClick={() => setActiveTab("orders")}>
                  <span className="profile-menu__icon">📦</span>
                  <span className="profile-menu__label">My Orders</span>
                  <span className="profile-menu__arrow">›</span>
                </button>
                <button className="profile-menu__item" onClick={() => {
                  // FIX — was `setLang("en")` which just reset to English every time,
                  // making the language selector useless from the profile page.
                  // Now cycles en → hi → gu → en so tapping it actually works.
                  const cycle = { en: "hi", hi: "gu", gu: "en" };
                  setLang((l) => cycle[l] || "en");
                }}>
                  <span className="profile-menu__icon">🌐</span>
                  <span className="profile-menu__label">Language: {lang.toUpperCase()}</span>
                  <span className="profile-menu__arrow">›</span>
                </button>
                <button className="profile-menu__item" onClick={handleLogout}>
                  <span className="profile-menu__icon">🚪</span>
                  <span className="profile-menu__label">Logout</span>
                  <span className="profile-menu__arrow">›</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating cart button */}
      {cart.length > 0 && activeTab === "menu" && (
        <div className="cart-float">
          <button className="cart-float__btn shine" onClick={() => setShowCart(true)}>
            <span className="cart-float__icon">🛒</span>
            <span className="cart-float__text">View Cart</span>
            <span className="cart-float__badge">{cartCount}</span>
            <span className="cart-float__price">₹{subtotal}</span>
          </button>
        </div>
      )}

      <CartModal
        show={showCart}
        onClose={() => setShowCart(false)}
        cart={cart}
        lang={lang}
        changeQty={changeQty}
        orderType={orderType}
        setOrderType={setOrderType}
        shopSettings={shopSettings}
        delivery={delivery}
        setDelivery={setDelivery}
        subtotal={subtotal}
        deliveryFee={deliveryFee}
        grandTotal={grandTotal}
        cartCount={cartCount}
        isPlacingOrder={isPlacingOrder}
        onCheckout={handleCheckout}
        addToast={addToast}
      />

      <BottomNav
        active={activeTab}
        setActive={setActiveTab}
        cartCount={cartCount}
        onCartOpen={() => setShowCart(true)}
        hasActiveOrder={hasActiveOrder}
      />
    </div>
  );
}

export default App;
