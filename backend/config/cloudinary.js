"use strict";
const cloudinary       = require("cloudinary").v2;
// FIX (CRITICAL, re-verified) — multer-storage-cloudinary (all
// published versions, including 2.x) exports CloudinaryStorage as a
// NAMED export, not as module.exports directly. The previous line in
// this file (`const CloudinaryStorage = require("multer-storage-cloudinary")`)
// assigned the whole module object to this name, so `new CloudinaryStorage(...)`
// below threw "CloudinaryStorage is not a constructor" and crashed the
// server on every single boot — before Express even started listening.
// Confirmed against the package's npm page, its GitHub README, and
// multiple independent tutorials, all of which consistently use:
//   const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer            = require("multer");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const menuStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "brownbooys/menu",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 800, height: 600, crop: "fill", quality: "auto:good" }],
  },
});

const offerStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "brownbooys/offers",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 1200, height: 420, crop: "fill", quality: "auto:good" }],
  },
});

const FILE_LIMIT = 8 * 1024 * 1024; // 8 MB

const uploadMenuImage  = multer({ storage: menuStorage,  limits: { fileSize: FILE_LIMIT } });
const uploadOfferImage = multer({ storage: offerStorage, limits: { fileSize: FILE_LIMIT } });

module.exports = { cloudinary, uploadMenuImage, uploadOfferImage };
