const express = require("express");
const db = require("../db");
const nodemailer = require("nodemailer");

const router = express.Router();

// ✅ Setup mail transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dams.project25@gmail.com",
    pass: "totl oecx oktp kqtv", // app password
  },
});

router.post("/", async (req, res) => {
  const { department, usn, semester, subjects } = req.body;

  if (!usn || !semester || !Array.isArray(subjects)) {
    return res.status(400).json({ message: "Invalid request data" });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const sub of subjects) {
      const {
        code = "",
        name = "",
        cie1 = 0,
        cie2 = 0,
        lab = 0,
        assignment = 0,
        external = 0,
        internal = 0,
        total = 0,
        result = "F",
      } = sub;

      // ✅ Insert / Update Marks (marks table has "semester")
      await conn.execute(
        `
        INSERT INTO marks 
          (usn, semester, subject_code, cie1, cie2, lab, assignment, external, internal, total, result)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          cie1 = COALESCE(NULLIF(VALUES(cie1), 0), cie1),
          cie2 = COALESCE(NULLIF(VALUES(cie2), 0), cie2),
          lab = COALESCE(NULLIF(VALUES(lab), 0), lab),
          assignment = COALESCE(NULLIF(VALUES(assignment), 0), assignment),
          external = COALESCE(NULLIF(VALUES(external), 0), external),
          internal = COALESCE(NULLIF(VALUES(internal), 0), internal),
          total = COALESCE(NULLIF(VALUES(total), 0), total),
          result = COALESCE(NULLIF(VALUES(result), ''), result),
          updated_at = CURRENT_TIMESTAMP
      `,
        [
          usn,
          semester, // ✅ matches marks table column
          code,
          cie1,
          cie2,
          lab,
          assignment,
          external,
          internal,
          total,
          result,
        ]
      );
    }

    await conn.commit();

    // ✅ Send Email Notification after saving (student table has "sem")
    const [rows] = await db.execute(
  "SELECT email FROM student WHERE usn = ? AND email LIKE '%@gmail.com'",
  [usn]
);

if (rows.length > 0) {
  const studentEmail = rows[0].email;

  await transporter.sendMail({
    from: `"Dept Marks Update" <dams.project25@gmail.com>`,
    to: studentEmail, // 🎯 only that student
    subject: `📊 Marks Uploaded`,
    text: `Dear Student,\n\nYour marks have been uploaded successfully. 
Please log in to the student portal to view your detailed results.\n\nRegards,\nCSE Department`,
  });
}

    res.json({ message: "Marks saved & email sent successfully" });
  } catch (error) {
    await conn.rollback();
    console.error("🔥 Error saving marks:", error);
    res.status(500).json({ message: "Database error", error });
  } finally {
    conn.release();
  }
});

// ================= GET MARKS =================
router.get("/:usn", async (req, res) => {
  try {
    let usn;

    // Logged-in student
    if (req.session.user && req.session.user.role === "student") {
      usn = req.session.user.usn;
    } else {
      // Guest: ?usn=...
      usn = req.params.usn || req.query.usn;
      if (!usn) {
        return res.status(401).json({ error: "Unauthorized. Please login or provide ?usn" });
      }
    }

    const [rows] = await db.query(
      `SELECT 
        m.subject_code,
        s.subject_name,
        m.semester,
        m.cie1,
        m.cie2,
        m.lab,
        m.assignment,
        m.external,
        s.credit,
        ((m.cie1 / 25) * 15 + m.cie2 + m.lab + m.assignment) AS internal,
        ((m.cie1 / 25) * 15 + m.cie2 + m.lab + m.assignment + m.external) AS total,
        CASE 
            WHEN ((m.cie1 / 25) * 15 + m.cie2 + m.lab + m.assignment) >= 20
                 AND m.external >= 18
                 AND ((m.cie1 / 25) * 15 + m.cie2 + m.lab + m.assignment + m.external) >= 40
            THEN 'P'
            ELSE 'F'
        END AS result
      FROM marks m
      JOIN subjects s ON m.subject_code = s.subject_code
      WHERE m.usn = ?;`,
      [usn]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No marks found for this USN" });
    }

    res.json({ usn, subjects: rows });
  } catch (err) {
    console.error("DB Error:", err.message);
    res.status(500).json({ message: "Database error", error: err.message });
  }
});

module.exports = router;