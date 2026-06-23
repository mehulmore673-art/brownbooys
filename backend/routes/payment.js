const express = require("express");
const router  = express.Router();
const { createOrder, verifyPayment } = require("../controllers/paymentController");

// POST /api/payment/create-order  — creates a Razorpay order, returns order_id
router.post("/create-order", createOrder);

// POST /api/payment/verify        — verifies payment signature after checkout
router.post("/verify", verifyPayment);

module.exports = router;