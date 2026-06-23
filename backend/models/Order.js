// models/Order.js
// BUG 39 FIX — rewritten to match the schema server.js actually uses.
// Previous version had completely incompatible fields (userId as ObjectId ref,
// address required, no orderType, no userName, no delivery sub-object).
const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    items:        { type: Array,   default: [] },
    total:        { type: Number,  required: true },
    orderType:    { type: String,  enum: ["pickup", "dinein", "delivery"] },
    status:       { type: String,  default: "Pending" },
    userId:       { type: String,  required: true, index: true },
    userName:     { type: String,  default: "Guest" },
    userPhone:    { type: String,  default: "" },
    // FIX — sparse unique index prevents the same Razorpay paymentId
    // from being used to create two orders (replay protection).
    paymentId:    { type: String,  default: "" },
    adminDeleted: { type: Boolean, default: false },
    time:         String,
    date:         String,
    delivery: {
      address:    String,
      latitude:   Number,
      longitude:  Number,
      distanceKm: Number,
      charge:     Number,
    },
  },
  { timestamps: true }   // adds createdAt + updatedAt automatically
);

// Sparse unique: only enforced when paymentId is a non-empty string,
// so "" doesn't collide across many Pending/COD orders.
OrderSchema.index(
  { paymentId: 1 },
  { unique: true, partialFilterExpression: { paymentId: { $type: "string", $ne: "" } } }
);
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ adminDeleted: 1, createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);
