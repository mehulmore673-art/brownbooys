// models/ShopSettings.js
// BUG 18 FIX — shop was a plain in-memory let variable.
// Every Render cold start (happens every deploy + after 15 min idle on free tier)
// wiped the delivery pricing config the admin had set.
// This model persists settings to MongoDB so they survive restarts.
const mongoose = require("mongoose");

const shopSettingsSchema = new mongoose.Schema({
  _key:              { type: String,  default: "singleton" },
  shopOpen:          { type: Boolean, default: true  },
  deliveryOn:        { type: Boolean, default: true  },
  freeDeliveryAbove: { type: Number,  default: 400   },
  deliveryBaseKm:    { type: Number,  default: 5     },
  deliveryRatePerKm: { type: Number,  default: 5     },
  // FIX — shop's own coordinates, used by the customer app to compute
  // delivery distance via the Haversine formula. Defaults are a
  // placeholder (0,0) — admin should set the real shop location.
  shopLatitude:      { type: Number,  default: 0     },
  shopLongitude:     { type: Number,  default: 0     },
});

module.exports = mongoose.model("ShopSettings", shopSettingsSchema);
