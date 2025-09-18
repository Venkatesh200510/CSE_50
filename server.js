const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");
const fs = require("fs");
const multer = require("multer");
const cors = require("cors");
const db = require("./db");
const bodyParser = require("body-parser");
const { Resend } = require("resend"); 

const marksRoutes = require("./routes/marks");
const contactRoutes = require("./routes/contact");
const passwordRoutes = require("./routes/password");
const subjectsRoutes = require("./routes/subjects");
const attendanceRoutes = require("./routes/attendance");
const notesRoutes = require("./routes/notes");
const announcementsRoutes = require("./routes/announcements");
const authRoutes = require("./routes/auth");




const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("src"));

// Reuse your db config from db.js
const sessionStore = new MySQLStore(
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 mins
    expiration: 1000 * 60 * 60 * 24, // 1 day
  }
);

app.use(
  session({
    key: "connect.sid",
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore, // ✅ added MySQL store
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "none",
      maxAge: 86400000, // 1 day
    },
  })
);

app.use("/api/marks", marksRoutes);
app.use("/contact", contactRoutes);
app.use("/api", passwordRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api", authRoutes);


app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.get("/api/session", (req, res) => {
  if (!req.session || !req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

function isAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect("/");
}

app.get("/", (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === "student" ? "/student-home" : "/faculty-home");
  }
  res.sendFile(path.join(__dirname, "src", "login.html"));
});

app.get("/faculty-home", isAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "src", "facultyHome.html"))
);
app.get("/student-home", isAuth, (req, res) =>
  res.sendFile(path.join(__dirname, "src", "studentHome.html"))
);
app.get("/profile", (req, res) =>
  res.sendFile(path.join(__dirname, "src", "profile.html"))
);

app.get("/api/profile", isAuth, async (req, res) => {
  try {
    const role = req.session.user.role;
    const id =
      role === "student" ? req.session.user.usn : req.session.user.ssn_id;
    const table = role === "student" ? "student" : "faculty";
    const idField = role === "student" ? "usn" : "ssn_id";

    const [rows] = await db.query(`SELECT * FROM ${table} WHERE ${idField}=?`, [
      id,
    ]);
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    res.json({ role, ...rows[0] });
  } catch {
    res.status(500).json({ error: "Database error" });
  }
});


app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

 //error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);