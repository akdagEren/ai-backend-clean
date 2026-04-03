const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "pamukssh_Spaybs_b2emd",
  password: process.env.DB_PASSWORD || "kH6QE!yvozU*1B7H",
  database: process.env.DB_NAME || "pamukssh_pamuksshoes",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4"
});

async function fetchProducts() {
  const [rows] = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.price,
      p.color,
      p.description,
      p.main_image,
      GROUP_CONCAT(DISTINCT pc.category ORDER BY pc.category SEPARATOR ',') AS categories,
      COALESCE(ps.sizes, '') AS sizes,
      COALESCE(ps.size_stocks, '') AS size_stocks
    FROM products p
    LEFT JOIN product_categories pc ON pc.product_id = p.id
    LEFT JOIN (
      SELECT product_id, 
        GROUP_CONCAT(size ORDER BY size+0 SEPARATOR ',') AS sizes,
        GROUP_CONCAT(CONCAT(size,':',stock) ORDER BY size+0 SEPARATOR ',') AS size_stocks
      FROM product_sizes
      GROUP BY product_id
    ) ps ON ps.product_id = p.id
    GROUP BY p.id
    ORDER BY p.id DESC
    LIMIT 200
  `);
  return rows;
}

module.exports = { fetchProducts };
