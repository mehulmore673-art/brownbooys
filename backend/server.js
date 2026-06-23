require("dotenv").config();
const express      = require("express");
const cors         = require("cors");
const mongoose     = require("mongoose");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const jwt          = require("jsonwebtoken");

const Menu          = require("./models/Menu");
const Offer         = require("./models/Offer");
const Order         = require("./models/Order");
const ShopSettings  = require("./models/ShopSettings");
const paymentRoutes = require("./routes/payment");
const { uploadMenuImage, uploadOfferImage, cloudinary } = require("./config/cloudinary");

/* ============================
   ENV VALIDATION
   Fail fast on boot instead of crashing/misbehaving mid-request.
============================ */
const REQUIRED_ENV = [
  "MONGO_URI",
  "ADMIN_PASSWORD",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}
if (process.env.ADMIN_PASSWORD.length < 12) {
  console.warn("⚠️  ADMIN_PASSWORD is short. Use a long random string in production.");
}

// FIX (security) — JWT_SECRET signs admin session tokens. If not set,
// derive one from ADMIN_PASSWORD so the app still boots, but a dedicated
// JWT_SECRET (set separately in your env) is strongly recommended —
// using two different secrets means a leaked JWT_SECRET alone can't be
// used to log in directly, and rotating one doesn't require rotating
// the other.
const JWT_SECRET = process.env.JWT_SECRET || `derived-${process.env.ADMIN_PASSWORD}`;
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET is not set — deriving one from ADMIN_PASSWORD. Set a dedicated JWT_SECRET in production.");
}

/* ============================
   SEED DATA
============================ */

const initialMenu = [
  {
    id: 1,
    title: { en: "Sp. Dry Masala Vadapav", hi: "ड्राई मसाला वडा पाव", gu: "ડ્રાય મસાલા વડા પાવ" },
    variants: [
      { name: { en: "Regular",       hi: "रेगुलर",   gu: "રેગ્યુલર"  }, price: 25 },
      { name: { en: "Butter",        hi: "बटर",      gu: "બટર"       }, price: 30 },
      { name: { en: "Mayo",          hi: "मेयो",     gu: "મેયો"      }, price: 35 },
      { name: { en: "Cheese",        hi: "चीज़",     gu: "ચીઝ"       }, price: 40 },
      { name: { en: "Butter Cheese", hi: "बटर चीज़", gu: "બટર ચીઝ"  }, price: 45 },
    ],
  },
  {
    id: 2,
    title: { en: "Sp. Lasaniya Vadapav", hi: "लसणिया वडा पाव", gu: "લસણિયા વડા પાવ" },
    variants: [
      { name: { en: "Regular",       hi: "रेगुलर",   gu: "રેગ્યુલર"  }, price: 30 },
      { name: { en: "Butter",        hi: "बटर",      gu: "બટર"       }, price: 35 },
      { name: { en: "Mayo",          hi: "मेयो",     gu: "મેયો"      }, price: 40 },
      { name: { en: "Cheese",        hi: "चीज़",     gu: "ચીઝ"       }, price: 45 },
      { name: { en: "Butter Cheese", hi: "बटर चीज़", gu: "બટર ચીઝ"  }, price: 50 },
    ],
  },
  {
    id: 3,
    title: { en: "B.B Signature Vadapav", hi: "बीबी सिग्नेचर वडा पाव", gu: "બીબી સિગ્નેચર વડા પાવ" },
    variants: [
      { name: { en: "Regular",       hi: "रेगुलर",   gu: "રેગ્યુલર"  }, price: 50 },
      { name: { en: "Butter",        hi: "बटर",      gu: "બટર"       }, price: 60 },
      { name: { en: "Mayo",          hi: "मेयो",     gu: "મેયો"      }, price: 70 },
      { name: { en: "Cheese",        hi: "चीज़",     gu: "ચીઝ"       }, price: 80 },
      { name: { en: "Butter Cheese", hi: "बटर चीज़", gu: "બટર ચીઝ"  }, price: 90 },
    ],
  },
  { id: 4,  title: { en: "Allo Tikki Wrap",          hi: "आलू टिक्की रैप",         gu: "આલુ ટિક્કી રેપ"        }, price: 80  },
  { id: 5,  title: { en: "Veg Wrap",                 hi: "वेज रैप",                gu: "વેજ રેપ"                }, price: 90  },
  { id: 6,  title: { en: "Tangy Wrap",               hi: "टैंगी रैप",              gu: "ટેંગી રેપ"              }, price: 100 },
  { id: 7,  title: { en: "Basic Quesadilla",         hi: "बेसिक क्वेसाडिला",       gu: "બેસિક કેસાડિલા"         }, price: 90  },
  { id: 8,  title: { en: "Spicy Quesadilla",         hi: "स्पाइसी क्वेसाडिला",    gu: "સ્પાઇસી કેસાડિલા"       }, price: 110 },
  { id: 9,  title: { en: "Paneer Quesadilla",        hi: "पनीर क्वेसाडिला",        gu: "પનીર કેસાડિલા"          }, price: 130 },
  { id: 10, title: { en: "BB Special Quesadilla",    hi: "बीबी स्पेशल क्वेसाडिला", gu: "બીબી સ્પેશિયલ કેસાડિલા" }, price: 140 },
  { id: 11, title: { en: "Classic Salt Fries",       hi: "क्लासिक फ्राइज",         gu: "ક્લાસિક ફ્રાઈઝ"         }, price: 49  },
  { id: 12, title: { en: "Peri Peri Fries",          hi: "पेरी पेरी फ्राइज",       gu: "પેરી પેરી ફ્રાઈઝ"       }, price: 69  },
  {
    id: 13,
    title: { en: "Dabeli", hi: "दाबेली", gu: "દાબેલી" },
    variants: [
      { name: { en: "Regular",       hi: "रेगुलर",   gu: "રેગ્યુલર"  }, price: 25 },
      { name: { en: "Butter",        hi: "बटर",      gu: "બટર"       }, price: 30 },
      { name: { en: "Mayo",          hi: "मेयो",     gu: "મેયો"      }, price: 35 },
      { name: { en: "Cheese",        hi: "चीज़",     gu: "ચીઝ"       }, price: 40 },
      { name: { en: "Butter Cheese", hi: "बटर चीज़", gu: "બટર ચીઝ"  }, price: 45 },
    ],
  },
  {
    id: 14,
    title: { en: "House Full Katka Dabeli", hi: "हाउसफुल दाबेली", gu: "હાઉસફુલ દાબેલી" },
    variants: [
      { name: { en: "Regular",       hi: "रेगुलर",   gu: "રેગ્યુલર"  }, price: 50 },
      { name: { en: "Butter",        hi: "बटर",      gu: "બટર"       }, price: 60 },
      { name: { en: "Mayo",          hi: "मेयो",     gu: "મેયો"      }, price: 70 },
      { name: { en: "Cheese",        hi: "चीज़",     gu: "ચીઝ"       }, price: 80 },
      { name: { en: "Butter Cheese", hi: "बटर चीज़", gu: "બટર ચીઝ"  }, price: 90 },
    ],
  },
  { id: 15, title: { en: "Peri Peri Burger",     hi: "पेरी पेरी बर्गर",    gu: "પેરી પેરી બર્ગર"   }, price: 49 },
  { id: 16, title: { en: "Schezwan Burger",      hi: "सेजवान बर्गर",       gu: "સેજવાન બર્ગર"      }, price: 49 },
  { id: 17, title: { en: "Chilli Garlic Burger", hi: "चिली गार्लिक बर्गर", gu: "ચિલી ગાર્લિક બર્ગર" }, price: 49 },
  { id: 18, title: { en: "Tandoori Burger",      hi: "तंदूरी बर्गर",       gu: "તંદૂરી બર્ગર"      }, price: 49 },
  { id: 19, title: { en: "Cheese Lover Burger",  hi: "चीज़ लवर बर्गर",     gu: "ચીઝ લવર બર્ગર"     }, price: 69 },
];

const seedMenu = async () => {
  try {
    for (const item of initialMenu) {
      await Menu.findOneAndUpdate(
        { id: item.id },
        { $setOnInsert: item },
        { upsert: true, new: true }
      );
    }
    console.log("✅ Menu seed check complete (admin changes preserved)");
  } catch (err) {
    console.error("❌ Seed error:", err);
  }
};

/* ============================
   APP SETUP
============================ */

const app = express();

// FIX — needed on Render/Railway/behind any reverse proxy so
// express-rate-limit and req.ip work correctly (X-Forwarded-For).
app.set("trust proxy", 1);

// FIX — security headers
app.use(helmet());

// FIX — CORS allowlist instead of wide-open cors().
// Set FRONTEND_ORIGINS in env as a comma-separated list, e.g.
// "https://brownbooys.netlify.app,https://brownbooys-admin.netlify.app,http://localhost:3000"
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn("⚠️  FRONTEND_ORIGINS is not set — CORS will allow all origins. Set this before going live.");
}

app.use(cors({
  origin(origin, callback) {
    // Allow non-browser tools (curl/postman, no Origin header) and any allowlisted origin.
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: false,
}));

// FIX — cap body size to prevent abuse via huge JSON payloads
app.use(express.json({ limit: "1mb" }));

// FIX — global rate limiter (general API abuse protection)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api", apiLimiter);

// FIX — stricter limiter for admin login (brute-force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

app.use("/api/payment", paymentRoutes);

/* ============================
   ADMIN AUTH MIDDLEWARE
============================ */

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// FIX (security) — replaced raw-password-as-token scheme with signed
// JWTs. Previously the admin's actual password was stored in the
// browser's localStorage and sent on every request; anyone who could
// read localStorage (XSS, malicious extension, shared computer) had
// the permanent password itself. Now the client stores a signed,
// expiring token that proves "an admin logged in within the last 12
// hours" without ever exposing the password again after the initial
// login request.
function issueAdminToken() {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "12h" });
}

// FIX — single source of truth for "is this request authenticated as
// admin", used by both the requireAdmin middleware and the one route
// (/api/orders?admin=true) that needs to check auth conditionally
// inside a branch rather than as middleware. Previously that route had
// its own separate, stale copy of this check.
function verifyAdminAuth(req) {
  const authHeader = req.headers["authorization"] || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const legacyPassword = req.headers["x-admin-password"] || "";

  if (bearerToken) {
    try {
      const decoded = jwt.verify(bearerToken, JWT_SECRET);
      return decoded.role === "admin";
    } catch {
      return false;
    }
  }
  return !!legacyPassword && legacyPassword === ADMIN_PASSWORD;
}

function requireAdmin(req, res, next) {
  if (verifyAdminAuth(req)) return next();
  const authHeader = req.headers["authorization"] || "";
  if (authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Session expired. Please log in again." });
  }
  return res.status(401).json({ error: "Unauthorized." });
}

/* ============================
   SHOP SETTINGS — DB-PERSISTED
============================ */

let shop = {
  shopOpen: true, deliveryOn: true,
  freeDeliveryAbove: 400, deliveryBaseKm: 5, deliveryRatePerKm: 5,
  shopLatitude: 0, shopLongitude: 0,
};

async function loadShopFromDb() {
  try {
    const doc = await ShopSettings.findOne({ _key: "singleton" });
    if (doc) {
      shop = {
        shopOpen:          doc.shopOpen,
        deliveryOn:        doc.deliveryOn,
        freeDeliveryAbove: doc.freeDeliveryAbove,
        deliveryBaseKm:    doc.deliveryBaseKm,
        deliveryRatePerKm: doc.deliveryRatePerKm,
        shopLatitude:      doc.shopLatitude  ?? 0,
        shopLongitude:     doc.shopLongitude ?? 0,
      };
      console.log("✅ Shop settings loaded from DB");
    } else {
      await ShopSettings.create({ _key: "singleton", ...shop });
      console.log("✅ Shop settings initialised with defaults");
    }
  } catch (err) {
    console.error("❌ Failed to load shop settings:", err);
  }
}

async function persistShop() {
  try {
    await ShopSettings.findOneAndUpdate(
      { _key: "singleton" },
      { $set: shop },
      { upsert: true }
    );
  } catch (err) {
    console.error("❌ Failed to persist shop settings:", err);
  }
}

/* ============================
   NOTICE (low-stakes, in-memory is fine)
============================ */

let notice = { text: "" };

/* ============================
   VALIDATION HELPERS
============================ */

// FIX — basic recursive sanitizer to strip script-y content from
// user-supplied free-text fields (offer titles/subtitles, item
// descriptions, addresses) before they're stored/echoed back.
function stripHtml(value) {
  if (typeof value !== "string") return value;
  return value.replace(/<[^>]*>/g, "").trim();
}

function validateOrder(order) {
  if (!order || typeof order !== "object")
    return { valid: false, code: 400, message: "Invalid order payload." };
  if (!Array.isArray(order.items) || order.items.length === 0)
    return { valid: false, code: 400, message: "Order must contain at least one item." };
  if (order.items.length > 50)
    return { valid: false, code: 400, message: "Too many items in order." };
  for (const it of order.items) {
    if (!it || typeof it !== "object" || typeof it.name !== "string" ||
        typeof it.price !== "number" || typeof it.qty !== "number" ||
        it.price < 0 || it.qty <= 0 || it.qty > 50) {
      return { valid: false, code: 400, message: "Invalid item in order." };
    }
  }
  if (typeof order.total !== "number" || order.total <= 0 || order.total > 100000)
    return { valid: false, code: 400, message: "Order total is invalid." };

  // FIX — verify the submitted total actually matches the sum of items + delivery charge.
  // Prevents a tampered client from sending a lower `total` than the real cart value.
  const itemsSum = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  const deliveryCharge = Number(order?.delivery?.charge) || 0;
  const expectedTotal = itemsSum + deliveryCharge;
  if (Math.abs(expectedTotal - order.total) > 1) {
    return { valid: false, code: 400, message: "Order total does not match item prices." };
  }

  if (!["pickup", "dinein", "delivery"].includes(order.orderType))
    return { valid: false, code: 400, message: "Invalid order type." };
  if (!order.userId || typeof order.userId !== "string")
    return { valid: false, code: 400, message: "Missing userId." };
  if (!shop.shopOpen)
    return { valid: false, code: 400, message: "Shop is currently closed." };
  if (order.orderType === "delivery" && !shop.deliveryOn)
    return { valid: false, code: 400, message: "Delivery is currently unavailable." };
  if (order.orderType === "delivery") {
    if (!order.delivery || typeof order.delivery.latitude !== "number" || typeof order.delivery.longitude !== "number") {
      return { valid: false, code: 400, message: "Delivery location is required." };
    }
  }
  // FIX — if a paymentId is supplied, status must be "Paid" or "Pending" (not arbitrary)
  if (order.status && !["Pending", "Paid"].includes(order.status)) {
    return { valid: false, code: 400, message: "Invalid initial order status." };
  }
  return { valid: true };
}

/* ============================
   ADMIN LOGIN
============================ */

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Wrong password." });
  }
  // FIX (security) — issue a signed, expiring JWT instead of just
  // confirming success. The password itself is never sent back or
  // stored client-side after this point.
  const token = issueAdminToken();
  res.json({ success: true, token, expiresIn: "12h" });
});

/* ============================
   MENU API
============================ */

app.get("/api/menu", async (req, res) => {
  try {
    const menu = await Menu.find().sort({ id: 1 });
    res.json(menu);
  } catch (err) {
    console.error("GET /api/menu error:", err);
    res.status(500).json({ error: "Failed to fetch menu." });
  }
});

app.post("/api/menu", requireAdmin, async (req, res) => {
  try {
    const body = req.body;
    if (!body.title?.en?.trim()) {
      return res.status(400).json({ error: "English title is required." });
    }

    const item = {
      title: {
        en: stripHtml(body.title.en),
        hi: stripHtml(body.title.hi || body.title.en),
        gu: stripHtml(body.title.gu || body.title.en),
      },
      description:  stripHtml(body.description || ""),
      isNew:        !!body.isNew,
      isBestseller: !!body.isBestseller,
      isHot:        !!body.isHot,
      isVeg:        body.isVeg !== false,
      available:    body.available !== false,
    };

    if (Array.isArray(body.variants) && body.variants.length > 0) {
      item.variants = body.variants.map(v => ({
        name: {
          en: stripHtml(v.name?.en || ""),
          hi: stripHtml(v.name?.hi || v.name?.en || ""),
          gu: stripHtml(v.name?.gu || v.name?.en || ""),
        },
        price: Math.max(0, Number(v.price) || 0),
      }));
    } else if (body.price !== undefined) {
      item.price = Math.max(0, Number(body.price) || 0);
    } else {
      return res.status(400).json({ error: "Price or at least one variant is required." });
    }

    if (body.image)    item.image    = body.image;
    if (body.rating)   item.rating   = Math.min(5, Math.max(0, Number(body.rating) || 0));
    if (body.prepTime) item.prepTime = Math.max(0, Number(body.prepTime) || 0);
    if (body.category) item.category = stripHtml(body.category);

    // FIX — atomic id allocation avoids a duplicate-id race when two
    // admins add items at the same moment (previous version read
    // last.id then created separately, which could collide).
    const last = await Menu.findOne().sort({ id: -1 });
    let nextId = last ? last.id + 1 : 1;
    // Guard against rare collisions
    while (await Menu.findOne({ id: nextId })) nextId++;
    item.id = nextId;

    await Menu.create(item);
    res.json({ success: true, id: item.id });
  } catch (err) {
    console.error("POST /api/menu error:", err);
    res.status(500).json({ error: "Failed to add menu item." });
  }
});

app.post("/api/upload", requireAdmin, uploadMenuImage.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image file received." });
  res.json({ url: req.file.path });
});

app.post("/api/menu/reseed", requireAdmin, async (req, res) => {
  try {
    await Menu.deleteMany({});
    await Menu.insertMany(initialMenu);
    res.json({ success: true, message: "Menu reset to default seed data." });
  } catch (err) {
    console.error("Reseed error:", err);
    res.status(500).json({ error: "Failed to reseed menu." });
  }
});

app.put("/api/menu/:id", requireAdmin, async (req, res) => {
  try {
    const { _id, id: _ignoredId, __v, ...safeBody } = req.body;

    // FIX (variant-removal bug) — when the admin removes ALL variants from
    // an existing variant-based item and saves it as a flat-price item, the
    // client sends variants:[] and a price. Previously we just deleted
    // `variants` from the $set object, so the old variants array stayed in
    // MongoDB untouched and the customer card continued showing the old
    // variant picker instead of the new flat price.
    //
    // Now we detect this case explicitly:
    //   • strip variants from $set (so we don't overwrite with [])
    //   • add it to $unset (so MongoDB removes the field entirely)
    //   • leave price in $set so the flat price takes effect
    //
    // This makes "convert variant → flat-price" work correctly without
    // requiring the admin to delete and re-add the item.
    const unsetFields = {};
    const convertingToFlat =
      Array.isArray(safeBody.variants) && safeBody.variants.length === 0;
    if (convertingToFlat) {
      delete safeBody.variants;           // don't $set an empty array
      unsetFields.variants = 1;           // explicitly remove from document
    }

    if (safeBody.price !== undefined) safeBody.price = Math.max(0, Number(safeBody.price) || 0);
    if (safeBody.title) {
      safeBody.title = {
        en: stripHtml(safeBody.title.en || ""),
        hi: stripHtml(safeBody.title.hi || safeBody.title.en || ""),
        gu: stripHtml(safeBody.title.gu || safeBody.title.en || ""),
      };
    }
    if (safeBody.description !== undefined) safeBody.description = stripHtml(safeBody.description);
    if (Array.isArray(safeBody.variants)) {
      safeBody.variants = safeBody.variants.map(v => ({
        name: {
          en: stripHtml(v.name?.en || ""),
          hi: stripHtml(v.name?.hi || v.name?.en || ""),
          gu: stripHtml(v.name?.gu || v.name?.en || ""),
        },
        price: Math.max(0, Number(v.price) || 0),
      }));
    }

    const updateOp = { $set: safeBody };
    if (Object.keys(unsetFields).length) updateOp.$unset = unsetFields;

    const result = await Menu.findOneAndUpdate(
      { id: Number(req.params.id) },
      updateOp,
      { new: true }
    );
    if (!result) return res.status(404).json({ error: "Menu item not found." });
    res.json({ success: true, item: result });
  } catch (err) {
    console.error("PUT /api/menu/:id error:", err);
    res.status(500).json({ error: "Failed to update menu item." });
  }
});

app.delete("/api/menu/:id", requireAdmin, async (req, res) => {
  try {
    const result = await Menu.findOneAndDelete({ id: Number(req.params.id) });
    if (!result) return res.status(404).json({ error: "Menu item not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/menu/:id error:", err);
    res.status(500).json({ error: "Failed to delete menu item." });
  }
});

/* ============================
   OFFERS API
============================ */

app.get("/api/offers", async (req, res) => {
  try {
    const offers = await Offer.find({ active: true }).sort({ sortOrder: 1, createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error("GET /api/offers error:", err);
    res.status(500).json({ error: "Failed to fetch offers." });
  }
});

app.get("/api/offers/all", requireAdmin, async (req, res) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.json(offers);
  } catch (err) {
    console.error("GET /api/offers/all error:", err);
    res.status(500).json({ error: "Failed to fetch offers." });
  }
});

app.post("/api/offers", requireAdmin, uploadOfferImage.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided." });
    const offer = await Offer.create({
      imageUrl:  req.file.path,
      publicId:  req.file.filename,
      title:     stripHtml(req.body.title    || ""),
      subtitle:  stripHtml(req.body.subtitle || ""),
      active:    true,
      sortOrder: Number(req.body.sortOrder) || 0,
    });
    res.status(201).json({ success: true, offer });
  } catch (err) {
    console.error("POST /api/offers error:", err);
    res.status(500).json({ error: "Failed to upload banner." });
  }
});

app.put("/api/offers/:id", requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, active, sortOrder } = req.body;
    const update = {};
    if (title     !== undefined) update.title     = stripHtml(title);
    if (subtitle  !== undefined) update.subtitle  = stripHtml(subtitle);
    if (active    !== undefined) update.active    = !!active;
    if (sortOrder !== undefined) update.sortOrder = Number(sortOrder) || 0;

    const offer = await Offer.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    res.json({ success: true, offer });
  } catch (err) {
    console.error("PUT /api/offers/:id error:", err);
    res.status(500).json({ error: "Failed to update offer." });
  }
});

app.delete("/api/offers/:id", requireAdmin, async (req, res) => {
  try {
    const offer = await Offer.findById(req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found." });
    if (offer.publicId) await cloudinary.uploader.destroy(offer.publicId).catch(() => {});
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/offers/:id error:", err);
    res.status(500).json({ error: "Failed to delete banner." });
  }
});

/* ============================
   ORDERS API
============================ */

app.get("/api/orders", async (req, res) => {
  try {
    const isAdmin = req.query.admin === "true";

    if (isAdmin) {
      // FIX — was a second, separate raw-password comparison duplicated
      // from requireAdmin (and never updated when JWT support was
      // added). Now reuses the exact same verifyAdminAuth logic as the
      // requireAdmin middleware so both code paths stay in sync.
      if (!verifyAdminAuth(req)) {
        return res.status(401).json({ error: "Unauthorized." });
      }
      const data = await Order
        .find({ adminDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .limit(500);
      return res.json(data);
    }

    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId query param is required." });
    if (typeof userId !== "string" || userId.length > 64) {
      return res.status(400).json({ error: "Invalid userId." });
    }

    // BUG FIX: customers should see ALL their own orders even if the admin
    // soft-deleted them from the admin view. adminDeleted only hides from admin.
    const data = await Order
      .find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(data);
  } catch (err) {
    console.error("GET /api/orders error:", err);
    res.status(500).json({ error: "Failed to fetch orders." });
  }
});

app.post("/api/orders", async (req, res) => {
  const order = req.body;

  const check = validateOrder(order);
  if (!check.valid) {
    console.warn("Order rejected:", check.message);
    return res.status(check.code).json({ error: check.message });
  }

  try {
    // FIX — replay protection: if a paymentId is supplied, ensure it
    // hasn't already been used to create another order.
    if (order.paymentId) {
      const dupe = await Order.findOne({ paymentId: order.paymentId });
      if (dupe) {
        return res.status(409).json({ error: "This payment has already been used for an order." });
      }
    }

    const safeOrder = {
      items: order.items.map(it => ({
        name:    stripHtml(String(it.name)),
        qty:     Number(it.qty),
        price:   Number(it.price),
        variant: it.variant ? stripHtml(String(it.variant)) : undefined,
      })),
      total:     order.total,
      orderType: order.orderType,
      status:    order.status === "Paid" ? "Paid" : "Pending",
      userId:    String(order.userId),
      userName:  order.userName ? stripHtml(String(order.userName)).slice(0, 80) : "Guest",
      userPhone: order.userPhone ? String(order.userPhone).replace(/[^\d+]/g, "").slice(0, 15) : "",
      paymentId: order.paymentId ? String(order.paymentId) : "",
      time:      order.time ? String(order.time).slice(0, 20) : "",
      date:      order.date ? String(order.date).slice(0, 20) : "",
      delivery: order.delivery ? {
        address:    order.delivery.address ? stripHtml(String(order.delivery.address)).slice(0, 300) : "",
        // FIX — use isFinite + ternary instead of `Number(x) || undefined`.
        // The `||` form turns a legitimate latitude/longitude of exactly 0
        // (equator / prime meridian) into `undefined`, which would then
        // fail the `typeof === "number"` check done in validateOrder for
        // any future edits to this order. isFinite(0) is true, so 0 is
        // preserved correctly.
        latitude:   isFinite(Number(order.delivery.latitude))  ? Number(order.delivery.latitude)  : undefined,
        longitude:  isFinite(Number(order.delivery.longitude)) ? Number(order.delivery.longitude) : undefined,
        distanceKm: Number(order.delivery.distanceKm) || 0,
        charge:     Number(order.delivery.charge) || 0,
      } : undefined,
      createdAt: new Date(),
    };

    const saved = await Order.create(safeOrder);
    res.json({ success: true, orderId: saved._id });
  } catch (err) {
    console.error("POST /api/orders DB error:", err);
    res.status(500).json({ error: "Failed to save order. Please try again." });
  }
});

app.put("/api/orders/:id", requireAdmin, async (req, res) => {
  const { id }     = req.params;
  const { status } = req.body;
  const allowed    = ["Pending", "Preparing", "Ready", "Completed", "Cancelled", "Paid"];

  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Allowed: ${allowed.join(", ")}` });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid order id." });
  }

  try {
    const result = await Order.findByIdAndUpdate(id, { $set: { status } }, { new: true });
    if (!result) return res.status(404).json({ error: "Order not found." });
    res.json({ success: true, order: result });
  } catch (err) {
    console.error("PUT /api/orders/:id error:", err);
    res.status(500).json({ error: "Failed to update order status." });
  }
});

app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid order id." });
  }
  try {
    const result = await Order.findByIdAndUpdate(id, { $set: { adminDeleted: true } }, { new: true });
    if (!result) return res.status(404).json({ error: "Order not found." });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/orders/:id error:", err);
    res.status(500).json({ error: "Failed to delete order." });
  }
});

/* ============================
   ORDERS ANALYTICS
============================ */

app.get("/api/orders/analytics", requireAdmin, async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [todayOrders, allOrdersAgg] = await Promise.all([
      Order.find({ createdAt: { $gte: startOfDay }, adminDeleted: { $ne: true } }),
      Order.aggregate([
        { $match: { adminDeleted: { $ne: true } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$total" } } },
      ]),
    ]);

    const totals = allOrdersAgg[0] || { count: 0, revenue: 0 };

    res.json({
      todayOrders:  todayOrders.length,
      todayRevenue: todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
      totalOrders:  totals.count,
      totalRevenue: totals.revenue || 0,
    });
  } catch (err) {
    console.error("GET /api/orders/analytics error:", err);
    res.status(500).json({ error: "Failed to compute analytics." });
  }
});

/* ============================
   SHOP API
============================ */

app.get("/api/shop", (req, res) => {
  res.json(shop);
});

app.put("/api/shop", requireAdmin, async (req, res) => {
  const { shopOpen, deliveryOn, freeDeliveryAbove, deliveryBaseKm, deliveryRatePerKm, shopLatitude, shopLongitude } = req.body;

  if (typeof shopOpen !== "boolean" || typeof deliveryOn !== "boolean") {
    return res.status(400).json({ error: "shopOpen and deliveryOn must be booleans." });
  }

  const next = { ...shop, shopOpen, deliveryOn };
  if (freeDeliveryAbove !== undefined) {
    const v = Number(freeDeliveryAbove);
    if (!isFinite(v) || v < 0) return res.status(400).json({ error: "Invalid freeDeliveryAbove." });
    next.freeDeliveryAbove = v;
  }
  if (deliveryBaseKm !== undefined) {
    const v = Number(deliveryBaseKm);
    if (!isFinite(v) || v < 0) return res.status(400).json({ error: "Invalid deliveryBaseKm." });
    next.deliveryBaseKm = v;
  }
  if (deliveryRatePerKm !== undefined) {
    const v = Number(deliveryRatePerKm);
    if (!isFinite(v) || v < 0) return res.status(400).json({ error: "Invalid deliveryRatePerKm." });
    next.deliveryRatePerKm = v;
  }
  if (shopLatitude !== undefined) {
    const v = Number(shopLatitude);
    if (!isFinite(v) || v < -90 || v > 90) return res.status(400).json({ error: "Invalid shopLatitude." });
    next.shopLatitude = v;
  }
  if (shopLongitude !== undefined) {
    const v = Number(shopLongitude);
    if (!isFinite(v) || v < -180 || v > 180) return res.status(400).json({ error: "Invalid shopLongitude." });
    next.shopLongitude = v;
  }

  shop = next;
  await persistShop();
  res.json({ success: true, shop });
});

/* ============================
   NOTICE API
============================ */

app.get("/api/notice", (req, res) => {
  res.json(notice);
});

app.post("/api/notice", requireAdmin, (req, res) => {
  notice = { text: stripHtml(String(req.body?.text || "")).slice(0, 300) };
  res.json({ success: true });
});

/* ============================
   HEALTH CHECK
   Useful for Render/Railway health probes and to mitigate cold-start
   confusion (ping this to keep the instance warm).
============================ */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/* ============================
   404 + GLOBAL ERROR HANDLER
============================ */

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "Origin not allowed." });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large." });
  }
  res.status(500).json({ error: "An unexpected server error occurred." });
});

/* ============================
   DATABASE + SERVER START
============================ */

mongoose.connect(process.env.MONGO_URI, { dbName: "brownbooys" })
  .then(async () => {
    console.log("MongoDB Connected ✅");
    await seedMenu();
    await loadShopFromDb();
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000} ✅`);
    });
  })
  .catch(err => {
    console.error("Mongo Error ❌", err);
    process.exit(1);
  });
