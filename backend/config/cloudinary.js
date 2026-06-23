"use strict";
const cloudinary = require("cloudinary").v2;
const CloudinaryStorage = require("multer-storage-cloudinary");
const multer = require("multer");

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

const FILE_LIMIT = 8 * 1024 * 1024;

const uploadMenuImage  = multer({ storage: menuStorage,  limits: { fileSize: FILE_LIMIT } });
const uploadOfferImage = multer({ storage: offerStorage, limits: { fileSize: FILE_LIMIT } });

module.exports = { cloudinary, uploadMenuImage, uploadOfferImage };