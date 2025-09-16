const mysql = require("mysql2/promise");
require("dotenv").config(); // Load environment variables from .env

// Create a connection pool (better than single connection for scalability)
const db = mysql.createPool({
  host: process.env.DB_HOST,       // e.g. containers-us-west-123.railway.app
  user: process.env.DB_USERNAME,       // your database username
  password: process.env.DB_PASSWORD, // your database password
  database: process.env.DATABASE,   // database name
  port: process.env.DB_PORT || 3306, // default MySQL port
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Export pool for use in other files
module.exports =  db;


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
