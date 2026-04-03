const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const {
  products,
  recommendProducts,
  searchProducts,
  getSizeAdvice,
  availabilityNote
} = require("../lib/product-utils");
const {
  createSalesAssistantReply,
  analyzeImageAndMatch,
  runAdminTask
} = require("../lib/openai-client");

function createApiRouter(memoryStore) {
  const router = express.Router();
  const upload = multer({ dest: path.join(process.cwd(), "tmp") });

  router.get("/health", (req, res) => {
    res.json({ ok: true, product_count: products.length });
  });

  router.post("/chat", async (req, res) => {
    const sessionId = String(req.body.sessionId || "web-widget");
    const message = String(req.body.message || "").trim();
    const profile = req.body.profile || {};
    const rawContext = typeof req.body.context === "object" && req.body.context !== null ? req.body.context : {};
    const context = {
      currentUrl: String(rawContext.currentUrl || ""),
      pageType: String(rawContext.pageType || ""),
      productData: rawContext.productData || null,
      cartItems: Array.isArray(rawContext.cartItems) ? rawContext.cartItems : [],
      user: rawContext.user || { loggedIn: false }
    };
    const history = Array.isArray(req.body.history) ? req.body.history.slice(-3) : memoryStore.get(sessionId);

    if (!message) {
      return res.status(400).json({ error: "Mesaj gerekli." });
    }

    memoryStore.push(sessionId, { role: "user", content: message });
    const reply = await createSalesAssistantReply({ message, history, profile, context });
    memoryStore.push(sessionId, { role: "assistant", content: reply });

    return res.json({
      reply,
      suggested_products: recommendProducts({
        style: profile.style || message || context.productData?.style || "",
        color: profile.color || context.productData?.color || message,
        usage: profile.usage || message
      }).map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        link: product.link,
        image: product.image,
        availability: availabilityNote(product, profile.size)
      }))
    });
  });

  router.post("/recommend", (req, res) => {
    const { style, color, usage } = req.body || {};
    const result = recommendProducts({ style, color, usage });
    res.json({
      count: result.length,
      products: result
    });
  });

  router.post("/size-advice", (req, res) => {
    const { footSize, footWidth, previousBrand, productName } = req.body || {};
    res.json(getSizeAdvice({ footSize, footWidth, previousBrand, productName }));
  });

  router.get("/search", (req, res) => {
    const q = String(req.query.q || "").trim();
    if (!q) {
      return res.json({ count: 0, products: [] });
    }
    const result = searchProducts(q);
    return res.json({ count: result.length, products: result });
  });

  router.post("/image-search", upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Gorsel gerekli." });
    }

    const output = await analyzeImageAndMatch(req.file.path);
    fs.unlink(req.file.path, () => {});

    return res.json(output);
  });

  router.post("/admin", async (req, res) => {
    const action = String(req.body.action || "").trim();
    const input = req.body.input || "";
    const output = await runAdminTask({ action, input });
    res.json({ action, output });
  });

  return router;
}

module.exports = { createApiRouter };
