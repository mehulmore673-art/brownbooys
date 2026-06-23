// models/Offer.js
// BUG 22 FIX — this file was missing entirely.
// offers.js route did require('../models') expecting a barrel with { Offer }
// but models/index.js didn't exist. Now both this model and index.js exist.
const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    imageUrl:  { type: String, required: true },
    publicId:  { type: String, default: "" },   // Cloudinary public_id for deletion
    title:     { type: String, default: "" },
    subtitle:  { type: String, default: "" },
    active:    { type: Boolean, default: true },
    sortOrder: { type: Number,  default: 0    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", offerSchema);
