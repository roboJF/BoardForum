import { useEffect, useState } from "react";

const API_BASE = "/api";

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_BASE}/posts`);
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError("");

    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Please fill out both fields");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: authUsername, password: authPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Something went wrong");
        return;
      }

      setToken(data.token);
      setUsername(data.username);
      localStorage.setItem("token", data.token);
      localStorage.setItem("username", data.username);
      setAuthUsername("");
      setAuthPassword("");
    } catch (err) {
      setAuthError("Could not reach the server");
    }
  };

  const handleLogout = () => {
    setToken("");
    setUsername("");
    localStorage.removeItem("token");
    localStorage.removeItem("username");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) {
          // token missing/expired — send them back to login
          handleLogout();
        }
        console.error(data.error);
        return;
      }

      setPosts([data, ...posts]);
      setTitle("");
      setBody("");
    } catch (err) {
      console.error("Failed to create post:", err);
    }
  };

  return (
    <div className="container">
      <div className="header-row">
        <h1>board.</h1>
        {token && (
          <div className="account-info">
            <span>
              signed in as <strong>{username}</strong>
            </span>
            <button className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>

      {token ? (
        <form onSubmit={handleSubmit} className="post-form">
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            placeholder="What's on your mind?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button type="submit">Post</button>
        </form>
      ) : (
        <div className="auth-box">
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === "login" ? "active" : ""}
              onClick={() => {
                setAuthMode("login");
                setAuthError("");
              }}
            >
              Log in
            </button>
            <button
              type="button"
              className={authMode === "register" ? "active" : ""}
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
            >
              Sign up
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <input
              type="text"
              placeholder="Username"
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
            />
            {authError && <p className="auth-error">{authError}</p>}
            <button type="submit">
              {authMode === "login" ? "Log in" : "Create account"}
            </button>
          </form>

          <p className="auth-hint">
            You need an account to post, but anyone can read posts.
          </p>
        </div>
      )}

      <div className="post-list">
        {loading && <p>Loading posts...</p>}
        {!loading && posts.length === 0 && <p>No posts yet. Be the first!</p>}
        {posts.map((post) => (
          <div key={post._id} className="post">
            <h2>{post.title}</h2>
            <p>{post.body}</p>
            <span className="meta">
              posted by {post.author} &middot;{" "}
              {new Date(post.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
