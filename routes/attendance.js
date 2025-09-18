const express = require("express");
const db = require("../db"); // adjust path if db.js is elsewhere
const router = express.Router();


// ================= SUBJECTS FOR FACULTY DROPDOWN =================
router.get("/semester-subjects", async (req, res) => {
  try {
    const { semester } = req.query;
    if (!semester) {
      return res.status(400).json({ error: "Semester is required" });
    }

    const [rows] = await db.execute(
      "SELECT subject_code, subject_name FROM subjects WHERE semester = ?",
      [semester]
    );

    res.json(rows);
  } catch (err) {
    console.error("🔥 Error fetching subjects:", err);
    res.status(500).json({ error: "Database error" });
  }
});

function isLoggedIn(req, res, next) {
    if (req.session.user) return next();
    res.status(401).json({ error: "Not logged in" });
}

router.get("/me", async (req, res) => {
  try {
    let usn;

    if (req.session.user && req.session.user.role === "student") {
      // ✅ Logged-in student
      usn = req.session.user.usn;
    } else {
      // ✅ Guest mode: allow manual ?usn=
      usn = req.query.usn;
      if (!usn) {
        return res.status(401).json({
          error: "Unauthorized. Please login as student or provide ?usn",
        });
      }
    }

    // Student Info
    const [student] = await db.execute(
      `SELECT usn, name, sem AS semester FROM student WHERE usn = ?`,
      [usn]
    );
    if (!student.length)
      return res.status(404).json({ error: "Student not found" });

    const studentInfo = student[0];

    // Attendance summary per subject
    const [rows] = await db.execute(
      `
      SELECT 
        s.subject_name,
        s.semester,
        a.subject_code,
        SUM(a.hours) AS total_classes,
        SUM(CASE WHEN a.status = 'Present' THEN a.hours ELSE 0 END) AS attended_classes
      FROM attendance a
      JOIN subjects s ON a.subject_code = s.subject_code
      WHERE a.usn = ?
      GROUP BY a.subject_code
      `,
      [usn]
    );

    res.json({
      role: req.session.user ? req.session.user.role : "guest",
      usn: studentInfo.usn,
      name: studentInfo.name,
      semester: studentInfo.semester,
      data: rows,
    });
  } catch (error) {
    console.error("🔥 Error in /attendance/me:", error);
    res.status(500).json({ error: error.message });
  }
});


// ================= SUBJECTS FOR DROPDOWN =================
// ================= SUBJECTS FOR DROPDOWN =================
router.get("/subjects", async (req, res) => {
  try {
    let usn;

    if (req.session.user && req.session.user.role === "student") {
      // Logged-in student
      usn = req.session.user.usn;
    } else {
      // Guest mode
      usn = req.query.usn;
      if (!usn) {
        return res.status(401).json({ error: "Unauthorized. Please login or provide ?usn" });
      }
    }

    const [subjects] = await db.execute(
      `SELECT DISTINCT a.subject_code, s.subject_name 
       FROM attendance a
       JOIN subjects s ON a.subject_code = s.subject_code
       WHERE a.usn = ?`,
      [usn]
    );

    res.json(subjects);
  } catch (error) {
    console.error("🔥 Error in /api/attendance/subjects:", error);
    res.status(500).json({ error: "Error fetching subjects" });
  }
});


// ================= SUBJECT-WISE MONTHLY ATTENDANCE =================
router.get("/monthly", async (req, res) => {
  try {
    let usn;

    if (req.session.user && req.session.user.role === "student") {
      usn = req.session.user.usn;
    } else {
      usn = req.query.usn;
      if (!usn) {
        return res.status(401).json({ error: "Unauthorized. Please login or provide ?usn" });
      }
    }

    const subjectCode = req.query.subject;
    if (!subjectCode) {
      return res.status(400).json({ error: "Subject code is required" });
    }

    const [rows] = await db.execute(
      `
      SELECT 
        DATE_FORMAT(date, '%Y-%m') AS month,
        SUM(hours) AS total_classes,
        SUM(CASE WHEN status = 'Present' THEN hours ELSE 0 END) AS attended_classes
      FROM attendance
      WHERE usn = ? AND subject_code = ?
      GROUP BY DATE_FORMAT(date, '%Y-%m')
      ORDER BY month;
      `,
      [usn, subjectCode]
    );

    // ✅ Cumulative percentages
    let cumulativeTotal = 0;
    let cumulativeAttended = 0;
    const result = rows.map(r => {
      cumulativeTotal += parseInt(r.total_classes, 10);
      cumulativeAttended += parseInt(r.attended_classes, 10);

      return {
        month: r.month,
        percentage: cumulativeTotal
          ? Math.round((cumulativeAttended / cumulativeTotal) * 100)
          : 0
      };
    });

    res.json(result);
  } catch (error) {
    console.error("🔥 Error in /api/attendance/monthly:", error);
    res.status(500).json({ error: "Error fetching attendance" });
  }
});


router.post("/", async (req, res) => {
  try {
    const { subjectCode, semester, section, absentees, date, hours } = req.body;

    if (!subjectCode || !semester || !section || !date || !hours) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // 🔹 First, fetch all students in that semester & section
    const [students] = await db.execute(
      "SELECT usn FROM student WHERE sem = ? AND section = ?",
      [semester, section]
    );

    if (students.length === 0) {
      return res.status(404).json({ error: "No students found for this class" });
    }

    // 🔹 Insert attendance for each student
    for (let student of students) {
      const status = absentees.includes(student.usn) ? "Absent" : "Present";

      await db.execute(
        `INSERT INTO attendance (usn, subject_code, date, hours, status)
         VALUES (?, ?, ?, ?, ?)`,
        [student.usn, subjectCode, date, hours, status]
      );
    }

    res.json({ message: "Attendance updated successfully!" });
  } catch (err) {
    console.error("🔥 Error submitting attendance:", err);
    res.status(500).json({ error: "Database error" });
  }
});

router.post("/alert", async (req, res) => {
  try {
    const { usn } = req.body;
    if (!usn) return res.status(400).json({ error: "USN required" });

    // 1️⃣ Get student info + last alert timestamp
    const [studentRows] = await db.execute(
      "SELECT name, email, last_alert_sent FROM student WHERE usn = ?",
      [usn]
    );
    if (!studentRows.length)
      return res.status(404).json({ error: "Student not found" });

    const student = studentRows[0];

    // 2️⃣ Check 15-day cooldown
    const now = new Date();
    if (student.last_alert_sent) {
      const lastSent = new Date(student.last_alert_sent);
      const diffDays = Math.floor((now - lastSent) / (1000 * 60 * 60 * 24));
      if (diffDays < 15) {
        return res.json({ message: `Alert already sent ${diffDays} days ago` });
      }
    }

    // 3️⃣ Get attendance summary
    const [attendanceRows] = await db.execute(
      `
      SELECT s.subject_name, 
             SUM(a.hours) AS total_classes,
             SUM(CASE WHEN a.status='Present' THEN a.hours ELSE 0 END) AS attended_classes
      FROM attendance a
      JOIN subjects s ON a.subject_code = s.subject_code
      WHERE a.usn = ?
      GROUP BY a.subject_code
      `,
      [usn]
    );

    if (!attendanceRows.length)
      return res.status(404).json({ error: "No attendance records found" });

    // 4️⃣ Check shortage (<85%)
    const shortageSubjects = attendanceRows
      .map(r => {
        const percentage = r.total_classes
          ? Math.round((r.attended_classes / r.total_classes) * 100)
          : 0;
        return percentage < 85 ? `${r.subject_name} (${percentage}%)` : null;
      })
      .filter(Boolean);

    if (!shortageSubjects.length) {
      return res.json({ message: "No attendance shortage" });
    }

    // 5️⃣ Send email using SendGrid
    const msg = {
      to: student.email,
      from: "dams.project25@gmail.com", // Verified SendGrid sender
      subject: "⚠️ Attendance Shortage Alert",
      text: `Dear ${student.name},\n\nYour attendance is below 85% in the following subjects:\n\n${shortageSubjects.join(
        "\n"
      )}\n\nPlease take necessary action.\n\nRegards,\nCSE Department`,
    };

    await sgMail.send(msg);

    // 6️⃣ Update last_alert_sent
    await db.execute(
      "UPDATE student SET last_alert_sent=? WHERE usn=?",
      [now, usn]
    );

    res.json({
      message: "Alert email sent successfully via SendGrid",
      shortageSubjects,
    });

  } catch (err) {
    console.error("🔥 Attendance alert error:", err);
    res.status(500).json({ error: "Failed to send alert via SendGrid" });
  }
});
  

module.exports = router;
