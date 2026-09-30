import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

function makeToken(user) {
  return jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: "That username is already taken" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });

    res.status(201).json({ token: makeToken(user), username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    res.json({ token: makeToken(user), username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
