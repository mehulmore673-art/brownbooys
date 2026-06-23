const Razorpay = require("razorpay");
const crypto   = require("crypto");

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ============================
   CREATE RAZORPAY ORDER
   POST /api/payment/create-order
============================ */
const createOrder = async (req, res) => {
  const { amount } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount." });
  }
  // Sanity cap — adjust to your real max order value
  if (amount > 100000) {
    return res.status(400).json({ error: "Amount exceeds maximum allowed order value." });
  }

  try {
    const order = await razorpay.orders.create({
      amount:   Math.round(amount * 100), // Razorpay takes paise (₹1 = 100 paise)
      currency: "INR",
      receipt:  "receipt_" + Date.now(),
    });

    res.json({
      success:  true,
      orderId:  order.id,
      amount:   order.amount,
      currency: order.currency,
      keyId:    process.env.RAZORPAY_KEY_ID, // safe to send to frontend
    });
  } catch (err) {
    // FIX — Razorpay SDK errors come back as { statusCode, error: { code, description, ... } }
    // rather than a plain Error, so the previous `console.error("...", err)` printed an
    // unhelpful object reference in some Node/log-viewer setups. Logging the description
    // explicitly makes the real cause (e.g. "Authentication failed" from bad/swapped
    // RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on Render) visible in the Render logs, instead
    // of every failure looking identical from the client's "Failed to create payment order."
    const reason = err?.error?.description || err?.message || "Unknown error";
    console.error("Razorpay create order error:", reason, err?.error || err);
    res.status(500).json({ error: "Failed to create payment order." });
  }
};

/* ============================
   VERIFY PAYMENT SIGNATURE
   POST /api/payment/verify
   FIX — also fetches the payment from Razorpay to confirm it is
   "captured"/"authorized" and matches the order, guarding against
   replay of an old/failed payment's signature. Uses constant-time
   comparison for the signature check.
============================ */
const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment fields." });
  }

  try {
    const body     = razorpay_order_id + "|" + razorpay_payment_id;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    let validSignature = false;
    try {
      const sigBuf = Buffer.from(razorpay_signature, "hex");
      const expBuf = Buffer.from(expected, "hex");
      validSignature = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      validSignature = false;
    }

    if (!validSignature) {
      return res.status(400).json({ error: "Payment verification failed. Invalid signature." });
    }

    // Confirm payment status with Razorpay directly (defense in depth)
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (!payment || payment.order_id !== razorpay_order_id) {
      return res.status(400).json({ error: "Payment/order mismatch." });
    }
    if (!["captured", "authorized"].includes(payment.status)) {
      return res.status(400).json({ error: `Payment not completed (status: ${payment.status}).` });
    }

    res.json({
      success:   true,
      paymentId: razorpay_payment_id,
      amount:    payment.amount, // paise — caller can cross-check against order total
    });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    res.status(500).json({ error: "Server error during verification." });
  }
};

module.exports = { createOrder, verifyPayment };
