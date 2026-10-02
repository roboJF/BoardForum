import mongoose from "mongoose";

const replySchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: "Post", required: true },
    body: { type: String, required: true, trim: true },
    bodyFormat: { type: String, enum: ["plain", "markup"], default: "plain" },
    author: { type: String, required: true },
  },
  { timestamps: true }
);

replySchema.index({ post: 1, createdAt: 1 });

export default mongoose.model("Reply", replySchema);
