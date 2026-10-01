import { useEffect, useRef, useState } from "react";

const API_BASE = "/api";

function Spoiler({ children }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <button
      type="button"
      className={`spoiler ${revealed ? "revealed" : ""}`}
      aria-label={revealed ? undefined : "Reveal spoiler"}
      aria-expanded={revealed}
      onClick={() => setRevealed(!revealed)}
    >
      {revealed ? children : "Spoiler — click to reveal"}
    </button>
  );
}

function findClosingMarker(text, start, marker) {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "\\" && index + 1 < text.length) {
      index += 1;
      continue;
    }
    if (marker === "*" && text.startsWith("**", index)) {
      index += 1;
      continue;
    }
    if (text.startsWith(marker, index)) return index;
  }
  return -1;
}

function renderFormattedText(text, depth = 0, insideSpoiler = false) {
  if (depth >= 10) return text;

  const markers = insideSpoiler ? ["**", "*"] : ["**", "||", "*"];
  const result = [];
  let plainText = "";

  for (let index = 0; index < text.length; ) {
    if (
      text[index] === "\\" &&
      index + 1 < text.length &&
      ["*", "|", "\\"].includes(text[index + 1])
    ) {
      plainText += text[index + 1];
      index += 2;
      continue;
    }

    const marker = markers.find((candidate) => text.startsWith(candidate, index));
    const end = marker
      ? findClosingMarker(text, index + marker.length, marker)
      : -1;

    if (marker && end > index + marker.length) {
      if (plainText) {
        result.push(plainText);
        plainText = "";
      }

      const content = renderFormattedText(
        text.slice(index + marker.length, end),
        depth + 1,
        insideSpoiler || marker === "||"
      );

      if (marker === "**") {
        result.push(<strong key={index}>{content}</strong>);
      } else if (marker === "*") {
        result.push(<em key={index}>{content}</em>);
      } else {
        result.push(<Spoiler key={index}>{content}</Spoiler>);
      }

      index = end + marker.length;
    } else {
      plainText += text[index];
      index += 1;
    }
  }

  if (plainText) result.push(plainText);
  return result;
}

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingPosts, setVotingPosts] = useState({});
  const [voteErrors, setVoteErrors] = useState({});

  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [username, setUsername] = useState(localStorage.getItem("username") || "");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const bodyInput = useRef(null);

  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const fetchPosts = async () => {
    try {
      const res = await fetch(`${API_BASE}/posts`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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
  }, [token]);

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

  const handleVote = async (postId, value) => {
    if (!token || votingPosts[postId]) return;

    setVotingPosts((current) => ({ ...current, [postId]: true }));
    setVoteErrors((current) => ({ ...current, [postId]: "" }));

    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ value }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 401) handleLogout();
        throw new Error(data.error || "Could not save your vote");
      }

      setPosts((current) =>
        current.map((post) => (post._id === postId ? data : post))
      );
    } catch (err) {
      setVoteErrors((current) => ({
        ...current,
        [postId]: err.message || "Could not save your vote",
      }));
    } finally {
      setVotingPosts((current) => ({ ...current, [postId]: false }));
    }
  };

  const formatSelection = (marker) => {
    const textarea = bodyInput.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const selectedText = body.slice(selectionStart, selectionEnd);
    const replacement = `${marker}${selectedText}${marker}`;
    setBody(
      body.slice(0, selectionStart) + replacement + body.slice(selectionEnd)
    );

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(
        selectionStart + marker.length,
        selectionStart + marker.length + selectedText.length
      );
    });
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
          <div className="post-editor">
            <textarea
              ref={bodyInput}
              placeholder="What's on your mind?"
              aria-label="Post body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="format-toolbar" role="toolbar" aria-label="Format post text">
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatSelection("**")} aria-label="Bold selected text" title="Bold">
                <strong>B</strong>
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatSelection("*")} aria-label="Italicize selected text" title="Italic">
                <em>I</em>
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => formatSelection("||")} aria-label="Mark selected text as a spoiler" title="Spoiler">
                Spoiler
              </button>
              <span className="format-hint">Use <code>{"\\*"}</code> for a literal *</span>
            </div>
          </div>
          <button className="post-submit" type="submit">Post</button>
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
            You need an account to post or vote, but anyone can read posts.
          </p>
        </div>
      )}

      <div className="post-list">
        {loading && <p>Loading posts...</p>}
        {!loading && posts.length === 0 && <p>No posts yet. Be the first!</p>}
        {posts.map((post) => (
          <div key={post._id} className="post">
            <h2>{post.title}</h2>
            <p>{renderFormattedText(post.body)}</p>
            <div className="post-footer">
              <div className="vote-controls" role="group" aria-label={`Votes for ${post.title}`}>
                <button
                  type="button"
                  className={post.userVote === 1 ? "active" : ""}
                  aria-label={`Upvote ${post.title}`}
                  aria-pressed={post.userVote === 1}
                  title={token ? "Upvote" : "Log in to vote"}
                  disabled={!token || votingPosts[post._id]}
                  onClick={() => handleVote(post._id, 1)}
                >
                  ▲
                </button>
                <span className="vote-score" aria-label={`Score: ${post.score ?? 0}`}>
                  {post.score ?? 0}
                </span>
                <button
                  type="button"
                  className={post.userVote === -1 ? "active" : ""}
                  aria-label={`Downvote ${post.title}`}
                  aria-pressed={post.userVote === -1}
                  title={token ? "Downvote" : "Log in to vote"}
                  disabled={!token || votingPosts[post._id]}
                  onClick={() => handleVote(post._id, -1)}
                >
                  ▼
                </button>
              </div>
              <span className="meta">
                posted by {post.author} &middot;{" "}
                {new Date(post.createdAt).toLocaleString()}
              </span>
            </div>
            {voteErrors[post._id] && (
              <p className="vote-error" role="alert">{voteErrors[post._id]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
