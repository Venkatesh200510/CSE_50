const mysql = require("mysql2/promise");

// ✅ MySQL pool
const db = mysql.createPool({
  host: "localhost",
  user: "root",           // change if needed
  password: "9035882709",           // change if needed
  database: "department",       // 🔹 replace with your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ Test connection
(async () => {
  try {
    const conn = await db.getConnection();
    console.log("✅ Connected to MySQL database");
    conn.release();
  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
})();

module.exports = db;
