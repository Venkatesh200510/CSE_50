const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db"); // adjust path if needed
const {transporter} = require("../mailer"); // configure separately
const { isAuth } = require("../middleware/auth"); // your auth middleware

// In-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// ================== 1️⃣ Create Announcement ==================
router.post("/", isAuth, upload.single("file"), async (req, res) => {
  try {
    const { title, message } = req.body;
    const faculty_name = req.user?.name || "Faculty"; // 👈 use logged-in faculty if available
    const file_type = req.file ? req.file.mimetype : null;
    const file_data = req.file ? req.file.buffer : null;

    // Save in DB
    await db.execute(
      `INSERT INTO announcements (title, message, faculty_name, file_type, file_data, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [title, message, faculty_name, file_type, file_data]
    );

    // Fetch student emails
    const [students] = await db.execute(
      "SELECT email FROM student WHERE email LIKE '%@gmail.com'"
    );

   if (students.length > 0) {
  const allEmails = students.map(s => s.email);

  const msg = {
    from: {
      name: "Dept Announcements",
      email: "dams.project25@gmail.com", // ✅ must be verified in SendGrid
    },
    bcc: allEmails, // 👈 SendGrid supports this directly
    subject: `📢 New Announcement: ${title}`,
    text: `${message}\n\n- ${faculty_name}`,
    attachments: file_data
      ? [
          {
            filename: `${title}${file_type === "application/pdf" ? ".pdf" : ""}`,
            content: file_data.toString("base64"), // ✅ base64 encode for SendGrid
            type: file_type,
            disposition: "attachment"
          }
        ]
      : [],
  };

  await sgMail.send(msg);
}


    res.json({ message: "Announcement created & email sent successfully!" });
  } catch (err) {
    console.error("🔥 Error saving announcement:", err);
    res.status(500).json({ error: "Database or email error" });
  }
});

// ================== 2️⃣ Fetch Announcements List ==================
router.get("/", isAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, title, message, faculty_name, file_type, created_at
       FROM announcements ORDER BY created_at DESC`
    );

    const announcements = rows.map(r => ({
      ...r,
      file_url: r.file_type ? `/api/announcements/${r.id}/file` : null
    }));

    res.json(announcements);
  } catch (err) {
    console.error("🔥 Error fetching announcements:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ================== 3️⃣ Serve File ==================
router.get("/:id/file", isAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      "SELECT file_type, file_data FROM announcements WHERE id=?",
      [id]
    );
    if (!rows.length) return res.status(404).send("File not found");

    res.setHeader("Content-Type", rows[0].file_type);
    res.send(rows[0].file_data);
  } catch (err) {
    console.error("🔥 Error serving file:", err);
    res.status(500).json({ error: "Error loading file" });
  }
});

module.exports = router;
