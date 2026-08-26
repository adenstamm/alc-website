import { useEffect, useRef, useState } from "react";

import "../styles/sidney-letter.css";

const LETTER_REVEAL_DELAY = 1050;

function SidneyLetter() {
  const [isOpen, setIsOpen] = useState(false);
  const letterRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      letterRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
      letterRef.current?.focus({ preventScroll: true });
    }, prefersReducedMotion ? 0 : LETTER_REVEAL_DELAY);

    return () => window.clearTimeout(timer);
  }, [isOpen]);

  return (
    <main
      className={`sidney-letter-page ${isOpen ? "is-open" : ""}`}
      id="main-content"
      tabIndex="-1"
    >
      <div className="sidney-ambient-glow sidney-ambient-glow-one" aria-hidden="true" />
      <div className="sidney-ambient-glow sidney-ambient-glow-two" aria-hidden="true" />

      <section className="sidney-envelope-intro" aria-label="A birthday letter for Sidney">
        <div className="sidney-intro-copy">
          <p>A birthday delivery</p>
          <span aria-hidden="true">✦</span>
          <p>For one wonderful person</p>
        </div>

        <button
          aria-expanded={isOpen}
          aria-label={isOpen ? "Birthday letter opened" : "Open Sidney's birthday letter"}
          className="sidney-envelope-button"
          disabled={isOpen}
          onClick={() => setIsOpen(true)}
          type="button"
        >
          <span className="sidney-envelope-shadow" aria-hidden="true" />
          <span className="sidney-envelope" aria-hidden="true">
            <span className="sidney-envelope-back" />
            <span className="sidney-letter-teaser">
              <span>To the wonderful Sidney</span>
              <small>with all my love</small>
            </span>
            <span className="sidney-envelope-flap" />
            <span className="sidney-envelope-pocket" />
            <span className="sidney-wax-seal"><span>S</span></span>
          </span>
        </button>

        <div className="sidney-open-prompt" aria-live="polite">
          <span className="sidney-prompt-rule" aria-hidden="true" />
          <p>{isOpen ? "Opening your letter…" : "A little something is waiting for you"}</p>
          <span className="sidney-prompt-rule" aria-hidden="true" />
          {!isOpen && <small>Tap the seal to open</small>}
        </div>
      </section>

      <article
        aria-hidden={!isOpen}
        aria-labelledby="sidney-letter-title"
        className="sidney-letter-sheet"
        ref={letterRef}
        tabIndex={isOpen ? "-1" : undefined}
      >
        <div className="sidney-letter-heading">
          <p>A birthday letter</p>
          <span aria-hidden="true">✦</span>
        </div>

        <h1 id="sidney-letter-title">To the Wonderful Sidney —</h1>

        <div className="sidney-letter-body">
          <p>
            Happy fucking birthday dude!!! I hope you have the best day. I wake up absolutely
            every day so incredibly happy to have you in my life. It&apos;s been so beautiful to see
            you become this amazing person that you are today. I’m so lucky to have a sister who
            cares and loves me as much as you do. I really love you Sidney.
          </p>

          <p>
            My friends will never ever forgive me for how much I talk about you—but I genuinely
            think that no one can fully understand me until they meet you. I&apos;m so sad that you did
            not get to meet my friends last time you were in town but you will have to come down
            soon and meet them. They are all so excited :) My friend Vae loved chatting with you
            over the phone. It feels like I can’t talk about myself for more than 5 minutes without
            having to mention that you were the inspiration.
          </p>

          <p>
            Whether it’s my sense in fashion (remember when you convinced Jordan to take me
            shopping), learning Spanish, writing poetry, painting, listening to Lana or Lorde,
            Pretty Little Liars, all of the good Nickelodeon / Disney Channel shows you put me on
            to, I really would not be myself without you. You have been the blueprint of my life.
          </p>

          <p>
            I know I’m always so insistent about you getting on social media and I 100% understand
            your hesitation—but genuinely I want that so bad because you are genuinely the coolest,
            the most interesting, the most thoughtful, intentional person I have ever met in my
            entire life and I think it&apos;s selfish that I (and your friends and Michael) get to have
            you all to ourselves. You are truly an iconic person—the only person who could have
            brought flare jeans to Highland Park. I do not think I will ever meet another person
            like you.
          </p>

          <p>
            The amount of interesting perspectives, the things I never would have considered,
            advice on how to maneuver situations, so many things you have taught me that I feel so
            appreciative for, that I will never ever be able to repay you for. I am really excited
            to see what this next chapter of your life brings you, I know everything is going to end
            up so prosperous like so many other things in your life.
          </p>

          <p>
            I cannot wait to be so close to you again (I just checked—$60 Google Flights ticket
            away). There will be so many sibling shenanigans to get up to. It was so amazing getting
            to spend time with you in Florida—I think I will remember the conversation we had in
            your bedroom for the rest of my life. Just another example of the Great Perspective of
            Sidney.
          </p>
        </div>

        <div className="sidney-letter-ending" aria-hidden="true">
          <span />
          <strong>♡</strong>
          <span />
        </div>
      </article>
    </main>
  );
}

export default SidneyLetter;
