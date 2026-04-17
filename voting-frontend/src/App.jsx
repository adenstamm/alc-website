function App() {
  const recentAlbums = [
    {
      id: 1,
      title: "Blonde",
      artist: "Frank Ocean",
      week: "Last week",
    },
    {
      id: 2,
      title: "Currents",
      artist: "Tame Impala",
      week: "2 weeks ago",
    },
    {
      id: 3,
      title: "Discovery",
      artist: "Daft Punk",
      week: "3 weeks ago",
    },
  ];

  const currentVotingPhase = "nominations";
  // TBI: this should come from me

  function getVotingText() {
    if (currentVotingPhase === "nominations") {
      return {
        title: "Vote in this week's poll",
        description:
          "Share what you thought about this week's album and nominate an album for next week.",
        button: "Go to Voting",
      };
    }

    if (currentVotingPhase === "primary") {
      return {
        title: "Vote in this week's poll",
        description:
          "Primary voting is live. Help decide which albums move on.",
        button: "Go to Voting",
      };
    }

    if (currentVotingPhase === "final") {
      return {
        title: "Vote in this week's poll",
        description:
          "Final voting is live. Choose next week's album.",
        button: "Go to Voting",
      };
    }
  }

  const votingInfo = getVotingText();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f6f3ee",
        color: "#111",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "40px 24px",
        }}
      >
        <h1 style={{ fontSize: "40px", marginBottom: "8px" }}>
          Album Listening Club
        </h1>
        <p style={{ fontSize: "18px", marginBottom: "32px", color: "#444" }}>
          Welcome to the club. Listen, reflect, nominate, and vote on what we hear next.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "24px",
            alignItems: "start",
          }}
        >
          <main>
            <section
              style={{
                background: "white",
                padding: "24px",
                borderRadius: "16px",
                marginBottom: "24px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Welcome</h2>
              <p style={{ lineHeight: "1.6", color: "#444" }}>
                Album Listening Club is a shared space to discover music together.
                Each week, members listen to an album, share their thoughts, and help choose what comes next.
              </p>
            </section>

            <section
              style={{
                background: "white",
                padding: "24px",
                borderRadius: "16px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Recently Featured Albums</h2>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {recentAlbums.map((album) => (
                  <div
                    key={album.id}
                    style={{
                      padding: "16px",
                      border: "1px solid #e5e5e5",
                      borderRadius: "12px",
                    }}
                  >
                    <h3 style={{ margin: "0 0 6px 0" }}>{album.title}</h3>
                    <p style={{ margin: "0 0 4px 0", color: "#444" }}>
                      {album.artist}
                    </p>
                    <p style={{ margin: 0, fontSize: "14px", color: "#777" }}>
                      {album.week}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside>
            <div
              style={{
                background: "#111",
                color: "white",
                padding: "24px",
                borderRadius: "16px",
                position: "sticky",
                top: "24px",
              }}
            >
              <h2 style={{ marginTop: 0 }}>{votingInfo.title}</h2>
              <p style={{ lineHeight: "1.6", color: "#ddd" }}>
                {votingInfo.description}
              </p>

              <button
                style={{
                  marginTop: "16px",
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#fff",
                  color: "#111",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {votingInfo.button}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;