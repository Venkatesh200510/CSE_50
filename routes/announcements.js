const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const { isAuth } = require("../middleware/auth");

// Multer memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Max recipients per batch (SendGrid limit ~1000, safer to use 100)
const BATCH_SIZE = 100;

// ================== 1️⃣ Create Announcement ==================
router.post("/", isAuth, upload.single("file"), async (req, res) => {
  try {
    const { title, message } = req.body;

    // faculty_id is a CHAR (can store name/username/id string)
    const faculty_id = req.user?.name || "Faculty";

    const file_type = req.file?.mimetype || null;
    const file_data = req.file?.buffer || null;

    // Save announcement in DB
    await db.execute(
      `INSERT INTO announcements (title, message, faculty_id, file_type, file_data, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [title, message, faculty_id, file_type, file_data]
    );

    // Fetch student emails
    const [students] = await db.execute(
      "SELECT email FROM student WHERE email LIKE '%@gmail.com'"
    );

    if (students.length > 0) {
      // Filter valid emails
      const allEmails = students
        .map((s) => s.email)
        .filter((email) => email && email.includes("@"));

      if (allEmails.length === 0) {
        console.log("No valid recipients, skipping email.");
      } else {
        // Send emails in batches
        for (let i = 0; i < allEmails.length; i += BATCH_SIZE) {
          const batch = allEmails.slice(i, i + BATCH_SIZE);

          const msg = {
            from: {
              name: "Dept Announcements",
              email: "dams.project25@gmail.com", // ✅ Must be verified in SendGrid
            },
            bcc: batch,
            subject: `📢 New Announcement: ${title}`,
            text: `${message}\n\n- ${faculty_id}`, // ✅ use faculty_id as string
            attachments: file_data
              ? [
                  {
                    filename: `${title}${
                      file_type === "application/pdf" ? ".pdf" : ""
                    }`,
                    content: file_data.toString("base64"),
                    type: file_type || "application/octet-stream",
                    disposition: "attachment",
                  },
                ]
              : [],
          };

          try {
            await sgMail.send(msg);
          } catch (err) {
            console.error("SendGrid Error:", err.response?.body || err);
          }
        }
      }
    }

    res.json({ message: "Announcement created & emails sent successfully!" });
  } catch (err) {
    console.error("🔥 Error saving announcement:", err);
    res.status(500).json({ error: err.message || "Database or email error" });
  }
});

// ================== 2️⃣ Fetch Announcements ==================
router.get("/", isAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, title, message, faculty_id, file_type, created_at
       FROM announcements ORDER BY created_at DESC`
    );

    const announcements = rows.map((r) => ({
      ...r,
      file_url: r.file_type ? `/api/announcements/${r.id}/file` : null,
    }));

    res.json(announcements);
  } catch (err) {
    console.error("🔥 Error fetching announcements:", err);
    res.status(500).json({ error: err.message || "Database error" });
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

    res.setHeader("Content-Type", rows[0].file_type || "application/octet-stream");
    res.send(rows[0].file_data);
  } catch (err) {
    console.error("🔥 Error serving file:", err);
    res.status(500).json({ error: err.message || "Error loading file" });
  }
});

module.exports = router;
