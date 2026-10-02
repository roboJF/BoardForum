# board.

## Stack
- **MongoDB** — database
- **Express** — backend API
- **React** (Vite) — frontend
- **Node.js** — runtime
- **JWT + bcrypt** — accounts and authentication

## Project structure
```
board/
├── backend/
│   ├── models/
│   │   ├── Post.js           # Mongoose schema for posts
│   │   ├── Reply.js          # Mongoose schema for replies
│   │   └── User.js           # Mongoose schema for accounts
│   ├── middleware/auth.js    # Verifies JWT, protects routes
│   ├── routes/
│   │   ├── auth.js           # POST /api/auth/register, /api/auth/login
│   │   └── posts.js          # Posts, votes, and replies API routes
│   ├── server.js             # Express app entry point
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.jsx            # Feed, post detail, replies, and account forms
    │   ├── App.css
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## Setup

### 1. MongoDB
You need a MongoDB instance running. Easiest options:
- Install locally ([MongoDB Community](https://www.mongodb.com/try/download/community)) and run `mongod`
- Or use a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) cluster and grab the connection string

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env
# edit .env: paste your MONGO_URI, and set JWT_SECRET to any long random string
npm run dev
```
Runs on `http://localhost:5000`.

### 3. Frontend
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```
Runs on `http://localhost:5173` and proxies `/api` requests to the backend.

### 4. Open the app
Visit `http://localhost:5173`. The feed shows each post's reply count. Open a post to read its replies; sign in to create a post, reply, or vote.

