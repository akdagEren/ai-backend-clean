const { products: staticProducts } = require("../data/products");
const { fetchProducts } = require("./db-client");

const turkishMap = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u"
};

let cachedProducts = staticProducts.slice();

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (char) => turkishMap[char] || char)
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function parseSizeStock(raw) {
  if (!raw) return [];
  return String(raw)
    .split(",")
    .map((section) => section.split(":"))
    .filter((parts) => parts.length === 2)
    .map(([size, stock]) => ({
      size: size.trim(),
      stock: Number(stock.trim()) || 0
    }));
}

function getCorpus(product) {
  return [
    product.name,
    product.description,
    product.color,
    product.style,
    product.category,
    (product.usage || []).join(" "),
    (product.season || []).join(" "),
    (product.tags || []).join(" ")
  ]
    .join(" ")
    .trim();
}

function stockForSize(product, size) {
  const normalizedSize = String(size || "").trim();
  if (!normalizedSize) {
    return 0;
  }
  return Number((product.stockBySize || {})[normalizedSize] || 0);
}

function availabilityNote(product, size) {
  const sizes = Array.isArray(product.availableSizes) ? product.availableSizes : [];
  if (!size) {
    return sizes.length ? `${sizes.join(", ")} numaraları mevcut.` : "Numara bilgisi mevcut değil.";
  }
  return stockForSize(product, size) > 0
    ? `${size} numara stokta.`
    : `${size} numara şu an stokta görünmüyor.`;
}

function scoreProduct(product, query) {
  const terms = tokenize(query);
  const corpus = normalizeText(getCorpus(product));
  let score = 0;

  terms.forEach((term) => {
    if (corpus.includes(term)) {
      score += 3;
    }
    if (normalizeText(product.style) === term) {
      score += 5;
    }
    if (normalizeText(product.color) === term) {
      score += 5;
    }
    if ((product.usage || []).some((usage) => normalizeText(usage) === term)) {
      score += 4;
    }
    if ((product.tags || []).some((tag) => normalizeText(tag) === term)) {
      score += 2;
    }
  });

  return score;
}

function getProducts() {
  return cachedProducts;
}

async function hydrateProducts() {
  try {
    const rows = await fetchProducts();
    if (!rows.length) {
      return getProducts();
    }
    cachedProducts = rows.map(transformRow);
  } catch (error) {
    console.error("Ürün veritabanı yüklenemedi:", error);
  }
  return getProducts();
}

function transformRow(row) {
  const categories = String(row.categories || "")
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("tr-TR"))
    .filter(Boolean);

  const sizeStocks = parseSizeStock(row.size_stocks);
  const availableSizes = sizeStocks.map((entry) => entry.size);
  const stockBySize = sizeStocks.reduce((acc, entry) => {
    acc[entry.size] = entry.stock;
    return acc;
  }, {});

  const style = categories.find((cat) => /sik|klasik|bot|spor/.test(cat)) || "gunluk";

  const usage = categories.includes("sik") ? ["sik"] : ["gunluk"];

  return {
    id: String(row.id),
    name: row.name || "Pamuk's Shoes Ürünü",
    price: Number(row.price || 0),
    color: row.color || "karışık",
    style: style,
    usage,
    season: ["tum-mevsim"],
    category: categories[0] || "ayakkabi",
    footProfile: "standart",
    description: row.description || "",
    tags: categories,
    availableSizes,
    stockBySize,
    link: "urun-detay.php?id=" + row.id,
    image: row.main_image || ""
  };
}

function filterProducts({ style, color, usage, q }) {
  const query = [style, color, usage, q].filter(Boolean).join(" ");
  return getProducts()
    .map((product) => ({
      ...product,
      score: scoreProduct(product, query)
    }))
    .filter((product) => product.score > 0 || !query)
    .sort((a, b) => b.score - a.score || a.price - b.price);
}

function recommendProducts({ style, color, usage }) {
  return filterProducts({ style, color, usage }).slice(0, 3);
}

function searchProducts(q) {
  return filterProducts({ q }).slice(0, 6);
}

function findProductByName(name) {
  const normalized = normalizeText(name);
  const terms = tokenize(name);
  const list = getProducts();
  return list.find((product) => {
    const productName = normalizeText(product.name);
    return (
      productName.includes(normalized) ||
      normalized.includes(productName) ||
      terms.some((term) => productName.includes(term))
    );
  });
}

function findByVisionDescription(description) {
  return searchProducts(description).slice(0, 4);
}

function getSizeAdvice({ footSize, footWidth, previousBrand, productName }) {
  const sizeNumber = Number(footSize);
  const width = normalizeText(footWidth || "");
  const brand = normalizeText(previousBrand || "");
  const product = productName ? findProductByName(productName) : null;

  let recommended = Number.isFinite(sizeNumber) ? sizeNumber : 38;
  const notes = [];

  if (brand.includes("nike")) {
    recommended -= 0.5;
    notes.push("Nike kalıbı referans alındı; bu koleksiyonda yarım numara daha dengeli olabilir.");
  }
  if (brand.includes("adidas")) {
    notes.push("Adidas referansı genel olarak benzer kalıpta görünüyor.");
  }
  if (width === "genis") {
    recommended += 0.5;
    notes.push("Geniş ayakta ön kısmı rahatlatmak için yarım numara büyütme önerildi.");
  }
  if (width === "dar") {
    notes.push("Dar ayakta kendi numaranızla başlamak daha doğru olur.");
  }
  if (product && product.footProfile === "dar" && width === "genis") {
    recommended += 0.5;
    notes.push(`${product.name} kalıbı daha dar olduğu için ek alan bırakıldı.`);
  }
  if (product && product.footProfile === "genis" && width === "dar") {
    recommended -= 0.5;
    notes.push(`${product.name} daha rahat kalıplı; ayakta boşluk olmaması için yarım numara küçültüldü.`);
  }

  const rounded = Number.isInteger(recommended) ? String(recommended) : recommended.toFixed(1).replace(".0", "");

  return {
    recommended_size: rounded,
    note: notes.join(" ") || "Standart kalıp varsayımı ile mevcut numaranız önerildi."
  };
}

module.exports = {
  hydrateProducts,
  getProducts,
  normalizeText,
  tokenize,
  recommendProducts,
  searchProducts,
  getSizeAdvice,
  findProductByName,
  availabilityNote,
  stockForSize,
  findByVisionDescription
};
