import mongoose from "mongoose";
import { BOARD_SLUGS, DEFAULT_BOARD } from "../config/boards.js";

const voteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Number, enum: [-1, 1], required: true },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    body: { type: String, required: true },
    board: { type: String, enum: BOARD_SLUGS, default: DEFAULT_BOARD, required: true },
    author: { type: String, default: "Anonymous" },
    votes: { type: [voteSchema], default: [] },
  },
  { timestamps: true, optimisticConcurrency: true }
);

export default mongoose.model("Post", postSchema);
