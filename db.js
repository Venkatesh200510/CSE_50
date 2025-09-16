const mysql = require("mysql2/promise");
require("dotenv").config(); // Load environment variables from .env

// Create a connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,     
  user: process.env.DB_USER,     
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_NAME,   
  port: process.env.DB_PORT || 3306, 
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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
