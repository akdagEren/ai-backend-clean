const fs = require("fs");
const OpenAI = require("openai");
const {
  products,
  recommendProducts,
  availabilityNote,
  findByVisionDescription
} = require("./product-utils");

const apiKey = process.env.OPENAI_API_KEY || "";
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = apiKey ? new OpenAI({ apiKey }) : null;

async function createResponse({ instructions, input, temperature = 0.6 }) {
  if (!client) {
    return null;
  }

  const response = await client.responses.create({
    model,
    temperature,
    instructions,
    input
  });

  return response.output_text ? response.output_text.trim() : "";
}

function fallbackSalesReply({ message, history = [], context = {} }) {
  const latest = String(message || "");
  const combined = [latest].concat(history.map((item) => item.content || "")).join(" ");
  const recommendations = recommendProducts({
    style: combined,
    color: combined,
    usage: combined
  });
  const top = recommendations[0];

  if (/numara|stok|var mi/i.test(combined) && top) {
    return `${top.name} icin ${availabilityNote(top)} Farkli tarz isterseniz sik, gunluk veya spor diye yazabilirsiniz.`;
  }

  if (!top) {
    return "Tarz, kullanim amaci ve numaranizi yazarsaniz size uygun urunleri hemen onerebilirim.";
  }

  var reply = `Size ilk önerim ${top.name}. Fiyatı ${top.price} TL ve ${top.color} tonunda. Tarzınızı, kullanım amacınızı ve numaranızı yazarsanız seçimi netleştireyim.`;
  if (context.productData && context.productData.link && !reply.includes(context.productData.link)) {
    reply = reply + ` Ürün sayfasına gitmek için: ${context.productData.link}`;
  }
  return reply;
}

const WHATSAPP_LINK = "https://wa.me/905464038122";

function formatContextSummary(context) {
  if (!context || typeof context !== "object") {
    return "";
  }
  const parts = [];
  if (context.pageType) {
    parts.push(`Sayfa tipi: ${context.pageType}`);
  }
  if (context.productData) {
    const prod = context.productData;
    parts.push(`İncelenen ürün: ${prod.name || prod.title || "bilinmiyor"} (${prod.link || "link yok"})`);
  }
  if (Array.isArray(context.cartItems) && context.cartItems.length) {
    const list = context.cartItems
      .map((item) => `${item.title || "Ürün"}${item.size ? ` ${item.size}` : ""} x${item.quantity}`)
      .join(", ");
    parts.push(`Sepetinizde: ${list}`);
  }
  if (context.user) {
    parts.push("Kullanıcı girişli: " + (context.user.loggedIn ? "Evet" : "Hayır"));
  }
  return parts.filter(Boolean).join(" | ");
}

function shouldTriggerWhatsApp(message, reply) {
  if (!message) return false;
  var normalized = message.toLocaleLowerCase("tr-TR");
  if (/teknik|sorun|problem|hata|bulamıyorum|bulamadım|yardım|destek|çözüm|cozum|kararsız|kararsiz|tereddüt|tereddut/.test(normalized)) {
    if (typeof reply === "string" && reply.includes("wa.me")) {
      return false;
    }
    return true;
  }
  return false;
}

function buildCartReply(cartItems) {
  if (!Array.isArray(cartItems) || !cartItems.length) {
    return null;
  }
  const lines = cartItems.map((item) => {
    const modifiers = [];
    if (item.size) modifiers.push(item.size + " numara");
    if (item.quantity) modifiers.push(item.quantity + " adet");
    return `${item.title || "Ürün"}${modifiers.length ? " (" + modifiers.join(", ") + ")" : ""}`;
  });
  return `Sepetinizde ${lines.join(" ve ")} mevcut. Her bir modeli incelemek için sepet sayfasına gidebilir ya da istediğiniz numarayı netleştirip hemen sipariş verebilirim.`;
}

function isGreeting(message) {
  if (!message) return false;
  return /^(merhaba|selam|iyi günler|iyi gunler|selamlar)/i.test(message.trim());
}

function shouldCalmTone(message) {
  if (!message) return false;
  return /sinirli|kizgin|kızgın|öfke|ofke|rahatsiz|kendinden|kararsiz|kararsız|tereddut|tereddüt/.test(message.toLocaleLowerCase("tr-TR"));
}

async function createSalesAssistantReply({ message, history = [], profile = {}, context = {} }) {
  const catalogSummary = products
    .map((product) => `${product.name} | ${product.price} TL | ${product.color} | ${product.style} | ${product.usage.join(", ")} | no:${product.availableSizes.join(", ")}`)
    .join("\n");

  if (isGreeting(message)) {
    return "Pamuk's Shoes'a hoş geldiniz. Size ürün, sipariş, sepet veya site kullanımı konusunda yardımcı olabilirim.";
  }

  const cartReply = buildCartReply(context.cartItems);
  if (/sepetteki|sepetimdeki|sepetteki/i.test(message || "") && cartReply) {
    return cartReply;
  }

  const instructions = [
    "Sen Türkçe konuşan, satış odaklı ama itici olmayan bir ayakkabı danışmanısın.",
    "Yanıtlarda mümkün olduğunca kısa, net ve yönlendirici bir dil kullan.",
    "Tarz, kullanım amacı, renk ve numaraya dayalı öneriler ver.",
    "Sipariş, sepet veya profil gibi sayfalarda kullanıcıya ilgili bağlantıları sun.",
    "Kullanıcı bir şey bulamıyorsa önce adım adım yönlendir, sonra alternatif ürün sun ve sonunda WhatsApp linkini ekle.",
    "Kullanıcı sinirli veya kararsızsa sakin ve destekleyici bir ton tercih et.",
    "Ürün önerirken katalogda (veya ürün verisinde) bulunan gerçek linkleri, stok bilgilerini kullan; uydurma stok bilgisi verme.",
    "Kullanıcı 'nasılsın', 'selam' gibi sosyal ifadeler kullanırsa Pamuk's Shoes'u hatırlatarak site odağını koru ve yeni ürünleri sor."
  ].join(" ");

  const contextualInfo = formatContextSummary(context);
  const promptParts = [
    `Kullanıcı profili: ${JSON.stringify(profile)}`,
    `Sayfa bağlamı: ${contextualInfo || "bilgi yok"}`,
    `Ürün kataloğu:\n${catalogSummary}`,
    `Kullanıcı mesajı: ${message}`
  ].join("\n\n");

  const prompt = [
    promptParts,
    `Son mesajlar: ${JSON.stringify(history)}`,
  ].join("\n\n");

  try {
    const text = await createResponse({
      instructions,
      input: prompt
    });
    var reply = text || fallbackSalesReply({ message, history, context });
    if (shouldTriggerWhatsApp(message, reply)) {
      reply = reply + ` Dilerseniz WhatsApp üzerinden hızlı destek alabilirsiniz: ${WHATSAPP_LINK}`;
    }
    var pageLinks = { profil: "/profil.php", siparisler: "/siparislerim.php", sepet: "/shopping-cart.php" };
    var pageLink = pageLinks[(context.pageType || "").toLowerCase()];
    if (pageLink && !reply.includes(pageLink)) {
      reply = reply + ` Sadece bir tıkla buradan devam edebilirsiniz: ${pageLink}`;
    }
    if (context.productData && context.productData.link && !reply.includes(context.productData.link)) {
      reply = reply + ` Ürün sayfasına gitmek için: ${context.productData.link}`;
    }
    if (shouldCalmTone(message)) {
      reply = reply + " Sakin kalmanıza yardımcı olmak için buradayım.";
    }
    return reply;
  } catch (error) {
    var reply = fallbackSalesReply({ message, history, context });
    if (shouldTriggerWhatsApp(message, reply)) {
      reply = reply + ` Dilerseniz WhatsApp üzerinden hızlı destek alabilirsiniz: ${WHATSAPP_LINK}`;
    }
    return reply;
  }
}

async function analyzeImageAndMatch(filePath) {
  if (!client) {
    return {
      visionSummary: "Gorsel analiz yedek modda calisti. Metin tabanli benzerlik kullanildi.",
      products: findByVisionDescription("siyah gunluk ayakkabi")
    };
  }

  try {
    const base64Image = fs.readFileSync(filePath, { encoding: "base64" });
    const text = await createResponse({
      instructions: "Yuklenen ayakkabi gorselini Turkce, kisa urun ozeti halinde tarif et. Renk, tarz, kullanim ve mevsim ozelliklerini belirt.",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Bu ayakkabiyi tanimla." },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${base64Image}`
            }
          ]
        }
      ]
    });

    return {
      visionSummary: text || "",
      products: findByVisionDescription(text || "")
    };
  } catch (error) {
    return {
      visionSummary: "Gorsel analiz hataya dustu, metin tabanli eslestirme kullanildi.",
      products: findByVisionDescription("siyah sik ayakkabi")
    };
  }
}

async function runAdminTask({ action, input }) {
  const actions = {
    description: "Verilen urun bilgisine gore e-ticaret icin ikna edici ama kisa bir urun aciklamasi yaz.",
    tags: "Verilen urun bilgisine gore virgulle ayrilmis kategori ve tag onerileri uret.",
    analyze: "Musteri mesajlarini analiz et, ana sikayetleri ve satin alma firsatlarini Turkce maddesiz ozetle.",
    adcopy: "Instagram ve reklam kullanimina uygun, kisa ve satis odakli 3 farkli metin uret."
  };

  const instructions = actions[action];
  if (!instructions) {
    return "Gecersiz islem.";
  }

  try {
    const text = await createResponse({
      instructions,
      input: typeof input === "string" ? input : JSON.stringify(input)
    });
    return text || "Icerik olusturulamadi.";
  } catch (error) {
    if (action === "tags") {
      return "sik, gunluk, spor, ofis, davet, sezon-odakli";
    }
    if (action === "analyze") {
      return "Musteriler en cok numara uygunlugu, stok teyidi ve hizli teslimat konusunda net cevap bekliyor.";
    }
    if (action === "adcopy") {
      return "Yeni sezon ayakkabilarimizla kombinini tek adimda tamamla. Rahat kalip, guclu stil, hizli siparis.";
    }
    return "Yumusak doku, gun boyu konfor ve stil odakli bir model. Gunluk kullanimdan ozel ana kadar kombinleri guclendirir.";
  }
}

module.exports = {
  createSalesAssistantReply,
  analyzeImageAndMatch,
  runAdminTask
};
