const express = require("express");
const { createSalesAssistantReply } = require("../lib/openai-client");
const { findProductByName, availabilityNote } = require("../lib/product-utils");
const { sendWhatsAppMessage } = require("../lib/whatsapp-client");

function createWhatsAppRouter(memoryStore) {
  const router = express.Router();

  router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  });

  router.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const entry = req.body.entry && req.body.entry[0];
    const change = entry && entry.changes && entry.changes[0];
    const value = change && change.value;
    const message = value && value.messages && value.messages[0];

    if (!message || message.type !== "text") {
      return;
    }

    const from = message.from;
    const text = message.text && message.text.body ? message.text.body : "";
    const history = memoryStore.get(from);
    memoryStore.push(from, { role: "user", content: text });

    let reply;
    if (/numara|stok|var mi/i.test(text)) {
      const matchedProduct = findProductByName(text) || findProductByName("Mila");
      reply = matchedProduct
        ? `${matchedProduct.name} icin ${availabilityNote(matchedProduct)} Isterseniz linkini de paylasayim.`
        : "Hangi model icin baktiginizi yazarsaniz stok durumunu hemen kontrol edebilirim.";
    } else {
      reply = await createSalesAssistantReply({ message: text, history });
    }

    memoryStore.push(from, { role: "assistant", content: reply });
    await sendWhatsAppMessage({ to: from, text: reply });
  });

  return router;
}

module.exports = { createWhatsAppRouter };
