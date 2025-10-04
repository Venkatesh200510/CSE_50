// routes/admin.js
const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const router = express.Router();

router.post("/admin/student", async (req, res) => {
  try {
    const { usn, name, email, password, section, sem, phone, join_year } = req.body;

    // Check if student already exists
    const [existing] = await db.query(`SELECT * FROM student WHERE usn = ?`, [usn]);
    if (existing.length > 0) {
      return res.json({
        message: "Student already exists",
        existing: existing[0] // send current data to pre-fill form
      });
    }

    // Insert new student
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO student (usn, name, email, password, section, sem, phone, join_year)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [usn, name, email, hashed, section, sem, phone, join_year]
    );
    res.json({ message: "Student added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding student" });
  }
});

// Add or Update Faculty
router.post("/admin/faculty", async (req, res) => {
  try {
    const { ssn_id, name, email, password, phone, position } = req.body;

    // Check if faculty already exists
    const [existing] = await db.query(`SELECT * FROM faculty WHERE ssn_id = ?`, [ssn_id]);
    if (existing.length > 0) {
      return res.json({
        message: "Faculty already exists",
        existing: existing[0] // send current data to pre-fill form
      });
    }

    // Insert new faculty
    const hashed = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO faculty (ssn_id, name, email, password, phone, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ssn_id, name, email, hashed, phone, position]
    );
    res.json({ message: "Faculty added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error adding faculty" });
  }
});


// Delete Student/Faculty
router.delete("/admin/:type/:id", async (req, res) => {
  try {
    const { type, id } = req.params;
    if (!["student", "faculty"].includes(type)) return res.status(400).json({ error: "Invalid type" });

    const idField = type === "student" ? "usn" : "ssn_id";
    const [result] = await db.query(`DELETE FROM ${type} WHERE ${idField}=?`, [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: `${type} not found` });

    res.json({ message: `${type} deleted successfully` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error deleting record" });
  }
});

// Get student by USN
// Get student by USN (without password)
router.get("/admin/student/:usn", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT usn, name, email, section, sem, phone, join_year FROM student WHERE usn = ?",
      [req.params.usn]
    );
    if (!rows.length) return res.status(404).json({ message: "Student not found" });

    res.json({ ...rows[0], isEdit: true }); // add isEdit flag
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching student" });
  }
});

// Get faculty by SSN (without password)
router.get("/admin/faculty/:ssn", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT ssn_id, name, email, phone, position FROM faculty WHERE ssn_id = ?",
      [req.params.ssn]
    );
    if (!rows.length) return res.status(404).json({ message: "Faculty not found" });

    res.json({ ...rows[0], isEdit: true }); // add isEdit flag
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching faculty" });
  }
});



module.exports = router;