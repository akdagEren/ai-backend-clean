const { products } = require("../data/products");

const turkishMap = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u"
};

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

function getCorpus(product) {
  return [
    product.name,
    product.description,
    product.color,
    product.style,
    product.category,
    product.usage.join(" "),
    product.season.join(" "),
    product.tags.join(" ")
  ]
    .join(" ")
    .trim();
}

function stockForSize(product, size) {
  const normalizedSize = String(size || "").trim();
  if (!normalizedSize) {
    return 0;
  }
  return Number(product.stockBySize[normalizedSize] || 0);
}

function availabilityNote(product, size) {
  if (!size) {
    return `${product.availableSizes.join(", ")} numaralari mevcut.`;
  }
  return stockForSize(product, size) > 0
    ? `${size} numara mevcut.`
    : `${size} numara su an stokta gorunmuyor.`;
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
    if (product.usage.some((usage) => normalizeText(usage) === term)) {
      score += 4;
    }
    if (product.tags.some((tag) => normalizeText(tag) === term)) {
      score += 2;
    }
  });

  return score;
}

function filterProducts({ style, color, usage, q }) {
  const query = [style, color, usage, q].filter(Boolean).join(" ");
  return products
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
  return products.find((product) => {
    const productName = normalizeText(product.name);
    return productName.includes(normalized)
      || normalized.includes(productName)
      || terms.some((term) => productName.includes(term));
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
    notes.push("Nike kalibi referans alindi; bu koleksiyonda yarim numara daha dengeli olabilir.");
  }
  if (brand.includes("adidas")) {
    notes.push("Adidas referansi genel olarak benzer kalipta gorunuyor.");
  }
  if (width === "genis") {
    recommended += 0.5;
    notes.push("Genis ayakta on kisim baskisini azaltmak icin yarim numara buyutme onerildi.");
  }
  if (width === "dar") {
    notes.push("Dar ayakta kendi numaranizla baslamak daha dogru olur.");
  }
  if (product && product.footProfile === "dar" && width === "genis") {
    recommended += 0.5;
    notes.push(`${product.name} kalibi daha dar oldugu icin ek alan birakildi.`);
  }
  if (product && product.footProfile === "genis" && width === "dar") {
    recommended -= 0.5;
    notes.push(`${product.name} daha rahat kalipli; ayakta bosluk olusmamasi icin yarim numara kucultuldu.`);
  }

  const rounded = Number.isInteger(recommended) ? String(recommended) : recommended.toFixed(1).replace(".0", "");

  return {
    recommended_size: rounded,
    note: notes.join(" ") || "Standart kalip varsayimi ile mevcut numaraniz onerildi."
  };
}

module.exports = {
  products,
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
