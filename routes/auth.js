const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");

// Student login
router.post("/student-login", async (req, res) => {
  const { usn, password } = req.body;
  try {
    const [results] = await db.query(
      "SELECT * FROM student WHERE TRIM(usn) = ?",
      [usn.trim()]
    );
    if (!results.length)
      return res.status(404).json({ message: "Student not found" });

    const student = results[0];
    const match = await bcrypt.compare(password, student.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });

    req.session.user = { usn: student.usn.trim(), role: "student", sem: student.sem,
      section: student.section };
    res.redirect("/student-home");
  } catch {
    res.status(500).json({ message: "Database error" });
  }
});

// Faculty Login
router.post("/faculty-login", async (req, res) => {
  const { ssn_id, password } = req.body;
  try {
    const [results] = await db.query(
      "SELECT * FROM faculty WHERE TRIM(ssn_id) = ?",
      [ssn_id.trim()]
    );
    if (!results.length)
      return res.status(404).json({ message: "Faculty not found" });

    const faculty = results[0];
    const match = await bcrypt.compare(password, faculty.password);
    if (!match) return res.status(400).json({ message: "Invalid password" });

    req.session.user = { ssn_id: faculty.ssn_id.trim(), role: "faculty",name: faculty.name};
    res.redirect("/faculty-home");
  } catch {
    res.status(500).json({ message: "Database error" });
  }
});

// Get current logged-in user
router.get("/current-student", (req, res) => {
  if (req.session.user && req.session.user.role === "student") {
    res.json({ usn: req.session.user.usn, sem: req.session.user.sem, section: req.session.user.section });
  } else {
    res.status(401).json({ message: "Not logged in" });
  }
});


// Logout
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

module.exports = router;
