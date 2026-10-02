import express from "express";
import { BOARDS, DEFAULT_BOARD } from "../config/boards.js";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ boards: BOARDS, defaultBoard: DEFAULT_BOARD });
});

export default router;
