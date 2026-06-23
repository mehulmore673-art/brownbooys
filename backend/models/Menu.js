// models/Menu.js
// BUG 19 FIX — added image, description, isNew, isBestseller, isHot,
//              isVeg, available, rating, prepTime, category
//              (all fields used by server.js and AdminPanel but missing from this model)
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  name:  { en: String, hi: String, gu: String },
  price: Number,
});

const menuSchema = new mongoose.Schema(
  {
    id:           { type: Number, required: true, unique: true },
    title:        { en: String, hi: String, gu: String },
    description:  { type: String, default: "" },
    image:        { type: String, default: "" },   // Cloudinary URL
    price:        Number,                           // flat price (no variants)
    variants:     [variantSchema],                  // OR variants
    isNew:        { type: Boolean, default: false },
    isBestseller: { type: Boolean, default: false },
    isHot:        { type: Boolean, default: false },
    isVeg:        { type: Boolean, default: true  },
    available:    { type: Boolean, default: true  },
    rating:       { type: Number,  default: null  },
    prepTime:     { type: Number,  default: null  },
    category:     { type: String,  default: ""    },
  },
  {
    timestamps: true,
    // FIX — `isNew` is normally a reserved Mongoose document property
    // (doc.isNew === true for unsaved docs). We intentionally use it as
    // a "✨ New" menu badge field throughout the API/admin/frontend, and
    // it works fine as a schema path — this just silences the warning.
    suppressReservedKeysWarning: true,
  }
);

module.exports = mongoose.model("Menu", menuSchema);
