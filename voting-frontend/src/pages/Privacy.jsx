function Privacy() {
  return (
    <div className="sideb-page sideb-subpage sideb-privacy-page">
      <main className="privacy-main" id="main-content" tabIndex="-1">
        <header className="privacy-header">
          <p className="sideb-kicker">Privacy</p>
          <h1>What the club account stores.</h1>
          <p>
            Album Listening Club uses a small amount of account information to manage
            membership and keep voting fair.
          </p>
        </header>

        <div className="privacy-sections">
          <section aria-labelledby="privacy-information">
            <h2 id="privacy-information">Information we use</h2>
            <p>
              When you create an account, our authentication provider stores your email,
              sign-in method, and account identifier. The club also stores your display
              name, membership status, role, nominations, and ballots.
            </p>
          </section>

          <section aria-labelledby="privacy-purpose">
            <h2 id="privacy-purpose">Why we use it</h2>
            <p>
              This information verifies club membership, limits voting to approved
              members, prevents duplicate ballots, and lets administrators manage club
              access.
            </p>
          </section>

          <section aria-labelledby="privacy-sharing">
            <h2 id="privacy-sharing">Who can see it</h2>
            <p>
              Approved club administrators can view membership records needed to manage
              access. Public pages do not display member email addresses or individual
              ballots.
            </p>
          </section>

          <section aria-labelledby="privacy-control">
            <h2 id="privacy-control">Your choices</h2>
            <p>
              You can sign out at any time. To ask about your membership record or request
              account deletion, contact the club through its official Instagram or Sun
              Devil Central page.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Privacy;
