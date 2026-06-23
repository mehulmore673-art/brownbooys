// src/components/CartModal.jsx
import React from "react";
import DeliveryLocator from "./DeliveryLocator";

export default function CartModal({
  show, onClose,
  cart, lang,
  changeQty,
  orderType, setOrderType,
  shopSettings,
  delivery, setDelivery,
  subtotal, deliveryFee, grandTotal, cartCount,
  isPlacingOrder, onCheckout,
  addToast,
}) {
  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Your cart"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal__handle" aria-hidden="true" />

        {/* Header */}
        <div className="modal__header">
          <div className="modal__title">
            🛒 Your Cart
            {cartCount > 0 && (
              <span className="modal__count" aria-label={`${cartCount} items`}>
                {cartCount}
              </span>
            )}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close cart">✕</button>
        </div>

        {/* Body */}
        <div className="modal__body">
          {cart.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon" aria-hidden="true">🛒</span>
              <p className="empty-state__title">Cart is empty</p>
              <p className="empty-state__desc">Add delicious items from the menu!</p>
            </div>
          ) : (
            <>
              {cart.map((item) => (
                <div key={item.key} className="cart-item">
                  {item.item?.image ? (
                    <img
                      className="cart-item__image"
                      src={item.item.image}
                      alt={item.item.title?.en}
                      loading="lazy"
                    />
                  ) : (
                    <div className="cart-item__image cart-item__image--placeholder" aria-hidden="true">
                      🍽️
                    </div>
                  )}

                  <div className="cart-item__info">
                    <div className="cart-item__name">
                      {item.variant
                        ? `${item.item.title?.[lang] || item.item.title?.en} – ${item.variant.name?.[lang] || item.variant.name?.en}`
                        : (item.item.title?.[lang] || item.item.title?.en)}
                    </div>
                    <div className="cart-item__price">₹{item.price} each</div>
                  </div>

                  <div className="cart-item__controls">
                    <div className="quantity-control" role="group" aria-label="Adjust quantity">
                      <button
                        className="quantity-btn"
                        onClick={() => changeQty(item.key, "dec")}
                        aria-label="Decrease quantity"
                      >−</button>
                      <span className="quantity-count" aria-live="polite">{item.qty}</span>
                      <button
                        className="quantity-btn"
                        onClick={() => changeQty(item.key, "inc")}
                        aria-label="Increase quantity"
                      >+</button>
                    </div>
                    <span className="cart-item__total gradient-text">
                      ₹{item.price * item.qty}
                    </span>
                  </div>
                </div>
              ))}

            </>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="modal__footer">
            {/* Order type */}
            <div className="form-group">
              <label className="form-label" htmlFor="order-type-select">Order Type</label>
              <select
                id="order-type-select"
                className="form-input"
                value={orderType}
                onChange={(e) => {
                  setOrderType(e.target.value);
                  setDelivery({ latitude: null, longitude: null, address: "", distanceKm: 0, charge: 0 });
                }}
              >
                <option value="pickup">🥡 Pickup</option>
                <option value="dinein">🍽️ Dine-In</option>
                {shopSettings.deliveryOn && <option value="delivery">🛵 Delivery</option>}
              </select>
            </div>

            {/* Delivery locator */}
            {orderType === "delivery" && (
              <>
                <DeliveryLocator
                  shopSettings={shopSettings}
                  delivery={delivery}
                  onUpdate={setDelivery}
                  addToast={addToast}
                />
                {subtotal < (shopSettings.freeDeliveryAbove || 400) && (
                  <div className="alert alert--warning">
                    <span className="alert__icon">⚠️</span>
                    <span className="alert__text">
                      Add ₹{(shopSettings.freeDeliveryAbove || 400) - subtotal} more for <strong>FREE delivery</strong>.
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Price summary */}
            <div className="cart-summary" role="table" aria-label="Order summary">
              <div className="cart-summary__row">
                <span>Subtotal ({cartCount} item{cartCount !== 1 ? "s" : ""})</span>
                <span>₹{subtotal}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="cart-summary__row">
                  <span>Delivery ({delivery.distanceKm} km)</span>
                  <span>₹{deliveryFee}</span>
                </div>
              )}
              {deliveryFee === 0 && orderType === "delivery" && delivery.latitude && (
                <div className="cart-summary__row">
                  <span>Delivery</span>
                  <span style={{ color: "#3dc96e" }}>🎉 Free</span>
                </div>
              )}
              <div className="cart-summary__row">
                <span>Taxes &amp; fees</span>
                <span style={{ color: "var(--accent-orange)" }}>Included</span>
              </div>
              <div className="cart-summary__row cart-summary__row--total">
                <span>Total</span>
                <span className="cart-summary__total-price">₹{grandTotal}</span>
              </div>
            </div>

            {/* Checkout button */}
            <button
              className="btn-checkout shine"
              onClick={onCheckout}
              disabled={isPlacingOrder}
              aria-busy={isPlacingOrder}
            >
              {isPlacingOrder ? (
                <>
                  <span className="spinner spinner--sm" aria-hidden="true" />
                  Placing Order…
                </>
              ) : (
                <>Checkout · ₹{grandTotal} 🚀</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
