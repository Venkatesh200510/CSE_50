const express = require("express");
const path = require("path");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const bcrypt = require("bcrypt");
const fs = require("fs");
const cors = require("cors");
const db = require("./db");
const bodyParser = require("body-parser");
const { transporter } = require("./mailer"); // adjust path if needed

// Routes
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

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://cse50-production-f95c.up.railway.app/",
    ],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("src"));

// Reuse db config for session store
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  clearExpired: true,
  checkExpirationInterval: 900000, // 15 mins
  expiration: 1000 * 60 * 60 * 24 * 7, // 7 days
});

app.use(
  session({
    key: "connect.sid", // cookie name
    secret: process.env.SESSION_SECRET || "supersecret",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // secure only in production
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Routes
app.use("/api/marks", marksRoutes);
app.use("/contact", contactRoutes);
app.use("/api", passwordRoutes);
app.use("/api/subjects", subjectsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api", authRoutes);

// Cache prevention
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// Session check route
app.get("/api/session", (req, res) => {
  if (!req.session || !req.session.user) return res.json({ loggedIn: false });
  res.json({ loggedIn: true, user: req.session.user });
});

// Auth middleware
function isAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect("/");
}

// Static pages
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "src", "home.html"));
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

// Initial DB population
(async () => {
  try {
    const students = JSON.parse(fs.readFileSync("student.json", "utf8"));
    for (const s of students) {
      const hashed = await bcrypt.hash(s.password, 10);
      await db.query(
        `INSERT IGNORE INTO student (usn, name, email, password, section, sem, phone, join_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.usn, s.name, s.email, hashed, s.section, s.sem, s.phone, s.join_year]
      );
    }

    const faculty = JSON.parse(fs.readFileSync("faculty.json", "utf8"));
    for (const f of faculty) {
      const hashed = await bcrypt.hash(f.password, 10);
      await db.query(
        `INSERT IGNORE INTO faculty (ssn_id, name, email, password, phone, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.ssn_id, f.name, f.email, hashed, f.phone, f.position]
      );
    }

    console.log("🎉 All data inserted successfully!");
  } catch (err) {
    console.error("❌ DB Error:", err);
  }
})();

// Profile API
app.get("/api/profile", isAuth, async (req, res) => {
  try {
    const role = req.session.user.role;
    const id = role === "student" ? req.session.user.usn : req.session.user.ssn_id;
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

// Attendance alert route
app.post("/api/attendance/alert", async (req, res) => {
  const { usn } = req.body;
  if (!usn) return res.status(400).json({ error: "USN required" });

  try {
    const [students] = await db.execute(
      "SELECT name, email FROM student WHERE usn = ?",
      [usn]
    );
    if (!students.length)
      return res.status(404).json({ error: "Student not found" });
    const student = students[0];

    const [alerts] = await db.execute(
      "SELECT last_sent FROM attendance_alerts WHERE usn = ?",
      [usn]
    );
    const now = new Date();
    if (alerts.length) {
      const lastSent = new Date(alerts[0].last_sent);
      const diffDays = (now - lastSent) / (1000 * 60 * 60 * 24);
      if (diffDays < 15) {
        return res.json({ success: true, message: "Alert already sent recently." });
      }
    }

    const [rows] = await db.execute(
      `
      SELECT s.subject_name,
             SUM(a.hours) AS total_hours,
             SUM(CASE WHEN a.status='Present' THEN a.hours ELSE 0 END) AS attended_hours
      FROM attendance a
      JOIN subjects s ON a.subject_code = s.subject_code
      WHERE a.usn = ?
      GROUP BY a.subject_code
      HAVING (attended_hours / total_hours) * 100 < 75
      `,
      [usn]
    );

    if (!rows.length) {
      return res.json({ success: true, message: "No subjects below 75%" });
    }

    let subjectList = rows.map((r) => {
      const percentage = ((r.attended_hours / r.total_hours) * 100).toFixed(0);
      return `${r.subject_name} (${percentage}%)`;
    });

    const emailText = `Hello ${student.name},\n\nYour attendance is below 75% in the following subjects:\n${subjectList.join(
      "\n"
    )}\n\nPlease take necessary action.\n\nRegards,\nCSE Department`;

    const emailHtml = `<p>Hello <strong>${student.name}</strong>,</p>
      <p>Your attendance is below 75% in the following subjects:</p>
      <ul>${rows
        .map(
          (r) =>
            `<li>${r.subject_name} - <strong>${(
              (r.attended_hours / r.total_hours) *
              100
            ).toFixed(0)}%</strong></li>`
        )
        .join("")}</ul>
      <p>Please take necessary action.</p>
      <p>Regards,<br/>CSE Department</p>`;

    await transporter.sendMail({
      to: student.email,
      subject: "⚠️ Attendance Shortage Alert",
      text: emailText,
      html: emailHtml,
    });

    if (alerts.length) {
      await db.execute("UPDATE attendance_alerts SET last_sent = ? WHERE usn = ?", [
        now,
        usn,
      ]);
    } else {
      await db.execute(
        "INSERT INTO attendance_alerts (usn, last_sent) VALUES (?, ?)",
        [usn, now]
      );
    }

    res.json({ success: true, message: "Attendance alert sent" });
  } catch (err) {
    console.error("Error sending attendance alert:", err);
    res.status(500).json({ error: "Failed to send alert" });
  }
});

// Logout
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
